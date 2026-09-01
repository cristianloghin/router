/**
 * Integration: nesting inference at depth (roadmap item 5 — verification).
 *
 * The prefix-inference + index-component model had only ever been exercised on
 * a flat three-route app. This reproduces the shape vms-frontend's walls
 * section actually has: four levels, an index component at every level that
 * has children, static and parametric siblings at the same depth, and layouts
 * that must not remount as the user moves between children.
 *
 * Public API imports only.
 */
import React, { useEffect } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

import { AppProvider } from "../provider/AppProvider";
import { RouterView } from "../components/RouterView";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useNavigation } from "../router/hooks";

const emptyWorkspaces = defineWorkspaces({});

// ─── Cumulative mount counters ────────────────────────────────────────────────

/** Cumulative, never decremented: 1 → 2 means the component remounted. */
const mounts: Record<string, number> = {};

function useMountCount(key: string): void {
  useEffect(() => {
    mounts[key] = (mounts[key] ?? 0) + 1;
  }, []);
}

function resetMounts(): void {
  for (const k of Object.keys(mounts)) delete mounts[k];
}

// ─── The walls tree ───────────────────────────────────────────────────────────
//
//   /videowalls                        WallsShell   + index
//   /videowalls/new                    NewWall              (static sibling)
//   /videowalls/:id                    SelectedWall + index (parametric sibling)
//   /videowalls/:id/live               LiveWall     + index
//   /videowalls/:id/live/:cameraId     CameraDetail         (level 4)
//   /videowalls/:id/recording          RecordingWall

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WallsShell: React.ComponentType<any> = ({ outlet }) => {
  useMountCount("shell");
  return <div><div data-testid="shell">shell</div>{outlet}</div>;
};
const WallsIndex = () => <div data-testid="walls-index">walls-index</div>;
const NewWall = () => <div data-testid="new-wall">new-wall</div>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SelectedWall: React.ComponentType<any> = ({ params, outlet }) => {
  useMountCount("selected");
  return (
    <div>
      <div data-testid="selected">{params.id}</div>
      {outlet}
    </div>
  );
};
const WallIndex = () => <div data-testid="wall-index">wall-index</div>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LiveWall: React.ComponentType<any> = ({ params, outlet }) => {
  useMountCount("live");
  return (
    <div>
      <div data-testid="live">{params.id}</div>
      {outlet}
    </div>
  );
};
const LiveIndex = () => <div data-testid="live-index">live-index</div>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CameraDetail: React.ComponentType<any> = ({ params }) => {
  useMountCount("camera");
  return <div data-testid="camera">{params.id}:{params.cameraId}</div>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RecordingWall: React.ComponentType<any> = ({ params }) => {
  useMountCount("recording");
  return <div data-testid="recording">{params.id}</div>;
};

let resolveLazyCamera: (() => void) | null = null;
const LazyCameraDetail = React.lazy(
  () =>
    new Promise<{ default: React.ComponentType }>((resolve) => {
      resolveLazyCamera = () =>
        resolve({ default: () => <div data-testid="lazy-camera">lazy-camera</div> });
    }),
);

const wallRoutes = defineRoutes({
  "/": { component: () => <div data-testid="home">home</div> },
  "/videowalls": { component: WallsShell, index: WallsIndex },
  "/videowalls/new": { component: NewWall },
  "/videowalls/:id": { component: SelectedWall, index: WallIndex },
  "/videowalls/:id/live": { component: LiveWall, index: LiveIndex },
  "/videowalls/:id/live/:cameraId": { component: CameraDetail },
  "/videowalls/:id/recording": { component: RecordingWall },
});

const lazyWallRoutes = defineRoutes({
  "/": { component: () => <div data-testid="home">home</div> },
  "/videowalls": { component: WallsShell, index: WallsIndex },
  "/videowalls/:id": { component: SelectedWall, index: WallIndex },
  "/videowalls/:id/live": { component: LiveWall, index: LiveIndex },
  "/videowalls/:id/live/:cameraId": { component: LazyCameraDetail },
});

// ─── Harness ──────────────────────────────────────────────────────────────────

let navigate: (to: string) => void;

function Nav() {
  const nav = useNavigation();
  navigate = (to: string) => nav.navigate(to);
  return null;
}

function mountAt(path: string, routes: ReturnType<typeof defineRoutes> = wallRoutes) {
  window.history.replaceState(null, "", path);
  return render(
    <AppProvider routes={routes} workspaces={emptyWorkspaces} config={{}}>
      <Nav />
      <RouterView />
    </AppProvider>,
  );
}

const go = async (to: string) => {
  await act(async () => { navigate(to); });
};

beforeEach(() => {
  resetMounts();
  window.history.replaceState(null, "", "/");
});

// ─── Rendering the chain at each depth ────────────────────────────────────────

describe("deep nesting: the chain renders at every depth", () => {
  it("level 1 renders the shell and its index", () => {
    mountAt("/videowalls");
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("walls-index")).toBeInTheDocument();
  });

  it("level 2 nests inside level 1 and shows its own index", () => {
    mountAt("/videowalls/w1");
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toHaveTextContent("w1");
    expect(screen.getByTestId("wall-index")).toBeInTheDocument();
    // The parent's index gives way to the matched child.
    expect(screen.queryByTestId("walls-index")).not.toBeInTheDocument();
  });

  it("level 3 nests inside levels 1-2 and shows its own index", () => {
    mountAt("/videowalls/w1/live");
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeInTheDocument();
    expect(screen.getByTestId("live")).toBeInTheDocument();
    expect(screen.getByTestId("live-index")).toBeInTheDocument();
    expect(screen.queryByTestId("wall-index")).not.toBeInTheDocument();
  });

  it("level 4 nests inside levels 1-3 and suppresses every index", () => {
    mountAt("/videowalls/w1/live/cam9");
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeInTheDocument();
    expect(screen.getByTestId("live")).toBeInTheDocument();
    expect(screen.getByTestId("camera")).toHaveTextContent("w1:cam9");
    expect(screen.queryByTestId("walls-index")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wall-index")).not.toBeInTheDocument();
    expect(screen.queryByTestId("live-index")).not.toBeInTheDocument();
  });
});

// ─── Params at depth ──────────────────────────────────────────────────────────

describe("deep nesting: params resolve per level", () => {
  it("every level sees the params its own pattern declares", () => {
    mountAt("/videowalls/w7/live/cam3");
    expect(screen.getByTestId("selected")).toHaveTextContent("w7");
    expect(screen.getByTestId("live")).toHaveTextContent("w7");
    expect(screen.getByTestId("camera")).toHaveTextContent("w7:cam3");
  });

  it("percent-encoded param values arrive decoded at depth", () => {
    mountAt("/videowalls/w%201/live/cam%2F9");
    expect(screen.getByTestId("selected")).toHaveTextContent("w 1");
    expect(screen.getByTestId("camera")).toHaveTextContent("w 1:cam/9");
  });
});

// ─── Static vs parametric siblings ────────────────────────────────────────────

describe("deep nesting: static beats parametric at the same depth", () => {
  it("/videowalls/new renders the static route, not the param one", () => {
    mountAt("/videowalls/new");
    expect(screen.getByTestId("new-wall")).toBeInTheDocument();
    expect(screen.queryByTestId("selected")).not.toBeInTheDocument();
  });

  it("an id that is not 'new' still takes the parametric route", () => {
    mountAt("/videowalls/newish");
    expect(screen.getByTestId("selected")).toHaveTextContent("newish");
    expect(screen.queryByTestId("new-wall")).not.toBeInTheDocument();
  });
});

// ─── Parent stability ─────────────────────────────────────────────────────────

describe("deep nesting: layouts do not remount as children change", () => {
  it("keeps levels 1-2 mounted when switching level-3 siblings", async () => {
    mountAt("/videowalls/w1/live");
    await waitFor(() => expect(mounts["shell"]).toBe(1));
    expect(mounts["selected"]).toBe(1);

    await go("/videowalls/w1/recording");
    await waitFor(() => expect(screen.getByTestId("recording")).toBeInTheDocument());

    expect(mounts["shell"]).toBe(1);
    expect(mounts["selected"]).toBe(1);
  });

  it("keeps levels 1-3 mounted when switching level-4 siblings", async () => {
    mountAt("/videowalls/w1/live/cam1");
    await waitFor(() => expect(mounts["live"]).toBe(1));

    await go("/videowalls/w1/live/cam2");
    await waitFor(() => expect(screen.getByTestId("camera")).toHaveTextContent("w1:cam2"));

    expect(mounts["shell"]).toBe(1);
    expect(mounts["selected"]).toBe(1);
    expect(mounts["live"]).toBe(1);
  });

  it("keeps the shell mounted while descending the whole tree", async () => {
    mountAt("/videowalls");
    await waitFor(() => expect(mounts["shell"]).toBe(1));

    await go("/videowalls/w1");
    await waitFor(() => expect(screen.getByTestId("wall-index")).toBeInTheDocument());
    await go("/videowalls/w1/live");
    await waitFor(() => expect(screen.getByTestId("live-index")).toBeInTheDocument());
    await go("/videowalls/w1/live/cam1");
    await waitFor(() => expect(screen.getByTestId("camera")).toBeInTheDocument());

    expect(mounts["shell"]).toBe(1);
  });

  it("keeps the shell mounted when ascending back up", async () => {
    mountAt("/videowalls/w1/live/cam1");
    await waitFor(() => expect(mounts["shell"]).toBe(1));

    await go("/videowalls/w1/live");
    await waitFor(() => expect(screen.getByTestId("live-index")).toBeInTheDocument());
    await go("/videowalls");
    await waitFor(() => expect(screen.getByTestId("walls-index")).toBeInTheDocument());

    expect(mounts["shell"]).toBe(1);
  });

  it("unmounts the shell when leaving the section entirely", async () => {
    mountAt("/videowalls/w1");
    await waitFor(() => expect(screen.getByTestId("shell")).toBeInTheDocument());
    await go("/");
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  });
});

// ─── Changing a parametric ancestor ───────────────────────────────────────────

describe("deep nesting: switching the wall id", () => {
  it("re-renders the parametric layout in place rather than remounting it", async () => {
    mountAt("/videowalls/w1/live");
    await waitFor(() => expect(mounts["selected"]).toBe(1));

    await go("/videowalls/w2/live");
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("w2"));

    // The boundary fiber is keyed by nesting depth, not by route or params, so
    // /videowalls/:id survives an id change as a re-render. State held in that
    // layout therefore carries across walls — deliberate, and worth knowing.
    expect(mounts["shell"]).toBe(1);
    expect(mounts["selected"]).toBe(1);
    expect(mounts["live"]).toBe(1);
  });
});

// ─── Transitions at depth ─────────────────────────────────────────────────────

describe("deep nesting: transition to a lazy leaf", () => {
  it("keeps all three ancestor layouts on screen while level 4 loads", async () => {
    resolveLazyCamera = null;
    mountAt("/videowalls/w1/live", lazyWallRoutes);
    await waitFor(() => expect(screen.getByTestId("live-index")).toBeInTheDocument());

    await go("/videowalls/w1/live/cam1");

    // Mid-transition: the leaf has not resolved, and the chain is still up.
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeInTheDocument();
    expect(screen.getByTestId("live")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-camera")).not.toBeInTheDocument();

    await act(async () => { resolveLazyCamera?.(); });
    await waitFor(() => expect(screen.getByTestId("lazy-camera")).toBeInTheDocument());

    expect(mounts["shell"]).toBe(1);
    expect(mounts["selected"]).toBe(1);
    expect(mounts["live"]).toBe(1);
  });
});
