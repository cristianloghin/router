// ─── Router ───────────────────────────────────────────────────────────────────

export { defineRoutes } from "./router/RouteRegistry";
export {
  useNavigation,
  useLocation,
  useRoute,
  useParams,
  useSearchParams,
  useQueryState,
  useMeta,
  usePrompt,
} from "./router/hooks";
export { notFound } from "./utils/notFound";
export { navigate } from "./router/RouterContext";

// ─── Workspaces ───────────────────────────────────────────────────────────────

export { defineWorkspaces } from "./workspaces/defineWorkspaces";
export { useWorkspaces, useWorkspace, useWorkspaceChannel } from "./workspaces/hooks";

// ─── Provider ─────────────────────────────────────────────────────────────────

export { AppProvider } from "./provider/AppProvider";

// ─── Components ───────────────────────────────────────────────────────────────

export { RouterView } from "./components/RouterView";
export { Link } from "./components/Link";
export { StackContainer } from "./components/containers/StackContainer";
export { SwipeContainer } from "./components/containers/SwipeContainer";
export { TabsContainer } from "./components/containers/TabsContainer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  RouteDefinition,
  RouteComponentProps,
  RouteErrorProps,
  RouteMap,
  NavigationEvent,
  NavigationType,
  NavigationContext,
  NavigateOptions,
  Register,
  RegisteredRoutes,
  RoutePath,
  ExtractParams,
} from "./router/types";

export type {
  WorkspaceTemplate,
  WorkspaceDescriptor,
  WorkspaceParams,
  WorkspaceAuthRule,
  WorkspaceChannel,
  WorkspaceComponentProps,
  OpenWorkspaceInput,
  WorkspaceTemplateMap,
  AdapterType,
  AuthGateProps,
  CredentialInput,
} from "./workspaces/types";
export { WorkspaceError } from "./workspaces/types";

export type { AppProviderProps, AppConfig } from "./provider/AppProvider";
export type { RouterViewProps } from "./components/RouterView";
export type { LinkProps } from "./components/Link";
export type { QueryParamSchema, QueryParamDescriptor } from "./utils/params";
