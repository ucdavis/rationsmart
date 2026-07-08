// Backend `/v1/animal/unique-feed-type` returns BARE translated strings
// when ?lang= is set — there is no separate identity + display field.
// A row picked while the user was on Hindi has `feed_type_name = "चारा"`,
// a row picked while on English has `feed_type_name = "Forage"`. Any
// business rule that "means Forage" must accept every translation.
//
// Add entries as new languages come online. When Maria/backend adds a
// proper `display_type` field on unique-feed-type, this file can go
// away and the frontend can revert to using English identity everywhere.

export const FORAGE_ALIASES: ReadonlySet<string> = new Set([
  "Forage",                          // en
  "चारा",                            // hi — verified 2026-07-08 vs <DEV_BACKEND_IP>:8000
]);

export const ROUGHAGE_ALIASES: ReadonlySet<string> = new Set([
  "Roughage",                        // en
]);

export const isForageType = (name: string | null | undefined): boolean =>
  !!name && FORAGE_ALIASES.has(name);

export const isRoughageType = (name: string | null | undefined): boolean =>
  !!name && ROUGHAGE_ALIASES.has(name);
