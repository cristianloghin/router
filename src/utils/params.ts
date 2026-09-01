export type ParamType = "string" | "number" | "boolean" | "string[]" | "number[]";
export type ParamSchema = Record<string, ParamType>;

/** Every value a query param can deserialize to. */
export type QueryParamValue = string | number | boolean | string[] | number[];

// Schema used by useQueryState — each entry has a type and optional default.
export type QueryParamDescriptor = {
  type: ParamType;
  /**
   * Value to use when the key is absent from the URL.
   *
   * A thunk is called at read time, which is the only way to express a default
   * that is not a static literal — `default: () => todayISO()`.
   *
   * Declaring a default is also what makes the key *required* in
   * `InferQueryState`. Without one, an absent param is genuinely absent, and
   * the type says so.
   */
  default?: QueryParamValue | (() => QueryParamValue);
};
export type QueryParamSchema = Record<string, QueryParamDescriptor>;

// Infers the TS type for each key in a QueryParamSchema.
type InferParamType<T extends ParamType> =
  T extends "string"   ? string   :
  T extends "number"   ? number   :
  T extends "boolean"  ? boolean  :
  T extends "string[]" ? string[] :
  T extends "number[]" ? number[] :
  never;

/**
 * True only when a descriptor actually declares `default`. An optional
 * `default?:` does not satisfy `{ default: unknown }`, so a schema that omits
 * the key is correctly reported as having none.
 */
type HasDefault<TDescriptor> = TDescriptor extends { default: unknown } ? true : false;

/** Collapses an intersection into one object type, so tooltips stay readable. */
type Flatten<T> = { [K in keyof T]: T[K] };

/**
 * Infers the TS type of the record `useQueryState` returns.
 *
 * A key is **required** when its descriptor declares a `default` — that is the
 * only case in which a value is guaranteed. A key with no default is
 * **optional**, because an absent param yields no value at all: the hook omits
 * the key rather than filling it with `undefined`.
 */
export type InferQueryState<TSchema extends QueryParamSchema> = Flatten<
  {
    [K in keyof TSchema as HasDefault<TSchema[K]> extends true ? K : never]:
      InferParamType<TSchema[K]["type"]>;
  } & {
    [K in keyof TSchema as HasDefault<TSchema[K]> extends true ? never : K]?:
      InferParamType<TSchema[K]["type"]>;
  }
>;

// ─── Primitives ───────────────────────────────────────────────────────────────

export function serialize(value: unknown, type: ParamType): string | string[] {
  switch (type) {
    case "string":
      return String(value);
    case "number":
      return String(value);
    case "boolean":
      return String(value);
    case "string[]":
      return (value as string[]).map(String);
    case "number[]":
      return (value as number[]).map(String);
  }
}

export function deserialize(raw: string | string[] | undefined, type: ParamType): unknown {
  if (raw === undefined) return undefined;
  switch (type) {
    case "string":
      return raw as string;
    case "number":
      return Number(raw as string);
    case "boolean":
      return (raw as string) === "true";
    case "string[]":
      return Array.isArray(raw) ? raw : [raw];
    case "number[]":
      return Array.isArray(raw) ? raw.map(Number) : [Number(raw)];
  }
}

// ─── URLSearchParams integration ──────────────────────────────────────────────

/**
 * Reads schema-declared keys from URLSearchParams and returns a typed record.
 * Keys absent from the URLSearchParams are omitted from the result.
 * Keys not in the schema are left untouched in the URLSearchParams.
 */
export function paramsToRecord<TSchema extends ParamSchema>(
  schema: TSchema,
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(schema)) {
    if (type === "string[]" || type === "number[]") {
      const values = searchParams.getAll(key);
      if (values.length > 0) {
        result[key] = deserialize(values, type);
      }
    } else {
      const value = searchParams.get(key);
      if (value !== null) {
        result[key] = deserialize(value, type);
      }
    }
  }
  return result;
}

/**
 * Writes schema-declared values to a new URLSearchParams instance.
 * Undefined values are omitted. Empty arrays produce no keys.
 */
export function recordToParams<TSchema extends ParamSchema>(
  schema: TSchema,
  values: Record<string, unknown>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, type] of Object.entries(schema)) {
    const value = values[key];
    if (value === undefined) continue;
    const serialized = serialize(value, type);
    if (Array.isArray(serialized)) {
      for (const v of serialized) {
        params.append(key, v);
      }
    } else {
      params.set(key, serialized);
    }
  }
  return params;
}
