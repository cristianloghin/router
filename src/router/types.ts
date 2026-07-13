import type React from "react";
import type { WorkspaceDescriptor } from "../workspaces/types";

// ─── ExtractParams ────────────────────────────────────────────────────────────

/**
 * Extracts :param segments from a path pattern string into a typed Record.
 *
 * "/camera/:id"       → { id: string }
 * "/a/:x/b/:y"        → { x: string; y: string }
 * "/settings/profile" → Record<string, never>
 */
export type ExtractParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<`/${Rest}`>]: string }
    : T extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Record<string, never>;

// ─── Route definition ─────────────────────────────────────────────────────────

export interface RouteComponentProps<TParams extends Record<string, string>> {
  params: TParams;
  outlet: React.ReactNode;
}

export interface RouteErrorProps {
  error: Error;
  reset: () => void;
  path: string;
}

export interface RouteDefinition<TPath extends string = string> {
  component:
    | React.ComponentType<RouteComponentProps<ExtractParams<TPath>>>
    | React.LazyExoticComponent<
        React.ComponentType<RouteComponentProps<ExtractParams<TPath>>>
      >;
  index?: React.ComponentType | React.LazyExoticComponent<React.ComponentType>;
  loading?: React.ComponentType | React.ReactNode;
  error?: React.ComponentType<RouteErrorProps>;
  guard?: (
    params: ExtractParams<TPath>,
    context: NavigationContext,
  ) => boolean | string | Promise<boolean | string>;
  parent?: null;
}

// Raw input map used by defineRoutes (keys are typed as string literals by inference).
export type RawRouteMap = Record<string, RouteDefinition<string>>;

// The frozen validated route map.
export type RouteMap<TMap extends RawRouteMap = RawRouteMap> = Readonly<TMap>;

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavigationContext {
  path: string;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  inWorkspace: boolean;
  currentWorkspace: WorkspaceDescriptor | null;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
  params?: Record<string, string>;
}

// ─── Register (compile-time route typing, spec §4.2/§4.11) ───────────────────

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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

/** The app's registered route map, or the loose RouteMap when unregistered. */
export type RegisteredRoutes = Register extends { routes: infer R } ? R : RouteMap;

/** Union of registered route keys; plain `string` when unregistered. */
export type RoutePath = Register extends { routes: infer R }
  ? keyof R & string
  : string;

/**
 * Variadic argument tuple for navigate(): routes without params take optional
 * options; routes with params require `options.params` (spec §4.2).
 */
export type NavigateArgs<TPath extends string> =
  ExtractParams<TPath> extends Record<string, never>
    ? [options?: NavigateOptions]
    : [options: Omit<NavigateOptions, "params"> & { params: ExtractParams<TPath> }];

/** Variadic argument tuple for buildPath(). */
export type BuildPathArgs<TPath extends string> =
  ExtractParams<TPath> extends Record<string, never>
    ? [params?: Record<string, string>]
    : [params: ExtractParams<TPath>];

/**
 * The `params` prop for `<Link>`: forbidden for param-less routes, required
 * for parametric routes (spec §4.11).
 */
export type LinkParamsProp<TPath extends string> =
  ExtractParams<TPath> extends Record<string, never>
    ? { params?: Record<string, string> }
    : { params: ExtractParams<TPath> };

export type NavigationType =
  | "push"
  | "replace"
  | "back"
  | "workspace-open"
  | "workspace-close";

export interface NavigationEvent {
  from: string | null;
  to: string;
  type: NavigationType;
}
