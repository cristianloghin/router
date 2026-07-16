import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { StackContainer } from "./StackContainer";
import { useWorkspaceContainer } from "./containerContext";
import { defineRoutes } from "../../router/RouteRegistry";
import { defineWorkspaces } from "../../workspaces/defineWorkspaces";
import { useWorkspaces, useWorkspaceActions } from "../../workspaces/hooks";
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

function Provider({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
      {children}
    </AppProvider>
  );
}

/** Hook-driven controls — the container itself is headless. */
function Opener({ title = "Feed" }: { title?: string }) {
  const { open } = useWorkspaceActions();
  return (
    <button
      data-testid={`open-${title}`}
      onClick={() => open({ template: "cam", title, params: {} })}
    >
      Open
    </button>
  );
}

function Actions() {
  const { workspaces: list } = useWorkspaces();
  const { close } = useWorkspaceActions();
  return (
    <button
      data-testid="close-last"
      onClick={() => {
        const last = list[list.length - 1];
        if (last) void close(last.id);
      }}
    >
      Close
    </button>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── rendering ────────────────────────────────────────────────────────────────

describe("StackContainer: rendering", () => {
  it("renders no workspaces when none are open", () => {
    const { container } = render(
      <Provider>
        <StackContainer />
      </Provider>,
    );
    expect(container.querySelector("[data-testid^='ws-']")).toBeNull();
  });

  it("renders workspace component after open()", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(document.querySelector("[data-testid^='ws-']")).not.toBeNull();
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });

  it("renders multiple workspaces in the stack", async () => {
    render(
      <Provider>
        <Opener title="Feed A" />
        <Opener title="Feed B" />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed A"));
      await userEvent.click(screen.getByTestId("open-Feed B"));
    });
    expect(screen.getByText("Feed A")).toBeInTheDocument();
    expect(screen.getByText("Feed B")).toBeInTheDocument();
  });

  it("ships no injected chrome (no focus/close buttons)", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(document.querySelector("[data-action]")).toBeNull();
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("StackContainer: close", () => {
  it("workspace disappears from DOM after close()", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <StackContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(screen.getByText("Feed")).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByTestId("close-last"));
    });
    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
  });
});

// ─── children as root page ────────────────────────────────────────────────────

describe("StackContainer: children", () => {
  it("renders children when no workspace is focused", () => {
    render(
      <Provider>
        <StackContainer>
          <div data-testid="root-page">Dashboard</div>
        </StackContainer>
      </Provider>,
    );
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
  });

  it("hides children while a workspace URL is focused", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <StackContainer>
          <div data-testid="root-page">Dashboard</div>
        </StackContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(screen.queryByTestId("root-page")).not.toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByTestId("close-last"));
    });
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
  });
});

// ─── renderWorkspace ──────────────────────────────────────────────────────────

describe("StackContainer: renderWorkspace", () => {
  it("wraps workspace content in app-provided chrome", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <StackContainer
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
    const chrome = screen.getByTestId("chrome");
    expect(chrome).toHaveAttribute("aria-label", "Feed");
    expect(chrome.querySelector("[data-testid^='ws-']")).not.toBeNull();
  });
});

// ─── useWorkspaceContainer ────────────────────────────────────────────────────

describe("StackContainer: useWorkspaceContainer", () => {
  it("exposes the container element to descendants", () => {
    let seen: HTMLElement | null = null;
    function Probe() {
      seen = useWorkspaceContainer();
      return null;
    }
    render(
      <Provider>
        <StackContainer>
          <Probe />
        </StackContainer>
      </Provider>,
    );
    expect(seen).not.toBeNull();
    expect((seen as unknown as HTMLElement).dataset.component).toBe("stack-container");
  });
});
