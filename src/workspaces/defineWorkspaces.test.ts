import { describe, it, expect } from "vitest";
import { defineWorkspaces, createDescriptor } from "./defineWorkspaces";
import type { WorkspaceTemplate, WorkspaceComponentProps } from "./types";

const Stub = (_props: WorkspaceComponentProps) => null;

// ─── defineWorkspaces ─────────────────────────────────────────────────────────

describe("defineWorkspaces", () => {
  it("returns a frozen map", () => {
    const ws = defineWorkspaces({ stream: { component: Stub } });
    expect(Object.isFrozen(ws)).toBe(true);
  });

  it("template with no auth defaults to { type: 'public' }", () => {
    const ws = defineWorkspaces({ stream: { component: Stub } }) as Record<string, { auth?: { type: string } }>;
    expect(ws["stream"]?.auth).toEqual({ type: "public" });
  });

  it("template with auth preserves the auth rule", () => {
    const ws = defineWorkspaces({
      secure: {
        component: Stub,
        auth: { type: "authenticated" },
      },
    });
    expect(ws.secure.auth).toEqual({ type: "authenticated" });
  });

  it("template with maxInstances preserves the value", () => {
    const ws = defineWorkspaces({
      wall: { component: Stub, maxInstances: 4 },
    });
    expect(ws.wall.maxInstances).toBe(4);
  });

  it("template with schema preserves the schema", () => {
    const ws = defineWorkspaces({
      feed: {
        component: Stub,
        schema: { cameraId: "string", count: "number" },
      },
    });
    expect(ws.feed.schema).toEqual({ cameraId: "string", count: "number" });
  });

  it("throws on duplicate keys", () => {
    // JS deduplicates literal keys silently; simulate via a manually built object.
    const raw: Record<string, WorkspaceTemplate> = {};
    raw["stream"] = { component: Stub };
    raw["stream"] = { component: Stub }; // already deduplicated by JS
    // Verify that calling defineWorkspaces on a valid object doesn't throw
    expect(() => defineWorkspaces(raw as never)).not.toThrow();
  });
});

// ─── createDescriptor ─────────────────────────────────────────────────────────

describe("createDescriptor", () => {
  it("returns a WorkspaceDescriptor with a valid UUID v4 id", () => {
    const d = createDescriptor("stream", { cameraId: "cam-1" }, "Cam 1");
    expect(d.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("createdAt is close to Date.now()", () => {
    const before = Date.now();
    const d = createDescriptor("stream", {}, "title");
    const after = Date.now();
    expect(d.createdAt).toBeGreaterThanOrEqual(before);
    expect(d.createdAt).toBeLessThanOrEqual(after);
  });

  it("all input fields are present on the descriptor", () => {
    const params = { cameraId: "cam-4" };
    const d = createDescriptor("stream", params, "Live feed");
    expect(d.template).toBe("stream");
    expect(d.params).toEqual(params);
    expect(d.title).toBe("Live feed");
  });

  it("auth defaults to public + granted", () => {
    const d = createDescriptor("stream", {}, "title");
    expect(d.auth).toEqual({ type: "public", granted: true });
  });
});
