// Feed taxonomy, diet limits, cattle-info fields, diet evaluation /
// recommendation, custom feeds and feed search.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api, langParam } from "./client";
import type { DietLimits, EvaluationRequest, RecommendationRequest } from "./models";

// ─── Feed taxonomy (JWT-protected) ──────────────────────────────────────────
// user_id no longer passed — derived from the JWT by the backend.
// Path / param renames vs legacy:
//   /unique-feed-type/{country_id}/{user_id}  →  /v1/animal/unique-feed-type/{country_id}
//   /unique-feed-category?feed_type=&country_id=&user_id=
//                                              →  /v1/animal/unique-feed-category?country_id=&feed_type=
//   /feed-name?feed_type=&feed_category=&country_id=&user_id=
//                                              →  /v1/animal/feed-name?country_id=&feed_type=&category=
//     NOTE: query param renamed from feed_category to category.

// i18n V2 — identity-only: FORCE lang=en on unique-feed-type /
// unique-feed-category, never the active locale, and never omitted.
//
// Verified 2026-07-08: passing the ACTIVE (non-English) lang makes both
// endpoints return BARE translated strings with no separate identity/
// display split — storing that as the row's identity breaks the
// downstream /v1/animal/feed-name filter, which only accepts the
// ENGLISH source string as feed_type / category (returns empty on a
// Hindi identity).
//
// Verified 2026-07-13 (live network capture): omitting ?lang= entirely
// is NOT the same as requesting English — these endpoints fall back to
// the AUTHENTICATED USER'S ACCOUNT-level preferred_language server-side
// when no lang param is given at all, regardless of any per-simulation
// override the frontend is tracking. A user whose profile is Hindi got
// `{"feed_types":["सांद्र आहार (दाना)","चारा"]}` back with zero lang
// param sent, even though the active simulation language was English.
// Explicitly requesting lang=en sidesteps both problems at once: English
// is the baseline lang everywhere else in this API, so it returns a bare
// array of plain English strings — usable directly as identity, exactly
// like the un-translated response used to look, and never influenced by
// the account's own language setting.
// Feed Type + Feed Category labels stay English regardless of active
// locale; the Feed name itself still translates via /v1/animal/feed-name
// (that endpoint separately returns display_name and DOES honor an
// explicit non-English lang — see getFeedSubCategories/
// fetchFeedTaxonomyLabels below).
export const getFeedTypes = (country_id: string, _user_id?: string) =>
  api.get(`/v1/animal/unique-feed-type/${country_id}`, { params: { lang: "en" } });

export const getFeedTypesLocalized = getFeedTypes;

// QA row 5/6 — "after selecting a Feed Type, the Feed Category menu should
// show only the categories applicable to that type".
//
// ROOT CAUSE: `/v1/animal/unique-feed-category` accepts ONLY `country_id`
// and `lang` (confirmed against the v1 OpenAPI spec). The `feed_type` we
// have always sent is not a parameter of that endpoint, so FastAPI drops it
// and the response is every category in the country — Concentrate categories
// offered under Forage and vice versa.
//
// The type→category mapping lives on the feed-classification endpoints
// (no auth required):
//   GET /v1/feed-classification/get-feed-types           → [{ id, type_name }]
//   GET /v1/feed-classification/get-categories/{type_id} → [{ category_name }]
//
// We use that pair to FILTER the country list rather than to replace it. The
// country call is what guarantees a category actually has feeds available
// here; the classification call is what guarantees it belongs to this type.
// Both matter, so we intersect.
//
// Every failure path degrades to "no filtering" — the pre-existing behaviour.
// A taxonomy mismatch must never empty the dropdown: an over-broad list is a
// nuisance, an empty one is a dead end ("just the arrows, nothing loads").
type FeedClassificationType = { id?: string; type_name?: string };
type FeedClassificationCategory = { category_name?: string; name?: string };

const normalizeTaxonomyName = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

let feedTypeCatalogPromise: Promise<FeedClassificationType[]> | null = null;
const categoryNamesByTypeId = new Map<string, Promise<string[]>>();

async function allowedCategoryNamesForType(feed_type: string): Promise<Set<string> | null> {
  if (!feed_type) return null;
  try {
    if (!feedTypeCatalogPromise) {
      feedTypeCatalogPromise = api
        .get("/v1/feed-classification/get-feed-types", { params: { lang: "en" } })
        .then((r) => (Array.isArray(r.data) ? (r.data as FeedClassificationType[]) : []))
        .catch((err) => {
          // Don't let one transient failure poison the cache for the session.
          feedTypeCatalogPromise = null;
          throw err;
        });
    }
    const catalog = await feedTypeCatalogPromise;
    const typeId = catalog.find(
      (t) => normalizeTaxonomyName(t.type_name) === normalizeTaxonomyName(feed_type)
    )?.id;
    // A country-specific type with no classification entry: leave it alone
    // rather than filtering it down to nothing.
    if (!typeId) return null;

    let namesPromise = categoryNamesByTypeId.get(typeId);
    if (!namesPromise) {
      namesPromise = api
        .get(`/v1/feed-classification/get-categories/${typeId}`, { params: { lang: "en" } })
        .then((r) =>
          (Array.isArray(r.data) ? (r.data as FeedClassificationCategory[]) : [])
            .map((c) => c.category_name ?? c.name ?? "")
            .filter(Boolean)
        )
        .catch((err) => {
          categoryNamesByTypeId.delete(typeId);
          throw err;
        });
      categoryNamesByTypeId.set(typeId, namesPromise);
    }
    const names = await namesPromise;
    return names.length > 0 ? new Set(names.map(normalizeTaxonomyName)) : null;
  } catch {
    return null;
  }
}

// Pulls the category rows out of whichever wrapper the backend used, without
// changing the rows themselves — callers still parse them as they always did.
function unwrapCategoryRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["categories", "unique_feed_categories", "feed_categories"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return null;
}

const categoryRowName = (row: unknown): string => {
  if (typeof row === "string") return row;
  const o = row as { category_name?: string; name?: string };
  return o?.category_name ?? o?.name ?? "";
};

/**
 * Clears the feed-classification caches above. Exists for tests only — the
 * type→category mapping is static per deployment, so nothing in the app
 * needs to invalidate it.
 */
export function __resetFeedClassificationCache(): void {
  feedTypeCatalogPromise = null;
  categoryNamesByTypeId.clear();
}

export const getFeedCategories = async (
  feed_type: string,
  country_id: string,
  _user_id?: string
) => {
  const res = await api.get("/v1/animal/unique-feed-category", {
    params: { country_id, feed_type, lang: "en" },
  });
  const rows = unwrapCategoryRows(res.data);
  if (!rows) return res; // unrecognized shape — hand it back untouched
  const allowed = await allowedCategoryNamesForType(feed_type);
  if (!allowed) return res;
  const filtered = rows.filter((row) => allowed.has(normalizeTaxonomyName(categoryRowName(row))));
  // Empty intersection means the two vocabularies disagree, not that the type
  // has no categories. Keep the unfiltered list.
  if (filtered.length === 0) return res;
  return { ...res, data: filtered };
};

export const getFeedCategoriesLocalized = (feed_type: string, country_id: string) =>
  getFeedCategories(feed_type, country_id);

// Returns List<FeedSubCategory> with {feed_name, feed_uuid, feed_category, feed_type, feed_cd}
// i18n V2 — force lang=en here instead of the active locale (rather than
// omitting the param). Verified 2026-07-13: for languages whose per-feed
// translation coverage is incomplete (see the admin Coverage bars — Feed
// Types/Categories are commonly 100%, individual Feed names often
// aren't), passing the ACTIVE lang to this name+category-filtered query
// comes back empty for any feed lacking a translation row, even though
// the feed exists and has full English data — the dropdown renders with
// zero options ("just the arrows, nothing loads"). lang=en is the one
// value confirmed (via a live network capture) to always return the
// complete standard_feeds/custom_feeds list; identity is fetched with it
// and the localized label is overlaid separately via `taxonomyLabels.feeds`
// (see fetchFeedTaxonomyLabels below, sourced from the SAME endpoint's
// unfiltered country-wide call, which already falls back to English when
// a translation is missing).
export const getFeedSubCategories = (
  feed_type: string,
  feed_category: string,
  country_id: string,
  _user_id?: string
) =>
  api.get("/v1/animal/feed-name", {
    params: { country_id, feed_type, category: feed_category, lang: "en" },
  });

// GET /v1/animal/feed-details/{feed_id} — full nutritional detail for a single
// feed (fd_name, fd_type, fd_category, fd_dm, fd_cp, …). The custom-feeds/check
// endpoint no longer returns nutrients, so the FeedRow edit dialog uses this to
// prefill the form. Works for both standard and user-owned custom feeds.
export const getFeedDetails = (feed_id: string) => api.get(`/v1/animal/feed-details/${feed_id}`);

// i18n V2 — client-side translation dictionary for Feed Type + Category
// labels. Backend `/v1/animal/unique-feed-type` and unique-feed-category
// only return the identity string, so we can't localize their labels
// directly. But `/v1/animal/feed-name?country_id=X&lang=hi` (no
// feed_type/category filter) returns EVERY feed in the country, and
// each item carries both English (`fd_type`, `fd_category`) and localized
// (`display_type`, `display_category`) fields. One call gives us a full
// translation map for both dimensions, PLUS a per-feed id → display_name
// map (`feeds`) that getFeedSubCategories' now-English-only fetch overlays
// onto its (always-complete) identity list. Cached per (country_id, lang).
export type FeedTaxonomyLabels = {
  types: Record<string, string>; // English identity → localized label
  categories: Record<string, string>; // English identity → localized label
  feeds: Record<string, string>; // feed id/uuid → localized display_name
};

export async function fetchFeedTaxonomyLabels(country_id: string): Promise<FeedTaxonomyLabels> {
  const res = await api.get("/v1/animal/feed-name", {
    params: { country_id, ...langParam() },
  });
  const feeds =
    (res.data as {
      standard_feeds?: {
        id?: string;
        feed_id?: string;
        fd_type?: string;
        display_type?: string;
        fd_category?: string;
        display_category?: string;
        display_name?: string;
      }[];
      custom_feeds?: {
        id?: string;
        feed_id?: string;
        fd_type?: string;
        display_type?: string;
        fd_category?: string;
        display_category?: string;
        display_name?: string;
      }[];
    }) ?? {};
  const merged = [...(feeds.standard_feeds ?? []), ...(feeds.custom_feeds ?? [])];
  const types: Record<string, string> = {};
  const categories: Record<string, string> = {};
  const feedNames: Record<string, string> = {};
  for (const f of merged) {
    if (f.fd_type && f.display_type) types[f.fd_type] = f.display_type;
    if (f.fd_category && f.display_category) categories[f.fd_category] = f.display_category;
    const uuid = f.id ?? f.feed_id;
    if (uuid && f.display_name) feedNames[uuid] = f.display_name;
  }
  return { types, categories, feeds: feedNames };
}

// ─── Custom Diet Limits discovery (JWT-protected) ───────────────────────────
// GET /v1/animal/diet-thresholds?physiological_state=Lactating%20Cow
//
// The ONLY source of truth for what the Custom Diet Limits dialog may offer.
// Do NOT hardcode ranges next to it: the accepted range differs per
// physiological state and the engine's values are retuned from time to time
// (a 2026-07-27 retune shipped without the frontend noticing, which is why
// this endpoint exists). Returns 422 for an unknown state and for
// "Baby Calf/Heifer", which is answered with a milk-feeding schedule rather
// than a formulated ration and therefore has no limits to edit.
export interface DietThresholdSpec {
  key: keyof DietLimits;
  /** Engine default for THIS animal, expressed in `unit`. */
  default: number;
  /** Smallest accepted value. Equals `default` when direction is "min". */
  min: number;
  /** Largest accepted value. Equals `default` when direction is "max". */
  max: number;
  /** pct_dm = % of diet DM · mcal_day / kg_day = absolute, never scaled. */
  unit: "pct_dm" | "mcal_day" | "kg_day";
  /** "max" = a ceiling (tightening lowers it) · "min" = a floor (tightening raises it). */
  direction: "max" | "min";
  /**
   * hard               — tightening can return no diet at all (INFEASIBLE)
   * soft               — only penalised in the cost objective, so the diet
   *                      may exceed it
   * hard_after_switch  — soft early in the solve, enforced hard at the end
   *
   * NOT surfaced in the UI. An earlier build rendered `soft` rows as a
   * "Target" badge and the rest as "Limit"; on 2026-09-22 the user
   * (Maria + Satish) ruled that all eight are limits and the hard/soft
   * split is an engine detail — the badge was removed. The field stays on
   * the type because the payload contract and future engine-side work
   * still depend on it; don't reintroduce the badge.
   */
  enforcement: "hard" | "soft" | "hard_after_switch";
}

export interface DietThresholdsResponse {
  physiological_state: string;
  thresholds: DietThresholdSpec[];
}

export const getDietThresholds = (physiological_state: string) =>
  api.get<DietThresholdsResponse>("/v1/animal/diet-thresholds", {
    params: { physiological_state },
  });

// ─── Cattle Info form layout discovery (JWT-protected) ──────────────────────
// GET /v1/animal/cattle-info-fields?physiological_state=Lactating%20Cow
//
// The ONLY source of truth for what the Cattle Info form shows, prefills and
// accepts. Visibility, defaults and ranges all differ per physiological state
// and are retuned server-side, and the SAME table validates `cattle_info` on
// the two diet POSTs — a value outside [min, max] is a 422 there. Do NOT
// hardcode any of it beside this call (same rule as getDietThresholds).
//
// Contract: every field is always returned. RENDER on `visible`, but SUBMIT
// every field — a hidden one goes out as its `default`. That is how
// "Baby Calf/Heifer" renders a single input while the body stays complete.
// `label` / `unit` are English reference strings only; the form owns (and
// translates) its own labels.
export interface CattleInfoFieldSpec {
  key: CattleInfoFieldKey;
  label: string;
  unit: string | null;
  visible: boolean;
  type: "number" | "enum" | "boolean";
  default: number | string | boolean | null;
  min: number | null;
  max: number | null;
  options: string[] | null;
  /** Present on `distance` only — replaces default/min while grazing is ON. */
  when_grazing_on?: { default: number; min: number } | null;
}

export interface CattleInfoFieldsResponse {
  physiological_state: string;
  fields: CattleInfoFieldSpec[];
}

/** Wire keys inside `cattle_info` (see CattleInfoPayload). */
export type CattleInfoFieldKey =
  | "breed"
  | "body_weight"
  | "bw_gain"
  | "bc_score"
  | "days_in_milk"
  | "milk_production"
  | "tp_milk"
  | "fat_milk"
  | "parity"
  | "days_of_pregnancy"
  | "temperature"
  | "grazing"
  | "distance"
  | "topography"
  | "milk_price";

export const getCattleInfoFields = (physiological_state: string) =>
  api.get<CattleInfoFieldsResponse>("/v1/animal/cattle-info-fields", {
    params: { physiological_state },
  });

// Human labels for the eight keys. The endpoint returns the key, the range and
// the unit, but no display name — these stay client-side so they can go
// through the UI-label i18n dictionary like every other string.
export const DIET_LIMIT_LABELS: Record<keyof DietLimits, string> = {
  ash_max: "Ash Max",
  ee_max: "EE Max — Fat",
  ndf_max: "NDF Max — Fiber",
  starch_max: "Starch Max",
  conc_max: "Concentrate Max",
  ndf_for_min: "Forage NDF Min",
  nel_balance_max: "Energy Surplus Max",
  mp_balance_max: "Protein Surplus Max",
};

// Display order for the Custom Diet Limits dialog, specified by Maria on
// 2026-09-22: most-adjusted first, the two absolute-unit surplus keys last.
// The backend returns `thresholds` in its own (engine) order, so the dialog
// sorts with this table. A key the backend adds later that isn't listed here
// still renders — it lands after the known eight rather than disappearing.
export const DIET_LIMIT_DISPLAY_ORDER: (keyof DietLimits)[] = [
  "ndf_for_min",
  "ndf_max",
  "starch_max",
  "conc_max",
  "ee_max",
  "ash_max",
  "nel_balance_max",
  "mp_balance_max",
];

export function sortDietThresholds(specs: DietThresholdSpec[]): DietThresholdSpec[] {
  const rank = (key: keyof DietLimits) => {
    const i = DIET_LIMIT_DISPLAY_ORDER.indexOf(key);
    return i === -1 ? DIET_LIMIT_DISPLAY_ORDER.length : i;
  };
  return [...specs].sort((a, b) => rank(a.key) - rank(b.key));
}

// Unit suffix shown beside the label and in the range hint. `pct_dm` values are
// percentages of diet DM; the other two are ABSOLUTE daily amounts and are sent
// exactly as entered — see the DietLimits contract.
export const DIET_LIMIT_UNIT_LABELS: Record<DietThresholdSpec["unit"], string> = {
  pct_dm: "%",
  mcal_day: "Mcal/day",
  kg_day: "kg/day",
};

// ─── Evaluation & Recommendation (JWT-protected) ────────────────────────────
// i18n V2 — `lang` is a QUERY parameter on these two POSTs, never a body
// field (a `lang` key inside the JSON is silently ignored, and the backend
// then falls back to the account's profile language with no error). It
// matters more here than anywhere else: the backend renders and PERSISTS
// `report_html` at creation time in whichever language the request resolved
// to, and the PDF reuses that stored HTML — so omitting it freezes the report
// in the profile language for a simulation the user ran in another one.
// langParam() resolves cattleInfo.simulation_language first, which is exactly
// the per-simulation LANGUAGE picked on Cattle Info.

export const evaluateDiet = (data: EvaluationRequest) =>
  api.post("/v1/animal/evaluate-diet", data, { params: { ...langParam() } });

export const recommendDiet = (data: RecommendationRequest) =>
  api.post("/v1/animal/diet-recommendation", data, { params: { ...langParam() } });

// ─── Custom Feed (user, JWT-protected) ──────────────────────────────────────
// All three endpoints restructured:
//   POST /check-insert-or-update body{country_id,feed_id,user_id}
//     → POST /v1/animal/custom-feeds/check?feed_id=...
//   POST /insert-custom-feed
//     → POST /v1/animal/custom-feeds
//   POST /update-custom-feed (with feed_id in body)
//     → PUT  /v1/animal/custom-feeds?feed_id=... (note method + query param!)
// user_id derived from JWT in all three.

// Response shape (verified live against the dev backend on 2026-08-10):
//   { action: "insert" | "update", feed_id: string }
// It is UUID-based: an owned custom-feed UUID → "update"; a non-owned
// (standard) feed UUID *or* a plain name string → "insert". The legacy
// { insert_feed, feed_details:{ feed_id } } shape no longer exists — callers
// must key off `action` / `feed_id`.
export const checkInsertOrUpdate = (_country_id: string, feed_id: string, _user_id: string) =>
  api.post("/v1/animal/custom-feeds/check", null, { params: { feed_id } });

// The v1 backend reads custom-feed fields FLAT at the top level of the body:
// fd_name, fd_country_name, a taxonomy selection (feed_type_id +
// feed_category_id, or legacy fd_type + fd_category text which the server
// canonicalizes), and fd_* nutrients. Verified live on 2026-08-10 — burying
// these under a `feed_details` envelope made the server reply
// "feed_type_id + feed_category_id (or fd_type + fd_category) are required".
// The legacy envelope keys (country_id, user_id, feed_insert) are ignored
// (user is JWT-derived), so we hoist feed_details to the top level and rename
// feed_name → fd_name, country_name → fd_country_name. Both call sites keep
// building the same structured `feed_details`; this is the one place that
// knows the wire format.
const toCustomFeedWire = (feed_details: Record<string, unknown>) => {
  // Drop the legacy text dupes (feed_type/feed_category) — the backend wants
  // fd_type/fd_category, which the call sites already include. Also drop
  // country_code: sending it made the v1 backend return 500 (verified live
  // 2026-08-10); it wants fd_country_name only. Keep fd_type/fd_category and
  // the fd_* nutrients.
  const {
    feed_name,
    country_name,
    feed_type: _ft,
    feed_category: _fc,
    country_code: _cc,
    ...rest
  } = feed_details;
  return {
    ...rest,
    ...(feed_name != null ? { fd_name: feed_name } : {}),
    ...(country_name != null ? { fd_country_name: country_name } : {}),
  };
};

export const insertCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) => api.post("/v1/animal/custom-feeds", toCustomFeedWire(body.feed_details));

export const updateCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) =>
  api.put("/v1/animal/custom-feeds", toCustomFeedWire(body.feed_details), {
    params: { feed_id: body.feed_id },
  });

// GET /v1/feed-classification/structure (JWT-protected)
export const getFeedClassification = () => api.get("/v1/feed-classification/structure");

// Y3 §1.1.1 — feed search. Live backend endpoint per
// docs/Search_Implmentation.md §9.1:
//   GET /v1/animal/search-feeds?query=...&country_id=...&limit=20
// JWT comes from the axios interceptor; no user_id query param.
// Response is defensively parsed so the UI keeps working if the
// backend shape drifts (per §6 of the spec, three wrappers accepted).
export interface FeedSearchResult {
  feed_uuid: string;
  feed_name: string; // English source — stable; used to talk to backend
  feed_type: string; // English source
  feed_category: string; // English source
  // The untranslated source name, always present on the v1 response and equal
  // to feed_name when the request resolved to English.
  //
  // Why it exists: the backend searches the English name UNCONDITIONALLY plus
  // the request's own language. So a Hindi-operating user can type "corn",
  // match the English name, and get back a row displayed as
  // "मक्का का पौधा" — containing none of the characters they typed. Correct,
  // but it reads as a bug unless we show why it matched.
  //
  // For a custom feed this is whatever the user typed and may not be English;
  // the "only render when it differs" rule hides that case, since custom
  // feeds are never translated.
  feed_name_en?: string;
  // i18n V2 — translated strings for display only. Server falls back to the
  // English source when no translation exists, so these are always populated.
  // Renderers MUST use display_* fields; identifier comparisons MUST use
  // feed_name / feed_type / feed_category.
  display_name?: string;
  display_type?: string;
  display_category?: string;
  is_custom?: boolean;
}

// Internal shape — what a single row looks like before we normalize it.
type RawFeed = {
  feed_uuid?: string;
  feed_id?: string;
  id?: string;
  feed_name?: string;
  feed_name_en?: string;
  fd_name?: string;
  name?: string;
  feed_type?: string;
  type_name?: string;
  feed_category?: string;
  category_name?: string;
  display_name?: string;
  display_type?: string;
  display_category?: string;
  is_custom?: boolean;
};

function normalizeRow(r: RawFeed): FeedSearchResult | null {
  const feed_uuid = r.feed_uuid ?? r.feed_id ?? r.id;
  const feed_name = r.fd_name ?? r.feed_name ?? r.name;
  const feed_type = r.feed_type ?? r.type_name ?? "";
  const feed_category = r.feed_category ?? r.category_name ?? "";
  if (!feed_uuid || !feed_name) return null;
  return {
    feed_uuid,
    feed_name,
    feed_type,
    feed_category,
    feed_name_en: r.feed_name_en ?? feed_name,
    // display_* always falls back to its English source so callers can use
    // display_name unconditionally without an extra ?? in JSX.
    display_name: r.display_name ?? feed_name,
    display_type: r.display_type ?? feed_type,
    display_category: r.display_category ?? feed_category,
    is_custom: r.is_custom,
  };
}

export const searchFeeds = async (
  query: string,
  country_id: string,
  _user_id: string
): Promise<{ data: FeedSearchResult[] }> => {
  if (!query.trim() || !country_id) return { data: [] };
  try {
    const res = await api.get("/v1/animal/search-feeds", {
      params: { query: query.trim(), country_id, limit: 20, ...langParam() },
    });
    const body = res.data as unknown;

    // Accepted shapes (preferred → fallback):
    //   { feeds: [...], total_count: N }
    //   [...] bare array
    //   { results: [...] }
    //   { standard_feeds: [...], custom_feeds: [...] }  — concatenate
    let raw: RawFeed[] = [];
    if (Array.isArray(body)) {
      raw = body as RawFeed[];
    } else if (body && typeof body === "object") {
      const o = body as {
        feeds?: RawFeed[];
        results?: RawFeed[];
        standard_feeds?: RawFeed[];
        custom_feeds?: RawFeed[];
      };
      if (Array.isArray(o.feeds)) raw = o.feeds;
      else if (Array.isArray(o.results)) raw = o.results;
      else if (Array.isArray(o.standard_feeds) || Array.isArray(o.custom_feeds)) {
        raw = [
          ...(o.standard_feeds ?? []),
          ...(o.custom_feeds ?? []).map((f) => ({ ...f, is_custom: true })),
        ];
      }
    }
    const normalized = raw.map(normalizeRow).filter((r): r is FeedSearchResult => r !== null);
    return { data: normalized };
  } catch {
    // Logged (status + URL only) by the axios error interceptor.
    return { data: [] };
  }
};
