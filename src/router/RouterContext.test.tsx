import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { RouterStore } from "./RouterContext";
import { withHistoryIndex } from "./history";
import { RouterStoreContext } from "./context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore(meta = {}, workspaceBasePath = "/workspace") {
  return new RouterStore(meta, workspaceBasePath);
}

function wrapper(store: RouterStore) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(RouterStoreContext.Provider, { value: store }, children);
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe("RouterStore: initial state", () => {
  it("reflects window.location path on mount", () => {
    window.history.replaceState(null, "", "/settings");
    const store = makeStore();
    expect(store.getSnapshot().path).toBe("/settings");
    store.destroy();
  });

  it("initialises with the provided meta", () => {
    const store = makeStore({ theme: "dark" });
    expect(store.getSnapshot().meta).toEqual({ theme: "dark" });
    store.destroy();
  });

  it("starts with isTransitioning false", () => {
    const store = makeStore();
    expect(store.getSnapshot().isTransitioning).toBe(false);
    store.destroy();
  });

  it("filters workspace URL on mount — keeps path as root", () => {
    window.history.replaceState(null, "", "/workspace/feed/abc");
    const store = makeStore();
    expect(store.getSnapshot().path).toBe("/");
    store.destroy();
  });
});

// ─── navigate ─────────────────────────────────────────────────────────────────

describe("RouterStore: navigate", () => {
  let store: RouterStore;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = makeStore();
  });

  it("updates path state after navigate", () => {
    act(() => { store.navigate("/settings"); });
    expect(store.getSnapshot().path).toBe("/settings");
    store.destroy();
  });

  it("uses replaceState when replace: true", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    act(() => { store.navigate("/settings", { replace: true }); });
    // History entries carry the router's cursor (see HistoryStack).
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "", "/settings");
    spy.mockRestore();
    store.destroy();
  });

  it("uses pushState when replace is absent", () => {
    const spy = vi.spyOn(window.history, "pushState");
    act(() => { store.navigate("/settings"); });
    // History entries carry the router's cursor (see HistoryStack).
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "", "/settings");
    spy.mockRestore();
    store.destroy();
  });

  it("interpolates params into pattern", () => {
    act(() => { store.navigate("/camera/:id", { params: { id: "cam-4" } }); });
    expect(store.getSnapshot().path).toBe("/camera/cam-4");
    store.destroy();
  });

  it("does not update path state for workspace URLs", () => {
    act(() => { store.navigate("/workspace/feed/uuid-123"); });
    expect(store.getSnapshot().path).toBe("/");
    store.destroy();
  });

  it("canGoBack is true after a push navigate", () => {
    act(() => { store.navigate("/settings"); });
    expect(store.getSnapshot().canGoBack).toBe(true);
    store.destroy();
  });
});

// ─── back ─────────────────────────────────────────────────────────────────────

describe("RouterStore: back", () => {
  let store: RouterStore;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = makeStore();
  });

  it("is a no-op when canGoBack is false", () => {
    const histSpy = vi.spyOn(window.history, "back");
    act(() => { store.back(); });
    expect(histSpy).not.toHaveBeenCalled();
    histSpy.mockRestore();
    store.destroy();
  });

  it("calls window.history.back() and pops the stack", () => {
    act(() => { store.navigate("/settings"); });
    const histSpy = vi.spyOn(window.history, "back");
    act(() => { store.back(); });
    expect(histSpy).toHaveBeenCalledOnce();
    histSpy.mockRestore();
    store.destroy();
  });
});

// ─── popstate ─────────────────────────────────────────────────────────────────

describe("RouterStore: popstate", () => {
  it("updates path state on popstate event", () => {
    const store = makeStore();
    act(() => { store.navigate("/settings"); });

    window.history.replaceState(null, "", "/other");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(store.getSnapshot().path).toBe("/other");
    store.destroy();
  });
});

// ─── meta ─────────────────────────────────────────────────────────────────────

describe("RouterStore: meta", () => {
  it("setMeta patches meta without replacing it", () => {
    const store = makeStore({ a: 1, b: 2 });
    act(() => { store.setMeta({ b: 99 }); });
    expect(store.getSnapshot().meta).toEqual({ a: 1, b: 99 });
    store.destroy();
  });
});

// ─── onBeforeNavigate / onNavigate ───────────────────────────────────────────

describe("RouterStore: navigation lifecycle", () => {
  it("calls onBeforeNavigate before navigating", () => {
    const store = makeStore();
    const before = vi.fn();
    store.onBeforeNavigate = before;
    act(() => { store.navigate("/settings"); });
    expect(before).toHaveBeenCalledOnce();
    store.destroy();
  });

  it("cancel() in onBeforeNavigate blocks navigation", () => {
    const store = makeStore();
    store.onBeforeNavigate = ({ cancel }) => { cancel(); };
    act(() => { store.navigate("/settings"); });
    expect(store.getSnapshot().path).toBe("/");
    store.destroy();
  });

  it("calls onNavigate after successful navigation", () => {
    const store = makeStore();
    const after = vi.fn();
    store.onNavigate = after;
    act(() => { store.navigate("/settings"); });
    expect(after).toHaveBeenCalledOnce();
    store.destroy();
  });

  it("does not call onNavigate when navigation is cancelled", () => {
    const store = makeStore();
    const after = vi.fn();
    store.onNavigate = after;
    store.onBeforeNavigate = ({ cancel }) => { cancel(); };
    act(() => { store.navigate("/settings"); });
    expect(after).not.toHaveBeenCalled();
    store.destroy();
  });
});

// ─── popstate onto a workspace URL ────────────────────────────────────────────

describe("RouterStore: popstate onto a workspace URL", () => {
  it("keeps the route path and flips inWorkspace", () => {
    const store = new RouterStore({}, "/workspace");
    store.navigate("/settings");
    window.history.replaceState(null, "", "/workspace/cam/ws-1");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(store.getSnapshot().path).toBe("/settings");
    expect(store.getSnapshot().inWorkspace).toBe(true);
    store.destroy();
  });
});

// ─── navigate() with a query string ──────────────────────────────────────────

/**
 * `RouterState.path` is pathname-only: it is what RouterView and useRoute match
 * against, so a query riding along on the target must land in `searchParams`
 * and the address bar, never in `path`.
 */
describe("RouterStore: navigate with a query string", () => {
  let store: RouterStore;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = makeStore();
  });

  it("keeps path free of the query", () => {
    act(() => { store.navigate("/editor?draft=7"); });
    expect(store.getSnapshot().path).toBe("/editor");
    store.destroy();
  });

  it("puts the query on searchParams", () => {
    act(() => { store.navigate("/editor?draft=7&mode=edit"); });
    const sp = store.getSnapshot().searchParams;
    expect(sp.get("draft")).toBe("7");
    expect(sp.get("mode")).toBe("edit");
    store.destroy();
  });

  it("writes the full URL to the address bar", () => {
    act(() => { store.navigate("/editor?draft=7"); });
    expect(window.location.pathname).toBe("/editor");
    expect(window.location.search).toBe("?draft=7");
    store.destroy();
  });

  it("clears the query when navigating on to a bare path", () => {
    act(() => { store.navigate("/editor?draft=7"); });
    act(() => { store.navigate("/settings"); });
    expect(store.getSnapshot().path).toBe("/settings");
    expect(store.getSnapshot().searchParams.toString()).toBe("");
    expect(window.location.search).toBe("");
    store.destroy();
  });

  it("pushes the query-free path onto the history stack", () => {
    act(() => { store.navigate("/editor?draft=7"); });
    act(() => { store.navigate("/settings"); });
    act(() => { store.back(); });
    expect(store.getSnapshot().path).toBe("/editor");
    store.destroy();
  });

  it("interpolates params and keeps the query", () => {
    act(() => { store.navigate("/camera/:id?live=1", { params: { id: "42" } }); });
    expect(store.getSnapshot().path).toBe("/camera/42");
    expect(store.getSnapshot().searchParams.get("live")).toBe("1");
    expect(window.location.pathname).toBe("/camera/42");
    store.destroy();
  });

  it("works under replace", () => {
    act(() => { store.navigate("/editor?draft=7", { replace: true }); });
    expect(store.getSnapshot().path).toBe("/editor");
    expect(window.location.search).toBe("?draft=7");
    store.destroy();
  });

  it("strips a fragment from path but leaves it in the URL", () => {
    act(() => { store.navigate("/docs#install"); });
    expect(store.getSnapshot().path).toBe("/docs");
    expect(window.location.hash).toBe("#install");
    store.destroy();
  });

  it("reports the query-free path on NavigationEvent.to", () => {
    const seen: string[] = [];
    store.onNavigate = ({ to }) => { seen.push(to); };
    act(() => { store.navigate("/editor?draft=7"); });
    expect(seen).toEqual(["/editor"]);
    store.destroy();
  });

  it("hands the query-free path to the route guard", () => {
    const seen: string[] = [];
    store.routeGuard = (path) => { seen.push(path); return true; };
    act(() => { store.navigate("/editor?draft=7"); });
    expect(seen).toEqual(["/editor"]);
    expect(store.getSnapshot().path).toBe("/editor");
    store.destroy();
  });

  it("still detects a workspace target that carries a query", () => {
    act(() => { store.navigate("/settings"); });
    act(() => { store.navigate("/workspace/cam/ws-1?title=Test"); });
    // Workspace URLs are transparent: the route path is retained.
    expect(store.getSnapshot().path).toBe("/settings");
    expect(store.getSnapshot().inWorkspace).toBe(true);
    store.destroy();
  });
});

// ─── Guards on popstate ───────────────────────────────────────────────────────

/**
 * Roadmap P1, popstate half. Unlike the initial match there is always a route
 * on screen here, so a pending verdict needs no render state — the commit is
 * withheld and the current route stays put, as it does during navigate().
 */
describe("RouterStore: guards on popstate", () => {
  let store: RouterStore;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = makeStore();
  });

  /** The browser has already moved the URL by the time popstate is dispatched. */
  function popTo(url: string) {
    window.history.replaceState(null, "", url);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
  }

  it("blocks a popstate the guard refuses and restores the URL", () => {
    act(() => { store.navigate("/settings"); });
    store.routeGuard = (path) => path !== "/admin";

    popTo("/admin");

    expect(store.getSnapshot().path).toBe("/settings");
    expect(window.location.pathname).toBe("/settings");
    store.destroy();
  });

  it("commits a popstate the guard allows", () => {
    act(() => { store.navigate("/settings"); });
    store.routeGuard = () => true;

    popTo("/other");

    expect(store.getSnapshot().path).toBe("/other");
    store.destroy();
  });

  it("follows a redirect returned for a popstate", () => {
    act(() => { store.navigate("/settings"); });
    store.routeGuard = (path) => (path === "/admin" ? "/login" : true);

    popTo("/admin");

    expect(store.getSnapshot().path).toBe("/login");
    expect(window.location.pathname).toBe("/login");
    store.destroy();
  });

  it("withholds the commit until an async guard settles, then applies it", async () => {
    act(() => { store.navigate("/settings"); });
    let resolve!: (v: boolean) => void;
    const gate = new Promise<boolean>((r) => { resolve = r; });
    store.routeGuard = () => gate;

    popTo("/admin");
    // Still on the old route while the promise is in flight.
    expect(store.getSnapshot().path).toBe("/settings");

    await act(async () => { resolve(true); await gate; });
    expect(store.getSnapshot().path).toBe("/admin");
    store.destroy();
  });

  it("restores the URL when an async guard resolves false", async () => {
    act(() => { store.navigate("/settings"); });
    let resolve!: (v: boolean) => void;
    const gate = new Promise<boolean>((r) => { resolve = r; });
    store.routeGuard = () => gate;

    popTo("/admin");
    await act(async () => { resolve(false); await gate; });

    expect(store.getSnapshot().path).toBe("/settings");
    expect(window.location.pathname).toBe("/settings");
    store.destroy();
  });

  it("restores the URL when the guard throws", () => {
    act(() => { store.navigate("/settings"); });
    store.routeGuard = () => { throw new Error("boom"); };

    popTo("/admin");

    expect(store.getSnapshot().path).toBe("/settings");
    expect(window.location.pathname).toBe("/settings");
    store.destroy();
  });

  it("does not consult the guard on a query-only popstate", () => {
    act(() => { store.navigate("/settings"); });
    act(() => { store.setSearchParams(new URLSearchParams("tab=2")); });
    const seen: string[] = [];
    store.routeGuard = (path) => { seen.push(path); return true; };

    popTo("/settings?tab=1");

    expect(seen).toEqual([]);
    expect(store.getSnapshot().searchParams.get("tab")).toBe("1");
    store.destroy();
  });

  it("does not re-guard the popstate that back() itself caused", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => { store.navigate("/settings"); });
    const seen: string[] = [];
    store.routeGuard = (path) => { seen.push(path); return true; };

    act(() => { store.back(); });   // sets path to "/" synchronously
    popTo("/");                      // the browser's echo

    expect(seen).toEqual([]);
    expect(store.getSnapshot().path).toBe("/");
    vi.restoreAllMocks();
    store.destroy();
  });
});

// ─── History cursor tracks browser back/forward ───────────────────────────────

/**
 * Roadmap P3. The stack used to be pushed and popped only by navigate() and
 * back(); handlePopState read canGoBack without moving it. So after a browser
 * back, canGoBack over-reported, and a later programmatic back() walked off a
 * stale entry and set `path` to something the URL disagreed with.
 *
 * A real popstate restores that entry's own history.state, so these simulate
 * the index the browser would hand back rather than clearing it.
 */
describe("RouterStore: history cursor across browser back/forward", () => {
  let store: RouterStore;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = makeStore();
  });

  /** Simulates the browser restoring the entry at `index`. */
  function popToEntry(url: string, index: number) {
    window.history.replaceState(withHistoryIndex(null, index), "", url);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
  }

  it("canGoBack goes false once the browser walks back to the launch entry", () => {
    act(() => { store.navigate("/a"); });   // index 1
    act(() => { store.navigate("/b"); });   // index 2
    expect(store.getSnapshot().canGoBack).toBe(true);

    popToEntry("/a", 1);
    expect(store.getSnapshot().canGoBack).toBe(true);

    popToEntry("/", 0);
    expect(store.getSnapshot().canGoBack).toBe(false);
    store.destroy();
  });

  it("does not strand path out of sync with the URL after a browser back", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => { store.navigate("/a"); });
    act(() => { store.navigate("/b"); });

    popToEntry("/", 0);                     // browser back, all the way home
    act(() => { store.back(); });           // the old bug: popped a stale entry

    expect(backSpy).not.toHaveBeenCalled(); // nothing behind us to go back to
    expect(store.getSnapshot().path).toBe("/");
    expect(store.getSnapshot().path).toBe(window.location.pathname);
    vi.restoreAllMocks();
    store.destroy();
  });

  it("programmatic back() after a browser back targets the right entry", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => { store.navigate("/a"); });
    act(() => { store.navigate("/b"); });

    popToEntry("/a", 1);
    act(() => { store.back(); });

    expect(store.getSnapshot().path).toBe("/");
    vi.restoreAllMocks();
    store.destroy();
  });

  it("tracks a browser forward", () => {
    act(() => { store.navigate("/a"); });
    popToEntry("/", 0);
    expect(store.getSnapshot().canGoBack).toBe(false);

    popToEntry("/a", 1);
    expect(store.getSnapshot().canGoBack).toBe(true);
    expect(store.getSnapshot().path).toBe("/a");
    store.destroy();
  });

  it("a navigation after a browser back rewrites the forward entries", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => { store.navigate("/a"); });
    act(() => { store.navigate("/b"); });
    popToEntry("/a", 1);

    act(() => { store.navigate("/c"); });   // /b is now unreachable
    act(() => { store.back(); });

    expect(store.getSnapshot().path).toBe("/a");
    vi.restoreAllMocks();
    store.destroy();
  });

  it("stamps the cursor without clobbering app-supplied history state", () => {
    act(() => { store.navigate("/a", { state: { draft: "x" } }); });
    const state = window.history.state as Record<string, unknown>;
    expect(state["draft"]).toBe("x");
    store.destroy();
  });

  it("leaves canGoBack unchanged across a workspace open and close (spec 4.13)", () => {
    const before = store.getSnapshot().canGoBack;
    act(() => { store.navigate("/workspace/cam/ws-1"); });
    act(() => { store.navigate("/", {}, "workspace-close"); });
    expect(store.getSnapshot().canGoBack).toBe(before);
    store.destroy();
  });

  it("backing out of a workspace does not move the cursor", () => {
    act(() => { store.navigate("/a"); });          // index 1
    act(() => { store.navigate("/workspace/cam/ws-1"); });  // reuses index 1
    expect(store.getSnapshot().inWorkspace).toBe(true);

    popToEntry("/a", 1);                            // browser back out of it

    expect(store.getSnapshot().inWorkspace).toBe(false);
    expect(store.getSnapshot().path).toBe("/a");
    expect(store.getSnapshot().canGoBack).toBe(true);
    store.destroy();
  });
});
