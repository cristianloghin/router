// ─── Register (compile-time typing registration point) ───────────────────────

/**
 * Module-augmentation registration point. Apps opt into compile-time
 * checking of route keys/params and workspace template keys/params by
 * augmenting this interface with their maps:
 *
 * ```ts
 * const routes = defineRoutes({ ... });
 * const workspaces = defineWorkspaces({ ... });
 *
 * declare module "@mikrostack/router" {
 *   interface Register {
 *     routes: typeof routes;
 *     workspaces: typeof workspaces;
 *   }
 * }
 * ```
 *
 * When unregistered, route keys are plain strings and workspace templates
 * are loosely typed (no checking).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}
