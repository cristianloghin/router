import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React, { lazy } from "react";
import { RouterView } from "./RouterView";
import { RouterTestProvider } from "../test-utils/RouterTestProvider";
import { defineRoutes } from "../router/RouteRegistry";
import { RouterStore } from "../router/RouterContext";
import { RouterStoreContext } from "../router/context";
import { RouteRegistryContext } from "../router/registryContext";
import { RouteRegistry } from "../router/RouteRegistry";
import { notFound } from "../utils/notFound";

// ─── Stub components ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Dashboard: React.ComponentType<any> = ({ outlet }) => <div>Dashboard{outlet}</div>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Settings: React.ComponentType<any> = ({ outlet }) => (
  <div>Settings<div data-testid="outlet">{outlet}</div></div>
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Profile: React.ComponentType<any> = ({ outlet }) => <div>Profile{outlet}</div>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Security: React.ComponentType<any> = ({ outlet }) => <div>Security{outlet}</div>;
const SettingsIndex = () => <div>SettingsIndex</div>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CameraDetail: React.ComponentType<any> = ({ params }) => <div>Camera:{params.id}</div>;
const NotFoundRoute = ({ path }: { path: string }) => <div>404:{path}</div>;

// ─── Routes ───────────────────────────────────────────────────────────────────

const routes = defineRoutes({
  "/":                  { component: Dashboard },
  "/settings":          { component: Settings, index: SettingsIndex },
  "/settings/profile":  { component: Profile },
  "/settings/security": { component: Security },
  "/camera/:id":        { component: CameraDetail },
});

function Wrapper({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <RouterTestProvider routes={routes} initialPath={path}>
      {children}
    </RouterTestProvider>
  );
}

// ─── Basic rendering ──────────────────────────────────────────────────────────

describe("RouterView: basic rendering", () => {
  it("renders the matched route for /", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> });
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
  });

  it("renders /settings and shows the index as outlet", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> });
    // The Settings component wraps an outlet; "SettingsIndex" is rendered inside it.
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.getByText("SettingsIndex")).toBeInTheDocument();
  });

  it("renders /settings/profile nested inside Settings", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/settings/profile">{children}</Wrapper> });
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
    expect(screen.getByText(/Profile/)).toBeInTheDocument();
  });

  it("renders /settings/security nested inside Settings", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/settings/security">{children}</Wrapper> });
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
    expect(screen.getByText(/Security/)).toBeInTheDocument();
  });

  it("renders the fallback for an unknown path", () => {
    render(
      <RouterView fallback={NotFoundRoute} />,
      { wrapper: ({ children }) => <Wrapper path="/unknown">{children}</Wrapper> },
    );
    expect(screen.getByText("404:/unknown")).toBeInTheDocument();
  });

  it("renders nothing for an unknown path when no fallback is provided", () => {
    const { container } = render(
      <RouterView />,
      { wrapper: ({ children }) => <Wrapper path="/unknown">{children}</Wrapper> },
    );
    // The container div is always rendered; its inner content should be empty
    expect(container.querySelector("div")!.textContent).toBe("");
  });
});

// ─── Index component ──────────────────────────────────────────────────────────

describe("RouterView: index component", () => {
  it("renders index as outlet when path exactly matches parent with index declared", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> });
    expect(screen.getByText("SettingsIndex")).toBeInTheDocument();
  });

  it("does not render index when a child route is matched", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/settings/profile">{children}</Wrapper> });
    expect(screen.queryByText("SettingsIndex")).toBeNull();
    expect(screen.getByText(/Profile/)).toBeInTheDocument();
  });
});

// ─── Parametric routes ────────────────────────────────────────────────────────

describe("RouterView: parametric routes", () => {
  it("passes extracted params to the component", () => {
    render(
      <RouterView />,
      { wrapper: ({ children }) => <Wrapper path="/camera/cam-7">{children}</Wrapper> },
    );
    expect(screen.getByText("Camera:cam-7")).toBeInTheDocument();
  });
});

// ─── Error boundary per route ─────────────────────────────────────────────────

describe("RouterView: error boundary", () => {
  it("shows error UI when route component throws, parent layout unaffected", () => {
    const Broken = () => { throw new Error("child broke"); };
    const routesWithError = defineRoutes({
      "/settings":        { component: Settings },
      "/settings/broken": { component: Broken as never },
    });
    window.history.replaceState(null, "", "/settings/broken");
    const store = new RouterStore({});
    const registry = new RouteRegistry(routesWithError);
    render(
      <RouterStoreContext.Provider value={store}>
        <RouteRegistryContext.Provider value={registry}>
          <RouterView />
        </RouteRegistryContext.Provider>
      </RouterStoreContext.Provider>,
    );
    // Parent Settings layout is visible
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
    // Child shows error UI (library default shows the error message)
    expect(screen.getByText(/child broke/)).toBeInTheDocument();
    store.destroy();
  });
});

// ─── notFound() from route component ─────────────────────────────────────────

describe("RouterView: notFound() sentinel", () => {
  it("renders the fallback when a route component calls notFound()", () => {
    const Missing = () => { notFound(); };
    const routesWithNotFound = defineRoutes({
      "/missing": { component: Missing as never },
    });
    window.history.replaceState(null, "", "/missing");
    const store = new RouterStore({});
    const registry = new RouteRegistry(routesWithNotFound);
    render(
      <RouterStoreContext.Provider value={store}>
        <RouteRegistryContext.Provider value={registry}>
          <RouterView fallback={NotFoundRoute} />
        </RouteRegistryContext.Provider>
      </RouterStoreContext.Provider>,
    );
    expect(screen.getByText("404:/missing")).toBeInTheDocument();
    store.destroy();
  });
});

// ─── Scroll restoration ───────────────────────────────────────────────────────

describe("RouterView: scroll restoration", () => {
  let store: RouterStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scrollSpy: any;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    store = new RouterStore({});
    scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  function registryFor(r: ReturnType<typeof defineRoutes>) {
    return new RouteRegistry(r);
  }

  it("calls window.scrollTo(0,0) on route change when scrollRestoration='top'", () => {
    const r = defineRoutes({ "/": { component: Dashboard }, "/settings": { component: Settings } });
    const registry = registryFor(r);
    render(
      <RouterStoreContext.Provider value={store}>
        <RouteRegistryContext.Provider value={registry}>
          <RouterView scrollRestoration="top" />
        </RouteRegistryContext.Provider>
      </RouterStoreContext.Provider>,
    );
    act(() => { store.navigate("/settings"); });
    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
    store.destroy();
    scrollSpy.mockRestore();
  });

  it("does not call window.scrollTo when scrollRestoration='none'", () => {
    const r = defineRoutes({ "/": { component: Dashboard }, "/settings": { component: Settings } });
    const registry = registryFor(r);
    render(
      <RouterStoreContext.Provider value={store}>
        <RouteRegistryContext.Provider value={registry}>
          <RouterView scrollRestoration="none" />
        </RouteRegistryContext.Provider>
      </RouterStoreContext.Provider>,
    );
    act(() => { store.navigate("/settings"); });
    expect(scrollSpy).not.toHaveBeenCalled();
    store.destroy();
    scrollSpy.mockRestore();
  });
});

// ─── Workspace URL passthrough ────────────────────────────────────────────────

describe("RouterView: workspace URL passthrough", () => {
  it("does not change rendered route when navigating to a workspace URL", () => {
    render(<RouterView />, { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> });
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();

    // Navigate to a workspace URL via the store
    const store = new RouterStore({});
    act(() => { store.navigate("/workspace/feed/uuid-1"); });

    // RouterView should still show Dashboard (route path unchanged)
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
    store.destroy();
  });
});
