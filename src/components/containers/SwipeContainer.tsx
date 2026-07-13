import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaces } from "../../workspaces/hooks";
import { useRouterStore } from "../../router/context";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../../workspaces/context";
import { GatedWorkspaceContent } from "../../workspaces/auth/AuthGate";
import { SwipeAdapter } from "../../workspaces/adapters/SwipeAdapter";
import { WorkspaceContainerContext } from "./containerContext";
import type { RenderWorkspace } from "./containerContext";
import type { WorkspaceChannel } from "../../workspaces/types";

// ─── SwipeContainer ───────────────────────────────────────────────────────────

export interface SwipeContainerProps {
  /** Root page content — rendered as page 0 of the swipe track. */
  children?: React.ReactNode;
  /** Wrap each workspace's content in app-provided chrome. Default: bare. */
  renderWorkspace?: RenderWorkspace;
}

/**
 * Renders open workspaces in a horizontally swipeable deck, headless (no
 * injected controls). When `children` is given it becomes page 0 — "the deck
 * starts at your dashboard".
 *
 * Scroll→URL sync (on by default):
 * - Settling on a workspace page updates the adapter index (no focus event)
 *   and REPLACES the URL with that workspace's URL.
 * - Settling on the root page replaces the URL with the router's current
 *   path — by construction the last non-workspace route.
 * The replace goes straight through history.replaceState: swiping is a
 * presentational sync, not a navigation — it must not touch the session
 * stack, fire navigation events, or trigger usePrompt.
 *
 * Programmatic focus (workspace:focused) scrolls the track to the workspace's
 * page; a target guard suppresses scroll-handler feedback while the smooth
 * scroll is in flight.
 */
export function SwipeContainer({
  children,
  renderWorkspace,
}: SwipeContainerProps): React.ReactElement {
  const { workspaces } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const store = useRouterStore();

  const trackRef = useRef<HTMLElement | null>(null);
  const [trackEl, setTrackEl] = useState<HTMLElement | null>(null);
  /** Page a programmatic smooth-scroll is heading to; guards feedback. */
  const targetPageRef = useRef<number | null>(null);
  /** Last page the scroll handler settled on. */
  const settledPageRef = useRef<number>(0);

  const hasRootPage = children !== undefined && children !== null;
  const rootOffset = hasRootPage ? 1 : 0;
  const pageCount = workspaces.length + rootOffset;

  const setTrack = useCallback((el: HTMLDivElement | null) => {
    trackRef.current = el;
    setTrackEl(el);
  }, []);

  const pageWidthOf = useCallback(
    (track: HTMLElement): number => track.scrollWidth / Math.max(pageCount, 1),
    [pageCount],
  );

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const pageWidth = pageWidthOf(track);
    if (pageWidth <= 0) return;
    const page = Math.round(track.scrollLeft / pageWidth);

    // Ignore feedback from our own smooth scroll until it reaches its target.
    if (targetPageRef.current !== null) {
      if (page === targetPageRef.current) targetPageRef.current = null;
      return;
    }
    if (page === settledPageRef.current) return;
    settledPageRef.current = page;

    const workspaceIndex = page - rootOffset;
    if (workspaceIndex >= 0) {
      const adapter = manager.getAdapter();
      if (adapter instanceof SwipeAdapter) {
        // Deliberately no workspace:focused event on the scroll path.
        adapter.setCurrentIndex(workspaceIndex);
      }
      const workspace = manager.getAll()[workspaceIndex];
      if (workspace) {
        window.history.replaceState(null, "", manager.getUrl(workspace.id));
      }
    } else {
      // Root page: restore the router's current route path.
      window.history.replaceState(null, "", store.getSnapshot().path);
    }
  }, [manager, store, rootOffset, pageWidthOf]);

  // Programmatic focus (and open, which focuses the new workspace) → scroll
  // the track to that workspace's page and mark it settled. Focus scrolls
  // smoothly and arms the feedback guard; open jumps instantly (a brand-new
  // page — there is nothing to animate from, and no intermediate scroll
  // events to suppress).
  useEffect(() => {
    return manager.subscribe((event) => {
      let workspaceId: string;
      let smooth: boolean;
      if (event.type === "workspace:focused") {
        workspaceId = event.workspaceId;
        smooth = true;
      } else if (event.type === "workspace:opened") {
        workspaceId = event.workspace.id;
        smooth = false;
      } else {
        return;
      }

      const track = trackRef.current;
      if (!track) return;
      const index = manager.getAll().findIndex((w) => w.id === workspaceId);
      if (index === -1) return;
      const page = index + rootOffset;
      settledPageRef.current = page;
      if (smooth) {
        targetPageRef.current = page;
        track.scrollTo({ left: page * pageWidthOf(track), behavior: "smooth" });
      } else {
        track.scrollTo({ left: page * pageWidthOf(track) });
      }
    });
  }, [manager, rootOffset, pageWidthOf]);

  // Orientation change: re-snap to the settled page (page width changed).
  useEffect(() => {
    const orientation = window.screen?.orientation;
    if (!orientation) return; // absent in jsdom and older browsers
    const handleChange = () => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({ left: settledPageRef.current * pageWidthOf(track) });
    };
    orientation.addEventListener("change", handleChange);
    return () => orientation.removeEventListener("change", handleChange);
  }, [pageWidthOf]);

  return (
    <WorkspaceContainerContext.Provider value={trackEl}>
      <div data-component="swipe-container">
        <div
          ref={setTrack}
          data-role="swipe-track"
          onScroll={handleScroll}
          style={{ overflowX: "auto", display: "flex" }}
        >
          {hasRootPage && (
            <div data-role="root-page" style={{ flex: "0 0 100%" }}>
              {children}
            </div>
          )}
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
              <div key={workspace.id} data-workspace-id={workspace.id} style={{ flex: "0 0 100%" }}>
                {renderWorkspace ? renderWorkspace(workspace, content) : content}
              </div>
            );
          })}
        </div>
      </div>
    </WorkspaceContainerContext.Provider>
  );
}
