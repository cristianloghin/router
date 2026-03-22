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

// ─── HistoryStack ─────────────────────────────────────────────────────────────

/**
 * Session-scoped history stack that sits alongside window.history.
 * It is the source of truth for canGoBack and workspace-origin lookup.
 *
 * The stack is not persisted across page reloads.
 */
export class HistoryStack {
  private stack: string[] = [];

  get canGoBack(): boolean {
    return this.stack.length > 0;
  }

  push(path: string): void {
    this.stack.push(path);
  }

  pop(): string | undefined {
    return this.stack.pop();
  }

  /** Replaces the top entry. Behaves like push when the stack is empty. */
  replace(path: string): void {
    if (this.stack.length === 0) {
      this.stack.push(path);
    } else {
      this.stack[this.stack.length - 1] = path;
    }
  }

  clear(): void {
    this.stack = [];
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
