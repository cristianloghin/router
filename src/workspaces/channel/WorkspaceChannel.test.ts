import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkspaceChannel } from "./WorkspaceChannel";
import type { Bus, Channel, ChannelContract, NamespacedBus } from "@mikrostack/chbus";

// ─── chbus mock ───────────────────────────────────────────────────────────────

function makeChannel(name: string): Channel<ChannelContract> {
  return {
    name,
    namespace: "test",
    on: vi.fn(() => vi.fn()),
    emit: vi.fn(),
    onAsync: vi.fn(() => vi.fn()),
    emitAsync: vi.fn(),
    use: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Channel<ChannelContract>;
}

function makeNamespacedBus(channels: Record<string, Channel<ChannelContract>>): NamespacedBus {
  return {
    namespace: "test",
    channel: vi.fn(<C extends ChannelContract>(name: string) => {
      if (!channels[name]) {
        channels[name] = makeChannel(name);
      }
      return channels[name] as Channel<C>;
    }),
  } as unknown as NamespacedBus;
}

function makeBus(): { bus: Bus; namespaceSpy: ReturnType<typeof vi.fn>; channels: Record<string, Channel<ChannelContract>> } {
  const channels: Record<string, Channel<ChannelContract>> = {};
  const ns = makeNamespacedBus(channels);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const namespaceSpy = vi.fn((_name: string) => ns) as any;
  const bus = { namespace: namespaceSpy } as unknown as Bus;
  return { bus, namespaceSpy, channels };
}

// ─── namespace scoping ────────────────────────────────────────────────────────

describe("createWorkspaceChannel: namespace", () => {
  it("creates a NamespacedBus scoped to workspace:{id}", () => {
    const { bus, namespaceSpy } = makeBus();
    createWorkspaceChannel("ws-abc", bus);
    expect(namespaceSpy).toHaveBeenCalledWith("workspace:ws-abc");
  });

  it("uses workspace id verbatim in the namespace", () => {
    const { bus, namespaceSpy } = makeBus();
    createWorkspaceChannel("uuid-999-xyz", bus);
    expect(namespaceSpy).toHaveBeenCalledWith("workspace:uuid-999-xyz");
  });
});

// ─── channel wiring ───────────────────────────────────────────────────────────

describe("createWorkspaceChannel: channel creation", () => {
  it("creates a 'root-to-ws' channel on the NamespacedBus", () => {
    const { bus, channels } = makeBus();
    createWorkspaceChannel("ws-1", bus);
    expect(channels["root-to-ws"]).toBeDefined();
  });

  it("creates a 'ws-to-root' channel on the NamespacedBus", () => {
    const { bus, channels } = makeBus();
    createWorkspaceChannel("ws-1", bus);
    expect(channels["ws-to-root"]).toBeDefined();
  });
});

// ─── workspace perspective ────────────────────────────────────────────────────

describe("createWorkspaceChannel: workspace side", () => {
  it("workspace.inbound is the root-to-ws channel", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.workspace.inbound).toBe(channels["root-to-ws"]);
  });

  it("workspace.outbound is the ws-to-root channel", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.workspace.outbound).toBe(channels["ws-to-root"]);
  });
});

// ─── root perspective ─────────────────────────────────────────────────────────

describe("createWorkspaceChannel: root side", () => {
  it("root.outbound is the root-to-ws channel (same as workspace.inbound)", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.root.outbound).toBe(channels["root-to-ws"]);
    expect(pair.root.outbound).toBe(pair.workspace.inbound);
  });

  it("root.inbound is the ws-to-root channel (same as workspace.outbound)", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.root.inbound).toBe(channels["ws-to-root"]);
    expect(pair.root.inbound).toBe(pair.workspace.outbound);
  });
});

// ─── inbound/outbound symmetry ────────────────────────────────────────────────

describe("createWorkspaceChannel: directional symmetry", () => {
  it("workspace.inbound and root.outbound share the same physical channel", () => {
    const { bus } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.workspace.inbound).toBe(pair.root.outbound);
  });

  it("workspace.outbound and root.inbound share the same physical channel", () => {
    const { bus } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.workspace.outbound).toBe(pair.root.inbound);
  });

  it("workspace.inbound and workspace.outbound are different channels", () => {
    const { bus } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    expect(pair.workspace.inbound).not.toBe(pair.workspace.outbound);
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────

describe("createWorkspaceChannel: destroy", () => {
  it("calls destroy on both channels", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus);
    pair.destroy();
    expect(channels["root-to-ws"]!.destroy).toHaveBeenCalledOnce();
    expect(channels["ws-to-root"]!.destroy).toHaveBeenCalledOnce();
  });

  it("does not destroy channels before destroy() is called", () => {
    const { bus, channels } = makeBus();
    createWorkspaceChannel("ws-1", bus);
    expect(channels["root-to-ws"]!.destroy).not.toHaveBeenCalled();
    expect(channels["ws-to-root"]!.destroy).not.toHaveBeenCalled();
  });
});

// ─── isolation per workspace ──────────────────────────────────────────────────

describe("createWorkspaceChannel: isolation", () => {
  it("two workspaces get separate NamespacedBus namespaces", () => {
    const { bus, namespaceSpy } = makeBus();
    createWorkspaceChannel("ws-A", bus);
    createWorkspaceChannel("ws-B", bus);
    expect(namespaceSpy).toHaveBeenCalledWith("workspace:ws-A");
    expect(namespaceSpy).toHaveBeenCalledWith("workspace:ws-B");
  });

  it("two workspaces get independent channel pairs", () => {
    const channelsA: Record<string, Channel<ChannelContract>> = {};
    const channelsB: Record<string, Channel<ChannelContract>> = {};
    const nsA = makeNamespacedBus(channelsA);
    const nsB = makeNamespacedBus(channelsB);
    let callCount = 0;
    const bus = {
      namespace: vi.fn(() => (callCount++ === 0 ? nsA : nsB)),
    } as unknown as Bus;

    const pairA = createWorkspaceChannel("ws-A", bus);
    const pairB = createWorkspaceChannel("ws-B", bus);

    expect(pairA.workspace.inbound).not.toBe(pairB.workspace.inbound);
    expect(pairA.workspace.outbound).not.toBe(pairB.workspace.outbound);
  });
});

// ─── cross-tab bridging (spec §7.5) ──────────────────────────────────────────

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((data: unknown) => {
    for (const other of MockBroadcastChannel.instances) {
      if (other !== this && other.name === this.name && other.onmessage) {
        other.onmessage(new MessageEvent("message", { data }));
      }
    }
  });
  close = vi.fn();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }
}

describe("createWorkspaceChannel: cross-tab bridging", () => {
  beforeEach(() => {
    MockBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    return () => vi.unstubAllGlobals();
  });

  it("does not create a BroadcastChannel by default", () => {
    const { bus } = makeBus();
    createWorkspaceChannel("ws-1", bus);
    expect(MockBroadcastChannel.instances).toHaveLength(0);
  });

  it("crossTab: true creates a per-workspace BroadcastChannel", () => {
    const { bus } = makeBus();
    createWorkspaceChannel("ws-1", bus, { crossTab: true });
    expect(MockBroadcastChannel.instances).toHaveLength(1);
    expect(MockBroadcastChannel.instances[0]!.name).toBe("chbus:workspace:ws-1");
  });

  it("workspace outbound emit is mirrored as a ws-to-root message", () => {
    const { bus } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus, { crossTab: true });
    (pair.workspace.outbound.emit as (a: string, p: unknown) => void)("motion", { cam: "c1" });
    const bc = MockBroadcastChannel.instances[0]!;
    expect(bc.postMessage).toHaveBeenCalledWith({
      channel: "ws-to-root",
      action: "motion",
      payload: { cam: "c1" },
    });
  });

  it("root outbound emit is mirrored as a root-to-ws message and still emits locally", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus, { crossTab: true });
    (pair.root.outbound.emit as (a: string, p: unknown) => void)("focus", { cam: "c2" });
    const bc = MockBroadcastChannel.instances[0]!;
    expect(bc.postMessage).toHaveBeenCalledWith({
      channel: "root-to-ws",
      action: "focus",
      payload: { cam: "c2" },
    });
    expect(channels["root-to-ws"]!.emit).toHaveBeenCalledWith("focus", { cam: "c2" });
  });

  it("an incoming remote message re-emits on the local channel without re-broadcasting", () => {
    const { bus, channels } = makeBus();
    createWorkspaceChannel("ws-1", bus, { crossTab: true });
    const bc = MockBroadcastChannel.instances[0]!;
    bc.onmessage!(
      new MessageEvent("message", {
        data: { channel: "root-to-ws", action: "focus", payload: { cam: "c3" } },
      }),
    );
    expect(channels["root-to-ws"]!.emit).toHaveBeenCalledWith("focus", { cam: "c3" });
    // Loop guard: the re-emit must not have been posted back.
    expect(bc.postMessage).not.toHaveBeenCalled();
  });

  it("messages emitted in one tab reach the local subscribers of another tab", () => {
    // Two independent buses simulate two tabs sharing the workspace id.
    const tabA = makeBus();
    const tabB = makeBus();
    const pairA = createWorkspaceChannel("ws-x", tabA.bus, { crossTab: true });
    createWorkspaceChannel("ws-x", tabB.bus, { crossTab: true });

    (pairA.workspace.outbound.emit as (a: string, p: unknown) => void)("motion", { cam: "c9" });

    // Tab B's local ws-to-root channel received the mirrored emit.
    expect(tabB.channels["ws-to-root"]!.emit).toHaveBeenCalledWith("motion", { cam: "c9" });
    // Tab A's own local channel also received it exactly once.
    expect(tabA.channels["ws-to-root"]!.emit).toHaveBeenCalledTimes(1);
  });

  it("destroy() closes the BroadcastChannel", () => {
    const { bus } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus, { crossTab: true });
    pair.destroy();
    expect(MockBroadcastChannel.instances[0]!.close).toHaveBeenCalledOnce();
  });

  it("ignores malformed broadcast messages", () => {
    const { bus, channels } = makeBus();
    createWorkspaceChannel("ws-1", bus, { crossTab: true });
    const bc = MockBroadcastChannel.instances[0]!;
    bc.onmessage!(new MessageEvent("message", { data: null }));
    bc.onmessage!(new MessageEvent("message", { data: { channel: "bogus", action: "x" } }));
    expect(channels["root-to-ws"]!.emit).not.toHaveBeenCalled();
    expect(channels["ws-to-root"]!.emit).not.toHaveBeenCalled();
  });
});

describe("createWorkspaceChannel: bridged channel passthrough", () => {
  beforeEach(() => {
    MockBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    return () => vi.unstubAllGlobals();
  });

  it("non-emit members (on, destroy) pass through to the underlying channel", () => {
    const { bus, channels } = makeBus();
    const pair = createWorkspaceChannel("ws-1", bus, { crossTab: true });
    const handler = vi.fn();
    pair.workspace.inbound.on("focus", handler);
    expect(channels["root-to-ws"]!.on).toHaveBeenCalledWith("focus", handler);
  });
});
