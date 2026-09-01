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
  it("fails closed when no credential source is configured (S2)", async () => {
    // Previously this validated {username: "", password: ""} — so a lenient
    // validator granted access to a guard that was never asked anything.
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({ isAuthenticated: () => false });
    const rule: WorkspaceAuthRule = { type: "credential", validate };
    expect(await guard.evaluate(rule, ctx)).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it("validates a fixed credentialInput", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({
      isAuthenticated: () => false,
      credentialInput: { username: "u", password: "p" },
    });
    expect(await guard.evaluate({ type: "credential", validate }, ctx)).toBe(true);
    expect(validate).toHaveBeenCalledWith({ username: "u", password: "p" });
  });

  it("validates credentials collected by requestCredential", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({
      isAuthenticated: () => false,
      requestCredential: async () => ({ username: "u", password: "p" }),
    });
    expect(await guard.evaluate({ type: "credential", validate }, ctx)).toBe(true);
    expect(validate).toHaveBeenCalledWith({ username: "u", password: "p" });
  });

  it("fails closed when the user cancels the credential prompt", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({
      isAuthenticated: () => false,
      requestCredential: async () => null,
    });
    expect(await guard.evaluate({ type: "credential", validate }, ctx)).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it("prefers an explicit override over both configured sources", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const guard = new WorkspaceGuard({
      isAuthenticated: () => false,
      credentialInput: { username: "cfg", password: "cfg" },
      requestCredential: async () => ({ username: "asked", password: "asked" }),
    });
    await guard.evaluate({ type: "credential", validate }, ctx, {
      username: "override",
      password: "override",
    });
    expect(validate).toHaveBeenCalledWith({ username: "override", password: "override" });
  });

  it("resolves false when validate rejects the credentials", async () => {
    const guard = new WorkspaceGuard({
      isAuthenticated: () => false,
      credentialInput: { username: "u", password: "bad" },
    });
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
