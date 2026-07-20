import type React from "react";
import type { Channel, ChannelContract } from "@mikrostack/chbus";
import type { ParamSchema } from "../utils/params";
import type { Register } from "../register";

// ─── WorkspaceParams ──────────────────────────────────────────────────────────

export type WorkspaceParams = Record<
  string,
  string | number | boolean | string[] | number[]
>;

// ─── WorkspaceDescriptor ──────────────────────────────────────────────────────

export interface WorkspaceDescriptor<TParams extends WorkspaceParams = WorkspaceParams> {
  readonly id: string;
  readonly template: string;
  title: string;
  params: TParams;
  readonly createdAt: number;
  readonly auth: ResolvedWorkspaceAuth;
}

export interface ResolvedWorkspaceAuth {
  type: "public" | "authenticated" | "time-limited" | "credential" | "custom";
  granted: boolean;
}

// ─── WorkspaceChannel ─────────────────────────────────────────────────────────

export interface WorkspaceChannel<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
> {
  inbound: Channel<TRootToWorkspace>;
  outbound: Channel<TWorkspaceToRoot>;
}

// ─── WorkspaceLifecycleContract ───────────────────────────────────────────────

/**
 * Contract for the router-owned `lifecycle` channel, one per workspace in
 * the `workspace:{id}` namespace. The router *emits* on it; nothing in the
 * library subscribes.
 *
 * "Entered/exited view" means *settled as current*, not raw visibility —
 * mid-drag both swipe neighbours are partially visible, so settle is the
 * boundary. Per adapter: swipe = settled index, stack = top, tabs = the
 * focused tab.
 *
 * Deliberately NOT exposed on WorkspaceChannel or useWorkspaceChannel():
 * for view state, prefer the reactive `useWorkspaces().current` (a level,
 * which seeds correctly at mount — every open workspace is mounted at once,
 * and the first view_entered fires before a component's subscribe effect
 * runs). These edges exist for consumers that can't use that: code outside
 * React, or anything needing view_exited strictly before view_entered.
 *
 * Because the channel lives on the app-provided `bus`, apps subscribe by
 * name — chbus channels are get-or-create:
 *
 * ```ts
 * bus.namespace(`workspace:${id}`)
 *    .channel<WorkspaceLifecycleContract>("lifecycle")
 *    .on("view_exited", async () => player.pause());
 * ```
 *
 * The channel exists only between open() and close(); subscribe after
 * workspace:opened and don't hold the handle across a close.
 */
export type WorkspaceLifecycleContract = {
  view_entered: null;
  view_exited: null;
};

// ─── WorkspaceComponentProps ──────────────────────────────────────────────────

export interface WorkspaceComponentProps<TParams extends WorkspaceParams = WorkspaceParams> {
  workspace: WorkspaceDescriptor<TParams>;
  channel: WorkspaceChannel;
}

// ─── Auth rules ───────────────────────────────────────────────────────────────

export interface CredentialInput {
  username: string;
  password: string;
}

export interface AuthCheckContext {
  workspaceId: string;
  template: string;
  params: WorkspaceParams;
  isDirectAccess: boolean;
}

export type WorkspaceAuthRule =
  | { type: "public" }
  | { type: "authenticated" }
  | { type: "time-limited"; expiresAt: number | (() => number) }
  | { type: "credential"; validate: (input: CredentialInput) => boolean | Promise<boolean> }
  | { type: "custom"; check: (context: AuthCheckContext) => boolean | Promise<boolean> };

/**
 * Props for the AuthGate component rendered in place of a workspace whose
 * direct-access auth check failed (spec §6.4). Override the default gate via
 * AppConfig.components.AuthGate.
 */
export interface AuthGateProps {
  workspace: WorkspaceDescriptor;
  authRule: WorkspaceAuthRule;
  retry: (input?: CredentialInput) => Promise<void>;
}

// ─── WorkspaceTemplate ────────────────────────────────────────────────────────

export interface WorkspaceTemplate<TParams extends WorkspaceParams = WorkspaceParams> {
  component: React.ComponentType<WorkspaceComponentProps<TParams>>;
  defaultTitle?: string | ((params: TParams) => string);
  auth?: WorkspaceAuthRule;
  maxInstances?: number;
  schema?: Partial<Record<keyof TParams & string, ParamSchema[string]>>;
  /**
   * Whether instances of this template survive an app restart when
   * `config.persist` is enabled (default: true). Set false for ephemeral
   * templates (e.g. a scratchpad) that should never be restored.
   */
  persistent?: boolean;
}

// The templates map.
export type WorkspaceTemplateMap = Record<string, WorkspaceTemplate<WorkspaceParams>>;

// ─── Schema-first param typing ────────────────────────────────────────────────

type ParamTypeToTs<T> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : T extends "string[]"
        ? string[]
        : T extends "number[]"
          ? number[]
          : never;

/**
 * Derives the params record type from a template's runtime `schema` —
 * the schema is the single source of truth for workspace param shapes:
 *
 * ```ts
 * schema: { cameraId: "string", ids: "string[]" }
 * // → params: { cameraId: string; ids: string[] }
 * ```
 */
export type InferSchemaParams<TSchema> = {
  [K in keyof TSchema]: ParamTypeToTs<TSchema[K]>;
};

/**
 * Per-entry validation shape for defineWorkspaces: a template with a schema
 * must have a component typed for the schema-derived params; templates
 * without a schema are loosely typed.
 */
export type WorkspaceTemplateFor<V> = V extends { schema: infer S }
  ? WorkspaceTemplate<InferSchemaParams<S>>
  : WorkspaceTemplate<WorkspaceParams>;

/**
 * Infers a template's params: from its `schema` when present (schema-first),
 * falling back to the declared WorkspaceTemplate generic.
 */
export type InferParams<T> = T extends { schema: infer S }
  ? InferSchemaParams<S>
  : T extends WorkspaceTemplate<infer P>
    ? P
    : WorkspaceParams;

/** The app's registered workspace map (see Register), or the loose map. */
export type RegisteredWorkspaces = Register extends { workspaces: infer W }
  ? W
  : WorkspaceTemplateMap;

// ─── Descriptor union over registered templates ───────────────────────────────

/**
 * A WorkspaceDescriptor whose `template` is narrowed to one registered key
 * and whose `params` are typed for that template.
 */
export interface TypedWorkspaceDescriptor<
  TTemplate extends string = string,
  TParams extends WorkspaceParams = WorkspaceParams,
> extends WorkspaceDescriptor<TParams> {
  readonly template: TTemplate;
}

/**
 * Discriminated union of descriptors across the registered templates, with
 * `template` as the discriminant. Comparing it narrows `params`:
 *
 * ```ts
 * const walls = workspaces.filter((w) => w.template === "wall");
 * // walls[i].params is typed per the "wall" schema (TS ≥ 5.5 inferred
 * // predicates make the filter narrow without casts)
 * ```
 *
 * Without a Register augmentation this degrades to plain WorkspaceDescriptor.
 */
export type WorkspaceUnion<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
> = string extends keyof TWorkspaces
  ? WorkspaceDescriptor
  : {
      [K in keyof TWorkspaces & string]: TypedWorkspaceDescriptor<
        K,
        InferParams<TWorkspaces[K]>
      >;
    }[keyof TWorkspaces & string];

// ─── WorkspaceEvent ───────────────────────────────────────────────────────────

export type WorkspaceEvent =
  | { type: "workspace:opened";    workspace: WorkspaceDescriptor }
  | { type: "workspace:closed";    workspaceId: string }
  | { type: "workspace:focused";   workspaceId: string }
  /**
   * The current (in-view) workspace changed. Distinct from
   * workspace:focused on purpose: *focused* is a navigation act (history
   * semantics attach), *current-changed* is view state (none do) — so the
   * swipe settle path emits this and never that. `null` = the root page.
   */
  | { type: "workspace:current-changed"; workspaceId: string | null; previousId: string | null }
  | { type: "workspace:updated";   workspace: WorkspaceDescriptor }
  | { type: "workspace:synced";    workspaces: WorkspaceDescriptor[] }
  | { type: "workspace:auth-failed"; workspaceId: string; rule: WorkspaceAuthRule }
  | { type: "workspace:error";     workspaceId: string | null; error: Error };

// ─── WorkspaceAdapter ─────────────────────────────────────────────────────────

export type AdapterType = "stack" | "swipe" | "tabs";

export interface WorkspaceAdapter {
  readonly type: AdapterType;
  open(descriptor: WorkspaceDescriptor): Promise<void>;
  close(id: string, autoFocus?: boolean): Promise<void>;
  focus(id: string): Promise<void>;
  updateParams(id: string, params: WorkspaceParams): void;
  updateTitle(id: string, title: string): void;
  getAll(): WorkspaceDescriptor[];
  getCurrent(): WorkspaceDescriptor | null;
  restoreState(descriptors: WorkspaceDescriptor[]): void;
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;
}

// ─── WorkspaceError ───────────────────────────────────────────────────────────

export type WorkspaceErrorCode =
  | "AUTH_FAILED"
  | "MAX_INSTANCES_REACHED"
  | "MAX_WORKSPACES_REACHED"
  | "WORKSPACE_NOT_FOUND"
  | "ADAPTER_ERROR";

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly workspaceId: string | null;

  constructor(
    code: WorkspaceErrorCode,
    message: string,
    workspaceId: string | null = null,
  ) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.workspaceId = workspaceId;
  }
}

// ─── OpenWorkspaceInput ───────────────────────────────────────────────────────

export interface OpenWorkspaceInput<TKey = string, TParams = WorkspaceParams> {
  template: TKey;
  title: string;
  params: TParams;
  /**
   * Route to install as the workspace's background before opening: the
   * current history entry is replaced with it, then the workspace URL is
   * pushed. The root page shows it, swipe-to-root and close() return to
   * it, and the browser back button skips the launching page. Applied
   * only after the auth check passes. Omitted: the origin is wherever
   * the router currently is.
   */
  origin?: string;
}
