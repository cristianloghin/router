import React, { useState } from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { useLocation } from "../../router/hooks";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import { GatedWorkspaceContent } from "../../workspaces/auth/AuthGate";
import { WorkspaceContainerContext } from "./containerContext";
import type { RenderWorkspace } from "./containerContext";
import type { WorkspaceChannel } from "../../workspaces/types";

// ─── StackContainer ───────────────────────────────────────────────────────────

export interface StackContainerProps {
  /** Root page content, rendered when no workspace is focused. */
  children?: React.ReactNode;
  /** Wrap each workspace's content in app-provided chrome. Default: bare. */
  renderWorkspace?: RenderWorkspace;
}

/**
 * Renders all open workspaces in a stacked layout, headless: the container
 * provides no focus/close controls — apps supply their own chrome via
 * `renderWorkspace` and drive navigation with useWorkspaces().
 */
export function StackContainer({
  children,
  renderWorkspace,
}: StackContainerProps): React.ReactElement {
  const { workspaces } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const { inWorkspace } = useLocation();
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);

  return (
    <WorkspaceContainerContext.Provider value={containerEl}>
      <div data-component="stack-container" ref={setContainerEl}>
        {!inWorkspace && children}
        {workspaces.map((workspace) => {
          const template = templates[workspace.template];
          if (!template) return null;

          const pair = manager.getChannel(workspace.id);
          if (!pair) return null;

          const content = (
            <GatedWorkspaceContent
              workspace={workspace}
              channel={pair.workspace as WorkspaceChannel}
              Component={template.component}
            />
          );

          return (
            <div key={workspace.id} data-workspace-id={workspace.id}>
              {renderWorkspace ? renderWorkspace(workspace, content) : content}
            </div>
          );
        })}
      </div>
    </WorkspaceContainerContext.Provider>
  );
}
