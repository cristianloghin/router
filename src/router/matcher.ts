/**
 * Splits a path string into its non-leading-slash segments.
 * Preserves empty trailing segments so that trailing slash is detectable.
 *
 * "/"          → []
 * "/settings"  → ["settings"]
 * "/settings/" → ["settings", ""]   ← trailing slash leaves an empty segment
 * "/a/b/c"     → ["a", "b", "c"]
 */
function splitPath(p: string): string[] {
  if (p === "/") return [];
  return p.slice(1).split("/");
}

// ─── segment encoding ─────────────────────────────────────────────────────────

/**
 * Decodes one path segment, falling back to the raw text when it is not valid
 * percent-encoding — `decodeURIComponent` throws on e.g. "100%".
 *
 * The counterpart to the `encodeURIComponent` in `buildPath`: values go into
 * a URL encoded so they cannot restructure it, and come back out decoded so
 * `useParams()` sees what was put in.
 */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// ─── matchPath ────────────────────────────────────────────────────────────────

export function matchPath(
  pattern: string,
  pathname: string,
): { matched: boolean; params: Record<string, string> } {
  const noMatch = { matched: false, params: {} } as const;
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(pathname);
  const wildcardIdx = patternParts.indexOf("*");

  if (wildcardIdx !== -1) {
    // Wildcard is always the last segment. Anything before it must match exactly.
    const staticParts = patternParts.slice(0, wildcardIdx);
    if (pathParts.length < staticParts.length) return noMatch;

    const params: Record<string, string> = {};
    for (let i = 0; i < staticParts.length; i++) {
      const p = staticParts[i]!;
      const v = pathParts[i]!;
      if (p.startsWith(":")) {
        if (!v) return noMatch;
        params[p.slice(1)] = decodeSegment(v);
      } else if (p !== v) {
        return noMatch;
      }
    }
    // Decoded per segment, then rejoined: the separators are structure, the
    // segments are values.
    params["*"] = pathParts
      .slice(staticParts.length)
      .map(decodeSegment)
      .join("/");
    return { matched: true, params };
  }

  // Non-wildcard: lengths must match exactly (this also rejects trailing slashes).
  if (patternParts.length !== pathParts.length) return noMatch;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const v = pathParts[i]!;
    if (p.startsWith(":")) {
      // Empty segment (e.g. trailing slash) must not match a param slot.
      if (!v) return noMatch;
      params[p.slice(1)] = decodeSegment(v);
    } else if (p !== v) {
      return noMatch;
    }
  }
  return { matched: true, params };
}

// ─── pathnameOf ───────────────────────────────────────────────────────────────

/**
 * The pathname half of a navigation target — what `RouterState.path` holds and
 * what every matcher consumes.
 *
 * "/editor"          → "/editor"
 * "/editor?draft=7"  → "/editor"
 * "/editor#top"      → "/editor"
 *
 * The query and fragment are deliberately not returned. The store reads the
 * query back off the address bar once the target has been pushed, and the
 * router does not track fragments at all; both survive in the URL because the
 * *full* target string is what gets pushed, not this pathname.
 */
export function pathnameOf(to: string): string {
  const cut = to.search(/[?#]/);
  return cut === -1 ? to : to.slice(0, cut);
}

// ─── buildPath ────────────────────────────────────────────────────────────────

export function buildPath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) return `:${key}`;
    // Encoded so a value cannot restructure the URL it is substituted into:
    // an id of "1/edit" is one segment, not two, and "x?admin=true" cannot
    // graft on a query string. matchPath decodes on the way back out, so
    // useParams() still reports the original value.
    return encodeURIComponent(value);
  });
}

// ─── specificity ──────────────────────────────────────────────────────────────

/**
 * Returns a specificity score for a route pattern.
 * Higher score = matched with higher priority.
 *
 * Static segment:       100 pts
 * Parametric segment:    10 pts
 * Wildcard segment:      -1 pt  (wildcards always lose to exact/parametric patterns)
 *
 * Using -1 for wildcards ensures that "/" (score 0) beats "/*" (score -1),
 * and "/settings" (100) beats "/*" (-1) even though both have different segment counts.
 */
export function specificity(pattern: string): number {
  const parts = splitPath(pattern);
  let score = 0;
  for (const part of parts) {
    if (part === "*") {
      score -= 1;
    } else if (part.startsWith(":")) {
      score += 10;
    } else {
      score += 100;
    }
  }
  return score;
}
