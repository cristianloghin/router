import { describe, it, expect, vi } from "vitest";
import { WorkspaceGuard } from "./WorkspaceGuard";
import type { WorkspaceAuthRule, AuthCheckContext } from "../types";

const ctx: AuthCheckContext = {
  workspaceId: "ws-1",
  template: "stream",
  params: { cameraId: "cam-1" },
  isDirectAccess: false,
};

// ─── public ───────────────────────────────────────────────────────────────────

describe("WorkspaceGuard: public", () => {
  it("always resolves true", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    expect(await guard.evaluate({ type: "public" }, ctx)).toBe(true);
  });
});

// ─── authenticated ────────────────────────────────────────────────────────────

describe("WorkspaceGuard: authenticated", () => {
  it("resolves true when isAuthenticated returns true", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => true });
    expect(await guard.evaluate({ type: "authenticated" }, ctx)).toBe(true);
  });

  it("resolves false when isAuthenticated returns false", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    expect(await guard.evaluate({ type: "authenticated" }, ctx)).toBe(false);
  });

  it("resolves true when isAuthenticated returns Promise<true>", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => Promise.resolve(true) });
    expect(await guard.evaluate({ type: "authenticated" }, ctx)).toBe(true);
  });
});

// ─── time-limited ─────────────────────────────────────────────────────────────

describe("WorkspaceGuard: time-limited", () => {
  it("resolves true when expiresAt is in the future", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "time-limited", expiresAt: Date.now() + 10_000 };
    expect(await guard.evaluate(rule, ctx)).toBe(true);
  });

  it("resolves false when expiresAt is in the past", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "time-limited", expiresAt: Date.now() - 1 };
    expect(await guard.evaluate(rule, ctx)).toBe(false);
  });

  it("calls expiresAt as a function when it is one", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const fn = vi.fn(() => Date.now() + 10_000);
    const rule: WorkspaceAuthRule = { type: "time-limited", expiresAt: fn };
    await guard.evaluate(rule, ctx);
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── credential ───────────────────────────────────────────────────────────────

describe("WorkspaceGuard: credential", () => {
  it("calls validate with CredentialInput and resolves to validate's result (true)", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "credential", validate };
    expect(await guard.evaluate(rule, ctx)).toBe(true);
    expect(validate).toHaveBeenCalledWith({ username: "", password: "" });
  });

  it("resolves false when validate returns false", async () => {
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "credential", validate: async () => false };
    expect(await guard.evaluate(rule, ctx)).toBe(false);
  });
});

// ─── custom ───────────────────────────────────────────────────────────────────

describe("WorkspaceGuard: custom", () => {
  it("calls check(context) and resolves to its result", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "custom", check };
    expect(await guard.evaluate(rule, ctx)).toBe(true);
    expect(check).toHaveBeenCalledWith(ctx);
  });

  it("resolves false when check throws (does not propagate)", async () => {
    const check = vi.fn().mockRejectedValue(new Error("check failed"));
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "custom", check };
    expect(await guard.evaluate(rule, ctx)).toBe(false);
  });
});

// ─── context passthrough ──────────────────────────────────────────────────────

describe("WorkspaceGuard: context passthrough", () => {
  it("passes isDirectAccess flag to custom check", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "custom", check };
    const directCtx: AuthCheckContext = { ...ctx, isDirectAccess: true };
    await guard.evaluate(rule, directCtx);
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ isDirectAccess: true }));
  });

  it("passes template and params to custom check", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "custom", check };
    await guard.evaluate(rule, ctx);
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ template: "stream", params: { cameraId: "cam-1" } }),
    );
  });
});
