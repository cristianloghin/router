import { describe, it, expect } from "vitest";
import { SwipeAdapter } from "./SwipeAdapter";
import { createDescriptor } from "../defineWorkspaces";

function makeDescriptor(id = "ws-1") {
  const d = createDescriptor("stream", { cameraId: "cam-1" }, "Test");
  return { ...d, id };
}

// All StackAdapter behaviours apply (open, close, focus, updateParams, updateTitle, subscribe)
// The full suite is not duplicated here — StackAdapter.test.ts covers shared behaviour.

describe("SwipeAdapter: type", () => {
  it("has type 'swipe'", () => {
    const adapter = new SwipeAdapter();
    expect(adapter.type).toBe("swipe");
  });
});

describe("SwipeAdapter: getCurrentIndex", () => {
  it("returns -1 initially", () => {
    const adapter = new SwipeAdapter();
    expect(adapter.getCurrentIndex()).toBe(-1);
  });

  it("returns the correct index after open", async () => {
    const adapter = new SwipeAdapter();
    await adapter.open(makeDescriptor("ws-1"));
    await adapter.open(makeDescriptor("ws-2"));
    expect(adapter.getCurrentIndex()).toBe(1);
  });
});

describe("SwipeAdapter: setCurrentIndex", () => {
  it("updates index without emitting workspace:focused", async () => {
    const adapter = new SwipeAdapter();
    await adapter.open(makeDescriptor("ws-1"));
    await adapter.open(makeDescriptor("ws-2"));
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    adapter.setCurrentIndex(0);
    expect(adapter.getCurrentIndex()).toBe(0);
    expect(focusEvents).toHaveLength(0);
  });

  it("clamps to 0 when given a negative index", async () => {
    const adapter = new SwipeAdapter();
    await adapter.open(makeDescriptor());
    adapter.setCurrentIndex(-5);
    expect(adapter.getCurrentIndex()).toBe(0);
  });

  it("clamps to last index when given out-of-bounds positive index", async () => {
    const adapter = new SwipeAdapter();
    await adapter.open(makeDescriptor("ws-1"));
    await adapter.open(makeDescriptor("ws-2"));
    adapter.setCurrentIndex(99);
    expect(adapter.getCurrentIndex()).toBe(1);
  });

  it("sets index to -1 when workspace list is empty", () => {
    const adapter = new SwipeAdapter();
    adapter.setCurrentIndex(0);
    expect(adapter.getCurrentIndex()).toBe(-1);
  });

  it("does not throw for out-of-bounds index", async () => {
    const adapter = new SwipeAdapter();
    await adapter.open(makeDescriptor());
    expect(() => adapter.setCurrentIndex(999)).not.toThrow();
  });
});
