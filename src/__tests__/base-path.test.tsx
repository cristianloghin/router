import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../provider/AppProvider";
import { RouterStore } from "../router/RouterContext";
import { RouterView } from "../components/RouterView";
import { Link } from "../components/Link";
import { SwipeContainer } from "../components/containers/SwipeContainer";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useWorkspaces, useWorkspaceActions } from "../workspaces/hooks";
import { useLocation } from "../router/hooks";
import type { WorkspaceComponentProps } from "../workspaces/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE = "/Planner";

const routes = defineRoutes({
  "/": { component: () => <div data-testid="home">Home</div> },
  "/day": { component: () => <div data-testid="day">Day</div> },
});

const workspaces = defineWorkspaces({
  cam: {
    component: ({ workspace }: WorkspaceComponentProps) => (
      <div data-testid={`ws-${workspace.id}`}>{workspace.title}</div>
    ),
    auth: { type: "public" },
  },
});

function Provider({
  children,
  adapter = "stack",
}: {
  children: React.ReactNode;
  adapter?: "stack" | "swipe";
}) {
  return (
    <AppProvider
      routes={routes}
      workspaces={workspaces}
      config={{ basePath: BASE, adapter }}
    >
      {children}
    </AppProvider>
  );
}

function Opener({ title = "A" }: { title?: string }) {
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

/** Surfaces the router's internal path + inWorkspace flag. */
function Probe() {
  const { path, inWorkspace } = useLocation();
  return (
    <>
      <div data-testid="path">{path}</div>
      <div data-testid="in-workspace">{String(inWorkspace)}</div>
    </>
  );
}

// jsdom implements neither scrollTo nor scrollIntoView.
if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function () {};
}

function getTrack(): HTMLElement {
  const track = document.querySelector("[data-role='swipe-track']") as HTMLElement;
  expect(track).not.toBeNull();
  return track;
}

/** jsdom has no layout — stub the track's scrollWidth and set scrollLeft. */
function scrollTrackTo(track: HTMLElement, scrollWidth: number, scrollLeft: number): void {
  Object.defineProperty(track, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(track, "scrollLeft", {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  act(() => {
    track.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", BASE);
});

// ─── RouterStore: reading the address bar ─────────────────────────────────────

describe("basePath: RouterStore reads", () => {
  it("strips the base on init so route keys stay absolute from /", () => {
    window.history.replaceState(null, "", `${BASE}/day`);
    const store = new RouterStore({}, "/workspace", BASE);
    expect(store.getSnapshot().path).toBe("/day");
    store.destroy();
  });

  it("maps the bare base to the app root", () => {
    window.history.replaceState(null, "", BASE);
    const store = new RouterStore({}, "/workspace", BASE);
    expect(store.getSnapshot().path).toBe("/");
    store.destroy();
  });

  it("strips the base on popstate (browser back/forward)", () => {
    window.history.replaceState(null, "", `${BASE}/day`);
    const store = new RouterStore({}, "/workspace", BASE);
    window.history.replaceState(null, "", `${BASE}/`);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(store.getSnapshot().path).toBe("/");
    store.destroy();
  });
});

// ─── RouterStore: writing the address bar ─────────────────────────────────────

describe("basePath: RouterStore writes", () => {
  it("prepends the base on push, keeping state.path internal", () => {
    const store = new RouterStore({}, "/workspace", BASE);
    act(() => store.navigate("/day"));
    expect(window.location.pathname).toBe(`${BASE}/day`);
    expect(store.getSnapshot().path).toBe("/day");
    store.destroy();
  });

  it("prepends the base on replace", () => {
    const store = new RouterStore({}, "/workspace", BASE);
    act(() => store.navigate("/day", { replace: true }));
    expect(window.location.pathname).toBe(`${BASE}/day`);
    store.destroy();
  });

  it("round-trips: navigating then reloading yields the same internal path", () => {
    const store = new RouterStore({}, "/workspace", BASE);
    act(() => store.navigate("/day"));
    store.destroy();
    // Simulate a reload at the URL the address bar now holds.
    const reloaded = new RouterStore({}, "/workspace", BASE);
    expect(reloaded.getSnapshot().path).toBe("/day");
    reloaded.destroy();
  });
});

// ─── Ordering: strip the app base, then test the workspace prefix ─────────────

describe("basePath: composition with workspaceBasePath", () => {
  it("recognises a workspace URL nested under the app base", () => {
    window.history.replaceState(null, "", `${BASE}/workspace/cam/abc?title=A`);
    const store = new RouterStore({}, "/workspace", BASE);
    const snap = store.getSnapshot();
    expect(snap.inWorkspace).toBe(true);
    // Workspace URLs stay transparent to the router: path is the route path.
    expect(snap.path).toBe("/");
    store.destroy();
  });

  it("passes an out-of-base pathname through rather than mangling it", () => {
    // toInternal has nothing to strip here, so the workspace prefix still
    // matches. Unreachable in production (the server 404s a URL outside the
    // base before React boots) and self-correcting if a dev server rewrites
    // it, since every subsequent write goes through toExternal. Asserted so
    // the pass-through branch is pinned rather than accidental.
    window.history.replaceState(null, "", "/workspace/cam/abc");
    const store = new RouterStore({}, "/workspace", BASE);
    expect(store.getSnapshot().inWorkspace).toBe(true);
    store.destroy();
  });

  it("does not strip a base that only prefix-matches mid-segment", () => {
    window.history.replaceState(null, "", "/PlannerX/day");
    const store = new RouterStore({}, "/workspace", BASE);
    expect(store.getSnapshot().path).toBe("/PlannerX/day");
    store.destroy();
  });

  it("writes workspace URLs under the base when opening", async () => {
    render(
      <Provider>
        <Opener />
        <Probe />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    expect(window.location.pathname).toMatch(
      new RegExp(`^${BASE}/workspace/cam/`),
    );
    expect(screen.getByTestId("in-workspace")).toHaveTextContent("true");
  });

  it("returns to the origin under the base on close", async () => {
    function Closer() {
      const { workspaces: list } = useWorkspaces();
      const { close } = useWorkspaceActions();
      return (
        <button
          data-testid="close"
          onClick={() => list[0] && close(list[0].id)}
        >
          Close
        </button>
      );
    }
    render(
      <Provider>
        <Opener />
        <Closer />
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    await act(async () => {
      await userEvent.click(screen.getByTestId("close"));
    });
    expect(window.location.pathname).toBe(BASE);
  });
});

// ─── Link: two forms of one path ──────────────────────────────────────────────

describe("basePath: Link", () => {
  it("renders an external href but navigates with the internal path", async () => {
    render(
      <Provider>
        <Link to="/day" data-testid="link">
          Day
        </Link>
        <RouterView />
        <Probe />
      </Provider>,
    );

    // The anchor must carry a real URL — middle-click and hover preview read it.
    expect(screen.getByTestId("link")).toHaveAttribute("href", `${BASE}/day`);

    await act(async () => {
      await userEvent.click(screen.getByTestId("link"));
    });

    // Clicking navigates once, not twice: the router's path stays internal,
    // and the address bar is not double-prefixed.
    expect(screen.getByTestId("path")).toHaveTextContent("/day");
    expect(window.location.pathname).toBe(`${BASE}/day`);
    expect(screen.getByTestId("day")).toBeInTheDocument();
  });

  it("marks the link active from the internal path", () => {
    window.history.replaceState(null, "", `${BASE}/day`);
    render(
      <Provider>
        <Link to="/day" activeClassName="on" data-testid="link">
          Day
        </Link>
      </Provider>,
    );
    expect(screen.getByTestId("link").className).toContain("on");
  });
});

// ─── Swipe settle: both branches translate ────────────────────────────────────

describe("basePath: swipe settle", () => {
  it("settling on a workspace writes that workspace's URL under the base", async () => {
    render(
      <Provider adapter="swipe">
        <Opener title="A" />
        <Opener title="B" />
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
    scrollTrackTo(track, 300, 100); // pages: 0 root, 1 = A, 2 = B

    expect(window.location.pathname).toMatch(new RegExp(`^${BASE}/workspace/cam/`));
    expect(window.location.search).toContain("title=A");
  });

  it("settling on the root page writes the route path under the base", async () => {
    render(
      <Provider adapter="swipe">
        <Opener title="A" />
        <SwipeContainer>
          <div data-testid="root-page">Dashboard</div>
        </SwipeContainer>
      </Provider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByTestId("open-A"));
    });
    expect(window.location.pathname).toMatch(new RegExp(`^${BASE}/workspace/cam/`));

    const track = getTrack();
    scrollTrackTo(track, 200, 0); // settle on page 0 → root

    expect(window.location.pathname).toBe(BASE);
  });
});

// ─── Route guards see a correct inWorkspace under a base ──────────────────────

describe("basePath: route guard context", () => {
  it("reports inWorkspace from the stripped pathname", async () => {
    const seen: boolean[] = [];
    const guarded = defineRoutes({
      "/": { component: () => <div data-testid="home">Home</div> },
      "/day": {
        component: () => <div data-testid="day">Day</div>,
        guard: (_params, context) => {
          seen.push(context.inWorkspace);
          return true;
        },
      },
    });

    function Nav() {
      const { open } = useWorkspaceActions();
      return (
        <>
          <button
            data-testid="open"
            onClick={() => open({ template: "cam", title: "A", params: {} })}
          >
            Open
          </button>
          <Link to="/day" data-testid="to-day">
            Day
          </Link>
        </>
      );
    }

    render(
      <AppProvider routes={guarded} workspaces={workspaces} config={{ basePath: BASE }}>
        <Nav />
        <RouterView />
      </AppProvider>,
    );

    // Navigate while at a route: not in a workspace.
    await act(async () => {
      await userEvent.click(screen.getByTestId("to-day"));
    });
    expect(seen).toEqual([false]);

    // Open a workspace, then navigate again: the guard must see inWorkspace.
    await act(async () => {
      await userEvent.click(screen.getByTestId("open"));
    });
    await act(async () => {
      await userEvent.click(screen.getByTestId("to-day"));
    });
    expect(seen[seen.length - 1]).toBe(true);
  });
});
