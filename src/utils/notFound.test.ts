import { describe, it, expect } from "vitest";
import { notFound, isNotFoundError } from "./notFound";

describe("notFound", () => {
  it("throws when called", () => {
    expect(() => notFound()).toThrow();
  });

  it("the thrown value satisfies isNotFoundError", () => {
    let caught: unknown;
    try { notFound(); } catch (e) { caught = e; }
    expect(isNotFoundError(caught)).toBe(true);
  });

  it("the thrown value is not an Error instance", () => {
    let caught: unknown;
    try { notFound(); } catch (e) { caught = e; }
    expect(caught instanceof Error).toBe(false);
  });
});

describe("isNotFoundError", () => {
  it("returns false for a plain Error", () => {
    expect(isNotFoundError(new Error("other"))).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isNotFoundError("not-found")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNotFoundError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
