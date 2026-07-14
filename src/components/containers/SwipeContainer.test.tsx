import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../provider/AppProvider";
import { SwipeContainer } from "./SwipeContainer";
import { useWorkspaceContainer } from "./containerContext";
import { defineRoutes } from "../../router/RouteRegistry";
import { defineWorkspaces } from "../../workspaces/defineWorkspaces";
import { useWorkspaces } from "../../workspaces/hooks";
import { useNavigation } from "../../router/hooks";
import { RouterView } from "../RouterView";
import { useWorkspaceManagerContext } from "../../workspaces/context";
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
      Open
    </button>
  );
}

function Actions() {
  const { workspaces: list, focus, close } = useWorkspaces();
  return (
    <>
      <button
        data-testid="focus-first"
        onClick={() => {
          const first = list[0];
          if (first) void focus(first.id);
        }}
      >
        Focus first
      </button>
      <button
        data-testid="close-last"
        onClick={() => {
          const last = list[list.length - 1];
          if (last) void close(last.id);
        }}
      >
        Close
      </button>
    </>
  );
}

// jsdom does not implement scrollTo/scrollIntoView — define stubs before spying.
if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function () {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scrollToSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scrollIntoViewSpy: any;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
  scrollIntoViewSpy = vi
    .spyOn(HTMLElement.prototype, "scrollIntoView")
    .mockImplementation(() => {});
});

afterEach(() => {
  scrollToSpy.mockRestore();
  scrollIntoViewSpy.mockRestore();
});

function getTrack(): HTMLElement {
  const track = document.querySelector("[data-role='swipe-track']") as HTMLElement;
  expect(track).not.toBeNull();
  return track;
}


/** jsdom has no layout — stub the track's scrollWidth and set scrollLeft. */
function scrollTrackTo(track: HTMLElement, scrollWidth: number, scrollLeft: number): void {
  Object.defineProperty(track, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(track, "scrollLeft", { value: scrollLeft, configurable: true, writable: true });
  act(() => {
    track.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

// ─── rendering ────────────────────────────────────────────────────────────────

describe("SwipeContainer: rendering", () => {
  it("renders no workspaces when none are open", () => {
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
        <Actions />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });

  it("ships no injected chrome (no focus/close buttons)", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    expect(document.querySelector("[data-action]")).toBeNull();
  });

  it("workspace disappears after close()", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <SwipeContainer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    await act(async () => {
      await userEvent.click(screen.getByTestId("close-last"));
    });
    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
  });
});

// ─── children as page 0 ───────────────────────────────────────────────────────

describe("SwipeContainer: children as root page", () => {
  it("renders children as the first page of the track", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-Feed"));
    });
    const track = getTrack();
    const pages = track.children;
    expect((pages[0] as HTMLElement).dataset.role).toBe("root-page");
    expect(screen.getByTestId("root-page")).toBeInTheDocument();
    expect((pages[1] as HTMLElement).dataset.workspaceId).toBeTruthy();
  });
});

// ─── renderWorkspace ──────────────────────────────────────────────────────────

describe("SwipeContainer: renderWorkspace", () => {
  it("wraps workspace content in app-provided chrome", async () => {
    render(
      <Provider>
        <Opener />
        <Actions />
        <SwipeContainer
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
    expect(screen.getByTestId("chrome")).toHaveAttribute("aria-label", "Feed");
  });
});

// ─── scroll → URL sync ────────────────────────────────────────────────────────

describe("SwipeContainer: scroll→URL sync", () => {
  it("settling on a workspace page replaces the URL with that workspace's URL", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });
    // Pages: 0 = root, 1 = A, 2 = B. Deck currently shows B's URL (last open).
    const track = getTrack();
    scrollTrackTo(track, 300, 100); // settle on page 1 → workspace A
    expect(window.location.pathname).toMatch(/^\/workspace\/cam\//);
    expect(window.location.search).toContain("title=A");
  });

  it("settling on the root page replaces the URL with the router's current path", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    expect(window.location.pathname).toMatch(/^\/workspace\/cam\//);
    const track = getTrack();
    scrollTrackTo(track, 200, 0); // settle on page 0 → root
    expect(window.location.pathname).toBe("/");
  });

  it("scroll settle does not push history entries (replace semantics)", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    const before = window.history.length;
    const track = getTrack();
    scrollTrackTo(track, 200, 0);
    scrollTrackTo(track, 200, 100);
    expect(window.history.length).toBe(before);
  });

  it("updates the swipe adapter index without emitting workspace:focused", async () => {
    const focusedEvents: string[] = [];
    function EventProbe() {
      const manager = useWorkspaceManagerContext();
      React.useEffect(
        () =>
          manager.subscribe((e) => {
            if (e.type === "workspace:focused") focusedEvents.push(e.workspaceId);
          }),
        [manager],
      );
      return null;
    }
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <Actions />
        <EventProbe />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });
    focusedEvents.length = 0;
    const track = getTrack();
    scrollTrackTo(track, 300, 100); // settle on workspace A's page
    expect(focusedEvents).toEqual([]);
  });
});

// ─── programmatic focus → scroll ──────────────────────────────────────────────

describe("SwipeContainer: programmatic focus scrolls the track", () => {
  it("focus() scrolls to (index + rootOffset) × pageWidth", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });
    scrollIntoViewSpy.mockClear();
    await act(async () => {
      await userEvent.click(screen.getByTestId("focus-first")); // workspace A → page 1
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
    // The scroll target is workspace A's own page element.
    const target = scrollIntoViewSpy.mock.instances[0] as HTMLElement;
    const firstWorkspacePage = getTrack().querySelector("[data-workspace-id]");
    expect(target).toBe(firstWorkspacePage);
  });

  it("scroll events during the programmatic scroll are ignored (feedback guard)", async () => {
    render(
      <Provider>
        <Opener title="A" />
        <Opener title="B" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
      await userEvent.click(screen.getByTestId("open-B"));
    });
    const track = getTrack();
    Object.defineProperty(track, "scrollWidth", { value: 300, configurable: true });
    await act(async () => {
      await userEvent.click(screen.getByTestId("focus-first")); // target: page 1 (A)
    });
    const urlBefore = window.location.href;
    // Intermediate scroll position (page 2) while smooth-scrolling to page 1:
    scrollTrackTo(track, 300, 200);
    expect(window.location.href).toBe(urlBefore);
    // Reaching the target page clears the guard without navigating.
    scrollTrackTo(track, 300, 100);
    expect(window.location.href).toBe(urlBefore);
  });
});

// ─── useWorkspaceContainer ────────────────────────────────────────────────────

describe("SwipeContainer: useWorkspaceContainer", () => {
  it("exposes the swipe track to descendants", () => {
    let seen: HTMLElement | null = null;
    function Probe() {
      seen = useWorkspaceContainer();
      return null;
    }
    render(
      <Provider>
        <SwipeContainer>
          <Probe />
        </SwipeContainer>
      </Provider>,
    );
    expect(seen).not.toBeNull();
    expect((seen as unknown as HTMLElement).dataset.role).toBe("swipe-track");
  });
});

// ─── orientation change ───────────────────────────────────────────────────────

describe("SwipeContainer: orientation change", () => {
  it("re-snaps the track to the settled page when orientation changes", async () => {
    // jsdom has no screen.orientation — stub a minimal event target.
    const listeners = new Set<() => void>();
    const orientation = {
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    Object.defineProperty(window.screen, "orientation", {
      value: orientation,
      configurable: true,
    });

    render(
      <Provider>
        <Opener title="A" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    const track = getTrack();
    Object.defineProperty(track, "scrollWidth", { value: 200, configurable: true });
    scrollToSpy.mockClear();

    act(() => {
      for (const cb of listeners) cb();
    });
    // Settled page is 1 (workspace A) → re-snap to 1 × 100.
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 100 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window.screen as any).orientation;
  });
});

// ─── root settle preserves the route's query string ───────────────────────────

describe("SwipeContainer: root settle preserves query string", () => {
  it("restores path AND search params when settling on the root page", async () => {
    window.history.replaceState(null, "", "/?filter=active&sort=name");
    render(
      <Provider>
        <Opener title="A" />
        <Actions />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    expect(window.location.pathname).toMatch(/^\/workspace\/cam\//);

    const track = getTrack();
    scrollTrackTo(track, 200, 0); // settle on page 0 → root
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?filter=active&sort=name");
  });
});

// ─── open jumps only after the new page is committed ─────────────────────────

describe("SwipeContainer: open-jump timing", () => {
  it("jumps by calling scrollIntoView on the new workspace's own page element (regression: lost jump)", async () => {
    // Regression lineage: a scrollTo issued before the page was committed
    // clamped to nothing; a deferred scrollTo was discarded by snap-target
    // re-resolution. The contract now: the jump targets the page ELEMENT
    // itself (making it the browser's tracked snap target), which is
    // connected to the document at call time.
    const connectedAtCall: boolean[] = [];
    scrollIntoViewSpy.mockImplementation(function (this: HTMLElement) {
      connectedAtCall.push(this.isConnected && this.dataset.workspaceId !== undefined);
    });

    render(
      <Provider>
        <Opener title="A" />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });

    // The jump happened, always against a connected workspace page element.
    expect(connectedAtCall.length).toBeGreaterThan(0);
    expect(connectedAtCall.every(Boolean)).toBe(true);
  });
});

// ─── route replace + open in the same handler (CreateWorkspace flow) ─────────

describe("SwipeContainer: route replace followed by open in one handler", () => {
  it("ends on the workspace URL with the deck jumped to its page", async () => {
    function CreatePage() {
      const { navigate } = useNavigation();
      const { open } = useWorkspaces();
      return (
        <button
          data-testid="confirm"
          onClick={async () => {
            navigate("/", { replace: true });
            await open({ template: "cam", title: "W", params: {} });
          }}
        >
          Confirm
        </button>
      );
    }
    const flowRoutes = defineRoutes({
      "/": { component: () => <div data-testid="home">Home</div> },
      "/create": { component: CreatePage },
    });

    window.history.replaceState(null, "", "/create");
    render(
      <AppProvider routes={flowRoutes} workspaces={workspaces} config={{ adapter: "swipe" }}>
        <SwipeContainer>
          <RouterView />
        </SwipeContainer>
      </AppProvider>,
    );
    expect(screen.getByTestId("confirm")).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByTestId("confirm"));
    });

    // The route replace landed first, then open() pushed the workspace URL.
    expect(window.location.pathname).toMatch(/^\/workspace\/cam\//);
    // Root page now renders Home (route replace took effect) and the
    // workspace page exists in the deck.
    expect(screen.getByTestId("home")).toBeInTheDocument();
    const page = document.querySelector("[data-workspace-id]");
    expect(page).not.toBeNull();
    // The deck jumped to the workspace's page element.
    expect(scrollIntoViewSpy).toHaveBeenCalled();
    expect(scrollIntoViewSpy.mock.instances).toContain(page);
  });
});
