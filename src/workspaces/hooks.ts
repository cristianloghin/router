import { useCallback, useRef, useSyncExternalStore } from "react";
import { useWorkspaceManagerContext } from "./context";
import type {
  WorkspaceDescriptor,
  WorkspaceParams,
  WorkspaceEvent,
  OpenWorkspaceInput,
  InferParams,
  RegisteredWorkspaces,
} from "./types";
import type { Channel, ChannelContract } from "@mikrostack/chbus";

// ─── useWorkspaces ────────────────────────────────────────────────────────────

interface WorkspacesSnapshot {
  workspaces: WorkspaceDescriptor[];
  current: WorkspaceDescriptor | null;
}

/**
 * Template keys and param shapes are compile-checked when the app's
 * workspaces are Registered (see Register); an explicit generic
 * (`useWorkspaces<typeof workspaces>()`) also works.
 */
export function useWorkspaces<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
>() {
  const manager = useWorkspaceManagerContext();

  const snapshotRef = useRef<WorkspacesSnapshot>({
    workspaces: manager.getAll(),
    current: manager.getCurrent(),
  });

  const subscribe = useCallback(
    (notify: () => void) => {
      return manager.subscribe((_event: WorkspaceEvent) => {
        snapshotRef.current = {
          workspaces: manager.getAll(),
          current: manager.getCurrent(),
        };
        notify();
      });
    },
    [manager],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    workspaces: snapshot.workspaces,
    current: snapshot.current,
    adapterType: manager.adapterType,

    open<TKey extends keyof TWorkspaces>(
      input: OpenWorkspaceInput<TKey, InferParams<TWorkspaces[TKey]>>,
    ): Promise<WorkspaceDescriptor<InferParams<TWorkspaces[TKey]>>> {
      return manager.open(input as OpenWorkspaceInput) as Promise<
        WorkspaceDescriptor<InferParams<TWorkspaces[TKey]>>
      >;
    },

    focus(id: string): Promise<WorkspaceDescriptor> {
      return manager.focus(id);
    },

    close(id: string, autoFocus?: boolean): Promise<void> {
      return manager.close(id, autoFocus);
    },

    updateParams<TKey extends keyof TWorkspaces>(
      id: string,
      params: Partial<InferParams<TWorkspaces[TKey]>>,
    ): WorkspaceDescriptor {
      return manager.updateParams(id, params as WorkspaceParams);
    },

    updateTitle(id: string, title: string): WorkspaceDescriptor {
      return manager.updateTitle(id, title);
    },
  };
}

// ─── useWorkspace ─────────────────────────────────────────────────────────────

interface WorkspaceHookResult<TParams extends WorkspaceParams = WorkspaceParams> {
  workspace: WorkspaceDescriptor<TParams>;
  params: TParams;
}

/**
 * Reactive state for a single workspace. Channels are not exposed here — the
 * workspace side receives its channel via component props, the root side uses
 * useWorkspaceChannel(id) (which is perspective-correct).
 */
export function useWorkspace<TParams extends WorkspaceParams = WorkspaceParams>(
  id: string,
): WorkspaceHookResult<TParams> | null {
  const manager = useWorkspaceManagerContext();

  const getState = useCallback((): WorkspaceHookResult<TParams> | null => {
    const workspace = manager.getAll().find((w) => w.id === id) as
      | WorkspaceDescriptor<TParams>
      | undefined;
    if (!workspace) return null;

    return {
      workspace,
      params: workspace.params,
    };
  }, [manager, id]);

  const snapshotRef = useRef<WorkspaceHookResult<TParams> | null>(getState());

  const subscribe = useCallback(
    (notify: () => void) => {
      return manager.subscribe((event: WorkspaceEvent) => {
        const isRelevant =
          (event.type === "workspace:updated" && event.workspace.id === id) ||
          (event.type === "workspace:opened" && event.workspace.id === id) ||
          (event.type === "workspace:closed" && event.workspaceId === id);

        if (isRelevant) {
          snapshotRef.current = getState();
          notify();
        }
      });
    },
    [manager, id, getState],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── useWorkspaceChannel ──────────────────────────────────────────────────────

interface RootChannelView {
  /** Root sends commands to the workspace via outbound. */
  outbound: Channel<ChannelContract>;
  /** Root receives messages from the workspace via inbound. */
  inbound: Channel<ChannelContract>;
}

export function useWorkspaceChannel(workspaceId: string): RootChannelView | null {
  const manager = useWorkspaceManagerContext();

  const getState = useCallback((): RootChannelView | null => {
    const pair = manager.getChannel(workspaceId);
    if (!pair) return null;
    return { outbound: pair.root.outbound, inbound: pair.root.inbound };
  }, [manager, workspaceId]);

  const snapshotRef = useRef<RootChannelView | null>(getState());

  // Eagerly update snapshot when workspaceId changes so useSyncExternalStore
  // sees the fresh value immediately (handles dynamic IDs).
  const prevIdRef = useRef(workspaceId);
  if (prevIdRef.current !== workspaceId) {
    prevIdRef.current = workspaceId;
    snapshotRef.current = getState();
  }

  const subscribe = useCallback(
    (notify: () => void) => {
      return manager.subscribe((event: WorkspaceEvent) => {
        const isRelevant =
          (event.type === "workspace:opened" && event.workspace.id === workspaceId) ||
          (event.type === "workspace:closed" && event.workspaceId === workspaceId);

        if (isRelevant) {
          snapshotRef.current = getState();
          notify();
        }
      });
    },
    [manager, workspaceId, getState],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
