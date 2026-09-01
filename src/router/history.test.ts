import { describe, it, expect, beforeEach } from "vitest";
import { HistoryStack, withHistoryIndex, readHistoryIndex, HISTORY_INDEX_KEY } from "./history";

// ─── Initial state ────────────────────────────────────────────────────────────

describe("HistoryStack: initial state", () => {
  it("starts with canGoBack false", () => {
    const stack = new HistoryStack();
    expect(stack.canGoBack).toBe(false);
  });

  it("starts at cursor 0", () => {
    const stack = new HistoryStack();
    expect(stack.currentIndex).toBe(0);
  });
});

// ─── seed ─────────────────────────────────────────────────────────────────────

describe("HistoryStack: seed", () => {
  it("installs the launch entry at cursor 0 with nothing behind it", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    expect(stack.currentIndex).toBe(0);
    expect(stack.canGoBack).toBe(false);
    expect(stack.peekBack()).toBeUndefined();
  });
});

// ─── push ─────────────────────────────────────────────────────────────────────

describe("HistoryStack: push", () => {
  it("advances the cursor and records the destination", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/settings");
    expect(stack.currentIndex).toBe(1);
    expect(stack.canGoBack).toBe(true);
    expect(stack.peekBack()).toBe("/");
  });

  it("walks back through successive pushes", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.push("/b");
    expect(stack.peekBack()).toBe("/a");
    stack.moveTo(1);
    expect(stack.peekBack()).toBe("/");
    stack.moveTo(0);
    expect(stack.peekBack()).toBeUndefined();
  });

  it("discards forward entries — a push after a back rewrites the future", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.push("/b");
    stack.moveTo(1);      // browser back to /a
    stack.push("/c");     // navigating from /a drops /b
    expect(stack.currentIndex).toBe(2);
    expect(stack.peekBack()).toBe("/a");
  });
});

// ─── moveTo (popstate) ────────────────────────────────────────────────────────

describe("HistoryStack: moveTo", () => {
  it("tracks a browser back", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.moveTo(0);
    expect(stack.canGoBack).toBe(false);
    expect(stack.currentIndex).toBe(0);
  });

  it("tracks a browser forward back to where it was", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.moveTo(0);
    stack.moveTo(1);
    expect(stack.canGoBack).toBe(true);
    expect(stack.peekBack()).toBe("/");
  });

  it("clamps a negative index to the start of the session", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.moveTo(-3);
    expect(stack.currentIndex).toBe(0);
    expect(stack.canGoBack).toBe(false);
  });
});

// ─── replace ──────────────────────────────────────────────────────────────────

describe("HistoryStack: replace", () => {
  it("relabels the current entry without moving the cursor", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.replace("/b");
    expect(stack.currentIndex).toBe(1);
    expect(stack.peekBack()).toBe("/");
  });

  it("seeds when called before anything exists", () => {
    const stack = new HistoryStack();
    stack.replace("/a");
    expect(stack.currentIndex).toBe(0);
    expect(stack.canGoBack).toBe(false);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe("HistoryStack: clear", () => {
  it("resets the cursor and the entries", () => {
    const stack = new HistoryStack();
    stack.seed("/");
    stack.push("/a");
    stack.clear();
    expect(stack.canGoBack).toBe(false);
    expect(stack.currentIndex).toBe(0);
    expect(stack.peekBack()).toBeUndefined();
  });
});

// ─── history.state index helpers ──────────────────────────────────────────────

describe("history.state index", () => {
  it("merges the cursor into app-supplied state", () => {
    expect(withHistoryIndex({ scrollY: 40 }, 3)).toEqual({
      scrollY: 40,
      [HISTORY_INDEX_KEY]: 3,
    });
  });

  it("handles null and undefined app state", () => {
    expect(withHistoryIndex(null, 0)).toEqual({ [HISTORY_INDEX_KEY]: 0 });
    expect(withHistoryIndex(undefined, 2)).toEqual({ [HISTORY_INDEX_KEY]: 2 });
  });

  it("reads the cursor back off the current entry", () => {
    window.history.replaceState(withHistoryIndex(null, 5), "");
    expect(readHistoryIndex()).toBe(5);
  });

  it("returns null for an entry the router never stamped", () => {
    window.history.replaceState(null, "");
    expect(readHistoryIndex()).toBeNull();
    window.history.replaceState({ some: "state" }, "");
    expect(readHistoryIndex()).toBeNull();
  });

  it("does not disturb app state already on the entry", () => {
    window.history.replaceState(withHistoryIndex({ draft: "x" }, 1), "");
    expect((window.history.state as Record<string, unknown>)["draft"]).toBe("x");
    expect(readHistoryIndex()).toBe(1);
  });
});

// ─── workspace state (window.history.state integration) ──────────────────────

describe("HistoryStack: workspace origin storage", () => {
  beforeEach(() => {
    // Reset to clean state (test-setup.ts resets to "/" but history.state may differ)
    window.history.replaceState(null, "");
  });

  it("pushWorkspaceEntry stores origin and workspaceId in history.state", () => {
    const stack = new HistoryStack();
    stack.pushWorkspaceEntry("ws-uuid", "/settings/profile");
    expect(window.history.state).toMatchObject({
      origin: "/settings/profile",
      workspaceId: "ws-uuid",
    });
  });

  it("readWorkspaceOrigin returns origin path after pushWorkspaceEntry", () => {
    const stack = new HistoryStack();
    stack.pushWorkspaceEntry("ws-uuid", "/dashboard");
    expect(stack.readWorkspaceOrigin()).toBe("/dashboard");
  });

  it("readWorkspaceId returns workspaceId after pushWorkspaceEntry", () => {
    const stack = new HistoryStack();
    stack.pushWorkspaceEntry("ws-uuid", "/dashboard");
    expect(stack.readWorkspaceId()).toBe("ws-uuid");
  });

  it("readWorkspaceOrigin returns null when history.state has no workspace entry", () => {
    window.history.replaceState({ other: "data" }, "");
    const stack = new HistoryStack();
    expect(stack.readWorkspaceOrigin()).toBeNull();
  });

  it("readWorkspaceId returns null when history.state has no workspace entry", () => {
    window.history.replaceState(null, "");
    const stack = new HistoryStack();
    expect(stack.readWorkspaceId()).toBeNull();
  });
});
