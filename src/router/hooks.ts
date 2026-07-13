import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouterStore } from "./context";
import { matchPath } from "./matcher";
import type {
  ExtractParams,
  RouteMap,
  RoutePath,
  NavigateArgs,
  BuildPathArgs,
  NavigateOptions,
} from "./types";
import type { QueryParamSchema, InferQueryState } from "../utils/params";

// ─── useNavigation ────────────────────────────────────────────────────────────

export interface UseNavigationReturn {
  /** Navigate to a route key with typed params (see Register in types). */
  navigate<TPath extends RoutePath>(to: TPath, ...args: NavigateArgs<TPath>): void;
  /** Raw string escape hatch — external URLs or dynamically built paths. */
  navigate(to: string, options?: NavigateOptions): void;
  back(): void;
  buildPath<TPath extends RoutePath>(path: TPath, ...args: BuildPathArgs<TPath>): string;
}

export function useNavigation(): UseNavigationReturn {
  const store = useRouterStore();
  // Stable refs — these never change, so this hook never causes re-renders.
  const navigate = useCallback(
    (to: string, options?: Parameters<typeof store.navigate>[1]) =>
      store.navigate(to, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );
  const back = useCallback(() => store.back(), [store]);
  const bPath = useCallback(
    (pattern: string, params: Record<string, string> = {}) =>
      store.buildPath(pattern, params),
    [store],
  );
  return useMemo(() => ({ navigate, back, buildPath: bPath }), [navigate, back, bPath]);
}

// ─── useLocation ─────────────────────────────────────────────────────────────

export interface UseLocationReturn {
  path: string;
  searchParams: URLSearchParams;
  inWorkspace: boolean;
  canGoBack: boolean;
  isTransitioning: boolean;
}

export function useLocation(): UseLocationReturn {
  const store = useRouterStore();

  const snapshot = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  return useMemo(
    () => ({
      path: snapshot.path,
      searchParams: snapshot.searchParams,
      inWorkspace: snapshot.inWorkspace,
      canGoBack: snapshot.canGoBack,
      isTransitioning: snapshot.isTransitioning,
    }),
    [snapshot.path, snapshot.searchParams, snapshot.inWorkspace, snapshot.canGoBack, snapshot.isTransitioning],
  );
}

// ─── useRoute ─────────────────────────────────────────────────────────────────

export function useRoute<TPath extends RoutePath>(
  path: TPath,
): { matched: boolean; params: ExtractParams<TPath>; exact: boolean } {
  const store = useRouterStore();

  const snapshot = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  return useMemo(() => {
    const currentPath = snapshot.path;

    // Exact match
    const { matched, params } = matchPath(path, currentPath);
    if (matched) {
      return { matched: true, params: params as ExtractParams<TPath>, exact: true };
    }

    // Ancestor match: try matching just the prefix portion of currentPath that
    // is the same segment-depth as the pattern. This covers the case where
    // useRoute("/settings") should return matched:true for path "/settings/profile".
    const patternDepth = segmentCount(path);
    const prefixPath = takePrefixSegments(currentPath, patternDepth);
    if (prefixPath !== currentPath) {
      // currentPath is longer (more segments) — check if the prefix matches
      const { matched: ancMatched, params: ancParams } = matchPath(path, prefixPath);
      if (ancMatched) {
        return {
          matched: true,
          params: ancParams as ExtractParams<TPath>,
          exact: false,
        };
      }
    }

    return { matched: false, params: {} as ExtractParams<TPath>, exact: false };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, snapshot.path]);
}

function segmentCount(pattern: string): number {
  if (pattern === "/") return 0;
  return pattern.slice(1).split("/").length;
}

/** Returns the first N segments of a path. */
function takePrefixSegments(path: string, n: number): string {
  if (n === 0) return "/";
  const parts = path === "/" ? [] : path.slice(1).split("/");
  if (parts.length <= n) return path;
  return "/" + parts.slice(0, n).join("/");
}

// ─── useParams ────────────────────────────────────────────────────────────────

export function useParams<TPath extends RoutePath>(path: TPath): ExtractParams<TPath> {
  const { params } = useRoute(path);
  return params;
}

// ─── useSearchParams ──────────────────────────────────────────────────────────

export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void,
] {
  const store = useRouterStore();

  const searchParams = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().searchParams,
    () => store.getSnapshot().searchParams,
  );

  const setSearchParams = useCallback(
    (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
      const resolved =
        typeof next === "function"
          ? next(store.getSnapshot().searchParams)
          : next;
      store.setSearchParams(resolved);
    },
    [store],
  );

  return [searchParams, setSearchParams];
}

// ─── useQueryState ────────────────────────────────────────────────────────────

export function useQueryState<TSchema extends QueryParamSchema>(
  schema: TSchema,
): [InferQueryState<TSchema>, (patch: Partial<InferQueryState<TSchema>>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => {
    const result = {} as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(schema)) {
      const { type, default: def } = descriptor;
      const raw =
        type === "string[]" || type === "number[]"
          ? searchParams.getAll(key)
          : searchParams.get(key) ?? undefined;

      const isArray = type === "string[]" || type === "number[]";
      const hasValue = isArray
        ? (raw as string[]).length > 0
        : raw !== undefined;

      if (!hasValue) {
        result[key] = def;
      } else {
        result[key] = deserializeQueryParam(raw!, type);
      }
    }
    return result as InferQueryState<TSchema>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setState = useCallback(
    (patch: Partial<InferQueryState<TSchema>>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          const descriptor = schema[key];
          if (!descriptor || value === undefined) continue;
          const { type } = descriptor;
          next.delete(key);
          if (type === "string[]" || type === "number[]") {
            for (const v of value as string[]) {
              next.append(key, String(v));
            }
          } else {
            next.set(key, String(value));
          }
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams, schema],
  );

  return [state, setState];
}

function deserializeQueryParam(
  raw: string | string[],
  type: QueryParamSchema[string]["type"],
): unknown {
  switch (type) {
    case "string":
      return raw as string;
    case "number":
      return Number(raw as string);
    case "boolean":
      return (raw as string) === "true";
    case "string[]":
      return Array.isArray(raw) ? raw : [raw];
    case "number[]":
      return Array.isArray(raw) ? raw.map(Number) : [Number(raw)];
  }
}

// ─── useMeta ──────────────────────────────────────────────────────────────────

export function useMeta<TMeta extends Record<string, unknown>>(): [
  TMeta,
  (patch: Partial<TMeta>) => void,
] {
  const store = useRouterStore();

  const meta = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().meta as TMeta,
    () => store.getSnapshot().meta as TMeta,
  );

  const setMeta = useCallback(
    (patch: Partial<TMeta>) => store.setMeta(patch as Record<string, unknown>),
    [store],
  );

  return [meta, setMeta];
}

// ─── usePrompt ────────────────────────────────────────────────────────────────

export function usePrompt(message: string, when: boolean): void {
  const store = useRouterStore();

  useEffect(() => {
    if (!when) {
      delete store.onPrompt;
      return;
    }

    store.onPrompt = () => window.confirm(message);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy channel — modern browsers show their own message regardless.
      e.returnValue = message;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      delete store.onPrompt;
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [message, when, store]);
}

// ─── Typed overloads for consumers (re-exported with RouteMap generics) ───────

// These are the internal implementations. The public API re-exports them typed
// against the app's RouteMap via module augmentation or wrapper in AppProvider.
export type { ExtractParams, RouteMap };
