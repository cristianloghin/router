import React, { useRef, useEffect, useSyncExternalStore } from "react";
import { createBus } from "@mikrostack/chbus";
import type { Bus } from "@mikrostack/chbus";

import { RouterStore, setActiveStore } from "../router/RouterContext";
import { RouterStoreContext } from "../router/context";
import { RouteRegistry } from "../router/RouteRegistry";
import { RouteRegistryContext } from "../router/registryContext";

import { WorkspaceManager } from "../workspaces/WorkspaceManager";
import { WorkspaceManagerContext, WorkspaceTemplatesContext } from "../workspaces/context";
import { WorkspaceGuard } from "../workspaces/auth/WorkspaceGuard";
import { CredentialRequestStore } from "../workspaces/auth/credentialRequests";
import { CredentialForm } from "../workspaces/auth/AuthGate";
import { StackAdapter } from "../workspaces/adapters/StackAdapter";
import { SwipeAdapter } from "../workspaces/adapters/SwipeAdapter";
import { BrowserTabAdapter } from "../workspaces/adapters/BrowserTabAdapter";

import { AppConfigContext } from "./context";

import { matchPath } from "../router/matcher";
import type {
  RouteMap,
  RouteErrorProps,
  NavigationEvent,
  NavigationContext,
} from "../router/types";
import type {
  WorkspaceTemplateMap,
  WorkspaceAdapter,
  CredentialInput,
  AuthGateProps,
} from "../workspaces/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  adapter?: "auto" | "stack" | "swipe" | "tabs";
  maxWorkspaces?: number;
  /**
   * Persist workspace state in localStorage. Presence enables persistence;
   * bump `version` when workspace param shapes change (old state is
   * discarded, no migration).
   */
  persist?: { version: number };
  workspaceBasePath?: string;
  defaultLoading?: React.ComponentType | React.ReactNode;
  defaultError?: React.ComponentType<RouteErrorProps>;
  auth?: {
    isAuthenticated: () => boolean | Promise<boolean>;
    onCredentialAttempt?: (input: CredentialInput, workspaceId: string) => void;
  };
  onBeforeNavigate?: (event: NavigationEvent & { cancel: () => void }) => void;
  onNavigate?: (event: NavigationEvent) => void;
  components?: {
    /** Custom auth gate for direct-access workspace auth failures (spec §6.4). */
    AuthGate?: React.ComponentType<AuthGateProps>;
  };
}

export interface AppProviderProps<
  TRoutes extends RouteMap = RouteMap,
  // Loose on purpose: schema-typed maps from defineWorkspaces carry
  // specifically-typed components that don't satisfy the loose runtime map
  // (function-param contravariance); defineWorkspaces enforces the shape.
  TWorkspaces extends Record<string, unknown> = WorkspaceTemplateMap,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  routes: TRoutes;
  /** Workspace templates. Omit to use the library as a plain router. */
  workspaces?: TWorkspaces;
  meta?: TMeta;
  config?: AppConfig;
  bus?: Bus;
  children: React.ReactNode;
}

// ─── CredentialDialogHost ─────────────────────────────────────────────────────

/**
 * Renders the library's built-in credential dialog (spec §6.2) while a
 * WorkspaceGuard credential request is pending. Unstyled, accessible markup
 * only (spec §15.4).
 */
function CredentialDialogHost({
  store,
}: {
  store: CredentialRequestStore;
}): React.ReactElement | null {
  const pending = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!pending) return null;
  return (
    <div role="dialog" aria-modal="true" data-component="credential-dialog">
      <CredentialForm
        label="Credentials required"
        onSubmit={(input) => pending.resolve(input)}
        onCancel={() => pending.resolve(null)}
      />
    </div>
  );
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createAdapter(type: "auto" | "stack" | "swipe" | "tabs" = "auto"): WorkspaceAdapter {
  switch (type) {
    case "tabs":
      return new BrowserTabAdapter();
    case "swipe":
      return new SwipeAdapter();
    case "stack":
      return new StackAdapter();
    case "auto":
    default:
      // Auto-detect: prefer swipe on touch devices, stack otherwise
      if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
        return new SwipeAdapter();
      }
      return new StackAdapter();
  }
}

// ─── AppProvider ──────────────────────────────────────────────────────────────

export function AppProvider<
  TRoutes extends RouteMap = RouteMap,
  TWorkspaces extends Record<string, unknown> = WorkspaceTemplateMap,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  routes,
  workspaces = {} as TWorkspaces,
  meta = {} as TMeta,
  config = {},
  bus: externalBus,
  children,
}: AppProviderProps<TRoutes, TWorkspaces, TMeta>): React.ReactElement {
  const storeRef = useRef<RouterStore | null>(null);
  const registryRef = useRef<RouteRegistry | null>(null);
  const managerRef = useRef<WorkspaceManager | null>(null);
  const busRef = useRef<Bus | null>(null);
  const credentialsRef = useRef<CredentialRequestStore | null>(null);

  // Initialise once on mount
  if (!storeRef.current) {
    const basePath = config.workspaceBasePath ?? "/workspace";

    storeRef.current = new RouterStore(meta as Record<string, unknown>, basePath);
    registryRef.current = new RouteRegistry(routes as RouteMap);

    busRef.current = externalBus ?? createBus();

    const adapter = createAdapter(config.adapter);

    // Built-in credential dialog bridge (spec §6.2): the guard asks, the
    // CredentialDialogHost below renders the form, the user answers.
    credentialsRef.current = new CredentialRequestStore();
    const credentials = credentialsRef.current;
    const onCredentialAttempt = config.auth?.onCredentialAttempt;

    const guard = new WorkspaceGuard({
      isAuthenticated: config.auth?.isAuthenticated ?? (() => false),
      requestCredential: async (workspaceId) => {
        const input = await credentials.request(workspaceId);
        if (input) onCredentialAttempt?.(input, workspaceId);
        return input;
      },
    });

    const store = storeRef.current;
    const navigate = (
      url: string,
      opts: {
        replace?: boolean;
        state?: unknown;
        navType?: "workspace-open" | "workspace-close";
      } = {},
    ) => {
      const navOpts: Parameters<typeof store.navigate>[1] = {};
      if (opts.replace !== undefined) navOpts.replace = opts.replace;
      if (opts.state !== undefined) navOpts.state = opts.state as Record<string, unknown>;
      store.navigate(url, navOpts, opts.navType ?? "push");
    };

    managerRef.current = new WorkspaceManager({
      adapter,
      guard,
      navigate,
      bus: busRef.current,
      templates: workspaces as unknown as WorkspaceTemplateMap,
      workspaceBasePath: basePath,
      getCurrentPath: () => store.getSnapshot().path,
      ...(onCredentialAttempt !== undefined ? { onCredentialAttempt } : {}),
      ...(config.maxWorkspaces !== undefined ? { maxWorkspaces: config.maxWorkspaces } : {}),
      ...(config.persist !== undefined ? { persist: config.persist } : {}),
    });

    // Route guard evaluator (spec §2.1): evaluates every guard in the target
    // path's match chain outermost-first; the first false/redirect wins.
    const registry = registryRef.current;
    const manager = managerRef.current;
    const routeMap = routes as RouteMap;
    store.routeGuard = (path: string) => {
      const chain = registry.getMatchChain(path);
      const guarded = chain.flatMap((key) => {
        const routeGuard = routeMap[key]?.guard;
        return routeGuard ? [{ key, guard: routeGuard }] : [];
      });
      if (guarded.length === 0) return true;

      const makeContext = (): NavigationContext => {
        const snap = store.getSnapshot();
        const currentChain = registry.getMatchChain(snap.path);
        const leaf = currentChain[currentChain.length - 1];
        return {
          path: snap.path,
          params: leaf ? matchPath(leaf, snap.path).params : {},
          searchParams: snap.searchParams,
          inWorkspace: store.isWorkspacePath(window.location.pathname),
          currentWorkspace: manager.getCurrent(),
        };
      };

      const runFrom = (index: number): boolean | string | Promise<boolean | string> => {
        for (let i = index; i < guarded.length; i++) {
          const entry = guarded[i]!;
          const { params } = matchPath(entry.key, path);
          const verdict = entry.guard(params as Record<string, never>, makeContext());
          if (verdict === true) continue;
          if (verdict instanceof Promise) {
            return verdict.then((r) => (r === true ? runFrom(i + 1) : r));
          }
          return verdict;
        }
        return true;
      };

      return runFrom(0);
    };
  }

  // Wire lifecycle hooks on every render (latest callback)
  const store = storeRef.current;
  if (config.onBeforeNavigate !== undefined) {
    store.onBeforeNavigate = config.onBeforeNavigate;
  } else {
    delete store.onBeforeNavigate;
  }
  if (config.onNavigate !== undefined) {
    store.onNavigate = config.onNavigate;
  } else {
    delete store.onNavigate;
  }

  useEffect(() => {
    // Re-attach the popstate listener: under StrictMode the mount→unmount→
    // remount cycle runs the cleanup below on a store that is then reused
    // (it lives in a ref), so destroy() must be reversible here.
    storeRef.current?.attach();
    // Register the store for the imperative navigate() export (spec §4.12).
    setActiveStore(storeRef.current);
    return () => {
      setActiveStore(null);
      storeRef.current?.destroy();
    };
  }, []);

  const appConfig: {
    defaultLoading?: React.ComponentType | React.ReactNode;
    defaultError?: React.ComponentType<RouteErrorProps>;
    AuthGate?: React.ComponentType<AuthGateProps>;
  } = {};
  if (config.defaultLoading !== undefined) appConfig.defaultLoading = config.defaultLoading;
  if (config.defaultError !== undefined) appConfig.defaultError = config.defaultError;
  if (config.components?.AuthGate !== undefined) appConfig.AuthGate = config.components.AuthGate;

  return (
    <RouterStoreContext.Provider value={store}>
      <RouteRegistryContext.Provider value={registryRef.current!}>
        <WorkspaceManagerContext.Provider value={managerRef.current!}>
          <WorkspaceTemplatesContext.Provider value={workspaces as unknown as WorkspaceTemplateMap}>
            <AppConfigContext.Provider value={appConfig}>
              {children}
              <CredentialDialogHost store={credentialsRef.current!} />
            </AppConfigContext.Provider>
          </WorkspaceTemplatesContext.Provider>
        </WorkspaceManagerContext.Provider>
      </RouteRegistryContext.Provider>
    </RouterStoreContext.Provider>
  );
}
