# DEV.md — maintainer notes

Internal reference for developing `@mikrostack/router`. User-facing docs live in
[README.md](README.md). This file records what the code can't: design decisions,
invariants, known quirks, and workflows. Planned work (parity gaps found during
the vms-frontend adoption assessment, plus proposed features) is tracked in
[ROADMAP.md](ROADMAP.md).

> Historical note: the library was originally built against a full written spec
> (`WORKSPACE_ROUTER_SPEC.md`) and a pre-adoption change plan. Both were fully
> implemented and deleted in favor of this file — see git history if you need
> the archaeology.

---

## Architecture

**Core thesis:** app routes and workspaces are both answers to *"what do I
render for this URL?"* They differ in cardinality (one route instance vs. many
workspace instances), persistence, and layout. The library models them as one
navigation graph with two node types, and **navigation is owned by the
library**: `open()`, `focus()`, `close()`, and `updateParams()` navigate
internally — callers never follow up with `navigate()`.

Module ownership:

| Module | Owns |
|---|---|
| `router/RouterContext.ts` (`RouterStore`) | URL state, history stack, popstate, guards/prompt hooks, imperative `navigate()` singleton, app base-path translation (`toInternal`/`toExternal`) |
| `router/RouteRegistry.ts` | route map validation, parent inference, matching |
| `components/RouterView.tsx` | route rendering, per-route boundaries, transitions (`startTransition` over mirrored state), loading/error fallback chain |
| `workspaces/WorkspaceManager.ts` | workspace lifecycle, auth evaluation, **URL construction** (`buildUrl`), origins, channels, persistence |
| `workspaces/adapters/*` | layout state only — adapters never build or touch URLs (exception: `BrowserTabAdapter` builds its own URL for `window.open`, since it can't defer to the manager's navigate — and so is also the one adapter that applies the app base itself) |
| `workspaces/channel/` | per-workspace chbus channels — the app-contract pair, the router-owned `lifecycle` channel, cross-tab bridging |

## Invariants (break these and tests will tell you)

- **Workspace URLs are transparent to `RouterStore`** — while a workspace URL
  is current, `useLocation().path` remains the last route path and
  `inWorkspace` is true. Origins captured at `open()` are therefore always
  route paths, never workspace URLs.
- **Tabs adapter never touches the launching tab's URL** (`urlBound` guard in
  the manager): workspace content renders *only* in the workspace's own browser
  tab; the launching tab renders `children` + a strip. Direct URL access
  *adopts* the descriptor (`resolveDirectAccess` → `adapter.open` skips
  `window.open` for its own URL — spawning there would popup-loop).
- **`close()` replaces** the workspace URL with the origin and leaves the
  session stack untouched — `canGoBack` reflects the pre-open state.
  Consequence: the origin entry and the replaced entry are identical, so the
  first browser-back after close is a visual no-op. Known, accepted.
- **Swipe scroll→URL sync always uses `replace`**, never push (per-swipe pushes
  are history spam). Programmatic `open`/`focus` keep push semantics. Settling
  also never emits `workspace:focused` (`SwipeAdapter.setCurrentIndex`).
- **`workspace:current-changed` is view state; `workspace:focused` is a
  navigation act** (history semantics attach to the latter only) — which is
  why the settle path emits the former and never the latter.
  `WorkspaceManager.notifyCurrentChanged()` is the single transition point:
  called after `open`/`focus`/`close` and by `SwipeContainer` after a settle,
  it compares the adapter's current against the last observed one and emits
  only on a real move, so settling on the already-current workspace emits
  nothing. Settling on the root page reports `workspaceId: null` via
  `SwipeAdapter.setCurrentToRoot()` — distinct from `setCurrentIndex(-1)`,
  which clamps into range: the root page is a real state, so
  `useWorkspaces().current` is null there while the deck stays open.
- **View state is a level, not an edge** — consumers drive "is this workspace
  in view?" off the reactive `useWorkspaces().current`, *not* off the
  lifecycle edges below. Both containers mount **every** open workspace at
  once (only one is current), and the first `view_entered` is emitted inside
  `open()` before a workspace component's subscribe effect runs — so an
  edge-only consumer both misses its own first event and leaves off-screen
  neighbours running.
- **The `lifecycle` channel is router-owned and emit-only** — a third channel
  in the `workspace:{id}` namespace on the app-provided bus carrying
  `view_exited`/`view_entered`, emitted exited-strictly-before-entered so a
  consumer can release a resource before the next workspace claims one.
  Deliberately absent from `WorkspaceChannel` and `useWorkspaceChannel()`:
  apps subscribe by name off their own bus (chbus channels are get-or-create),
  which is why the typed surface buys nothing until a call site needs it.
  Never bridged over the cross-tab BroadcastChannel — `bridgeEmit` wraps only
  the app-contract pair, so the exclusion needs no guard. The channel lives
  only between `open()` and `close()`; a closing workspace's channel is
  destroyed *before* the current shifts, so it receives no `view_exited`.
- **`updateParams` is a partial merge** (fixed 2026-07-14 — adapters replace,
  the manager merges) and only syncs the URL when the workspace is focused.
- **`open()` dedupes by default (focus-or-open)**: a live workspace with the
  same template and deep-equal params is `focus()`ed and `open()` resolves
  with the **existing** descriptor — workspace state in the input (`title`)
  is ignored on match, no merge, no update. **`origin` is a navigation
  directive, not workspace state, and IS honored on match** (fixed
  2026-07-16): the current entry is replaced with it before focusing and
  the stored origin moves with it, so a launcher route drops out of history
  whether the workspace is created or refocused. Arrays compare
  order-sensitively (`{streamIds: [1,2]}` ≠ `{streamIds: [2,1]}` — tile
  order is meaningful). The match check runs **before** the instance-limit
  checks: a match creates nothing, so `maxInstances`/`maxWorkspaces` don't
  apply to it. Consequence: **params are identity** — view-state must not
  creep into param schemas or dedup silently mismatches.
- **Every path inside the library is base-free.** With `config.basePath` set
  (app served from a sub-path), route keys, `matchPath`/`buildPath`,
  `HistoryStack` entries, workspace origins, persisted state,
  `WorkspaceManager.buildUrl()` output and every path on `RouterState` are all
  *internal* — absolute from `/`, no base. The base exists only in the address
  bar: `toExternal` is applied at the `pushState`/`replaceState`/`window.open`
  URL argument and nowhere else, `toInternal` at every
  `window.location.pathname` read and nowhere else. `toInternal` passes a
  pathname outside the base through unchanged (the app isn't mounted there);
  a mid-segment prefix like `/PlannerX` under base `/Planner` is not stripped.
- **`isWorkspacePath` takes internal paths only** — the app base and the
  workspace prefix compose in exactly one order: strip the base, *then* test.
  Its call sites split accordingly: `RouterContext`'s constructor, its
  popstate handler and `AppProvider`'s route-guard `makeContext` all strip
  first; the call inside `navigate()` receives an already-internal
  `resolvedPath` and must not. Two sites look like they need translating and
  deliberately don't: that `navigate()` call, and `setSearchParams`, which
  echoes the address bar's own path back to clear the query string —
  rewriting it to `toExternal(state.path)` would clobber the bar off a
  workspace, since `state.path` holds the retained *route* path there.
- **`RouterState.path` is a pathname — never a query or a fragment.** It is
  what `RouterView`, `useRoute`, `getMatchChain` and every guard match on, so
  a query smuggled into it matches no route at all. `navigate()` therefore
  splits its target once, up front: `resolvedPath` (whole) is what reaches
  `pushState`, `routePath = pathnameOf(resolvedPath)` is what reaches the
  workspace test, the guard, `NavigationEvent.to`, `previousPath`, the
  `HistoryStack` and `state.path`. `commitNavigation` re-derives the same
  split, so both entry points agree. The other three writers of `path` — the
  constructor, `handlePopState` and `back()` — are pathname-clean by
  construction (`window.location.pathname`, or a stack entry that was).
  `state.searchParams` is read back off the address bar *after* the push
  rather than from the split, because `pushState` applies synchronously and
  the bar is then authoritative whether the query arrived on the target or was
  already there. `Link` splits too, but only for active-state matching — its
  `href` and its `store.navigate()` call both keep the query.
- **`Link` carries both forms of one path** — the anchor's `href` is external
  (middle-click, "copy link address" and hover preview read a real URL), the
  `store.navigate()` call on click is internal. Translating once and reusing
  it double-applies the base.
- **Every entry into a route consults `routeGuard`** — `navigate()`,
  `handlePopState`, and `evaluateInitialRoute()` for the launch route. The
  third exists because the `RouterStore` constructor finishes *before*
  AppProvider wires `routeGuard`, so the store cannot guard its own initial
  state; AppProvider calls it synchronously at the end of its init block,
  which is still before `RouterView` first renders — that ordering is what
  keeps a guarded route from flashing on screen ungated, so do not move the
  call into an effect. The popstate and navigate arms need no render state:
  a route is already on screen, so they withhold the commit while an async
  verdict settles and the current route stays visible. Only the initial match
  has nothing to show, hence `RouterState.initialGuard`
  (`"resolved" | "pending" | "blocked"`), which `RouterView` renders as the
  loading chain or the not-found fallback. It defaults to `"resolved"`, so a
  store without a wired guard — every test harness — behaves as it always did.
  Known edge, deliberately not handled: if an initial guard redirects to a
  route that is itself blocked, the app stays on the loading state. That is
  the safe failure mode for a guard cycle, and the cycle is the app's bug.
- **`RouterView` tracks the store directly until the first route commits.**
  The mirrored `path` + `startTransition` exist so a lazy route can load with
  the *previous* route still visible. On a cold load there is no previous
  route, and the mirror is actively harmful: when an initial guard resolves by
  redirecting, the mirror still holds the guarded path for one frame, which
  would commit the gated component after the guard rejected it.
  `hasRenderedRouteRef` gates the handover — before the first route renders,
  `path` is `storePath`; after, it is the mirror. Regression test:
  "redirects without ever showing the guarded route".
- **`HistoryStack` is entries + a cursor, not a push/pop stack** — the
  browser's back and forward move a cursor, and a stack can only be walked one
  way (roadmap P3). `entries[index]` is the path showing now, so `push`
  records the *destination*, not where you came from. popstate carries no
  direction, so each entry is stamped with its index under
  `__mksRouterIndex`, merged into (never replacing) the app's `navigate`
  `state`; an entry with no stamp predates the router and reads as index 0.
  Workspace pushes reuse the *current* index rather than advancing, which is
  what keeps `canGoBack` reading the same before a workspace opens and after
  it closes (spec §4.13) while still stamping a real browser entry. `back()`
  stays optimistic — it sets `path` from `peekBack()` before the browser's
  popstate arrives — and the echoing popstate then reads the same index, so
  the two agree rather than double-applying.
- **Every exit from a route consults `onPrompt`** — `navigate()` (`:134`),
  `back()` (`:248`) and `handlePopState` (`:344`). The popstate arm is the
  awkward one: the event fires *after* the URL has moved, so a refusal is
  undone by re-pushing the entry the user tried to leave, rebuilt from
  `state.path` + `state.searchParams` (nothing has mutated them yet). Two
  exemptions are deliberate, not oversights — leaving a workspace URL
  (workspace navigation is prompt-exempt everywhere, and `state.path` holds
  the retained *route* path there, not what was in the address bar), and
  query-only changes, matching `setSearchParams` (both sides of that
  comparison are pathnames — see the invariant below).
  `back()` does not double-prompt: it sets `state.path` synchronously, so the
  browser's echoing popstate sees an unchanged path and falls through — the
  same `isRouteChange` test also stops it re-running the guard.
  Order inside the handler is load-bearing: workspace check → prompt → guard →
  commit. The prompt is the user's decision and comes first; a guard that
  refuses after the user already confirmed would waste the confirmation.
- **`RouterStore` lives in a ref but is destroyed in an effect cleanup** — so
  `destroy()` must stay reversible (`attach()` re-registers popstate) or
  StrictMode's simulated unmount permanently deafens the router. Regression
  tests in `AppProvider.test.tsx` cover this.
- **Channels**: `NamespacedBus` scoped `workspace:{id}`, created at `open()`,
  destroyed before `adapter.close()` resolves, recreated on persistence
  restore. Under tabs, emits mirror over `BroadcastChannel`
  (`chbus:workspace:{id}`); remote re-emits bypass the bridge (loop-safe).
- **Workspace hooks split by subscribing vs. non-subscribing** (not state vs.
  actions): `useWorkspaces()` returns only the snapshot
  `{ workspaces, current, adapterType }`; `useWorkspaceActions()` never
  re-renders, is referentially stable, and carries `getAll()`/`getCurrent()`
  for handler-time reads. `workspaces` is a discriminated union over
  registered templates (`WorkspaceUnion`) — `.filter((w) => w.template ===
  "x")` narrows via TS ≥ 5.5 inferred predicates (verified: the inference
  survives `WorkspaceDescriptor`'s shape, see `typed-routes.test.ts`).
- **`useWorkspaces(selector, isEqual?)` caches the selected value per
  snapshot identity** (hand-rolled `with-selector` equivalent — the library
  keeps zero runtime deps). The hook implementation is typed against the
  loose template map so `src/` compiles identically with or without a
  `Register` augmentation in scope (the playground compiles src/ with one).
  Documented footgun: a selector returning a fresh collection under the
  default `Object.is` skips nothing — `shallowEqual` is exported for that.
- **Persistence**: localStorage key `ws:v{version}` (localStorage, not
  sessionStorage — workspaces must survive a PWA being closed and reopened);
  version mismatch discards (no migration by design). Persistence is
  per-template: `persistent: false` in `defineWorkspaces` keeps a template
  ephemeral — excluded from writes (including `currentId` and origins) and
  dropped on restore if the flag changed between app versions.

## Deliberate decisions (rejected or constrained on purpose)

- **`adapter: "auto"` never selects tabs** — `window.open` UX must be an
  explicit opt-in. Auto = swipe (coarse pointer) or stack.
- **`onBeforeNavigate`'s `cancel()` on a workspace navigation blocks only the
  URL change** — the adapter mutation has already happened by then.
- **Containers are headless** — no injected buttons or UI copy; apps supply
  chrome via `renderWorkspace` and drive focus/close via
  `useWorkspaceActions()`.
- **No bus-exposure hook** (`useAppBus`) — apps keep their own chbus bus and
  may pass it via the `bus` prop for unified logging; deeper coupling rejected.
- **No per-call `match` callback on `open()`** — identity is a property of
  the template, not the call site; per-call matchers would let two call
  sites give the same template different identity semantics, defeating
  dedup. If a template's identity ever diverges from its full params, the
  extension point is a per-template declaration in `defineWorkspaces`
  (e.g. `identity: ["streamId"]`), added additively then. Likewise no
  `allowDuplicate` escape hatch until a call site needs one.
- **No `setPrevious`/`getPrevious`** — per-workspace origins + the stable
  router path cover it.
- **Out of scope**: runtime adapter switching, persisted-state migration,
  animated route transitions, SSR, React Native.

## Planned (specced, not yet built)

Design agreed before code, per house rules. Delete each entry when it ships;
move any surviving invariants up into the sections above.

Nothing specced right now.

## Known quirks / gaps (candidates for future work)

- Duplicate route keys can't be detected — object-literal keys overwrite each
  other before `defineRoutes` runs.
- `defineRoutes`'s `RawRouteMap` constraint means the README's
  `RouteComponentProps<{ id: string }>` props pattern **does not typecheck**;
  components read typed params via `useParams("/users/:id")` instead (library
  tests dodge with `ComponentType<any>`). A per-key generic constraint (like
  `defineWorkspaces` uses) would fix it but has variance fallout.
- `ExtractParams` doesn't extract `*`, and `buildPath` doesn't interpolate
  wildcards — concrete wildcard paths are unreachable through the typed
  `Link`/`navigate` surface; use the untyped `navigate(to: string)` overload.
- `open()` requires `title` at the type level even when the template declares
  `defaultTitle`, so `defaultTitle` is effectively dead.
- `WorkspaceTemplate.defaultTitle`'s callback param isn't contextually inferred
  from `schema` (needs explicit annotation).

## Development

- `npm test` / `npm run test:watch` / `npm run test:coverage` — vitest + jsdom.
- `npm run typecheck` — src only; the playground has its own tsconfig
  (`npx tsc -p playground/tsconfig.json`).
- `npm run playground` — Vite app at `localhost:5199` consuming the library
  straight from `src/` with HMR; exercises the whole API surface in a real
  browser. See [playground/README.md](playground/README.md).
- Node ≥ 20.19 (Vite 7); CI uses Node 24.

## Releasing

package.json `version` is the source of truth (`.github/workflows/publish.yml`):

1. Bump `version` in a PR to `main` (patch = fixes only; minor = any behavior
   change while pre-1.0, since `^0.x` ranges auto-upgrade patches).
2. Merge. CI runs typecheck + tests, then publishes to npm (OIDC) **only if
   that version isn't on the registry yet**, pushes the `vX.Y.Z` tag, and
   creates the GitHub release with generated notes.
3. Merges without a version bump publish nothing. Never push `v*` tags
   manually — tags are artifacts of a release, not its trigger.
