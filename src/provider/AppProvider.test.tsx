import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { AppProvider } from "./AppProvider";
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
