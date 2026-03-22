import { matchPath, specificity } from "./matcher";
import type { RawRouteMap, RouteMap } from "./types";

// ─── defineRoutes ─────────────────────────────────────────────────────────────

export function defineRoutes<TMap extends RawRouteMap>(map: TMap): RouteMap<TMap> {
  // Validate keys
  for (const key of Object.keys(map)) {
    if (!key.startsWith("/")) {
      throw new Error(
        `[router] Route key "${key}" must start with "/". ` +
          `All route keys are absolute path patterns.`,
      );
    }
  }
  return Object.freeze({ ...map }) as RouteMap<TMap>;
}

// ─── RouteRegistry ────────────────────────────────────────────────────────────

export class RouteRegistry {
  private readonly keys: string[];
  /** key → direct parent key | null */
  private readonly parentMap: Map<string, string | null>;
  /** key → direct children keys */
  private readonly childrenMap: Map<string, string[]>;
  /** The original route map for definition lookup by RouterView. */
  readonly _routes: RouteMap;

  constructor(routes: RouteMap) {
    this._routes = routes;
    this.keys = Object.keys(routes);
    this.parentMap = new Map();
    this.childrenMap = new Map();

    // Initialise children map
    for (const key of this.keys) {
      this.childrenMap.set(key, []);
    }

    // Build parent graph
    for (const key of this.keys) {
      const def = routes[key]!;

      // Explicit suppression
      if (def.parent === null) {
        this.parentMap.set(key, null);
        continue;
      }

      // Find the longest strict prefix that is also a registered route key
      // and whose last segment aligns with a segment boundary in `key`.
      let bestParent: string | null = null;
      let bestLength = -1;

      for (const candidate of this.keys) {
        if (candidate === key) continue;
        if (!isStrictSegmentPrefix(candidate, key)) continue;
        if (candidate.length > bestLength) {
          bestParent = candidate;
          bestLength = candidate.length;
        }
      }

      this.parentMap.set(key, bestParent);
      if (bestParent !== null) {
        this.childrenMap.get(bestParent)!.push(key);
      }
    }

    // Cycle detection in development
    if (true) {
      this.detectCycles();
    }
  }

  /**
   * Returns the ordered render chain for the given pathname, outermost-first.
   * Only the best-matching route at each nesting level is included.
   */
  getMatchChain(pathname: string): string[] {
    // Find all matching route keys, sorted by descending specificity.
    const matches = this.keys
      .filter((key) => matchPath(key, pathname).matched)
      .sort((a, b) => specificity(b) - specificity(a));

    if (matches.length === 0) return [];

    // The most specific match is the leaf.
    const leaf = matches[0]!;

    // Walk up the parent chain to build the outermost-first chain.
    const chain: string[] = [];
    let current: string | null = leaf;
    while (current !== null) {
      chain.unshift(current);
      current = this.parentMap.get(current) ?? null;
    }

    return chain;
  }

  getParent(path: string): string | null {
    return this.parentMap.get(path) ?? null;
  }

  getChildren(path: string): string[] {
    return this.childrenMap.get(path) ?? [];
  }

  getAll(): string[] {
    return [...this.keys];
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private detectCycles(): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const visit = (key: string): void => {
      if (inStack.has(key)) {
        throw new Error(`[router] Cycle detected in parent graph at route "${key}".`);
      }
      if (visited.has(key)) return;
      inStack.add(key);
      const parent = this.parentMap.get(key);
      if (parent) visit(parent);
      inStack.delete(key);
      visited.add(key);
    };

    for (const key of this.keys) {
      visit(key);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `prefix` is a strict segment-boundary prefix of `path`.
 *
 * "/settings"  is a prefix of "/settings/profile"  → true
 * "/set"       is NOT a prefix of "/settings"       → false (no segment boundary)
 * "/settings"  is NOT a prefix of "/settings"       → false (not strict)
 */
function isStrictSegmentPrefix(prefix: string, path: string): boolean {
  if (prefix === path) return false;
  // The character in `path` immediately after `prefix` must be "/" or end-of-string.
  if (!path.startsWith(prefix)) return false;
  const charAfter = path[prefix.length];
  return charAfter === "/" || charAfter === undefined;
}
