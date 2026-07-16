import React from "react";
import { useWorkspaces, useWorkspaceActions } from "../../workspaces/hooks";
import { useLocation } from "../../router/hooks";
import { GatedWorkspaceContent } from "../../workspaces/auth/AuthGate";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import type { RenderWorkspace } from "./containerContext";
import type { WorkspaceChannel } from "../../workspaces/types";

// ─── TabsContainer ────────────────────────────────────────────────────────────

export interface TabsContainerProps {
  /** Root page content — rendered in the launching tab only. */
  children?: React.ReactNode;
  /** Wrap this tab's workspace content in app-provided chrome. Default: bare. */
  renderWorkspace?: RenderWorkspace;
}

/**
 * Container for the tabs adapter. A workspace's content renders ONLY in its
 * own browser tab — never inline in the launching app.
 *
 * - In a workspace tab (this tab's URL is a workspace URL): renders that
 *   workspace's content, through `renderWorkspace` when provided. No strip,
 *   no root page.
 * - In the launching tab: renders `children` (the root page) plus a tab
 *   strip listing the open workspaces. No workspace content.
 * - No close/root button: browser tabs manage their own lifecycle.
 */
export function TabsContainer({ children, renderWorkspace }: TabsContainerProps): React.ReactElement {
  const { workspaces, current } = useWorkspaces();
  const { focus } = useWorkspaceActions();
  const { inWorkspace } = useLocation();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();

  // ─── Workspace tab: this browser tab IS the workspace ──────────────────────
  if (inWorkspace) {
    if (!current) return <div data-component="tabs-container" />;

    const template = templates[current.template];
    const pair = manager.getChannel(current.id);
    if (!template || !pair) return <div data-component="tabs-container" />;

    const content = (
      <GatedWorkspaceContent
        workspace={current}
        channel={pair.workspace as WorkspaceChannel}
        Component={template.component}
      />
    );

    return (
      <div data-component="tabs-container">
        <div data-workspace-id={current.id} data-role="tab-content">
          {renderWorkspace ? renderWorkspace(current, content) : content}
        </div>
      </div>
    );
  }

  // ─── Launching tab: root page + strip of open workspaces ───────────────────
  return (
    <div data-component="tabs-container">
      {workspaces.length > 0 && (
        <div role="tablist" data-role="tab-strip">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              role="tab"
              aria-selected={false}
              data-workspace-id={workspace.id}
              onClick={() => focus(workspace.id)}
            >
              {workspace.title}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
