import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  NavigateArgs,
  BuildPathArgs,
  ExtractParams,
  NavigateOptions,
  RoutePath,
} from "./types";

// Type-level tests for the Register-driven route typing (spec §4.2/§4.11).
// These compile-time assertions are enforced by `tsc --noEmit`.

describe("typed route arguments", () => {
  it("ExtractParams derives typed records from path patterns", () => {
    expectTypeOf<ExtractParams<"/camera/:id">>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<ExtractParams<"/a/:x/b/:y">>().toEqualTypeOf<{ x: string; y: string }>();
    expectTypeOf<ExtractParams<"/settings">>().toEqualTypeOf<Record<string, never>>();
    expect(true).toBe(true);
  });

  it("NavigateArgs makes options optional for param-less paths", () => {
    expectTypeOf<NavigateArgs<"/settings">>().toEqualTypeOf<[options?: NavigateOptions]>();
    expect(true).toBe(true);
  });

  it("NavigateArgs requires params for parametric paths", () => {
    type Args = NavigateArgs<"/camera/:id">;
    expectTypeOf<Args[0]["params"]>().toEqualTypeOf<{ id: string }>();
    // The tuple has exactly one required element.
    expectTypeOf<Args["length"]>().toEqualTypeOf<1>();
    expect(true).toBe(true);
  });

  it("BuildPathArgs requires params only for parametric paths", () => {
    type NoParams = BuildPathArgs<"/settings">;
    type WithParams = BuildPathArgs<"/camera/:id">;
    expectTypeOf<NoParams["length"]>().toEqualTypeOf<0 | 1>();
    expectTypeOf<WithParams[0]>().toEqualTypeOf<{ id: string }>();
    expect(true).toBe(true);
  });

  it("RoutePath is plain string when no routes are Registered", () => {
    expectTypeOf<RoutePath>().toEqualTypeOf<string>();
    expect(true).toBe(true);
  });
});

// ─── schema-first workspace typing (v0.2 API) ────────────────────────────────

import type {
  InferSchemaParams,
  InferParams,
  RegisteredWorkspaces,
  WorkspaceTemplateMap,
  WorkspaceTemplate,
} from "../workspaces/types";

describe("schema-first workspace params", () => {
  it("InferSchemaParams derives typed records from schema literals", () => {
    expectTypeOf<
      InferSchemaParams<{ cameraId: "string"; count: "number"; live: "boolean"; ids: "string[]"; nums: "number[]" }>
    >().toEqualTypeOf<{ cameraId: string; count: number; live: boolean; ids: string[]; nums: number[] }>();
    expect(true).toBe(true);
  });

  it("InferParams derives from the schema when present", () => {
    expectTypeOf<InferParams<{ schema: { cameraId: "string" } }>>().toEqualTypeOf<{
      cameraId: string;
    }>();
    expect(true).toBe(true);
  });

  it("InferParams falls back to the WorkspaceTemplate generic without a schema", () => {
    expectTypeOf<InferParams<WorkspaceTemplate<{ x: string }>>>().toEqualTypeOf<{ x: string }>();
    expect(true).toBe(true);
  });

  it("RegisteredWorkspaces is the loose map when unregistered", () => {
    expectTypeOf<RegisteredWorkspaces>().toEqualTypeOf<WorkspaceTemplateMap>();
    expect(true).toBe(true);
  });
});
