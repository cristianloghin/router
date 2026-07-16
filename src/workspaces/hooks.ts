import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useWorkspaceManagerContext } from "./context";
import type {
  AdapterType,
  WorkspaceDescriptor,
  WorkspaceParams,
  WorkspaceEvent,
  WorkspaceUnion,
  WorkspaceTemplateMap,
  OpenWorkspaceInput,
  InferParams,
  RegisteredWorkspaces,
} from "./types";
import type { Channel, ChannelContract } from "@mikrostack/chbus";

// ─── useWorkspaces ────────────────────────────────────────────────────────────

export interface WorkspacesSnapshot<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
> {
  workspaces: WorkspaceUnion<TWorkspaces>[];
  current: WorkspaceUnion<TWorkspaces> | null;
  adapterType: AdapterType;
}

/**
 * Subscribing workspace state: `{ workspaces, current, adapterType }`,
 * re-rendered on every workspace event. Actions live on the non-subscribing
 * useWorkspaceActions().
 *
 * With a selector, only the selected slice is returned and re-renders are
 * skipped while `isEqual` (default Object.is) considers it unchanged.
 * **Footgun:** a selector that returns a fresh array/object each call (e.g.
 * `s => s.workspaces.filter(...)`) never compares equal under Object.is —
 * pass the exported `shallowEqual` as `isEqual` when deriving collections.
 *
 * Template keys and param shapes are compile-checked when the app's
 * workspaces are Registered (see Register).
 */
export function useWorkspaces<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
>(): WorkspacesSnapshot<TWorkspaces>;
export function useWorkspaces<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
  TSelected = unknown,
>(
  selector: (snapshot: WorkspacesSnapshot<TWorkspaces>) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
): TSelected;
export function useWorkspaces(
  // The implementation is typed against the loose map — the app may augment
  // Register, and this file must compile identically either way (the
  // playground compiles src/ with an augmentation in scope).
  selector?: (snapshot: WorkspacesSnapshot<WorkspaceTemplateMap>) => unknown,
  isEqual?: (a: unknown, b: unknown) => boolean,
): unknown {
  const manager = useWorkspaceManagerContext();

  const snapshotRef = useRef<WorkspacesSnapshot<WorkspaceTemplateMap>>({
    workspaces: manager.getAll(),
    current: manager.getCurrent(),
    adapterType: manager.adapterType,
  });

  const subscribe = useCallback(
    (notify: () => void) => {
      return manager.subscribe((_event: WorkspaceEvent) => {
        snapshotRef.current = {
          workspaces: manager.getAll(),
          current: manager.getCurrent(),
          adapterType: manager.adapterType,
        };
        notify();
      });
    },
    [manager],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  // Last selection that actually rendered. Survives selector identity changes
  // (inline selectors recreate getSelection every render), so the equality
  // bailout still has a baseline to compare against.
  const lastRenderedRef = useRef<{ hasValue: boolean; value: unknown }>({
    hasValue: false,
    value: null,
  });

  // Memoizes the selection per snapshot identity: useSyncExternalStore calls
  // this repeatedly within a render and re-renders whenever it returns a new
  // reference, so an uncached selector returning fresh objects would loop.
  const getSelection = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot: WorkspacesSnapshot<WorkspaceTemplateMap>;
    let memoizedSelection: unknown;
    const lastRendered = lastRenderedRef.current;
    const equal = isEqual ?? Object.is;

    return (): unknown => {
      const nextSnapshot = getSnapshot();
      if (!selector) return nextSnapshot;

      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        let nextSelection = selector(nextSnapshot);
        if (lastRendered.hasValue && equal(lastRendered.value, nextSelection)) {
          nextSelection = lastRendered.value;
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }

      if (memoizedSnapshot === nextSnapshot) return memoizedSelection;

      const nextSelection = selector(nextSnapshot);
      memoizedSnapshot = nextSnapshot;
      if (!equal(memoizedSelection, nextSelection)) {
        memoizedSelection = nextSelection;
      }
      return memoizedSelection;
    };
  }, [getSnapshot, selector, isEqual]);

  const selection = useSyncExternalStore(subscribe, getSelection, getSelection);

  useEffect(() => {
    lastRenderedRef.current.hasValue = true;
    lastRenderedRef.current.value = selection;
  });

  return selection;
}

// ─── useWorkspaceActions ──────────────────────────────────────────────────────

/**
 * Non-subscribing workspace actions — never causes a re-render, and the
 * returned object is referentially stable. getAll()/getCurrent() are
 * non-reactive readers for handler-time reads; for state that should drive
 * rendering, use useWorkspaces().
 *
 * Template keys and param shapes are compile-checked when the app's
 * workspaces are Registered (see Register); an explicit generic
 * (`useWorkspaceActions<typeof workspaces>()`) also works.
 */
export function useWorkspaceActions<
  TWorkspaces extends Record<string, unknown> = RegisteredWorkspaces,
>() {
  const manager = useWorkspaceManagerContext();

  return useMemo(
    () => ({
      /**
       * Focus-or-open: a live workspace with the same template and
       * deep-equal params (arrays order-sensitive) is focused and returned
       * as-is — `title` is ignored on match, `origin` is still honored (a
       * navigation directive, not workspace state). Otherwise opens a new
       * instance. Params are identity: keep view-state out of them.
       */
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

      getAll(): WorkspaceUnion<TWorkspaces>[] {
        return manager.getAll() as WorkspaceUnion<TWorkspaces>[];
      },

      getCurrent(): WorkspaceUnion<TWorkspaces> | null {
        return manager.getCurrent() as WorkspaceUnion<TWorkspaces> | null;
      },
    }),
    [manager],
  );
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
