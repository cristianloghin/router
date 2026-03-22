import { describe, it, expect, vi } from "vitest";
import { StackAdapter } from "./StackAdapter";
import { createDescriptor } from "../defineWorkspaces";

function makeDescriptor(id = "ws-1", template = "stream") {
  const d = createDescriptor(template, { cameraId: "cam-1" }, "Test");
  return { ...d, id };
}

// ─── open ─────────────────────────────────────────────────────────────────────

describe("StackAdapter: open", () => {
  it("adds descriptor to list and emits workspace:opened", async () => {
    const adapter = new StackAdapter();
    const events: string[] = [];
    adapter.subscribe((e) => events.push(e.type));
    const d = makeDescriptor();
    await adapter.open(d);
    expect(adapter.getAll()).toHaveLength(1);
    expect(events).toContain("workspace:opened");
  });

  it("getCurrent returns the last opened descriptor", async () => {
    const adapter = new StackAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    expect(adapter.getCurrent()?.id).toBe(d.id);
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("StackAdapter: close", () => {
  it("removes descriptor from list and emits workspace:closed", async () => {
    const adapter = new StackAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    const events: string[] = [];
    adapter.subscribe((e) => events.push(e.type));
    await adapter.close(d.id);
    expect(adapter.getAll()).toHaveLength(0);
    expect(events).toContain("workspace:closed");
  });

  it("autoFocus=true with adjacent → emits workspace:focused for adjacent", async () => {
    const adapter = new StackAdapter();
    const d1 = makeDescriptor("ws-1");
    const d2 = makeDescriptor("ws-2");
    await adapter.open(d1);
    await adapter.open(d2);
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    await adapter.close(d2.id, true);
    expect(focusEvents).toContain("ws-1");
  });

  it("autoFocus=true with no adjacent → no workspace:focused emitted", async () => {
    const adapter = new StackAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    await adapter.close(d.id, true);
    expect(focusEvents).toHaveLength(0);
  });

  it("autoFocus=false → no workspace:focused emitted", async () => {
    const adapter = new StackAdapter();
    const d1 = makeDescriptor("ws-1");
    const d2 = makeDescriptor("ws-2");
    await adapter.open(d1);
    await adapter.open(d2);
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    await adapter.close(d2.id, false);
    expect(focusEvents).toHaveLength(0);
  });

  it("close non-existent id is a no-op", async () => {
    const adapter = new StackAdapter();
    await expect(adapter.close("does-not-exist")).resolves.not.toThrow();
  });
});

// ─── focus ────────────────────────────────────────────────────────────────────

describe("StackAdapter: focus", () => {
  it("updates currentIndex and emits workspace:focused", async () => {
    const adapter = new StackAdapter();
    const d1 = makeDescriptor("ws-1");
    const d2 = makeDescriptor("ws-2");
    await adapter.open(d1);
    await adapter.open(d2);
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    await adapter.focus("ws-1");
    expect(adapter.getCurrent()?.id).toBe("ws-1");
    expect(focusEvents).toContain("ws-1");
  });

  it("focus non-existent id is a no-op", async () => {
    const adapter = new StackAdapter();
    await expect(adapter.focus("does-not-exist")).resolves.not.toThrow();
  });
});

// ─── updateParams / updateTitle ───────────────────────────────────────────────

describe("StackAdapter: updateParams", () => {
  it("updates descriptor in place and emits workspace:updated", async () => {
    const adapter = new StackAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    const updates: string[] = [];
    adapter.subscribe((e) => { if (e.type === "workspace:updated") updates.push(e.type); });
    adapter.updateParams(d.id, { cameraId: "cam-9" });
    expect(adapter.getAll()[0]?.params).toEqual({ cameraId: "cam-9" });
    expect(updates).toHaveLength(1);
  });
});

describe("StackAdapter: updateTitle", () => {
  it("updates title and emits workspace:updated", async () => {
    const adapter = new StackAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    adapter.updateTitle(d.id, "New Title");
    expect(adapter.getAll()[0]?.title).toBe("New Title");
  });
});

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

describe("StackAdapter: subscribe", () => {
  it("returns an unsubscribe function that stops events", async () => {
    const adapter = new StackAdapter();
    const events: string[] = [];
    const unsub = adapter.subscribe((e) => events.push(e.type));
    const d = makeDescriptor();
    await adapter.open(d);
    unsub();
    await adapter.open(makeDescriptor("ws-2"));
    // Only the first open should have been captured
    expect(events).toHaveLength(1);
  });
});
