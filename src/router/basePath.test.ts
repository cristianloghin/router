import { describe, it, expect } from "vitest";
import { normalizeBasePath, toInternal, toExternal } from "./basePath";

// ─── normalizeBasePath ────────────────────────────────────────────────────────

describe("normalizeBasePath", () => {
  it('treats undefined, "" and "/" as no base', () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("strips a trailing slash", () => {
    expect(normalizeBasePath("/Planner/")).toBe("/Planner");
  });

  it("adds a missing leading slash", () => {
    expect(normalizeBasePath("Planner")).toBe("/Planner");
  });

  it("leaves an already-normalised base alone", () => {
    expect(normalizeBasePath("/Planner")).toBe("/Planner");
  });

  it("handles a nested base", () => {
    expect(normalizeBasePath("apps/Planner/")).toBe("/apps/Planner");
  });
});

// ─── identity when unset ──────────────────────────────────────────────────────

describe("no base path configured", () => {
  it("both helpers are the identity function", () => {
    for (const path of ["/", "/day", "/workspace/cam/abc?title=X"]) {
      expect(toInternal(path, "")).toBe(path);
      expect(toExternal(path, "")).toBe(path);
    }
  });
});

// ─── toInternal ───────────────────────────────────────────────────────────────

describe("toInternal", () => {
  const base = "/Planner";

  it("strips the base from a nested path", () => {
    expect(toInternal("/Planner/day", base)).toBe("/day");
  });

  it("maps the base's own root to the app root", () => {
    expect(toInternal("/Planner", base)).toBe("/");
  });

  it("maps the base with a trailing slash to the app root", () => {
    expect(toInternal("/Planner/", base)).toBe("/");
  });

  it("passes a pathname outside the base through unchanged", () => {
    // The app isn't mounted there — nothing to strip, and mangling it would
    // silently invent a route.
    expect(toInternal("/other/day", base)).toBe("/other/day");
    expect(toInternal("/", base)).toBe("/");
  });

  it("does not strip a base that only prefix-matches mid-segment", () => {
    // "/PlannerX" starts with "/Planner" as a string but is a different app.
    expect(toInternal("/PlannerX/day", base)).toBe("/PlannerX/day");
  });

  it("strips only the first occurrence", () => {
    expect(toInternal("/Planner/Planner/day", base)).toBe("/Planner/day");
  });
});

// ─── toExternal ───────────────────────────────────────────────────────────────

describe("toExternal", () => {
  const base = "/Planner";

  it("prepends the base to a route path", () => {
    expect(toExternal("/day", base)).toBe("/Planner/day");
  });

  it("maps the app root to the bare base, with no trailing slash", () => {
    expect(toExternal("/", base)).toBe("/Planner");
  });

  it("preserves a query string", () => {
    expect(toExternal("/workspace/cam/abc?title=X", base)).toBe(
      "/Planner/workspace/cam/abc?title=X",
    );
  });

  it("tolerates a path missing its leading slash", () => {
    expect(toExternal("day", base)).toBe("/Planner/day");
  });
});

// ─── round trips ──────────────────────────────────────────────────────────────

describe("round trips", () => {
  const base = "/Planner";

  it("toInternal(toExternal(path)) === path", () => {
    for (const path of ["/", "/day", "/users/42", "/workspace/cam/abc?title=X"]) {
      // toInternal takes a pathname, so compare on the path portion only.
      const [pathOnly = "", query] = path.split("?");
      const external = toExternal(pathOnly, base);
      expect(toInternal(external, base)).toBe(pathOnly);
      if (query) expect(toExternal(path, base)).toContain(`?${query}`);
    }
  });

  it("toExternal never double-applies the base", () => {
    // Internal paths are base-free by invariant, so this is the guard against
    // accidentally translating an already-external value.
    const once = toExternal("/day", base);
    expect(once).toBe("/Planner/day");
    expect(toInternal(once, base)).toBe("/day");
  });
});
