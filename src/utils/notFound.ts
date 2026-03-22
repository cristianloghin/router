const NOT_FOUND_SENTINEL = Symbol("router.notFound");

/** Sentinel value thrown by notFound(). Not an Error instance. */
interface NotFoundSentinel {
  readonly __type: typeof NOT_FOUND_SENTINEL;
}

const sentinel: NotFoundSentinel = { __type: NOT_FOUND_SENTINEL };

/**
 * Throws a sentinel value that RouterView's error boundary catches to
 * render the fallback. Call this from a route component when the resource
 * does not exist.
 *
 * Works correctly inside async rendering and Suspense.
 */
export function notFound(): never {
  throw sentinel;
}

export function isNotFoundError(value: unknown): value is NotFoundSentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as NotFoundSentinel).__type === NOT_FOUND_SENTINEL
  );
}
