import type { Bus, Channel, ChannelContract } from "@mikrostack/chbus";
import type { WorkspaceChannel } from "../types";

// ─── WorkspaceChannelPair ─────────────────────────────────────────────────────

/**
 * The result of createWorkspaceChannel.
 * - workspace: channel pair from the workspace component's perspective.
 *   workspace.inbound  ← receives messages from root
 *   workspace.outbound → sends messages to root
 * - root: flipped perspective for the root application.
 *   root.outbound      → sends messages to the workspace
 *   root.inbound       ← receives messages from the workspace
 * - destroy: tears down both underlying chbus channels.
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
  destroy(): void;
}

// ─── createWorkspaceChannel ───────────────────────────────────────────────────

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
 */
export function createWorkspaceChannel<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
>(workspaceId: string, bus: Bus): WorkspaceChannelPair<TRootToWorkspace, TWorkspaceToRoot> {
  const ns = bus.namespace(`workspace:${workspaceId}`);

  const rootToWs = ns.channel<TRootToWorkspace>("root-to-ws");
  const wsToRoot = ns.channel<TWorkspaceToRoot>("ws-to-root");

  return {
    workspace: {
      inbound: rootToWs,
      outbound: wsToRoot,
    },
    root: {
      outbound: rootToWs,
      inbound: wsToRoot,
    },
    destroy() {
      rootToWs.destroy();
      wsToRoot.destroy();
    },
  };
}
