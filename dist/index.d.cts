import React from 'react';
import { ChannelContract, Channel, Bus } from '@mikrostack/chbus';

type ParamType = "string" | "number" | "boolean" | "string[]" | "number[]";
type ParamSchema = Record<string, ParamType>;
type QueryParamDescriptor = {
    type: ParamType;
    default?: string | number | boolean | string[] | number[];
};
type QueryParamSchema = Record<string, QueryParamDescriptor>;
type InferParamType<T extends ParamType> = T extends "string" ? string : T extends "number" ? number : T extends "boolean" ? boolean : T extends "string[]" ? string[] : T extends "number[]" ? number[] : never;
type InferQueryState<TSchema extends QueryParamSchema> = {
    [K in keyof TSchema]: InferParamType<TSchema[K]["type"]>;
};

type WorkspaceParams = Record<string, string | number | boolean | string[] | number[]>;
interface WorkspaceDescriptor<TParams extends WorkspaceParams = WorkspaceParams> {
    readonly id: string;
    readonly template: string;
    title: string;
    params: TParams;
    readonly createdAt: number;
    readonly auth: ResolvedWorkspaceAuth;
}
interface ResolvedWorkspaceAuth {
    type: "public" | "authenticated" | "time-limited" | "credential" | "custom";
    granted: boolean;
}
interface WorkspaceChannel<TRootToWorkspace extends ChannelContract = ChannelContract, TWorkspaceToRoot extends ChannelContract = ChannelContract> {
    inbound: Channel<TRootToWorkspace>;
    outbound: Channel<TWorkspaceToRoot>;
}
interface WorkspaceComponentProps<TParams extends WorkspaceParams = WorkspaceParams> {
    workspace: WorkspaceDescriptor<TParams>;
    channel: WorkspaceChannel;
}
interface CredentialInput {
    username: string;
    password: string;
}
interface AuthCheckContext {
    workspaceId: string;
    template: string;
    params: WorkspaceParams;
    isDirectAccess: boolean;
}
type WorkspaceAuthRule = {
    type: "public";
} | {
    type: "authenticated";
} | {
    type: "time-limited";
    expiresAt: number | (() => number);
} | {
    type: "credential";
    validate: (input: CredentialInput) => boolean | Promise<boolean>;
} | {
    type: "custom";
    check: (context: AuthCheckContext) => boolean | Promise<boolean>;
};
/**
 * Props for the AuthGate component rendered in place of a workspace whose
 * direct-access auth check failed (spec §6.4). Override the default gate via
 * AppConfig.components.AuthGate.
 */
interface AuthGateProps {
    workspace: WorkspaceDescriptor;
    authRule: WorkspaceAuthRule;
    retry: (input?: CredentialInput) => Promise<void>;
}
interface WorkspaceTemplate<TParams extends WorkspaceParams = WorkspaceParams> {
    component: React.ComponentType<WorkspaceComponentProps<TParams>>;
    defaultTitle?: string | ((params: TParams) => string);
    auth?: WorkspaceAuthRule;
    maxInstances?: number;
    schema?: Partial<Record<keyof TParams & string, ParamSchema[string]>>;
}
type WorkspaceTemplateMap = Record<string, WorkspaceTemplate<WorkspaceParams>>;
type InferParams<T> = T extends WorkspaceTemplate<infer P> ? P : never;
type AdapterType = "stack" | "swipe" | "tabs";
type WorkspaceErrorCode = "AUTH_FAILED" | "MAX_INSTANCES_REACHED" | "MAX_WORKSPACES_REACHED" | "WORKSPACE_NOT_FOUND" | "ADAPTER_ERROR";
declare class WorkspaceError extends Error {
    readonly code: WorkspaceErrorCode;
    readonly workspaceId: string | null;
    constructor(code: WorkspaceErrorCode, message: string, workspaceId?: string | null);
}
interface OpenWorkspaceInput<TKey = string, TParams = WorkspaceParams> {
    template: TKey;
    title: string;
    params: TParams;
}

/**
 * Extracts :param segments from a path pattern string into a typed Record.
 *
 * "/camera/:id"       → { id: string }
 * "/a/:x/b/:y"        → { x: string; y: string }
 * "/settings/profile" → Record<string, never>
 */
type ExtractParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}` ? {
    [K in Param | keyof ExtractParams<`/${Rest}`>]: string;
} : T extends `${string}:${infer Param}` ? {
    [K in Param]: string;
} : Record<string, never>;
interface RouteComponentProps<TParams extends Record<string, string>> {
    params: TParams;
    outlet: React.ReactNode;
}
interface RouteErrorProps {
    error: Error;
    reset: () => void;
    path: string;
}
interface RouteDefinition<TPath extends string = string> {
    component: React.ComponentType<RouteComponentProps<ExtractParams<TPath>>> | React.LazyExoticComponent<React.ComponentType<RouteComponentProps<ExtractParams<TPath>>>>;
    index?: React.ComponentType | React.LazyExoticComponent<React.ComponentType>;
    loading?: React.ComponentType | React.ReactNode;
    error?: React.ComponentType<RouteErrorProps>;
    guard?: (params: ExtractParams<TPath>, context: NavigationContext) => boolean | string | Promise<boolean | string>;
    parent?: null;
}
type RawRouteMap = Record<string, RouteDefinition<string>>;
type RouteMap<TMap extends RawRouteMap = RawRouteMap> = Readonly<TMap>;
interface NavigationContext {
    path: string;
    params: Record<string, string>;
    searchParams: URLSearchParams;
    inWorkspace: boolean;
    currentWorkspace: WorkspaceDescriptor | null;
}
interface NavigateOptions {
    replace?: boolean;
    state?: Record<string, unknown>;
    params?: Record<string, string>;
}
/**
 * Module-augmentation registration point. Apps opt into compile-time route
 * key/param checking by augmenting this interface with their route map:
 *
 * ```ts
 * const routes = defineRoutes({ ... });
 * declare module "@mikrostack/router" {
 *   interface Register { routes: typeof routes }
 * }
 * ```
 *
 * When unregistered, route keys are plain strings (no checking).
 */
interface Register {
}
/** The app's registered route map, or the loose RouteMap when unregistered. */
type RegisteredRoutes = Register extends {
    routes: infer R;
} ? R : RouteMap;
/** Union of registered route keys; plain `string` when unregistered. */
type RoutePath = Register extends {
    routes: infer R;
} ? keyof R & string : string;
/**
 * Variadic argument tuple for navigate(): routes without params take optional
 * options; routes with params require `options.params` (spec §4.2).
 */
type NavigateArgs<TPath extends string> = ExtractParams<TPath> extends Record<string, never> ? [options?: NavigateOptions] : [options: Omit<NavigateOptions, "params"> & {
    params: ExtractParams<TPath>;
}];
/** Variadic argument tuple for buildPath(). */
type BuildPathArgs<TPath extends string> = ExtractParams<TPath> extends Record<string, never> ? [params?: Record<string, string>] : [params: ExtractParams<TPath>];
/**
 * The `params` prop for `<Link>`: forbidden for param-less routes, required
 * for parametric routes (spec §4.11).
 */
type LinkParamsProp<TPath extends string> = ExtractParams<TPath> extends Record<string, never> ? {
    params?: Record<string, string>;
} : {
    params: ExtractParams<TPath>;
};
type NavigationType = "push" | "replace" | "back" | "workspace-open" | "workspace-close";
interface NavigationEvent {
    from: string | null;
    to: string;
    type: NavigationType;
}

declare function defineRoutes<TMap extends RawRouteMap>(map: TMap): RouteMap<TMap>;

interface UseNavigationReturn {
    /** Navigate to a route key with typed params (see Register in types). */
    navigate<TPath extends RoutePath>(to: TPath, ...args: NavigateArgs<TPath>): void;
    /** Raw string escape hatch — external URLs or dynamically built paths. */
    navigate(to: string, options?: NavigateOptions): void;
    back(): void;
    buildPath<TPath extends RoutePath>(path: TPath, ...args: BuildPathArgs<TPath>): string;
}
declare function useNavigation(): UseNavigationReturn;
interface UseLocationReturn {
    path: string;
    searchParams: URLSearchParams;
    inWorkspace: boolean;
    canGoBack: boolean;
    isTransitioning: boolean;
}
declare function useLocation(workspaceBasePath?: string): UseLocationReturn;
declare function useRoute<TPath extends RoutePath>(path: TPath): {
    matched: boolean;
    params: ExtractParams<TPath>;
    exact: boolean;
};
declare function useParams<TPath extends RoutePath>(path: TPath): ExtractParams<TPath>;
declare function useSearchParams(): [
    URLSearchParams,
    (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void
];
declare function useQueryState<TSchema extends QueryParamSchema>(schema: TSchema): [InferQueryState<TSchema>, (patch: Partial<InferQueryState<TSchema>>) => void];
declare function useMeta<TMeta extends Record<string, unknown>>(): [
    TMeta,
    (patch: Partial<TMeta>) => void
];
declare function usePrompt(message: string, when: boolean): void;

/**
 * Throws a sentinel value that RouterView's error boundary catches to
 * render the fallback. Call this from a route component when the resource
 * does not exist.
 *
 * Works correctly inside async rendering and Suspense.
 */
declare function notFound(): never;

declare function navigate<TPath extends RoutePath>(to: TPath, ...args: NavigateArgs<TPath>): void;
declare function navigate(to: string, options?: NavigateOptions): void;

declare function defineWorkspaces<TMap extends WorkspaceTemplateMap>(map: TMap): TMap;

declare function useWorkspaces<TWorkspaces extends WorkspaceTemplateMap = WorkspaceTemplateMap>(): {
    workspaces: WorkspaceDescriptor<WorkspaceParams>[];
    current: WorkspaceDescriptor<WorkspaceParams> | null;
    adapterType: AdapterType;
    open<TKey extends keyof TWorkspaces>(input: OpenWorkspaceInput<TKey, InferParams<TWorkspaces[TKey]>>): Promise<WorkspaceDescriptor<InferParams<TWorkspaces[TKey]>>>;
    focus(id: string): Promise<WorkspaceDescriptor>;
    close(id: string, autoFocus?: boolean): Promise<void>;
    updateParams<TKey extends keyof TWorkspaces>(id: string, params: Partial<InferParams<TWorkspaces[TKey]>>): WorkspaceDescriptor;
    updateTitle(id: string, title: string): WorkspaceDescriptor;
};
interface WorkspaceHookResult<TParams extends WorkspaceParams = WorkspaceParams> {
    workspace: WorkspaceDescriptor<TParams>;
    params: TParams;
    channel: WorkspaceChannel;
}
declare function useWorkspace<TParams extends WorkspaceParams = WorkspaceParams>(id: string): WorkspaceHookResult<TParams> | null;
interface RootChannelView {
    /** Root sends commands to the workspace via outbound. */
    outbound: Channel<ChannelContract>;
    /** Root receives messages from the workspace via inbound. */
    inbound: Channel<ChannelContract>;
}
declare function useWorkspaceChannel(workspaceId: string): RootChannelView | null;

interface AppConfig {
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
    onBeforeNavigate?: (event: NavigationEvent & {
        cancel: () => void;
    }) => void;
    onNavigate?: (event: NavigationEvent) => void;
    components?: {
        /** Custom auth gate for direct-access workspace auth failures (spec §6.4). */
        AuthGate?: React.ComponentType<AuthGateProps>;
    };
}
interface AppProviderProps<TRoutes extends RouteMap = RouteMap, TWorkspaces extends WorkspaceTemplateMap = WorkspaceTemplateMap, TMeta extends Record<string, unknown> = Record<string, unknown>> {
    routes: TRoutes;
    workspaces: TWorkspaces;
    meta?: TMeta;
    config?: AppConfig;
    bus?: Bus;
    children: React.ReactNode;
}
declare function AppProvider<TRoutes extends RouteMap = RouteMap, TWorkspaces extends WorkspaceTemplateMap = WorkspaceTemplateMap, TMeta extends Record<string, unknown> = Record<string, unknown>>({ routes, workspaces, meta, config, bus: externalBus, children, }: AppProviderProps<TRoutes, TWorkspaces, TMeta>): React.ReactElement;

interface RouterViewProps {
    fallback?: React.ComponentType<{
        path: string;
    }> | React.ReactNode;
    scrollRestoration?: "top" | "restore" | "none";
    defaultLoading?: React.ComponentType | React.ReactNode;
    defaultError?: React.ComponentType<RouteErrorProps>;
}
declare function RouterView({ fallback, scrollRestoration, defaultLoading: defaultLoadingProp, defaultError: defaultErrorProp, }: RouterViewProps): React.ReactElement;

interface LinkToBaseProps<TPath extends string> {
    to: TPath;
    replace?: boolean;
    state?: Record<string, unknown>;
    children: React.ReactNode;
    className?: string;
    activeClassName?: string;
    exactActiveClassName?: string;
    style?: React.CSSProperties;
    activeStyle?: React.CSSProperties;
    exactActiveStyle?: React.CSSProperties;
    href?: never;
}
/** Typed variant: route key + params enforced when routes are Registered. */
type LinkToProps<TPath extends string = string> = LinkToBaseProps<TPath> & LinkParamsProp<TPath>;
interface LinkHrefProps {
    href: string;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    to?: never;
}
type LinkProps<TPath extends string = string> = LinkToProps<TPath> | LinkHrefProps;
declare function Link<TPath extends RoutePath = RoutePath>(props: LinkProps<TPath>): React.ReactElement;

/**
 * Renders all open workspaces in a stacked layout.
 *
 * Each workspace is rendered using its template component, passing the
 * workspace descriptor and its bidirectional channel as props.
 * Focus and close controls are injected by the container.
 */
declare function StackContainer(): React.ReactElement;

/**
 * Renders all open workspaces in a horizontally swipeable layout.
 *
 * Scroll events update the current index on the SwipeAdapter without
 * triggering focus navigation. Programmatic focus (via focus button) calls
 * adapter.focus() and then scrolls the container to the workspace position.
 */
declare function SwipeContainer(): React.ReactElement;

/**
 * Renders the current workspace in a browser-tab style layout.
 *
 * - Displays a tab strip with all open workspaces.
 * - Renders only the current workspace's component.
 * - No close/root button: browser tabs manage their own back navigation.
 * - Clicking a tab calls focus() to switch the active workspace.
 */
declare function TabsContainer(): React.ReactElement;

export { type AdapterType, type AppConfig, AppProvider, type AppProviderProps, type AuthGateProps, type CredentialInput, type ExtractParams, Link, type LinkProps, type NavigateOptions, type NavigationContext, type NavigationEvent, type NavigationType, type OpenWorkspaceInput, type QueryParamDescriptor, type QueryParamSchema, type Register, type RegisteredRoutes, type RouteComponentProps, type RouteDefinition, type RouteErrorProps, type RouteMap, type RoutePath, RouterView, type RouterViewProps, StackContainer, SwipeContainer, TabsContainer, type WorkspaceAuthRule, type WorkspaceChannel, type WorkspaceComponentProps, type WorkspaceDescriptor, WorkspaceError, type WorkspaceParams, type WorkspaceTemplate, type WorkspaceTemplateMap, defineRoutes, defineWorkspaces, navigate, notFound, useLocation, useMeta, useNavigation, useParams, usePrompt, useQueryState, useRoute, useSearchParams, useWorkspace, useWorkspaceChannel, useWorkspaces };
