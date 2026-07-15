# DEV.md — maintainer notes

Internal reference for developing `@mikrostack/router`. User-facing docs live in
[README.md](README.md). This file records what the code can't: design decisions,
invariants, known quirks, and workflows.

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
| `router/RouterContext.ts` (`RouterStore`) | URL state, history stack, popstate, guards/prompt hooks, imperative `navigate()` singleton |
| `router/RouteRegistry.ts` | route map validation, parent inference, matching |
| `components/RouterView.tsx` | route rendering, per-route boundaries, transitions (`startTransition` over mirrored state), loading/error fallback chain |
| `workspaces/WorkspaceManager.ts` | workspace lifecycle, auth evaluation, **URL construction** (`buildUrl`), origins, channels, persistence |
| `workspaces/adapters/*` | layout state only — adapters never build or touch URLs (exception: `BrowserTabAdapter` builds its own URL for `window.open`, since it can't defer to the manager's navigate) |
| `workspaces/channel/` | per-workspace chbus channel pairs; cross-tab bridging |

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
- **`updateParams` is a partial merge** (fixed 2026-07-14 — adapters replace,
  the manager merges) and only syncs the URL when the workspace is focused.
- **`RouterStore` lives in a ref but is destroyed in an effect cleanup** — so
  `destroy()` must stay reversible (`attach()` re-registers popstate) or
  StrictMode's simulated unmount permanently deafens the router. Regression
  tests in `AppProvider.test.tsx` cover this.
- **Channels**: `NamespacedBus` scoped `workspace:{id}`, created at `open()`,
  destroyed before `adapter.close()` resolves, recreated on persistence
  restore. Under tabs, emits mirror over `BroadcastChannel`
  (`chbus:workspace:{id}`); remote re-emits bypass the bridge (loop-safe).
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
  chrome via `renderWorkspace` and drive focus/close via `useWorkspaces()`.
- **No bus-exposure hook** (`useAppBus`) — apps keep their own chbus bus and
  may pass it via the `bus` prop for unified logging; deeper coupling rejected.
- **No `setPrevious`/`getPrevious`** — per-workspace origins + the stable
  router path cover it.
- **Out of scope**: runtime adapter switching, persisted-state migration,
  animated route transitions, SSR, React Native.

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
