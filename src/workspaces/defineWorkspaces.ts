import type {
  WorkspaceTemplate,
  WorkspaceTemplateMap,
  WorkspaceDescriptor,
  WorkspaceParams,
  ResolvedWorkspaceAuth,
} from "./types";

// ─── defineWorkspaces ─────────────────────────────────────────────────────────

export function defineWorkspaces<TMap extends WorkspaceTemplateMap>(map: TMap): TMap {
  // Apply defaults and freeze
  const normalised: WorkspaceTemplateMap = {};
  for (const [key, template] of Object.entries(map)) {
    normalised[key] = {
      ...template,
      auth: template.auth ?? { type: "public" },
    };
  }
  return Object.freeze(normalised) as TMap;
}

// ─── createDescriptor ─────────────────────────────────────────────────────────

/**
 * Constructs a new WorkspaceDescriptor.
 * Called by WorkspaceManager.open() after auth passes.
 */
export function createDescriptor<TParams extends WorkspaceParams>(
  template: string,
  params: TParams,
  title: string,
  auth: ResolvedWorkspaceAuth = { type: "public", granted: true },
): WorkspaceDescriptor<TParams> {
  return {
    id: uuidv4(),
    template,
    title,
    params,
    createdAt: Date.now(),
    auth,
  };
}

// ─── UUID v4 ──────────────────────────────────────────────────────────────────

function uuidv4(): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
