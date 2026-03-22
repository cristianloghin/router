import { createContext, useContext } from "react";
import type { RouterStore } from "./RouterContext";

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
