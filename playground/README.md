# Playground

A local Vite app for testing the library in a real browser.

```sh
npm run playground   # → http://localhost:5199
```

It imports `@mikrostack/router` straight from `../src` (see the alias in
`vite.config.ts`), so library edits hot-reload — no build step.

What's wired up:

- **Routing** — static, `:param`, wildcard, nested (layout + index), lazy with
  loading fallback, per-route error boundary, guard with redirect, `notFound()`
- **Hooks** — `useNavigation`, `useLocation`, `useRoute`, `useParams`,
  `useSearchParams`, `useQueryState`, `useMeta`, `usePrompt`
- **Typed API** — routes and workspaces are registered via the `Register`
  interface (see `src/App.tsx`), so `Link`, `navigate`, `useParams`, and
  `open()` are all key/param checked
- **Workspaces** — `authenticated` (toggle "Logged in" in the top bar),
  `public`, schema-typed params, `maxInstances`, channel messaging (📸 snapshot
  button = root → workspace → root round-trip), `updateParams`/`updateTitle`
- **Adapters** — switch stack/swipe/tabs/auto from the top bar (reloads the
  page; the adapter is fixed at provider mount)

The top bar and sidebar are playground chrome, not part of the app — they
float as overlays and the 🛠/✕ button (bottom right) toggles them, so the app
can be experienced standalone. A tabs-adapter workspace tab always renders
bare, exactly as it would in production.
