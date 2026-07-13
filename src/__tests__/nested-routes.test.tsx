/**
 * Integration: nested routes (§2 of spec).
 * Uses only public API imports — no internal modules.
 */
import React, { useRef, useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppProvider } from "../provider/AppProvider";
import { RouterView } from "../components/RouterView";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useNavigation } from "../router/hooks";

// ─── Empty workspaces (routes-only tests) ─────────────────────────────────────

const emptyWorkspaces = defineWorkspaces({});

// ─── Route components ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SettingsLayout: React.ComponentType<any> = ({ outlet }) => (
  <div>
    <div data-testid="settings-layout">SettingsLayout</div>
    {outlet}
  </div>
);

const SettingsIndex = () => <div data-testid="settings-index">SettingsIndex</div>;
const ProfileSettings = () => <div data-testid="profile">Profile</div>;
const SecuritySettings = () => <div data-testid="security">Security</div>;

// Lazy-wrapped profile component
const LazyProfileSettings = React.lazy(
  () => Promise.resolve({ default: ProfileSettings }),
);

// ─── Module-level render counter for remount test ─────────────────────────────

let layoutMountCount = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TrackingSettingsLayout: React.ComponentType<any> = ({ outlet }) => {
  useEffect(() => {
    layoutMountCount++;
    return () => { layoutMountCount--; };
  }, []);
  return (
    <div>
      <div data-testid="tracking-layout">TrackingLayout</div>
      {outlet}
    </div>
  );
};

// ─── Module-level throw flag for error boundary test ──────────────────────────

let shouldThrow = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MaybeBrokenRoute: React.ComponentType<any> = () => {
  if (shouldThrow) throw new Error("Route crashed");
  return <div data-testid="recovered">Recovered</div>;
};

// ─── Orphan routes for parent: null test ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OrphanRoute: React.ComponentType<any> = ({ outlet }) => (
  <div>
    <div data-testid="orphan-parent">OrphanParent</div>
    {outlet}
  </div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OrphanChildRoute: React.ComponentType<any> = () => (
  <div data-testid="orphan-child">OrphanChild</div>
);

// ─── Nav helper ───────────────────────────────────────────────────────────────

function Nav() {
  const { navigate } = useNavigation();
  return (
    <>
      <button data-testid="go-settings" onClick={() => navigate("/settings")}>
        settings
      </button>
      <button data-testid="go-profile" onClick={() => navigate("/settings/profile")}>
        profile
      </button>
      <button data-testid="go-security" onClick={() => navigate("/settings/security")}>
        security
      </button>
    </>
  );
}

// ─── Suppress console.error for error boundary tests ─────────────────────────

const originalConsoleError = console.error;

// ─── Shared routes ────────────────────────────────────────────────────────────

const settingsRoutes = defineRoutes({
  "/":                  { component: (() => <div data-testid="home">Home</div>) },
  "/settings":          { component: SettingsLayout, index: SettingsIndex },
  "/settings/profile":  { component: ProfileSettings },
  "/settings/security": { component: SecuritySettings },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp(routes: ReturnType<typeof defineRoutes>, path = "/settings") {
  window.history.replaceState(null, "", path);
  return render(
    <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
      <Nav />
      <RouterView />
    </AppProvider>,
  );
}

// ─── Layout nesting ───────────────────────────────────────────────────────────

describe("nested-routes: basic nesting", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/settings");
  });

  it("/settings renders SettingsLayout", () => {
    makeApp(settingsRoutes);
    expect(screen.getByTestId("settings-layout")).toBeInTheDocument();
  });

  it("/settings with index renders SettingsIndex as outlet", () => {
    makeApp(settingsRoutes);
    expect(screen.getByTestId("settings-index")).toBeInTheDocument();
  });

  it("/settings/profile renders ProfileSettings inside SettingsLayout", async () => {
    makeApp(settingsRoutes, "/settings/profile");
    expect(screen.getByTestId("settings-layout")).toBeInTheDocument();
    expect(screen.getByTestId("profile")).toBeInTheDocument();
  });

  it("/settings/security renders SecuritySettings inside SettingsLayout", async () => {
    makeApp(settingsRoutes, "/settings/security");
    expect(screen.getByTestId("settings-layout")).toBeInTheDocument();
    expect(screen.getByTestId("security")).toBeInTheDocument();
  });
});

// ─── Parent not remounted on child navigation ─────────────────────────────────

describe("nested-routes: parent stability", () => {
  beforeEach(() => {
    layoutMountCount = 0;
    window.history.replaceState(null, "", "/settings/profile");
  });

  it("SettingsLayout is not remounted when navigating between children", async () => {
    const routes = defineRoutes({
      "/settings":          { component: TrackingSettingsLayout },
      "/settings/profile":  { component: ProfileSettings },
      "/settings/security": { component: SecuritySettings },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <Nav />
        <RouterView />
      </AppProvider>,
    );

    expect(layoutMountCount).toBe(1);

    await act(async () => {
      await userEvent.click(screen.getByTestId("go-security"));
    });

    expect(screen.getByTestId("security")).toBeInTheDocument();
    expect(layoutMountCount).toBe(1); // still 1 — not remounted
  });
});

// ─── Lazy component ───────────────────────────────────────────────────────────

describe("nested-routes: lazy component", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/settings/profile");
  });

  it("lazy child resolves and renders component", async () => {
    const routes = defineRoutes({
      "/settings":         { component: SettingsLayout },
      "/settings/profile": { component: LazyProfileSettings, loading: <div data-testid="loading">Loading…</div> },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <RouterView />
      </AppProvider>,
    );

    // Wait for lazy component to resolve
    expect(await screen.findByTestId("profile")).toBeInTheDocument();
  });

  it("SettingsLayout stays visible while lazy child is loading", async () => {
    const routes = defineRoutes({
      "/settings":         { component: SettingsLayout },
      "/settings/profile": { component: LazyProfileSettings, loading: <div data-testid="loading">Loading…</div> },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <RouterView />
      </AppProvider>,
    );

    // SettingsLayout is not lazy — it renders immediately
    expect(screen.getByTestId("settings-layout")).toBeInTheDocument();
  });
});

// ─── Error boundary ───────────────────────────────────────────────────────────

describe("nested-routes: error boundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    window.history.replaceState(null, "", "/settings/broken");
    console.error = () => {}; // Suppress React error boundary logging
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("error in child route shows error UI, parent layout unaffected", async () => {
    const routes = defineRoutes({
      "/settings":        { component: SettingsLayout },
      "/settings/broken": { component: MaybeBrokenRoute },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <RouterView />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Parent layout is still visible
    expect(screen.getByTestId("settings-layout")).toBeInTheDocument();
  });

  it("reset() in error UI re-renders the child without error", async () => {
    const routes = defineRoutes({
      "/settings":        { component: SettingsLayout },
      "/settings/broken": { component: MaybeBrokenRoute },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <RouterView />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    shouldThrow = false;

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ─── parent: null suppresses nesting ─────────────────────────────────────────

describe("nested-routes: parent: null", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/orphan/child");
  });

  it("route with parent: null renders without parent layout even if prefix matches", () => {
    const routes = defineRoutes({
      "/orphan":       { component: OrphanRoute },
      "/orphan/child": { component: OrphanChildRoute, parent: null },
    });

    render(
      <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
        <RouterView />
      </AppProvider>,
    );

    expect(screen.getByTestId("orphan-child")).toBeInTheDocument();
    expect(screen.queryByTestId("orphan-parent")).not.toBeInTheDocument();
  });
});
