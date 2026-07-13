# @mikrostack/router — pre-adoption change plan

**Repo:** `/Users/cristianloghin/Documents/_Projects/router` · **Package:** `@mikrostack/router` v0.0.1 (unpublished)
**Goal:** make the library ready to replace the `router` and `workspaces` modules in the local-vms frontend (`local-vms/apps/frontend`) — through **generic APIs only**, no app-specific behavior baked in.

---

## Context

The library unifies browser routing and workspace navigation into one navigation graph (see `WORKSPACE_ROUTER_SPEC.md` in the repo). The consuming app is a touch-first VMS "On-Board Monitor" UI (React 19 + Vite) whose central UX is a **swipeable deck of workspaces with the dashboard as page zero**, and whose video player communicates over a `@mikrostack/chbus` bus namespaced per workspace id.

**Current library state (verified):** all 443 tests pass (27 files); `tsup` build (ESM/CJS/DTS) is clean; `tsc --noEmit` fails only in test files (mock components typed as plain `div`s where `RouteComponentProps` is expected — fix in passing or accept).

A gap analysis against the app produced the changes below. Items 1–4 are bug fixes / spec completion; item 5 is the substantive design work; item 6 records what was **deliberately rejected**.

---

## 1. `Link`: forward standard anchor attributes and events

**File:** `src/components/Link.tsx`

`LinkToProps` currently whitelists a handful of props; everything else is dropped. The consuming app's design-system `Button` renders `Link` with `onTouchStart` (touch ripple) and `onClick` — both silently lost today.

- Extend both prop variants with `Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">` and spread the rest onto the `<a>`.
- Compose click handling: run the user's `onClick` **first**; if it called `e.preventDefault()`, skip router navigation. Keep the existing modifier-key passthrough (meta/ctrl/shift/alt).
- Apply the same spread to the `href` escape-hatch variant.
- Tests: user `onClick` fires before navigation; `preventDefault` blocks navigation; arbitrary props (`onTouchStart`, `target`, `data-*`, `aria-*`) reach the DOM.

## 2. Wire the imperative `navigate()` export (currently a silent no-op)

**File:** `src/provider/AppProvider.tsx` (+ `src/router/RouterContext.ts`)

`RouterContext.ts` exports `navigate()` backed by a module-level `_store`, set via `setActiveStore()` — but **nothing ever calls `setActiveStore`**, so the export can never work.

- `AppProvider`: call `setActiveStore(store)` during init and `setActiveStore(null)` in the unmount cleanup.
- Test: `navigate()` from outside React navigates once a provider is mounted; is a no-op after unmount.

## 3. Upgrade chbus to 0.3.x — not just a peer-range widening

**Files:** `package.json`, affected test files

The library pins `@mikrostack/chbus ^0.1.2`; the app uses **0.3.1**. This is a **breaking API change**, verified by diffing the two `.d.ts` files:

- `Channel.on(action, handler, options?: { signal })` — handlers are now async `(payload, meta, signal) => Promise<void>`; the sync `Subscriber` type and `onAsync` are gone.
- `emit()` now returns `Promise<SettledResult[]>`; `emitAsync` is gone.
- Additions: `Mailbox`, `combineSignals`, logger `exclude`/`predicate` options.

Library **source** is unaffected — it only calls `createBus()`, `bus.namespace()`, `ns.channel()`, `channel.destroy()` (`AppProvider.tsx`, `workspaces/channel/WorkspaceChannel.ts`). The `.emit(` hits in adapters are the adapters' own event emitter, not chbus.

- Bump devDependency and peerDependency to `^0.3.1`. (If the private registry is unreachable, install from the app's vendored copy at `local-vms/apps/frontend/node_modules/@mikrostack/chbus`.)
- Fix test files that subscribe/emit on channels: handlers may need `async`, and TS will reject sync `() => void` handlers where `Promise<void>` is required (`workspaces/channel/WorkspaceChannel.test.ts`, `workspaces/WorkspaceManager.test.ts`, `workspaces/hooks.test.tsx`, `__tests__/workspace-channel.test.tsx`).

## 4. Implement workspace persistence (spec'd, currently dead config)

**Files:** `src/workspaces/WorkspaceManager.ts`, `src/provider/AppProvider.tsx`

`AppConfig.persistWorkspaces` / `persistVersion` are declared but read nowhere; there is zero storage code in `src/`. Spec (§5.3, "Persistence versioning"): serialize to **sessionStorage** key `ws:v{persistVersion}`; on load, discard stored state if the version doesn't match; no migration in v1.

- Persist descriptors + current focus (+ per-workspace **origins**, which otherwise can't be recovered) on every workspace event.
- Restore in the manager's constructor via the already-existing `adapter.restoreState(descriptors)`; recreate channel pairs fresh for each restored workspace.
- `persistWorkspaces: true` without `persistVersion` → throw a config error at provider init (spec: "when enabled, persistVersion must be set").
- Tests: round-trip restore; version-mismatch discard; channels usable after restore.

## 5. Container redesign (the substantive work)

**Files:** `src/components/containers/*`, `src/workspaces/WorkspaceManager.ts`, new hook + component, `src/index.ts`

The app's swipe UX needs three capabilities the containers lack. All are generic concepts.

### 5a. Root page as `children`

- `SwipeContainer` accepts `children`, rendered as **page 0** of the swipe track ("the deck starts at your dashboard").
- `StackContainer` renders `children` when no workspace is focused.
- New `<Workspaces>` convenience component: picks the container matching the active `adapterType`, passes `children` and other props through. Export it.

### 5b. Remove injected chrome; add a render prop

The containers currently inject English-labeled `Focus`/`Close` buttons — test scaffolding masquerading as API. A headless-leaning library must not ship UI copy.

- Delete the injected buttons from `StackContainer` and `SwipeContainer`.
- Add `renderWorkspace?: (workspace: WorkspaceDescriptor, content: ReactNode) => ReactNode` so apps wrap workspace content in their own chrome. Default: render `content` bare.
- Update the container tests that click those buttons (breaking is fine — v0.0.1, unreleased).
- `TabsContainer` keeps its tab strip (that *is* its layout job), but adopt `renderWorkspace` for the content pane for consistency.

### 5c. Scroll→URL sync + container access (SwipeContainer)

Built in, **on by default**:

- When a scroll settles on a workspace page: update the adapter index (`SwipeAdapter.setCurrentIndex`, which deliberately does not emit `workspace:focused`) and **replace** the URL with that workspace's URL.
- When it settles on the root page (only exists when `children` given): **replace** the URL with the router's current path — which is by construction the last non-workspace route, since workspace URLs are transparent to `RouterStore`.
- On `workspace:focused` events (programmatic focus), scroll the track to `(index + rootOffset) × pageWidth`; guard against scroll-handler feedback during smooth scrolling (see the app's `targetIndexRef` pattern in its own SwipeContainer).
- Handle orientation change by re-snapping scroll position (guard `window.screen?.orientation` — absent in jsdom).
- Supporting API:
  - Make `WorkspaceManager.buildUrl` public as `getUrl(id: string): string`.
  - New `useWorkspaceContainer(): HTMLElement | null` hook — each container provides its scroll element via context (the app scrolls the deck home from a workspace selector overlay).

**Decided:** scroll-driven URL updates use `replace`, not `push` (the app currently pushes per swiped page — history spam, judged accidental). Programmatic `open`/`focus` keep push semantics.

### 5d. `updateParams` URL guard

`WorkspaceManager.updateParams` replace-navigates unconditionally — updating a **background** workspace's params clobbers the focused workspace's URL. Only navigate when the updated workspace is current. Test this.

## 6. Deliberately rejected (record, don't build)

- **No `useAppBus()` / bus-exposure hook.** The app's video player keeps its own module-level chbus bus and namespaces by `workspace.id` inside its own components; the library's channel pair and the player's bus coexist. Passing the same bus into `AppProvider`'s existing `bus` prop gives unified logging. A bus hook would deepen chbus coupling for no library-side benefit.
- **No `tabs` in `auto` adapter detection** (spec comment mentions it; code never returns it). `window.open`-based UX must not be an auto default. `auto` stays swipe (coarse pointer) / stack.
- **No `setPrevious`/`getPrevious` equivalent.** Per-workspace origins (stored at `open()`) plus the router path (unchanged while in workspaces) cover every use the app has.
- **Navigation ownership stays inverted.** The library auto-navigating on `open`/`focus`/`close`/`updateParams` is its core thesis; the app adapts, not the library.

---

## Acceptance checklist

- [x] `npm test` green (555 tests, 29 files, 100% line coverage)
- [x] `npm run typecheck` fully clean — including the pre-existing test-file errors (mock components in `__tests__/*.tsx` typed as `div`)
- [x] `npm run build` clean; new exports (`Workspaces`, `useWorkspaceContainer`, `getUrl` via manager, `WorkspaceError`) in `src/index.ts` and the emitted `.d.ts`
- [x] chbus peer `^0.3.1`; installs against the app without peer warnings
- [x] README updated: Link passthrough, `Workspaces`, `children`/`renderWorkspace`/scroll-sync on containers, `useWorkspaceContainer`, persistence, imperative `navigate`
- [x] Version bumped to 0.1.0 — publish is a separate manual step (app consumes it in a follow-up migration)

## Follow-up (separate effort, in the app repo)

Migrate `local-vms/apps/frontend`: replace `src/modules/router` + `src/modules/workspaces` with the library; rewrite ~10 call sites (drop manual `navigate(url)` plumbing after `open`/`updateParams`; `useRouter` → `useNavigation`/`useLocation`/`useMeta`; `adapter.type` → `adapterType`; templates → `{ component }` with `WorkspaceComponentProps`). Note: workspace URL format changes from `/workspace/{template}?id=…` to `/workspace/{template}/{id}?…` — existing bookmarks/deep links break.
