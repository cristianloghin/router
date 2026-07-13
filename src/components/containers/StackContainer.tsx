import React from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import { GatedWorkspaceContent } from "../../workspaces/auth/AuthGate";
import type { WorkspaceDescriptor, WorkspaceChannel } from "../../workspaces/types";

// ─── StackContainer ───────────────────────────────────────────────────────────

/**
 * Renders all open workspaces in a stacked layout.
 *
 * Each workspace is rendered using its template component, passing the
 * workspace descriptor and its bidirectional channel as props.
 * Focus and close controls are injected by the container.
 */
export function StackContainer(): React.ReactElement {
  const { workspaces, focus, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();

  return (
    <div data-component="stack-container">
      {workspaces.map((workspace) => {
        const template = templates[workspace.template];
        if (!template) return null;

        const Component = template.component;
        const pair = manager.getChannel(workspace.id);
        if (!pair) return null;

        const channel = pair.workspace as WorkspaceChannel;

        return (
          <WorkspaceSlot
            key={workspace.id}
            workspace={workspace}
            channel={channel}
            Component={Component}
            onFocus={() => focus(workspace.id)}
            onClose={() => close(workspace.id)}
          />
        );
      })}
    </div>
  );
}

// ─── WorkspaceSlot ────────────────────────────────────────────────────────────

interface WorkspaceSlotProps {
  workspace: WorkspaceDescriptor;
  channel: WorkspaceChannel;
  Component: React.ComponentType<{ workspace: WorkspaceDescriptor; channel: WorkspaceChannel }>;
  onFocus: () => void;
  onClose: () => void;
}

function WorkspaceSlot({ workspace, channel, Component, onFocus, onClose }: WorkspaceSlotProps) {
  return (
    <div data-workspace-id={workspace.id}>
      <div data-role="workspace-controls">
        <button data-action="focus" onClick={onFocus} aria-label={`Focus ${workspace.title}`}>
          Focus
        </button>
        <button data-action="close" onClick={onClose} aria-label={`Close ${workspace.title}`}>
          Close
        </button>
      </div>
      <GatedWorkspaceContent workspace={workspace} channel={channel} Component={Component} />
    </div>
  );
}
