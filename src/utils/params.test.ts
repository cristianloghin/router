import { describe, it, expect } from "vitest";
import { serialize, deserialize, paramsToRecord, recordToParams } from "./params";

// ─── serialize ───────────────────────────────────────────────────────────────

describe("serialize", () => {
  it("serializes a number to string", () => {
    expect(serialize(42, "number")).toBe("42");
  });

  it("serializes true to 'true'", () => {
    expect(serialize(true, "boolean")).toBe("true");
  });

  it("serializes false to 'false'", () => {
    expect(serialize(false, "boolean")).toBe("false");
  });

  it("serializes a string verbatim", () => {
    expect(serialize("hello", "string")).toBe("hello");
  });

  it("serializes a string[] to an array of strings", () => {
    expect(serialize(["a", "b"], "string[]")).toEqual(["a", "b"]);
  });

  it("serializes a number[] to an array of stringified numbers", () => {
    expect(serialize([1, 2], "number[]")).toEqual(["1", "2"]);
  });
});

// ─── deserialize ─────────────────────────────────────────────────────────────

describe("deserialize", () => {
  it("deserializes a number string to number", () => {
    expect(deserialize("42", "number")).toBe(42);
  });

  it("deserializes 'true' to boolean true", () => {
    expect(deserialize("true", "boolean")).toBe(true);
  });

  it("deserializes 'false' to boolean false", () => {
    expect(deserialize("false", "boolean")).toBe(false);
  });

  it("deserializes a string[] to string[]", () => {
    expect(deserialize(["a", "b"], "string[]")).toEqual(["a", "b"]);
  });

  it("deserializes a number string[] to number[]", () => {
    expect(deserialize(["1", "2"], "number[]")).toEqual([1, 2]);
  });

  it("returns undefined for undefined string input", () => {
    expect(deserialize(undefined, "string")).toBeUndefined();
  });

  it("returns undefined for undefined number input", () => {
    expect(deserialize(undefined, "number")).toBeUndefined();
  });
});

// ─── round-trips ─────────────────────────────────────────────────────────────

describe("round-trip: serialize then deserialize", () => {
  it("round-trips a number", () => {
    const v = serialize(42, "number");
    expect(deserialize(v as string, "number")).toBe(42);
  });

  it("round-trips boolean true", () => {
    const v = serialize(true, "boolean");
    expect(deserialize(v as string, "boolean")).toBe(true);
  });

  it("round-trips boolean false", () => {
    const v = serialize(false, "boolean");
    expect(deserialize(v as string, "boolean")).toBe(false);
  });

  it("round-trips a string", () => {
    const v = serialize("hello", "string");
    expect(deserialize(v as string, "string")).toBe("hello");
  });

  it("round-trips a string[]", () => {
    const v = serialize(["a", "b"], "string[]");
    expect(deserialize(v as string[], "string[]")).toEqual(["a", "b"]);
  });

  it("round-trips a number[]", () => {
    const v = serialize([1, 2], "number[]");
    expect(deserialize(v as string[], "number[]")).toEqual([1, 2]);
  });
});

// ─── paramsToRecord ───────────────────────────────────────────────────────────

describe("paramsToRecord", () => {
  it("reads a number param from URLSearchParams", () => {
    const sp = new URLSearchParams("page=3");
    const result = paramsToRecord({ page: "number" }, sp);
    expect(result).toEqual({ page: 3 });
  });

  it("reads a boolean param from URLSearchParams", () => {
    const sp = new URLSearchParams("active=true");
    const result = paramsToRecord({ active: "boolean" }, sp);
    expect(result).toEqual({ active: true });
  });

  it("reads a string[] param from repeated keys", () => {
    const sp = new URLSearchParams("tags=a&tags=b");
    const result = paramsToRecord({ tags: "string[]" }, sp);
    expect(result).toEqual({ tags: ["a", "b"] });
  });

  it("omits schema keys that are absent from URLSearchParams", () => {
    const sp = new URLSearchParams("");
    const result = paramsToRecord({ page: "number" }, sp);
    expect(result).not.toHaveProperty("page");
  });

  it("preserves params not in schema in the source URLSearchParams", () => {
    const sp = new URLSearchParams("extra=keep&page=1");
    paramsToRecord({ page: "number" }, sp);
    // The source URLSearchParams should remain unchanged
    expect(sp.get("extra")).toBe("keep");
  });
});

// ─── recordToParams ───────────────────────────────────────────────────────────

describe("recordToParams", () => {
  it("serializes a number to a query param", () => {
    const sp = recordToParams({ page: "number" }, { page: 3 });
    expect(sp.get("page")).toBe("3");
  });

  it("serializes a boolean to a query param", () => {
    const sp = recordToParams({ active: "boolean" }, { active: true });
    expect(sp.get("active")).toBe("true");
  });

  it("serializes a string[] to repeated query params", () => {
    const sp = recordToParams({ tags: "string[]" }, { tags: ["a", "b"] });
    expect(sp.getAll("tags")).toEqual(["a", "b"]);
  });

  it("omits undefined values", () => {
    const sp = recordToParams({ page: "number" }, { page: undefined });
    expect(sp.has("page")).toBe(false);
  });

  it("round-trips a full schema", () => {
    const schema = {
      page: "number" as const,
      sort: "string" as const,
      active: "boolean" as const,
      tags: "string[]" as const,
    };
    const values = { page: 2, sort: "name", active: true, tags: ["react", "ts"] };
    const sp = recordToParams(schema, values);
    const back = paramsToRecord(schema, sp);
    expect(back).toEqual(values);
  });
});
