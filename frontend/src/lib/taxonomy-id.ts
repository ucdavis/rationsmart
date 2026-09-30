// Stable client-side ids for feed types / categories (audit B-24). The ids
// only exist so the dropdowns can match a row's stored selection — they are
// never sent to the backend — but they used to be list positions (i + 1),
// which change whenever a refetch, a filter or a language switch reorders
// the list. Deriving them from the English identity name (CLAUDE.md §18.4)
// keeps the same id for the same type / category everywhere.

/** 32-bit FNV-1a hash of `name`, as a positive integer (never 0). */
export function taxonomyId(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}
