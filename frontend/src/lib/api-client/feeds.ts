// Feed taxonomy, custom feeds and feed search (diet limits, cattle-info
// fields and the diet POSTs live in ./diet).
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api, langParam } from "./client";
import { asRecord, listFrom, stringField } from "./normalize";

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
const getCountryFeedTypes = (country_id: string) =>
  api.get(`/v1/animal/unique-feed-type/${country_id}`, { params: { lang: "en" } });

// unique-feed-type lists only the types that already have feeds in the
// country, so a type the admin just added to the catalogue ("Complete diet",
// 2026-09-22) never showed up until feeds were tagged with it. The user asked
// (2026-10-22) for every active catalogue type to be offered: the country
// list is merged with /v1/feed-classification/get-feed-types and ordered by
// the catalogue's sort_order (Forage, Concentrate, Complete diet). A
// country-only type the catalogue lacks is kept, after the catalogue ones.
// If the catalogue fails, the country list is returned unchanged.
export const getFeedTypes = async (country_id: string, _user_id?: string) => {
  const res = await getCountryFeedTypes(country_id);
  let catalog: FeedClassificationType[];
  try {
    catalog = await feedTypeCatalog();
  } catch {
    return res;
  }
  const countryNames = parseFeedTypeOptions(res.data).map((o) => o.name);
  const active = catalog
    .filter((t) => t.type_name && t.is_active !== false)
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
  if (active.length === 0) return res;
  const catalogKeys = new Set(active.map((t) => normalizeTaxonomyName(t.type_name)));
  const merged = [
    ...active.map(
      (t) =>
        countryNames.find(
          (n) => normalizeTaxonomyName(n) === normalizeTaxonomyName(t.type_name)
        ) ?? (t.type_name as string)
    ),
    ...countryNames.filter((n) => !catalogKeys.has(normalizeTaxonomyName(n))),
  ];
  return { ...res, data: { feed_types: merged } };
};

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
type FeedClassificationType = {
  id?: string;
  type_name?: string;
  sort_order?: number;
  is_active?: boolean;
};
type FeedClassificationCategory = { category_name?: string; name?: string };

const normalizeTaxonomyName = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

let feedTypeCatalogPromise: Promise<FeedClassificationType[]> | null = null;
const categoryNamesByTypeId = new Map<string, Promise<string[]>>();

function feedTypeCatalog(): Promise<FeedClassificationType[]> {
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
  return feedTypeCatalogPromise;
}

// The catalogue's category names for a type, in catalogue order; null when
// the type isn't in the catalogue or the lookup fails.
async function catalogCategoryNamesForType(feed_type: string): Promise<string[] | null> {
  if (!feed_type) return null;
  try {
    const catalog = await feedTypeCatalog();
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
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

async function allowedCategoryNamesForType(feed_type: string): Promise<Set<string> | null> {
  const names = await catalogCategoryNamesForType(feed_type);
  return names ? new Set(names.map(normalizeTaxonomyName)) : null;
}

// Pulls the category rows out of whichever wrapper the backend used, without
// changing the rows themselves — callers still parse them as they always did.
function unwrapCategoryRows(data: unknown): unknown[] | null {
  const keys = ["categories", "unique_feed_categories", "feed_categories"];
  const hasList = Array.isArray(data) || keys.some((k) => Array.isArray(asRecord(data)?.[k]));
  return hasList ? listFrom<unknown>(data, ...keys) : null;
}

const categoryRowName = (row: unknown): string => {
  if (typeof row === "string") return row;
  return stringField(row, "category_name") ?? stringField(row, "name") ?? "";
};

// True when unique-feed-type lists the type for this country (or when that
// can't be checked — the caller then keeps its old fallback).
async function typeHasCountryFeeds(feed_type: string, country_id: string): Promise<boolean> {
  try {
    const res = await getCountryFeedTypes(country_id);
    const key = normalizeTaxonomyName(feed_type);
    return parseFeedTypeOptions(res.data).some((o) => normalizeTaxonomyName(o.name) === key);
  } catch {
    return true;
  }
}

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
  if (filtered.length === 0) {
    // A catalogue-only type (offered by getFeedTypes but with no feeds in
    // this country yet, e.g. "Complete diet") has no categories in the
    // country list at all — offer the catalogue's own categories instead of
    // every category in the country.
    if (!(await typeHasCountryFeeds(feed_type, country_id))) {
      const names = await catalogCategoryNamesForType(feed_type);
      if (names) return { ...res, data: { feed_categories: names } };
    }
    // Otherwise the two vocabularies disagree, not that the type has no
    // categories. Keep the unfiltered list.
    return res;
  }
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

// One row of GET /v1/animal/feed-name (standard or custom), as read here.
interface FeedNameRow {
  id?: string;
  feed_id?: string;
  fd_type?: string;
  display_type?: string;
  fd_category?: string;
  display_category?: string;
  display_name?: string;
}

export async function fetchFeedTaxonomyLabels(country_id: string): Promise<FeedTaxonomyLabels> {
  const res = await api.get("/v1/animal/feed-name", {
    params: { country_id, ...langParam() },
  });
  // Rows are only read for their optional string fields, so a missing
  // or reshaped envelope just yields empty label maps.
  const envelope = asRecord(res.data);
  const merged = [
    ...listFrom<FeedNameRow>(envelope?.standard_feeds),
    ...listFrom<FeedNameRow>(envelope?.custom_feeds),
  ];
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
// v1 answers { action, feed_id }; legacy backends sent the booleans.
export interface CustomFeedCheckResponse {
  action?: "insert" | "update";
  feed_id?: string;
  is_insert?: boolean;
  insert_feed?: boolean;
}

export const checkInsertOrUpdate = (_country_id: string, feed_id: string, _user_id: string) =>
  api.post<CustomFeedCheckResponse | null>("/v1/animal/custom-feeds/check", null, {
    params: { feed_id },
  });

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
// Search contract:
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
    const body: unknown = res.data;

    // Accepted shapes (preferred → fallback):
    //   { feeds: [...], total_count: N }
    //   [...] bare array
    //   { results: [...] }
    //   { standard_feeds: [...], custom_feeds: [...] }  — concatenate
    let raw = listFrom<RawFeed>(body, "feeds", "results");
    const envelope = asRecord(body);
    if (!raw.length && envelope) {
      raw = [
        ...listFrom<RawFeed>(envelope.standard_feeds),
        ...listFrom<RawFeed>(envelope.custom_feeds).map((f) => ({ ...f, is_custom: true })),
      ];
    }
    const normalized = raw.map(normalizeRow).filter((r): r is FeedSearchResult => r !== null);
    return { data: normalized };
  } catch {
    // Logged (status + URL only) by the axios error interceptor.
    return { data: [] };
  }
};

// ─── Feed type / category response parsing ──────────────────────────────────
// One parser for the taxonomy endpoints, shared by FeedRow's cascade and the
// Custom Feed sheet (audit B-21 / B-23). Shapes the backend has returned:
//   1. string[]                                  → identity == display
//   2. [{type_name|category_name, display_*}]    → identity + localized label
//   3. [{name, display_name}]                    → identity + localized label
//   4. { <wrapperKey>: [...] }                   → unwrapped
//   5. a single bare object for a 1-result list  → wrapped as [obj]
// `name` is the English identity (store / compare / send); `display` is only
// for rendering (CLAUDE.md §18.4).

export interface TaxonomyOption {
  name: string;
  display: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function taxonomyRows(data: unknown, wrapperKeys: string[], identityKey: string): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const k of wrapperKeys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return identityKey in obj || "name" in obj ? [obj] : [];
}

function toOptions(rows: unknown[], identityKey: string, displayKey: string): TaxonomyOption[] {
  return rows
    .map((it) => {
      if (typeof it === "string") return { name: it, display: it };
      const o = asRecord(it) ?? {};
      const name = str(o[identityKey]) ?? str(o.name) ?? "";
      const display = str(o[displayKey]) ?? str(o.display_name) ?? name;
      return { name, display };
    })
    .filter((o) => o.name);
}

export function parseFeedTypeOptions(data: unknown): TaxonomyOption[] {
  return toOptions(
    taxonomyRows(data, ["feed_types", "unique_feed_types"], "type_name"),
    "type_name",
    "display_type"
  );
}

export function parseFeedCategoryOptions(data: unknown): TaxonomyOption[] {
  return toOptions(
    taxonomyRows(
      data,
      ["categories", "unique_feed_categories", "feed_categories"],
      "category_name"
    ),
    "category_name",
    "display_category"
  );
}
