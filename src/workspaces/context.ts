import { createContext, useContext } from "react";
import type { WorkspaceManager } from "./WorkspaceManager";
import type { WorkspaceTemplateMap } from "./types";

// ─── WorkspaceManagerContext ──────────────────────────────────────────────────

export const WorkspaceManagerContext = createContext<WorkspaceManager | null>(null);

export function useWorkspaceManagerContext(): WorkspaceManager {
  const manager = useContext(WorkspaceManagerContext);
  if (!manager) {
    throw new Error(
      "useWorkspace* hooks must be used inside a component tree provided by AppProvider.",
    );
  }
  return manager;
}

// ─── WorkspaceTemplatesContext ────────────────────────────────────────────────

export const WorkspaceTemplatesContext = createContext<WorkspaceTemplateMap | null>(null);

export function useWorkspaceTemplates(): WorkspaceTemplateMap {
  const templates = useContext(WorkspaceTemplatesContext);
  if (!templates) {
    throw new Error(
      "WorkspaceTemplatesContext not found. Ensure <AppProvider> is rendered.",
    );
  }
  return templates;
}
