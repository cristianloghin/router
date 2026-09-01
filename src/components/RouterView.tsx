import React, { useEffect, useRef, useState, useTransition } from "react";
import { useSyncExternalStore } from "react";
import { useRouterStore } from "../router/context";
import { useRouteRegistry } from "../router/registryContext";
import { useAppConfig } from "../provider/context";
import { matchPathPrefix } from "../router/matcher";
import { RouteBoundary, resolveLoading } from "../router/boundaries";
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

  const initialGuard = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().initialGuard,
    () => store.getSnapshot().initialGuard,
  );

  // Transition semantics (spec §3.1): route changes are applied inside
  // React.startTransition via local state, so the previous route stays
  // visible while a new lazy route loads. useSyncExternalStore updates
  // cannot themselves be transitions, hence the mirrored state.
  const [mirroredPath, setMirroredPath] = useState(storePath);
  const [isPending, startTransition] = useTransition();

  // Until a route has actually rendered there is nothing for the mirror to
  // preserve, and pinning to it is actively wrong: when an initial guard
  // resolves by redirecting, the mirror still holds the *guarded* path for one
  // frame, which would put the gated route on screen after the guard rejected
  // it. Track the store directly until the first route commits, then hand over
  // to the mirror so lazy-route transitions keep working as before.
  const hasRenderedRouteRef = useRef(false);
  const path = hasRenderedRouteRef.current ? mirroredPath : storePath;

  useEffect(() => {
    if (initialGuard === "resolved") hasRenderedRouteRef.current = true;
  }, [initialGuard]);

  useEffect(() => {
    if (storePath !== path) {
      startTransition(() => {
        setMirroredPath(storePath);
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

  type RouteDef = {
    component: React.ComponentType<{ params: Record<string, string>; outlet: React.ReactNode }>;
    index?: React.ComponentType;
    loading?: React.ComponentType | React.ReactNode;
    error?: React.ComponentType<RouteErrorProps>;
    parent?: null;
  };
  const routeMap = registry._routes as Record<string, RouteDef>;

  // Initial-guard render states (spec §2.1). Only the launch route reaches
  // here: every later navigation, popstate included, keeps the route already
  // on screen while its guard settles, so there is nothing to stand in for.
  //  - pending: the guard returned a promise and nothing has been rendered
  //    yet. Show the same chain a lazy route shows — the launch route's own
  //    `loading`, else `defaultLoading`, else nothing.
  //  - blocked: the guard said no and named no redirect. Show what an unknown
  //    URL shows; "you may not see this" and "this does not exist" are
  //    deliberately indistinguishable.
  if (initialGuard !== "resolved") {
    const leafKey = chain[chain.length - 1];
    const leafLoading = leafKey ? routeMap[leafKey]?.loading : undefined;
    return (
      <div ref={containerRef} tabIndex={-1} style={{ outline: "none" }}>
        {initialGuard === "pending"
          ? resolveLoading(leafLoading ?? defaultLoading)
          : renderFallback(fallback, path)}
      </div>
    );
  }

  // Fallback when nothing matches OR notFound() was called from a route component
  if (chain.length === 0 || notFoundPath !== null) {
    return (
      <div ref={containerRef} tabIndex={-1} style={{ outline: "none" }}>
        {renderFallback(fallback, notFoundPath ?? path)}
      </div>
    );
  }

  // Render inside-out: innermost first, pass outlet upward.
  let outlet: React.ReactNode = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const key = chain[i]!;
    const def = routeMap[key]!;
    // Prefix match, not exact: an ancestor's pattern is shorter than the path
    // whenever a deeper child is matched, and `/videowalls/:id` still has to
    // know which wall it is rendering while `/videowalls/:id/live` is on
    // screen. For the leaf this is the same match `matchPath` would give.
    const { params } = matchPathPrefix(key, path);

    // The chain's leaf *is* the matched route, so reaching it means the path
    // terminates here and this route's index (if any) is what fills its
    // outlet. Testing `path === key` instead only ever held for static keys —
    // a parametric route's index never rendered at all.
    const isLeaf = i === chain.length - 1;
    const isExactParent = isLeaf && def.index !== undefined;

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
