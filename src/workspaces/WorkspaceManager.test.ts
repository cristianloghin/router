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

function makeMockAdapter(
  initial: WorkspaceDescriptor[] = [],
  type: WorkspaceAdapter["type"] = "stack",
): WorkspaceAdapter & {
  _workspaces: WorkspaceDescriptor[];
  _listeners: ((e: WorkspaceEvent) => void)[];
  _emit(e: WorkspaceEvent): void;
} {
  const _workspaces: WorkspaceDescriptor[] = [...initial];
  const _listeners: ((e: WorkspaceEvent) => void)[] = [];
  const emit = (e: WorkspaceEvent) => { for (const l of _listeners) l(e); };

  const adapter = {
    type,
    _workspaces,
    _listeners,
    _emit: emit,

    open: vi.fn(async (d: WorkspaceDescriptor) => {
      _workspaces.push(d);
      emit({ type: "workspace:opened", workspace: d });
    }),
    close: vi.fn(async (id: string) => {
      const idx = _workspaces.findIndex((w) => w.id === id);
      if (idx !== -1) _workspaces.splice(idx, 1);
      emit({ type: "workspace:closed", workspaceId: id });
    }),
    focus: vi.fn(async (id: string) => {
      emit({ type: "workspace:focused", workspaceId: id });
    }),
    updateParams: vi.fn((id: string, params: WorkspaceParams) => {
      const w = _workspaces.find((x) => x.id === id);
      if (w) {
        w.params = params;
        emit({ type: "workspace:updated", workspace: { ...w } });
      }
    }),
    updateTitle: vi.fn((id: string, title: string) => {
      const w = _workspaces.find((x) => x.id === id);
      if (w) {
        w.title = title;
        emit({ type: "workspace:updated", workspace: { ...w } });
      }
    }),
    getAll: vi.fn(() => [..._workspaces]),
    getCurrent: vi.fn(() => _workspaces[_workspaces.length - 1] ?? null),
    restoreState: vi.fn((descriptors: WorkspaceDescriptor[]) => {
      _workspaces.push(...descriptors);
    }),
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
  persist?: { version: number };
  maxWorkspaces?: number;
  getCurrentPath?: () => string;
  adapterType?: WorkspaceAdapter["type"];
} = {}) {
  const adapter = makeMockAdapter(opts.initialWorkspaces ?? [], opts.adapterType ?? "stack");
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
  const manager = new WorkspaceManager({
    adapter,
    guard,
    navigate,
    bus,
    templates,
    ...(opts.persist !== undefined ? { persist: opts.persist } : {}),
    ...(opts.maxWorkspaces !== undefined ? { maxWorkspaces: opts.maxWorkspaces } : {}),
    ...(opts.getCurrentPath !== undefined ? { getCurrentPath: opts.getCurrentPath } : {}),
  });
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

describe("WorkspaceManager: open — explicit origin", () => {
  it("replace-navigates to the origin route before pushing the workspace URL", async () => {
    const { manager, navigate } = makeManager();
    const d = await manager.open({
      template: "cam",
      title: "Feed",
      params: { cameraId: "c1" },
      origin: "/",
    });
    expect(navigate.mock.calls.length).toBe(2);
    const [originUrl, originOpts] = navigate.mock.calls[0] as [string, { replace?: boolean }];
    expect(originUrl).toBe("/");
    expect(originOpts?.replace).toBe(true);
    const [wsUrl] = navigate.mock.calls[1] as [string];
    expect(wsUrl).toContain(`/workspace/cam/${d.id}`);
  });

  it("close() returns to the explicit origin, not the launching route", async () => {
    const { manager, navigate } = makeManager({ getCurrentPath: () => "/create-workspace" });
    const d = await manager.open({
      template: "cam",
      title: "Feed",
      params: { cameraId: "c1" },
      origin: "/",
    });
    navigate.mockClear();
    await manager.close(d.id);
    const [closeUrl] = navigate.mock.calls[0] as [string];
    expect(closeUrl).toBe("/");
  });

  it("does not touch the route when auth rejects the open", async () => {
    const { manager, navigate } = makeManager({ isAuthenticated: () => false });
    await expect(
      manager.open({ template: "secured", title: "S", params: {}, origin: "/" }),
    ).rejects.toThrow(WorkspaceError);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("without origin, the origin is the current route (unchanged behavior)", async () => {
    const { manager, navigate } = makeManager({ getCurrentPath: () => "/somewhere" });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(navigate.mock.calls.length).toBe(1);
    navigate.mockClear();
    await manager.close(d.id);
    const [closeUrl] = navigate.mock.calls[0] as [string];
    expect(closeUrl).toBe("/somewhere");
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

  it("merges partial params — unmentioned keys are preserved", () => {
    const d = makeDescriptor("ws-1", "cam", { cameraId: "cam-002", quality: "1080" });
    const { manager, adapter } = makeManager({ initialWorkspaces: [d] });
    const updated = manager.updateParams("ws-1", { quality: "720" });
    expect(adapter.updateParams).toHaveBeenCalledWith("ws-1", {
      cameraId: "cam-002",
      quality: "720",
    });
    expect(updated.params).toEqual({ cameraId: "cam-002", quality: "720" });
  });

  it("syncs the merged params (not just the patch) to the URL", () => {
    // "secured" has no schema, so buildUrl serializes every param.
    const d = makeDescriptor("ws-1", "secured", { cameraId: "cam-002", quality: "1080" });
    const { manager, navigate } = makeManager({ initialWorkspaces: [d] });
    manager.updateParams("ws-1", { quality: "720" });
    const [url] = navigate.mock.calls[0] as [string];
    expect(url).toContain("cameraId=cam-002");
    expect(url).toContain("quality=720");
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

// ─── persistence ──────────────────────────────────────────────────────────────

interface PersistedShape {
  workspaces: WorkspaceDescriptor[];
  currentId: string | null;
  origins: Record<string, string>;
}

function readPersisted(version: number): PersistedShape | null {
  const raw = window.sessionStorage.getItem(`ws:v${version}`);
  return raw ? (JSON.parse(raw) as PersistedShape) : null;
}

describe("WorkspaceManager: persistence — writing", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/alerts");
  });

  it("does not write to sessionStorage when persist is not configured", async () => {
    const { manager } = makeManager();
    await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("writes descriptors to ws:v{version} after open()", async () => {
    const { manager } = makeManager({ persist: { version: 1 } });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    const stored = readPersisted(1);
    expect(stored?.workspaces.map((w) => w.id)).toEqual([d.id]);
  });

  it("persists the origin path captured at open() time", async () => {
    const { manager } = makeManager({ persist: { version: 1 } });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(readPersisted(1)?.origins[d.id]).toBe("/alerts");
  });

  it("persists the current focus id", async () => {
    const { manager } = makeManager({ persist: { version: 1 } });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(readPersisted(1)?.currentId).toBe(d.id);
  });

  it("updates stored params after updateParams()", async () => {
    const { manager } = makeManager({ persist: { version: 1 } });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    manager.updateParams(d.id, { cameraId: "c2" });
    expect(readPersisted(1)?.workspaces[0]?.params).toEqual({ cameraId: "c2" });
  });

  it("removes the workspace from storage after close()", async () => {
    const { manager } = makeManager({ persist: { version: 1 } });
    const d = await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    await manager.close(d.id);
    expect(readPersisted(1)?.workspaces).toEqual([]);
  });
});

describe("WorkspaceManager: persistence — restoring", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  function seed(version: number, state: PersistedShape): void {
    window.sessionStorage.setItem(`ws:v${version}`, JSON.stringify(state));
  }

  it("restores stored descriptors via adapter.restoreState on construction", () => {
    const d = makeDescriptor("ws-r1");
    seed(1, { workspaces: [d], currentId: d.id, origins: { [d.id]: "/alerts" } });
    const { adapter } = makeManager({ persist: { version: 1 } });
    expect(adapter.restoreState).toHaveBeenCalledOnce();
    const [restored] = (adapter.restoreState as ReturnType<typeof vi.fn>).mock.calls[0] as [WorkspaceDescriptor[]];
    expect(restored.map((w) => w.id)).toEqual(["ws-r1"]);
  });

  it("recreates a channel for each restored workspace", () => {
    const d = makeDescriptor("ws-r1");
    seed(1, { workspaces: [d], currentId: d.id, origins: {} });
    const { manager } = makeManager({ persist: { version: 1 } });
    expect(manager.getChannel("ws-r1")).not.toBeNull();
  });

  it("re-focuses the persisted current workspace", () => {
    const a = makeDescriptor("ws-a");
    const b = makeDescriptor("ws-b");
    seed(1, { workspaces: [a, b], currentId: "ws-a", origins: {} });
    const { adapter } = makeManager({ persist: { version: 1 } });
    expect(adapter.focus).toHaveBeenCalledWith("ws-a");
  });

  it("close() after restore navigates to the persisted origin", async () => {
    const d = makeDescriptor("ws-r1");
    seed(1, { workspaces: [d], currentId: d.id, origins: { [d.id]: "/alerts" } });
    const { manager, navigate } = makeManager({ persist: { version: 1 } });
    await manager.close("ws-r1");
    expect(navigate).toHaveBeenCalledWith("/alerts", { navType: "workspace-close" });
  });

  it("discards stored state under a different version key", () => {
    const d = makeDescriptor("ws-old");
    seed(1, { workspaces: [d], currentId: d.id, origins: {} });
    const { adapter } = makeManager({ persist: { version: 2 } });
    expect(adapter.restoreState).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("ws:v1")).toBeNull();
  });

  it("discards corrupt JSON without throwing", () => {
    window.sessionStorage.setItem("ws:v1", "{not json");
    const { adapter } = makeManager({ persist: { version: 1 } });
    expect(adapter.restoreState).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("ws:v1")).toBeNull();
  });

  it("skips restored workspaces whose template no longer exists", () => {
    const known = makeDescriptor("ws-known", "cam");
    const unknown = makeDescriptor("ws-unknown", "goneTemplate");
    seed(1, { workspaces: [known, unknown], currentId: null, origins: {} });
    const { adapter } = makeManager({ persist: { version: 1 } });
    const [restored] = (adapter.restoreState as ReturnType<typeof vi.fn>).mock.calls[0] as [WorkspaceDescriptor[]];
    expect(restored.map((w) => w.id)).toEqual(["ws-known"]);
  });

  it("round-trips: state persisted by one manager is restored by the next", async () => {
    const first = makeManager({ persist: { version: 3 } });
    const d = await first.manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });

    const second = makeManager({ persist: { version: 3 } });
    expect(second.manager.getAll().map((w) => w.id)).toEqual([d.id]);
    expect(second.manager.getChannel(d.id)).not.toBeNull();
  });
});

describe("WorkspaceManager: persistence — storage unavailable", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("degrades to no persistence when sessionStorage access throws", async () => {
    const spy = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    const { manager } = makeManager({ persist: { version: 1 } });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } }),
    ).resolves.toBeDefined();
    spy.mockRestore();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("ignores setItem failures (quota exceeded)", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { manager } = makeManager({ persist: { version: 1 } });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } }),
    ).resolves.toBeDefined();
    spy.mockRestore();
  });
});

// ─── maxWorkspaces ────────────────────────────────────────────────────────────

describe("WorkspaceManager: maxWorkspaces", () => {
  it("rejects with MAX_WORKSPACES_REACHED when the global limit is reached", async () => {
    const existing = [makeDescriptor("ws-a"), makeDescriptor("ws-b")];
    const { manager } = makeManager({ initialWorkspaces: existing, maxWorkspaces: 2 });
    try {
      await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
      expect.unreachable("open() should have rejected");
    } catch (err) {
      expect((err as WorkspaceError).code).toBe("MAX_WORKSPACES_REACHED");
    }
  });

  it("allows opening below the limit", async () => {
    const { manager } = makeManager({ initialWorkspaces: [makeDescriptor("ws-a")], maxWorkspaces: 2 });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } }),
    ).resolves.toBeDefined();
  });

  it("defaults the limit to 10", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => makeDescriptor(`ws-${i}`));
    const { manager } = makeManager({ initialWorkspaces: ten });
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } }),
    ).rejects.toMatchObject({ code: "MAX_WORKSPACES_REACHED" });
  });
});

// ─── manager-originated events ────────────────────────────────────────────────

describe("WorkspaceManager: workspace:auth-failed and workspace:error events", () => {
  it("emits workspace:auth-failed to subscribers when the guard denies open()", async () => {
    const { manager } = makeManager({ isAuthenticated: () => false });
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));
    await manager.open({ template: "secured", title: "S", params: {} }).catch(() => {});
    expect(events).toEqual([
      expect.objectContaining({ type: "workspace:auth-failed", rule: { type: "authenticated" } }),
    ]);
  });

  it("unsubscribe stops manager-originated events", async () => {
    const { manager } = makeManager({ isAuthenticated: () => false });
    const events: WorkspaceEvent[] = [];
    const unsub = manager.subscribe((e) => events.push(e));
    unsub();
    await manager.open({ template: "secured", title: "S", params: {} }).catch(() => {});
    expect(events).toEqual([]);
  });

  it("open() wraps an adapter failure in WorkspaceError(ADAPTER_ERROR) and emits workspace:error", async () => {
    const { manager, adapter } = makeManager();
    (adapter.open as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("disk full"));
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));
    await expect(
      manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } }),
    ).rejects.toMatchObject({ code: "ADAPTER_ERROR" });
    expect(events).toEqual([
      expect.objectContaining({ type: "workspace:error", error: expect.any(Error) }),
    ]);
  });

  it("open() cleans up the channel when the adapter fails", async () => {
    const { manager, adapter } = makeManager();
    (adapter.open as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nope"));
    let failedId = "";
    await manager
      .open({ template: "cam", title: "Feed", params: { cameraId: "c1" } })
      .catch((err: WorkspaceError) => { failedId = err.workspaceId ?? ""; });
    expect(failedId).not.toBe("");
    expect(manager.getChannel(failedId)).toBeNull();
  });

  it("focus() wraps an adapter failure in ADAPTER_ERROR", async () => {
    const existing = [makeDescriptor("ws-1")];
    const { manager, adapter } = makeManager({ initialWorkspaces: existing });
    (adapter.focus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nope"));
    await expect(manager.focus("ws-1")).rejects.toMatchObject({ code: "ADAPTER_ERROR" });
  });

  it("close() wraps an adapter failure in ADAPTER_ERROR", async () => {
    const existing = [makeDescriptor("ws-1")];
    const { manager, adapter } = makeManager({ initialWorkspaces: existing });
    (adapter.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nope"));
    await expect(manager.close("ws-1")).rejects.toMatchObject({ code: "ADAPTER_ERROR" });
  });
});

// ─── retryAuth ────────────────────────────────────────────────────────────────

describe("WorkspaceManager: retryAuth", () => {
  it("throws WORKSPACE_NOT_FOUND for an unknown id", async () => {
    const { manager } = makeManager();
    await expect(manager.retryAuth("nope")).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
    });
  });

  it("emits workspace:auth-failed when the retry is denied", async () => {
    const secured = makeDescriptor("ws-sec", "secured", {});
    const { manager } = makeManager({
      initialWorkspaces: [secured],
      isAuthenticated: () => false,
    });
    const events: WorkspaceEvent[] = [];
    manager.subscribe((e) => events.push(e));
    await manager.retryAuth("ws-sec");
    expect(events).toEqual([
      expect.objectContaining({ type: "workspace:auth-failed", workspaceId: "ws-sec" }),
    ]);
  });

  it("grants auth and emits workspace:updated when the retry succeeds", async () => {
    const secured = makeDescriptor("ws-sec", "secured", {});
    (secured.auth as { granted: boolean }).granted = false;
    const { manager } = makeManager({
      initialWorkspaces: [secured],
      isAuthenticated: () => true,
    });
    await manager.retryAuth("ws-sec");
    expect(manager.getAll().find((w) => w.id === "ws-sec")?.auth.granted).toBe(true);
  });
});

// ─── close(): history.state is authoritative ─────────────────────────────────

describe("WorkspaceManager: close origin from history.state", () => {
  it("prefers window.history.state.origin when it belongs to the closing workspace", async () => {
    window.history.replaceState({ origin: "/from-state", workspaceId: "ws-1" }, "", "/workspace/cam/ws-1");
    const { manager, navigate } = makeManager({ initialWorkspaces: [makeDescriptor("ws-1")] });
    await manager.close("ws-1");
    expect(navigate).toHaveBeenCalledWith("/from-state", { navType: "workspace-close" });
    window.history.replaceState(null, "", "/");
  });

  it("falls back to the in-memory origin when history.state belongs to another workspace", async () => {
    window.history.replaceState({ origin: "/other", workspaceId: "ws-other" }, "", "/");
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
    await manager.close(d.id);
    expect(navigate).toHaveBeenLastCalledWith("/", { navType: "workspace-close" });
    window.history.replaceState(null, "", "/");
  });
});

// ─── direct access without a schema ───────────────────────────────────────────

describe("WorkspaceManager: direct access without schema", () => {
  it("treats all URL params as strings when the template has no schema", () => {
    window.history.replaceState(null, "", "/workspace/secured/plain-1?title=P&mode=live&count=3");
    const { manager } = makeManager({ isAuthenticated: () => true });
    const ws = manager.getAll().find((w) => w.id === "plain-1");
    expect(ws?.params).toEqual({ mode: "live", count: "3" });
    window.history.replaceState(null, "", "/");
  });
});

// ─── updateParams URL guard (pre-adoption plan item 5d) ──────────────────────

describe("WorkspaceManager: updateParams URL guard", () => {
  it("replace-navigates when the updated workspace is current", async () => {
    const { manager, navigate } = makeManager();
    const d = await manager.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
    navigate.mockClear();
    manager.updateParams(d.id, { cameraId: "c2" });
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("cameraId=c2"), { replace: true });
  });

  it("does not navigate when updating a background workspace", async () => {
    const { manager, navigate } = makeManager();
    const background = await manager.open({ template: "cam", title: "A", params: { cameraId: "a" } });
    await manager.open({ template: "cam", title: "B", params: { cameraId: "b" } });
    navigate.mockClear();
    manager.updateParams(background.id, { cameraId: "a2" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("still returns the updated descriptor for a background workspace", async () => {
    const { manager } = makeManager();
    const background = await manager.open({ template: "cam", title: "A", params: { cameraId: "a" } });
    await manager.open({ template: "cam", title: "B", params: { cameraId: "b" } });
    const updated = manager.updateParams(background.id, { cameraId: "a2" });
    expect(updated.params).toEqual({ cameraId: "a2" });
  });
});

// ─── getUrl ───────────────────────────────────────────────────────────────────

describe("WorkspaceManager: getUrl", () => {
  it("returns the workspace URL for an open workspace", async () => {
    const { manager } = makeManager();
    const d = await manager.open({ template: "cam", title: "T", params: { cameraId: "c1" } });
    expect(manager.getUrl(d.id)).toBe(`/workspace/cam/${d.id}?title=T&cameraId=c1`);
  });

  it("throws WORKSPACE_NOT_FOUND for an unknown id", () => {
    const { manager } = makeManager();
    expect(() => manager.getUrl("nope")).toThrow(WorkspaceError);
  });
});

// ─── persist.version runtime guard ────────────────────────────────────────────

describe("WorkspaceManager: persist.version runtime guard", () => {
  it("throws when persist.version is not a finite number", () => {
    expect(() =>
      makeManager({ persist: { version: undefined as unknown as number } }),
    ).toThrow(/persist\.version must be a finite number/);
    expect(() =>
      makeManager({ persist: { version: NaN } }),
    ).toThrow(/persist\.version/);
  });

  it("accepts version 0", () => {
    window.sessionStorage.clear();
    expect(() => makeManager({ persist: { version: 0 } })).not.toThrow();
  });
});

// ─── tabs adapter: launching tab URL isolation ────────────────────────────────

describe("WorkspaceManager: tabs adapter never touches this tab's URL", () => {
  it("open() does not navigate", async () => {
    const { manager, navigate } = makeManager({ adapterType: "tabs" });
    await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("open() with an origin does not navigate either", async () => {
    const { manager, navigate } = makeManager({ adapterType: "tabs" });
    await manager.open({
      template: "cam",
      title: "Feed",
      params: { cameraId: "c1" },
      origin: "/dashboard",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("focus() does not navigate", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, navigate } = makeManager({ adapterType: "tabs", initialWorkspaces: [d] });
    await manager.focus("ws-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("close() does not navigate", async () => {
    const d = makeDescriptor("ws-1");
    const { manager, navigate } = makeManager({ adapterType: "tabs", initialWorkspaces: [d] });
    await manager.close("ws-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stack adapter still navigates on open() (control)", async () => {
    const { manager, navigate } = makeManager({ adapterType: "stack" });
    await manager.open({ template: "cam", title: "Feed", params: { cameraId: "c1" } });
    expect(navigate).toHaveBeenCalled();
  });
});
