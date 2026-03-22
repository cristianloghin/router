/**
 * Test-only harness. NOT exported from the public barrel.
 *
 * Provides a stripped-down RouterContext for testing RouterView, Link,
 * and hooks without a full AppProvider.
 */
import React from "react";
import { RouterStore } from "../router/RouterContext";
import { RouterStoreContext } from "../router/context";
import { RouteRegistry, defineRoutes } from "../router/RouteRegistry";
import { RouteRegistryContext } from "../router/registryContext";
import type { RawRouteMap } from "../router/types";

interface RouterTestProviderProps {
  routes: ReturnType<typeof defineRoutes>;
  initialPath?: string;
  meta?: Record<string, unknown>;
  workspaceBasePath?: string;
  children: React.ReactNode;
}

export function RouterTestProvider({
  routes,
  initialPath = "/",
  meta = {},
  workspaceBasePath = "/workspace",
  children,
}: RouterTestProviderProps): React.ReactElement {
  const storeRef = React.useRef<RouterStore | null>(null);
  const registryRef = React.useRef<RouteRegistry | null>(null);

  if (!storeRef.current) {
    window.history.replaceState(null, "", initialPath);
    storeRef.current = new RouterStore(meta, workspaceBasePath);
    registryRef.current = new RouteRegistry(routes as ReturnType<typeof defineRoutes<RawRouteMap>>);
  }

  React.useEffect(() => {
    return () => { storeRef.current?.destroy(); };
  }, []);

  return (
    <RouterStoreContext.Provider value={storeRef.current}>
      <RouteRegistryContext.Provider value={registryRef.current!}>
        {children}
      </RouteRegistryContext.Provider>
    </RouterStoreContext.Provider>
  );
}
