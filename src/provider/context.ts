import { createContext, useContext } from "react";
import type React from "react";
import type { RouteErrorProps } from "../router/types";
import type { AuthGateProps } from "../workspaces/types";

// ─── AppConfigContext ─────────────────────────────────────────────────────────

/**
 * Provides app-wide route rendering defaults from AppConfig.
 * RouterView reads these as fallbacks when no route-level loading/error is declared.
 */
export interface AppConfigContextValue {
  defaultLoading?: React.ComponentType | React.ReactNode;
  defaultError?: React.ComponentType<RouteErrorProps>;
  /** Custom auth gate for direct-access workspace auth failures (spec §6.4). */
  AuthGate?: React.ComponentType<AuthGateProps>;
}

export const AppConfigContext = createContext<AppConfigContextValue>({});

export function useAppConfig(): AppConfigContextValue {
  return useContext(AppConfigContext);
}
