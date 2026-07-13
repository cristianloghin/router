import React from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { GatedWorkspaceContent } from "../../workspaces/auth/AuthGate";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import type { RenderWorkspace } from "./containerContext";
import type { WorkspaceChannel } from "../../workspaces/types";

// ─── TabsContainer ────────────────────────────────────────────────────────────

export interface TabsContainerProps {
  /** Wrap the current workspace's content in app-provided chrome. Default: bare. */
  renderWorkspace?: RenderWorkspace;
}

/**
 * Renders the current workspace in a browser-tab style layout.
 *
 * - Displays a tab strip with all open workspaces (that IS this container's
 *   layout job, so it stays).
 * - Renders only the current workspace's component, through `renderWorkspace`
 *   when provided.
 * - No close/root button: browser tabs manage their own back navigation.
 * - Clicking a tab calls focus() to switch the active workspace.
 */
export function TabsContainer({ renderWorkspace }: TabsContainerProps): React.ReactElement {
  const { workspaces, current, focus } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();

  const currentWorkspace = current ?? workspaces[workspaces.length - 1] ?? null;

  return (
    <div data-component="tabs-container">
      {/* Tab strip */}
      <div role="tablist" data-role="tab-strip">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            role="tab"
            aria-selected={workspace.id === currentWorkspace?.id}
            data-workspace-id={workspace.id}
            onClick={() => focus(workspace.id)}
          >
            {workspace.title}
          </button>
        ))}
      </div>

      {/* Current workspace content */}
      {currentWorkspace && (() => {
        const template = templates[currentWorkspace.template];
        if (!template) return null;

        const pair = manager.getChannel(currentWorkspace.id);
        if (!pair) return null;

        const content = (
          <GatedWorkspaceContent
            workspace={currentWorkspace}
            channel={pair.workspace as WorkspaceChannel}
            Component={template.component}
          />
        );

        return (
          <div data-workspace-id={currentWorkspace.id} data-role="tab-content">
            {renderWorkspace ? renderWorkspace(currentWorkspace, content) : content}
          </div>
        );
      })()}
    </div>
  );
}
