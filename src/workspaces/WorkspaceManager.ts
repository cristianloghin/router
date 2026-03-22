import type { Bus } from "@mikrostack/chbus";
import type {
  WorkspaceAdapter,
  WorkspaceDescriptor,
  WorkspaceEvent,
  WorkspaceParams,
  WorkspaceTemplateMap,
  AuthCheckContext,
  OpenWorkspaceInput,
} from "./types";
import { WorkspaceError } from "./types";
import { WorkspaceGuard } from "./auth/WorkspaceGuard";
import { createDescriptor } from "./defineWorkspaces";
import { createWorkspaceChannel } from "./channel/WorkspaceChannel";
import type { WorkspaceChannelPair } from "./channel/WorkspaceChannel";
import { serialize } from "../utils/params";

// ─── Types ───────────────────────────────────────────────────────────────────

type NavigateFn = (url: string, options?: { replace?: boolean; state?: unknown }) => void;

export interface WorkspaceManagerConfig {
  adapter: WorkspaceAdapter;
  guard: WorkspaceGuard;
  navigate: NavigateFn;
  bus: Bus;
  templates: WorkspaceTemplateMap;
  workspaceBasePath?: string;
}

// ─── WorkspaceManager ─────────────────────────────────────────────────────────

export class WorkspaceManager {
  private adapter: WorkspaceAdapter;
  private guard: WorkspaceGuard;
  private _navigate: NavigateFn;
  readonly bus: Bus;
  private templates: WorkspaceTemplateMap;
  private basePath: string;

  /** Channel pairs keyed by workspace id. */
  private channels = new Map<string, WorkspaceChannelPair>();

  /** Origin path stored at open() time, keyed by workspace id. */
  private origins = new Map<string, string>();

  constructor(config: WorkspaceManagerConfig) {
    this.adapter = config.adapter;
    this.guard = config.guard;
    this._navigate = config.navigate;
    this.bus = config.bus;
    this.templates = config.templates;
    this.basePath = config.workspaceBasePath ?? "/workspace";
  }

  // ─── adapterType ────────────────────────────────────────────────────────────

  get adapterType() {
    return this.adapter.type;
  }

  // ─── open ────────────────────────────────────────────────────────────────────

  async open(input: OpenWorkspaceInput): Promise<WorkspaceDescriptor> {
    const templateKey = String(input.template);
    const template = this.templates[templateKey];
    if (!template) {
      throw new WorkspaceError("ADAPTER_ERROR", `Unknown template: ${templateKey}`, null);
    }

    // maxInstances check
    if (template.maxInstances !== undefined) {
      const existing = this.adapter.getAll().filter((w) => w.template === templateKey);
      if (existing.length >= template.maxInstances) {
        throw new WorkspaceError(
          "MAX_INSTANCES_REACHED",
          `Max instances (${template.maxInstances}) reached for template "${templateKey}"`,
          null,
        );
      }
    }

    // Build descriptor before auth so we have an id for the auth context
    const descriptor = createDescriptor(
      templateKey,
      input.params as WorkspaceParams,
      input.title,
      { type: template.auth?.type ?? "public", granted: false },
    );

    // Auth evaluation
    const authRule = template.auth ?? { type: "public" as const };
    const ctx: AuthCheckContext = {
      workspaceId: descriptor.id,
      template: templateKey,
      params: input.params as WorkspaceParams,
      isDirectAccess: false,
    };
    const granted = await this.guard.evaluate(authRule, ctx);
    if (!granted) {
      throw new WorkspaceError(
        "AUTH_FAILED",
        `Auth check failed for template "${templateKey}"`,
        descriptor.id,
      );
    }

    // Stamp auth result onto descriptor
    (descriptor as { auth: { type: string; granted: boolean } }).auth = {
      type: authRule.type,
      granted: true,
    };

    // Create channel
    const channelPair = createWorkspaceChannel(descriptor.id, this.bus);
    this.channels.set(descriptor.id, channelPair);

    // Store origin
    const origin =
      typeof window !== "undefined" ? window.location.pathname : "/";
    this.origins.set(descriptor.id, origin);

    // Open in adapter
    await this.adapter.open(descriptor);

    // Build URL and navigate
    const url = this.buildUrl(descriptor);
    this._navigate(url, { state: { origin, workspaceId: descriptor.id } });

    return descriptor;
  }

  // ─── focus ───────────────────────────────────────────────────────────────────

  async focus(id: string): Promise<WorkspaceDescriptor> {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }

    await this.adapter.focus(id);

    const url = this.buildUrl(workspace);
    this._navigate(url);

    return workspace;
  }

  // ─── close ───────────────────────────────────────────────────────────────────

  async close(id: string, autoFocus = true): Promise<void> {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }

    // Clean up channel BEFORE adapter.close() so getChannel(id) returns null
    // when workspace:closed fires from the adapter.
    const pair = this.channels.get(id);
    if (pair) {
      pair.destroy();
      this.channels.delete(id);
    }
    const origin = this.origins.get(id) ?? "/";
    this.origins.delete(id);

    await this.adapter.close(id, autoFocus);

    // Navigate to origin
    this._navigate(origin);
  }

  // ─── updateParams ────────────────────────────────────────────────────────────

  updateParams(id: string, params: WorkspaceParams): WorkspaceDescriptor {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }

    this.adapter.updateParams(id, params);

    // Get the updated descriptor (adapter mutates in-place in StackAdapter)
    const updated = this.adapter.getAll().find((w) => w.id === id) ?? workspace;
    const url = this.buildUrl(updated);
    this._navigate(url, { replace: true });

    return updated;
  }

  // ─── updateTitle ─────────────────────────────────────────────────────────────

  updateTitle(id: string, title: string): WorkspaceDescriptor {
    this.adapter.updateTitle(id, title);
    const updated = this.adapter.getAll().find((w) => w.id === id);
    if (!updated) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    return updated;
  }

  // ─── delegation ──────────────────────────────────────────────────────────────

  getAll(): WorkspaceDescriptor[] {
    return this.adapter.getAll();
  }

  getCurrent(): WorkspaceDescriptor | null {
    return this.adapter.getCurrent();
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    return this.adapter.subscribe(listener);
  }

  // ─── channel access ──────────────────────────────────────────────────────────

  getChannel(workspaceId: string): WorkspaceChannelPair | null {
    return this.channels.get(workspaceId) ?? null;
  }

  getAdapter(): WorkspaceAdapter {
    return this.adapter;
  }

  // ─── URL building ─────────────────────────────────────────────────────────────

  private buildUrl(descriptor: WorkspaceDescriptor): string {
    const template = this.templates[descriptor.template];
    const searchParams = new URLSearchParams();
    searchParams.set("title", descriptor.title);

    if (template?.schema) {
      for (const [key, type] of Object.entries(template.schema)) {
        if (type !== undefined && key in descriptor.params) {
          const raw = descriptor.params[key];
          if (raw === undefined) continue;
          const serialized = serialize(raw, type);
          if (Array.isArray(serialized)) {
            if (serialized.length > 0) {
              for (const v of serialized) searchParams.append(key, v);
            }
          } else {
            searchParams.set(key, serialized);
          }
        }
      }
    } else {
      // No schema: serialize all params as strings/repeated keys
      for (const [key, value] of Object.entries(descriptor.params)) {
        if (Array.isArray(value)) {
          for (const v of value) searchParams.append(key, String(v));
        } else {
          searchParams.set(key, String(value));
        }
      }
    }

    return `${this.basePath}/${descriptor.template}/${descriptor.id}?${searchParams.toString()}`;
  }
}
