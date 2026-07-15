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

// ─── WorkspaceEvent ───────────────────────────────────────────────────────────

export type WorkspaceEvent =
  | { type: "workspace:opened";    workspace: WorkspaceDescriptor }
  | { type: "workspace:closed";    workspaceId: string }
  | { type: "workspace:focused";   workspaceId: string }
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
