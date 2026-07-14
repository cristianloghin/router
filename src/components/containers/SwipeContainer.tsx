import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Workspace ids whose pages were in the DOM after the last commit. */
  const renderedIdsRef = useRef<Set<string>>(new Set());
  /** Pending next-frame jump; latest wins. */
  const jumpRafRef = useRef<number | null>(null);

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
      // Root page: restore the router's current route path, including its
      // query string (the snapshot retains the route's search params while a
      // workspace URL is in the address bar).
      const { path, searchParams } = store.getSnapshot();
      const search = searchParams.toString();
      window.history.replaceState(null, "", search ? `${path}?${search}` : path);
    }
  }, [manager, store, rootOffset, pageWidthOf]);

  // Programmatic focus → smooth-scroll the track to that workspace's page,
  // mark it settled, and arm the feedback guard. (Open-jumps are handled by
  // the layout effect below, not here — the workspace:opened event fires
  // before the new page is committed, and depending on when React flushes
  // the store update the commit can even precede this subscriber.)
  useEffect(() => {
    return manager.subscribe((event) => {
      if (event.type !== "workspace:focused") return;
      const index = manager.getAll().findIndex((w) => w.id === event.workspaceId);
      if (index === -1) return;
      const track = trackRef.current;
      if (!track) return;
      const page = index + rootOffset;
      settledPageRef.current = page;
      targetPageRef.current = page;
      // Same one-frame deferral as the open-jump below: a focus() often
      // follows an updateParams() whose commit mutates page layout in this
      // same frame, and the snap container would discard the scroll.
      if (jumpRafRef.current !== null) cancelAnimationFrame(jumpRafRef.current);
      jumpRafRef.current = requestAnimationFrame(() => {
        jumpRafRef.current = null;
        track.scrollTo({ left: page * pageWidthOf(track), behavior: "smooth" });
      });
    });
  }, [manager, rootOffset, pageWidthOf]);

  // Open-jump, derived from rendered state instead of events: when a commit
  // adds a page whose workspace is current (open() focuses the workspace it
  // creates; a persistence restore focuses one on first render), jump the
  // deck to it — the page is in the DOM by definition, with no dependence
  // on event/commit ordering.
  //
  // The jump itself is deferred one frame. The commit that adds the page can
  // also mutate other pages' layout (e.g. open({origin}) swaps the root
  // page's route in the same commit). A scroll-snap container re-resolves
  // its snap target after such layout changes and overrides any scroll
  // issued in the same frame — the browser silently discards it (observed
  // in Chromium: scrollTo ran with valid bounds, no scroll event followed,
  // position stayed put). One frame later the snap state is settled and the
  // scroll both lands and becomes the new snap target.
  useLayoutEffect(() => {
    const prev = renderedIdsRef.current;
    const next = new Set(workspaces.map((w) => w.id));
    renderedIdsRef.current = next;

    const track = trackRef.current;
    if (!track) return;
    const current = manager.getCurrent();
    if (!current || prev.has(current.id)) return;
    const index = workspaces.findIndex((w) => w.id === current.id);
    if (index === -1) return;
    const page = index + rootOffset;
    settledPageRef.current = page;
    if (jumpRafRef.current !== null) cancelAnimationFrame(jumpRafRef.current);
    jumpRafRef.current = requestAnimationFrame(() => {
      jumpRafRef.current = null;
      track.scrollTo({ left: page * pageWidthOf(track) });
    });
  }, [workspaces, manager, rootOffset, pageWidthOf]);

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
