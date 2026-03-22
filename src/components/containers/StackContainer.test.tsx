import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { StackContainer } from "./StackContainer";
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

const workspaces = defineWorkspaces({
  cam: {
    component: CamComponent,
    auth: { type: "public" },
  },
});

function Provider({ children, navigate }: { children: React.ReactNode; navigate?: ReturnType<typeof vi.fn> }) {
  return (
    <AppProvider
      routes={routes}
      workspaces={workspaces}
      config={{ adapter: "stack" }}
    >
      {children}
    </AppProvider>
  );
}

/** Helper: open a workspace from outside the container. */
function Opener({ onOpen }: { onOpen?: (open: ReturnType<typeof useWorkspaces>["open"]) => void }) {
  const { open } = useWorkspaces();
  return (
    <button
      data-testid="open-btn"
      onClick={() =>
        open({ template: "cam", title: "Feed", params: {} }).then((d) => onOpen?.(open))
      }
    >
      Open
    </button>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── rendering ────────────────────────────────────────────────────────────────

describe("StackContainer: rendering", () => {
  it("renders nothing when no workspaces are open", () => {
    const { container } = render(
      <Provider>
        <StackContainer />
      </Provider>,
    );
    // Container element exists but has no workspace children
    expect(container.querySelector("[data-testid^='ws-']")).toBeNull();
  });

  it("renders workspace component after open()", async () => {
    render(
      <Provider>
        <Opener />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-btn"));
    });
    expect(document.querySelector("[data-testid^='ws-']")).not.toBeNull();
  });

  it("workspace title appears in rendered output", async () => {
    render(
      <Provider>
        <Opener />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-btn"));
    });
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("StackContainer: close", () => {
  it("workspace disappears from DOM after close button is clicked", async () => {
    render(
      <Provider>
        <Opener />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-btn"));
    });
    expect(screen.getByText("Feed")).toBeInTheDocument();

    const closeBtn = document.querySelector("[data-action='close']") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    await act(async () => {
      await userEvent.click(closeBtn);
    });
    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
  });
});

// ─── focus ────────────────────────────────────────────────────────────────────

describe("StackContainer: focus", () => {
  it("renders multiple workspaces in the stack", async () => {
    function MultiOpener() {
      const { open } = useWorkspaces();
      return (
        <>
          <button data-testid="open1" onClick={() => open({ template: "cam", title: "Feed A", params: {} })}>Open A</button>
          <button data-testid="open2" onClick={() => open({ template: "cam", title: "Feed B", params: {} })}>Open B</button>
        </>
      );
    }

    render(
      <Provider>
        <MultiOpener />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open1"));
      await userEvent.click(screen.getByTestId("open2"));
    });
    expect(screen.getByText("Feed A")).toBeInTheDocument();
    expect(screen.getByText("Feed B")).toBeInTheDocument();
  });

  it("focus button brings the workspace forward (does not remove it from DOM)", async () => {
    function MultiOpener() {
      const { open } = useWorkspaces();
      return (
        <>
          <button data-testid="open1" onClick={() => open({ template: "cam", title: "Feed A", params: {} })}>Open A</button>
          <button data-testid="open2" onClick={() => open({ template: "cam", title: "Feed B", params: {} })}>Open B</button>
        </>
      );
    }
    render(
      <Provider>
        <MultiOpener />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open1"));
      await userEvent.click(screen.getByTestId("open2"));
    });

    const focusBtns = document.querySelectorAll("[data-action='focus']");
    // Click focus on the first workspace
    await act(async () => {
      await userEvent.click(focusBtns[0] as HTMLElement);
    });
    // Both workspaces still present
    expect(screen.getByText("Feed A")).toBeInTheDocument();
    expect(screen.getByText("Feed B")).toBeInTheDocument();
  });
});
