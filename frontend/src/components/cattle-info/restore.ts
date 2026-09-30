// Simulation History restore — pure mapping from GET /v1/animal/simulations/{id}
// to the Cattle Info form, the Feed Selection rows and the Custom Diet Limits.
// Kept free of React and the store so each rule is unit-testable; the page
// (loadSimulation) owns fetching, spec clamping and the store writes.

import type { AnimalCategory, DietLimits, FeedItem } from "@/lib/api";
import { taxonomyId } from "@/lib/taxonomy-id";
import type { Country, FormState } from "./form-model";

/** The loose shape the simulation-details endpoint returns (feed_selection is untyped in openapi). */
export interface SimulationDetails {
  cattle_info?: Record<string, unknown> | null;
  country_name?: string | null;
  simulation_language?: string | null;
  feed_selection?: unknown;
  custom_constraints?: unknown;
  [key: string]: unknown;
}

interface RestoredFeed {
  feed_type?: string;
  feed_category?: string;
  feed_name?: string;
  feed_id?: string;
  price_per_kg?: number | string | null;
  quantity_as_fed?: number | string | null;
  // Per-feed inclusion limits. The wire names are min_kg_asfed /
  // max_kg_asfed (openapi FeedWithPrice — what diet-request.ts sends, so
  // what the saved simulation echoes back); FetchSimulationDetailsResponse
  // leaves feed_selection untyped, so the older min_kg_per_day names are
  // still read.
  min_kg_asfed?: number | string | null;
  max_kg_asfed?: number | string | null;
  min_kg_per_day?: number | string | null;
  max_kg_per_day?: number | string | null;
}

const DIET_LIMIT_KEYS = [
  "ash_max",
  "ee_max",
  "ndf_max",
  "starch_max",
  "conc_max",
  "ndf_for_min",
  "nel_balance_max",
  "mp_balance_max",
] as const;

/** The cattle_info block (older responses put the fields at the top level). */
export function cattleInfoOf(data: SimulationDetails): Record<string, unknown> {
  return (data.cattle_info ?? data) as Record<string, unknown>;
}

export function matchCountry(countries: Country[], countryName: string): Country | undefined {
  return countries.find((c) => c.name?.toLowerCase() === countryName.toLowerCase());
}

// Wire key is `physiological_state`; prefer it, fall back to the legacy
// `animal_category` for older/echoed responses.
export function restoredStateOf(
  ci: Record<string, unknown>,
  fallback: AnimalCategory
): AnimalCategory {
  return ((ci.physiological_state ?? ci.animal_category) as AnimalCategory | undefined) ?? fallback;
}

const str = (v: unknown, fallback: string): string => (v != null ? String(v) : fallback);

/**
 * The form a restored simulation produces. `prev` is the form the missing
 * fields fall back to — the caller passes the restored state's spec defaults
 * so nothing leaks in from the previously loaded case.
 */
export function restoreForm(
  data: SimulationDetails,
  prev: FormState,
  matchedCountry: Country | undefined,
  restoredState: AnimalCategory
): FormState {
  const ci = cattleInfoOf(data);
  const countryName = data.country_name ?? "";
  return {
    ...prev,
    // Deliberately left blank on restore from Simulation History — the
    // backend echoes back exactly what we sent as simulation_id (mode suffix
    // included), and that's not a name the user should see repopulated into
    // the editable field. Every other field still restores normally.
    simulation_name: "",
    country_id: matchedCountry ? String(matchedCountry.id) : prev.country_id,
    country_name: matchedCountry?.name ?? countryName ?? prev.country_name,
    breed: (ci.breed as string | undefined) ?? prev.breed,
    body_weight: str(ci.body_weight, prev.body_weight),
    body_weight_gain: str(ci.bw_gain, prev.body_weight_gain),
    body_condition_score: str(ci.bc_score, prev.body_condition_score),
    days_in_milk: str(ci.days_in_milk, prev.days_in_milk),
    days_of_pregnancy: str(ci.days_of_pregnancy, prev.days_of_pregnancy),
    parity: str(ci.parity, prev.parity),
    milk_production: str(ci.milk_production, prev.milk_production),
    milk_protein_percent: str(ci.tp_milk, prev.milk_protein_percent),
    milk_fat_percent: str(ci.fat_milk, prev.milk_fat_percent),
    average_temperature: str(ci.temperature, prev.average_temperature),
    grazing: (ci.grazing as boolean | undefined) ?? prev.grazing,
    distance_walked: str(ci.distance, prev.distance_walked),
    topography: (ci.topography as string | undefined) ?? prev.topography,
    // Y3 §1.3 / §1.4 — restore Y3 fields when the backend echoes them back.
    milk_price: str(ci.milk_price, prev.milk_price),
    animal_category: restoredState,
    // i18n V2 — priority chain for the restored simulation's language:
    //   1. the backend response's simulation_language
    //   2. the current form's simulation_language (session continuity)
    //   3. the restored country's first non-English supported language
    //      (best-effort guess — better than the user's profile default,
    //      which would be misleading for someone else's sim)
    //   4. null (falls back to profile via langProvider)
    simulation_language:
      data.simulation_language ||
      prev.simulation_language ||
      primaryCountryLanguage(matchedCountry),
  };
}

function primaryCountryLanguage(country: Country | undefined): string | null {
  return country?.supported_languages?.find((c) => c !== "en") ?? null;
}

/**
 * The language stored on cattleInfo for a restored run. Unlike the form it
 * skips "keep the current form's language": the store must describe the
 * restored simulation, not the previous one (Scenario 4).
 */
export function restoredStoreLanguage(
  data: SimulationDetails,
  matchedCountry: Country | undefined
): string | null {
  return data.simulation_language || primaryCountryLanguage(matchedCountry);
}

function feedList(data: SimulationDetails): RestoredFeed[] {
  return Array.isArray(data.feed_selection) ? (data.feed_selection as RestoredFeed[]) : [];
}

const present = (v: number | string | null | undefined): boolean => v != null && v !== "";

/**
 * Feed Selection rows for the restored run — Android
 * FeedViewModel.populateFromSimulation (FeedViewModel.kt:881-958).
 * `stamp` keeps the generated row ids unique across restores.
 */
export function restoreFeedItems(data: SimulationDetails, stamp: number): FeedItem[] {
  return feedList(data).map((sel, idx) => {
    const bound = (v: number | string | null | undefined) => (present(v) ? Number(v) : null);
    const minVal = bound(sel.min_kg_asfed ?? sel.min_kg_per_day);
    const maxVal = bound(sel.max_kg_asfed ?? sel.max_kg_per_day);
    return {
      id: `feed_restored_${idx}_${stamp}`,
      feed_type_id: sel.feed_type ? taxonomyId(sel.feed_type) : null,
      feed_type_name: sel.feed_type ?? "",
      category_id: sel.feed_category ? taxonomyId(sel.feed_category) : null,
      category_name: sel.feed_category ?? "",
      sub_category_id: sel.feed_id ? 1 : null,
      sub_category_name: sel.feed_name ?? "",
      feed_uuid: sel.feed_id ?? null,
      price_per_kg: present(sel.price_per_kg) ? Number(sel.price_per_kg) : null,
      quantity_kg: present(sel.quantity_as_fed) ? Number(sel.quantity_as_fed) : null,
      // Toggle defaults ON when either bound is present in the restored payload.
      inclusion_limits_enabled: minVal != null || maxVal != null,
      min_kg_per_day: minVal,
      max_kg_per_day: maxVal,
    };
  });
}

/** Android: every quantity_as_fed null → Recommendation, else Evaluation (FeedViewModel.kt:894-900). */
export function isEvaluationRun(data: SimulationDetails): boolean {
  return feedList(data).some((s) => present(s.quantity_as_fed));
}

/**
 * Custom Diet Limits the run was made with (`custom_constraints`, keyed like
 * DietLimits). Only finite numbers are taken, so a partial or junk object
 * can't poison the diet payload; a run with none clears the limits.
 *
 * UNVERIFIED (2026-09-21): the backend converts pct_dm limits to fractions
 * before persisting, so a restored `ash_max` may come back as 0.06 rather
 * than 6. Deliberately NOT rescaled on a hunch — feed-selection's pre-flight
 * catches an out-of-range limit and tells the user to adjust it.
 */
export function restoreDietLimits(data: SimulationDetails): Partial<DietLimits> {
  const constraints = data.custom_constraints;
  if (!constraints || typeof constraints !== "object") return {};
  const source = constraints as Record<string, unknown>;
  const limits: Partial<DietLimits> = {};
  for (const key of DIET_LIMIT_KEYS) {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) limits[key] = n;
  }
  return limits;
}
