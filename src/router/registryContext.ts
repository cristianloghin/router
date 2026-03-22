import { createContext, useContext } from "react";
import type { RouteRegistry } from "./RouteRegistry";

export const RouteRegistryContext = createContext<RouteRegistry | null>(null);

export function useRouteRegistry(): RouteRegistry {
  const registry = useContext(RouteRegistryContext);
  if (!registry) {
    throw new Error("[router] RouteRegistry not found. Ensure <AppProvider> is rendered.");
  }
  return registry;
}
