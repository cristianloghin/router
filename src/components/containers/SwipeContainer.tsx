import React, { useRef, useCallback } from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import { SwipeAdapter } from "../../workspaces/adapters/SwipeAdapter";
import type { WorkspaceDescriptor, WorkspaceChannel } from "../../workspaces/types";

// ─── SwipeContainer ───────────────────────────────────────────────────────────

/**
 * Renders all open workspaces in a horizontally swipeable layout.
 *
 * Scroll events update the current index on the SwipeAdapter without
 * triggering focus navigation. Programmatic focus (via focus button) calls
 * adapter.focus() and then scrolls the container to the workspace position.
 */
export function SwipeContainer(): React.ReactElement {
  const { workspaces, focus: focusWs, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const trackRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const adapter = manager.getAdapter();
    if (!(adapter instanceof SwipeAdapter)) return;
    const track = trackRef.current;
    if (!track) return;
    const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
    const index = Math.round(track.scrollLeft / itemWidth);
    adapter.setCurrentIndex(index);
  }, [manager, workspaces.length]);

  const handleFocus = useCallback(
    async (id: string, index: number) => {
      await focusWs(id);
      const track = trackRef.current;
      if (!track) return;
      const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
      track.scrollTo({ left: itemWidth * index, behavior: "smooth" });
    },
    [focusWs, workspaces.length],
  );

  return (
    <div data-component="swipe-container">
      <div
        ref={trackRef}
        data-role="swipe-track"
        onScroll={handleScroll}
        style={{ overflowX: "auto", display: "flex" }}
      >
        {workspaces.map((workspace, index) => {
          const template = templates[workspace.template];
          if (!template) return null;

          const Component = template.component;
          const pair = manager.getChannel(workspace.id);
          if (!pair) return null;

          const channel = pair.workspace as WorkspaceChannel;

          return (
            <div key={workspace.id} data-workspace-id={workspace.id} style={{ flex: "0 0 100%" }}>
              <div data-role="workspace-controls">
                <button
                  data-action="focus"
                  onClick={() => handleFocus(workspace.id, index)}
                  aria-label={`Focus ${workspace.title}`}
                >
                  Focus
                </button>
                <button
                  data-action="close"
                  onClick={() => close(workspace.id)}
                  aria-label={`Close ${workspace.title}`}
                >
                  Close
                </button>
              </div>
              <Component workspace={workspace} channel={channel} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
