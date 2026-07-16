# `@mikrostack/router`

A React library that unifies browser routing and **workspace** navigation — independent view sessions with their own auth rules, lifecycle, and communication channel — into one coherent API.

## Table of Contents

- [Why this library](#why-this-library)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Routing](#routing)
  - [defineRoutes](#defineroutes)
  - [AppProvider](#appprovider)
  - [RouterView](#routerview)
  - [Link](#link)
  - [Nested routes](#nested-routes)
  - [Dynamic params](#dynamic-params)
  - [Wildcard routes](#wildcard-routes)
  - [Lazy components](#lazy-components)
  - [Error boundaries](#error-boundaries)
  - [Route guards](#route-guards)
  - [notFound()](#notfound)
- [Router hooks](#router-hooks)
  - [useNavigation](#usenavigation)
  - [useLocation](#uselocation)
  - [useRoute](#useroute)
  - [useParams](#useparams)
  - [useSearchParams](#usesearchparams)
  - [useQueryState](#usequerystate)
  - [useMeta](#usemeta)
  - [usePrompt](#useprompt)
- [Imperative navigation](#imperative-navigation)
- [Workspaces](#workspaces)
  - [defineWorkspaces](#defineworkspaces)
  - [Auth rules](#auth-rules)
  - [Adapter types](#adapter-types)
  - [Container components](#container-components)
  - [useWorkspaces](#useworkspaces)
  - [useWorkspaceActions](#useworkspaceactions)
  - [useWorkspace](#useworkspace)
  - [useWorkspaceChannel](#useworkspacechannel)
  - [Channel messaging](#channel-messaging)
  - [Param schemas](#param-schemas)
- [Full TypeScript types](#full-typescript-types)
- [API reference](#api-reference)

---

## Why this library

Most React apps that grow beyond simple page navigation end up combining a router with some form of multi-panel view management — tabs, drawers, or full-page overlays. These two concerns are almost always implemented separately, which creates persistent structural problems:

- Two navigation systems that can silently diverge (browser URL vs. open panels)
- Callers responsible for calling `navigate()` after every workspace mutation
- No type safety between route/workspace keys and their param shapes
- No real history stack — back-navigation requires manual `setPrevious` refs
- Param serialization (arrays, numbers, booleans) repeated in every component
- Auth enforcement ad-hoc in each component, bypassed on direct URL access
- No isolation between workspaces — anything can call anything

`@mikrostack/router` treats routes and workspaces as two node types in a single navigation graph. Both are declared once, both write to the same URL, both participate in the same history stack. Navigation is owned by the library, not the caller.

---

## Installation

```sh
npm install @mikrostack/router
```

**Peer dependencies:**

```sh
npm install react react-dom @mikrostack/chbus
```

Requires `@mikrostack/chbus` `^0.3.1`.

---

## Quick start

```tsx
import React from "react";
import { AppProvider, RouterView, Workspaces, Link, defineRoutes, defineWorkspaces } from "@mikrostack/router";

const routes = defineRoutes({
  "/":        { component: Home },
  "/about":   { component: About },
  "/settings":{ component: Settings },
});

const workspaces = defineWorkspaces({
  cameraFeed: { component: CameraFeed },
});

function App() {
  return (
    <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <RouterView />
      <Workspaces />
    </AppProvider>
  );
}
```

---

## Routing

### `defineRoutes`

Declares the route map. Keys are path patterns — they become the URL structure and the TypeScript type source of truth for params.

```tsx
const routes = defineRoutes({
  "/":                 { component: Home },
  "/users/:id":        { component: UserDetail },
  "/settings":         { component: SettingsLayout, index: SettingsIndex },
  "/settings/profile": { component: ProfileSettings },
  "/files/*":          { component: FileExplorer },
});
```

Rules:
- All keys must start with `/`
- `:param` segments are extracted into typed props
- `*` wildcard matches everything after the prefix (always the last segment)
- Parent–child nesting is inferred automatically from path prefixes

### `AppProvider`

The single root provider. Must wrap your entire application.

```tsx
<AppProvider
  routes={routes}
  workspaces={workspaces}        // optional — omit to use the library as a plain router
  config={{
    adapter: "stack",            // workspace layout adapter
    defaultLoading: <Spinner />, // global loading fallback
    defaultError: ErrorPage,     // global error fallback
    auth: {
      isAuthenticated: () => authStore.isLoggedIn,
    },
    onNavigate: (event) => analytics.track(event),
    onBeforeNavigate: (event) => {
      if (needsConfirmation) event.cancel();
    },
  }}
  meta={{ theme: "dark" }}       // app-wide metadata (accessible via useMeta)
>
  {children}
</AppProvider>
```

**`AppConfig` options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `adapter` | `"auto" \| "stack" \| "swipe" \| "tabs"` | `"auto"` | Workspace layout adapter. `auto` picks `swipe` on coarse pointers, otherwise `stack` (never `tabs`). |
| `maxWorkspaces` | `number` | `10` | Maximum total open workspaces across all templates. |
| `persist` | `{ version: number }` | off | Persist workspace state in `localStorage` — open workspaces survive a full app restart (e.g. a PWA being closed and reopened). Bumping `version` invalidates old persisted state. Templates opt out per-type via `persistent: false`. |
| `defaultLoading` | `React.ComponentType \| React.ReactNode` | `null` | Fallback shown during route/lazy load suspense |
| `defaultError` | `React.ComponentType<RouteErrorProps>` | Built-in | Fallback shown when a route throws |
| `auth.isAuthenticated` | `() => boolean \| Promise<boolean>` | `() => false` | Used by `authenticated` workspace auth rules |
| `workspaceBasePath` | `string` | `"/workspace"` | URL prefix for workspace paths |
| `onNavigate` | `(event: NavigationEvent) => void` | — | Called after every navigation |
| `onBeforeNavigate` | `(event & { cancel }) => void` | — | Called before navigation; call `cancel()` to block navigation |

**`AppProvider` props (outside `config`):**

| Prop | Type | Default | Description |
|---|---|---|---|
| `bus` | `Bus` | auto-created | External `@mikrostack/chbus` bus for channel observability |

### `RouterView`

Renders the matched route chain at the current URL. Place it wherever you want page content to appear.

```tsx
<RouterView
  fallback={<NotFoundPage />}     // shown when no route matches (ReactNode or ComponentType)
  scrollRestoration="restore"     // "top" (default) | "restore"
/>
```

### `Link`

Type-safe navigation link. Supports all standard anchor attributes.

```tsx
<Link to="/users/42">View user</Link>
<Link to="/settings" replace>Settings</Link>
<Link to="/about" state={{ from: "home" }}>About</Link>

// External links — rendered as a plain <a>
<Link href="https://example.com">External</Link>
```

### Nested routes

Parent–child relationships are inferred from path prefixes. A parent route receives its matched child as the `outlet` prop.

```tsx
const routes = defineRoutes({
  "/settings":          { component: SettingsLayout, index: SettingsIndex },
  "/settings/profile":  { component: ProfileSettings },
  "/settings/security": { component: SecuritySettings },
});

function SettingsLayout({ outlet }: RouteComponentProps<{}>) {
  return (
    <div>
      <nav>
        <Link to="/settings/profile">Profile</Link>
        <Link to="/settings/security">Security</Link>
      </nav>
      {outlet}   {/* renders ProfileSettings or SecuritySettings */}
    </div>
  );
}
```

When `/settings` is matched exactly, the `index` component renders as the outlet. Parent layouts are **not remounted** when navigating between child routes.

To suppress automatic parent inference for a route:

```tsx
defineRoutes({
  "/settings":              { component: SettingsLayout },
  "/settings/standalone":   { component: Standalone, parent: null }, // no nesting
});
```

### Dynamic params

```tsx
defineRoutes({
  "/users/:id":          { component: UserDetail },
  "/posts/:slug/comments/:commentId": { component: CommentDetail },
});

function UserDetail({ params }: RouteComponentProps<{ id: string }>) {
  // params.id is typed as string
  return <div>User {params.id}</div>;
}
```

### Wildcard routes

```tsx
defineRoutes({
  "/files/*": { component: FileExplorer },
});

function FileExplorer({ params }: RouteComponentProps<{ "*": string }>) {
  const filePath = params["*"]; // e.g. "docs/readme.md"
  return <div>{filePath}</div>;
}
```

### Lazy components

Pass a `React.lazy()` component directly — `RouterView` wraps it in a `Suspense` boundary automatically.

```tsx
const UserDetail = React.lazy(() => import("./pages/UserDetail"));

defineRoutes({
  "/users/:id": {
    component: UserDetail,
    loading: <div>Loading…</div>,   // or: loading: LoadingSpinner
  },
});
```

The loading fallback resolution order: route `loading` → `AppProvider` `defaultLoading` → `null`.

### Error boundaries

Each route has an independent error boundary. An error in a child route does not affect the parent layout.

```tsx
defineRoutes({
  "/dashboard": {
    component: Dashboard,
    error: ({ error, reset }) => (
      <div>
        <p>Failed: {error.message}</p>
        <button onClick={reset}>Retry</button>
      </div>
    ),
  },
});
```

The error fallback resolution order: route `error` → `AppProvider` `defaultError` → built-in minimal display.

### Route guards

Return `false` to block navigation, a string to redirect, or `true` to allow.

```tsx
defineRoutes({
  "/admin": {
    component: AdminPanel,
    guard: async (params, context) => {
      const ok = await authService.checkAdmin();
      return ok ? true : "/login";
    },
  },
});
```

### `notFound()`

Throw `notFound()` from inside a route component to signal a 404. It throws a sentinel caught by the router's internal boundary, which renders the `RouterView` fallback.

```tsx
import { notFound } from "@mikrostack/router";

function UserDetail({ params }: RouteComponentProps<{ id: string }>) {
  const user = use(fetchUser(params.id));
  if (!user) notFound();
  return <div>{user.name}</div>;
}
```

---

## Router hooks

### `useNavigation`

```tsx
function MyComponent() {
  const { navigate, back, buildPath } = useNavigation();

  return (
    <>
      <button onClick={() => navigate("/settings")}>Settings</button>
      <button onClick={() => navigate("/users/:id", { params: { id: "42" } })}>User 42</button>
      <button onClick={() => navigate("/about", { replace: true })}>Replace</button>
      <button onClick={back}>Back</button>
    </>
  );
}
```

| Method | Signature | Description |
|---|---|---|
| `navigate` | `(to: string, options?) => void` | Push or replace the current URL |
| `back` | `() => void` | Go to the previous history entry |
| `buildPath` | `(pattern: string, params?) => string` | Interpolate a path pattern with params |

**`navigate` options:**

| Option | Type | Description |
|---|---|---|
| `replace` | `boolean` | Replace instead of push |
| `state` | `Record<string, unknown>` | Attach state to the history entry |
| `params` | `Record<string, string>` | Interpolate `:param` segments in `to` |

### `useLocation`

```tsx
function Header() {
  const { path, searchParams, inWorkspace, canGoBack, isTransitioning } = useLocation();

  return (
    <div>
      <span>Current path: {path}</span>
      {canGoBack && <button onClick={back}>Back</button>}
      {isTransitioning && <Spinner />}
    </div>
  );
}
```

| Property | Type | Description |
|---|---|---|
| `path` | `string` | Current pathname |
| `searchParams` | `URLSearchParams` | Current query string |
| `inWorkspace` | `boolean` | Whether current URL is a workspace URL |
| `canGoBack` | `boolean` | Whether `back()` would navigate |
| `isTransitioning` | `boolean` | Whether a navigation transition is in progress |

### `useRoute`

Returns match status for a specific route pattern relative to the current URL.

```tsx
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { matched, exact } = useRoute(to);
  return (
    <a href={to} aria-current={exact ? "page" : matched ? "true" : undefined}>
      {children}
    </a>
  );
}
```

| Property | Type | Description |
|---|---|---|
| `matched` | `boolean` | Current path is this route or a descendant |
| `exact` | `boolean` | Current path is exactly this route |
| `params` | `ExtractParams<TPath>` | Matched params (typed from the pattern) |

### `useParams`

Returns the current route's path params. Pass the route pattern to get typed params.

```tsx
function UserDetail() {
  const { id } = useParams("/users/:id");
  // id is typed as string
  return <div>User {id}</div>;
}
```

### `useSearchParams`

Returns the current `URLSearchParams` and a setter (tuple), re-rendering on changes.

```tsx
function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const setTab = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "results");
      return next;
    });
  };

  return <div>Results for: {query}</div>;
}
```

### `useQueryState`

Typed, serialized URL query state. Handles `string`, `number`, `boolean`, `string[]`, and `number[]`.

```tsx
function FilterPanel() {
  const [filters, setFilters] = useQueryState({
    page:   { type: "number",   default: 1 },
    active: { type: "boolean",  default: true },
    tags:   { type: "string[]" },
    limit:  { type: "number",   default: 20 },
  });

  // filters.page   → number
  // filters.active → boolean
  // filters.tags   → string[]

  return (
    <button onClick={() => setFilters({ page: filters.page + 1 })}>
      Next page
    </button>
  );
}
```

`setFilters` merges with the current state (partial update). Array values are serialized as repeated query params (`?tags=a&tags=b`).

### `useMeta`

Read and update app-wide metadata passed to `AppProvider` via the `meta` prop.

```tsx
// In AppProvider:
<AppProvider meta={{ title: "My App", theme: "dark" }} ...>

// In any component:
function ThemeToggle() {
  const [meta, setMeta] = useMeta<{ theme: string }>();
  return (
    <button onClick={() => setMeta({ theme: meta.theme === "dark" ? "light" : "dark" })}>
      Toggle theme
    </button>
  );
}
```

### `usePrompt`

Blocks navigation (and page unload) with a confirmation when a condition is true.

```tsx
function EditForm() {
  const [isDirty, setIsDirty] = useState(false);

  usePrompt("You have unsaved changes. Leave?", isDirty);

  return <form onChange={() => setIsDirty(true)}>...</form>;
}
```

---

## Imperative navigation

For use outside of React components (e.g. in event handlers, service layers, or Axios interceptors):

```tsx
import { navigate } from "@mikrostack/router";

// Navigates using the active AppProvider's router store
navigate("/login", { replace: true });
navigate("/users/:id", { params: { id: "42" } });
```

> `navigate` is a no-op until an `AppProvider` has mounted.

---

## Workspaces

Workspaces are persistent, URL-addressable view instances managed by a layout adapter. Unlike routes (one instance per path), multiple workspaces can be open simultaneously, each with its own URL, params, and auth state.

### `defineWorkspaces`

```tsx
const workspaces = defineWorkspaces({
  cameraFeed: {
    component: CameraFeedComponent,
    auth: { type: "authenticated" },
    maxInstances: 4,
    schema: {
      cameraId: "string",
      quality:  "number",
    },
  },

  publicReport: {
    component: ReportViewer,
    auth: { type: "public" },
  },

  timeLimitedPreview: {
    component: PreviewComponent,
    auth: { type: "time-limited", expiresAt: () => sessionExpiresAt },
  },
});
```

**Template options:**

| Option | Type | Description |
|---|---|---|
| `component` | `React.ComponentType<WorkspaceComponentProps>` | The component rendered for this workspace |
| `auth` | `WorkspaceAuthRule` | Access control rule (default: `{ type: "public" }`) |
| `maxInstances` | `number` | Maximum number of simultaneously open instances |
| `schema` | `Record<string, ParamType>` | Single source of truth for params: drives URL serialization **and** the TypeScript param types |
| `persistent` | `boolean` (default `true`) | Whether instances survive an app restart when `config.persist` is enabled. Set `false` for ephemeral templates (a scratchpad); leave on for durable ones (a report). |
| `defaultTitle` | `string \| ((params) => string)` | Default title if none provided to `open()` |

**The schema is schema-first:** `workspace.params` in the component, and the `params` arguments to `open()`/`updateParams()`, are *inferred* from `schema` — declare the shape once, no separate params type and no casts. `cameraFeed` above gives `params: { cameraId: string; quality: number }` everywhere. Templates without a schema get loosely typed string params.

**Params are identity.** `open()` dedupes by default: a live workspace with the same template and deep-equal params is focused instead of duplicated (see [`useWorkspaceActions`](#useworkspaceactions)). Design your `schema` so params identify *which* workspace this is — never put view-state (zoom level, scroll position, selected tab) in params, or two logically-identical workspaces will silently count as different ones.

### Auth rules

Auth is evaluated before `open()` proceeds and when a workspace URL is accessed directly (e.g. in a new tab). Failed auth rejects the `open()` promise with a `WorkspaceError`.

```tsx
// Public — no auth required
{ type: "public" }

// Requires AppProvider auth.isAuthenticated() to return true
{ type: "authenticated" }

// Time-limited — fails after expiresAt
{ type: "time-limited", expiresAt: 1735689600000 }       // Unix timestamp
{ type: "time-limited", expiresAt: () => session.expiry } // dynamic

// Credential — calls validate() with { username, password }
{
  type: "credential",
  validate: async ({ username, password }) => {
    return await authService.check(username, password);
  },
}

// Custom — full control
{
  type: "custom",
  check: async (context) => {
    // context.workspaceId, context.template, context.params, context.isDirectAccess
    return permissions.canAccess(context.template);
  },
}
```

### Adapter types

The adapter controls how workspaces are laid out. Specify via `AppProvider` `config.adapter`:

| Adapter | Value | Behaviour |
|---|---|---|
| Stack | `"stack"` | Workspaces stack on top of each other; only the focused one is visible |
| Swipe | `"swipe"` | Workspaces arranged side-by-side, swiped between on touch devices |
| Browser tabs | `"tabs"` | Each workspace opens in a new browser tab (`window.open`) |
| Auto | `"auto"` | Detects touch devices → `swipe`; otherwise → `stack` |

### Container components

Each adapter has a corresponding container component that renders the open workspaces. The easiest way to use them is `<Workspaces>`, which picks the container matching the active adapter automatically:

```tsx
import { Workspaces } from "@mikrostack/router";

<Workspaces
  renderWorkspace={(workspace, content) => (
    <MyWorkspaceFrame title={workspace.title}>{content}</MyWorkspaceFrame>
  )}
>
  <Dashboard /> {/* the root page */}
</Workspaces>
```

The per-adapter containers are internal — `<Workspaces>` always renders the one matching `config.adapter`, so there is no wrong choice to make.

**Containers are headless.** They inject no buttons or UI copy — wrap each workspace's content in your own chrome with the `renderWorkspace` prop (`(workspace, content) => ReactNode`, default: renders `content` bare) and drive focus/close from your chrome via `useWorkspaceActions()`.

**`children` as the root page.** Under the swipe adapter, `children` becomes page 0 of the swipe track — the deck starts at your dashboard. Under the stack adapter, `children` renders whenever no workspace URL is focused. Under tabs, `children` renders in the launching tab alongside a strip of open workspaces — a workspace's content renders **only** in its own browser tab, never inline in the launching app, and the launching tab's URL never changes.

**Scroll→URL sync (swipe adapter, on by default).** When a swipe settles on a workspace page, the adapter index updates (without emitting `workspace:focused`) and the URL is *replaced* with that workspace's URL; settling on the root page replaces the URL with the current route path. Swiping never pushes history entries, fires navigation events, or triggers `usePrompt`. Programmatic `focus()` smooth-scrolls the deck to the workspace's page, and orientation changes re-snap to the settled page.

**`useWorkspaceContainer()`.** Returns the active container's scroll element (or `null`), so app code can drive the deck imperatively — e.g. scroll home from a workspace-selector overlay:

```tsx
const deck = useWorkspaceContainer();
deck?.scrollTo({ left: 0, behavior: "smooth" });
```

### `useWorkspaces`

Subscribing workspace state. Returns the snapshot `{ workspaces, current, adapterType }` and re-renders on every workspace event. Actions live on [`useWorkspaceActions`](#useworkspaceactions).

```tsx
function WorkspaceList() {
  const { workspaces, current } = useWorkspaces();
  const { focus, close } = useWorkspaceActions();

  return (
    <div>
      {workspaces.map((ws) => (
        <div key={ws.id} data-active={ws.id === current?.id}>
          <span>{ws.title}</span>
          <button onClick={() => focus(ws.id)}>Focus</button>
          <button onClick={() => close(ws.id)}>Close</button>
        </div>
      ))}
    </div>
  );
}
```

**State:**

| Property | Type | Description |
|---|---|---|
| `workspaces` | `WorkspaceDescriptor[]` | All currently open workspaces |
| `current` | `WorkspaceDescriptor \| null` | The currently focused workspace |
| `adapterType` | `"stack" \| "swipe" \| "tabs"` | The active adapter type (constant; rides in the snapshot for convenience) |

With registered workspaces (see [Full TypeScript types](#full-typescript-types)), `workspaces` is a discriminated union over your templates — comparing `template` narrows `params`, including through `.filter()`:

```tsx
const walls = workspaces.filter((w) => w.template === "wall");
// walls[i].params is typed per the "wall" schema — no casts
```

**Selector form** — `useWorkspaces(selector, isEqual?)` returns only the selected slice and skips re-renders while `isEqual` (default `Object.is`) considers it unchanged:

```tsx
const count = useWorkspaces((s) => s.workspaces.length); // re-renders only when the count changes
```

> **Footgun:** a selector that returns a fresh array/object each call (e.g. `s => s.workspaces.filter(...)`) never compares equal under the default `Object.is`, so it skips nothing. Pass the exported `shallowEqual` when deriving collections:
>
> ```tsx
> import { shallowEqual } from "@mikrostack/router";
>
> const wallIds = useWorkspaces(
>   (s) => s.workspaces.filter((w) => w.template === "wall").map((w) => w.id),
>   shallowEqual,
> );
> ```

### `useWorkspaceActions`

Non-subscribing workspace actions — never causes a re-render, and the returned object is referentially stable (safe in effect deps). Use it in components that only *do* things (toolbars, launch buttons) so they don't re-render on every workspace event.

```tsx
function OpenCameraButton() {
  const { open } = useWorkspaceActions(); // this component never re-renders on workspace events

  const handleOpen = async () => {
    try {
      const descriptor = await open({
        template: "cameraFeed",
        title: "Camera 1",
        params: { cameraId: "cam-001", quality: 1080 },
      });
      console.log("Opened:", descriptor.id);
    } catch (err) {
      if (err instanceof WorkspaceError) {
        console.error(err.code); // "AUTH_FAILED" | "MAX_INSTANCES_REACHED" | ...
      }
    }
  };

  return <button onClick={handleOpen}>Open Camera</button>;
}
```

`open()` has focus-or-open semantics — the semantics of browser named windows and editor tabs. Calling it twice with the same template and params focuses the existing workspace and resolves with its descriptor instead of opening a duplicate, so callers never need to hand-roll find → focus-else-open.

**Methods:**

| Method | Signature | Description |
|---|---|---|
| `open` | `(input) => Promise<WorkspaceDescriptor>` | Focus-or-open: if a live workspace has the same template and deep-equal params (arrays order-sensitive), it is focused and returned — the rest of the input is ignored on match. Otherwise opens a new instance; rejects with `WorkspaceError` on auth failure or limit exceeded. `input.origin` (optional route path) installs a different background route first, replacing the current history entry — use it when the launching page (e.g. a creation form) should not be returned to by close, swipe-to-root, or the browser back button. |
| `focus` | `(id: string) => Promise<WorkspaceDescriptor>` | Focus an open workspace. |
| `close` | `(id: string, autoFocus?: boolean) => Promise<void>` | Close a workspace. Navigates back to the origin route. |
| `updateParams` | `(id, params) => WorkspaceDescriptor` | Update workspace params (partial merge). Replaces the URL only when the workspace is the focused one. |
| `updateTitle` | `(id, title) => WorkspaceDescriptor` | Update the workspace title. |
| `getAll` | `() => WorkspaceDescriptor[]` | Non-reactive read of all open workspaces — for handler-time reads, not rendering. |
| `getCurrent` | `() => WorkspaceDescriptor \| null` | Non-reactive read of the focused workspace — for handler-time reads, not rendering. |

### `useWorkspace`

Returns reactive state for a single workspace by ID.

```tsx
function WorkspacePanel({ id }: { id: string }) {
  const result = useWorkspace(id);
  if (!result) return null;

  const { workspace, params } = result;
  return <div>{workspace.title}</div>;
}
```

Returns `null` when the workspace is not open. Channels are not exposed here — the workspace side receives its channel via component props, the root side uses `useWorkspaceChannel(id)`.

### `useWorkspaceChannel`

Returns the root side of the communication channel for a workspace.

```tsx
function RootController({ wsId }: { wsId: string }) {
  const channel = useWorkspaceChannel(wsId);

  useEffect(() => {
    if (!channel) return;

    // Listen for messages from the workspace
    return channel.inbound.on("status-update", (payload) => {
      console.log("Workspace says:", payload);
    });
  }, [channel]);

  const sendCommand = () => {
    channel?.outbound.emit("take-snapshot", { quality: "high" });
  };

  return <button onClick={sendCommand}>Take Snapshot</button>;
}
```

Returns `null` when the workspace is not open.

### Channel messaging

Each open workspace gets a pair of bidirectional channels:

- **Root side** (`useWorkspaceChannel`): `outbound` sends to workspace, `inbound` receives from workspace
- **Workspace side** (`WorkspaceComponentProps.channel`): `outbound` sends to root, `inbound` receives from root

```tsx
// Workspace component
function CameraFeed({ workspace, channel }: WorkspaceComponentProps) {
  useEffect(() => {
    // Receive commands from root
    return channel.inbound.on("take-snapshot", async (payload) => {
      const snapshot = await captureFrame();
      // Send result back to root
      channel.outbound.emit("snapshot-ready", { url: snapshot.url });
    });
  }, [channel]);

  return <video ref={videoRef} />;
}

// Root side
function App() {
  const { workspaces } = useWorkspaces();
  const wsId = workspaces[0]?.id ?? "";
  const channel = useWorkspaceChannel(wsId);

  const takeSnapshot = () => {
    channel?.outbound.emit("take-snapshot", { quality: "high" });
  };

  useEffect(() => {
    if (!channel) return;
    return channel.inbound.on("snapshot-ready", ({ url }) => {
      console.log("Got snapshot:", url);
    });
  }, [channel]);

  return <button onClick={takeSnapshot}>Snapshot</button>;
}
```

Channels are isolated per workspace instance — messages sent to workspace A cannot be received by workspace B.

For the `tabs` adapter, channels are bridged via `BroadcastChannel`. An external `@mikrostack/chbus` bus can be passed to `AppProvider` via the `bus` prop for observability and debugging.

### Param schemas

Declare a `schema` on the workspace template to enable typed URL serialization. Without a schema, all params are serialized as strings.

```tsx
const workspaces = defineWorkspaces({
  dashboard: {
    component: Dashboard,
    schema: {
      startDate: "string",
      endDate:   "string",
      metrics:   "string[]",   // serialized as repeated params: ?metrics=a&metrics=b
      limit:     "number",
      showGrid:  "boolean",
    },
  },
});

// open() with typed params
await open({
  template: "dashboard",
  title: "Q1 Report",
  params: {
    startDate: "2025-01-01",
    endDate:   "2025-03-31",
    metrics:   ["revenue", "dau"],
    limit:     100,
    showGrid:  true,
  },
});
```

Supported param types: `"string"`, `"number"`, `"boolean"`, `"string[]"`, `"number[]"`.

---

## Full TypeScript types

Register your maps once and every hook is fully typed — route keys, route params, workspace template keys, and workspace params, with no explicit generics at call sites:

```tsx
const routes = defineRoutes({ ... });
const workspaces = defineWorkspaces({
  camera: {
    component: CameraComponent,
    schema: { cameraId: "string" },
  },
  report: {
    component: ReportComponent,
    schema: { reportId: "string", format: "string" },
  },
});

declare module "@mikrostack/router" {
  interface Register {
    routes: typeof routes;
    workspaces: typeof workspaces;
  }
}

// In any component — no generics needed:
const { navigate } = useNavigation();
navigate("/camera/:id", { params: { id: "cam-4" } }); // keys + params checked
const { open } = useWorkspaceActions();

// Fully typed — template keys and params are checked at compile time
await open({ template: "camera", title: "Cam 1", params: { cameraId: "c1" } });
await open({ template: "report", title: "Report", params: { reportId: "r1", format: "pdf" } });

// Compile error — "unknown" is not a registered template
await open({ template: "unknown", title: "T", params: {} });
```

Without registration, keys are plain strings (no checking). An explicit generic (`useWorkspaceActions<typeof workspaces>()`) also works for one-off typing.

---

## API reference

### Exports

```ts
// Setup
defineRoutes(map)
defineWorkspaces(map)
AppProvider

// Components
RouterView
Link
Workspaces              // renders the container for the active adapter

// Router hooks
useNavigation()       → { navigate, back, buildPath }
useLocation()         → { path, searchParams, inWorkspace, canGoBack, isTransitioning }
useRoute(pattern)     → { matched, exact, params }
useParams(pattern)    → ExtractParams<pattern>
useSearchParams()     → [URLSearchParams, setSearchParams]
useQueryState(schema) → [state, setState]
useMeta()             → [meta, setMeta]
usePrompt(msg, when)

// Workspace hooks
useWorkspaces()          → { workspaces, current, adapterType }   // subscribing; useWorkspaces(selector, isEqual?) selects a slice
useWorkspaceActions()    → { open, focus, close, updateParams, updateTitle, getAll, getCurrent }   // non-subscribing
useWorkspace(id)         → { workspace, params } | null
useWorkspaceChannel(id)  → { inbound, outbound } | null
useWorkspaceContainer()  → HTMLElement | null   // the active container's scroll element

// Typing (optional, zero-runtime)
Register                 // declare module augmentation with { routes, workspaces }

// Imperative
navigate(to, options?)

// Utilities
notFound()
shallowEqual(a, b)      // one-level equality — pass as isEqual for collection selectors

// Types
WorkspaceError          // extends Error, has .code and .workspaceId
WorkspaceComponentProps // { workspace, channel }
WorkspaceDescriptor     // { id, template, title, params, createdAt, auth }
RouteComponentProps     // { params, outlet }
RouteErrorProps         // { error, reset, path }
```

### `WorkspaceError` codes

| Code | When thrown |
|---|---|
| `AUTH_FAILED` | Auth rule evaluated to false |
| `MAX_INSTANCES_REACHED` | `maxInstances` limit exceeded |
| `MAX_WORKSPACES_REACHED` | Global workspace count limit exceeded |
| `WORKSPACE_NOT_FOUND` | Operation on an ID that is not open |
| `ADAPTER_ERROR` | Unknown template key or adapter-level failure |

### `WorkspaceDescriptor`

```ts
interface WorkspaceDescriptor<TParams = WorkspaceParams> {
  readonly id: string;           // UUID v4
  readonly template: string;     // Template key from defineWorkspaces
  title: string;                 // Display title
  params: TParams;               // Current params
  readonly createdAt: number;    // Unix timestamp (ms)
  readonly auth: {
    type: string;                // Auth rule type
    granted: boolean;            // Always true for open workspaces
  };
}
```
