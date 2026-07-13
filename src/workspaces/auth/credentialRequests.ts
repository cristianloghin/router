import type { CredentialInput } from "../types";

// ─── CredentialRequestStore ───────────────────────────────────────────────────

export interface PendingCredentialRequest {
  workspaceId: string;
  resolve: (input: CredentialInput | null) => void;
}

/**
 * Bridges WorkspaceGuard's credential requests to the built-in dialog
 * rendered by AppProvider (spec §6.2: "credential prompts via the library's
 * built-in credential dialog"). useSyncExternalStore-compatible.
 */
export class CredentialRequestStore {
  private pending: PendingCredentialRequest | null = null;
  private listeners = new Set<() => void>();

  request(workspaceId: string): Promise<CredentialInput | null> {
    return new Promise((resolve) => {
      this.pending = {
        workspaceId,
        resolve: (input) => {
          this.pending = null;
          this.notify();
          resolve(input);
        },
      };
      this.notify();
    });
  }

  getSnapshot = (): PendingCredentialRequest | null => this.pending;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
