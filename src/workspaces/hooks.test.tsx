import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspaces, useWorkspaceActions, useWorkspace, useWorkspaceChannel } from "./hooks";
import { shallowEqual } from "../utils/shallowEqual";
import { WorkspaceManagerContext } from "./context";
import { WorkspaceManager } from "./WorkspaceManager";
import { WorkspaceGuard } from "./auth/WorkspaceGuard";
import { StackAdapter } from "./adapters/StackAdapter";
import type { Bus, Channel, ChannelContract, NamespacedBus } from "@mikrostack/chbus";

// ─── chbus mock ───────────────────────────────────────────────────────────────

function makeChannel(): Channel<ChannelContract> {
  return {
    name: "mock",
    namespace: "mock",
    on: vi.fn(() => vi.fn()),
    emit: vi.fn(),
    onAsync: vi.fn(() => vi.fn()),
    emitAsync: vi.fn(),
    use: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Channel<ChannelContract>;
}

function makeMockBus(): Bus {
  const ns: NamespacedBus = {
    namespace: "ws",
    channel: vi.fn(() => makeChannel()),
  } as unknown as NamespacedBus;
  return {
    namespace: vi.fn(() => ns),
    channel: vi.fn(),
    onDebug: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Bus;
}

// ─── Test harness ─────────────────────────────────────────────────────────────

function makeManager() {
  const adapter = new StackAdapter();
  const guard = new WorkspaceGuard({ isAuthenticated: () => true });
  const navigate = vi.fn();
  const bus = makeMockBus();
  const templates = {
    cam: {
      component: () => null,
      auth: { type: "public" as const },
      schema: { cameraId: "string" as const },
    },
    secured: {
      component: () => null,
      auth: { type: "authenticated" as const },
    },
  };
  const manager = new WorkspaceManager({ adapter, guard, navigate, bus, templates });
  return { manager, navigate };
}

function wrapper(manager: WorkspaceManager) {
  return ({ children }: { children: React.ReactNode }) => (
    <WorkspaceManagerContext.Provider value={manager}>
      {children}
    </WorkspaceManagerContext.Provider>
  );
}

// ─── useWorkspaces ────────────────────────────────────────────────────────────

describe("useWorkspaces: initial state", () => {
  it("workspaces is empty initially", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    expect(result.current.workspaces).toHaveLength(0);
  });

  it("current is null initially", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    expect(result.current.current).toBeNull();
  });

  it("adapterType matches the injected adapter", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    expect(result.current.adapterType).toBe("stack");
  });
});

describe("useWorkspaces: open triggers re-render", () => {
  it("workspaces has length 1 after open()", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    await act(async () => {
      await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    expect(result.current.workspaces).toHaveLength(1);
  });

  it("current is set to opened workspace", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    await act(async () => {
      await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    expect(result.current.current?.template).toBe("cam");
  });
});

describe("useWorkspaces: close triggers re-render", () => {
  it("workspaces is empty after close()", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    await act(async () => {
      await result.current.close(d.id);
    });
    expect(result.current.workspaces).toHaveLength(0);
  });
});

describe("useWorkspaces: focus triggers re-render", () => {
  it("current updates after focus()", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d1: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    let d2: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d1 = await result.current.open({ template: "cam", title: "A", params: { cameraId: "c1" } });
      d2 = await result.current.open({ template: "cam", title: "B", params: { cameraId: "c2" } });
    });
    await act(async () => {
      await result.current.focus(d1.id);
    });
    expect(result.current.current?.id).toBe(d1.id);
  });
});

describe("useWorkspaces: updateParams triggers re-render", () => {
  it("workspace params update after updateParams()", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    act(() => {
      result.current.updateParams(d.id, { cameraId: "c99" });
    });
    expect(result.current.workspaces[0]?.params).toEqual({ cameraId: "c99" });
  });
});

describe("useWorkspaces: snapshot shape", () => {
  it("returns only state — actions live on useWorkspaceActions", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspaces(), { wrapper: wrapper(manager) });
    expect(Object.keys(result.current).sort()).toEqual(["adapterType", "current", "workspaces"]);
  });
});

// ─── useWorkspaces: selector ──────────────────────────────────────────────────

describe("useWorkspaces: selector", () => {
  it("returns the selected slice", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspaces((s) => s.workspaces.length), {
      wrapper: wrapper(manager),
    });
    expect(result.current).toBe(0);
    await act(async () => {
      await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    expect(result.current).toBe(1);
  });

  it("skips re-renders while the selected value is unchanged", async () => {
    const { manager } = makeManager();
    let d: Awaited<ReturnType<typeof manager.open>> = undefined!;
    await act(async () => {
      d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    let renderCount = 0;
    renderHook(
      () => { renderCount++; return useWorkspaces((s) => s.workspaces.length); },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    // updateTitle fires workspace:updated, but the length is unchanged.
    act(() => {
      manager.updateTitle(d.id, "Renamed");
    });

    expect(renderCount).toBe(countBefore);
  });

  it("re-renders when the selected value changes", async () => {
    const { manager } = makeManager();
    let renderCount = 0;
    const { result } = renderHook(
      () => { renderCount++; return useWorkspaces((s) => s.workspaces.length); },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    await act(async () => {
      await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    expect(renderCount).toBeGreaterThan(countBefore);
    expect(result.current).toBe(1);
  });

  it("a fresh-collection selector under the default Object.is never skips (the footgun)", async () => {
    const { manager } = makeManager();
    let d: Awaited<ReturnType<typeof manager.open>> = undefined!;
    await act(async () => {
      d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    let renderCount = 0;
    renderHook(
      () => { renderCount++; return useWorkspaces((s) => s.workspaces.map((w) => w.id)); },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    act(() => {
      manager.updateTitle(d.id, "Renamed");
    });

    // Same ids, but a fresh array each call — Object.is sees a change.
    expect(renderCount).toBeGreaterThan(countBefore);
  });

  it("shallowEqual as isEqual skips re-renders for derived collections", async () => {
    const { manager } = makeManager();
    let d: Awaited<ReturnType<typeof manager.open>> = undefined!;
    await act(async () => {
      d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    let renderCount = 0;
    renderHook(
      () => {
        renderCount++;
        return useWorkspaces((s) => s.workspaces.map((w) => w.id), shallowEqual);
      },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    act(() => {
      manager.updateTitle(d.id, "Renamed");
    });

    expect(renderCount).toBe(countBefore);
  });
});

// ─── useWorkspaceActions ──────────────────────────────────────────────────────

describe("useWorkspaceActions", () => {
  it("exposes actions and non-reactive readers", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspaceActions(), { wrapper: wrapper(manager) });
    expect(typeof result.current.open).toBe("function");
    expect(typeof result.current.focus).toBe("function");
    expect(typeof result.current.close).toBe("function");
    expect(typeof result.current.updateParams).toBe("function");
    expect(typeof result.current.updateTitle).toBe("function");
    expect(typeof result.current.getAll).toBe("function");
    expect(typeof result.current.getCurrent).toBe("function");
  });

  it("is referentially stable across re-renders", () => {
    const { manager } = makeManager();
    const { result, rerender } = renderHook(() => useWorkspaceActions(), {
      wrapper: wrapper(manager),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("does not re-render on workspace events", async () => {
    const { manager } = makeManager();
    let renderCount = 0;
    const { result } = renderHook(
      () => { renderCount++; return useWorkspaceActions(); },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });
    act(() => {
      result.current.updateTitle(d.id, "Renamed");
    });
    await act(async () => {
      await result.current.close(d.id);
    });

    expect(renderCount).toBe(countBefore);
  });

  it("getAll()/getCurrent() read live state at handler time", async () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspaceActions(), { wrapper: wrapper(manager) });
    expect(result.current.getAll()).toHaveLength(0);
    expect(result.current.getCurrent()).toBeNull();

    await act(async () => {
      await result.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    expect(result.current.getAll()).toHaveLength(1);
    expect(result.current.getCurrent()?.template).toBe("cam");
  });
});

// ─── useWorkspace ─────────────────────────────────────────────────────────────

describe("useWorkspace: unknown id", () => {
  it("returns null for unknown id", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspace("not-real"), { wrapper: wrapper(manager) });
    expect(result.current).toBeNull();
  });
});

describe("useWorkspace: known id", () => {
  it("returns non-null after workspace is opened with that id", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    const { result } = renderHook(() => useWorkspace(d.id), { wrapper: wrapper(manager) });
    expect(result.current).not.toBeNull();
    expect(result.current?.workspace.id).toBe(d.id);
    expect(result.current?.params).toEqual({ cameraId: "c1" });
  });

  it("does not expose a channel (use props or useWorkspaceChannel instead)", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    const { result } = renderHook(() => useWorkspace(d.id), { wrapper: wrapper(manager) });
    expect(result.current).toEqual({ workspace: expect.anything(), params: { cameraId: "c1" } });
  });
});

describe("useWorkspace: re-render selectivity", () => {
  it("re-renders when workspace:updated fires for this id", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    let renderCount = 0;
    const { result } = renderHook(
      () => { renderCount++; return useWorkspace(d.id); },
      { wrapper: wrapper(manager) },
    );
    const initialCount = renderCount;

    act(() => {
      wsResult.current.updateParams(d.id, { cameraId: "c99" });
    });

    expect(renderCount).toBeGreaterThan(initialCount);
    expect(result.current?.params).toEqual({ cameraId: "c99" });
  });

  it("does NOT re-render when a different workspace is updated", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d1: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    let d2: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d1 = await wsResult.current.open({ template: "cam", title: "A", params: { cameraId: "c1" } });
      d2 = await wsResult.current.open({ template: "cam", title: "B", params: { cameraId: "c2" } });
    });

    let renderCount = 0;
    renderHook(
      () => { renderCount++; return useWorkspace(d1.id); },
      { wrapper: wrapper(manager) },
    );
    const countBefore = renderCount;

    // Update d2 — should NOT trigger re-render for d1 hook
    act(() => {
      wsResult.current.updateParams(d2.id, { cameraId: "c99" });
    });

    expect(renderCount).toBe(countBefore);
  });
});

// ─── useWorkspaceChannel ──────────────────────────────────────────────────────

describe("useWorkspaceChannel: unknown id", () => {
  it("returns null for unknown workspace", () => {
    const { manager } = makeManager();
    const { result } = renderHook(() => useWorkspaceChannel("ghost"), { wrapper: wrapper(manager) });
    expect(result.current).toBeNull();
  });
});

describe("useWorkspaceChannel: open workspace", () => {
  it("returns { inbound, outbound } from root perspective after open", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    const { result } = renderHook(() => useWorkspaceChannel(d.id), { wrapper: wrapper(manager) });
    expect(result.current).not.toBeNull();
    expect(result.current?.outbound).toBeDefined();
    expect(result.current?.inbound).toBeDefined();
  });

  it("root.outbound is workspace.inbound (same physical channel)", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    const pair = manager.getChannel(d.id)!;
    const { result } = renderHook(() => useWorkspaceChannel(d.id), { wrapper: wrapper(manager) });
    expect(result.current?.outbound).toBe(pair.workspace.inbound);
  });
});

describe("useWorkspaceChannel: after close", () => {
  it("becomes null after the workspace is closed", async () => {
    const { manager } = makeManager();
    const { result: wsResult } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), { wrapper: wrapper(manager) });
    let d: Awaited<ReturnType<typeof wsResult.current.open>> = undefined!;
    await act(async () => {
      d = await wsResult.current.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    });

    const { result } = renderHook(() => useWorkspaceChannel(d.id), { wrapper: wrapper(manager) });
    expect(result.current).not.toBeNull();

    await act(async () => {
      await wsResult.current.close(d.id);
    });

    expect(result.current).toBeNull();
  });
});
