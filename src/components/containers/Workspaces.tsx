import React from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { StackContainer } from "./StackContainer";
import { SwipeContainer } from "./SwipeContainer";
import { TabsContainer } from "./TabsContainer";
import type { RenderWorkspace } from "./containerContext";

// ─── Workspaces ───────────────────────────────────────────────────────────────

export interface WorkspacesProps {
  /** Root page content — page 0 of the swipe deck, or the stack's backdrop. */
  children?: React.ReactNode;
  /** Wrap each workspace's content in app-provided chrome. */
  renderWorkspace?: RenderWorkspace;
}

/**
 * Convenience container: renders the container matching the active adapter
 * type and passes `children`/`renderWorkspace` through.
 */
export function Workspaces({ children, renderWorkspace }: WorkspacesProps): React.ReactElement {
  const { adapterType } = useWorkspaces();

  const shared = renderWorkspace !== undefined ? { renderWorkspace } : {};

  switch (adapterType) {
    case "swipe":
      return <SwipeContainer {...shared}>{children}</SwipeContainer>;
    case "tabs":
      // Tabs run each workspace in its own browser tab. The launching tab
      // renders children (the root page) plus a strip of open workspaces;
      // a workspace tab renders only its workspace.
      return <TabsContainer {...shared}>{children}</TabsContainer>;
    default:
      return <StackContainer {...shared}>{children}</StackContainer>;
  }
}
