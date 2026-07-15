import React, { useState } from "react";
import {
  AppProvider,
  RouterView,
  Workspaces,
  Link,
  useLocation,
  useNavigation,
  useWorkspaces,
  type AppConfig,
  type WorkspaceDescriptor,
} from "@mikrostack/router";
import { routes } from "./routes";
import { workspaces } from "./workspaces";
import { NotFoundPage } from "./pages";
import { WorkspacePanel, PingButton } from "./WorkspacePanel";
import { authStore, useAuth } from "./authStore";

// Register the maps so every hook is fully typed without generics.
declare module "@mikrostack/router" {
  interface Register {
    routes: typeof routes;
    workspaces: typeof workspaces;
  }
}

// Adapter is fixed at provider mount — persist the choice and reload to switch.
const ADAPTER_KEY = "playground:adapter";
const adapter = (localStorage.getItem(ADAPTER_KEY) ?? "stack") as NonNullable<AppConfig["adapter"]>;

const config: AppConfig = {
  adapter,
  maxWorkspaces: 5,
  auth: {
    isAuthenticated: () => authStore.loggedIn,
  },
  defaultLoading: <div className="card">Loading… (defaultLoading)</div>,
  onNavigate: (event) => {
    console.log("[playground] onNavigate", event);
  },
};

export function App() {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={config} meta={{ theme: "light" }}>
      <Shell />
    </AppProvider>
  );
}

/**
 * The app fills the viewport; the playground chrome (top bar + sidebar) is a
 * demonstration overlay that can be toggled off to experience the app
 * standalone. A tabs-adapter workspace tab renders completely bare — that's
 * the production experience.
 */
function Shell() {
  const { adapterType } = useWorkspaces();
  const { inWorkspace } = useLocation();
  const [chrome, setChrome] = useState(
    () => localStorage.getItem("playground:chrome") !== "0",
  );

  if (adapterType === "tabs" && inWorkspace) {
    return <Workspaces renderWorkspace={renderWorkspaceFrame} />;
  }

  const toggleChrome = () => {
    setChrome((open) => {
      localStorage.setItem("playground:chrome", open ? "0" : "1");
      return !open;
    });
  };

  return (
    <>
      <main className="content">
        <MainContent />
      </main>
      {chrome && (
        <div className="dev-chrome">
          <TopBar />
          <NavMenu />
        </div>
      )}
      <button
        className="dev-toggle"
        onClick={toggleChrome}
        title={chrome ? "Hide playground chrome" : "Show playground chrome"}
      >
        {chrome ? "✕" : "🛠"}
      </button>
    </>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function MainContent() {
  return (
    <Workspaces renderWorkspace={renderWorkspaceFrame}>
      <RouterView fallback={NotFoundPage} />
      <WorkspacePanel />
    </Workspaces>
  );
}

// ─── Workspace chrome (containers are headless) ───────────────────────────────

function renderWorkspaceFrame(workspace: WorkspaceDescriptor, content: React.ReactNode) {
  return <WorkspaceFrame workspace={workspace}>{content}</WorkspaceFrame>;
}

function WorkspaceFrame({ workspace, children }: { workspace: WorkspaceDescriptor; children: React.ReactNode }) {
  const { close } = useWorkspaces();
  return (
    <div className="ws-frame">
      <div className="ws-titlebar">
        <span style={{ flex: 1 }}>{workspace.title}</span>
        <span className="badge">{workspace.template}</span>
        {workspace.template === "cameraFeed" && <PingButton wsId={workspace.id} />}
        <button onClick={() => close(workspace.id)}>✕ Close</button>
      </div>
      <div className="ws-body">{children}</div>
    </div>
  );
}

// ─── Top bar: live location state + auth + adapter switch ─────────────────────

function TopBar() {
  const { path, inWorkspace, canGoBack, isTransitioning } = useLocation();
  const { back } = useNavigation();
  const loggedIn = useAuth();

  const switchAdapter = (value: string) => {
    localStorage.setItem(ADAPTER_KEY, value);
    window.location.assign("/"); // adapter is a mount-time config — reload to apply
  };

  return (
    <header className="topbar">
      <span className="brand">@mikrostack/router</span>
      <span className="badge">{path}</span>
      {inWorkspace && <span className="badge">in workspace</span>}
      {isTransitioning && <span className="badge">transitioning…</span>}
      <button onClick={back} disabled={!canGoBack}>
        ← back()
      </button>
      <span className="spacer" />
      <label>
        adapter{" "}
        <select value={adapter} onChange={(e) => switchAdapter(e.target.value)}>
          <option value="stack">stack</option>
          <option value="swipe">swipe</option>
          <option value="tabs">tabs</option>
          <option value="auto">auto</option>
        </select>
      </label>
      <button onClick={() => authStore.toggle()}>{loggedIn ? "🟢 Logged in" : "⚪ Logged out"}</button>
    </header>
  );
}

// ─── Nav menu ─────────────────────────────────────────────────────────────────
// Horizontal menu: each section is a column, links stacked under the heading.
// Links are typed against the registered route keys; `params` interpolates
// `:param` segments. Active styling comes from Link's own activeClassName.

function NavMenu() {
  const { navigate } = useNavigation();
  return (
    <nav className="dev-nav">
      <section>
        <h4>Basics</h4>
        <Link to="/" exactActiveClassName="active">Home</Link>
        <Link to="/about" activeClassName="active">About (buildPath, useRoute)</Link>
        <Link to="/users/:id" params={{ id: "42" }} activeClassName="active">
          Params (/users/:id)
        </Link>
        {/* Wildcard paths aren't route keys — use the untyped navigate overload */}
        <a
          href="/files/docs/readme.md"
          onClick={(e) => {
            e.preventDefault();
            navigate("/files/docs/readme.md");
          }}
        >
          Wildcard (/files/*)
        </a>
      </section>

      <section>
        <h4>Nesting & loading</h4>
        <Link to="/settings" activeClassName="active">Nested routes</Link>
        <Link to="/lazy" activeClassName="active">Lazy route</Link>
      </section>

      <section>
        <h4>Guards & errors</h4>
        <Link to="/admin" activeClassName="active">Guarded (/admin)</Link>
        <Link to="/broken" activeClassName="active">Error boundary</Link>
        <Link to="/users/:id" params={{ id: "999" }}>notFound()</Link>
      </section>

      <section>
        <h4>Workspaces</h4>
        <Link to="/launcher" activeClassName="active">origin option</Link>
      </section>

      <section>
        <h4>State</h4>
        <Link to="/query" activeClassName="active">useQueryState</Link>
        <Link to="/prompt" activeClassName="active">usePrompt</Link>
        <Link to="/meta" activeClassName="active">useMeta</Link>
      </section>
    </nav>
  );
}
