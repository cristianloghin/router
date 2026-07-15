import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { Workspaces } from "./Workspaces";
import { defineRoutes } from "../../router/RouteRegistry";
import { defineWorkspaces } from "../../workspaces/defineWorkspaces";
import { useWorkspaces } from "../../workspaces/hooks";
import type { WorkspaceComponentProps } from "../../workspaces/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function CamComponent({ workspace }: WorkspaceComponentProps) {
  return <div data-testid={`ws-${workspace.id}`}>{workspace.title}</div>;
}

const routes = defineRoutes({
  "/": { component: () => React.createElement("div", null, "Home") },
});

const workspaceTemplates = defineWorkspaces({
  cam: { component: CamComponent, auth: { type: "public" } },
});

function Opener() {
  const { open } = useWorkspaces();
  return (
    <button data-testid="open" onClick={() => open({ template: "cam", title: "Feed", params: {} })}>
      Open
    </button>
  );
}

function renderWith(adapter: "stack" | "swipe" | "tabs", ui: React.ReactNode) {
  return render(
    <AppProvider routes={routes} workspaces={workspaceTemplates} config={{ adapter }}>
      <Opener />
      {ui}
    </AppProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── adapter selection ────────────────────────────────────────────────────────

describe("Workspaces: container selection by adapterType", () => {
  it("renders StackContainer under the stack adapter", () => {
    renderWith("stack", <Workspaces />);
    expect(document.querySelector("[data-component='stack-container']")).not.toBeNull();
  });

  it("renders SwipeContainer under the swipe adapter", () => {
    renderWith("swipe", <Workspaces />);
    expect(document.querySelector("[data-component='swipe-container']")).not.toBeNull();
  });

  it("renders TabsContainer under the tabs adapter", () => {
    renderWith("tabs", <Workspaces />);
    expect(document.querySelector("[data-component='tabs-container']")).not.toBeNull();
  });
});

// ─── prop passthrough ─────────────────────────────────────────────────────────

describe("Workspaces: prop passthrough", () => {
  it("passes children through as the root page", () => {
    renderWith("swipe", (
      <Workspaces>
        <div data-testid="root-page">Dashboard</div>
      </Workspaces>
    ));
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
  });

  it("passes children through under the tabs adapter (launching tab)", () => {
    renderWith("tabs", (
      <Workspaces>
        <div data-testid="root-page">Dashboard</div>
      </Workspaces>
    ));
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
  });

  it("passes renderWorkspace through to the selected container", async () => {
    renderWith("stack", (
      <Workspaces
        renderWorkspace={(workspace, content) => (
          <section data-testid="chrome" aria-label={workspace.title}>{content}</section>
        )}
      />
    ));
    await act(async () => {
      await userEvent.click(screen.getByTestId("open"));
    });
    expect(screen.getByTestId("chrome")).toHaveAttribute("aria-label", "Feed");
  });
});
