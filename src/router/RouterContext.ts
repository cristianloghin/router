import { buildPath, matchPath } from "./matcher";
import { HistoryStack } from "./history";
import type { NavigateOptions, NavigationEvent, NavigationType } from "./types";

// ─── State ────────────────────────────────────────────────────────────────────

export interface RouterState {
  path: string;
  searchParams: URLSearchParams;
  isTransitioning: boolean;
  canGoBack: boolean;
  meta: Record<string, unknown>;
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
  private listeners: Set<() => void> = new Set();

  // Navigation lifecycle hooks — wired by AppProvider
  onBeforeNavigate?: (
    event: NavigationEvent & { cancel: () => void },
  ) => void;
  onNavigate?: (event: NavigationEvent) => void;
  onPrompt?: (message: string) => boolean;

  private previousPath: string | null = null;

  constructor(
    initialMeta: Record<string, unknown> = {},
    workspaceBasePath = "/workspace",
  ) {
    this.workspaceBasePath = workspaceBasePath;
    this.historyStack = new HistoryStack();

    const loc = window.location;
    const path = this.isWorkspacePath(loc.pathname) ? "/" : loc.pathname;

    this.state = {
      path,
      searchParams: new URLSearchParams(loc.search),
      isTransitioning: false,
      canGoBack: false,
      meta: initialMeta,
    };

    this.handlePopState = this.handlePopState.bind(this);
    window.addEventListener("popstate", this.handlePopState);
  }

  destroy(): void {
    window.removeEventListener("popstate", this.handlePopState);
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
    const resolvedPath = params ? buildPath(to, params) : to;

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
        to: resolvedPath,
        type,
        cancel: () => { cancelled = true; },
      });
      if (cancelled) return;
    }

    // Workspace URLs: update window.location but keep the router's path state unchanged.
    if (this.isWorkspacePath(resolvedPath)) {
      if (replace) {
        window.history.replaceState(state ?? null, "", resolvedPath);
      } else {
        window.history.pushState(state ?? null, "", resolvedPath);
      }
      // Don't update router path state — workspace URL is transparent to the router.
      return;
    }

    const prevPath = this.previousPath;

    if (replace) {
      window.history.replaceState(state ?? null, "", resolvedPath);
      this.historyStack.replace(this.state.path);
    } else {
      this.historyStack.push(this.state.path);
      window.history.pushState(state ?? null, "", resolvedPath);
    }

    const newSearch = new URLSearchParams(window.location.search);
    this.previousPath = resolvedPath;

    this.setState({
      path: resolvedPath,
      searchParams: newSearch,
      canGoBack: this.historyStack.canGoBack,
    });

    this.onNavigate?.({ from: prevPath, to: resolvedPath, type });
  }

  back(): void {
    if (!this.historyStack.canGoBack) return;
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
    if (this.isWorkspacePath(loc.pathname)) return;

    this.setState({
      path: loc.pathname,
      searchParams: new URLSearchParams(loc.search),
      canGoBack: this.historyStack.canGoBack,
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

export function navigate(to: string, options?: NavigateOptions): void {
  _store?.navigate(to, options);
}
