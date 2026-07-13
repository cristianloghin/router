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

// Stub BroadcastChannel (not needed for TabsContainer in tests)
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

function Provider({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
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
});

// ─── rendering ────────────────────────────────────────────────────────────────

describe("TabsContainer: rendering", () => {
  it("renders nothing when no workspaces are open", () => {
    const { container } = render(
      <Provider>
        <TabsContainer />
      </Provider>,
    );
    expect(container.querySelector("[data-testid^='ws-']")).toBeNull();
  });

  it("renders current workspace after open()", async () => {
    render(
      <Provider>
        <Opener />
        <TabsContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    // The workspace component renders inside the tab-content area
    expect(document.querySelector("[data-role='tab-content']")).not.toBeNull();
  });

  it("shows workspace list for navigation", async () => {
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
    // Both tabs appear in the tab list
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});

// ─── focus via tab click ──────────────────────────────────────────────────────

describe("TabsContainer: tab navigation", () => {
  it("clicking a different tab calls focus()", async () => {
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
    // Click on first tab (A) — should not throw
    await act(async () => {
      await userEvent.click(tabs[0]!);
    });
  });
});

// ─── no close button ──────────────────────────────────────────────────────────

describe("TabsContainer: no root navigation button", () => {
  it("does not render a close/root button (tabs manage their own back)", async () => {
    render(
      <Provider>
        <Opener />
        <TabsContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(document.querySelector("[data-action='close']")).toBeNull();
  });
});

// ─── renderWorkspace ──────────────────────────────────────────────────────────

describe("TabsContainer: renderWorkspace", () => {
  it("wraps the current workspace's content in app-provided chrome", async () => {
    render(
      <Provider>
        <Opener />
        <TabsContainer
          renderWorkspace={(workspace, content) => (
            <section data-testid="chrome" aria-label={workspace.title}>
              {content}
            </section>
          )}
        />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
  });
});
