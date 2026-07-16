// ─── shallowEqual ─────────────────────────────────────────────────────────────

/**
 * One-level equality for useWorkspaces selector results: arrays compare
 * element-wise, plain objects key-wise, everything else via Object.is.
 * Pass it as the `isEqual` argument when a selector derives a fresh
 * array/object each call (e.g. `s => s.workspaces.filter(...)`) — under the
 * default Object.is such a selector never skips a re-render.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" || a === null ||
    typeof b !== "object" || b === null
  ) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((value, i) => Object.is(value, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
