import type React from "react";

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
export type RawRouteMap = { [TPath extends string]: RouteDefinition<TPath> };

// The frozen validated route map.
export type RouteMap<TMap extends RawRouteMap = RawRouteMap> = Readonly<TMap>;

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavigationContext {
  path: string;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  inWorkspace: boolean;
  currentWorkspace: null; // Filled in by workspace layer
}

export interface NavigateOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
  params?: Record<string, string>;
}

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
