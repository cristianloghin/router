import { buildPath, matchPath, pathnameOf } from "./matcher";
import { HistoryStack } from "./history";
import { normalizeBasePath, toInternal, toExternal } from "./basePath";
import type {
  NavigateOptions,
  NavigationEvent,
  NavigationType,
  RoutePath,
  NavigateArgs,
} from "./types";

// ─── State ────────────────────────────────────────────────────────────────────

export interface RouterState {
  path: string;
  searchParams: URLSearchParams;
  isTransitioning: boolean;
  canGoBack: boolean;
  meta: Record<string, unknown>;
  /** True while the address bar shows a workspace URL. */
  inWorkspace: boolean;
}

// ─── RouterStore ──────────────────────────────────────────────────────────────

/**
 * useSyncExternalStore-compatible store for router state.
 *
 * Owns:
 *  - current path (never a workspace URL)
 *  - search params
 *  - isTransitioning flag
 *  - canGoBack (driven by HistoryStack)
 *  - meta (app-wide typed state)
 *
 * Listens to popstate to react to browser back/forward.
 */
export class RouterStore {
  private state: RouterState;
  private readonly historyStack: HistoryStack;
  private readonly workspaceBasePath: string;
  /** Normalised app-level base path; "" when the app is served from root. */
  private readonly basePath: string;
  private listeners: Set<() => void> = new Set();

  // Navigation lifecycle hooks — wired by AppProvider
  onBeforeNavigate?: (
    event: NavigationEvent & { cancel: () => void },
  ) => void;
  onNavigate?: (event: NavigationEvent) => void;
  onPrompt?: (message: string) => boolean;
  /**
   * Route guard evaluator, wired by AppProvider from route definitions.
   * Returns true to allow, false to block, a string to redirect.
   */
  routeGuard?: (path: string) => boolean | string | Promise<boolean | string>;

  private previousPath: string | null = null;
  private attached = false;

  constructor(
    initialMeta: Record<string, unknown> = {},
    workspaceBasePath = "/workspace",
    basePath = "",
  ) {
    this.workspaceBasePath = workspaceBasePath;
    this.basePath = normalizeBasePath(basePath);
    this.historyStack = new HistoryStack();

    const loc = window.location;
    // Strip the app base before testing for the workspace prefix — the two
    // compose in exactly one order, and isWorkspacePath takes internal paths.
    const internalPath = this.toInternal(loc.pathname);
    const inWorkspace = this.isWorkspacePath(internalPath);

    this.state = {
      path: inWorkspace ? "/" : internalPath,
      searchParams: new URLSearchParams(loc.search),
      isTransitioning: false,
      canGoBack: false,
      meta: initialMeta,
      inWorkspace,
    };

    this.handlePopState = this.handlePopState.bind(this);
    this.attach();
  }

  /**
   * (Re-)register the popstate listener. Idempotent. AppProvider calls this
   * from its mount effect so the store survives StrictMode's simulated
   * unmount (which runs the cleanup — destroy() — on a store instance that
   * is then reused, since it lives in a ref).
   */
  attach(): void {
    if (this.attached) return;
    window.addEventListener("popstate", this.handlePopState);
    this.attached = true;
  }

  destroy(): void {
    window.removeEventListener("popstate", this.handlePopState);
    this.attached = false;
    this.listeners.clear();
  }

  // ─── useSyncExternalStore interface ──────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): RouterState {
    return this.state;
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  navigate(
    to: string,
    options: NavigateOptions = {},
    type: NavigationType = "push",
  ): void {
    const { replace = false, state, params } = options;
    // `resolvedPath` is the full target — it may carry a query string, and it
    // is what reaches the address bar. `routePath` is its pathname half, which
    // is what the router *matches* on: guards, the workspace test, navigation
    // events and `state.path` all take the query-free form.
    const resolvedPath = params ? buildPath(to, params) : to;
    const routePath = pathnameOf(resolvedPath);
    const isWorkspace = this.isWorkspacePath(routePath);
    // Spec §3: for workspace navigations, NavigationEvent.to is the origin
    // route (the router's retained path), never the workspace URL.
    const eventTo = isWorkspace ? this.state.path : routePath;
    const eventType: NavigationType = type === "push" && replace ? "replace" : type;

    // Prompt guard
    if (this.onPrompt) {
      // onPrompt returns true if navigation is allowed
      if (!this.onPrompt("")) return;
    }

    // Before-navigate lifecycle
    if (this.onBeforeNavigate) {
      let cancelled = false;
      this.onBeforeNavigate({
        from: this.previousPath,
        to: eventTo,
        type: eventType,
        cancel: () => { cancelled = true; },
      });
      if (cancelled) return;
    }

    // Workspace URLs: update window.location but keep the router's path state unchanged.
    if (isWorkspace) {
      if (replace) {
        window.history.replaceState(state ?? null, "", this.toExternal(resolvedPath));
      } else {
        window.history.pushState(state ?? null, "", this.toExternal(resolvedPath));
      }
      // Don't update router path state — workspace URL is transparent to the
      // router. Only the inWorkspace flag flips.
      this.setState({ inWorkspace: true });
      this.onNavigate?.({ from: this.previousPath, to: eventTo, type: eventType });
      return;
    }

    // Route guard (spec §2.1): false blocks, string redirects, rejected
    // promise blocks. Sync verdicts keep navigation synchronous.
    if (this.routeGuard) {
      let verdict: boolean | string | Promise<boolean | string>;
      try {
        verdict = this.routeGuard(routePath);
      } catch {
        return;
      }
      if (verdict === false) return;
      if (typeof verdict === "string") {
        this.navigate(verdict, { replace }, type);
        return;
      }
      if (verdict instanceof Promise) {
        void verdict.then(
          (v) => {
            if (v === false) return;
            if (typeof v === "string") {
              this.navigate(v, { replace }, type);
              return;
            }
            this.commitNavigation(resolvedPath, replace, state, type, eventType);
          },
          () => {
            // Rejected promise blocks navigation (spec §2.1).
          },
        );
        return;
      }
    }

    this.commitNavigation(resolvedPath, replace, state, type, eventType);
  }

  private commitNavigation(
    resolvedPath: string,
    replace: boolean,
    state: Record<string, unknown> | undefined,
    type: NavigationType,
    eventType: NavigationType,
  ): void {
    const prevPath = this.previousPath;
    // Same split as navigate(): the URL gets `resolvedPath` whole, every piece
    // of router state gets the pathname. Note that `searchParams` is read back
    // off the address bar *after* the push below — pushState applies
    // synchronously, so the bar is authoritative for the query either way,
    // whether it came in on the target or was already there.
    const routePath = pathnameOf(resolvedPath);

    // Workspace close: restore the origin route by replacing the workspace URL,
    // bypassing the session stack entirely (spec §4.13) — canGoBack reflects
    // the same state it had before the workspace was opened.
    if (type === "workspace-close") {
      window.history.replaceState(state ?? null, "", this.toExternal(resolvedPath));
      this.previousPath = routePath;
      this.setState({
        path: routePath,
        searchParams: new URLSearchParams(window.location.search),
        canGoBack: this.historyStack.canGoBack,
        inWorkspace: false,
      });
      this.onNavigate?.({ from: prevPath, to: routePath, type });
      return;
    }

    if (replace) {
      window.history.replaceState(state ?? null, "", this.toExternal(resolvedPath));
      this.historyStack.replace(this.state.path);
    } else {
      this.historyStack.push(this.state.path);
      window.history.pushState(state ?? null, "", this.toExternal(resolvedPath));
    }

    const newSearch = new URLSearchParams(window.location.search);
    this.previousPath = routePath;

    this.setState({
      path: routePath,
      searchParams: newSearch,
      canGoBack: this.historyStack.canGoBack,
      inWorkspace: false,
    });

    this.onNavigate?.({ from: prevPath, to: routePath, type: eventType });
  }

  back(): void {
    if (!this.historyStack.canGoBack) return;
    if (this.onPrompt && !this.onPrompt("")) return;
    const prev = this.historyStack.pop();
    window.history.back();
    if (prev !== undefined) {
      this.setState({
        path: prev,
        searchParams: new URLSearchParams(window.location.search),
        canGoBack: this.historyStack.canGoBack,
      });
      this.onNavigate?.({ from: this.state.path, to: prev, type: "back" });
    }
  }

  setSearchParams(next: URLSearchParams): void {
    const search = next.toString();
    // Deliberately base-path-agnostic: both branches echo the address bar's
    // own path back (a relative `?query`, or the external pathname verbatim),
    // so there is nothing to translate. Do NOT "fix" this to
    // toExternal(this.state.path) — while a workspace URL is current,
    // state.path holds the retained *route* path, and that would clobber the
    // address bar off the workspace.
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
    this.setState({ searchParams: next });
  }

  setMeta(patch: Record<string, unknown>): void {
    this.setState({ meta: { ...this.state.meta, ...patch } });
  }

  setTransitioning(value: boolean): void {
    this.setState({ isTransitioning: value });
  }

  buildPath(pattern: string, params: Record<string, string>): string {
    return buildPath(pattern, params);
  }

  /**
   * Strips the app base from a window.location pathname. Every path the
   * library handles downstream of this is base-free.
   */
  toInternal(pathname: string): string {
    return toInternal(pathname, this.basePath);
  }

  /** Prepends the app base to an internal path, for the address bar. */
  toExternal(path: string): string {
    return toExternal(path, this.basePath);
  }

  /** Takes an INTERNAL path — strip the app base before calling. */
  isWorkspacePath(pathname: string): boolean {
    return pathname === this.workspaceBasePath ||
      pathname.startsWith(this.workspaceBasePath + "/");
  }

  matchPath(pattern: string, pathname: string) {
    return matchPath(pattern, pathname);
  }

  getHistoryStack(): HistoryStack {
    return this.historyStack;
  }

  // ─── popstate handler ─────────────────────────────────────────────────────────

  private handlePopState(): void {
    const loc = window.location;
    const internalPath = this.toInternal(loc.pathname);
    if (this.isWorkspacePath(internalPath)) {
      this.setState({ inWorkspace: true });
      return;
    }

    // Prompt guard. In an installed PWA the back affordance *is* the
    // browser's (Android hardware back, iOS edge-swipe), so popstate has to
    // honour `usePrompt` exactly as `navigate()` and `back()` do — otherwise
    // it is a silent data-loss path around the API that exists to prevent it.
    //
    // popstate fires *after* the URL has already moved, so a refusal is undone
    // by re-pushing the entry the user tried to leave. `state.path` +
    // `state.searchParams` still describe it: nothing below this point has run.
    //
    // Two exemptions, both deliberate:
    //  - leaving a workspace URL (`inWorkspace`) — workspace navigation is
    //    prompt-exempt by design (see the swipe adapter's scroll->URL sync),
    //    and `state.path` holds the retained *route* path there, not the
    //    workspace URL that was in the address bar.
    //  - query-only changes — the route stays mounted, so there is nothing to
    //    lose; the same rule `setSearchParams` already follows.
    if (
      this.onPrompt &&
      !this.state.inWorkspace &&
      internalPath !== this.state.path &&
      !this.onPrompt("")
    ) {
      const search = this.state.searchParams.toString();
      window.history.pushState(
        null,
        "",
        this.toExternal(this.state.path) + (search ? `?${search}` : ""),
      );
      return;
    }

    this.setState({
      path: internalPath,
      searchParams: new URLSearchParams(loc.search),
      canGoBack: this.historyStack.canGoBack,
      inWorkspace: false,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────────

  private setState(patch: Partial<RouterState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// ─── Singleton navigate (imperative, outside React) ───────────────────────────

let _store: RouterStore | null = null;

export function setActiveStore(store: RouterStore | null): void {
  _store = store;
}

export function navigate<TPath extends RoutePath>(
  to: TPath,
  ...args: NavigateArgs<TPath>
): void;
export function navigate(to: string, options?: NavigateOptions): void;
export function navigate(to: string, options?: NavigateOptions): void {
  _store?.navigate(to, options);
}
