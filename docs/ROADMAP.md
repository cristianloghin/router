# ROADMAP.md — parity gaps and proposed features

Working list of library changes, to be picked up incrementally. Items graduate
out of this file when implemented (document the result in DEV.md / README.md
and delete the entry — same lifecycle as the original spec docs).

> Provenance: the parity gaps and proposed features below come from assessing
> the library as a React Router v7 replacement for **vms-frontend**
> (2026-08-03), a 47-file RR surface with a four-level nested route tree. The migration was judged
> feasible (~2–3 days) with the gaps below as the only real friction. The
> adoption goal is workspaces: user-created "scratch" walls and other views
> the app doesn't natively support, as tabbed workspaces.

> Shipped and graduated out — the **Planner correctness gaps** (assessed
> 2026-09-01), kept here as a key because entries below and the git history
> still refer to them by label:
> **P1** guards on the initial match and on popstate · **P2** `usePrompt`
> honoured on browser back/forward · **P3** the history cursor tracking
> browser back/forward · **P4** `useQueryState` typing an absent param as
> optional, plus thunk defaults. Behaviour and invariants are in DEV.md and
> README.md.

Usage inventory that drove this list (vms-frontend, RR v7):
`useNavigate` ×18, `useParams` ×13, `useOutletContext` ×7, `useLocation` ×5,
`Outlet` ×5, `Link` ×5, `useSearchParams` ×2, `useMatches`+`handle` ×1,
`useBlocker` ×1, `<Navigate>` redirect elements ×2.

---

## Parity gaps (adoption blockers first)

### 1. `useBlocker` — blocker state machine for custom dialogs

The one hard blocker. `usePrompt` is native-`confirm()` only. vms-frontend's
`UnsafeChangesDialog` (unsaved wall edits) needs RR's resumable model: block
the navigation, render app-owned dialog UI, then let the user resolve it.
`onBeforeNavigate` + `cancel()` cannot express "hold this navigation pending
an async decision", and it is app-global config, not component-local.

Proposed shape:

```tsx
const blocker = useBlocker(({ next }) => isDirty && !next.path.includes("videowalls"))
// blocker.state: "idle" | "blocked"
// blocker.next: target location while blocked
// blocker.proceed(): resume the held navigation
// blocker.reset(): discard it, stay put
```

Design notes: one active blocker per mount is fine (RR allows one globally);
must interact sanely with guards (guards run after a blocker proceeds, not
before it blocks) and with workspace navigation (swipe/scroll sync already
bypasses prompts — blockers should follow the same rule).

Second consumer: Planner's `EventEditor` holds an unsaved draft and already
ships its own `ConfirmDialog` — a native `confirm()` inside an installed PWA
reads as a defect. `usePrompt` now covers the browser's own back button
(P2, shipped); `useBlocker` must inherit that popstate handling rather than
re-open the hole — including the re-push-on-refusal and the two exemptions
(workspace exit, query-only changes) documented in DEV.md.

### 2. Parent→child data through the outlet

`outlet` is a rendered element with no data channel; RR's `useOutletContext`
has 7 call sites in vms-frontend (e.g. an events shell passing a `vehicleMap`
to whichever child page renders). Explicit React context works and is the
philosophically cleaner answer — the gap is boilerplate, not capability.

Two candidate shapes (pick one):

- Render-prop outlet: route components may call `outlet(ctx)` when `outlet`
  is a function — zero new API surface, typed via `RouteComponentProps`.
- `createRouteContext<T>()` helper returning a `{ Provider, useRouteContext }
  ` pair, so the pattern is one import instead of hand-rolled context.

### 3. Per-route metadata (`meta` + `useRouteMeta`)

RR's `handle` + `useMatches` carries route-level metadata (vms-frontend: the
wall mode `live | recording | export | edit` rides on route config, read from
the matched chain). App-wide `useMeta` already exists; extend the concept to
routes:

```tsx
defineRoutes({
  "/videowalls/:id/live": { component: LiveWall, meta: { mode: "live" } },
})

const { mode } = useRouteMeta<{ mode?: WallMode }>() // merged along the matched chain, nearest wins
```

### 4. Declarative redirects

No equivalent of `{ path: "/", element: <Navigate replace to="/videowalls" /> }`.
Workarounds (guard returning a string, navigate-in-effect component) are
noise for a common need. Proposed:

```tsx
defineRoutes({
  "/":           { redirect: "/videowalls" },          // replace by default
  "/monitoring/:id": { component: X, index: ... },     // unchanged
})
```

~10 lines in the registry/matcher; `redirect` and `component` mutually
exclusive.

Second consumer: Planner needs `/` → `/day`, because the PWA's `start_url` is
the bare base and every cold launch lands there. P1 has shipped, so the
initial match is now an evaluated step (`evaluateInitialRoute()`) rather than
a hole — a `redirect` entry has to be honoured there too, alongside the guard.

### 5. Nesting inference at depth — verification, not a feature

The prefix-inference + index-component model has only been proven on a flat
three-route app (local-vms). vms-frontend's walls tree is four levels with an
index component at every level and no-remount parent layouts. Before any
adoption: playground scenario reproducing that tree shape (static-vs-param
sibling priority `/videowalls/new` vs `/videowalls/:id` is already covered by
specificity sorting; the depth × index × transition interplay is not).

### Explicitly rejected (decisions, kept so they aren't relitigated)

- **Relative navigation** (`navigate("events/alerts")`): stays unsupported.
  Absolute paths are a feature; vms-frontend has exactly one relative call to
  fix on their side.
- **RR-style loaders / data APIs**: rejected. Adopting apps keep data in
  domain-layer TanStack Query hooks (DRSp); loaders would compete with that.
  See "query priming" below for the non-competing alternative.

---

## Proposed features (DRSp-aligned, post-parity)

Context: adopting apps follow the Domain-Route-Service pattern — routes are
orchestrators, layouts are dumb slot components (`@mikrostack/rst`), domains
own data. Features below make the router a better citizen of that shape.

### A. Named slots — parallel route outlets (the headline feature)

Routes currently feed exactly one slot: the outlet. DRSp layouts are
slot-based, and real apps have per-route toolbars/sidebars/headers.
vms-frontend's walls section contorts around this today: "actions" toolbars
are registered as *index children* at every tree level to get a per-depth
toolbar out of a single-outlet model.

```tsx
defineRoutes({
  "/videowalls":     { component: WallsShell,   slots: { actions: WallActions, sidebar: WallSidebar } },
  "/videowalls/:id": { component: SelectedWall, slots: { actions: SelectedWallActions } }, // overrides parent's
})

// In a layout:
<PageLayout>
  <PageLayout.Actions><RouterSlot name="actions" /></PageLayout.Actions>
  <PageLayout.Body>{outlet}</PageLayout.Body>
</PageLayout>
```

Resolution: nearest match wins along the matched chain, falling back toward
the root; absent slot renders null. Composes with rst (`RouterSlot` is a slot
whose content the route tree decides). No mainstream router does this well —
a genuine differentiator.

### B. Scoped route modules (sub-routing / federation)

The central route map is a choke point: every feature migration edits it, and
a bounded context's routes live far from its code. Let fragments compose:

```tsx
// route/walls/routes.ts — owned by the walls context
export const wallRoutes = defineRouteModule({
  "/":    { component: WallsShell },
  "/:id": { component: SelectedWall },
})

// config/routes.tsx — mounts contexts
const routes = defineRoutes({
  "/videowalls": mount(wallRoutes),
  "/events":     mount(eventRoutes),
})
```

Param types compose through `Register`. A lazy variant
(`mount(() => import("route/walls/routes"))`) gives per-section
code-splitting. Mirrors DRSp's bounded contexts: the route tree becomes as
federated as the domains already are.

### C. Query priming on navigation

The router knows a navigation is starting before React renders the target.
Let the route warm the query cache during the transition — fire-and-forget,
never blocking, no data ownership:

```tsx
"/fleetmanager/:id": {
  component: VehicleDetailRoute,
  prime: ({ params }) => queryClient.prefetchQuery(vehicleByIdOptions(params.id)),
}
```

This is the loader *benefit* (data starts loading at navigation time) without
the loader *architecture* (router owning data). Pairs with the existing
`isTransitioning`.

### D. View Transitions (garnish)

Route commits already run inside `startTransition` over mirrored state; wrap
them in `document.startViewTransition` where supported, opt-in (config flag
and/or per-`navigate` option). Cheap, degrades silently, makes the router
feel finished.

---

## Security hardening (audit 2026-08-11)

> Provenance: full-surface security review (routing core, matcher, Link,
> workspace auth, cross-tab messaging, persistence, CI) prompted by
> production adoption. Verdict: no externally exploitable vulnerability; the
> items below are hardening. Prod deps audit clean; the 11 npm-audit findings
> are all dev-toolchain (vite/vitest/ws) — `npm audit fix` when convenient.

Framing that governs this whole section: workspace auth is **client-side
gating, not security**. `time-limited` runs on the client clock,
`credential`/`custom` are app-supplied functions, and `auth.granted` is
flippable from devtools. Real resources (streams, APIs) must be authorized
server-side per request. This now says so in README's auth section (S3).

### S4. URI-encode interpolated URL parts

`buildPath` substitutes params raw, and workspace URLs interpolate
`template`/`id` raw (`WorkspaceManager.buildUrl`, `BrowserTabAdapter`). A
value containing `/`, `?`, or `#` restructures the URL — id `1/edit`
navigates elsewhere, `x?admin=true` injects query params. Not a guard bypass
(guards run on the resolved path) and scheme position is unreachable
(patterns are `/`-rooted), but `encodeURIComponent` on substituted values
closes it.

### S5. Block dangerous schemes in the Link href escape hatch

`<Link href>` renders the href verbatim; a `javascript:` URL executes on
click (React warns, doesn't block). Reject `javascript:`/`data:` schemes in
the escape-hatch branch. (`Link.tsx`)

### S6. Null-guard BroadcastChannel messages

`BrowserTabAdapter`'s `onmessage` reads `msg.type` without a null/shape
guard — a malformed same-origin message throws in the handler.
`WorkspaceChannel` already guards; mirror it. Robustness only
(BroadcastChannel is same-origin).

### S7. CI tightening

Publish workflow is well-gated (push-to-main only, after tests, OIDC; fork
PRs read-only). Optional: pin actions by SHA instead of tag, drop the
unpinned `npm install -g npm@latest`, scope `contents: write` to the publish
job only.

---

## Suggested order

1. `useBlocker` (1) — unblocks vms-frontend parity; sits on top of the
   popstate prompt handling that shipped with P2.
2. Named slots (A) — dissolves the walls section's worst contortion *during*
   its migration rather than porting the contortion.
3. Redirects (4) + route meta (3) — small parity wins, do together.
   Redirects hook into the initial-match evaluation P1 added.
4. Outlet context (2) — small; decide the shape first.
5. Scoped modules (B), priming (C), view transitions (D) — pay off as more
   sections adopt; none block anything.

Security items are order-independent of the above and individually small.
S1–S3 have shipped (auth is re-evaluated on restore, `credential` fails closed
with no credential source, and README carries the client-side-gating caveat);
S4–S7 remain, to be taken opportunistically.
