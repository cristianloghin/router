import type {
  WorkspaceTemplateFor,
  WorkspaceTemplateMap,
  WorkspaceDescriptor,
  WorkspaceParams,
  ResolvedWorkspaceAuth,
} from "./types";

// ─── defineWorkspaces ─────────────────────────────────────────────────────────

/**
 * Declares the app's workspace templates. Param types are inferred from each
 * template's `schema` — declare the schema once and the component's
 * `workspace.params` (plus `open()`/`updateParams()` inputs) are typed from
 * it. Templates without a schema get loosely typed string params.
 *
 * The `const` type parameter preserves schema literals ("string" stays
 * "string", not string) so inference works without `as const`.
 */
export function defineWorkspaces<
  const TMap extends { [K in keyof TMap]: WorkspaceTemplateFor<TMap[K]> },
>(map: TMap): TMap {
  // Apply defaults and freeze
  const normalised: WorkspaceTemplateMap = {};
  for (const [key, template] of Object.entries(map as WorkspaceTemplateMap)) {
    normalised[key] = {
      ...template,
      auth: template.auth ?? { type: "public" },
      persistent: template.persistent ?? true,
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
