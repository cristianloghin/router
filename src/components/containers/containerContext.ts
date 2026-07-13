import { createContext, useContext } from "react";
import type React from "react";
import type { WorkspaceDescriptor } from "../../workspaces/types";

// ─── Shared container types ───────────────────────────────────────────────────

/**
 * Render prop letting apps wrap workspace content in their own chrome
 * (title bars, close buttons, transitions). Default: render `content` bare —
 * the library ships no UI copy.
 */
export type RenderWorkspace = (
  workspace: WorkspaceDescriptor,
  content: React.ReactNode,
) => React.ReactNode;

// ─── WorkspaceContainerContext ────────────────────────────────────────────────

/**
 * Each container publishes its scroll element here so apps can drive it
 * imperatively (e.g. scroll the swipe deck home from an overlay).
 */
export const WorkspaceContainerContext = createContext<HTMLElement | null>(null);

/** The active container's scroll element, or null when none is mounted. */
export function useWorkspaceContainer(): HTMLElement | null {
  return useContext(WorkspaceContainerContext);
}
