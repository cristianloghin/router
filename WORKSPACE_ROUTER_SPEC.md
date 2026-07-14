# `@mikrostack/router` — Library Specification

> **Purpose of this document:** A complete implementation spec for Claude Code. Every section is a constraint or decision, not a suggestion. Where something is intentionally left to the implementer, it is marked `[IMPL]`.

> **Implementation status (audited and completed 2026-07-13 against `src/`):** each section heading below is marked
> **✅ DONE** (verified in code) · **⚠️ PARTIAL** (gap noted under the heading) · **❌ NOT IMPLEMENTED**.
> Unmarked sections are narrative/reference and have nothing to verify.

---

## 0. Motivation and benefits

### The problem

Most React applications that grow beyond simple page navigation end up cobbling together a router (React Router, TanStack Router, a custom one) with some form of multi-panel or multi-instance view management — tabs, drawers, floating windows, or full-page overlays. These two concerns are almost always implemented separately, which creates a class of structural problems that no amount of careful local engineering fully resolves.

The specific pain points this library is designed to eliminate:

**Two navigation systems in the same app.** The router owns the URL. The workspace system owns which panels are open. They are only loosely coupled — typically via manual calls to `navigate()` after workspace mutations. This means the browser URL and the application state can silently diverge. Bugs of the form "navigated back but the workspace is still open" or "refreshed and ended up in the wrong place" are direct consequences of this split ownership.

**Navigation as caller responsibility.** In the prior art this library replaces, opening a workspace returns a URL, and the caller is responsible for calling `navigate()` with it. This is error-prone: every call site must remember the two-step pattern, must branch on adapter type (`if (adapter.type !== "tabs")`), and must manually store and restore the origin route for back-navigation. These are implementation details of the navigation system leaking into application code.

**No type contract between route/workspace keys and their param shapes.** Route paths are strings. Workspace template keys are strings. Params are `Record<string, unknown>` cast at the call site. The compiler cannot catch a mistyped route name in a `<Link>`, a wrong param key in `open()`, or a missing required param when updating a workspace. Errors surface at runtime, often in production.

**Ad-hoc back-navigation.** Without a real history stack, "go back" requires manually storing the origin path in a ref (`setPrevious`) at the moment of navigation. A single-slot ref is wrong by construction for any navigation pattern involving more than one level of history, and the stored value goes stale whenever the user navigates differently than the developer anticipated.

**Param serialization left to consumers.** Workspace params that contain arrays or typed values require each workspace component to implement its own serialization to and from `URLSearchParams`. This is repeated, inconsistent, and untested across components.

**Workspace auth as an afterthought.** Access control rules for workspace templates — which can be publicly shared, time-limited, or credential-protected — have no first-class representation. They are either enforced ad-hoc in the component or not enforced at all for direct URL access.

**No formal communication contract between workspaces and root.** Workspaces communicate back to the root application by importing and calling hooks from the workspace system directly. There is no boundary, no type contract, and no isolation — anything can call anything. This makes it impossible to reason about what a workspace's effect on the outside world will be.

---

### What this library does differently

The central insight is that app routes and workspaces are the same kind of thing — a mapping from a URL to rendered content — and should be modelled as such. The library treats them as two node types in a single navigation graph. Routes are ephemeral, matched by path pattern, rendered in place. Workspaces are persistent, identified by UUID, managed by a layout adapter. Both are declared in the same config object passed to a single provider. Both write to the same URL. Both participate in the same history stack.

From that unified model, everything else follows:

**Navigation is owned by the library, not the caller.** `open()`, `focus()`, `close()`, and `updateParams()` all navigate internally. A caller that opens a workspace does not need to know what URL was produced, does not need to store the origin path, and does not need to branch on adapter type. The three-line two-step pattern becomes one `await`.

**Full TypeScript end-to-end.** Route keys, path param shapes, workspace template keys, and workspace param shapes are all linked at the type level. `<Link to="doesNotExist">` is a compile error. `open({ template: "unknownTemplate", ... })` is a compile error. `useParams("/camera/:id")` returns `{ id: string }`, not `Record<string, string>`. The compiler catches mistakes that previously only surfaced at runtime.

**A real history stack.** The origin route is stored in `window.history.state` when a workspace URL is pushed. When a workspace closes, the library reads it back. Back-navigation is correct regardless of which route the user was on when they opened the workspace, regardless of how many workspaces they've opened since, and without any manual `setPrevious` call.

**Transparent param serialization.** Arrays and typed values are serialized to and from `URLSearchParams` automatically, using a schema declared on the workspace template. No `join`/`split`, no `parseInt`, no manual codec in each workspace component.

**Auth as a first-class declaration.** Each workspace template declares an auth rule (`public`, `authenticated`, `time-limited`, `credential`, `custom`). The library evaluates it before `open()` proceeds, and re-evaluates it when a workspace URL is accessed directly (e.g. in a new browser tab). Components never see unauthenticated state — auth failure is caught at the navigation layer.

**A typed communication channel per workspace.** Instead of workspaces reaching into the global workspace store to communicate with root, each open workspace gets an isolated bidirectional channel. The channel types are declared by the consuming application, so the compiler enforces what messages each side can send. The transport is an implementation detail — in-process for stack/swipe adapters, `BroadcastChannel` for browser tabs.

---

### Benefits over the alternatives

| Approach | Problems |
|---|---|
| React Router alone | No concept of multi-instance views, persistent descriptors, or layout adapters. Adding workspaces on top means building all of this yourself, plus the coupling problems above. |
| TanStack Router alone | Excellent type safety for routes; still no workspace model. The same coupling problems appear when you add multi-panel management alongside it. |
| Separate router + custom workspace system (current) | The status quo. All problems described above apply. |
| A generic UI framework (window manager, tab system) | Solves layout but not routing, auth, history, or typed params. The integration with a router still falls on the app developer. |

The library is not trying to replace React Router in the general case. It is solving a specific, common problem in applications that have both conventional navigation and a need for persistent, multi-instance, URL-addressable views — and solving it in a way that a general-purpose router cannot, because the workspace model (descriptors, auth rules, channels, layout adapters) is not part of any router's abstraction.

---

## 0.1 Summary

A single React library that unifies browser routing and "workspace" navigation — independent view sessions with their own auth rules, lifecycle, and communication channel — into one coherent API. The library has no VMS-specific assumptions and can be adopted by any React app.

**Core thesis:** App routes and workspaces are both answers to the question *"what do I render for this URL?"* They differ in cardinality (one route instance vs. many workspace instances), persistence (ephemeral vs. managed descriptors), and layout (renders in place vs. managed by an adapter). The library models this as a single navigation graph with two node types: **routes** and **workspaces**.

---

## 1. Package structure — ⚠️ PARTIAL (file layout only)

> **Status:** all behavior exists; only the file layout differs from this tree: transition logic lives in `components/RouterView.tsx` (no separate `router/transitions.ts`), there is no `utils/url.ts`, the router store lives in `router/RouterContext.ts` with extra `router/context.ts` / `router/registryContext.ts` context modules, and `workspaces/auth/` additionally contains `AuthGate.tsx` and `credentialRequests.ts`.

```
src/
├── index.ts                  # Public API barrel
├── provider/
│   ├── AppProvider.tsx        # Single root provider
│   └── context.ts
├── router/
│   ├── types.ts
│   ├── RouteRegistry.ts       # Validates route config, builds parent graph at init
│   ├── matcher.ts             # matchPath(), buildPath(), specificity sort
│   ├── history.ts             # Session history stack wrapper
│   ├── transitions.ts         # startTransition wrapper, isTransitioning state
│   ├── boundaries.tsx         # Per-route Suspense + ErrorBoundary components
│   └── hooks.ts               # useNavigation, useLocation, useRoute, useParams,
│                              # useSearchParams, useQueryState, useMeta, usePrompt
├── workspaces/
│   ├── types.ts
│   ├── WorkspaceManager.ts
│   ├── adapters/
│   │   ├── StackAdapter.ts
│   │   ├── SwipeAdapter.ts
│   │   └── BrowserTabAdapter.ts
│   ├── auth/
│   │   └── WorkspaceGuard.ts
│   ├── channel/
│   │   └── WorkspaceChannel.ts
│   └── hooks.ts               # useWorkspaces, useWorkspace, useWorkspaceChannel
├── components/
│   ├── RouterView.tsx         # Renders matched route chain with boundaries + transitions
│   ├── Link.tsx
│   ├── containers/
│   │   ├── StackContainer.tsx
│   │   ├── SwipeContainer.tsx
│   │   └── TabsContainer.tsx
└── utils/
    ├── params.ts              # Shared serialization: workspace params + useQueryState
    ├── notFound.ts            # notFound() sentinel throw
    └── url.ts
```

---

## 2. Core type system

### 2.1 Route definition — ✅ DONE

> **Status:** types, `defineRoutes` validation, `ExtractParams`, parent inference (segment boundary, longest prefix, `parent: null`), inside-out outlet rendering, `guard` evaluation (false blocks, string redirects, async supported, throwing/rejecting blocks), the full `loading`/`error` fallback chain (route → AppConfig → library default; the RouterView-prop variant was removed in the v0.2 API simplification), and dev-only cycle detection are all implemented. Note: duplicate route keys cannot be detected at runtime — later keys in an object literal silently overwrite earlier ones before `defineRoutes` sees them.

Routes are declared via `defineRoutes`. The **key is the path** — no separate `path` field. `ExtractParams` runs directly on the key string. The result is a flat map regardless of nesting depth, which keeps the type system simple and all addressing uniform.

```typescript
interface RouteDefinition<TPath extends string> {
  /**
   * The component to render when this route is matched.
   * Accepts a regular component or a React.lazy() wrapped component.
   * When lazy, RouterView automatically provides a Suspense boundary.
   */
  component: React.ComponentType<RouteComponentProps<ExtractParams<TPath>>>
           | React.LazyExoticComponent<React.ComponentType<RouteComponentProps<ExtractParams<TPath>>>>;
  /**
   * Component rendered as outlet when this route is matched exactly
   * and no child route is also matched. Accepts lazy components.
   */
  index?: React.ComponentType | React.LazyExoticComponent<React.ComponentType>;
  /**
   * Suspense fallback shown while this route's component is loading (lazy) or
   * while any React.use() / async data inside it suspends.
   * Accepts a component or inline JSX.
   * Falls back to AppConfig.defaultLoading, then null.
   */
  loading?: React.ComponentType | React.ReactNode;
  /**
   * Error boundary fallback shown if this route's component throws.
   * Receives the error and a reset function.
   * Falls back to AppConfig.defaultError, then a minimal library-provided display.
   * Each route's boundary is independent — an error in a child does not
   * activate the parent's error UI.
   */
  error?: React.ComponentType<RouteErrorProps>;
  /**
   * Called before the route renders. Return false (or a rejected promise) to
   * block navigation. Returning a string redirects to that path.
   */
  guard?: (
    params: ExtractParams<TPath>,
    context: NavigationContext
  ) => boolean | string | Promise<boolean | string>;
  /**
   * Explicitly opt out of automatic parent inference.
   * By default, the router infers a parent relationship when a declared route
   * is a prefix of this route's path. Set to null to suppress that.
   */
  parent?: null;
}

interface RouteComponentProps<TParams extends Record<string, string>> {
  params: TParams;
  /**
   * The matched child route's rendered output, or null if no child matched.
   * During a child's Suspense, this receives the child's loading fallback —
   * not stale content. All route components receive this; leaf routes get null.
   */
  outlet: React.ReactNode;
}

interface RouteErrorProps {
  /** The thrown error. */
  error: Error;
  /**
   * Clears the error boundary and re-renders the route component.
   * Use for retry buttons on transient errors.
   */
  reset: () => void;
  /** The path key of the route that errored. */
  path: string;
}

// Extracts :param segments from a path string key into a typed Record.
type ExtractParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<`/${Rest}`>]: string }
    : T extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Record<string, never>;

// The route map: path string → route definition, inferred by defineRoutes.
type RouteMap = { [TPath extends string]: RouteDefinition<TPath> };
```

The app declares its routes:

```typescript
const routes = defineRoutes({
  "/":                  { component: DashboardRoute },
  "/settings":          {
    component: lazy(() => import("./SettingsLayout")),
    index:     lazy(() => import("./SettingsIndex")),
    loading:   <SettingsSkeleton />,
    error:     SettingsError,
  },
  "/settings/profile":  {
    component: lazy(() => import("./ProfileSettings")),
    loading:   ProfileSkeleton,      // component form also valid
  },
  "/settings/security": { component: SecuritySettings },
  "/camera/:id":        {
    component: CameraDetailRoute,
    error:     CameraError,
  },
  "/stream/:id":        { component: StreamRoute },
  "/*":                 { component: NotFoundRoute },  // wildcard catch-all
});
```

**Key rules:**
- Keys must be absolute paths starting with `/`.
- The key is used verbatim as the URL pattern for matching and for `<Link to>` and `navigate()`.
- `defineRoutes` infers the full `RouteMap` type and validates that all keys are valid path strings.
- No `path` field — it would be redundant.

**Nested route inference (automatic):**
The router infers parent-child relationships at init time by prefix matching: for every route whose key is a strict path prefix of another route's key, the shorter route is treated as the parent. For example, `/settings` is automatically the parent of `/settings/profile` and `/settings/security`.

Rules:
- A parent must be an exact segment boundary — `/set` is **not** a parent of `/settings`. The prefix must end where a `/` begins on the child.
- If multiple routes could be parents (e.g. `/a` and `/a/b` are both prefixes of `/a/b/c`), the longest prefix wins — `/a/b` is the direct parent of `/a/b/c`.
- `parent: null` on a route definition suppresses inference entirely for that route, rendering it as a top-level route regardless of prefix matches.
- Circular parent relationships are a runtime error in development, silent no-op in production.

**Rendering model:**
When a URL matches a chain of parent + child routes, `RouterView` renders them inside-out: the innermost (most specific) route renders first, and its output is passed as `outlet` to the next level up, all the way to the outermost matched route. The outermost route renders at the top level inside `RouterView`.

Example: URL `/settings/profile` matches `["/settings", "/settings/profile"]`. `ProfileSettings` renders with `outlet: null`. Its output is passed as `outlet` to `SettingsLayout`. `SettingsLayout` renders at the top level.

URL `/settings` with an `index` component: `SettingsIndex` renders as the `outlet` of `SettingsLayout`.

### 2.2 Workspace template definition — ✅ DONE

Workspace templates are declared with an explicit params type. The template key becomes the type discriminant.

```typescript
interface WorkspaceTemplate<TParams extends WorkspaceParams = WorkspaceParams> {
  component: React.ComponentType<WorkspaceComponentProps<TParams>>;
  /** Default title when none is provided at open() time. [IMPL] can be a function of params. */
  defaultTitle?: string | ((params: TParams) => string);
  /** Auth rule for this template. See §6. */
  auth?: WorkspaceAuthRule;
  /** Maximum concurrent instances of this template. Default: unlimited. */
  maxInstances?: number;
}

interface WorkspaceComponentProps<TParams extends WorkspaceParams> {
  workspace: WorkspaceDescriptor<TParams>;
  /** The per-workspace communication channel (see §7). */
  channel: WorkspaceChannel<TParams>;
}

// The templates map threads TParams through template key → params shape
type WorkspaceTemplateMap = Record<string, WorkspaceTemplate<any>>;
```

The app declares its workspace templates:

```typescript
const workspaces = {
  stream: {
    component: StreamWorkspace,
    auth: { type: "public" },
  } satisfies WorkspaceTemplate<StreamParams>,

  wall: {
    component: WallWorkspace,
    auth: { type: "authenticated" },
    maxInstances: 4,
  } satisfies WorkspaceTemplate<WallParams>,
} satisfies WorkspaceTemplateMap;
```

### 2.3 WorkspaceDescriptor — ✅ DONE

```typescript
interface WorkspaceDescriptor<TParams extends WorkspaceParams = WorkspaceParams> {
  readonly id: string;           // UUID, stable for the lifetime of the workspace
  readonly template: string;     // Key into the templates map
  title: string;                 // Mutable via updateTitle()
  params: TParams;               // Mutable via updateParams()
  readonly createdAt: number;    // Unix ms
  readonly auth: ResolvedWorkspaceAuth; // Auth state at open() time
}

// Params must be serializable to URLSearchParams.
// Arrays and nested objects are supported via the serialization layer (§5).
type WorkspaceParams = Record<string, string | number | boolean | string[] | number[]>;
```

### 2.4 Navigation context — ✅ DONE

> **Status:** the type exists and is populated (current path, params, search params, `inWorkspace`, `currentWorkspace`) for every route-guard evaluation.

```typescript
interface NavigationContext {
  /** Current route path (never a workspace URL) */
  path: string;
  /** Parsed path params for the current route */
  params: Record<string, string>;
  /** Current search params */
  searchParams: URLSearchParams;
  /** True if a workspace is currently focused */
  inWorkspace: boolean;
  /** The currently focused workspace descriptor, or null */
  currentWorkspace: WorkspaceDescriptor | null;
}
```

---

## 3. AppProvider — single root provider — ⚠️ PARTIAL

> **Status:** everything implemented — `maxWorkspaces` (default 10, throws `MAX_WORKSPACES_REACHED`), `defaultLoading`/`defaultError` via context, `auth.onCredentialAttempt`, `components.AuthGate`, sessionStorage persistence (v0.2 API: single `persist: { version }` field instead of `persistWorkspaces`+`persistVersion` — misconfiguration is unrepresentable), `onBeforeNavigate`/`onNavigate` including `workspace-open`/`workspace-close` event types (focus counts as `workspace-open`) — with two deliberate deviations:
> - **`adapter: "auto"` never selects tabs** (recorded in PRE_ADOPTION_CHANGE_PLAN §6): auto is swipe (coarse pointer) or stack only; `window.open`-based UX must be opted into explicitly.
> - **`cancel()` on a workspace navigation blocks only the URL change** — the adapter state mutation (e.g. workspace opened) has already happened by the time the navigation event fires.

The library exposes exactly one provider. No nesting, no ordering requirements.

```typescript
interface AppProviderProps<
  TRoutes extends RouteMap,
  TWorkspaces extends WorkspaceTemplateMap,
  TMeta extends Record<string, unknown> = Record<string, unknown>
> {
  routes: TRoutes;
  workspaces: TWorkspaces;
  /** Initial (and default) app-wide typed meta state */
  meta?: TMeta;
  config?: AppConfig;
  /**
   * Optional external chbus Bus instance.
   * If provided, workspace channels are created on this bus, making all
   * workspace message traffic visible via the bus's onDebug wiretap.
   * If omitted, an internal bus is created automatically.
   */
  bus?: Bus;
  children: React.ReactNode;
}

interface AppConfig {
  /**
   * Which workspace adapter to use.
   * "auto" (default): selects based on environment
   * (touch → swipe, desktop → stack, BroadcastChannel available → tabs).
   */
  adapter?: "auto" | "swipe" | "stack" | "tabs";
  /** Maximum total open workspaces across all templates. Default: 10 */
  maxWorkspaces?: number;
  /**
   * Whether to persist workspace state in sessionStorage.
   * Persisted workspaces are restored on reload. Default: false.
   * When enabled, persistVersion must be set.
   */
  persistWorkspaces?: boolean;
  /** Serialization version. Bump when WorkspaceParams shapes change. */
  persistVersion?: number;
  /** Base path for workspace URLs. Default: "/workspace" */
  workspaceBasePath?: string;

  // --- Route defaults ---

  /**
   * Global Suspense fallback for any route that doesn't declare its own loading.
   * Default: null (render nothing while loading).
   */
  defaultLoading?: React.ComponentType | React.ReactNode;
  /**
   * Global error boundary fallback for any route that doesn't declare its own error.
   * Default: a minimal unstyled error display with the error message and a reset button.
   */
  defaultError?: React.ComponentType<RouteErrorProps>;

  // --- Auth ---

  auth?: {
    isAuthenticated: () => boolean | Promise<boolean>;
    onCredentialAttempt?: (input: CredentialInput, workspaceId: string) => void;
  };

  // --- Navigation lifecycle ---

  /**
   * Called before every navigation attempt (route change or workspace open/focus/close).
   * Call cancel() to block the navigation entirely.
   * Return value is ignored — use cancel() to block, not return false.
   */
  onBeforeNavigate?: (event: NavigationEvent & { cancel: () => void }) => void;

  /**
   * Called after every completed navigation.
   * Not called if the navigation was cancelled by onBeforeNavigate or a route guard.
   */
  onNavigate?: (event: NavigationEvent) => void;

  // --- Component overrides ---

  components?: {
    /** Custom auth gate for direct-access workspace auth failures. */
    AuthGate?: React.ComponentType<{
      workspace: WorkspaceDescriptor;
      authRule: WorkspaceAuthRule;
      retry: (input?: CredentialInput) => Promise<void>;
    }>;
  };
}

interface NavigationEvent {
  /** The route path navigated from. null on initial load. */
  from: string | null;
  /** The route path navigated to. For workspace navigations, this is the origin route. */
  to: string;
  /** "push" | "replace" | "back" | "workspace-open" | "workspace-close" */
  type: NavigationType;
}

type NavigationType = "push" | "replace" | "back" | "workspace-open" | "workspace-close";
```

Usage:

```tsx
<AppProvider
  routes={routes}
  workspaces={workspaces}
  meta={{ mode: "hls" } satisfies AppMeta}
  config={{ adapter: "swipe", persistWorkspaces: false }}
>
  <RouterView />
</AppProvider>
```

### 3.1 RouterView — ✅ DONE

> **Status:** rendering, `fallback`, matching, wildcard capture, index components, workspace-URL passthrough, per-route boundaries, `scrollRestoration`, focus management, and transition semantics are all implemented. Route changes are applied inside `React.startTransition` (mirrored local state — `useSyncExternalStore` updates can't be transitions directly), the previous route stays visible while a new lazy route loads, and `useLocation().isTransitioning` is driven by the pending flag. Boundary fibers persist per nesting depth (not keyed by route) so transitions can hold previous content; error state resets on path change.

`RouterView` renders the currently matched route chain. Workspace rendering is managed internally by the adapter's container alongside `RouterView`.

```tsx
<RouterView />

// Typed fallback — receives the attempted path:
<RouterView fallback={({ path }) => <NotFound attemptedPath={path} />} />
```

**Props:**

```typescript
interface RouterViewProps {
  /**
   * Rendered when no route matches the current path.
   * Accepts a component receiving { path: string } or inline JSX.
   * Default: null.
   */
  fallback?: React.ComponentType<{ path: string }> | React.ReactNode;
  /**
   * Scroll behaviour on route change.
   * "top"     — scroll window to (0,0) on every navigation (default)
   * "restore" — restore saved position on back/forward, scroll to top on push
   * "none"    — no scroll management
   */
  scrollRestoration?: "top" | "restore" | "none";
}
```

**Matching algorithm:**
1. Collect all route keys from `defineRoutes`.
2. Sort by specificity: more path segments rank higher; among equal segment counts, static segments rank above parameterised ones (`/settings/profile` beats `/settings/:section`); among equal specificity, declaration order is the tiebreaker.
3. Find all routes that match the current pathname.
4. From the matches, build the render chain by following parent inference (see §2.1): ordered outermost-first.
5. Render inside-out: innermost component first, passing its output as `outlet` upward.

**Special cases:**
- Workspace URLs (`/workspace/...` by default) are never matched against routes. The router retains the last matched route in state while a workspace URL is in the address bar.
- If no route matches, the `fallback` is rendered. If no `fallback` is provided, nothing renders.
- A wildcard segment `*` in a path key matches any single segment. `/*` at the end matches any remaining segments and captures the value in `params["*"]`.
- An `index` component on a parent route renders as its `outlet` when the parent path is matched exactly and no child route is also matched.

**Suspense and error boundaries:**
Each route in the render chain gets its own independent Suspense boundary and error boundary, wrapping only that route's component — not its children. This means:

- A suspending child shows its own loading fallback; the parent keeps rendering with whatever outlet it last had (or the child's fallback if this is the first load).
- A throwing child shows its own error UI; the parent's layout remains visible.
- Boundary resolution order for fallbacks: route-level `loading`/`error` → `AppConfig.defaultLoading`/`defaultError` → library default (null for loading, minimal error display for errors).

```
RouterView
  └── [error boundary: SettingsError] [suspense: SettingsSkeleton]
        SettingsLayout (outlet = ↓)
          └── [error boundary: default] [suspense: ProfileSkeleton]
                ProfileSettings
```

**Transition semantics:**
`RouterView` wraps all navigation-triggered re-renders in `React.startTransition`. This means:
- The previous route's UI stays visible while a new lazy route is loading.
- The Suspense fallback only appears if the transition takes longer than React's internal threshold.
- The UI never flashes through blank → skeleton → content for fast loads.
- `useLocation().isTransitioning` is `true` during an in-progress transition, allowing route components or nav bars to show a subtle pending indicator if desired.

**Focus management:**
On every completed route transition, `RouterView` moves focus to the first element with `[data-autofocus]` inside the newly rendered route, falling back to the `RouterView` container itself. Declare the focus target inside a route component:

```tsx
function SettingsLayout({ outlet }: RouteComponentProps<{}>) {
  return (
    <div>
      <h1 data-autofocus>Settings</h1>
      <nav>...</nav>
      {outlet}
    </div>
  );
}
```

---

## 4. Navigation API

### 4.1 Hook responsibilities

`useNavigation()` is split into focused hooks to avoid unnecessary re-renders. Components only subscribe to the slice they need.

| Hook | Re-renders when | Use for |
|---|---|---|
| `useNavigation()` | Never (stable refs only) | Calling `navigate()`, `back()`, `buildPath()` |
| `useLocation()` | Path, search params, or transition state change | Reading current URL, pending indicator |
| `useRoute(path)` | Match status or params for that path change | Route-aware components, active link state |
| `useParams(path)` | Params for that path change | Route components reading their own params |
| `useSearchParams()` | Search params change | Reading/writing raw query string |
| `useQueryState(schema)` | Any declared query param changes | Typed URL state (filters, pagination, tabs) |
| `useMeta()` | Meta state changes | App-wide typed config |
| `usePrompt(message, when)` | — | Unsaved-changes navigation guard |

### 4.2 `useNavigation()` — ✅ DONE

> **Status:** stable refs and the typed variadic overload are implemented. Compile-time route-key/param checking activates via the `Register` interface (module augmentation: `declare module "@mikrostack/router" { interface Register { routes: typeof routes } }`); unregistered apps get plain-string keys. The raw-string escape-hatch overload remains.

Stable refs only. Calling this hook never causes a re-render.

```typescript
interface UseNavigationReturn {
  /** Navigate to a route by key with typed params, or by raw path string. */
  navigate<TPath extends keyof TRoutes>(
    to: TPath,
    ...args: ExtractParams<TPath> extends Record<string, never>
      ? [options?: NavigateOptions]
      : [options: NavigateOptions & { params: ExtractParams<TPath> }]
  ): void;
  /** Raw string navigation — no type checking. Escape hatch. */
  navigate(to: string, options?: NavigateOptions): void;
  /** Go back one entry in the session history stack. No-op if canGoBack is false. */
  back(): void;
  /** Construct a URL string from a route key and its params. */
  buildPath<TPath extends keyof TRoutes>(
    path: TPath,
    ...args: ExtractParams<TPath> extends Record<string, never>
      ? []
      : [params: ExtractParams<TPath>]
  ): string;
}

interface NavigateOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
}
```

The variadic overload on `navigate` enforces params at the type level: routes with no params require no `params` argument; routes with params require it. The raw string overload remains as an escape hatch for external URLs or dynamically constructed paths.

### 4.3 `useLocation()` — ✅ DONE

> **Status:** all five fields implemented; `isTransitioning` is driven by RouterView's `useTransition` pending flag (see §3.1).

```typescript
interface UseLocationReturn {
  /** Current pathname. Never a workspace URL. */
  path: string;
  /** Current URL search params. */
  searchParams: URLSearchParams;
  /** True if a workspace is currently focused (workspace URL is in the address bar). */
  inWorkspace: boolean;
  /** True if there is a session history entry to go back to. */
  canGoBack: boolean;
  /**
   * True while a navigation transition is in progress (e.g. a lazy route is loading).
   * Use to show a subtle pending indicator in nav bars or breadcrumbs.
   * Driven by React.startTransition — will be false for instant navigations.
   */
  isTransitioning: boolean;
}

function useLocation(): UseLocationReturn;
```

### 4.4 `useRoute(path)` — ✅ DONE

Returns match information for a specific path pattern against the current URL. Re-renders only when the match status or matched params change.

```typescript
function useRoute<TPath extends keyof TRoutes>(
  path: TPath
): {
  matched: boolean;
  params: ExtractParams<TPath>;
  /** True if this route is an exact match (not just a prefix match via nesting). */
  exact: boolean;
};
```

`exact` distinguishes `/settings` being the active route (exact) from `/settings` being an ancestor of the active route `/settings/profile` (not exact). Useful for active link styling on parent nav items — you may want a different style for "I am this page" vs "I contain the current page".

### 4.5 `useParams(path)` — ✅ DONE

```typescript
// Returns typed params for the given path key.
// Only meaningful when called inside or below the matching route component.
// Returns an empty object (typed correctly) when the route is not matched.
function useParams<TPath extends keyof TRoutes>(path: TPath): ExtractParams<TPath>;
```

### 4.6 `useSearchParams()` — ✅ DONE

```typescript
function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void
];
```

The setter accepts a function form (like `useState`) for safe incremental updates:

```typescript
const [params, setParams] = useSearchParams();
// Add a param without clobbering existing ones:
setParams(prev => {
  const next = new URLSearchParams(prev);
  next.set("tab", "profile");
  return next;
});
```

### 4.7 `useMeta()` — ✅ DONE

```typescript
function useMeta<TMeta extends Record<string, unknown>>(): [TMeta, (patch: Partial<TMeta>) => void];
```

Separated from navigation concerns. Only re-renders when meta state changes.

### 4.8 `useQueryState(schema)` — ✅ DONE

Typed URL state backed by search params. The schema declares the name, type, and optional default value of each param. The library reuses the same serialization layer as workspace params (§5.3).

```typescript
type QueryParamSchema = Record<string, QueryParamDescriptor>;

interface QueryParamDescriptor {
  type: "string" | "number" | "boolean" | "string[]" | "number[]";
  default?: string | number | boolean | string[] | number[];
}

function useQueryState<TSchema extends QueryParamSchema>(
  schema: TSchema
): [InferQueryState<TSchema>, (patch: Partial<InferQueryState<TSchema>>) => void];

// Infers the state shape from the schema:
// { page: { type: "number", default: 1 } } → { page: number }
type InferQueryState<TSchema extends QueryParamSchema> = {
  [K in keyof TSchema]: InferQueryParamType<TSchema[K]["type"]>;
};
```

Usage:

```typescript
const [filters, setFilters] = useQueryState({
  page:   { type: "number",   default: 1 },
  sort:   { type: "string",   default: "name" },
  active: { type: "boolean",  default: true },
  tags:   { type: "string[]" },
});

// filters is typed: { page: number, sort: string, active: boolean, tags: string[] }
// URL: ?page=2&sort=name&active=true&tags=react&tags=typescript

setFilters({ page: 2 });           // merges — other params unchanged
setFilters({ tags: ["react"] });   // arrays serialize to repeated keys
```

**Rules:**
- Updates call the `useSearchParams` setter internally — `useQueryState` is a typed layer on top of it, not a separate state mechanism.
- Params not declared in the schema are preserved in the URL unchanged.
- A param absent from the URL returns its `default` value, or `undefined` if no default is declared.
- The setter always does a `replace` navigation (not `push`) — filter changes should not pollute the history stack.
- Multiple `useQueryState` calls in the same component or tree with overlapping keys are additive — they read and write the same underlying search params.

### 4.9 `usePrompt(message, when)` — ✅ DONE

> **Status:** `navigate()`, `<Link>`, `back()`, and workspace operations are all intercepted via `window.confirm`; `beforeunload` is registered/removed with `when` and sets `returnValue`.

Registers a navigation guard at the component level. Blocks in-app navigation and browser tab close when `when` is true.

```typescript
function usePrompt(
  message: string,
  when: boolean
): void;
```

When `when` is true:
- In-app navigation (via `navigate()`, `<Link>`, `back()`) is intercepted and a confirmation dialog is shown using `window.confirm(message)`. If the user cancels, navigation is blocked.
- Browser tab close (`beforeunload`) is also blocked with the browser's native confirmation. Note: modern browsers do not show custom messages on `beforeunload` — the browser's own prompt is shown instead.
- Workspace operations (`open`, `focus`, `close`) that would change the visible route are also intercepted.

`usePrompt` composes with `onBeforeNavigate` — both run, and either can block.

```typescript
function EditProfileRoute() {
  const [isDirty, setIsDirty] = useState(false);
  usePrompt("You have unsaved changes. Leave anyway?", isDirty);
  // ...
}
```

### 4.10 `notFound()` — ✅ DONE

A function route components call to signal that the matched URL is structurally valid but the resource does not exist. Causes `RouterView` to render the `fallback` with the attempted path, as if no route had matched.

```typescript
function notFound(): never;  // throws — component render stops immediately
```

```typescript
function CameraDetailRoute({ params }: RouteComponentProps<{ id: string }>) {
  const camera = useCamera(params.id);
  if (!camera) notFound();
  return <CameraView camera={camera!} />;
}
```

`notFound()` throws a sentinel value caught by `RouterView`'s internal error boundary, which then renders the fallback. This means it works correctly inside async rendering and inside Suspense — the throw propagates up the same way any render-time throw does.

### 4.11 `<Link>` — ✅ DONE

> **Status:** all runtime behavior plus compile-time typing. `to` is constrained to registered route keys and `params` follows the conditional `LinkParamsProp` type when routes are registered via the `Register` interface (see §4.2); unregistered apps keep loose string typing. `href` escape hatch unchanged.

```typescript
interface LinkProps<TPath extends keyof TRoutes> {
  to: TPath;
  params?: ExtractParams<TPath>;  // required when TPath has params, optional when it doesn't
  replace?: boolean;
  state?: Record<string, unknown>;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;       // applied when this route is matched (exact or ancestor)
  exactActiveClassName?: string;  // applied only on exact match
  style?: React.CSSProperties;
  activeStyle?: React.CSSProperties;
  exactActiveStyle?: React.CSSProperties;
}

// Escape hatch for raw URLs (external links, dynamically constructed paths).
// Uses href instead of to — no type checking, renders a plain <a>.
interface LinkHrefProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
```

Type enforcement on `params`: if `TPath` resolves to a path with no params, `params` is not accepted. If it resolves to a path with params, `params` is required. This is enforced via a conditional type on the prop:

```typescript
type LinkParams<TPath extends keyof TRoutes> =
  ExtractParams<TPath> extends Record<string, never>
    ? { params?: never }
    : { params: ExtractParams<TPath> };
```

`<Link>` intercepts clicks but passes through when modifier keys are held (Cmd, Ctrl, Shift, Alt) — standard browser behaviour for opening in new tabs.

### 4.12 `navigate()` — imperative, outside React — ✅ DONE

> **Status:** `AppProvider` registers the store on mount (`setActiveStore`) and unregisters on unmount; the export navigates while a provider is mounted and is a no-op otherwise. Typed with the same `Register`-driven overloads as `useNavigation().navigate`.

```typescript
// Usable outside React components (service workers, event handlers, etc.).
// Same overloads as useNavigation().navigate().
function navigate<TPath extends keyof TRoutes>(
  to: TPath,
  ...args: ExtractParams<TPath> extends Record<string, never>
    ? [options?: NavigateOptions]
    : [options: NavigateOptions & { params: ExtractParams<TPath> }]
): void;
function navigate(to: string, options?: NavigateOptions): void;
```

### 4.13 History stack — ✅ DONE

> **Status:** fully implemented. Workspace close reads the origin from `window.history.state` when it belongs to the closing workspace (in-memory origins cover background/persisted workspaces), replaces the workspace URL, and leaves the session stack untouched — `canGoBack` after close reflects the pre-open state. The origin captured at `open()` is the router's route path, never another workspace URL.

The library maintains a session-scoped history stack alongside `window.history`.

**Rules:**
- Initialised empty on mount.
- Every `navigate()` call that is not `replace: true` pushes to the stack.
- `back()` pops the stack and calls `window.history.back()`.
- `canGoBack` (from `useLocation()`) reflects whether the stack has entries.
- The stack is not persisted across page reloads — `canGoBack` is always false on fresh load.
- When a workspace closes, the library reads the origin path from `window.history.state` and navigates there, bypassing the stack entirely (the stack is not modified). This means `canGoBack` after a workspace close reflects the same state it had before the workspace was opened — it is not reset to false.

```
// Stored in window.history.state when a workspace URL is pushed:
history.state = { origin: "/settings/profile", workspaceId: "uuid" }
```

---

## 5. Workspace API

### 5.1 `useWorkspaces<TWorkspaces>()` — ✅ DONE

> **Status:** full return shape and internal navigation on `open`/`focus`/`close`/`updateParams` verified (`src/workspaces/hooks.ts`, `WorkspaceManager.ts`).

```typescript
interface UseWorkspacesReturn<TWorkspaces extends WorkspaceTemplateMap> {
  /** All open workspace descriptors, in creation order. */
  workspaces: WorkspaceDescriptor[];
  /** The currently focused workspace, or null. */
  current: WorkspaceDescriptor | null;
  /** The resolved adapter type ("swipe" | "stack" | "tabs"). */
  adapterType: AdapterType;

  /**
   * Open a new workspace.
   * Navigation is automatic — no manual navigate() call needed.
   * Rejects if auth check fails (see §6) or maxInstances is reached.
   */
  open<TKey extends keyof TWorkspaces>(
    descriptor: OpenWorkspaceInput<TKey, InferParams<TWorkspaces[TKey]>>
  ): Promise<WorkspaceDescriptor<InferParams<TWorkspaces[TKey]>>>;

  /**
   * Focus an existing workspace.
   * Navigation is automatic.
   */
  focus(id: string): Promise<WorkspaceDescriptor>;

  /**
   * Close a workspace.
   * Navigation is automatic — returns to the origin route (see §4.7).
   * autoFocus: if true and the closed workspace was current, focus the adjacent one. Default: true.
   */
  close(id: string, autoFocus?: boolean): Promise<void>;

  /**
   * Update a workspace's params.
   * Fires workspace:updated and replaces the current history entry with the new URL.
   * No manual navigate() call needed.
   */
  updateParams<TKey extends keyof TWorkspaces>(
    id: string,
    params: Partial<InferParams<TWorkspaces[TKey]>>
  ): WorkspaceDescriptor;

  /**
   * Update a workspace's title.
   */
  updateTitle(id: string, title: string): WorkspaceDescriptor;
}

interface OpenWorkspaceInput<TKey, TParams> {
  template: TKey;
  title: string;
  params: TParams;
  /**
   * Route to install as the workspace's background before opening.
   * When given, the current history entry is REPLACED with this route,
   * then the workspace URL is pushed — so the root page shows it, swipe-
   * to-root and close() return to it, and the browser back button skips
   * the launching page entirely.
   *
   * Use when the launching page should not be returned to (e.g. a
   * "create workspace" form). Omitted: the origin is wherever the router
   * currently is, unchanged.
   *
   * Applied only after the auth check passes — a rejected open() leaves
   * the route untouched.
   */
  origin?: string;
}

// Infers TParams from a WorkspaceTemplate<TParams>
type InferParams<T> = T extends WorkspaceTemplate<infer P> ? P : never;
```

**Key contract changes from current code:**
- `open()`, `focus()`, `close()` all navigate internally. Callers never call `navigate()` after these.
- `updateParams()` replaces the current URL entry in-place (equivalent to `navigate(url, { replace: true })`). Callers never call `navigate()` after this either.
- The tabs adapter special case (`adapter.type !== "tabs"`) is gone from call sites. The adapter handles it internally.

### 5.2 `useWorkspace(id)` — ✅ DONE

> **Status (v0.2 API):** returns `{ workspace, params }` — the `channel` field below was removed as perspective-ambiguous; the workspace side gets its channel via component props, the root side via `useWorkspaceChannel(id)`.

Per-workspace reactive hook. Replaces `useWorkspaceParams`.

```typescript
function useWorkspace<TParams extends WorkspaceParams>(
  id: string
): {
  workspace: WorkspaceDescriptor<TParams>;
  /** Reactive params — re-renders on workspace:updated for this id. */
  params: TParams;
  channel: WorkspaceChannel<TParams>;  // see §7
} | null;  // null if workspace with this id does not exist
```

### 5.3 Param serialization — ✅ DONE

> **Status:** serialization, schema-driven deserialization (used when reconstructing a workspace from a directly-loaded URL — `WorkspaceManager.descriptorFromLocation`; no schema → all values strings), and sessionStorage persistence with `ws:v{version}` version-mismatch discard are all implemented. v0.2 API: persistence is enabled via `config.persist: { version }`, and the schema is also the source of the TypeScript param types (schema-first — `InferSchemaParams`).

All workspace params are serialized to/from URL search params. The serialization layer handles arrays and primitive types transparently.

**Rules:**
- `string` → verbatim
- `number` → `String(n)`
- `boolean` → `"true"` / `"false"`
- `string[]` → repeated key: `?ids=a&ids=b&ids=c`
- `number[]` → repeated key, stringified values

Deserialization reconstructs the original shape based on the TypeScript type of the template's `TParams`. This means the serializer needs the schema at deserialization time.

**Implementation approach:** Each `WorkspaceTemplate` optionally accepts a `schema` field describing the types of each param key. If absent, all values are treated as `string`. The schema is the sole source of type information at deserialization time — the TypeScript type of `TParams` is erased at runtime and cannot be used directly.

```typescript
interface WorkspaceTemplate<TParams> {
  // ...
  schema?: {
    [K in keyof TParams]?: "string" | "number" | "boolean" | "string[]" | "number[]";
  };
}
```

**Persistence versioning:** When `persistWorkspaces: true`, the serialized state is stored in `sessionStorage` with the key `ws:v{persistVersion}`. On load, if the version does not match, stored state is discarded and the app starts fresh. No migration path in v1.

### 5.4 Workspace URL format — ✅ DONE

```
/workspace/{template}/{id}?title={title}&{...params}
```

Changed from current: `id` is now a path segment, not a query param. This makes workspace URLs more debuggable and separates the structural identity (`template/id`) from the data (`params`).

`title` is always a query param (it is not structural and may contain spaces/special chars).

---

## 6. Workspace auth

Auth rules are declared per template in the `WorkspaceTemplateMap`. They are evaluated by the library when `open()` is called and when a workspace URL is loaded directly (tabs adapter or page reload with persistence).

### 6.1 Auth rule types — ✅ DONE

> **Status:** all five rule types evaluated correctly by `src/workspaces/auth/WorkspaceGuard.ts`, including function-form `expiresAt` and custom-check throw → false.

```typescript
type WorkspaceAuthRule =
  | { type: "public" }
  | { type: "authenticated" }
  | { type: "time-limited"; expiresAt: number | (() => number) }
  | { type: "credential"; validate: (input: CredentialInput) => boolean | Promise<boolean> }
  | { type: "custom"; check: (context: AuthCheckContext) => boolean | Promise<boolean> };

interface CredentialInput {
  username: string;
  password: string;
}

interface AuthCheckContext {
  workspaceId: string;
  template: string;
  params: WorkspaceParams;
  /** True if the workspace is being opened from a direct URL (not via open()). */
  isDirectAccess: boolean;
}
```

### 6.2 Auth evaluation — ✅ DONE

> **Status:** the `open()` path evaluates auth before the adapter opens (credential rules prompt via the built-in dialog; cancel fails auth), and direct URL access re-evaluates with `isDirectAccess: true` — the workspace renders behind the AuthGate until granted. Naming note: rejections use `WorkspaceError` with code `AUTH_FAILED`, not a separate `WorkspaceAuthError` class.

When `open()` is called:

1. Resolve the auth rule for the template.
2. Evaluate the rule. `public` always passes. `authenticated` defers to the app-supplied `isAuthenticated` callback (see §6.3). `time-limited` compares `Date.now()` to `expiresAt`. `credential` prompts via the library's built-in credential dialog (see §6.4). `custom` calls the `check` function.
3. If the check fails, `open()` rejects with a `WorkspaceAuthError`.
4. If the check passes, proceed with open.

When a workspace URL is loaded directly (tabs adapter, or page reload):

- Same evaluation, but `isDirectAccess: true` is set in the context.
- `authenticated` type in direct access: calls `isAuthenticated`. If false, the workspace renders an `AuthGate` component (see §6.4) instead of the template component. The workspace is not closed — access may be granted by the user logging in.

### 6.3 App-supplied auth callbacks — ✅ DONE

> **Status:** `isAuthenticated` is wired into the guard; `onCredentialAttempt` fires with the submitted input and workspace id on every credential submission (built-in dialog at `open()` time, and AuthGate retry on direct access).

```typescript
interface AppConfig {
  // ...
  auth?: {
    /**
     * Returns true if there is an active authenticated session.
     * Called for templates with auth: { type: "authenticated" }.
     */
    isAuthenticated: () => boolean | Promise<boolean>;
    /**
     * Called when a workspace with auth: { type: "credential" } is opened.
     * The library renders its built-in credential dialog; this callback receives the result.
     * [IMPL] The library's built-in dialog is a minimal username/password form.
     */
    onCredentialAttempt?: (input: CredentialInput, workspaceId: string) => void;
  };
}
```

### 6.4 AuthGate — ✅ DONE

> **Status:** all containers render workspace content through a gate: ungranted workspaces show the built-in unstyled `DefaultAuthGate` (credential form for credential rules, retry affordance otherwise; `src/workspaces/auth/AuthGate.tsx`), overridable via `AppConfig.components.AuthGate` with the exact `{workspace, authRule, retry}` props below.

When auth fails for a directly-accessed workspace (tabs adapter), the library renders an `AuthGate` in place of the workspace component. The `AuthGate` is minimal by default but can be replaced:

```typescript
interface AppConfig {
  // ...
  components?: {
    /**
     * Custom auth gate component. Receives the workspace descriptor and a retry function.
     * Default: a minimal centered form with username/password fields.
     */
    AuthGate?: React.ComponentType<{
      workspace: WorkspaceDescriptor;
      authRule: WorkspaceAuthRule;
      retry: (input?: CredentialInput) => Promise<void>;
    }>;
  };
}
```

---

## 7. Workspace channel

Each open workspace gets an isolated bidirectional communication channel between the workspace component and the root application. The channel is the authoritative way for workspaces and root to exchange messages. It replaces ad-hoc `useWorkspaces()` calls inside workspace components for communication purposes.

The channel is backed by `@mikrostack/chbus`. Each workspace gets a `NamespacedBus` scoped to `workspace:{id}`, created by `WorkspaceManager` when `open()` is called. This provides loop prevention, storm control, and full observability via the chbus `onDebug` wiretap — all message traffic across all open workspaces is visible in a single debug stream with no additional instrumentation.

**Note on shared state:** The previous design included a `channel.state` reactive store primitive. This is removed. Persistent shared state between root and a workspace should use `updateParams()`, which already syncs via events and serializes to the URL. `channel` is for transient commands and notifications only — things that are fire-and-forget, not things that need to survive a reload.

### 7.1 Channel contracts — ✅ DONE (consumer-side convention; types flow through `WorkspaceChannel` generics)

Each workspace template should declare its message contract types in a `{template}.types.ts` file alongside its component. Both the workspace component and root consumers import from this file.

```typescript
// cameraFeed.types.ts
import type { ChannelContract } from '@mikrostack/chbus';

export type RootToFeedContract = ChannelContract<{
  'camera:focus':   { cameraId: string };
  'camera:ptz':     { pan: number; tilt: number; zoom: number };
}>;

export type FeedToRootContract = ChannelContract<{
  'motion:detected': { cameraId: string; timestamp: number };
  'feed:error':      { cameraId: string; reason: string };
}>;
```

### 7.2 WorkspaceChannel type — ✅ DONE

> **Status:** `NamespacedBus` scoped `workspace:{id}` created at `open()`; `inbound` = root-to-ws, `outbound` = ws-to-root, passed to workspace components via `{workspace, channel}` props in all three containers.

`WorkspaceManager` creates the `NamespacedBus` and wires two channels on it — one for each direction — then passes the pair to the workspace component via `WorkspaceComponentProps`.

```typescript
interface WorkspaceChannel<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
> {
  /**
   * The chbus channel the workspace uses to receive messages from root.
   * Call channel.inbound.on('camera:focus', handler) inside the workspace.
   */
  inbound: Channel<TRootToWorkspace>;

  /**
   * The chbus channel the workspace uses to send messages to root.
   * Call channel.outbound.emit('motion:detected', payload) inside the workspace.
   */
  outbound: Channel<TWorkspaceToRoot>;
}
```

`Channel<T>` is the chbus `Channel` type. The workspace component calls `.on()` / `.onAsync()` on `inbound` and `.emit()` / `.emitAsync()` on `outbound` directly — no wrapper API.

### 7.3 Root-side channel access — ✅ DONE

> **Status:** `useWorkspaceChannel` returns the correctly flipped pair; `null` for unknown/closed workspaces.

```typescript
// Returns the same NamespacedBus pair as inside the workspace, from the root side.
// inbound/outbound are flipped: what the workspace sends, root receives, and vice versa.
function useWorkspaceChannel<
  TRootToWorkspace extends ChannelContract = ChannelContract,
  TWorkspaceToRoot extends ChannelContract = ChannelContract,
>(workspaceId: string): {
  /** Root uses this to send commands to the workspace. */
  outbound: Channel<TRootToWorkspace>;
  /** Root uses this to receive messages from the workspace. */
  inbound: Channel<TWorkspaceToRoot>;
} | null;  // null if workspace does not exist
```

The naming convention — `inbound` and `outbound` — is always from the perspective of the caller. This means the physical channels are swapped between the two sides:

```
Workspace side:   channel.inbound  ← receives from root   (root-to-ws channel)
                  channel.outbound → sends to root         (ws-to-root channel)

Root side:        channel.outbound → sends to workspace    (root-to-ws channel)
                  channel.inbound  ← receives from workspace (ws-to-root channel)
```

Both sides call `.on()` on their `inbound` and `.emit()` on their `outbound`. The library wires the underlying chbus channels so that what the workspace emits on `outbound` arrives at root's `inbound`, and vice versa. Integration tests must verify this wiring explicitly — it is the most likely source of confusion during implementation.

### 7.4 Observability — ✅ DONE (external `bus` prop used when provided, internal `createBus()` otherwise)

Because the channel uses chbus, all workspace message traffic is automatically visible via the bus's debug wiretap. `WorkspaceManager` exposes the underlying bus:

```typescript
interface AppProviderProps {
  // ...
  /** Optional: provide an existing chbus Bus instance. If omitted, one is created internally. */
  bus?: Bus;
}
```

Accepting an external `Bus` lets the consuming app wire up `createLogger` or a custom `onDebug` handler across the entire application — routing, workspace lifecycle events, and workspace message channels in a single stream.

```typescript
// In main.tsx
import { createBus, createLogger } from '@mikrostack/chbus';

const bus = createBus();
createLogger(bus); // logs all workspace channel traffic to console in development

<AppProvider bus={bus} routes={routes} workspaces={workspaces} ...>
```

### 7.5 Cross-tab channel (BrowserTabAdapter) — ✅ DONE

> **Status:** under the tabs adapter, `WorkspaceManager` creates channels with cross-tab bridging: every local emit is mirrored over a per-workspace `BroadcastChannel` (`chbus:workspace:{id}`) and re-emitted on the receiving tab's local chbus channels (remote re-emits bypass the bridge — loop-safe). The API surface inside components is unchanged.

When `adapterType === "tabs"`, workspaces run in a separate browser tab. The `NamespacedBus` channels are bridged over `BroadcastChannel` automatically by `WorkspaceManager`. The API surface inside the workspace component is identical — the transport is an implementation detail.

**Constraint:** Messages must be structured-clone-serializable (no functions, class instances, or DOM nodes). This constraint is the same as chbus's cross-tab constraint and does not require any additional enforcement.

### 7.6 Channel lifetime — ✅ DONE (created at `open()`, destroyed before adapter close resolves; restore recreates pairs)

- The `NamespacedBus` for a workspace is created when `open()` is called.
- It is destroyed when `close()` resolves — all subscribers are cleaned up.
- Emitting on a destroyed channel is a no-op (chbus emits a dev warning).

---

## 8. Workspace adapter model

The adapter is selected once at `AppProvider` mount and does not change at runtime. The three adapter types are preserved from the current codebase with the following changes:

### 8.1 Adapter interface (internal) — ✅ DONE (interface matches exactly; adapters return no URLs)

```typescript
interface WorkspaceAdapter {
  readonly type: AdapterType;

  open(descriptor: WorkspaceDescriptor): Promise<void>;
  close(id: string, autoFocus?: boolean): Promise<void>;
  focus(id: string): Promise<void>;
  updateParams(id: string, params: WorkspaceParams): void;
  updateTitle(id: string, title: string): void;
  getAll(): WorkspaceDescriptor[];
  getCurrent(): WorkspaceDescriptor | null;
  restoreState(descriptors: WorkspaceDescriptor[]): void;
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;
}
```

**Key change:** Adapters no longer return URLs. URL construction is handled by `WorkspaceManager` after the adapter resolves. Navigation is triggered inside `WorkspaceManager`, not by callers.

### 8.2 Adapter responsibilities — ⚠️ PARTIAL

> **Status:** ownership split holds for stack/swipe. Exception: **`BrowserTabAdapter` builds its own URL internally** for `window.open()` (it cannot defer to the manager's navigate), so URL construction is not exclusively the manager's under tabs.

| Concern | Owner |
|---|---|
| Workspace lifecycle (open/close/focus state) | Adapter |
| URL construction | WorkspaceManager |
| Navigation (calling navigate) | WorkspaceManager |
| Layout rendering | Container component |
| Auth evaluation | WorkspaceManager |
| Channel management (chbus NamespacedBus per workspace) | WorkspaceManager |

### 8.3 StackAdapter — ✅ DONE

- Manages workspaces as an ordered array with a `currentIndex`.
- `close(id, autoFocus=true)`: removes from array; if autoFocus, focuses the adjacent workspace (prefer next, fall back to previous).
- Emits `workspace:focused` after close when autoFocus results in a focus.

### 8.4 SwipeAdapter — ✅ DONE (incl. index clamping, no `workspace:focused` from `setCurrentIndex`)

- Identical to StackAdapter in lifecycle.
- Exposes `getCurrentIndex()` / `setCurrentIndex(n)` for scroll-driven navigation — these update internal state without going through the full `focus()` async path.
- Container uses these during scroll; `focus()` is used for explicit button-driven navigation.

### 8.5 BrowserTabAdapter — ✅ DONE

> **Status:** `window.open`, focus/close no-op semantics, BroadcastChannel state sync, and URL-based `getCurrent()` are implemented; the debug `console.log` is removed. In a freshly opened tab, the descriptor is reconstructed from the URL by `WorkspaceManager.resolveDirectAccess()` (schema-driven, spec §5.3) and adopted into the adapter, so `getCurrent()` resolves correctly at the system level.

- `open(descriptor)`: calls `window.open(url)`. Returns immediately.
- `focus(id)`: no-op (browsers cannot programmatically focus other tabs). Emits `workspace:focused` for local consistency.
- `close(id)`: no-op for other tabs; can close the current tab if `id === currentId`.
- `getCurrent()`: reads `id` from current URL on mount. This fixes the current bug where `getCurrent()` always returns null.
- State sync: uses `BroadcastChannel` to propagate `workspace:opened`, `workspace:closed` events to the opener tab.

Remove the debug `console.log("received opened!!!")` from `BroadcastChannel` listener.

---

## 9. Event system — ✅ DONE

> **Status:** all seven event variants are live: adapter events pass through the manager, `workspace:auth-failed` is emitted on guard denial (open, direct access, and retry), and `workspace:error` is emitted when an adapter operation fails. `useSyncExternalStore` throughout.

Events flow from adapter → WorkspaceManager → subscribers. Events are typed and exhaustive.

```typescript
type WorkspaceEvent =
  | { type: "workspace:opened";   workspace: WorkspaceDescriptor }
  | { type: "workspace:closed";   workspaceId: string }
  | { type: "workspace:focused";  workspaceId: string }
  | { type: "workspace:updated";  workspace: WorkspaceDescriptor }
  | { type: "workspace:synced";   workspaces: WorkspaceDescriptor[] }
  | { type: "workspace:auth-failed"; workspaceId: string; rule: WorkspaceAuthRule }
  | { type: "workspace:error";    workspaceId: string | null; error: Error };
```

**Rules:**
- Events are synchronous from the perspective of the adapter (fire-and-forget to listeners).
- `WorkspaceManager` listeners update React state via `useSyncExternalStore` or equivalent.
- No event cancellation in v1.

---

## 10. Error handling — ✅ DONE

> **Status:** all five codes are thrown where specified: `AUTH_FAILED`, `MAX_INSTANCES_REACHED`, `MAX_WORKSPACES_REACHED` (global limit, default 10), `WORKSPACE_NOT_FOUND`, and `ADAPTER_ERROR` (wraps adapter open/focus/close failures; also used for an unknown template key at `open()`). Errors propagate to callers unswallowed.

All async workspace operations (`open`, `focus`, `close`) reject with typed errors:

```typescript
class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly workspaceId: string | null;
}

type WorkspaceErrorCode =
  | "AUTH_FAILED"
  | "MAX_INSTANCES_REACHED"
  | "MAX_WORKSPACES_REACHED"
  | "WORKSPACE_NOT_FOUND"
  | "ADAPTER_ERROR";
```

`useWorkspaces()` does not expose an error state — errors from `open()`, `focus()`, `close()` are propagated to the caller's `catch` handler. The library does not swallow errors silently.

---

## 11. Meta state — ✅ DONE

App-wide typed meta state is retained on `AppProvider`. It is exposed via `useMeta()` (see §4.7). It is not persisted. It is not related to workspace params.

The `meta` generic is inferred from the `meta` prop passed to `AppProvider`:

```typescript
// Type of meta is inferred as { mode: "hls" | "webrtc" }
<AppProvider meta={{ mode: "hls" as "hls" | "webrtc" }} ...>
```

This replaces `useRouter<{ mode: "hls" | "webrtc" }>()`.

---

## 12. Things explicitly out of scope for v1

| Feature | Rationale |
|---|---|
| Runtime adapter switching | Adapter is an environment concern, not a runtime UI concern |
| Workspace migration on persist version bump | Discard and restart is acceptable for v1 |
| Animated route transitions | Out of scope; adapters handle workspace transitions |
| SSR | Not applicable to this app |
| React Native | Not applicable |

---

## 13. Usage example — fleet monitoring app

This section traces a complete, realistic usage of the library through a hypothetical fleet monitoring application. The app has conventional routes (dashboard, alerts config) and two workspace templates: `cameraFeed` (publicly shareable, time-limited URL) and `alertPanel` (requires authentication, max 3 concurrent). It is intended as a reference for consumers of the library, and as a validation that the API surface is coherent end-to-end.

---

### 13.1 Bootstrap

```tsx
// main.tsx

// Keys are path strings. No separate path field.
// Parent-child nesting is inferred automatically from path prefixes.
const routes = defineRoutes({
  "/":                  { component: DashboardRoute },
  "/alerts":            { component: AlertsRoute },
  "/camera/:id":        { component: CameraDetailRoute },
});

const workspaces = defineWorkspaces({
  cameraFeed: {
    component: CameraFeedWorkspace,
    auth: { type: "time-limited", expiresAt: () => Date.now() + 1000 * 60 * 60 },
    schema: { cameraId: "string", label: "string" },
  } as WorkspaceTemplate<CameraFeedParams>,

  alertPanel: {
    component: AlertPanelWorkspace,
    auth: { type: "authenticated" },
    maxInstances: 3,
    schema: { alertIds: "string[]", severity: "string" },
  } as WorkspaceTemplate<AlertPanelParams>,
});

// One provider. No nesting, no ordering, no ignore props.
<AppProvider
  routes={routes}
  workspaces={workspaces}
  meta={{ theme: "dark" } as AppMeta}
  config={{
    adapter: "auto",
    persistWorkspaces: false,
    auth: { isAuthenticated: () => authStore.isLoggedIn },
  }}
>
  <RouterView scrollRestoration="restore" />
</AppProvider>
```

Note what is absent: no `<WorkspaceProvider>` wrapper, no `<Router>`, no `<Route>` JSX, no `ignore="/workspace"` prop.

---

### 13.2 Route navigation

```tsx
function DashboardRoute({ params, outlet }: RouteComponentProps<{}>) {
  const { navigate }           = useNavigation();
  const { workspaces, open }   = useWorkspaces<typeof workspaces>();
  const [meta]                 = useMeta<AppMeta>();

  return (
    <>
      {/* Type-safe key lookup. Compile error if key doesn't exist. */}
      <Link to="/alerts">Configure alerts</Link>

      {/* Params required — compile error if omitted for a parametric route. */}
      <Link to="/camera/:id" params={{ id: cam.id }}>Details</Link>

      {/* Active styling on a nav item */}
      <Link
        to="/alerts"
        activeClassName="nav-active"
        exactActiveClassName="nav-exact"
      >
        Alerts
      </Link>

      {workspaces.map(ws => (
        <WorkspaceCard key={ws.id} workspace={ws} />
      ))}

      <button onClick={() => open({
        template: "cameraFeed",
        title: "Cam 4 — north gate",
        params: { cameraId: "cam-4", label: "North gate" },
      })}>
        Open live feed
      </button>

      {/* Typed imperative navigation — params enforced at call site */}
      <button onClick={() => navigate("/camera/:id", { params: { id: "cam-4" } })}>
        Go to camera
      </button>
    </>
  );
}
```

---

### 13.3 Opening a workspace

When the button above is clicked, the execution path inside the library is:

```
open({ template: "cameraFeed", ... })
  → WorkspaceManager evaluates auth rule
      time-limited: Date.now() < expiresAt() ✓
  → adapter.open(descriptor)
  → WorkspaceManager builds URL:
      /workspace/cameraFeed/{uuid}?title=...&cameraId=cam-4&label=North+gate
  → navigate(url, { state: { origin: "/" } })   ← origin stored in history.state
  → Promise resolves with WorkspaceDescriptor
```

The caller:

```tsx
// After: one call, navigation is implicit.
await open({ template: "cameraFeed", title: "Cam 4", params: { cameraId: "cam-4", label: "North gate" } });

// Before (prior art): six lines, manual branching, manual history management.
// workspacesAPI.open(workspace).then(({ url }) => {
//   if (workspacesAPI.adapter.type !== "tabs") {
//     setPrevious("/");
//     navigate(url.toString());
//   }
// });
```

---

### 13.4 Inside a workspace component

```tsx
// cameraFeed.types.ts — imported by both the workspace and root consumers.
import type { ChannelContract } from '@mikrostack/chbus';

export type RootToFeedContract = ChannelContract<{
  'camera:focus': { cameraId: string };
}>;
export type FeedToRootContract = ChannelContract<{
  'motion:detected': { cameraId: string; timestamp: number };
}>;
```

```tsx
// CameraFeedWorkspace.tsx
function CameraFeedWorkspace({ workspace, channel }: WorkspaceComponentProps<CameraFeedParams>) {
  const { cameraId } = workspace.params;

  // Reactive — re-renders if params are updated externally.
  const { params } = useWorkspace<CameraFeedParams>(workspace.id)!;

  // Listen for commands from root via the chbus inbound channel.
  useEffect(() => {
    return channel.inbound.on('camera:focus', ({ cameraId }) => {
      setActiveCam(cameraId);
    });
  }, [channel]);

  // Send events to root via the chbus outbound channel.
  const handleMotionDetected = () => {
    channel.outbound.emit('motion:detected', { cameraId, timestamp: Date.now() });
  };

  return <VideoPlayer cameraId={params.cameraId} onMotion={handleMotionDetected} />;
}
```

---

### 13.5 Root reacting to workspace messages

```tsx
function FeedMonitor({ workspaceId }: { workspaceId: string }) {
  // inbound/outbound are from root's perspective — the inverse of the workspace's view.
  const ch = useWorkspaceChannel<RootToFeedContract, FeedToRootContract>(workspaceId);

  useEffect(() => {
    return ch?.inbound.on('motion:detected', ({ cameraId }) => {
      notificationStore.add(`Motion detected on ${cameraId}`);
    });
  }, [ch]);

  // Push a command into the workspace.
  const handleOverride = () => {
    ch?.outbound.emit('camera:focus', { cameraId: 'cam-7' });
  };

  return <button onClick={handleOverride}>Override PTZ</button>;
}
```

---

### 13.6 Updating params from inside a workspace

```tsx
function AlertPanelWorkspace({ workspace }: WorkspaceComponentProps<AlertPanelParams>) {
  const { updateParams } = useWorkspaces();
  const { params }       = useWorkspace<AlertPanelParams>(workspace.id)!;

  const handleDismiss = (alertId: string) => {
    // One call: params updated, URL replaced in history. No navigate() needed.
    // alertIds: string[] serializes to repeated keys: ?alertIds=a1&alertIds=a2
    updateParams(workspace.id, {
      alertIds: params.alertIds.filter(id => id !== alertId),
    });
  };

  return params.alertIds.map(id => (
    <AlertRow key={id} id={id} onDismiss={handleDismiss} />
  ));
}
```

---

### 13.7 Closing a workspace and back-navigation

```tsx
function WorkspaceToolbar({ workspaceId }: { workspaceId: string }) {
  const { close } = useWorkspaces();

  // The library reads window.history.state.origin and navigates there.
  // If the workspace was opened from /alerts, the user lands on /alerts.
  // If from /, they land on /. No setPrevious(), no stored ref.
  return <button onClick={() => close(workspaceId)}>Close</button>;
}
```

---

## 14. Migration notes (current code → library)

These are not implementation tasks — they are a reference for the consuming app team.

| Current pattern | Replacement |
|---|---|
| `<WorkspaceProvider>` + `<Router>` | `<AppProvider>` |
| `<Route path="...">` (JSX) | `defineRoutes({ "/path": { component } })` |
| `useRouter()` | `useNavigation()` · `useLocation()` · `useMeta()` |
| `useRouter<TMeta>()` | `useMeta<TMeta>()` |
| `useParams()` | `useParams("/path/:segment")` |
| `useLocation()` | `useLocation().path` |
| `setPrevious()` / `getPrevious()` | Removed — library manages back navigation |
| `workspaces.open().then(({ url }) => navigate(url))` | `workspaces.open()` |
| `workspaces.focus(id).then(({ url }) => navigate(url))` | `workspaces.focus(id)` |
| `workspaces.updateParams(id, p); navigate(url, { replace: true })` | `workspaces.updateParams(id, p)` |
| `adapter.type !== "tabs"` guard at call sites | Removed — adapter logic is internal |
| `useWorkspaceParams(workspace)` | `useWorkspace(id).params` |
| `useWorkspaceContainer()` (DOM scroll) | Container-internal; not exposed |
| `useRouter()` inside workspace for navigate | `useWorkspaceChannel()` for messaging; `useNavigation()` for route navigation |
| `ignore="/workspace"` on Router | Not needed — workspace URLs are first-class |
| Named route keys (`home`, `settings`) | Full path keys (`"/"`, `"/settings"`) |
| `<Route path="/">` children as JSX | `index` component on parent route definition |
| Manual `URLSearchParams` manipulation | `useQueryState(schema)` for typed params |
| `window.confirm()` in `useEffect` for unsaved changes | `usePrompt(message, when)` |
| Manual `<Suspense>` and `<ErrorBoundary>` wrappers | `loading` and `error` on route definition |
| Static imports for all route components | `React.lazy()` accepted in `component` and `index` |

---

## 15. Resolved implementation decisions — ✅ DONE

> **Status:** all six decisions are honored in code, including decision 4 — the built-in credential dialog and `DefaultAuthGate` ship semantic, accessible, unstyled markup only.

The following questions were raised during spec review and are now closed. These are not open for re-interpretation during implementation.

**1. Route and workspace config: factories, not `satisfies`.**
Both `routes` and `workspaces` are declared via factory functions — `defineRoutes({...})` and `defineWorkspaces({...})` — that infer the full map type and return it. This is preferred over `satisfies RouteMap` because factories are more extensible (the factory can accept options, perform runtime validation, or be augmented in future versions without touching call sites), and because TypeScript inference through `satisfies` on complex generics is fragile at the edges.

```typescript
const routes = defineRoutes({
  dashboard: { path: "/",           component: DashboardRoute },
  camera:    { path: "/camera/:id", component: CameraDetailRoute },
});

const workspaces = defineWorkspaces({
  cameraFeed: {
    component: CameraFeedWorkspace,
    auth: { type: "time-limited", expiresAt: () => Date.now() + 3_600_000 },
    schema: { cameraId: "string", label: "string" },
  } as WorkspaceTemplate<CameraFeedParams>,
});
```

**2. React version target: 18/19. Use `useSyncExternalStore`.**
`WorkspaceManager` is an external store. Use `useSyncExternalStore` for all subscriptions to it. This is the correct React 18+ approach and prevents tearing under concurrent rendering. Do not implement a custom subscription mechanism.

**3. Channel state primitive: removed.**
The `channel.state` reactive store from the earlier draft is not implemented. Persistent shared state between root and a workspace is handled by `updateParams()`. The channel (backed by chbus) handles transient messages only. See §7 for the full rationale.

**4. Auth dialog styling: unstyled, accessible markup only.**
The built-in `AuthGate` and credential dialog ship with semantic HTML and ARIA attributes but no visual CSS. The consuming application is responsible for all styling. This is consistent with the portability goal — shipping opinionated styles would require overriding them in every app.

**5. `useParams` signature: path string argument.**
The hook takes the path string as a runtime argument: `useParams("/camera/:id")`. This is preferred over `useParams<typeof routes.camera>()` because it works without importing the routes object into every component, and the path string is already the natural reference point at the call site.

**6. Communication channel: backed by `@mikrostack/chbus`.**
The per-workspace communication channel is implemented using `@mikrostack/chbus`. Each workspace gets a `NamespacedBus` scoped to `workspace:{id}`. This provides loop prevention, storm control, async emit support, and full observability via the chbus debug wiretap at no additional implementation cost. The consuming app can supply an external `Bus` instance to `AppProvider` (via the `bus` prop) to unify workspace channel traffic with any other chbus-instrumented systems in the app. See §7 for the full channel design.
