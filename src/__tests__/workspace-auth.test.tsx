/**
 * Integration: workspace auth rules (§6 of spec).
 * Uses only public API imports — no internal modules.
 */
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { AppProvider } from "../provider/AppProvider";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useWorkspaces } from "../workspaces/hooks";
import type { WorkspaceComponentProps } from "../workspaces/types";

// ─── Stub workspace component ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stub: React.ComponentType<WorkspaceComponentProps<any>> = () => null;

// ─── Routes (routes-only context) ─────────────────────────────────────────────

const routes = defineRoutes({
  "/": { component: (() => null) as React.ComponentType<React.ComponentProps<"div">> },
});

// ─── Wrapper factories ────────────────────────────────────────────────────────

function makeWrapper(
  workspaceTemplates: ReturnType<typeof defineWorkspaces>,
  isAuthenticated: () => boolean | Promise<boolean> = () => false,
) {
  return ({ children }: { children: React.ReactNode }) => (
    <AppProvider
      routes={routes}
      workspaces={workspaceTemplates}
      config={{ adapter: "stack", auth: { isAuthenticated } }}
    >
      {children}
    </AppProvider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── public ───────────────────────────────────────────────────────────────────

describe("workspace-auth: public", () => {
  it("open() succeeds for a public workspace without any auth config", async () => {
    const workspaces = defineWorkspaces({
      publicWs: { component: Stub, auth: { type: "public" } },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    let descriptor: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      descriptor = await result.current.open({ template: "publicWs", title: "T", params: {} });
    });

    expect(descriptor.id).toBeTruthy();
    expect(descriptor.auth.granted).toBe(true);
  });
});

// ─── authenticated ────────────────────────────────────────────────────────────

describe("workspace-auth: authenticated", () => {
  it("open() succeeds when isAuthenticated returns true", async () => {
    const workspaces = defineWorkspaces({
      authWs: { component: Stub, auth: { type: "authenticated" } },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces, () => true),
    });

    let descriptor: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      descriptor = await result.current.open({ template: "authWs", title: "T", params: {} });
    });

    expect(descriptor.auth.granted).toBe(true);
  });

  it("open() rejects with AUTH_FAILED when isAuthenticated returns false", async () => {
    const workspaces = defineWorkspaces({
      authWs: { component: Stub, auth: { type: "authenticated" } },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces, () => false),
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "authWs", title: "T", params: {} }),
      ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    });
  });

  it("open() rejects with AUTH_FAILED when no auth config is provided", async () => {
    const workspaces = defineWorkspaces({
      authWs: { component: Stub, auth: { type: "authenticated" } },
    });
    // No auth config → default isAuthenticated = () => false
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: ({ children }) => (
        <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
          {children}
        </AppProvider>
      ),
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "authWs", title: "T", params: {} }),
      ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    });
  });
});

// ─── time-limited ─────────────────────────────────────────────────────────────

describe("workspace-auth: time-limited", () => {
  it("open() succeeds when expiresAt is in the future", async () => {
    const workspaces = defineWorkspaces({
      tlWs: {
        component: Stub,
        auth: { type: "time-limited", expiresAt: Date.now() + 60_000 },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    let descriptor: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      descriptor = await result.current.open({ template: "tlWs", title: "T", params: {} });
    });

    expect(descriptor.auth.granted).toBe(true);
  });

  it("open() rejects with AUTH_FAILED when expiresAt is in the past", async () => {
    const workspaces = defineWorkspaces({
      expiredWs: {
        component: Stub,
        auth: { type: "time-limited", expiresAt: 0 },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "expiredWs", title: "T", params: {} }),
      ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    });
  });

  it("open() succeeds when expiresAt is a function returning future time", async () => {
    const workspaces = defineWorkspaces({
      tlFnWs: {
        component: Stub,
        auth: { type: "time-limited", expiresAt: () => Date.now() + 60_000 },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    let descriptor: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      descriptor = await result.current.open({ template: "tlFnWs", title: "T", params: {} });
    });

    expect(descriptor.auth.granted).toBe(true);
  });
});

// ─── credential ───────────────────────────────────────────────────────────────

describe("workspace-auth: credential", () => {
  it("open() succeeds when validate returns true for the default credential input", async () => {
    // Default credential input is { username: "", password: "" }
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: { type: "credential", validate: () => true },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    let descriptor: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      descriptor = await result.current.open({ template: "credWs", title: "T", params: {} });
    });

    expect(descriptor.auth.granted).toBe(true);
  });

  it("open() rejects with AUTH_FAILED when validate returns false", async () => {
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: { type: "credential", validate: () => false },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "credWs", title: "T", params: {} }),
      ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    });
  });

  it("validate is called with the credential input", async () => {
    const validateCalls: Array<{ username: string; password: string }> = [];
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: {
          type: "credential",
          validate: (input) => {
            validateCalls.push(input);
            return true;
          },
        },
      },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    await act(async () => {
      await result.current.open({ template: "credWs", title: "T", params: {} });
    });

    expect(validateCalls).toHaveLength(1);
    expect(validateCalls[0]).toHaveProperty("username");
    expect(validateCalls[0]).toHaveProperty("password");
  });
});

// ─── unknown template ─────────────────────────────────────────────────────────

describe("workspace-auth: unknown template", () => {
  it("open() rejects with ADAPTER_ERROR for an unknown template key", async () => {
    const workspaces = defineWorkspaces({});
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces),
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "nonexistent", title: "T", params: {} }),
      ).rejects.toMatchObject({ code: "ADAPTER_ERROR" });
    });
  });
});

// ─── maxInstances ─────────────────────────────────────────────────────────────

describe("workspace-auth: maxInstances", () => {
  it("open() rejects with MAX_INSTANCES_REACHED when limit is exceeded", async () => {
    const workspaces = defineWorkspaces({
      limited: { component: Stub, maxInstances: 1 },
    });
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: makeWrapper(workspaces, () => true),
    });

    await act(async () => {
      await result.current.open({ template: "limited", title: "First", params: {} });
    });

    await act(async () => {
      await expect(
        result.current.open({ template: "limited", title: "Second", params: {} }),
      ).rejects.toMatchObject({ code: "MAX_INSTANCES_REACHED" });
    });
  });
});
