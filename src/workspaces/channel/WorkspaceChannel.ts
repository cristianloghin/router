import type { Bus, Channel, ChannelContract } from "@mikrostack/chbus";
import type { WorkspaceChannel, WorkspaceLifecycleContract } from "../types";

// ─── WorkspaceChannelPair ─────────────────────────────────────────────────────

/**
 * The result of createWorkspaceChannel.
 * - workspace: channel pair from the workspace component's perspective.
 *   workspace.inbound  ← receives messages from root
 *   workspace.outbound → sends messages to root
 * - root: flipped perspective for the root application.
 *   root.outbound      → sends messages to the workspace
 *   root.inbound       ← receives messages from the workspace
 * - lifecycle: router-owned view-state channel (see below).
 * - destroy: tears down the underlying chbus channels.
 */
export interface WorkspaceChannelPair<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
> {
  workspace: WorkspaceChannel<TRootToWorkspace, TWorkspaceToRoot>;
  root: {
    outbound: Channel<TRootToWorkspace>;
    inbound: Channel<TWorkspaceToRoot>;
  };
  /**
   * Router-owned `lifecycle` channel — the manager emits view_entered /
   * view_exited here on current-change. Not part of the app-contracted
   * root-to-ws/ws-to-root pair, and not surfaced on WorkspaceChannel;
   * apps reach it by name off their own bus. See
   * WorkspaceLifecycleContract.
   */
  lifecycle: Channel<WorkspaceLifecycleContract>;
  destroy(): void;
}

// ─── createWorkspaceChannel ───────────────────────────────────────────────────

export interface CreateWorkspaceChannelOptions {
  /**
   * Bridge channel traffic across browser tabs over BroadcastChannel
   * (spec §7.5) — enabled by WorkspaceManager under the tabs adapter.
   */
  crossTab?: boolean;
}

type BridgedChannelName = "root-to-ws" | "ws-to-root";

interface CrossTabMessage {
  channel: BridgedChannelName;
  action: string;
  payload: unknown;
}

/**
 * Creates an isolated bidirectional channel pair for a workspace.
 *
 * Each workspace gets a NamespacedBus scoped to `workspace:{id}`.
 * Two channels are wired on it:
 *   "root-to-ws"  — carries messages from root to the workspace
 *   "ws-to-root"  — carries messages from the workspace to root
 *
 * From the workspace component's perspective:
 *   channel.inbound  = root-to-ws   (listen here)
 *   channel.outbound = ws-to-root   (emit here)
 *
 * From the root application's perspective (useWorkspaceChannel):
 *   channel.outbound = root-to-ws   (emit here to command the workspace)
 *   channel.inbound  = ws-to-root   (listen here for workspace events)
 *
 * With crossTab enabled, every local emit is mirrored to the other tabs over
 * a per-workspace BroadcastChannel; incoming mirrored messages are re-emitted
 * on the local chbus channels. Messages must be structured-clone-serializable
 * (spec §7.5) — the same constraint chbus imposes.
 */
export function createWorkspaceChannel<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
>(
  workspaceId: string,
  bus: Bus,
  options: CreateWorkspaceChannelOptions = {},
): WorkspaceChannelPair<TRootToWorkspace, TWorkspaceToRoot> {
  const ns = bus.namespace(`workspace:${workspaceId}`);

  const rootToWs = ns.channel<TRootToWorkspace>("root-to-ws");
  const wsToRoot = ns.channel<TWorkspaceToRoot>("ws-to-root");
  // Router-owned. Never bridged: bridgeEmit wraps only the app-contract pair
  // above, so the local-only guarantee needs no guard here. (Under tabs,
  // "view" would mean tab visibility — its own design if ever needed.)
  const lifecycle = ns.channel<WorkspaceLifecycleContract>("lifecycle");

  let broadcast: BroadcastChannel | null = null;
  let exposedRootToWs = rootToWs;
  let exposedWsToRoot = wsToRoot;

  if (options.crossTab && typeof BroadcastChannel !== "undefined") {
    broadcast = new BroadcastChannel(`chbus:workspace:${workspaceId}`);
    broadcast.onmessage = (event: MessageEvent) => {
      const message = event.data as CrossTabMessage | null;
      if (!message || (message.channel !== "root-to-ws" && message.channel !== "ws-to-root")) {
        return;
      }
      // Remote messages re-emit on the RAW local channel (not the bridged
      // proxy) so they are never re-broadcast — this is the loop guard.
      const target = message.channel === "root-to-ws" ? rootToWs : wsToRoot;
      (target.emit as (action: string, payload: unknown) => void)(
        message.action,
        message.payload,
      );
    };
    exposedRootToWs = bridgeEmit(rootToWs, "root-to-ws", broadcast);
    exposedWsToRoot = bridgeEmit(wsToRoot, "ws-to-root", broadcast);
  }

  return {
    workspace: {
      inbound: exposedRootToWs,
      outbound: exposedWsToRoot,
    },
    root: {
      outbound: exposedRootToWs,
      inbound: exposedWsToRoot,
    },
    lifecycle,
    destroy() {
      broadcast?.close();
      rootToWs.destroy();
      wsToRoot.destroy();
      lifecycle.destroy();
    },
  };
}

/** Wraps a channel so every emit is also posted to the BroadcastChannel. */
function bridgeEmit<T extends ChannelContract>(
  channel: Channel<T>,
  name: BridgedChannelName,
  broadcast: BroadcastChannel,
): Channel<T> {
  return new Proxy(channel, {
    get(target, prop, receiver) {
      if (prop === "emit") {
        return (action: string, payload: unknown) => {
          broadcast.postMessage({ channel: name, action, payload } satisfies CrossTabMessage);
          return (target.emit as unknown as (action: string, payload: unknown) => unknown)(
            action,
            payload,
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
