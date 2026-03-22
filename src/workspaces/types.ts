import type React from "react";
import type { Channel, ChannelContract } from "@mikrostack/chbus";
import type { ParamSchema } from "../utils/params";

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

// ─── WorkspaceTemplate ────────────────────────────────────────────────────────

export interface WorkspaceTemplate<TParams extends WorkspaceParams = WorkspaceParams> {
  component: React.ComponentType<WorkspaceComponentProps<TParams>>;
  defaultTitle?: string | ((params: TParams) => string);
  auth?: WorkspaceAuthRule;
  maxInstances?: number;
  schema?: Partial<Record<keyof TParams & string, ParamSchema[string]>>;
}

// The templates map.
export type WorkspaceTemplateMap = Record<string, WorkspaceTemplate<WorkspaceParams>>;

// Infers TParams from a WorkspaceTemplate<TParams>.
export type InferParams<T> = T extends WorkspaceTemplate<infer P> ? P : never;

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
}
