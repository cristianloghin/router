export type ParamType = "string" | "number" | "boolean" | "string[]" | "number[]";
export type ParamSchema = Record<string, ParamType>;

// Schema used by useQueryState — each entry has a type and optional default.
export type QueryParamDescriptor = {
  type: ParamType;
  default?: string | number | boolean | string[] | number[];
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

export type InferQueryState<TSchema extends QueryParamSchema> = {
  [K in keyof TSchema]: InferParamType<TSchema[K]["type"]>;
};

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
