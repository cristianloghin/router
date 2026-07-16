import { describe, it, expect } from "vitest";
import { shallowEqual } from "./shallowEqual";

describe("shallowEqual: primitives and identity", () => {
  it("equal primitives compare true", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "a")).toBe(true);
    expect(shallowEqual(NaN, NaN)).toBe(true);
  });

  it("different primitives compare false", () => {
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual("a", "b")).toBe(false);
  });

  it("the same reference compares true", () => {
    const arr = [1, 2];
    expect(shallowEqual(arr, arr)).toBe(true);
  });

  it("null/undefined against objects compare false", () => {
    expect(shallowEqual(null, {} as unknown as null)).toBe(false);
    expect(shallowEqual({} as unknown as null, null)).toBe(false);
    expect(shallowEqual(undefined, null as unknown as undefined)).toBe(false);
  });
});

describe("shallowEqual: arrays", () => {
  it("same elements compare true", () => {
    expect(shallowEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(shallowEqual([], [])).toBe(true);
  });

  it("different elements or length compare false", () => {
    expect(shallowEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(shallowEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("array against plain object compares false", () => {
    expect(shallowEqual(["a"] as unknown as Record<string, string>, { 0: "a" })).toBe(false);
  });

  it("comparison is one level deep only", () => {
    const shared = { id: 1 };
    expect(shallowEqual([shared], [shared])).toBe(true);
    expect(shallowEqual([{ id: 1 }], [{ id: 1 }])).toBe(false);
  });
});

describe("shallowEqual: plain objects", () => {
  it("same keys and values compare true", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });

  it("different values, missing or extra keys compare false", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 } as { a: number })).toBe(false);
    expect(shallowEqual({ a: 1, b: 2 } as { a: number }, { a: 1 })).toBe(false);
  });

  it("comparison is one level deep only", () => {
    const shared = { id: 1 };
    expect(shallowEqual({ w: shared }, { w: shared })).toBe(true);
    expect(shallowEqual({ w: { id: 1 } }, { w: { id: 1 } })).toBe(false);
  });
});
