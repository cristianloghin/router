import { StackAdapter } from "./StackAdapter";

// ─── SwipeAdapter ─────────────────────────────────────────────────────────────

/**
 * Extends StackAdapter with scroll-driven index management.
 * `setCurrentIndex` updates state without firing workspace:focused
 * (used by container scroll handler). `focus()` still fires workspace:focused.
 */
export class SwipeAdapter extends StackAdapter {
  override readonly type = "swipe" as const;

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Update the current index without emitting workspace:focused.
   * Called by the SwipeContainer scroll handler.
   * Clamps to valid range — does not throw for out-of-bounds values.
   */
  setCurrentIndex(n: number): void {
    if (this.workspaces.length === 0) {
      this.currentIndex = -1;
      return;
    }
    this.currentIndex = Math.max(0, Math.min(n, this.workspaces.length - 1));
  }

  /**
   * Settle on the root page: no workspace is in view, so getCurrent()
   * returns null even while workspaces remain open. Distinct from
   * setCurrentIndex(-1), which clamps into range — the root page is a real
   * state, not an out-of-bounds index.
   */
  setCurrentToRoot(): void {
    this.currentIndex = -1;
  }
}
