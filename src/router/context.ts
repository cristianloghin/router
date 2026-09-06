import { createContext, useContext } from "react";
import type { RouterStore } from "./RouterContext";

/**
 * The path `RouterView` is currently *rendering*, which is not always the
 * store's path: route changes commit through a transition, so while a new
 * route loads the previous one is still on screen and the store already holds
 * the next URL. Hooks that describe "this route" (`useRoute`, `useParams`)
 * read this when inside a view, so a mounted route never sees params for a
 * URL it is not rendering. Outside any view it is null and the store's
 * current path applies — a nav bar wants the URL, not the screen.
 */
export const RenderedPathContext = createContext<string | null>(null);

export const RouterStoreContext = createContext<RouterStore | null>(null);

export function useRouterStore(): RouterStore {
  const store = useContext(RouterStoreContext);
  if (!store) {
    throw new Error(
      "[router] Router hooks must be used inside <AppProvider>.",
    );
  }
  return store;
}
