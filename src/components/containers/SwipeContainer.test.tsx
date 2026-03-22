import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { SwipeContainer } from "./SwipeContainer";
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

function Provider({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "swipe" }}>
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

// jsdom does not implement scrollTo — define a stub before spying.
if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scrollToSpy: any;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  scrollToSpy.mockRestore();
});

// ─── rendering ────────────────────────────────────────────────────────────────

describe("SwipeContainer: rendering", () => {
  it("renders nothing when no workspaces are open", () => {
    const { container } = render(
      <Provider>
        <SwipeContainer />
      </Provider>,
    );
    expect(container.querySelector("[data-testid^='ws-']")).toBeNull();
  });

  it("renders workspace component after open()", async () => {
    render(
      <Provider>
        <Opener />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe("SwipeContainer: close", () => {
  it("workspace disappears after close button click", async () => {
    render(
      <Provider>
        <Opener />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });

    const closeBtn = document.querySelector("[data-action='close']") as HTMLElement;
    await act(async () => {
      await userEvent.click(closeBtn);
    });
    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
  });
});

// ─── scroll → setCurrentIndex ─────────────────────────────────────────────────

describe("SwipeContainer: scroll updates index", () => {
  it("fires a scroll event on the container without crashing", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });

    const track = document.querySelector("[data-role='swipe-track']") as HTMLElement;
    expect(track).not.toBeNull();

    // Simulate a scroll event — should not throw
    act(() => {
      track.dispatchEvent(new Event("scroll"));
    });
  });
});

// ─── focus → scrollTo ─────────────────────────────────────────────────────────

describe("SwipeContainer: focus scrolls container", () => {
  it("clicking focus calls scrollTo on the container", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });

    const focusBtns = document.querySelectorAll("[data-action='focus']");
    await act(async () => {
      await userEvent.click(focusBtns[0] as HTMLElement);
    });
    // scrollTo should have been called when programmatic focus is triggered
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
