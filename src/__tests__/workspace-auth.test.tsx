/**
 * Integration: workspace auth rules (§6 of spec).
 * Uses only public API imports — no internal modules.
 */
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, render, screen, fireEvent, within } from "@testing-library/react";

import { AppProvider } from "../provider/AppProvider";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useWorkspaces, useWorkspaceActions } from "../workspaces/hooks";
import { StackContainer } from "../components/containers/StackContainer";
import type { WorkspaceComponentProps, WorkspaceDescriptor } from "../workspaces/types";

// ─── Stub workspace component ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stub: React.ComponentType<WorkspaceComponentProps<any>> = () => null;

// ─── Routes (routes-only context) ─────────────────────────────────────────────

const routes = defineRoutes({
  "/": { component: (() => null) },
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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

describe("workspace-auth: credential (built-in dialog)", () => {
  async function submitDialog(username: string, password: string): Promise<void> {
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/username/i), { target: { value: username } });
    fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: password } });
    await act(async () => {
      fireEvent.click(within(dialog).getByText("Submit"));
    });
  }

  it("open() shows the built-in credential dialog and resolves after submit", async () => {
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: {
          type: "credential",
          validate: (input) => input.username === "user" && input.password === "pass",
        },
      },
    });
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
      wrapper: makeWrapper(workspaces),
    });

    let openPromise!: Promise<WorkspaceDescriptor>;
    act(() => {
      openPromise = result.current.open({ template: "credWs", title: "T", params: {} });
    });
    await submitDialog("user", "pass");

    const descriptor = await openPromise;
    expect(descriptor.auth.granted).toBe(true);
  });

  it("open() rejects with AUTH_FAILED when validate rejects the submitted credentials", async () => {
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: { type: "credential", validate: () => false },
      },
    });
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
      wrapper: makeWrapper(workspaces),
    });

    let openPromise!: Promise<WorkspaceDescriptor>;
    act(() => {
      openPromise = result.current.open({ template: "credWs", title: "T", params: {} });
    });
    const assertion = expect(openPromise).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await submitDialog("user", "wrong");
    await assertion;
  });

  it("open() rejects with AUTH_FAILED when the dialog is cancelled", async () => {
    const workspaces = defineWorkspaces({
      credWs: {
        component: Stub,
        auth: { type: "credential", validate: () => true },
      },
    });
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
      wrapper: makeWrapper(workspaces),
    });

    let openPromise!: Promise<WorkspaceDescriptor>;
    act(() => {
      openPromise = result.current.open({ template: "credWs", title: "T", params: {} });
    });
    const assertion = expect(openPromise).rejects.toMatchObject({ code: "AUTH_FAILED" });
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByText("Cancel"));
    });
    await assertion;
  });

  it("validate receives the credentials typed into the dialog", async () => {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
      wrapper: makeWrapper(workspaces),
    });

    let openPromise!: Promise<WorkspaceDescriptor>;
    act(() => {
      openPromise = result.current.open({ template: "credWs", title: "T", params: {} });
    });
    await submitDialog("alice", "s3cret");
    await openPromise;

    expect(validateCalls).toEqual([{ username: "alice", password: "s3cret" }]);
  });
});

// ─── unknown template ─────────────────────────────────────────────────────────

describe("workspace-auth: unknown template", () => {
  it("open() rejects with ADAPTER_ERROR for an unknown template key", async () => {
    const workspaces = defineWorkspaces({});
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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
    const { result } = renderHook(() => ({ ...useWorkspaces(), ...useWorkspaceActions() }), {
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

// ─── direct URL access (spec §6.2 / §6.4) ─────────────────────────────────────

describe("workspace-auth: direct URL access", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Content: React.ComponentType<WorkspaceComponentProps<any>> = ({ workspace }) => (
    <div data-testid="ws-content">{workspace.title}</div>
  );

  it("renders the AuthGate instead of the workspace when unauthenticated", async () => {
    window.history.replaceState(null, "", "/workspace/authWs/direct-1?title=Secret");
    const workspaces = defineWorkspaces({
      authWs: { component: Content, auth: { type: "authenticated" } },
    });
    render(
      <AppProvider
        routes={routes}
        workspaces={workspaces}
        config={{ adapter: "stack", auth: { isAuthenticated: () => false } }}
      >
        <StackContainer />
      </AppProvider>,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("ws-content")).toBeNull();
  });

  it("renders the workspace when direct access passes auth", async () => {
    window.history.replaceState(null, "", "/workspace/authWs/direct-2?title=Secret");
    const workspaces = defineWorkspaces({
      authWs: { component: Content, auth: { type: "authenticated" } },
    });
    render(
      <AppProvider
        routes={routes}
        workspaces={workspaces}
        config={{ adapter: "stack", auth: { isAuthenticated: () => true } }}
      >
        <StackContainer />
      </AppProvider>,
    );
    expect(await screen.findByTestId("ws-content")).toBeTruthy();
  });

  it("retry() unlocks the workspace once auth starts succeeding", async () => {
    window.history.replaceState(null, "", "/workspace/authWs/direct-3?title=Secret");
    let authed = false;
    const workspaces = defineWorkspaces({
      authWs: { component: Content, auth: { type: "authenticated" } },
    });
    render(
      <AppProvider
        routes={routes}
        workspaces={workspaces}
        config={{ adapter: "stack", auth: { isAuthenticated: () => authed } }}
      >
        <StackContainer />
      </AppProvider>,
    );
    const gate = await screen.findByRole("alert");
    authed = true;
    await act(async () => {
      fireEvent.click(within(gate).getByText("Retry"));
    });
    expect(await screen.findByTestId("ws-content")).toBeTruthy();
  });

  it("reconstructs typed params from the URL using the template schema", async () => {
    window.history.replaceState(
      null,
      "",
      "/workspace/schemaWs/direct-4?title=T&count=5&ids=a&ids=b",
    );
    let seenParams: unknown = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ParamsProbe: React.ComponentType<WorkspaceComponentProps<any>> = ({ workspace }) => {
      seenParams = workspace.params;
      return <div data-testid="ws-content" />;
    };
    const workspaces = defineWorkspaces({
      schemaWs: {
        component: ParamsProbe,
        auth: { type: "public" },
        schema: { count: "number", ids: "string[]" },
      },
    });
    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <StackContainer />
      </AppProvider>,
    );
    await screen.findByTestId("ws-content");
    expect(seenParams).toEqual({ count: 5, ids: ["a", "b"] });
  });

  it("supports a custom components.AuthGate override", async () => {
    window.history.replaceState(null, "", "/workspace/authWs/direct-5?title=Secret");
    const workspaces = defineWorkspaces({
      authWs: { component: Content, auth: { type: "authenticated" } },
    });
    render(
      <AppProvider
        routes={routes}
        workspaces={workspaces}
        config={{
          adapter: "stack",
          auth: { isAuthenticated: () => false },
          components: { AuthGate: () => <div data-testid="custom-gate" /> },
        }}
      >
        <StackContainer />
      </AppProvider>,
    );
    expect(await screen.findByTestId("custom-gate")).toBeTruthy();
    expect(screen.queryByTestId("ws-content")).toBeNull();
  });

  it("credential AuthGate submit calls onCredentialAttempt and unlocks the workspace", async () => {
    window.history.replaceState(null, "", "/workspace/credWs/direct-6?title=Locked");
    const onCredentialAttempt = vi.fn();
    const workspaces = defineWorkspaces({
      credWs: {
        component: Content,
        auth: {
          type: "credential",
          validate: (input) => input.username === "u" && input.password === "p",
        },
      },
    });
    render(
      <AppProvider
        routes={routes}
        workspaces={workspaces}
        config={{
          adapter: "stack",
          auth: { isAuthenticated: () => false, onCredentialAttempt },
        }}
      >
        <StackContainer />
      </AppProvider>,
    );
    const form = await screen.findByLabelText(/credentials required/i);
    fireEvent.change(within(form).getByLabelText(/username/i), { target: { value: "u" } });
    fireEvent.change(within(form).getByLabelText(/password/i), { target: { value: "p" } });
    await act(async () => {
      fireEvent.click(within(form).getByText("Submit"));
    });
    expect(await screen.findByTestId("ws-content")).toBeTruthy();
    expect(onCredentialAttempt).toHaveBeenCalledWith({ username: "u", password: "p" }, "direct-6");
  });
});
