import type {
  WorkspaceAdapter,
  WorkspaceDescriptor,
  WorkspaceEvent,
  WorkspaceParams,
} from "../types";

// BroadcastChannel message shapes
type BcMessage =
  | { type: "workspace:opened";  workspace: WorkspaceDescriptor }
  | { type: "workspace:closed";  workspaceId: string };

// ─── BrowserTabAdapter ────────────────────────────────────────────────────────

/**
 * Opens workspaces in new browser tabs via window.open.
 * Uses BroadcastChannel to sync state across tabs.
 */
export class BrowserTabAdapter implements WorkspaceAdapter {
  readonly type = "tabs" as const;

  private workspaces: WorkspaceDescriptor[] = [];
  private listeners: Set<(event: WorkspaceEvent) => void> = new Set();
  private bc: BroadcastChannel | null = null;
  private workspaceBasePath: string;

  constructor(workspaceBasePath = "/workspace") {
    this.workspaceBasePath = workspaceBasePath;
    this.initBroadcastChannel();
    this.syncCurrentFromUrl();
  }

  async open(descriptor: WorkspaceDescriptor): Promise<void> {
    const url = this.buildUrl(descriptor);
    window.open(url, "_blank");
    this.workspaces.push(descriptor);
    this.emit({ type: "workspace:opened", workspace: descriptor });
    this.bc?.postMessage({ type: "workspace:opened", workspace: descriptor } satisfies BcMessage);
  }

  async close(id: string, _autoFocus = true): Promise<void> {
    const current = this.getCurrent();
    if (current?.id === id) {
      window.close();
    }
    // Cannot programmatically close other tabs.
  }

  async focus(id: string): Promise<void> {
    // Browsers cannot programmatically focus other tabs.
    // Emit for local consistency.
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

  /**
   * Reads the workspace id from the current tab's URL.
   * URL format: /workspace/{template}/{id}?...
   */
  getCurrent(): WorkspaceDescriptor | null {
    const pathname = window.location.pathname;
    const prefix = this.workspaceBasePath + "/";
    if (!pathname.startsWith(prefix)) return null;

    const rest = pathname.slice(prefix.length);
    const parts = rest.split("/");
    // parts[0] = template, parts[1] = id
    const id = parts[1];
    if (!id) return null;

    return this.workspaces.find((w) => w.id === id) ?? null;
  }

  restoreState(descriptors: WorkspaceDescriptor[]): void {
    this.workspaces = [...descriptors];
    this.emit({ type: "workspace:synced", workspaces: this.getAll() });
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.bc?.close();
    this.bc = null;
    this.listeners.clear();
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private initBroadcastChannel(): void {
    try {
      this.bc = new BroadcastChannel("workspace-router");
      this.bc.onmessage = (event: MessageEvent<BcMessage>) => {
        const msg = event.data;
        if (msg.type === "workspace:opened") {
          const exists = this.workspaces.some((w) => w.id === msg.workspace.id);
          if (!exists) {
            this.workspaces.push(msg.workspace);
          }
          this.emit({ type: "workspace:opened", workspace: msg.workspace });
        } else if (msg.type === "workspace:closed") {
          this.workspaces = this.workspaces.filter((w) => w.id !== msg.workspaceId);
          this.emit({ type: "workspace:closed", workspaceId: msg.workspaceId });
        }
      };
    } catch {
      // BroadcastChannel not available
    }
  }

  private syncCurrentFromUrl(): void {
    // When a workspace tab is opened, the URL already contains the id.
    // We can't reconstruct the full descriptor from the URL alone here;
    // the AppProvider does that from sessionStorage or URL params.
  }

  private buildUrl(descriptor: WorkspaceDescriptor): string {
    const params = new URLSearchParams();
    params.set("title", descriptor.title);
    for (const [key, value] of Object.entries(descriptor.params)) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else {
        params.set(key, String(value));
      }
    }
    return `${this.workspaceBasePath}/${descriptor.template}/${descriptor.id}?${params.toString()}`;
  }

  private emit(event: WorkspaceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
