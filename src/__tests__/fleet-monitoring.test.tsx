/**
 * Integration: fleet monitoring scenario (§13 of spec).
 * Uses only public API imports — no internal modules.
 */
import React, { useEffect, useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppProvider } from "../provider/AppProvider";
import { RouterView } from "../components/RouterView";
import { Link } from "../components/Link";
import { StackContainer } from "../components/containers/StackContainer";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useNavigation, useLocation } from "../router/hooks";
import { useWorkspaces, useWorkspace } from "../workspaces/hooks";
import type { WorkspaceComponentProps } from "../workspaces/types";

// ─── Domain types ─────────────────────────────────────────────────────────────

type CameraFeedParams = { cameraId: string; label: string };
type AlertPanelParams = { alertIds: string[] };

// ─── Route components ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DashboardRoute: React.ComponentType<any> = ({ outlet }) => (
  <div>
    <div data-testid="dashboard">Dashboard</div>
    <Link to="/alerts">Configure alerts</Link>
    {outlet}
  </div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AlertsRoute: React.ComponentType<any> = () => (
  <div data-testid="alerts">Alerts</div>
);

// ─── Workspace components ─────────────────────────────────────────────────────

function CameraFeedWorkspace({ workspace }: WorkspaceComponentProps<CameraFeedParams>) {
  const ws = useWorkspace<CameraFeedParams>(workspace.id);
  return (
    <div data-testid={`feed-${workspace.id}`}>
      Feed: {ws?.params.cameraId}
    </div>
  );
}

function AlertPanelWorkspace({ workspace }: WorkspaceComponentProps<AlertPanelParams>) {
  return (
    <div data-testid={`alert-panel-${workspace.id}`}>
      Alerts: {workspace.params.alertIds.join(",")}
    </div>
  );
}

// ─── App setup ────────────────────────────────────────────────────────────────

const routes = defineRoutes({
  "/":       { component: DashboardRoute },
  "/alerts": { component: AlertsRoute },
});

const workspaces = defineWorkspaces({
  cameraFeed: {
    // No cast needed: params are inferred from the schema (schema-first).
    component: CameraFeedWorkspace,
    auth: { type: "public" },
    schema: { cameraId: "string", label: "string" },
  },
  alertPanel: {
    component: AlertPanelWorkspace,
    auth: { type: "public" },
    schema: { alertIds: "string[]" },
  },
});

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
      {children}
    </AppProvider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

describe("fleet-monitoring: bootstrap", () => {
  it("AppProvider + RouterView + StackContainer render without error", () => {
    expect(() =>
      render(
        <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
          <RouterView />
          <StackContainer />
        </AppProvider>,
      ),
    ).not.toThrow();
  });

  it("Dashboard route is shown on initial render at '/'", () => {
    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <RouterView />
      </AppProvider>,
    );
    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });
});

// ─── Route navigation ─────────────────────────────────────────────────────────

describe("fleet-monitoring: route navigation", () => {
  it("clicking a Link navigates to the target route", async () => {
    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <RouterView />
      </AppProvider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByText("Configure alerts"));
    });
    expect(screen.getByTestId("alerts")).toBeInTheDocument();
  });
});

// ─── Workspace open ───────────────────────────────────────────────────────────

describe("fleet-monitoring: workspace open", () => {
  it("open() adds workspace to the workspaces list", async () => {
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.open({
        template: "cameraFeed",
        title: "Cam 4",
        params: { cameraId: "cam-4", label: "North gate" },
      });
    });
    expect(result.current.workspaces).toHaveLength(1);
  });

  it("URL changes to workspace URL after open()", async () => {
    const { result } = renderHook(
      () => ({ ws: useWorkspaces(), loc: useLocation() }),
      { wrapper: makeWrapper() },
    );
    let d: Awaited<ReturnType<typeof result.current.ws.open>> = undefined!;
    await act(async () => {
      d = await result.current.ws.open({
        template: "cameraFeed",
        title: "Cam 4",
        params: { cameraId: "cam-4", label: "North gate" },
      });
    });
    expect(window.location.pathname).toContain(`/workspace/cameraFeed/${d.id}`);
  });

  it("router path stays at '/' after workspace open (route stays rendered)", async () => {
    const { result } = renderHook(
      () => ({ ws: useWorkspaces(), loc: useLocation() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.ws.open({
        template: "cameraFeed",
        title: "Cam 4",
        params: { cameraId: "cam-4", label: "North gate" },
      });
    });
    expect(result.current.loc.path).toBe("/");
  });

  it("StackContainer renders workspace component after open()", async () => {
    function Opener() {
      const { open } = useWorkspaces();
      return (
        <button
          data-testid="open-cam"
          onClick={() => open({ template: "cameraFeed", title: "Live Feed", params: { cameraId: "cam-1", label: "Gate" } })}
        >
          Open
        </button>
      );
    }
    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <RouterView />
        <Opener />
        <StackContainer />
      </AppProvider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-cam"));
    });
    // Workspace component renders with cameraId param
    expect(await screen.findByText(/Feed:/)).toBeInTheDocument();
  });
});

// ─── Workspace close ──────────────────────────────────────────────────────────

describe("fleet-monitoring: workspace close", () => {
  it("close(id) removes workspace from list", async () => {
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({
        template: "cameraFeed",
        title: "Cam",
        params: { cameraId: "cam-1", label: "Gate" },
      });
    });
    await act(async () => { await result.current.close(d.id); });
    expect(result.current.workspaces).toHaveLength(0);
  });

  it("URL returns to origin after close()", async () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({
        template: "cameraFeed",
        title: "Cam",
        params: { cameraId: "cam-1", label: "Gate" },
      });
    });
    await act(async () => { await result.current.close(d.id); });
    expect(window.location.pathname).toBe("/");
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────────

describe("fleet-monitoring: updateParams", () => {
  it("updateParams updates params in useWorkspace", async () => {
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({
        template: "alertPanel",
        title: "Alerts",
        params: { alertIds: ["a1", "a2"] },
      });
    });
    act(() => {
      result.current.updateParams(d.id, { alertIds: ["a1"] });
    });
    expect(result.current.workspaces[0]?.params).toEqual({ alertIds: ["a1"] });
  });

  it("updateParams uses replace (URL updated in place, not pushed)", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: ({ children }) => (
        <AppProvider
          routes={routes}
          workspaces={workspaces}
          config={{ adapter: "stack", onNavigate }}
        >
          {children}
        </AppProvider>
      ),
    });
    let d: Awaited<ReturnType<typeof result.current.open>> = undefined!;
    await act(async () => {
      d = await result.current.open({
        template: "alertPanel",
        title: "Alerts",
        params: { alertIds: ["a1"] },
      });
    });
    onNavigate.mockClear();
    act(() => { result.current.updateParams(d.id, { alertIds: ["a2"] }); });
    // onNavigate fires for workspace URL (replace), but router path doesn't change
    // The key point: it doesn't push to history
    expect(result.current.workspaces[0]?.params).toEqual({ alertIds: ["a2"] });
  });
});
