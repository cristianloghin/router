import type {
  AdapterType,
  WorkspaceAdapter,
  WorkspaceDescriptor,
  WorkspaceEvent,
  WorkspaceParams,
} from "../types";

// ─── StackAdapter ─────────────────────────────────────────────────────────────

/**
 * Manages workspaces as an ordered array with a currentIndex.
 * Navigation is driven by index; layout is a card stack.
 */
export class StackAdapter implements WorkspaceAdapter {
  readonly type: AdapterType = "stack";

  protected workspaces: WorkspaceDescriptor[] = [];
  protected currentIndex = -1;
  private listeners: Set<(event: WorkspaceEvent) => void> = new Set();

  async open(descriptor: WorkspaceDescriptor): Promise<void> {
    this.workspaces.push(descriptor);
    this.currentIndex = this.workspaces.length - 1;
    this.emit({ type: "workspace:opened", workspace: descriptor });
  }

  async close(id: string, autoFocus = true): Promise<void> {
    const idx = this.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;

    this.workspaces.splice(idx, 1);
    this.emit({ type: "workspace:closed", workspaceId: id });

    if (!autoFocus) return;
    if (this.workspaces.length === 0) {
      this.currentIndex = -1;
      return;
    }

    // Focus adjacent: prefer next, fall back to previous (now last).
    const nextIdx = Math.min(idx, this.workspaces.length - 1);
    this.currentIndex = nextIdx;
    const next = this.workspaces[nextIdx];
    if (next) {
      this.emit({ type: "workspace:focused", workspaceId: next.id });
    }
  }

  async focus(id: string): Promise<void> {
    const idx = this.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;
    this.currentIndex = idx;
    this.emit({ type: "workspace:focused", workspaceId: id });
  }

  updateParams(id: string, params: WorkspaceParams): void {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.params = params;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }

  updateTitle(id: string, title: string): void {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.title = title;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }

  getAll(): WorkspaceDescriptor[] {
    return [...this.workspaces];
  }

  getCurrent(): WorkspaceDescriptor | null {
    return this.workspaces[this.currentIndex] ?? null;
  }

  restoreState(descriptors: WorkspaceDescriptor[]): void {
    this.workspaces = [...descriptors];
    this.currentIndex = descriptors.length > 0 ? 0 : -1;
    this.emit({ type: "workspace:synced", workspaces: this.getAll() });
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: WorkspaceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
