import { describe, it, expect } from "vitest";
import { matchPath, buildPath, specificity, pathnameOf, decodeSegment } from "./matcher";

// ─── matchPath — static paths ─────────────────────────────────────────────────

describe("matchPath: static paths", () => {
  it("matches the root path", () => {
    expect(matchPath("/", "/")).toEqual({ matched: true, params: {} });
  });

  it("matches an exact static path", () => {
    expect(matchPath("/settings", "/settings")).toEqual({ matched: true, params: {} });
  });

  it("does not match when pathname is shorter than pattern", () => {
    expect(matchPath("/settings", "/")).toMatchObject({ matched: false });
  });

  it("does not match when pathname has extra segments (no prefix matching)", () => {
    expect(matchPath("/settings", "/settings/profile")).toMatchObject({ matched: false });
  });
});

// ─── matchPath — parametric paths ────────────────────────────────────────────

describe("matchPath: parametric paths", () => {
  it("matches a single param and extracts it", () => {
    expect(matchPath("/camera/:id", "/camera/cam-4")).toEqual({
      matched: true,
      params: { id: "cam-4" },
    });
  });

  it("does not match when the param slot is empty (trailing slash)", () => {
    expect(matchPath("/camera/:id", "/camera/")).toMatchObject({ matched: false });
  });

  it("matches multiple params and extracts them", () => {
    expect(matchPath("/a/:x/b/:y", "/a/1/b/2")).toEqual({
      matched: true,
      params: { x: "1", y: "2" },
    });
  });
});

// ─── matchPath — wildcard ─────────────────────────────────────────────────────

describe("matchPath: wildcard", () => {
  it("matches /* against a single segment", () => {
    expect(matchPath("/*", "/anything")).toEqual({
      matched: true,
      params: { "*": "anything" },
    });
  });

  it("matches /* against multiple segments and captures them joined", () => {
    expect(matchPath("/*", "/a/b/c")).toEqual({
      matched: true,
      params: { "*": "a/b/c" },
    });
  });

  it("matches a prefixed wildcard and captures the remainder", () => {
    expect(matchPath("/admin/*", "/admin/users/list")).toEqual({
      matched: true,
      params: { "*": "users/list" },
    });
  });

  it("does not match a prefixed wildcard when the prefix differs", () => {
    expect(matchPath("/admin/*", "/other")).toMatchObject({ matched: false });
  });
});

// ─── matchPath — segment boundary enforcement ─────────────────────────────────

describe("matchPath: segment boundary enforcement", () => {
  it("does not match /set against /settings (segment boundary required)", () => {
    expect(matchPath("/set", "/settings")).toMatchObject({ matched: false });
  });

  it("does not match /settings against /settings/ (trailing slash is a different path)", () => {
    expect(matchPath("/settings", "/settings/")).toMatchObject({ matched: false });
  });
});

// ─── buildPath ────────────────────────────────────────────────────────────────

describe("buildPath", () => {
  it("substitutes a single param", () => {
    expect(buildPath("/camera/:id", { id: "cam-4" })).toBe("/camera/cam-4");
  });

  it("substitutes multiple params", () => {
    expect(buildPath("/a/:x/b/:y", { x: "1", y: "2" })).toBe("/a/1/b/2");
  });

  it("returns static path unchanged when params map is empty", () => {
    expect(buildPath("/settings", {})).toBe("/settings");
  });
});

// ─── specificity ──────────────────────────────────────────────────────────────

describe("specificity", () => {
  it("static two-segment beats parametric two-segment", () => {
    expect(specificity("/settings/profile")).toBeGreaterThan(
      specificity("/settings/:section"),
    );
  });

  it("parametric two-segment beats wildcard two-segment", () => {
    expect(specificity("/settings/:section")).toBeGreaterThan(
      specificity("/settings/*"),
    );
  });

  it("one static segment beats one parametric segment", () => {
    expect(specificity("/settings")).toBeGreaterThan(specificity("/:any"));
  });

  it("one parametric segment beats a root wildcard", () => {
    expect(specificity("/:any")).toBeGreaterThan(specificity("/*"));
  });
});

// ─── pathnameOf ───────────────────────────────────────────────────────────────

describe("pathnameOf", () => {
  it("passes a plain path through unchanged", () => {
    expect(pathnameOf("/editor")).toBe("/editor");
    expect(pathnameOf("/")).toBe("/");
  });

  it("drops a query string", () => {
    expect(pathnameOf("/editor?draft=7")).toBe("/editor");
    expect(pathnameOf("/search?q=a&q=b")).toBe("/search");
  });

  it("drops a fragment", () => {
    expect(pathnameOf("/docs#install")).toBe("/docs");
  });

  it("cuts at whichever comes first", () => {
    expect(pathnameOf("/docs?v=2#install")).toBe("/docs");
    expect(pathnameOf("/docs#install?v=2")).toBe("/docs");
  });

  it("handles an empty query and an empty fragment", () => {
    expect(pathnameOf("/editor?")).toBe("/editor");
    expect(pathnameOf("/editor#")).toBe("/editor");
  });

  it("leaves a ? inside an already-encoded segment alone", () => {
    expect(pathnameOf("/notes/what%3F")).toBe("/notes/what%3F");
  });
});

// ─── S4: URL-encoding of interpolated values ─────────────────────────────────

/**
 * Security hardening S4. buildPath substituted params raw, so a value
 * containing "/", "?" or "#" restructured the URL it was placed into: an id of
 * "1/edit" navigated somewhere else entirely, "x?admin=true" grafted on a
 * query string. Not a guard bypass — guards run on the resolved path — but the
 * URL stopped meaning what the caller wrote.
 */
describe("buildPath: encoding", () => {
  it("encodes a separator so the value stays one segment", () => {
    expect(buildPath("/users/:id", { id: "1/edit" })).toBe("/users/1%2Fedit");
  });

  it("encodes a query introducer so it cannot graft on params", () => {
    expect(buildPath("/users/:id", { id: "x?admin=true" })).toBe("/users/x%3Fadmin%3Dtrue");
  });

  it("encodes a fragment introducer", () => {
    expect(buildPath("/users/:id", { id: "a#b" })).toBe("/users/a%23b");
  });

  it("encodes spaces and non-ASCII", () => {
    expect(buildPath("/q/:term", { term: "a b" })).toBe("/q/a%20b");
    expect(buildPath("/q/:term", { term: "café" })).toBe("/q/caf%C3%A9");
  });

  it("leaves ordinary values untouched", () => {
    expect(buildPath("/camera/:id", { id: "cam-4" })).toBe("/camera/cam-4");
    expect(buildPath("/a/:x/b/:y", { x: "1", y: "2" })).toBe("/a/1/b/2");
  });

  it("still leaves an unsupplied param as its placeholder", () => {
    expect(buildPath("/users/:id", {})).toBe("/users/:id");
  });
});

describe("matchPath: decoding", () => {
  it("round-trips a value containing a separator", () => {
    const built = buildPath("/users/:id", { id: "1/edit" });
    const { matched, params } = matchPath("/users/:id", built);
    expect(matched).toBe(true);
    expect(params["id"]).toBe("1/edit");
  });

  it("round-trips spaces and non-ASCII", () => {
    expect(matchPath("/q/:term", buildPath("/q/:term", { term: "a b" })).params["term"]).toBe("a b");
    expect(matchPath("/q/:term", buildPath("/q/:term", { term: "café" })).params["term"]).toBe("café");
  });

  it("decodes a wildcard remainder per segment", () => {
    const { params } = matchPath("/files/*", "/files/a%20b/c%20d");
    expect(params["*"]).toBe("a b/c d");
  });

  it("leaves ordinary values untouched", () => {
    expect(matchPath("/camera/:id", "/camera/cam-4").params["id"]).toBe("cam-4");
  });

  it("falls back to the raw segment on malformed percent-encoding", () => {
    expect(matchPath("/camera/:id", "/camera/100%").params["id"]).toBe("100%");
  });
});

describe("decodeSegment", () => {
  it("decodes valid percent-encoding", () => {
    expect(decodeSegment("a%20b")).toBe("a b");
    expect(decodeSegment("1%2Fedit")).toBe("1/edit");
  });

  it("returns the raw text when decoding would throw", () => {
    expect(decodeSegment("100%")).toBe("100%");
    expect(decodeSegment("%ZZ")).toBe("%ZZ");
  });

  it("is a no-op for plain segments", () => {
    expect(decodeSegment("cam-4")).toBe("cam-4");
  });
});
