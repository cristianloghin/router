/** Shape stored in window.history.state when a workspace URL is pushed. */
interface WorkspaceHistoryState {
  origin: string;
  workspaceId: string;
}

function isWorkspaceState(v: unknown): v is WorkspaceHistoryState {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["origin"] === "string" &&
    typeof (v as Record<string, unknown>)["workspaceId"] === "string"
  );
}

// ─── history.state index ──────────────────────────────────────────────────────

/**
 * Key under which the router stamps its cursor onto each history entry.
 *
 * popstate says *that* the user moved but not which way, and the browser
 * exposes no position. Carrying the cursor on the entry itself makes the
 * direction readable: compare the arriving entry's index with the one the
 * router thinks it is on.
 *
 * Namespaced because `navigate(to, { state })` writes app state onto the same
 * object; the two are merged, and this key is the only part the router owns.
 */
export const HISTORY_INDEX_KEY = "__mksRouterIndex";

/** Merges the router's cursor into an app-supplied history state object. */
export function withHistoryIndex(
  state: Record<string, unknown> | null | undefined,
  index: number,
): Record<string, unknown> {
  return { ...(state ?? {}), [HISTORY_INDEX_KEY]: index };
}

/**
 * Reads the cursor off the current history entry, or null when the entry
 * predates the router (the launch entry, or one pushed by something else).
 */
export function readHistoryIndex(): number | null {
  const state = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  const value = (state as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof value === "number" ? value : null;
}

// ─── HistoryStack ─────────────────────────────────────────────────────────────

/**
 * Session-scoped mirror of the browser's history, sitting alongside
 * window.history. It is the source of truth for canGoBack and for the path
 * back() returns to.
 *
 * Modelled as entries + a cursor rather than a push/pop stack, because the
 * browser's back and forward buttons move a cursor — they do not pop. A stack
 * can only be walked one way, so a forward move after a back had nowhere to
 * read from, and going back left the stack unchanged (roadmap P3).
 *
 * `entries[index]` is the path currently showing. Not persisted across
 * reloads: a fresh page seeds a fresh cursor at 0.
 */
export class HistoryStack {
  private entries: string[] = [];
  private index = 0;

  /** Cursor position. Mirrors the index stamped on the current entry. */
  get currentIndex(): number {
    return this.index;
  }

  get canGoBack(): boolean {
    return this.index > 0;
  }

  /** Installs the launch entry. */
  seed(path: string): void {
    this.entries = [path];
    this.index = 0;
  }

  /** Advances the cursor onto a new entry, discarding any forward entries. */
  push(path: string): void {
    this.index += 1;
    this.entries.length = this.index;
    this.entries[this.index] = path;
  }

  /** Relabels the current entry, leaving the cursor and depth alone. */
  replace(path: string): void {
    if (this.entries.length === 0) {
      this.seed(path);
      return;
    }
    this.entries[this.index] = path;
  }

  /** The path one step back, or undefined at the start of the session. */
  peekBack(): string | undefined {
    return this.index > 0 ? this.entries[this.index - 1] : undefined;
  }

  /**
   * Adopts a cursor position reported by a popstate. Clamped at 0: an entry
   * carrying no index (one the router never stamped) reads as the start of
   * the session.
   */
  moveTo(index: number): void {
    this.index = Math.max(0, index);
  }

  clear(): void {
    this.entries = [];
    this.index = 0;
  }

  // ─── window.history.state integration ──────────────────────────────────────

  /**
   * Pushes a workspace URL into window.history, embedding the origin path and
   * workspaceId in the history state for later retrieval by close().
   */
  pushWorkspaceEntry(workspaceId: string, originPath: string): void {
    const state: WorkspaceHistoryState = { origin: originPath, workspaceId };
    window.history.pushState(state, "");
  }

  /** Returns the origin path stored by pushWorkspaceEntry, or null. */
  readWorkspaceOrigin(): string | null {
    const state = window.history.state;
    return isWorkspaceState(state) ? state.origin : null;
  }

  /** Returns the workspaceId stored by pushWorkspaceEntry, or null. */
  readWorkspaceId(): string | null {
    const state = window.history.state;
    return isWorkspaceState(state) ? state.workspaceId : null;
  }
}
