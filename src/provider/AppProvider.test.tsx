import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { AppProvider } from "./AppProvider";
import { RouterView } from "../components/RouterView";
import { navigate as imperativeNavigate } from "../router/RouterContext";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useNavigation, useLocation } from "../router/hooks";
import { useWorkspaces } from "../workspaces/hooks";
import { createBus } from "@mikrostack/chbus";

// ─── Minimal test fixtures ────────────────────────────────────────────────────

const routes = defineRoutes({
  "/": { component: () => React.createElement("div", null, "Home") },
  "/about": { component: () => React.createElement("div", null, "About") },
});

const workspaces = defineWorkspaces({
  cam: {
    component: () => null,
    auth: { type: "public" },
    schema: { cameraId: "string" as const },
  },
  secured: {
    component: () => null,
    auth: { type: "authenticated" },
  },
});

function makeWrapper(props: Partial<React.ComponentProps<typeof AppProvider>> = {}) {
  return ({ children }: { children: React.ReactNode }) => (
    <AppProvider
      routes={routes}
      workspaces={workspaces}
      config={{ adapter: "stack", ...props.config }}
      {...props}
    >
      {children}
    </AppProvider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── hook accessibility ───────────────────────────────────────────────────────

describe("AppProvider: hook accessibility", () => {
  it("useNavigation() works below AppProvider", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper: makeWrapper() });
    expect(typeof result.current.navigate).toBe("function");
  });

  it("useWorkspaces() works below AppProvider", () => {
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    expect(Array.isArray(result.current.workspaces)).toBe(true);
    expect(result.current.adapterType).toBe("stack");
  });

  it("useNavigation() and useWorkspaces() coexist below AppProvider", () => {
    const { result } = renderHook(
      () => ({ nav: useNavigation(), ws: useWorkspaces() }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.nav.navigate).toBeDefined();
    expect(result.current.ws.workspaces).toBeDefined();
  });
});

// ─── onNavigate ───────────────────────────────────────────────────────────────

describe("AppProvider: onNavigate", () => {
  it("fires onNavigate after a route navigation", () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useNavigation(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onNavigate } }),
    });
    act(() => { result.current.navigate("/about"); });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("onNavigate receives { from, to, type }", () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useNavigation(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onNavigate } }),
    });
    act(() => { result.current.navigate("/about"); });
    const event = onNavigate.mock.calls[0]?.[0] as { from: string | null; to: string; type: string };
    expect(event.to).toBe("/about");
    expect(event.type).toBe("push");
  });
});

// ─── onBeforeNavigate ────────────────────────────────────────────────────────

describe("AppProvider: onBeforeNavigate", () => {
  it("fires onBeforeNavigate before a route navigation", () => {
    const onBeforeNavigate = vi.fn();
    const { result } = renderHook(() => useNavigation(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onBeforeNavigate } }),
    });
    act(() => { result.current.navigate("/about"); });
    expect(onBeforeNavigate).toHaveBeenCalledOnce();
  });

  it("cancel() in onBeforeNavigate blocks the navigation", () => {
    const onNavigate = vi.fn();
    const onBeforeNavigate = vi.fn(({ cancel }: { cancel: () => void }) => cancel());
    const { result } = renderHook(() => useNavigation(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onBeforeNavigate, onNavigate } }),
    });
    act(() => { result.current.navigate("/about"); });
    // navigation was blocked → onNavigate should not fire
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("blocked navigation leaves path unchanged", () => {
    const onBeforeNavigate = vi.fn(({ cancel }: { cancel: () => void }) => cancel());
    const { result } = renderHook(
      () => ({ nav: useNavigation(), loc: useLocation() }),
      { wrapper: makeWrapper({ config: { adapter: "stack", onBeforeNavigate } }) },
    );
    act(() => { result.current.nav.navigate("/about"); });
    expect(result.current.loc.path).toBe("/");
  });
});

// ─── bus prop ────────────────────────────────────────────────────────────────

describe("AppProvider: bus prop", () => {
  it("uses an externally provided bus for workspace channels", async () => {
    const externalBus = createBus();
    const namespaceSpy = vi.spyOn(externalBus, "namespace");

    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ bus: externalBus, config: { adapter: "stack" } }),
    });
    await act(async () => {
      await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    // The bus.namespace should have been called to set up the workspace channel
    expect(namespaceSpy).toHaveBeenCalled();
  });

  it("creates an internal bus when none is provided", async () => {
    // No error = internal bus was created and used
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack" } }),
    });
    await expect(
      act(async () => {
        await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
      }),
    ).resolves.not.toThrow();
  });
});

// ─── auth.isAuthenticated ─────────────────────────────────────────────────────

describe("AppProvider: auth.isAuthenticated", () => {
  it("is called when opening an authenticated workspace", async () => {
    const isAuthenticated = vi.fn(() => true);
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack", auth: { isAuthenticated } } }),
    });
    await act(async () => {
      await result.current.open({ template: "secured", title: "S", params: {} });
    });
    expect(isAuthenticated).toHaveBeenCalled();
  });

  it("open rejects when isAuthenticated returns false for authenticated workspace", async () => {
    const isAuthenticated = vi.fn(() => false);
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack", auth: { isAuthenticated } } }),
    });
    await expect(
      act(async () => {
        await result.current.open({ template: "secured", title: "S", params: {} });
      }),
    ).rejects.toThrow();
  });
});

// ─── workspace URLs transparent to router ────────────────────────────────────

describe("AppProvider: workspace URLs transparent to router", () => {
  it("navigate to workspace URL does not change router path", () => {
    const { result } = renderHook(
      () => ({ nav: useNavigation(), loc: useLocation(), ws: useWorkspaces() }),
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.nav.navigate("/workspace/cam/uuid-123?title=Test");
    });
    // Router path should remain "/"
    expect(result.current.loc.path).toBe("/");
  });
});

// ─── persistence ──────────────────────────────────────────────────────────────

describe("AppProvider: workspace persistence", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("restores workspaces opened under a previous provider instance", async () => {
    const persistConfig = {
      adapter: "stack" as const,
      persist: { version: 1 },
    };

    const first = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: persistConfig }),
    });
    let openedId = "";
    await act(async () => {
      const d = await first.result.current.open({
        template: "cam",
        title: "Feed",
        params: { cameraId: "c1" },
      });
      openedId = d.id;
    });
    first.unmount();
    // Simulate returning to a route URL — direct workspace-URL access is a
    // separate flow tested in workspace-auth.test.tsx.
    window.history.replaceState(null, "", "/");

    const second = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: persistConfig }),
    });
    expect(second.result.current.workspaces.map((w) => w.id)).toEqual([openedId]);
    expect(second.result.current.workspaces[0]?.params).toEqual({ cameraId: "c1" });
  });

  it("starts fresh when the persisted version does not match", async () => {
    const first = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({
        config: { adapter: "stack", persist: { version: 1 } },
      }),
    });
    await act(async () => {
      await first.result.current.open({
        template: "cam",
        title: "Feed",
        params: { cameraId: "c1" },
      });
    });
    first.unmount();
    window.history.replaceState(null, "", "/");

    const second = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({
        config: { adapter: "stack", persist: { version: 2 } },
      }),
    });
    expect(second.result.current.workspaces).toEqual([]);
    expect(window.sessionStorage.getItem("ws:v1")).toBeNull();
  });
});

// ─── imperative navigate() ────────────────────────────────────────────────────

describe("AppProvider: imperative navigate()", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("navigates once a provider is mounted", () => {
    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <div />
      </AppProvider>,
    );
    act(() => { imperativeNavigate("/about"); });
    expect(window.location.pathname).toBe("/about");
  });

  it("is a no-op after the provider unmounts", () => {
    const { unmount } = render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <div />
      </AppProvider>,
    );
    unmount();
    act(() => { imperativeNavigate("/about"); });
    expect(window.location.pathname).toBe("/");
  });
});

// ─── config defaults for RouterView ───────────────────────────────────────────

describe("AppProvider: defaultLoading/defaultError reach RouterView via config", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("config.defaultLoading is shown for a suspending route without route-level loading", () => {
    const NeverResolves = React.lazy<React.ComponentType>(() => new Promise(() => {}));
    const lazyRoutes = defineRoutes({
      "/": { component: NeverResolves },
    });
    const { getByText } = render(
      <AppProvider
        routes={lazyRoutes}
        workspaces={workspaces}
        config={{ adapter: "stack", defaultLoading: <div>config-loading</div> }}
      >
        <RouterView />
      </AppProvider>,
    );
    expect(getByText("config-loading")).toBeTruthy();
  });

  it("config.defaultError is shown for a throwing route without route-level error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("boom"); };
    const errorRoutes = defineRoutes({
      "/": { component: Boom },
    });
    const { getByText } = render(
      <AppProvider
        routes={errorRoutes}
        workspaces={workspaces}
        config={{
          adapter: "stack",
          defaultError: ({ error }) => <div>config-error: {error.message}</div>,
        }}
      >
        <RouterView />
      </AppProvider>,
    );
    expect(getByText("config-error: boom")).toBeTruthy();
    spy.mockRestore();
  });

});

// ─── workspace navigation events ──────────────────────────────────────────────

describe("AppProvider: workspace NavigationEvents", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it('open() fires onNavigate with type "workspace-open" and to = origin route', async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onNavigate } }),
    });
    await act(async () => {
      await result.current.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
    });
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workspace-open", to: "/" }),
    );
  });

  it('open() fires onBeforeNavigate with type "workspace-open"', async () => {
    const onBeforeNavigate = vi.fn();
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onBeforeNavigate } }),
    });
    await act(async () => {
      await result.current.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
    });
    expect(onBeforeNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workspace-open" }),
    );
  });

  it('close() fires onNavigate with type "workspace-close" and to = origin route', async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper({ config: { adapter: "stack", onNavigate } }),
    });
    let id = "";
    await act(async () => {
      const d = await result.current.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
      id = d.id;
    });
    await act(async () => { await result.current.close(id); });
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "workspace-close", to: "/" }),
    );
  });
});

// ─── workspace close history semantics ────────────────────────────────────────

describe("AppProvider: workspace close history semantics", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("close() restores the origin route in the address bar", async () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), ws: useWorkspaces() }), {
      wrapper: makeWrapper(),
    });
    act(() => { result.current.nav.navigate("/about"); });
    let id = "";
    await act(async () => {
      const d = await result.current.ws.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
      id = d.id;
    });
    expect(window.location.pathname).toMatch(/^\/workspace\/cam\//);
    await act(async () => { await result.current.ws.close(id); });
    expect(window.location.pathname).toBe("/about");
  });

  it("close() does not modify the session stack — canGoBack reflects pre-open state", async () => {
    const { result } = renderHook(
      () => ({ nav: useNavigation(), loc: useLocation(), ws: useWorkspaces() }),
      { wrapper: makeWrapper() },
    );
    act(() => { result.current.nav.navigate("/about"); });
    expect(result.current.loc.canGoBack).toBe(true);
    let id = "";
    await act(async () => {
      const d = await result.current.ws.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
      id = d.id;
    });
    await act(async () => { await result.current.ws.close(id); });
    // Stack unchanged by open+close: exactly the one entry from "/" → "/about".
    expect(result.current.loc.canGoBack).toBe(true);
    act(() => { result.current.nav.back(); });
    expect(result.current.loc.canGoBack).toBe(false);
  });

  it("origin of a workspace opened while another workspace is focused is the route, not the workspace URL", async () => {
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    let idB = "";
    await act(async () => {
      await result.current.open({ template: "cam", title: "A", params: { cameraId: "a" } });
      const b = await result.current.open({ template: "cam", title: "B", params: { cameraId: "b" } });
      idB = b.id;
    });
    await act(async () => { await result.current.close(idB, false); });
    // Origin recorded for B must be the route "/", not workspace A's URL.
    expect(window.location.pathname).toBe("/");
  });
});

// ─── route guards ─────────────────────────────────────────────────────────────

describe("AppProvider: route guards", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  function guardedWrapper(guardedRoutes: Parameters<typeof defineRoutes>[0]) {
    const map = defineRoutes(guardedRoutes);
    return ({ children }: { children: React.ReactNode }) => (
      <AppProvider routes={map} workspaces={workspaces} config={{ adapter: "stack" }}>
        {children}
      </AppProvider>
    );
  }

  it("guard returning false blocks navigation", () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/admin": { component: () => null, guard: () => false },
      }),
    });
    act(() => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/");
    expect(window.location.pathname).toBe("/");
  });

  it("guard returning true allows navigation", () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/admin": { component: () => null, guard: () => true },
      }),
    });
    act(() => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/admin");
  });

  it("guard returning a string redirects to that path", () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/login": { component: () => null },
        "/admin": { component: () => null, guard: () => "/login" },
      }),
    });
    act(() => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/login");
    expect(window.location.pathname).toBe("/login");
  });

  it("async guard resolving true allows navigation", async () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/admin": { component: () => null, guard: async () => true },
      }),
    });
    await act(async () => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/admin");
  });

  it("async guard resolving false blocks navigation", async () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/admin": { component: () => null, guard: async () => false },
      }),
    });
    await act(async () => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/");
  });

  it("a rejected guard promise blocks navigation", async () => {
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/admin": { component: () => null, guard: () => Promise.reject(new Error("denied")) },
      }),
    });
    await act(async () => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/");
  });

  it("guard receives path params and a navigation context", () => {
    const guard = vi.fn(() => true);
    const { result } = renderHook(() => useNavigation(), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/camera/:id": { component: () => null, guard },
      }),
    });
    act(() => { result.current.navigate("/camera/cam-4"); });
    expect(guard).toHaveBeenCalledWith(
      { id: "cam-4" },
      expect.objectContaining({ path: "/", inWorkspace: false, currentWorkspace: null }),
    );
  });

  it("a parent route's guard also runs when navigating to a child", () => {
    const parentGuard = vi.fn(() => false);
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: guardedWrapper({
        "/": { component: () => null },
        "/settings": { component: () => null, guard: parentGuard },
        "/settings/profile": { component: () => null },
      }),
    });
    act(() => { result.current.nav.navigate("/settings/profile"); });
    expect(parentGuard).toHaveBeenCalled();
    expect(result.current.loc.path).toBe("/");
  });
});

// ─── transition semantics ─────────────────────────────────────────────────────

describe("AppProvider: transition semantics", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("previous route stays visible while a lazy route is loading, then swaps", async () => {
    let resolveLazy!: (m: { default: React.ComponentType }) => void;
    const DeferredLazy = React.lazy<React.ComponentType>(
      () => new Promise((res) => { resolveLazy = res; }),
    );
    const transRoutes = defineRoutes({
      "/": { component: () => <div>home-content</div> },
      "/slow": { component: DeferredLazy },
    });

    const Probe = () => {
      const { isTransitioning } = useLocation();
      const { navigate } = useNavigation();
      return (
        <div>
          <button onClick={() => navigate("/slow")}>go</button>
          <span data-testid="pending">{String(isTransitioning)}</span>
        </div>
      );
    };

    const { getByText, getByTestId, findByText, queryByText } = render(
      <AppProvider routes={transRoutes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <Probe />
        <RouterView />
      </AppProvider>,
    );
    expect(getByText("home-content")).toBeTruthy();

    act(() => { getByText("go").click(); });

    // Previous route still visible during the lazy load; transition pending.
    expect(getByText("home-content")).toBeTruthy();
    expect(getByTestId("pending").textContent).toBe("true");

    await act(async () => {
      resolveLazy({ default: () => <div>slow-content</div> });
    });

    expect(await findByText("slow-content")).toBeTruthy();
    expect(queryByText("home-content")).toBeNull();
    expect(getByTestId("pending").textContent).toBe("false");
  });

  it("isTransitioning is false for instant navigations", () => {
    const Probe = () => {
      const { isTransitioning, path } = useLocation();
      const { navigate } = useNavigation();
      return (
        <div>
          <button onClick={() => navigate("/about")}>go</button>
          <span data-testid="state">{path}:{String(isTransitioning)}</span>
        </div>
      );
    };
    const { getByText, getByTestId } = render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <Probe />
        <RouterView />
      </AppProvider>,
    );
    act(() => { getByText("go").click(); });
    expect(getByTestId("state").textContent).toBe("/about:false");
  });
});

// ─── route guards: edge branches ──────────────────────────────────────────────

describe("AppProvider: route guard edge cases", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("a guard that throws synchronously blocks navigation", () => {
    const map = defineRoutes({
      "/": { component: () => null },
      "/admin": { component: () => null, guard: () => { throw new Error("nope"); } },
    });
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: ({ children }) => (
        <AppProvider routes={map} workspaces={workspaces} config={{ adapter: "stack" }}>
          {children}
        </AppProvider>
      ),
    });
    act(() => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/");
  });

  it("an async guard resolving a string redirects", async () => {
    const map = defineRoutes({
      "/": { component: () => null },
      "/login": { component: () => null },
      "/admin": { component: () => null, guard: async () => "/login" },
    });
    const { result } = renderHook(() => ({ nav: useNavigation(), loc: useLocation() }), {
      wrapper: ({ children }) => (
        <AppProvider routes={map} workspaces={workspaces} config={{ adapter: "stack" }}>
          {children}
        </AppProvider>
      ),
    });
    await act(async () => { result.current.nav.navigate("/admin"); });
    expect(result.current.loc.path).toBe("/login");
  });
});

// ─── error boundary resets across route changes ───────────────────────────────

describe("AppProvider: error boundary resets on route change", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("an errored route does not leave its error UI behind after navigating away", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("kaboom"); };
    const map = defineRoutes({
      "/": { component: Boom },
      "/ok": { component: () => <div>ok-content</div> },
    });
    const Probe = () => {
      const { navigate } = useNavigation();
      return <button onClick={() => navigate("/ok")}>go-ok</button>;
    };
    const { getByText, findByText, queryByText } = render(
      <AppProvider routes={map} workspaces={workspaces} config={{ adapter: "stack" }}>
        <Probe />
        <RouterView />
      </AppProvider>,
    );
    expect(getByText("kaboom")).toBeTruthy();
    act(() => { getByText("go-ok").click(); });
    expect(await findByText("ok-content")).toBeTruthy();
    expect(queryByText("kaboom")).toBeNull();
    spy.mockRestore();
  });
});

// ─── router-only usage ────────────────────────────────────────────────────────

describe("AppProvider: router-only usage (no workspaces prop)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("routing works without a workspaces prop", () => {
    const Probe = () => {
      const { navigate } = useNavigation();
      const { path } = useLocation();
      return (
        <div>
          <button onClick={() => navigate("/about")}>go</button>
          <span data-testid="path">{path}</span>
        </div>
      );
    };
    const { getByText, getByTestId } = render(
      <AppProvider routes={routes}>
        <Probe />
        <RouterView />
      </AppProvider>,
    );
    expect(getByText("Home")).toBeTruthy();
    act(() => { getByText("go").click(); });
    expect(getByTestId("path").textContent).toBe("/about");
    expect(getByText("About")).toBeTruthy();
  });

  it("useWorkspaces() still works below a router-only provider (empty list)", () => {
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: ({ children }) => (
        <AppProvider routes={routes}>{children}</AppProvider>
      ),
    });
    expect(result.current.workspaces).toEqual([]);
  });
});
