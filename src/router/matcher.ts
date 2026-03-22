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
        params[p.slice(1)] = v;
      } else if (p !== v) {
        return noMatch;
      }
    }
    params["*"] = pathParts.slice(staticParts.length).join("/");
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
      params[p.slice(1)] = v;
    } else if (p !== v) {
      return noMatch;
    }
  }
  return { matched: true, params };
}

// ─── buildPath ────────────────────────────────────────────────────────────────

export function buildPath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => {
    return params[key] ?? `:${key}`;
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
