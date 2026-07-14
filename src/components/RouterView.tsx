import React, { useEffect, useRef, useState, useTransition } from "react";
import { useSyncExternalStore } from "react";
import { useRouterStore } from "../router/context";
import { useRouteRegistry } from "../router/registryContext";
import { useAppConfig } from "../provider/context";
import { matchPath } from "../router/matcher";
import { RouteBoundary } from "../router/boundaries";
import type { RouteErrorProps } from "../router/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouterViewProps {
  fallback?: React.ComponentType<{ path: string }> | React.ReactNode;
  scrollRestoration?: "top" | "restore" | "none";
}

// ─── RouterView ───────────────────────────────────────────────────────────────

export function RouterView({
  fallback,
  scrollRestoration = "top",
}: RouterViewProps): React.ReactElement {
  const store = useRouterStore();
  const registry = useRouteRegistry();
  const appConfig = useAppConfig();
  // Fallback resolution (spec §2.1): route-level → AppConfig default → library default.
  const defaultLoading = appConfig.defaultLoading;
  const defaultError = appConfig.defaultError;
  const containerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<Map<string, number>>(new Map());
  const [notFoundPath, setNotFoundPath] = useState<string | null>(null);

  const storePath = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().path,
    () => store.getSnapshot().path,
  );

  // Transition semantics (spec §3.1): route changes are applied inside
  // React.startTransition via local state, so the previous route stays
  // visible while a new lazy route loads. useSyncExternalStore updates
  // cannot themselves be transitions, hence the mirrored state.
  const [path, setPath] = useState(storePath);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (storePath !== path) {
      startTransition(() => {
        setPath(storePath);
      });
    }
  }, [storePath, path]);

  // Drive useLocation().isTransitioning from the pending flag.
  useEffect(() => {
    store.setTransitioning(isPending);
  }, [isPending, store]);

  const prevPathRef = useRef<string>(path);

  // Reset notFound state when path changes
  useEffect(() => {
    setNotFoundPath(null);
  }, [path]);

  // Scroll management
  useEffect(() => {
    const prevPath = prevPathRef.current;
    if (prevPath === path) return;

    if (scrollRestoration === "top") {
      window.scrollTo(0, 0);
    } else if (scrollRestoration === "restore") {
      // Save outgoing scroll position
      savedScrollRef.current.set(prevPath, window.scrollY);
      // Restore incoming scroll position (or go to top)
      const saved = savedScrollRef.current.get(path) ?? 0;
      window.scrollTo(0, saved);
    }
    // "none" → do nothing

    prevPathRef.current = path;
  }, [path, scrollRestoration]);

  // Focus management after route change. preventScroll is load-bearing:
  // focus() scrolls the focused element into view, bypassing scroll-snap —
  // when the route view sits inside a scroll container (e.g. the swipe
  // deck's root page), a route change during a programmatic scroll would
  // yank that container back to reveal the focused element.
  useEffect(() => {
    if (!containerRef.current) return;
    const autofocusEl = containerRef.current.querySelector<HTMLElement>("[data-autofocus]");
    if (autofocusEl) {
      autofocusEl.focus({ preventScroll: true });
    } else {
      containerRef.current.focus({ preventScroll: true });
    }
  }, [path]);

  // Build render chain
  const chain = registry.getMatchChain(path);

  // Fallback when nothing matches OR notFound() was called from a route component
  if (chain.length === 0 || notFoundPath !== null) {
    return (
      <div ref={containerRef} tabIndex={-1} style={{ outline: "none" }}>
        {renderFallback(fallback, notFoundPath ?? path)}
      </div>
    );
  }

  type RouteDef = {
    component: React.ComponentType<{ params: Record<string, string>; outlet: React.ReactNode }>;
    index?: React.ComponentType;
    loading?: React.ComponentType | React.ReactNode;
    error?: React.ComponentType<RouteErrorProps>;
    parent?: null;
  };
  const routeMap = registry._routes as Record<string, RouteDef>;

  // Render inside-out: innermost first, pass outlet upward.
  let outlet: React.ReactNode = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const key = chain[i]!;
    const def = routeMap[key]!;
    const { params } = matchPath(key, path);

    // If this is the innermost (leaf) and the parent has an index, use it.
    const isLeaf = i === chain.length - 1;
    const isExactParent =
      isLeaf && path === key && def.index !== undefined;

    const InnerComponent = def.component;
    const capturedOutlet = outlet;
    const capturedKey = key;

    // For the parent with index: render index as outlet if path is exactly the parent
    let resolvedOutlet: React.ReactNode = capturedOutlet;
    if (isExactParent && def.index) {
      const IndexComponent = def.index;
      resolvedOutlet = <IndexComponent />;
    }

    const element = (
      <InnerComponent params={params} outlet={resolvedOutlet} />
    );

    // NOTE: deliberately not keyed by route — the boundary fiber persists per
    // nesting depth so startTransition can keep the previous route visible
    // while a new lazy route loads (a newly mounted Suspense boundary would
    // show its fallback immediately instead).
    outlet = (
      <RouteBoundary
        path={capturedKey}
        onNotFound={() => { setNotFoundPath(path); }}
        {...(def.loading !== undefined ? { loading: def.loading } : {})}
        {...(defaultLoading !== undefined ? { defaultLoading } : {})}
        {...(def.error !== undefined ? { error: def.error } : {})}
        {...(defaultError !== undefined ? { defaultError } : {})}
      >
        {element}
      </RouteBoundary>
    );
  }

  return (
    <div ref={containerRef} tabIndex={-1} style={{ outline: "none" }}>
      {outlet}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderFallback(
  fallback: RouterViewProps["fallback"],
  path: string,
): React.ReactNode {
  if (fallback === undefined || fallback === null) return null;
  if (typeof fallback === "function") {
    const Fallback = fallback as React.ComponentType<{ path: string }>;
    return <Fallback path={path} />;
  }
  return fallback as React.ReactNode;
}
