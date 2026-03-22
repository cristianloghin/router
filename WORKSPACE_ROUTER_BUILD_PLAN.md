# `@mikrostack/router` — Build Plan for Claude Code

> **How to use this document:** Read this before writing any code. Read the spec (`WORKSPACE_ROUTER_SPEC.md`) before reading this. This document governs the *order* of implementation and the *rules* for how to proceed. The spec governs *what* to build.

---

## Governing principles

**Test first, always.** For every file you create, write the test file first. The test file must compile (even if all tests fail) before you write a single line of implementation. A test that cannot compile is not a test — fix the types before moving on.

**No phase skipping.** Each phase has an exit criterion. Do not begin Phase N+1 until every test in Phase N passes. If a later phase reveals a bug in an earlier phase, fix it in the earlier phase's files, re-run those tests, and confirm they still pass before continuing.

**No mocking internal library code.** The only legitimate mocks are: external APIs (`window.history`, `window.confirm`, `BroadcastChannel`, `@mikrostack/chbus`), network, and timers. If you find yourself mocking something the library itself defines, that is a signal the dependency order is wrong — fix the order, not the test.

**One concern per test.** Each `it()` block asserts one thing. A test named "works correctly" will be rejected. Names must describe the specific behaviour being verified.

**TypeScript strict mode throughout.** `tsconfig.json` must have `"strict": true`. Type errors are build failures. Do not use `any` except where the spec explicitly permits it (workspace template internals).

**Never leave a phase with a failing test.** If a test you wrote reveals an underspecification in the spec, stop, document the ambiguity as a comment in the test file, and make the most conservative reasonable interpretation. Do not invent behaviour.

---

## Tooling setup (do this before Phase 1)

### Package initialisation

```bash
mkdir -p src/{router,workspaces/{adapters,auth,channel},components/containers,utils,provider}
npm init -y
```

### Dependencies

```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0",
    "@mikrostack/chbus": ">=1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "jsdom": "^24.0.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@mikrostack/chbus": "*",
    "tsup": "^8.0.0"
  }
}
```

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["src/test-setup.ts", "**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
```

### `src/test-setup.ts`

```typescript
import "@testing-library/jest-dom";

// Reset jsdom location before each test
beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// Silence React act() warnings in tests that intentionally don't wrap
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("act(")) return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

---

## Phase 1 — Type utilities and pure functions

**Files to create (in order):**
1. `src/utils/params.test.ts`
2. `src/utils/params.ts`
3. `src/router/matcher.test.ts`
4. `src/router/matcher.ts`

---

### 1a — Param serializer (`src/utils/params.ts`)

This is the shared serialization layer used by both `useQueryState` (router) and `WorkspaceManager` (workspaces). Build it first because both sides depend on it.

**Write tests for:**

```typescript
// Serialization — serialize(value, type) → string | string[]
serialize(42, "number")           // → "42"
serialize(true, "boolean")        // → "true"
serialize(false, "boolean")       // → "false"
serialize("hello", "string")      // → "hello"
serialize(["a","b"], "string[]")  // → ["a", "b"]  (repeated keys)
serialize([1,2], "number[]")      // → ["1", "2"]

// Deserialization — deserialize(raw, type) → typed value
deserialize("42", "number")           // → 42
deserialize("true", "boolean")        // → true
deserialize("false", "boolean")       // → false
deserialize(["a","b"], "string[]")    // → ["a", "b"]
deserialize(["1","2"], "number[]")    // → [1, 2]
deserialize(undefined, "string")      // → undefined
deserialize(undefined, "number")      // → undefined

// Round-trip — serialize then deserialize returns original value
// Test all six types with representative values

// URLSearchParams integration
// paramsToRecord(schema, searchParams) → typed object
// recordToParams(schema, values) → URLSearchParams
// Values not in schema are preserved in URLSearchParams unchanged
// Missing optional params return undefined (not default — defaults are caller's responsibility)
```

**Public interface the implementation must export:**
```typescript
type ParamType = "string" | "number" | "boolean" | "string[]" | "number[]";
type ParamSchema = Record<string, ParamType>;

function serialize(value: unknown, type: ParamType): string | string[];
function deserialize(raw: string | string[] | undefined, type: ParamType): unknown;
function paramsToRecord<TSchema extends ParamSchema>(
  schema: TSchema,
  searchParams: URLSearchParams
): Record<string, unknown>;
function recordToParams<TSchema extends ParamSchema>(
  schema: TSchema,
  values: Record<string, unknown>
): URLSearchParams;
```

---

### 1b — Path matcher (`src/router/matcher.ts`)

**Write tests for:**

```typescript
// matchPath(pattern, pathname) → { matched: boolean, params: Record<string, string> }

// Static paths
matchPath("/", "/")                    // matched: true, params: {}
matchPath("/settings", "/settings")   // matched: true, params: {}
matchPath("/settings", "/")           // matched: false
matchPath("/settings", "/settings/profile")  // matched: false (not prefix match)

// Parametric paths
matchPath("/camera/:id", "/camera/cam-4")   // matched: true, params: { id: "cam-4" }
matchPath("/camera/:id", "/camera/")        // matched: false
matchPath("/a/:x/b/:y", "/a/1/b/2")        // params: { x: "1", y: "2" }

// Wildcard
matchPath("/*", "/anything")               // matched: true, params: { "*": "anything" }
matchPath("/*", "/a/b/c")                 // matched: true, params: { "*": "a/b/c" }
matchPath("/admin/*", "/admin/users/list") // matched: true, params: { "*": "users/list" }
matchPath("/admin/*", "/other")            // matched: false

// Segment boundary enforcement
matchPath("/set", "/settings")             // matched: false  ← critical
matchPath("/settings", "/settings/")      // matched: false (trailing slash is a different path)

// buildPath(pattern, params) → string
buildPath("/camera/:id", { id: "cam-4" })      // → "/camera/cam-4"
buildPath("/a/:x/b/:y", { x: "1", y: "2" })   // → "/a/1/b/2"
buildPath("/settings", {})                      // → "/settings"

// specificity(pattern) → number  (higher = more specific)
// Static segment > parametric segment > wildcard
// /settings/profile > /settings/:section > /settings/* > /:any > /*
specificity("/settings/profile") > specificity("/settings/:section")
specificity("/settings/:section") > specificity("/settings/*")
specificity("/settings") > specificity("/:any")
// Same segment count, same specificity rank → declaration order wins (not tested here)
```

**Public interface:**
```typescript
function matchPath(
  pattern: string,
  pathname: string
): { matched: boolean; params: Record<string, string> };

function buildPath(pattern: string, params: Record<string, string>): string;
function specificity(pattern: string): number;
```

**Exit criterion for Phase 1:** `npx vitest run src/utils/params.test.ts src/router/matcher.test.ts` — all tests pass, no TypeScript errors.

---

## Phase 2 — Route registry

**Files to create (in order):**
1. `src/router/RouteRegistry.test.ts`
2. `src/router/RouteRegistry.ts`

The `RouteRegistry` validates a route map from `defineRoutes`, builds the parent graph, and exposes the ordered match chain for a given pathname. It does not render anything — that is `RouterView`'s job.

**Write tests for:**

```typescript
// Parent inference — buildParentGraph(routeMap)
// /settings is parent of /settings/profile
// /settings is parent of /settings/security
// /a/b is direct parent of /a/b/c (not /a)
// /set is NOT a parent of /settings (segment boundary)
// parent: null suppresses inference

// getMatchChain(pathname) → string[]  ordered outermost-first
// "/settings/profile" → ["/settings", "/settings/profile"]
// "/settings" → ["/settings"]  (no children matched)
// "/settings" with index → ["/settings"]  (index is resolved by RouterView, not registry)
// "/" → ["/"]
// Unknown path → []

// Specificity-based match priority
// "/settings/profile" and "/settings/:section" both match "/settings/profile"
// → "/settings/profile" wins (higher specificity)

// defineRoutes factory — runtime validation
// Non-string keys → throw
// Keys not starting with "/" → throw
// Duplicate keys → throw
// Valid map → returns frozen RouteMap

// Cycle detection
// If somehow parent graph has a cycle → throw in development
```

**Public interface:**
```typescript
function defineRoutes<TMap extends RawRouteMap>(map: TMap): RouteMap<TMap>;

class RouteRegistry {
  constructor(routes: RouteMap<any>);
  getMatchChain(pathname: string): string[];
  getParent(path: string): string | null;
  getChildren(path: string): string[];
  getAll(): string[];  // all registered path keys
}
```

**Exit criterion for Phase 2:** All Phase 1 and Phase 2 tests pass.

---

## Phase 3 — History stack

**Files to create (in order):**
1. `src/router/history.test.ts`
2. `src/router/history.ts`

The history stack sits alongside `window.history`. It tracks session-scoped entries and provides `canGoBack`.

**Write tests for:**

```typescript
// Initial state
// stack is empty, canGoBack is false

// push(path)
// adds to stack, canGoBack becomes true
// push after push → stack grows

// pop() → string | undefined
// returns and removes the top entry
// empty stack → returns undefined, canGoBack stays false

// replace(path)
// replaces top entry, stack length unchanged
// on empty stack → push behaviour (adds one entry)

// clear()
// empties stack, canGoBack becomes false

// Integration with window.history.state
// pushWithState(path, state) → stores state in window.history.state
// readState() → returns the current window.history.state
// Workspace origin storage:
//   pushWorkspaceEntry(workspaceId, originPath) stores
//     { workspaceId, origin: originPath } in history.state
//   readWorkspaceOrigin() → returns origin path or null
//   readWorkspaceId() → returns workspaceId or null
//   Both return null when history.state has no workspace entry
//   (WorkspaceManager.close() needs both: origin to navigate back, id for channel cleanup)

// canGoBack reflects stack length correctly throughout all operations
```

**Public interface:**
```typescript
class HistoryStack {
  get canGoBack(): boolean;
  push(path: string): void;
  pop(): string | undefined;
  replace(path: string): void;
  clear(): void;
  pushWorkspaceEntry(workspaceId: string, originPath: string): void;
  readWorkspaceOrigin(): string | null;
  readWorkspaceId(): string | null;
}
```

**Exit criterion for Phase 3:** All Phase 1–3 tests pass.

---

## Phase 4 — Router context and hooks

**Files to create (in order):**
1. `src/router/RouterContext.test.tsx`
2. `src/router/RouterContext.ts`
3. `src/router/hooks.test.tsx`
4. `src/router/hooks.ts`

This is the largest phase. The `RouterContext` is a `useSyncExternalStore`-compatible store. The hooks are thin wrappers over it.

### 4a — RouterContext

The store owns: current `path`, `searchParams`, `isTransitioning`, `canGoBack`, `meta`. It listens to `popstate` and exposes `navigate`, `back`, `buildPath`.

**Write tests for:**

```typescript
// Initial state reflects window.location on mount
// navigate(path) updates path state and window.location
// navigate(path, { replace: true }) uses replaceState, not pushState
// navigate(path, { params }) interpolates params into pattern
// back() calls window.history.back() and pops the stack
// back() is a no-op when canGoBack is false
// popstate event updates path state
// Workspace URLs are filtered: navigate("/workspace/x") does not update path
// buildPath("/camera/:id", { id: "cam-4" }) → "/camera/cam-4"
// meta initialises from provided value, setMeta patches it
// isTransitioning starts false
```

Use `renderHook` with a wrapper that provides the context.

### 4b — Hooks

Test each hook in isolation. The critical constraint: **each hook only re-renders when its specific slice changes.**

```typescript
// useNavigation() — stable refs
// Renders once on mount. Does not re-render when path changes.
// navigate, back, buildPath are the same function reference across renders.

// useLocation()
// Returns current path, searchParams, inWorkspace, canGoBack, isTransitioning.
// Re-renders when path changes.
// Re-renders when searchParams changes.
// Does NOT re-render when meta changes.
// inWorkspace: true when current URL matches workspaceBasePath prefix.

// useRoute("/settings")
// matched: true when path is /settings or /settings/profile (ancestor match).
// exact: true only when path is exactly /settings.
// matched: false when path is /other.
// Re-renders only when match status or params change.
// Does NOT re-render when an unrelated route changes.

// useParams("/camera/:id")
// Returns { id: "cam-4" } when path is /camera/cam-4.
// Returns {} (typed as never) when route not matched.

// useSearchParams()
// Returns [URLSearchParams, setter].
// Setter with value replaces params entirely.
// Setter with function receives previous params.
// Always uses replace navigation (does not push history entry).

// useQueryState({ page: { type: "number", default: 1 } })
// Returns [{ page: 1 }, setter] when ?page is absent (default applied).
// Returns [{ page: 3 }, setter] when ?page=3.
// Setter patches — setFilters({ page: 2 }) preserves other params.
// Setter always uses replace navigation.
// Params not in schema are preserved in URL.
// Multiple useQueryState calls with different schemas are additive.
// Overlapping keys between two calls: last-write-wins.

// useMeta()
// Returns [meta, setMeta].
// setMeta patches — does not replace the entire object.
// Re-renders when meta changes.
// Does NOT re-render when path changes.

// usePrompt("message", true)
// Calls window.confirm when navigate() is called.
// If confirm returns false, navigation is blocked.
// If confirm returns true, navigation proceeds.
// Registers beforeunload handler when when=true.
// Removes beforeunload handler when when=false.
// Removes beforeunload handler on unmount.
// window.confirm is called with the provided message string.
```

**Exit criterion for Phase 4:** All Phase 1–4 tests pass. Pay particular attention to the re-render isolation tests — use `vi.fn()` render counters inside test components.

---

## Phase 5 — `notFound()` and route boundaries

**Files to create (in order):**
1. `src/utils/notFound.test.ts`
2. `src/utils/notFound.ts`
3. `src/router/boundaries.test.tsx`
4. `src/router/boundaries.tsx`

### 5a — `notFound()`

```typescript
// notFound() throws a value
// The thrown value is identifiable: isNotFoundError(e) → true
// The thrown value is not an instance of Error (it is a sentinel, not an error)
// isNotFoundError(new Error("other")) → false
// isNotFoundError("string") → false
```

**Public interface:**
```typescript
function notFound(): never;
function isNotFoundError(value: unknown): boolean;
```

### 5b — Route boundaries (`src/router/boundaries.tsx`)

`RouteBoundary` wraps a single route component with its Suspense boundary and ErrorBoundary. It resolves the fallbacks from the route definition and the global defaults.

**Write tests for:**

```typescript
// Suspense — component that throws a Promise
// Shows loading fallback while suspended.
// Shows component output after resolution.
// Uses route-level loading if declared.
// Falls back to defaultLoading from context if no route-level loading.
// Falls back to null if neither is declared.

// ErrorBoundary — component that throws an Error
// Shows error fallback with { error, reset, path }.
// reset() clears boundary and re-renders the component.
// Uses route-level error if declared.
// Falls back to defaultError from context if no route-level error.
// Falls back to library's minimal error display if neither is declared.

// notFound() throw
// A component that calls notFound() causes RouteBoundary to invoke the
// provided onNotFound callback (RouterView will pass this through to its fallback).
// notFound() error does NOT render the route's error fallback — it is distinct.

// Independence — two RouteBoundary instances
// Error in one does not affect the other.
// Suspense in one does not affect the other.
```

**Exit criterion for Phase 5:** All Phase 1–5 tests pass.

---

## Phase 6 — `RouterView` and `<Link>`

**Files to create (in order):**
1. `src/components/RouterView.test.tsx`
2. `src/components/RouterView.tsx`
3. `src/components/Link.test.tsx`
4. `src/components/Link.tsx`

This phase requires a minimal test harness that provides `RouterContext` without a full `AppProvider`. Create `src/test-utils/RouterTestProvider.tsx` — a stripped-down provider that accepts `routes` and an initial `path` and wraps children with the router context. This is for testing only and must not be exported from the public barrel.

### 6a — RouterView

```typescript
// Basic rendering
// "/" → renders DashboardRoute
// "/settings" → renders SettingsLayout with outlet=null (no child matched)
// "/settings/profile" → renders SettingsLayout with ProfileSettings as outlet
// Unknown path with fallback → renders fallback with { path: "/unknown" }
// Unknown path without fallback → renders nothing

// Index component
// "/settings" with index declared → renders SettingsLayout with SettingsIndex as outlet

// Nested outlet chain (3 levels)
// "/a/b/c" → renders A with outlet=(B with outlet=C)

// Lazy components
// Component wrapped in React.lazy() → shows loading fallback while pending
// Resolves and shows component content
// Uses route-level loading fallback
// Falls back to defaultLoading when no route-level loading

// Error boundary per route
// Child route throws → child shows error UI, parent layout unaffected
// Parent route throws → parent shows error UI

// notFound() from route component
// RouterView renders its fallback prop

// startTransition semantics
// During lazy route load, previous route remains visible
// isTransitioning becomes true during load, false after

// Scroll restoration
// scrollRestoration="top" → window.scrollTo(0,0) called on route change
// scrollRestoration="none" → window.scrollTo not called
// scrollRestoration="restore" → position saved on leave, restored on back

// Focus management
// After route change, focus moves to [data-autofocus] element
// Falls back to RouterView container if no [data-autofocus]

// Workspace URL passthrough
// navigate("/workspace/...") does not change rendered route
```

### 6b — Link

```typescript
// Renders an <a> element
// href is built from route key + params: to="/camera/:id" params={{ id: "cam-4" }}
//   → href="/camera/cam-4"
// href for param-less route: to="/" → href="/"

// Click behaviour
// Normal click → calls navigate(), prevents default
// Cmd+click → does not call navigate(), allows default (new tab)
// Ctrl+click → does not call navigate(), allows default
// Shift+click → does not call navigate(), allows default

// Active state
// activeClassName applied when route matched (exact or ancestor)
// exactActiveClassName applied only on exact match
// Neither applied when route not matched
// activeStyle and exactActiveStyle apply style objects the same way

// replace prop → navigate called with replace: true
// state prop → navigate called with the state object

// href prop (escape hatch)
// Renders plain <a href="..."> with no click interception
// No active state logic
```

**Exit criterion for Phase 6:** All Phase 1–6 tests pass. At this point the entire router half of the library is tested and functional as a standalone unit.

---

## Phase 7 — Param serializer (complete suite)

The serializer already exists from Phase 1. This phase adds the remaining edge cases that only matter in context (workspace params, schema-driven deserialization).

**Add to `src/utils/params.test.ts`:**

```typescript
// Schema-driven deserialization
// Schema declares types; deserializer uses schema to cast correctly
// paramsToRecord with full schema: all types round-trip correctly
// Missing key with no default: field is absent from result object
// Extra key not in schema: preserved in URLSearchParams but not in result

// Array serialization edge cases
// Empty array [] → no keys in URLSearchParams (key is absent, not "")
// Single-element array ["a"] → ?key=a (one occurrence)
// Multi-element array ["a","b"] → ?key=a&key=b

// Number precision
// Large integers survive round-trip
// NaN from bad input: deserialize("abc", "number") → NaN (not undefined)
//   — callers are responsible for validation

// Boolean strictness
// deserialize("1", "boolean") → false  (only "true" → true, everything else → false)
// deserialize("TRUE", "boolean") → false  (case-sensitive)
```

**Exit criterion for Phase 7:** All Phase 1–7 tests pass, including the new edge case tests.

---

## Phase 8 — `defineWorkspaces` and workspace types

**Files to create (in order):**
1. `src/workspaces/defineWorkspaces.test.ts`
2. `src/workspaces/defineWorkspaces.ts`
3. `src/workspaces/types.ts` (no tests — pure types, validated by TypeScript compiler)

```typescript
// defineWorkspaces factory
// Returns frozen map
// Template with no auth → defaults to { type: "public" }
// Template with maxInstances → preserved in output
// Template with schema → schema is accessible on the definition
// Duplicate keys → throw

// WorkspaceDescriptor construction
// createDescriptor(template, input) → WorkspaceDescriptor
// id is a valid UUID v4
// createdAt is a Unix ms timestamp close to Date.now()
// All input fields are present on the result
```

**Exit criterion for Phase 8:** All Phase 1–8 tests pass.

---

## Phase 9 — Adapters

**Files to create (in order):**
1. `src/workspaces/adapters/StackAdapter.test.ts`
2. `src/workspaces/adapters/StackAdapter.ts`
3. `src/workspaces/adapters/SwipeAdapter.test.ts`
4. `src/workspaces/adapters/SwipeAdapter.ts`
5. `src/workspaces/adapters/BrowserTabAdapter.test.ts`
6. `src/workspaces/adapters/BrowserTabAdapter.ts`

Test each adapter in isolation. Provide a mock subscriber to capture emitted events.

### StackAdapter

```typescript
// open(descriptor) → adds to array, emits workspace:opened
// close(id, autoFocus=true) → removes from array, emits workspace:closed
//   autoFocus=true and adjacent exists → emits workspace:focused for adjacent
//   autoFocus=true and no adjacent → no workspace:focused emitted
//   autoFocus=false → no workspace:focused emitted
// focus(id) → updates currentIndex, emits workspace:focused
// updateParams(id, params) → updates descriptor in place, emits workspace:updated
// updateTitle(id, title) → updates descriptor in place, emits workspace:updated
// getAll() → returns all descriptors in order
// getCurrent() → returns descriptor at currentIndex
// open non-existent → no-op
// close non-existent → no-op
// focus non-existent → no-op
// subscribe → returns unsubscribe function; after calling it, no more events received
```

### SwipeAdapter

```typescript
// All StackAdapter tests apply (SwipeAdapter extends StackAdapter behaviour)
// getCurrentIndex() → returns currentIndex
// setCurrentIndex(n) → updates currentIndex without emitting workspace:focused
//   (this is the scroll-driven path — events are intentionally suppressed)
// setCurrentIndex out of bounds → clamps to valid range, does not throw
```

### BrowserTabAdapter

```typescript
// Mock window.open and BroadcastChannel for these tests

// open(descriptor) → calls window.open(url)
// URL format: /workspace/{template}/{id}?...params
// focus(id) → no-op (browser limitation), emits workspace:focused for local consistency
// close(currentId) → can close current tab (mock window.close)
// close(otherId) → no-op
// getCurrent() → reads id from window.location.pathname on mount
//   URL format is /workspace/{template}/{id}?...params (id is a path segment, not a query param)
//   window.location.pathname = "/workspace/cameraFeed/uuid-123" → getCurrent().id === "uuid-123"
//   window.location.pathname = "/" → getCurrent() === null
// BroadcastChannel — receiving workspace:opened → updates local workspace list
// BroadcastChannel — receiving workspace:closed → updates local workspace list
// subscribe → unsubscribe works correctly
```

**Exit criterion for Phase 9:** All Phase 1–9 tests pass.

---

## Phase 10 — WorkspaceGuard (auth)

**Files to create (in order):**
1. `src/workspaces/auth/WorkspaceGuard.test.ts`
2. `src/workspaces/auth/WorkspaceGuard.ts`

```typescript
// evaluate(rule, context) → Promise<boolean>

// public → always resolves true
// authenticated, isAuthenticated returns true → resolves true
// authenticated, isAuthenticated returns false → resolves false
// authenticated, isAuthenticated returns Promise<true> → resolves true
// time-limited, expiresAt in the future → resolves true
// time-limited, expiresAt in the past → resolves false
// time-limited, expiresAt as function → calls the function, uses result
// credential → calls validate with CredentialInput → resolves to validate's result
// custom → calls check(context) → resolves to check's result
// custom, check throws → resolves false (does not propagate the throw)

// isDirectAccess flag is passed through to custom check context
// template and params are passed through to custom check context
```

**Exit criterion for Phase 10:** All Phase 1–10 tests pass.

---

## Phase 11 — WorkspaceChannel

**Files to create (in order):**
1. `src/workspaces/channel/WorkspaceChannel.test.ts`
2. `src/workspaces/channel/WorkspaceChannel.ts`

Mock `@mikrostack/chbus` in these tests. You need to verify the wiring, not chbus's correctness.

```typescript
// createWorkspaceChannel(workspaceId, bus) → WorkspaceChannel
// Calls bus.namespace("workspace:{workspaceId}")
// Creates two channels on the namespaced bus: "root-to-ws" and "ws-to-root"

// WorkspaceChannel.inbound
// Is the "root-to-ws" channel
// .on() registers a subscriber on that channel

// WorkspaceChannel.outbound
// Is the "ws-to-root" channel
// .emit() emits on that channel

// useWorkspaceChannel(workspaceId) — root-side
// Returns { inbound: "ws-to-root", outbound: "root-to-ws" }
// Names are inverted relative to the workspace's view

// destroy(workspaceId, bus)
// Destroys the namespaced bus for that workspace
// After destroy, emitting is a no-op (chbus handles this)

// Cross-tab: when adapter type is "tabs"
// createWorkspaceChannel uses BroadcastChannel as transport
// Mock BroadcastChannel — verify messages are posted and received

// Returns null when workspaceId does not correspond to an open workspace
```

**Exit criterion for Phase 11:** All Phase 1–11 tests pass.

---

## Phase 12 — WorkspaceManager

**Files to create (in order):**
1. `src/workspaces/WorkspaceManager.test.ts`
2. `src/workspaces/WorkspaceManager.ts`

The `WorkspaceManager` is the most complex piece. Inject the adapter as a dependency so tests can use a mock adapter. Inject the navigate function and WorkspaceGuard the same way.

```typescript
// Construction
// new WorkspaceManager({ adapter, guard, navigate, bus, workspaceBasePath })
// adapter, guard, navigate are injected — not constructed internally

// open(input)
// Calls guard.evaluate() first
// If guard rejects → rejects with WorkspaceError code AUTH_FAILED
// If maxInstances reached → rejects with MAX_INSTANCES_REACHED
// If maxWorkspaces reached → rejects with MAX_WORKSPACES_REACHED
// If guard passes → calls adapter.open(descriptor)
// Calls navigate(url, { state: { origin, workspaceId } })
// Creates WorkspaceChannel for the workspace
// Resolves with WorkspaceDescriptor
// URL format: /workspace/{template}/{id}?title=...&{...params}
// Params serialized using utils/params with template schema

// focus(id)
// Workspace not found → rejects with WORKSPACE_NOT_FOUND
// Found → calls adapter.focus(id)
// Calls navigate(url)
// Resolves with WorkspaceDescriptor

// close(id, autoFocus=true)
// Workspace not found → rejects with WORKSPACE_NOT_FOUND
// Found → calls adapter.close(id, autoFocus)
// Reads origin from window.history.state
// Calls navigate(origin) to restore origin route
// Destroys WorkspaceChannel for the workspace
// Resolves

// updateParams(id, params)
// Workspace not found → throws WORKSPACE_NOT_FOUND (sync — not async)
// Found → calls adapter.updateParams(id, params)
// Calls navigate(newUrl, { replace: true })
// Returns updated WorkspaceDescriptor

// updateTitle(id, title)
// Calls adapter.updateTitle(id, title)
// Returns updated WorkspaceDescriptor

// getAll() → delegates to adapter.getAll()
// getCurrent() → delegates to adapter.getCurrent()

// subscribe(listener) → delegates to adapter.subscribe()
// Returns unsubscribe function

// Event passthrough: workspace:opened, workspace:closed, workspace:focused,
//   workspace:updated, workspace:synced all pass from adapter through to subscribers

// WorkspaceError codes tested exhaustively
```

**Exit criterion for Phase 12:** All Phase 1–12 tests pass.

---

## Phase 13 — Workspace hooks

**Files to create (in order):**
1. `src/workspaces/hooks.test.tsx`
2. `src/workspaces/hooks.ts`

Use a real `WorkspaceManager` (not mocked) with a real `StackAdapter` and a mock navigate function. Pass the mock navigate into `WorkspaceManager` at construction the same way Phase 12 does — the hooks do not construct their own manager.

```typescript
// useWorkspaces()
// Returns workspaces array, current, adapterType, open, focus, close, updateParams, updateTitle
// open() triggers re-render with new workspace in list
// close() triggers re-render with workspace removed from list
// focus() triggers re-render with current updated
// updateParams() triggers re-render with updated params
// adapterType matches the adapter provided

// useWorkspace(id)
// Returns { workspace, params, channel } for a known id
// Returns null for an unknown id
// Re-renders when workspace:updated fires for this id
// Does NOT re-render when a different workspace is updated

// useWorkspaceChannel(workspaceId)
// Returns { inbound, outbound } for an open workspace
// Returns null for a closed/unknown workspace
// Becomes null after the workspace is closed
```

**Exit criterion for Phase 13:** All Phase 1–13 tests pass.

---

## Phase 14 — AppProvider integration

**Files to create (in order):**
1. `src/provider/AppProvider.test.tsx`
2. `src/provider/AppProvider.tsx`
3. `src/provider/context.ts`

This phase wires the router and workspace systems together for the first time. The tests cover the boundary conditions between them.

```typescript
// Workspace URLs don't affect route rendering
// navigate("/workspace/x/y") → rendered route stays unchanged

// bus prop
// If provided, WorkspaceManager uses that bus for channels
// If absent, WorkspaceManager creates an internal bus

// onBeforeNavigate
// Called before route navigate()
// Called before workspace open/focus/close navigations
// cancel() blocks the navigation
// Blocked navigation does not call onNavigate

// onNavigate
// Called after successful route navigation
// Called after workspace operations that navigate
// Not called when navigation is cancelled
// NavigationEvent.from is null on initial load
// NavigationEvent.type is "push" / "replace" / "back" / "workspace-open" / "workspace-close"

// defaultLoading
// Applied to routes without a route-level loading declaration
// Route-level loading overrides defaultLoading

// defaultError
// Applied to routes without a route-level error declaration
// Route-level error overrides defaultError

// auth.isAuthenticated
// Called when a workspace with auth: { type: "authenticated" } is opened
// Called when a workspace URL is accessed directly (tabs adapter)

// Single provider — no WorkspaceProvider or Router wrapper needed
// All hooks accessible below AppProvider
```

**Exit criterion for Phase 14:** All Phase 1–14 tests pass.

---

## Phase 15 — Containers

**Files to create (in order):**
1. `src/components/containers/StackContainer.test.tsx`
2. `src/components/containers/StackContainer.tsx`
3. `src/components/containers/SwipeContainer.test.tsx`
4. `src/components/containers/SwipeContainer.tsx`
5. `src/components/containers/TabsContainer.test.tsx`
6. `src/components/containers/TabsContainer.tsx`

Containers test observable behaviour. Use `@testing-library/user-event` for click interactions. Mock scroll events where needed.

**Note on jsdom and scroll:** jsdom does not implement `scrollTo` or `scrollLeft`/`scrollTop` layout. For `SwipeContainer`, mock `Element.prototype.scrollTo` and assert it was called with the expected position rather than testing actual scroll behaviour. Similarly, the "programmatic focus scrolls container" test must verify the call, not the resulting scroll position.

```typescript
// StackContainer
// Renders all open workspaces using render() from useWorkspaces
// Clicking focus button calls workspaces.focus(id) → navigate called
// Clicking close/root button calls close() → navigate to origin route
// New workspace appears in rendered output after open()
// Closed workspace disappears from rendered output

// SwipeContainer
// Same focus/close/root behaviour as StackContainer
// Scroll event fires → setCurrentIndex called on adapter
//   (not focus() — no navigate on scroll)
// Programmatic focus (via focus()) → scrolls container to workspace position
//   Verified by asserting scrollTo was called, not by measuring layout

// TabsContainer
// Renders current workspace only (this tab's workspace)
// Shows workspace list for navigation
// Clicking another workspace calls focus() (no-op for tabs, but fires event)
// No root navigation button (tabs have their own browser back)
```

**Exit criterion for Phase 15:** All Phase 1–15 tests pass.

---

## Phase 16 — Public API barrel and build

**Files to create:**
1. `src/index.ts`
2. `tsup.config.ts`

### `src/index.ts`

Export everything the public API requires. Nothing more.

```typescript
// From router:
export { defineRoutes } from "./router/RouteRegistry";
export { useNavigation, useLocation, useRoute, useParams,
         useSearchParams, useQueryState, useMeta, usePrompt } from "./router/hooks";
export { notFound } from "./utils/notFound";

// From workspaces:
export { defineWorkspaces } from "./workspaces/defineWorkspaces";
export { useWorkspaces, useWorkspace, useWorkspaceChannel } from "./workspaces/hooks";

// From provider:
export { AppProvider } from "./provider/AppProvider";

// From components:
export { RouterView } from "./components/RouterView";
export { Link } from "./components/Link";

// Types only — no runtime value:
export type { RouteDefinition, RouteComponentProps, RouteErrorProps,
              RouteMap, NavigationEvent, NavigationType } from "./router/types";
export type { WorkspaceTemplate, WorkspaceDescriptor, WorkspaceParams,
              WorkspaceAuthRule, WorkspaceChannel, WorkspaceComponentProps,
              OpenWorkspaceInput } from "./workspaces/types";
export type { AppProviderProps, AppConfig } from "./provider/AppProvider";
export type { RouterViewProps } from "./components/RouterView";
export type { LinkProps } from "./components/Link";
export type { QueryParamSchema, QueryParamDescriptor } from "./utils/params";
```

Do not export: internal context objects, adapter classes, `RouteRegistry`, `HistoryStack`, `WorkspaceManager`, `WorkspaceGuard`, `RouteBoundary`, test utilities, `isNotFoundError`.

### Build validation

```bash
npx tsc --noEmit          # must exit 0
npx vitest run            # must exit 0, all tests pass
npx tsup                  # must produce dist/index.js, dist/index.cjs, dist/index.d.ts
```

**Exit criterion for Phase 16:** All three commands exit 0. No TypeScript errors. No test failures.

---

## Phase 17 — End-to-end integration tests

**Files to create:**
1. `src/__tests__/fleet-monitoring.test.tsx`
2. `src/__tests__/nested-routes.test.tsx`
3. `src/__tests__/workspace-auth.test.tsx`
4. `src/__tests__/workspace-channel.test.tsx`

These tests use the full public API — `AppProvider`, `defineRoutes`, `defineWorkspaces`, `RouterView`, hooks — with no internal imports. They validate that the pieces compose correctly in realistic scenarios.

### fleet-monitoring.test.tsx

Implements the fleet monitoring scenario from §13 of the spec:

```typescript
// Full bootstrap — AppProvider with routes and workspaces renders without error

// Route navigation
// Clicking a Link navigates correctly
// useParams returns correct typed params for /camera/:id

// Workspace open
// open({ template: "cameraFeed", ... }) renders the workspace
// URL changes to /workspace/cameraFeed/{id}?...
// Route component stays rendered alongside workspace

// Workspace close
// close(id) navigates back to the origin route
// URL returns to the origin path
// Workspace no longer in useWorkspaces().workspaces

// Channel messaging
// Workspace sends a message → root receives it via useWorkspaceChannel
// Root sends a message → workspace receives it via channel.inbound.on()

// updateParams
// updateParams(id, { alertIds: ["a","b"] }) → URL updates with new params
// useWorkspace(id).params reflects the new values
// History is not pushed (URL replaced in place)
```

### nested-routes.test.tsx

```typescript
// /settings renders SettingsLayout with outlet=null (no index declared)
// /settings with index → outlet is SettingsIndex
// /settings/profile → outlet is ProfileSettings, SettingsLayout visible
// /settings/security → outlet is SecuritySettings, SettingsLayout visible
// Navigating /settings/profile → /settings/security → SettingsLayout not remounted
//   (verify with a render counter or ref)
// Lazy child → shows loading fallback → resolves → shows component
// Error in child → child shows error UI → parent layout unaffected
// reset() in error UI → re-renders the child

// parent: null suppresses nesting
//   /orphan declared with parent: null even though /orphan/child exists
//   Navigating to /orphan/child → renders OrphanChildRoute directly
//     (not nested inside OrphanRoute)
```

### workspace-auth.test.tsx

```typescript
// public workspace → open() succeeds without isAuthenticated check
// authenticated workspace, isAuthenticated=true → open() succeeds
// authenticated workspace, isAuthenticated=false → open() rejects with AUTH_FAILED
// time-limited workspace, not expired → open() succeeds
// time-limited workspace, expired → open() rejects with AUTH_FAILED
// credential workspace → validate called with CredentialInput
//   validate returns true → open() succeeds
//   validate returns false → open() rejects with AUTH_FAILED
// Direct URL access for authenticated workspace, not authenticated
//   → AuthGate renders instead of workspace component
//   → retry() with valid credentials → workspace component renders
```

### workspace-channel.test.tsx

```typescript
// Workspace emits on outbound → root receives via useWorkspaceChannel inbound
// Root emits on outbound → workspace receives via channel.inbound
// After close(), channel is destroyed
//   → subsequent emit is no-op (no error thrown, no message received)
// Two workspaces open → channels are independent
//   → message to workspace A does not reach workspace B
// External bus provided to AppProvider
//   → workspace channel traffic visible on that bus via onDebug
```

**Final exit criterion:** All 17 phases complete. `npx vitest run --coverage` reports 100% line coverage on all files in `src/` except `src/test-setup.ts` and `src/test-utils/`. Coverage below 100% on any implementation file is a defect — write the missing test, not a coverage exclusion.

---

## Rules for Claude Code during implementation

1. **Read the spec section before writing any test for that section.** Do not rely on this build plan's test descriptions alone — they are a guide to what to test, not a complete specification of behaviour.

2. **If a test description here conflicts with the spec, the spec wins.** Flag the conflict as a comment and implement what the spec says.

3. **Do not create helper abstractions prematurely.** If two tests need the same setup, extract a `describe`-level `beforeEach`. Do not create a shared test utility file until at least three test files need the same thing.

4. **Commit after each phase exit criterion is met.** The commit message is `phase N: <one-line description>`. Do not bundle multiple phases into one commit.

5. **If a phase takes more than ~300 lines of implementation to pass its tests, the phase is doing too much.** Stop, re-read the spec, and check whether the implementation is solving a problem that a later phase should handle. **Exception:** Phase 12 (`WorkspaceManager`) is expected to exceed this threshold — it is the integration point for auth, channels, adapters, URL construction, and navigation. Its scope is justified by the spec.

6. **Type inference over type assertion.** Never write `as SomeType` in implementation code unless the spec explicitly requires it (e.g. workspace template internals). If TypeScript can't infer it, the generic constraints need fixing — fix them.

7. **`console.log` and `console.debug` are forbidden in implementation code.** Use them freely in tests during development, but remove them before the phase exit criterion check.
