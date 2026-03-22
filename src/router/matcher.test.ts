import { describe, it, expect } from "vitest";
import { matchPath, buildPath, specificity } from "./matcher";

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
