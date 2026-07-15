import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { TabsContainer } from "./TabsContainer";
import { defineRoutes } from "../../router/RouteRegistry";
import { defineWorkspaces } from "../../workspaces/defineWorkspaces";
import { useWorkspaces } from "../../workspaces/hooks";
import type { WorkspaceComponentProps } from "../../workspaces/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Stub BroadcastChannel (cross-tab sync is not under test here)
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }
}

function CamComponent({ workspace }: WorkspaceComponentProps) {
  return <div data-testid={`ws-${workspace.id}`}>{workspace.title}</div>;
}

const routes = defineRoutes({
  "/": { component: () => React.createElement("div", null, "Home") },
});

const workspaces = defineWorkspaces({
  cam: {
    component: CamComponent,
    auth: { type: "public" },
  },
});

// The real tabs adapter: open() window.opens (stubbed), the launching tab's
// URL never changes.
function Provider({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "tabs" }}>
      {children}
    </AppProvider>
  );
}

function Opener({ title = "Feed" }: { title?: string }) {
  const { open } = useWorkspaces();
  return (
    <button
      data-testid={`open-${title}`}
      onClick={() => open({ template: "cam", title, params: {} })}
    >
      {`Open ${title}`}
    </button>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.stubGlobal("open", vi.fn());
});

// ─── launching tab ────────────────────────────────────────────────────────────

describe("TabsContainer: launching tab", () => {
  it("renders children (the root page) with no strip when nothing is open", () => {
    render(
      <Provider>
        <TabsContainer>
          <div data-testid="root-page">Dashboard</div>
        </TabsContainer>
      </Provider>,
    );
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
    expect(document.querySelector("[data-role='tab-strip']")).toBeNull();
  });

  it("never renders workspace content inline — only the strip", async () => {
    render(
      <Provider>
        <Opener />
        <TabsContainer>
          <div data-testid="root-page">Dashboard</div>
        </TabsContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });

    // Strip lists the workspace; content stays in its own browser tab.
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(document.querySelector("[data-role='tab-content']")).toBeNull();
    expect(document.querySelector("[data-testid^='ws-']")).toBeNull();
    // Root page remains visible.
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
  });

  it("open() spawns a browser tab and leaves this tab's URL untouched", async () => {
    render(
      <Provider>
        <Opener />
        <TabsContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/");
  });

  it("clicking a strip tab calls focus() without navigating this tab", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <TabsContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    await act(async () => {
      await userEvent.click(tabs[0]!);
    });
    expect(window.location.pathname).toBe("/");
  });
});

// ─── workspace tab ────────────────────────────────────────────────────────────

describe("TabsContainer: workspace tab (direct URL access)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/workspace/cam/ws-tab-1?title=Feed");
  });

  it("renders only the workspace content — no strip, no children", () => {
    render(
      <Provider>
        <TabsContainer>
          <div data-testid="root-page">Dashboard</div>
        </TabsContainer>
      </Provider>,
    );

    expect(screen.getByTestId("ws-ws-tab-1")).toBeInTheDocument();
    expect(document.querySelector("[data-role='tab-strip']")).toBeNull();
    expect(screen.queryByTestId("root-page")).toBeNull();
  });

  it("does not spawn another browser tab when adopting its own workspace", () => {
    render(
      <Provider>
        <TabsContainer />
      </Provider>,
    );
    // Direct access adopts the descriptor from the URL — window.open here
    // would loop popups forever.
    expect(window.open).not.toHaveBeenCalled();
  });

  it("wraps the workspace content in renderWorkspace chrome", () => {
    render(
      <Provider>
        <TabsContainer
          renderWorkspace={(workspace, content) => (
            <section data-testid="chrome" aria-label={workspace.title}>
              {content}
            </section>
          )}
        />
      </Provider>,
    );
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
    expect(screen.getByTestId("chrome").getAttribute("aria-label")).toBe("Feed");
  });

  it("does not render a close/root button (tabs manage their own lifecycle)", () => {
    render(
      <Provider>
        <TabsContainer />
      </Provider>,
    );
    expect(document.querySelector("[data-action='close']")).toBeNull();
  });
});
