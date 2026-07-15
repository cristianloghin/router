import { useSyncExternalStore } from "react";

// Minimal external auth store so `config.auth.isAuthenticated` and workspace
// `authenticated` rules have something real to check against.
let loggedIn = false;
const listeners = new Set<() => void>();

export const authStore = {
  get loggedIn() {
    return loggedIn;
  },
  toggle() {
    loggedIn = !loggedIn;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAuth(): boolean {
  return useSyncExternalStore(
    (cb) => authStore.subscribe(cb),
    () => loggedIn,
  );
}
