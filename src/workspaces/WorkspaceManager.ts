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
import { serialize, paramsToRecord } from "../utils/params";
import type { ParamSchema } from "../utils/params";
import type { CredentialInput } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkspaceNavType = "workspace-open" | "workspace-close";

type NavigateFn = (
  url: string,
  options?: { replace?: boolean; state?: unknown; navType?: WorkspaceNavType },
) => void;

export interface WorkspaceManagerConfig {
  adapter: WorkspaceAdapter;
  guard: WorkspaceGuard;
  navigate: NavigateFn;
  bus: Bus;
  templates: WorkspaceTemplateMap;
  workspaceBasePath?: string;
  /** Maximum total open workspaces across all templates. Default: 10 (spec §3). */
  maxWorkspaces?: number;
  /**
   * Returns the current route path — used as the workspace origin at open()
   * time. Should never return a workspace URL. Defaults to window.location.
   */
  getCurrentPath?: () => string;
  /** Called when credentials are submitted for a workspace (spec §6.3). */
  onCredentialAttempt?: (input: CredentialInput, workspaceId: string) => void;
  /** Enable sessionStorage persistence (spec §5.3). */
  persist?: { version: number };
}

/** Shape stored in sessionStorage under `ws:v{version}`. */
interface PersistedState {
  workspaces: WorkspaceDescriptor[];
  currentId: string | null;
  origins: Record<string, string>;
}

const PERSIST_KEY_PATTERN = /^ws:v\d+$/;

function getSessionStorage(): Storage | null {
  // Access can throw in some privacy modes; persistence degrades to off.
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// ─── WorkspaceManager ─────────────────────────────────────────────────────────

export class WorkspaceManager {
  private adapter: WorkspaceAdapter;
  private guard: WorkspaceGuard;
  private _navigate: NavigateFn;
  readonly bus: Bus;
  private templates: WorkspaceTemplateMap;
  private basePath: string;
  private maxWorkspaces: number;
  private getCurrentPath: () => string;

  /** Channel pairs keyed by workspace id. */
  private channels = new Map<string, WorkspaceChannelPair>();

  /** Origin path stored at open() time, keyed by workspace id. */
  private origins = new Map<string, string>();

  /** sessionStorage key when persistence is enabled, null otherwise. */
  private persistKey: string | null;

  /** Listeners for manager-originated events (auth-failed, error). */
  private managerListeners = new Set<(event: WorkspaceEvent) => void>();

  constructor(config: WorkspaceManagerConfig) {
    this.adapter = config.adapter;
    this.guard = config.guard;
    this._navigate = config.navigate;
    this.bus = config.bus;
    this.templates = config.templates;
    this.basePath = config.workspaceBasePath ?? "/workspace";
    this.maxWorkspaces = config.maxWorkspaces ?? 10;
    this.getCurrentPath =
      config.getCurrentPath ??
      (() => (typeof window !== "undefined" ? window.location.pathname : "/"));
    this.onCredentialAttempt = config.onCredentialAttempt;
    if (config.persist && !Number.isFinite(config.persist.version)) {
      // Guards dynamically-built configs (plain JS) from silently producing
      // a "ws:vundefined" storage key.
      throw new Error(
        `[@mikrostack/router] persist.version must be a finite number, got ${String(config.persist.version)}`,
      );
    }
    this.persistKey = config.persist ? `ws:v${config.persist.version}` : null;

    if (this.persistKey) {
      // Restore before subscribing so restore-time events don't trigger writes.
      this.restoreFromStorage();
      this.adapter.subscribe(() => this.persistToStorage());
    }

    // Direct URL access (spec §6.2): a workspace URL loaded directly (fresh
    // tab, page reload) re-evaluates auth with isDirectAccess: true.
    this.resolveDirectAccess();
  }

  private onCredentialAttempt: ((input: CredentialInput, workspaceId: string) => void) | undefined;

  // ─── direct access (spec §6.2 / §6.4) ────────────────────────────────────────

  private resolveDirectAccess(): void {
    if (typeof window === "undefined") return;
    const reconstructed = this.descriptorFromLocation();
    if (!reconstructed) return;

    const template = this.templates[reconstructed.template]!;
    const rule = template.auth ?? { type: "public" as const };

    // Persistence restore may already know this workspace; otherwise adopt the
    // descriptor reconstructed from the URL.
    let workspace = this.adapter.getAll().find((w) => w.id === reconstructed.id);
    if (!workspace) {
      workspace = reconstructed;
      this.channels.set(workspace.id, this.createChannelPair(workspace.id));
      this.origins.set(workspace.id, "/");
      void this.adapter.open(workspace);
    }

    if (rule.type === "public") {
      this.setAuthGranted(workspace.id, true);
      return;
    }

    // Credential rules don't auto-prompt here — the AuthGate collects the
    // credentials and calls retryAuth(). Everything else re-evaluates now.
    this.setAuthGranted(workspace.id, false);
    if (rule.type === "credential") return;

    const workspaceId = workspace.id;
    void this.guard
      .evaluate(rule, {
        workspaceId,
        template: workspace.template,
        params: workspace.params,
        isDirectAccess: true,
      })
      .then((granted) => {
        if (granted) {
          this.setAuthGranted(workspaceId, true);
        } else {
          this.emitManagerEvent({ type: "workspace:auth-failed", workspaceId, rule });
        }
      });
  }

  /**
   * Reconstructs a workspace descriptor from the current location using the
   * template schema for param deserialization (spec §5.3). Returns null when
   * the location is not a workspace URL or the template is unknown.
   */
  private descriptorFromLocation(): WorkspaceDescriptor | null {
    const { pathname, search } = window.location;
    if (!pathname.startsWith(this.basePath + "/")) return null;

    const [templateKey, id] = pathname.slice(this.basePath.length + 1).split("/");
    if (!templateKey || !id) return null;
    const template = this.templates[templateKey];
    if (!template) return null;

    const searchParams = new URLSearchParams(search);
    const title = searchParams.get("title") ?? templateKey;

    let params: WorkspaceParams = {};
    if (template.schema) {
      const schema: ParamSchema = {};
      for (const [key, type] of Object.entries(template.schema)) {
        if (type !== undefined) schema[key] = type;
      }
      params = paramsToRecord(schema, searchParams) as WorkspaceParams;
    } else {
      // No schema: all values are strings (spec §5.3).
      for (const [key, value] of searchParams.entries()) {
        if (key === "title") continue;
        params[key] = value;
      }
    }

    const rule = template.auth ?? { type: "public" as const };
    return {
      id,
      template: templateKey,
      title,
      params,
      createdAt: Date.now(),
      auth: { type: rule.type, granted: false },
    };
  }

  /**
   * Re-evaluates a workspace's auth rule (spec §6.4 AuthGate retry).
   * Credentials, when provided, are forwarded to onCredentialAttempt and used
   * for credential-rule validation.
   */
  async retryAuth(id: string, input?: CredentialInput): Promise<void> {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    const template = this.templates[workspace.template];
    const rule = template?.auth ?? { type: "public" as const };

    if (input) this.onCredentialAttempt?.(input, id);

    const granted = await this.guard.evaluate(
      rule,
      {
        workspaceId: id,
        template: workspace.template,
        params: workspace.params,
        isDirectAccess: true,
      },
      input,
    );

    if (granted) {
      this.setAuthGranted(id, true);
    } else {
      this.emitManagerEvent({ type: "workspace:auth-failed", workspaceId: id, rule });
    }
  }

  private setAuthGranted(id: string, granted: boolean): void {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace || workspace.auth.granted === granted) return;
    (workspace.auth as { granted: boolean }).granted = granted;
    this.emitManagerEvent({ type: "workspace:updated", workspace: { ...workspace } });
    this.persistToStorage();
  }

  // ─── persistence ─────────────────────────────────────────────────────────────

  private restoreFromStorage(): void {
    const storage = getSessionStorage();
    if (!storage || !this.persistKey) return;

    // Version mismatch: discard state stored under any other version key.
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && PERSIST_KEY_PATTERN.test(key) && key !== this.persistKey) {
        storage.removeItem(key);
      }
    }

    const raw = storage.getItem(this.persistKey);
    if (!raw) return;

    let state: PersistedState;
    try {
      state = JSON.parse(raw) as PersistedState;
      if (!state || !Array.isArray(state.workspaces)) throw new Error("malformed");
    } catch {
      storage.removeItem(this.persistKey);
      return;
    }

    // Drop workspaces whose template is no longer declared.
    const descriptors = state.workspaces.filter((w) => this.templates[w.template]);
    if (descriptors.length === 0) return;

    for (const d of descriptors) {
      this.channels.set(d.id, this.createChannelPair(d.id));
      this.origins.set(d.id, state.origins?.[d.id] ?? "/");
    }

    this.adapter.restoreState(descriptors);

    if (state.currentId && descriptors.some((d) => d.id === state.currentId)) {
      void this.adapter.focus(state.currentId);
    }
  }

  private persistToStorage(): void {
    const storage = getSessionStorage();
    if (!storage || !this.persistKey) return;

    const state: PersistedState = {
      workspaces: this.adapter.getAll(),
      currentId: this.adapter.getCurrent()?.id ?? null,
      origins: Object.fromEntries(this.origins),
    };
    try {
      storage.setItem(this.persistKey, JSON.stringify(state));
    } catch {
      // Quota exceeded or storage unavailable — persistence degrades to off.
    }
  }

  // ─── adapterType ────────────────────────────────────────────────────────────

  get adapterType() {
    return this.adapter.type;
  }

  /** Channels are bridged across tabs under the tabs adapter (spec §7.5). */
  private createChannelPair(workspaceId: string): WorkspaceChannelPair {
    return createWorkspaceChannel(workspaceId, this.bus, {
      crossTab: this.adapter.type === "tabs",
    });
  }

  // ─── open ────────────────────────────────────────────────────────────────────

  async open(input: OpenWorkspaceInput): Promise<WorkspaceDescriptor> {
    const templateKey = String(input.template);
    const template = this.templates[templateKey];
    if (!template) {
      throw new WorkspaceError("ADAPTER_ERROR", `Unknown template: ${templateKey}`, null);
    }

    // maxWorkspaces check (global, across all templates)
    if (this.adapter.getAll().length >= this.maxWorkspaces) {
      throw new WorkspaceError(
        "MAX_WORKSPACES_REACHED",
        `Maximum open workspaces (${this.maxWorkspaces}) reached`,
        null,
      );
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
      this.emitManagerEvent({
        type: "workspace:auth-failed",
        workspaceId: descriptor.id,
        rule: authRule,
      });
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
    const channelPair = this.createChannelPair(descriptor.id);
    this.channels.set(descriptor.id, channelPair);

    // Install an explicit origin as the background route: replace the
    // current entry so the launching page drops out of history, then let the
    // workspace URL be pushed on top of it below. Runs only after auth
    // passed — a rejected open() must leave the route untouched.
    if (input.origin !== undefined) {
      this._navigate(input.origin, { replace: true });
    }

    // Store origin — the current route path (never a workspace URL).
    const origin = input.origin ?? this.getCurrentPath();
    this.origins.set(descriptor.id, origin);

    // Open in adapter
    try {
      await this.adapter.open(descriptor);
    } catch (err) {
      // Roll back channel/origin created above, then surface as ADAPTER_ERROR.
      channelPair.destroy();
      this.channels.delete(descriptor.id);
      this.origins.delete(descriptor.id);
      throw this.adapterFailure(descriptor.id, "open", err);
    }

    // Build URL and navigate
    const url = this.buildUrl(descriptor);
    this._navigate(url, {
      state: { origin, workspaceId: descriptor.id },
      navType: "workspace-open",
    });

    return descriptor;
  }

  // ─── focus ───────────────────────────────────────────────────────────────────

  async focus(id: string): Promise<WorkspaceDescriptor> {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }

    try {
      await this.adapter.focus(id);
    } catch (err) {
      throw this.adapterFailure(id, "focus", err);
    }

    const url = this.buildUrl(workspace);
    this._navigate(url, { navType: "workspace-open" });

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
    // Origin: window.history.state is authoritative when it belongs to this
    // workspace (spec §4.13); the in-memory map covers background workspaces
    // and persistence-restored ones.
    // prettier-ignore
    const historyState = typeof window !== "undefined" ? (window.history.state as { origin?: string; workspaceId?: string } | null) : null;
    const origin =
      historyState?.workspaceId === id && historyState.origin
        ? historyState.origin
        : this.origins.get(id) ?? "/";
    this.origins.delete(id);

    try {
      await this.adapter.close(id, autoFocus);
    } catch (err) {
      throw this.adapterFailure(id, "close", err);
    }

    // Navigate to origin
    this._navigate(origin, { navType: "workspace-close" });
  }

  /** Emits workspace:error and returns a WorkspaceError(ADAPTER_ERROR) to throw. */
  private adapterFailure(workspaceId: string, op: string, err: unknown): WorkspaceError {
    const error = err instanceof Error ? err : new Error(String(err));
    this.emitManagerEvent({ type: "workspace:error", workspaceId, error });
    return new WorkspaceError(
      "ADAPTER_ERROR",
      `Adapter ${op} failed: ${error.message}`,
      workspaceId,
    );
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

    // Only sync the URL when the updated workspace is the focused one —
    // updating a background workspace must not clobber the current URL.
    if (this.adapter.getCurrent()?.id === id) {
      const url = this.buildUrl(updated);
      this._navigate(url, { replace: true });
    }

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
    // Adapter events pass through; manager-originated events (auth-failed,
    // error) are dispatched to the same listeners via emitManagerEvent.
    this.managerListeners.add(listener);
    const unsubscribe = this.adapter.subscribe(listener);
    return () => {
      this.managerListeners.delete(listener);
      unsubscribe();
    };
  }

  private emitManagerEvent(event: WorkspaceEvent): void {
    for (const listener of this.managerListeners) {
      listener(event);
    }
  }

  // ─── channel access ──────────────────────────────────────────────────────────

  getChannel(workspaceId: string): WorkspaceChannelPair | null {
    return this.channels.get(workspaceId) ?? null;
  }

  /** The URL of an open workspace (containers use this for scroll→URL sync). */
  getUrl(id: string): string {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    return this.buildUrl(workspace);
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
