import { describe, it, expect, beforeEach } from "vitest";
import { HistoryStack } from "./history";

// ─── Initial state ────────────────────────────────────────────────────────────

describe("HistoryStack: initial state", () => {
  it("starts with canGoBack false", () => {
    const stack = new HistoryStack();
    expect(stack.canGoBack).toBe(false);
  });
});

// ─── push ─────────────────────────────────────────────────────────────────────

describe("HistoryStack: push", () => {
  it("canGoBack becomes true after a push", () => {
    const stack = new HistoryStack();
    stack.push("/settings");
    expect(stack.canGoBack).toBe(true);
  });

  it("stack grows with multiple pushes", () => {
    const stack = new HistoryStack();
    stack.push("/a");
    stack.push("/b");
    expect(stack.canGoBack).toBe(true);
    // pop returns the most recently pushed entry
    expect(stack.pop()).toBe("/b");
    expect(stack.pop()).toBe("/a");
  });
});

// ─── pop ──────────────────────────────────────────────────────────────────────

describe("HistoryStack: pop", () => {
  it("returns and removes the top entry", () => {
    const stack = new HistoryStack();
    stack.push("/a");
    stack.push("/b");
    expect(stack.pop()).toBe("/b");
    expect(stack.pop()).toBe("/a");
  });

  it("returns undefined on an empty stack", () => {
    const stack = new HistoryStack();
    expect(stack.pop()).toBeUndefined();
  });

  it("canGoBack is false after popping all entries", () => {
    const stack = new HistoryStack();
    stack.push("/a");
    stack.pop();
    expect(stack.canGoBack).toBe(false);
  });

  it("canGoBack stays false when popping from an already-empty stack", () => {
    const stack = new HistoryStack();
    stack.pop();
    expect(stack.canGoBack).toBe(false);
  });
});

// ─── replace ──────────────────────────────────────────────────────────────────

describe("HistoryStack: replace", () => {
  it("replaces the top entry without changing stack length", () => {
    const stack = new HistoryStack();
    stack.push("/a");
    stack.push("/b");
    stack.replace("/c");
    expect(stack.pop()).toBe("/c");
    expect(stack.pop()).toBe("/a"); // "/b" was replaced
  });

  it("behaves like push when called on an empty stack", () => {
    const stack = new HistoryStack();
    stack.replace("/a");
    expect(stack.canGoBack).toBe(true);
    expect(stack.pop()).toBe("/a");
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe("HistoryStack: clear", () => {
  it("empties the stack", () => {
    const stack = new HistoryStack();
    stack.push("/a");
    stack.push("/b");
    stack.clear();
    expect(stack.canGoBack).toBe(false);
    expect(stack.pop()).toBeUndefined();
  });
});

// ─── canGoBack reflects state throughout operations ───────────────────────────

describe("HistoryStack: canGoBack reflects stack length correctly", () => {
  it("transitions correctly across operations", () => {
    const stack = new HistoryStack();
    expect(stack.canGoBack).toBe(false);
    stack.push("/a");
    expect(stack.canGoBack).toBe(true);
    stack.push("/b");
    expect(stack.canGoBack).toBe(true);
    stack.pop();
    expect(stack.canGoBack).toBe(true);
    stack.pop();
    expect(stack.canGoBack).toBe(false);
    stack.replace("/c"); // push behaviour on empty
    expect(stack.canGoBack).toBe(true);
    stack.clear();
    expect(stack.canGoBack).toBe(false);
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
