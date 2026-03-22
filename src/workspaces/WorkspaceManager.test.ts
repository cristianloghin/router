import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceManager } from "./WorkspaceManager";
import { WorkspaceGuard } from "./auth/WorkspaceGuard";
import { WorkspaceError } from "./types";
import type {
  WorkspaceAdapter,
  WorkspaceDescriptor,
  WorkspaceEvent,
  WorkspaceParams,
} from "./types";
import { createDescriptor } from "./defineWorkspaces";
import type { Bus, Channel, ChannelContract, NamespacedBus } from "@mikrostack/chbus";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDescriptor(id = "ws-1", template = "cam", params: WorkspaceParams = { cameraId: "c1" }): WorkspaceDescriptor {
  const d = createDescriptor(template, params, "Test Cam");
  return { ...d, id };
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────

function makeMockAdapter(initial: WorkspaceDescriptor[] = []): WorkspaceAdapter & {
  _workspaces: WorkspaceDescriptor[];
  _listeners: ((e: WorkspaceEvent) => void)[];
  _emit(e: WorkspaceEvent): void;
} {
  const _workspaces: WorkspaceDescriptor[] = [...initial];
  const _listeners: ((e: WorkspaceEvent) => void)[] = [];

  const adapter = {
    type: "stack" as const,
    _workspaces,
    _listeners,
    _emit(e: WorkspaceEvent) { for (const l of _listeners) l(e); },

    open: vi.fn(async (d: WorkspaceDescriptor) => {
      _workspaces.push(d);
    }),
    close: vi.fn(async (id: string) => {
      const idx = _workspaces.findIndex((w) => w.id === id);
      if (idx !== -1) _workspaces.splice(idx, 1);
    }),
    focus: vi.fn(async () => {}),
    updateParams: vi.fn((id: string, params: WorkspaceParams) => {
      const w = _workspaces.find((x) => x.id === id);
      if (w) w.params = params;
    }),
    updateTitle: vi.fn((id: string, title: string) => {
      const w = _workspaces.find((x) => x.id === id);
      if (w) w.title = title;
    }),
    getAll: vi.fn(() => [..._workspaces]),
    getCurrent: vi.fn(() => _workspaces[_workspaces.length - 1] ?? null),
    restoreState: vi.fn(),
    subscribe: vi.fn((listener: (e: WorkspaceEvent) => void) => {
      _listeners.push(listener);
      return () => {
        const i = _listeners.indexOf(listener);
        if (i !== -1) _listeners.splice(i, 1);
      };
    }),
  };

  return adapter;
}

// ─── Mock chbus ───────────────────────────────────────────────────────────────

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

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeManager(opts: {
  initialWorkspaces?: WorkspaceDescriptor[];
  isAuthenticated?: () => boolean | Promise<boolean>;
  maxInstances?: number;
  navigate?: ReturnType<typeof vi.fn>;
} = {}) {
  const adapter = makeMockAdapter(opts.initialWorkspaces ?? []);
  const guard = new WorkspaceGuard({ isAuthenticated: opts.isAuthenticated ?? (() => true) });
  const navigate = opts.navigate ?? vi.fn();
  const bus = makeMockBus();
  const templates = {
    cam: {
      component: () => null,
      auth: { type: "public" as const },
      ...(opts.maxInstances !== undefined ? { maxInstances: opts.maxInstances } : {}),
      schema: { cameraId: "string" as const },
    },
    secured: {
      component: () => null,
      auth: { type: "authenticated" as const },
    },
  };
  const manager = new WorkspaceManager({ adapter, guard, navigate, bus, templates });
  return { manager, adapter, navigate, bus };
}

// ─── open ─────────────────────────────────────────────────────────────────────

describe("WorkspaceManager: open — auth passes", () => {
  it("calls adapter.open with a descriptor", async () => {
    const { manager, adapter } = makeManager();
    await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(adapter.open).toHaveBeenCalledOnce();
  });

  it("resolves with the WorkspaceDescriptor", async () => {
    const { manager } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(d.template).toBe("cam");
    expect(d.title).toBe("Feed");
    expect(d.params).toEqual({ cameraId: "c1" });
  });

  it("navigates to the workspace URL", async () => {
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toContain(`/workspace/cam/${d.id}`);
  });

  it("URL includes title as query param", async () => {
    const { manager, navigate } = makeManager();
    await manager.open({ template: "cam", title: "My Feed", params: { cameraId: "c1" } });
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toContain("title=");
  });

  it("URL includes workspace params as query params", async () => {
    const { manager, navigate } = makeManager();
    await manager.open({ template: "cam", title: "Feed", params: { cameraId: "cam-42" } });
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toContain("cameraId=cam-42");
  });

  it("navigate is called with state containing workspaceId", async () => {
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const [, opts] = navigate.mock.calls[0] as [string, { state?: { workspaceId?: string } }];
    expect(opts?.state?.workspaceId).toBe(d.id);
  });
});

describe("WorkspaceManager: open — auth fails", () => {
  it("rejects with WorkspaceError(AUTH_FAILED) when guard denies", async () => {
    const { manager } = makeManager({ isAuthenticated: () => false });
    await expect(
      manager.open({ template: "secured", title: "Secure", params: {} })
    ).rejects.toThrow(WorkspaceError);
  });

  it("error code is AUTH_FAILED", async () => {
    const { manager } = makeManager({ isAuthenticated: () => false });
    try {
      await manager.open({ template: "secured", title: "Secure", params: {} });
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceError);
      expect((err as WorkspaceError).code).toBe("AUTH_FAILED");
    }
  });

  it("does not call adapter.open when auth fails", async () => {
    const { manager, adapter } = makeManager({ isAuthenticated: () => false });
    await manager.open({ template: "secured", title: "S", params: {} }).catch(() => {});
    expect(adapter.open).not.toHaveBeenCalled();
  });
});

describe("WorkspaceManager: open — maxInstances", () => {
  it("rejects with MAX_INSTANCES_REACHED when at capacity", async () => {
    const existing = [makeDescriptor("ws-existing", "cam")];
    const { manager } = makeManager({ initialWorkspaces: existing, maxInstances: 1 });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c2" } })
    ).rejects.toThrow(WorkspaceError);
  });

  it("error code is MAX_INSTANCES_REACHED", async () => {
    const existing = [makeDescriptor("ws-existing", "cam")];
    const { manager } = makeManager({ initialWorkspaces: existing, maxInstances: 1 });
    try {
      await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c2" } });
    } catch (err) {
      expect((err as WorkspaceError).code).toBe("MAX_INSTANCES_REACHED");
    }
  });

  it("allows open when below maxInstances", async () => {
    const { manager } = makeManager({ initialWorkspaces: [], maxInstances: 2 });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } })
    ).resolves.toBeDefined();
  });
});

// ─── focus ────────────────────────────────────────────────────────────────────

describe("WorkspaceManager: focus", () => {
  it("calls adapter.focus with the id", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    await manager.focus("ws-1");
    expect(adapter.focus).toHaveBeenCalledWith("ws-1");
  });

  it("calls navigate after focusing", async () => {
    const d = makeDescriptor("ws-1", "cam");
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    await manager.focus("ws-1");
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("navigates to the workspace URL", async () => {
    const d = makeDescriptor("ws-1", "cam");
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    await manager.focus("ws-1");
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toContain("/workspace/cam/ws-1");
  });

  it("resolves with the WorkspaceDescriptor", async () => {
    const d = makeDescriptor("ws-1");
    const { manager } = makeManager({ initialWorkspaces: [d] });
    const result = await manager.focus("ws-1");
    expect(result.id).toBe("ws-1");
  });

  it("rejects with WORKSPACE_NOT_FOUND for unknown id", async () => {
    const { manager } = makeManager();
    await expect(manager.focus("does-not-exist")).rejects.toThrow(WorkspaceError);
  });

  it("error code is WORKSPACE_NOT_FOUND", async () => {
    const { manager } = makeManager();
    try {
      await manager.focus("ghost");
    } catch (err) {
      expect((err as WorkspaceError).code).toBe("WORKSPACE_NOT_FOUND");
    }
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("WorkspaceManager: close", () => {
  it("calls adapter.close with id and autoFocus", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    await manager.close("ws-1", false);
    expect(adapter.close).toHaveBeenCalledWith("ws-1", false);
  });

  it("defaults autoFocus to true", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    await manager.close("ws-1");
    expect(adapter.close).toHaveBeenCalledWith("ws-1", true);
  });

  it("calls navigate after closing", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    await manager.close("ws-1");
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("navigates back to origin stored at open time", async () => {
    window.history.replaceState(null, "", "/dashboard");
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    navigate.mockClear();
    await manager.close(d.id);
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toBe("/dashboard");
  });

  it("navigates to '/' when no origin is stored", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    // No open() was called, so no stored origin
    await manager.close("ws-1");
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toBe("/");
  });

  it("destroys the workspace channel", async () => {
    const { manager, bus } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const pair = manager.getChannel(d.id);
    expect(pair).not.toBeNull();
    await manager.close(d.id);
    expect(manager.getChannel(d.id)).toBeNull();
  });

  it("rejects with WORKSPACE_NOT_FOUND for unknown id", async () => {
    const { manager } = makeManager();
    await expect(manager.close("ghost")).rejects.toThrow(WorkspaceError);
  });

  it("error code is WORKSPACE_NOT_FOUND", async () => {
    const { manager } = makeManager();
    try {
      await manager.close("ghost");
    } catch (err) {
      expect((err as WorkspaceError).code).toBe("WORKSPACE_NOT_FOUND");
    }
  });
});

// ─── channel ──────────────────────────────────────────────────────────────────

describe("WorkspaceManager: channel management", () => {
  it("getChannel returns null for unknown workspace", () => {
    const { manager } = makeManager();
    expect(manager.getChannel("unknown")).toBeNull();
  });

  it("getChannel returns the pair after open()", async () => {
    const { manager } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const pair = manager.getChannel(d.id);
    expect(pair).not.toBeNull();
    expect(pair?.workspace.inbound).toBeDefined();
    expect(pair?.workspace.outbound).toBeDefined();
  });

  it("workspace.inbound and root.outbound are the same channel", async () => {
    const { manager } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const pair = manager.getChannel(d.id)!;
    expect(pair.workspace.inbound).toBe(pair.root.outbound);
  });

  it("workspace.outbound and root.inbound are the same channel", async () => {
    const { manager } = makeManager();
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const pair = manager.getChannel(d.id)!;
    expect(pair.workspace.outbound).toBe(pair.root.inbound);
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────────

describe("WorkspaceManager: updateParams", () => {
  it("calls adapter.updateParams", () => {
    const d = makeDescriptor("ws-1", "cam", { cameraId: "old" });
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    manager.updateParams("ws-1", { cameraId: "new" });
    expect(adapter.updateParams).toHaveBeenCalledWith("ws-1", { cameraId: "new" });
  });

  it("calls navigate with replace:true", () => {
    const d = makeDescriptor("ws-1", "cam", { cameraId: "old" });
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    manager.updateParams("ws-1", { cameraId: "new" });
    const [, opts] = navigate.mock.calls[0] as [string, { replace?: boolean }];
    expect(opts?.replace).toBe(true);
  });

  it("throws WORKSPACE_NOT_FOUND for unknown id", () => {
    const { manager } = makeManager();
    expect(() => manager.updateParams("ghost", { cameraId: "x" })).toThrow(WorkspaceError);
    try {
      manager.updateParams("ghost", { cameraId: "x" });
    } catch (err) {
      expect((err as WorkspaceError).code).toBe("WORKSPACE_NOT_FOUND");
    }
  });
});

// ─── updateTitle ──────────────────────────────────────────────────────────────

describe("WorkspaceManager: updateTitle", () => {
  it("calls adapter.updateTitle", () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    manager.updateTitle("ws-1", "New Title");
    expect(adapter.updateTitle).toHaveBeenCalledWith("ws-1", "New Title");
  });

  it("returns the updated descriptor", () => {
    const d = makeDescriptor("ws-1");
    const { manager } = makeManager({ initialWorkspaces: [d] });
    const updated = manager.updateTitle("ws-1", "New Title");
    expect(updated.title).toBe("New Title");
  });
});

// ─── delegation ───────────────────────────────────────────────────────────────

describe("WorkspaceManager: getAll / getCurrent / subscribe", () => {
  it("getAll delegates to adapter", () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    manager.getAll();
    expect(adapter.getAll).toHaveBeenCalled();
  });

  it("getCurrent delegates to adapter", () => {
    const d = makeDescriptor("ws-1");
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    manager.getCurrent();
    expect(adapter.getCurrent).toHaveBeenCalled();
  });

  it("subscribe delegates to adapter and returns unsubscribe", () => {
    const { manager, adapter } = makeManager();
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);
    expect(adapter.subscribe).toHaveBeenCalled();
    expect(typeof unsub).toBe("function");
  });

  it("adapterType matches the adapter type", () => {
    const { manager } = makeManager();
    expect(manager.adapterType).toBe("stack");
  });
});

// ─── event passthrough ────────────────────────────────────────────────────────

describe("WorkspaceManager: event passthrough", () => {
  it("passes workspace:opened events to manager subscribers", async () => {
    const { manager, adapter } = makeManager();
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));

    const d = makeDescriptor("ws-1");
    adapter._emit({ type: "workspace:opened", workspace: d });

    expect(events.some((e) => e.type === "workspace:opened")).toBe(true);
  });

  it("passes workspace:closed events to manager subscribers", () => {
    const { manager, adapter } = makeManager();
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));

    adapter._emit({ type: "workspace:closed", workspaceId: "ws-1" });

    expect(events.some((e) => e.type === "workspace:closed")).toBe(true);
  });

  it("passes workspace:focused events to manager subscribers", () => {
    const { manager, adapter } = makeManager();
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));

    adapter._emit({ type: "workspace:focused", workspaceId: "ws-1" });

    expect(events.some((e) => e.type === "workspace:focused")).toBe(true);
  });

  it("passes workspace:updated events to manager subscribers", () => {
    const { manager, adapter } = makeManager();
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));

    const d = makeDescriptor("ws-1");
    adapter._emit({ type: "workspace:updated", workspace: d });

    expect(events.some((e) => e.type === "workspace:updated")).toBe(true);
  });
});

// ─── bus exposure ─────────────────────────────────────────────────────────────

describe("WorkspaceManager: bus", () => {
  it("exposes the bus passed at construction", () => {
    const { manager, bus } = makeManager();
    expect(manager.bus).toBe(bus);
  });
});

// ─── URL format ───────────────────────────────────────────────────────────────

describe("WorkspaceManager: URL format", () => {
  it("URL follows /workspace/{template}/{id}?title=...&{...params}", async () => {
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "Test", params: { cameraId: "abc" } });
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`^/workspace/cam/${d.id}\\?`));
  });
});
