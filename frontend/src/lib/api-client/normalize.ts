// Typed response normalisers (audit B-23). The backend has shipped several
// envelope shapes for the same data over time (bare array, `{items}`,
// `{feeds}`, ...), so call sites used to reach in with ad-hoc `as {…}`
// casts. These helpers do the narrowing once, with runtime checks, so a
// shape regression degrades to an empty list / undefined instead of a crash.

/** `x` as a plain object, or null when it's a primitive, array or null. */
export function asRecord(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

/** `obj[key]` when it's a string. */
export function stringField(x: unknown, key: string): string | undefined {
  const v = asRecord(x)?.[key];
  return typeof v === "string" ? v : undefined;
}

/** `obj[key]` when it's a finite number. */
export function numberField(x: unknown, key: string): number | undefined {
  const v = asRecord(x)?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The backend's human-readable `message`, if it sent one. */
export const messageOf = (data: unknown): string | undefined => stringField(data, "message");

/**
 * Unwrap a list that may arrive bare or inside one of `keys` (first array
 * wins). Returns [] when none match. Rows are trusted as `T` — the element
 * shape is the backend contract; only the envelope is defensive here.
 */
export function listFrom<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  const o = asRecord(data);
  if (o) {
    for (const key of keys) {
      const v = o[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
