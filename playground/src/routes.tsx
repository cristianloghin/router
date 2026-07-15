import { defineRoutes } from "@mikrostack/router";
import { authStore } from "./authStore";
import {
  Home,
  About,
  UserDetail,
  SettingsLayout,
  SettingsIndex,
  ProfileSettings,
  SecuritySettings,
  FileExplorer,
  BrokenPage,
  AdminPanel,
  AccessDenied,
  OriginLauncher,
  QueryPlayground,
  DirtyForm,
  MetaPage,
  LazyPage,
} from "./pages";

export const routes = defineRoutes({
  "/": { component: Home },
  "/about": { component: About },
  "/users/:id": { component: UserDetail },

  // Nested routes: layout + index + children
  "/settings": { component: SettingsLayout, index: SettingsIndex },
  "/settings/profile": { component: ProfileSettings },
  "/settings/security": { component: SecuritySettings },

  // Wildcard
  "/files/*": { component: FileExplorer },

  // Lazy component with a route-level loading fallback
  "/lazy": {
    component: LazyPage,
    loading: <div className="card">Loading lazy route…</div>,
  },

  // Per-route error boundary
  "/broken": {
    component: BrokenPage,
    error: ({ error, reset }) => (
      <div className="card">
        <h2>Route error boundary</h2>
        <p>
          Caught: <code>{error.message}</code>
        </p>
        <button onClick={reset}>reset()</button>
      </div>
    ),
  },

  // Guard: allow when logged in, otherwise redirect
  "/admin": {
    component: AdminPanel,
    guard: () => (authStore.loggedIn ? true : "/denied"),
  },
  "/denied": { component: AccessDenied },

  "/launcher": { component: OriginLauncher },

  "/query": { component: QueryPlayground },
  "/prompt": { component: DirtyForm },
  "/meta": { component: MetaPage },
});
