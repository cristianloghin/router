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
