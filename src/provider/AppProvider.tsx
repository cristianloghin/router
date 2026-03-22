import React, { useRef, useEffect } from "react";
import { createBus } from "@mikrostack/chbus";
import type { Bus } from "@mikrostack/chbus";

import { RouterStore } from "../router/RouterContext";
import { RouterStoreContext } from "../router/context";
import { RouteRegistry } from "../router/RouteRegistry";
import { RouteRegistryContext } from "../router/registryContext";

import { WorkspaceManager } from "../workspaces/WorkspaceManager";
import { WorkspaceManagerContext, WorkspaceTemplatesContext } from "../workspaces/context";
import { WorkspaceGuard } from "../workspaces/auth/WorkspaceGuard";
import { StackAdapter } from "../workspaces/adapters/StackAdapter";
import { SwipeAdapter } from "../workspaces/adapters/SwipeAdapter";
import { BrowserTabAdapter } from "../workspaces/adapters/BrowserTabAdapter";

import { AppConfigContext } from "./context";

import type { RouteMap, RouteErrorProps, NavigationEvent } from "../router/types";
import type {
  WorkspaceTemplateMap,
  WorkspaceAdapter,
  CredentialInput,
} from "../workspaces/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  adapter?: "auto" | "stack" | "swipe" | "tabs";
  maxWorkspaces?: number;
  persistWorkspaces?: boolean;
  persistVersion?: number;
  workspaceBasePath?: string;
  defaultLoading?: React.ComponentType | React.ReactNode;
  defaultError?: React.ComponentType<RouteErrorProps>;
  auth?: {
    isAuthenticated: () => boolean | Promise<boolean>;
    onCredentialAttempt?: (input: CredentialInput, workspaceId: string) => void;
  };
  onBeforeNavigate?: (event: NavigationEvent & { cancel: () => void }) => void;
  onNavigate?: (event: NavigationEvent) => void;
}

export interface AppProviderProps<
  TRoutes extends RouteMap = RouteMap,
  TWorkspaces extends WorkspaceTemplateMap = WorkspaceTemplateMap,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  routes: TRoutes;
  workspaces: TWorkspaces;
  meta?: TMeta;
  config?: AppConfig;
  bus?: Bus;
  children: React.ReactNode;
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
  TWorkspaces extends WorkspaceTemplateMap = WorkspaceTemplateMap,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>({
  routes,
  workspaces,
  meta = {} as TMeta,
  config = {},
  bus: externalBus,
  children,
}: AppProviderProps<TRoutes, TWorkspaces, TMeta>): React.ReactElement {
  const storeRef = useRef<RouterStore | null>(null);
  const registryRef = useRef<RouteRegistry | null>(null);
  const managerRef = useRef<WorkspaceManager | null>(null);
  const busRef = useRef<Bus | null>(null);

  // Initialise once on mount
  if (!storeRef.current) {
    const basePath = config.workspaceBasePath ?? "/workspace";

    storeRef.current = new RouterStore(meta as Record<string, unknown>, basePath);
    registryRef.current = new RouteRegistry(routes as RouteMap);

    busRef.current = externalBus ?? createBus();

    const adapter = createAdapter(config.adapter);

    const guard = new WorkspaceGuard({
      isAuthenticated: config.auth?.isAuthenticated ?? (() => false),
    });

    const store = storeRef.current;
    const navigate = (url: string, opts: { replace?: boolean; state?: unknown } = {}) => {
      const navOpts: Parameters<typeof store.navigate>[1] = {};
      if (opts.replace !== undefined) navOpts.replace = opts.replace;
      if (opts.state !== undefined) navOpts.state = opts.state as Record<string, unknown>;
      store.navigate(url, navOpts);
    };

    managerRef.current = new WorkspaceManager({
      adapter,
      guard,
      navigate,
      bus: busRef.current,
      templates: workspaces as WorkspaceTemplateMap,
      workspaceBasePath: basePath,
    });
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
    return () => {
      storeRef.current?.destroy();
    };
  }, []);

  const appConfig: { defaultLoading?: React.ComponentType | React.ReactNode; defaultError?: React.ComponentType<RouteErrorProps> } = {};
  if (config.defaultLoading !== undefined) appConfig.defaultLoading = config.defaultLoading;
  if (config.defaultError !== undefined) appConfig.defaultError = config.defaultError;

  return (
    <RouterStoreContext.Provider value={store}>
      <RouteRegistryContext.Provider value={registryRef.current!}>
        <WorkspaceManagerContext.Provider value={managerRef.current!}>
          <WorkspaceTemplatesContext.Provider value={workspaces as WorkspaceTemplateMap}>
            <AppConfigContext.Provider value={appConfig}>
              {children}
            </AppConfigContext.Provider>
          </WorkspaceTemplatesContext.Provider>
        </WorkspaceManagerContext.Provider>
      </RouteRegistryContext.Provider>
    </RouterStoreContext.Provider>
  );
}
