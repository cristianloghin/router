import React, { useState } from "react";
import {
  Link,
  notFound,
  useNavigation,
  useParams,
  usePrompt,
  useQueryState,
  useRoute,
  useSearchParams,
  useMeta,
  useLocation,
  useWorkspaceActions,
  navigate as imperativeNavigate,
  type RouteComponentProps,
} from "@mikrostack/router";

// ─── Home ─────────────────────────────────────────────────────────────────────

export function Home() {
  return (
    <div className="card">
      <h2>Playground home</h2>
      <p>
        This app consumes the library straight from <code>src/</code> — edits to library code
        hot-reload here. Use the sidebar to exercise each feature, and the workspace panel to open
        workspaces.
      </p>
      <div className="row">
        <button onClick={() => imperativeNavigate("/users/:id", { params: { id: "42" } })}>
          Imperative typed <code>navigate("/users/:id", …)</code>
        </button>
        <button onClick={() => imperativeNavigate("/users/7")}>
          Untyped overload <code>navigate("/users/7")</code>
        </button>
      </div>
    </div>
  );
}

// ─── Dynamic params + notFound() ──────────────────────────────────────────────

const KNOWN_USERS: Record<string, string> = {
  "7": "Ada Lovelace",
  "42": "Grace Hopper",
};

export function UserDetail() {
  // Typed via Register: useParams("/users/:id") → { id: string }
  const { id } = useParams("/users/:id");
  const name = KNOWN_USERS[id];
  if (!name) notFound(); // any other id → RouterView fallback

  return (
    <div className="card">
      <h2>User detail</h2>
      <p>
        <code>useParams("/users/:id").id</code> = <code>{id}</code> → {name}
      </p>
      <div className="row">
        <Link to="/users/:id" params={{ id: "7" }}>User 7</Link>
        <Link to="/users/:id" params={{ id: "42" }}>User 42</Link>
        <Link to="/users/:id" params={{ id: "999" }}>User 999 (throws notFound)</Link>
      </div>
    </div>
  );
}

// ─── Nested routes ────────────────────────────────────────────────────────────

export function SettingsLayout({ outlet }: RouteComponentProps<{}>) {
  return (
    <div className="card">
      <h2>Settings (parent layout)</h2>
      <p className="muted">
        This layout does not remount when switching children. Mounted at: {new Date().toLocaleTimeString()}
      </p>
      <div className="row">
        <Link to="/settings">Index</Link>
        <Link to="/settings/profile">Profile</Link>
        <Link to="/settings/security">Security</Link>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>{outlet}</div>
    </div>
  );
}

export function SettingsIndex() {
  return <p>Index child — rendered when <code>/settings</code> matches exactly.</p>;
}

export function ProfileSettings() {
  return <p>Profile settings child route.</p>;
}

export function SecuritySettings() {
  return <p>Security settings child route.</p>;
}

// ─── Wildcard ─────────────────────────────────────────────────────────────────

export function FileExplorer() {
  // Wildcard captures aren't covered by ExtractParams, so the typed hook
  // returns Record<string, never> — read the runtime value with a cast.
  const params = useParams("/files/*") as unknown as { "*": string };

  return (
    <div className="card">
      <h2>File explorer (wildcard)</h2>
      <p>
        <code>params["*"]</code> = <code>{params["*"] || "(empty)"}</code>
      </p>
      <div className="row">
        <button onClick={() => imperativeNavigate("/files/docs/readme.md")}>docs/readme.md</button>
        <button onClick={() => imperativeNavigate("/files/src/deep/nested/path.ts")}>
          src/deep/nested/path.ts
        </button>
      </div>
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

export function BrokenPage() {
  const [boom, setBoom] = useState(false);
  if (boom) throw new Error("Deliberate render error from the playground");

  return (
    <div className="card">
      <h2>Error boundary</h2>
      <p>Throwing here is caught by this route's boundary — the rest of the app survives.</p>
      <button className="danger" onClick={() => setBoom(true)}>
        Throw during render
      </button>
    </div>
  );
}

// ─── Guarded route ────────────────────────────────────────────────────────────

export function AdminPanel() {
  return (
    <div className="card">
      <h2>Admin panel</h2>
      <p>You only see this when logged in — the route guard redirected you otherwise.</p>
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="card">
      <h2>Access denied</h2>
      <p>
        The <code>/admin</code> guard returned <code>"/denied"</code>. Toggle{" "}
        <strong>Logged in</strong> in the top bar and try again.
      </p>
      <Link to="/admin">Retry /admin</Link>
    </div>
  );
}

// ─── Query state ──────────────────────────────────────────────────────────────

export function QueryPlayground() {
  const [filters, setFilters] = useQueryState({
    page: { type: "number", default: 1 },
    active: { type: "boolean", default: true },
    tags: { type: "string[]" },
  });
  const [searchParams] = useSearchParams();

  return (
    <div className="card">
      <h2>useQueryState / useSearchParams</h2>
      <pre>{JSON.stringify(filters, null, 2)}</pre>
      <div className="row">
        <button onClick={() => setFilters({ page: filters.page + 1 })}>page + 1</button>
        <button onClick={() => setFilters({ active: !filters.active })}>toggle active</button>
        <button onClick={() => setFilters({ tags: [...(filters.tags ?? []), `tag-${(filters.tags?.length ?? 0) + 1}`] })}>
          add tag
        </button>
        <button onClick={() => setFilters({ page: 1, active: true, tags: [] })}>reset</button>
      </div>
      <p className="muted">
        Raw query string: <code>?{searchParams.toString() || "(empty)"}</code>
      </p>
    </div>
  );
}

// ─── usePrompt ────────────────────────────────────────────────────────────────

export function DirtyForm() {
  const [value, setValue] = useState("");
  const isDirty = value.length > 0;

  usePrompt("You have unsaved changes. Leave?", isDirty);

  return (
    <div className="card">
      <h2>usePrompt</h2>
      <p>Type something, then try navigating away — you'll be asked to confirm.</p>
      <div className="row">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Unsaved draft…" />
        <button onClick={() => setValue("")}>Save (clear dirty state)</button>
      </div>
    </div>
  );
}

// ─── useMeta ──────────────────────────────────────────────────────────────────

export function MetaPage() {
  const [meta, setMeta] = useMeta<{ theme: string }>();
  return (
    <div className="card">
      <h2>useMeta</h2>
      <pre>{JSON.stringify(meta, null, 2)}</pre>
      <button onClick={() => setMeta({ theme: meta.theme === "dark" ? "light" : "dark" })}>
        Toggle theme meta
      </button>
    </div>
  );
}

// ─── Lazy route ───────────────────────────────────────────────────────────────

export const LazyPage = React.lazy(async () => {
  await new Promise((r) => setTimeout(r, 1200)); // make the loading fallback visible
  return import("./LazyLoadedPage");
});

// ─── Workspace origin ─────────────────────────────────────────────────────────
// This page plays the role of a "creation form": a page the user should NOT
// come back to after the workspace it launches is closed.

export function OriginLauncher() {
  const { open } = useWorkspaceActions();
  const [error, setError] = useState<string | null>(null);

  const launch = (origin?: string) => {
    open({
      template: "scratchpad",
      title: origin ? `Launched with origin ${origin}` : "Launched without origin",
      params: { launchedFrom: "/launcher" },
      ...(origin ? { origin } : {}),
    }).catch((err) => setError(String(err)));
  };

  return (
    <div className="card">
      <h2>Workspace origin</h2>
      <p>
        Pretend this page is a creation form. Open a workspace below, then close it (✕) or press{" "}
        <code>← back()</code>:
      </p>
      <ul>
        <li>
          <strong>Without origin</strong> — close/back returns <em>here</em> (<code>/launcher</code>)
        </li>
        <li>
          <strong>With origin "/about"</strong> — the history entry for this page is <em>replaced</em>{" "}
          with <code>/about</code> before the workspace URL is pushed, so close/back lands on{" "}
          <code>/about</code> and this page is skipped
        </li>
      </ul>
      <div className="row">
        <button onClick={() => launch()}>Open (no origin)</button>
        <button className="primary" onClick={() => launch("/about")}>
          Open with origin "/about"
        </button>
      </div>
      {error && <p className="muted">✗ {error}</p>}
    </div>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────

export function About() {
  const { back, buildPath } = useNavigation();
  const built = buildPath("/users/:id", { id: "42" });
  const route = useRoute("/about");
  return (
    <div className="card">
      <h2>About</h2>
      <p>
        <code>buildPath("/users/:id", {"{ id: \"42\" }"})</code> → <code>{built}</code>
      </p>
      <p>
        <code>useRoute("/about")</code> → matched: <code>{String(route.matched)}</code>, exact:{" "}
        <code>{String(route.exact)}</code>
      </p>
      <button onClick={back}>useNavigation().back()</button>
    </div>
  );
}

// ─── Fallback (no route matched) ──────────────────────────────────────────────

export function NotFoundPage() {
  const { path } = useLocation();
  return (
    <div className="card">
      <h2>404 — RouterView fallback</h2>
      <p>
        No route matched <code>{path}</code> (or a component threw <code>notFound()</code>).
      </p>
      <Link to="/">Go home</Link>
    </div>
  );
}
