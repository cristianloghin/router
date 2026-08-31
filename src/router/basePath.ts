// ─── App-level base path ──────────────────────────────────────────────────────

/**
 * Translation between the two path domains this library keeps separate:
 *
 * - **internal** — every path inside the library: route keys, matcher and
 *   `buildPath` output, `HistoryStack` entries, workspace origins, persisted
 *   state, `WorkspaceManager.buildUrl()` output, and every path on
 *   `RouterState`. Always base-free, always absolute from `/`.
 * - **external** — what the address bar shows. Internal path prefixed with
 *   the app's base path.
 *
 * The base exists only in the address bar: `toExternal` is applied at the
 * `pushState`/`replaceState`/`window.open` URL argument and nowhere else,
 * `toInternal` at every `window.location.pathname` read and nowhere else.
 *
 * Composes with `workspaceBasePath` in exactly one order — strip the app
 * base first, *then* test for the workspace prefix. `isWorkspacePath` takes
 * internal paths only.
 */

/**
 * Normalises a configured base path: leading slash required, trailing slash
 * stripped. `""` and `"/"` both mean "no base" and normalise to `""`, which
 * makes both helpers below the identity function.
 */
export function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === "/") return "";
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

/**
 * Strips the base from a `window.location.pathname`.
 *
 * The base's own root maps to the app root (`/app` → `/`), and a pathname
 * outside the base passes through unchanged — the app isn't mounted there,
 * so there is nothing to strip and no reason to mangle it.
 */
export function toInternal(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(basePath + "/")) return pathname.slice(basePath.length);
  return pathname;
}

/**
 * Prepends the base to an internal path, for handing to the address bar.
 * `toExternal("/")` is the bare base (no trailing slash).
 */
export function toExternal(path: string, basePath: string): string {
  if (!basePath) return path;
  if (path === "/") return basePath;
  if (!path.startsWith("/")) return `${basePath}/${path}`;
  return basePath + path;
}
