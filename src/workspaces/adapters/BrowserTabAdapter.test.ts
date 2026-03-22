import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserTabAdapter } from "./BrowserTabAdapter";
import { createDescriptor } from "../defineWorkspaces";

function makeDescriptor(id = "ws-uuid-123", template = "cameraFeed") {
  const d = createDescriptor(template, { cameraId: "cam-1" }, "Test");
  return { ...d, id };
}

// ─── BroadcastChannel mock ────────────────────────────────────────────────────

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((data: unknown) => {
    // Deliver to all other instances of the same channel name
    for (const other of MockBroadcastChannel.instances) {
      if (other !== this && other.name === this.name && other.onmessage) {
        other.onmessage(new MessageEvent("message", { data }));
      }
    }
  });
  close = vi.fn();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }
}

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.stubGlobal("open", vi.fn());
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── open ─────────────────────────────────────────────────────────────────────

describe("BrowserTabAdapter: open", () => {
  it("calls window.open with the correct URL", async () => {
    const adapter = new BrowserTabAdapter();
    const d = makeDescriptor("uuid-1", "cameraFeed");
    await adapter.open(d);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/workspace/cameraFeed/uuid-1"),
      "_blank",
    );
  });

  it("URL includes title as a query param", async () => {
    const adapter = new BrowserTabAdapter();
    const d = { ...makeDescriptor("uuid-1"), title: "My Cam" };
    await adapter.open(d);
    const url = ((window.open as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain("title=My+Cam");
  });

  it("emits workspace:opened", async () => {
    const adapter = new BrowserTabAdapter();
    const events: string[] = [];
    adapter.subscribe((e) => events.push(e.type));
    await adapter.open(makeDescriptor());
    expect(events).toContain("workspace:opened");
  });
});

// ─── focus ────────────────────────────────────────────────────────────────────

describe("BrowserTabAdapter: focus", () => {
  it("emits workspace:focused for local consistency (browsers cannot focus tabs programmatically)", async () => {
    const adapter = new BrowserTabAdapter();
    const d = makeDescriptor();
    await adapter.open(d);
    const focusEvents: string[] = [];
    adapter.subscribe((e) => {
      if (e.type === "workspace:focused") focusEvents.push(e.workspaceId);
    });
    await adapter.focus(d.id);
    expect(focusEvents).toContain(d.id);
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("BrowserTabAdapter: close", () => {
  it("calls window.close when closing the current tab's workspace", async () => {
    const closeSpy = vi.fn();
    vi.stubGlobal("close", closeSpy);

    const d = makeDescriptor("uuid-current");
    window.history.replaceState(null, "", `/workspace/cameraFeed/uuid-current`);

    const adapter = new BrowserTabAdapter();
    await adapter.open(d);
    await adapter.close(d.id);
    expect(closeSpy).toHaveBeenCalled();
  });

  it("does not call window.close when closing a different tab's workspace", async () => {
    const closeSpy = vi.fn();
    vi.stubGlobal("close", closeSpy);

    window.history.replaceState(null, "", "/");
    const adapter = new BrowserTabAdapter();
    const d = makeDescriptor("uuid-other");
    await adapter.open(d);
    await adapter.close("uuid-other");
    expect(closeSpy).not.toHaveBeenCalled();
  });
});

// ─── getCurrent ───────────────────────────────────────────────────────────────

describe("BrowserTabAdapter: getCurrent", () => {
  it("returns null when URL is not a workspace URL", () => {
    window.history.replaceState(null, "", "/");
    const adapter = new BrowserTabAdapter();
    expect(adapter.getCurrent()).toBeNull();
  });

  it("returns the workspace descriptor matching the id in the URL", async () => {
    window.history.replaceState(null, "", "/workspace/cameraFeed/uuid-123");
    const adapter = new BrowserTabAdapter();
    const d = makeDescriptor("uuid-123");
    await adapter.open(d);
    const current = adapter.getCurrent();
    expect(current?.id).toBe("uuid-123");
  });
});

// ─── BroadcastChannel sync ────────────────────────────────────────────────────

describe("BrowserTabAdapter: BroadcastChannel sync", () => {
  it("receiving workspace:opened updates local list", () => {
    const adapter1 = new BrowserTabAdapter();
    const adapter2 = new BrowserTabAdapter();

    const d = makeDescriptor("uuid-bc");
    const events2: string[] = [];
    adapter2.subscribe((e) => events2.push(e.type));

    // adapter1 opens → should broadcast to adapter2
    adapter1.open(d);

    expect(adapter2.getAll().some((w) => w.id === "uuid-bc")).toBe(true);
    expect(events2).toContain("workspace:opened");
  });

  it("receiving workspace:closed updates local list", async () => {
    const adapter1 = new BrowserTabAdapter();
    const adapter2 = new BrowserTabAdapter();

    const d = makeDescriptor("uuid-bc-close");
    await adapter1.open(d);
    // Manually add to adapter2's list so it tracks it
    await adapter2.open(d);

    // Now simulate broadcast close by having adapter1 post a close message
    const bc1 = MockBroadcastChannel.instances.find((i) => i !== MockBroadcastChannel.instances[0]);
    // Trigger a close via direct broadcast message simulation
    const msg = { type: "workspace:closed" as const, workspaceId: "uuid-bc-close" };
    for (const inst of MockBroadcastChannel.instances) {
      if (inst.onmessage) {
        inst.onmessage(new MessageEvent("message", { data: msg }));
      }
    }

    expect(adapter2.getAll().some((w) => w.id === "uuid-bc-close")).toBe(false);
  });
});

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

describe("BrowserTabAdapter: subscribe", () => {
  it("returns an unsubscribe function that stops events", async () => {
    const adapter = new BrowserTabAdapter();
    const events: string[] = [];
    const unsub = adapter.subscribe((e) => events.push(e.type));
    await adapter.open(makeDescriptor("ws-1"));
    unsub();
    await adapter.open(makeDescriptor("ws-2"));
    expect(events).toHaveLength(1);
  });
});
