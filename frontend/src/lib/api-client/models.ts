// Shared request/response types, payload mappers and language labels.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterData {
  name: string;
  email_id: string;
  pin: string;
  country_id: string;
  // i18n V2 — language chosen at registration time. BCP 47 code.
  // Optional from the client's perspective (English is the default), but
  // backend MUST store it as `registered_language` so it can be the
  // baseline restored on every subsequent login. Profile changes are
  // session-only and do NOT update this value.
  language?: string;
}

// Internal store model — human-readable field names (not the raw API names)
export interface CattleInfo {
  simulation_name: string;
  country: string;
  country_id: string;
  breed: string;
  body_weight: number;
  body_weight_gain: number;
  body_condition_score: number;
  parity: number;
  days_in_milk: number;
  days_of_pregnancy: number;
  milk_production: number;
  milk_protein_percent: number;
  milk_fat_percent: number;
  average_temperature: number;
  grazing: boolean;
  distance: number; // km walked while grazing; 0 when grazing=false
  topography: string; // "Flat" or "Hilly"; always "Flat" when grazing=false
  // Y3 §1.3 — milk price for §2.1 cost-per-liter comparison. Currency is
  // user's selected country currency (rendered as suffix by report page).
  // Optional: null means user did not provide a price; backend should skip
  // the margin card in that case.
  milk_price: number | null;
  // Y3 §1.4 — drives report-side section gating (§2.3) and may also gate
  // form sections (Milk Production hidden for non-lactating). Default
  // "Lactating Cow" preserves existing behaviour.
  //
  // Internal store field name is `animal_category`; on the wire it is sent
  // as `physiological_state` (the backend's CattleInfo schema field — a
  // required string, one of the four AnimalCategory values). The rename
  // happens only in toCattleInfoPayload; the store keeps `animal_category`
  // so persisted simulations stay readable across the change.
  animal_category: AnimalCategory;
  // i18n V2 — per-simulation language override. null means "use the
  // user's profile language". When set, langProvider() returns this
  // for every /v1/animal/* call, so feed dropdowns / search / diet
  // endpoints operate in the override language for the duration of
  // this simulation. Cleared on New Simulation + Reset; hydrated on
  // load-from-history when the backend eventually returns it.
  simulation_language: string | null;
}

export type AnimalCategory = "Lactating Cow" | "Dry Cow" | "Heifer" | "Baby Calf/Heifer";
export const ANIMAL_CATEGORIES: AnimalCategory[] = [
  "Lactating Cow",
  "Dry Cow",
  "Heifer",
  "Baby Calf/Heifer",
];
// Display labels — plural per the Y3 §1.4 spec wording. Wire values
// stay singular so saved simulations / backend stay backward-compatible.
export const ANIMAL_CATEGORY_LABELS: Record<AnimalCategory, string> = {
  "Lactating Cow": "Lactating cows",
  "Dry Cow": "Dry cows",
  Heifer: "Heifers",
  "Baby Calf/Heifer": "Baby calves/heifers",
};
export const isLactating = (cat: AnimalCategory): boolean => cat === "Lactating Cow";

export interface FeedItem {
  id: string;
  feed_type_id: number | null;
  feed_type_name: string;
  category_id: number | null;
  category_name: string;
  sub_category_id: number | null;
  sub_category_name: string;
  feed_uuid: string | null; // feed_id sent to the API (from FeedSubCategory.feed_uuid)
  // i18n V2 — translated display name captured at pick time. Used as a
  // client-side fallback when the backend's diet endpoints don't yet
  // return display_name on FeedBreakdown / CostEffectiveDiet rows.
  // Optional; null on legacy or restored simulations where the picker
  // wasn't the source.
  display_name?: string | null;
  price_per_kg: number | null;
  quantity_kg: number | null;
  // Y3 §1.1.2 — per-feed inclusion limits. Toggle controls visibility AND
  // whether the bounds are sent to the optimizer. Both bounds independently
  // optional even when the toggle is on (blank min = NA, blank max = no
  // upper bound). TODO(maria-y3): confirm payload key names —
  // min_kg_per_day / max_kg_per_day suggested.
  inclusion_limits_enabled: boolean;
  min_kg_per_day: number | null;
  max_kg_per_day: number | null;
}

// The diet-wide nutrient limits the backend accepts as caller overrides
// (`base_thresholds` on POST /v1/animal/diet-recommendation).
//
// CONTRACT — all eight keys are OPTIONAL and every one of them is sent
// only when the user actually typed a value:
//   * an OMITTED key means "keep the engine default for this animal's
//     physiological state". That is the only way to say "no override".
//   * `0` is NOT "unset" — the backend rejects it with a 422, because a
//     zero limit degenerates the solve. Never coerce a typed 0 into an
//     omitted key either; that silently discards what the user asked for.
//   * limits may only be TIGHTENED, never loosened. The accepted range
//     is per physiological state and is served by getDietThresholds();
//     never hardcode it.
//   * `ash_max`/`ee_max`/`ndf_max`/`starch_max`/`conc_max`/`ndf_for_min`
//     are percentages of diet DM — sent as entered (15 means 15%); the
//     backend divides by 100. `nel_balance_max` (Mcal/day) and
//     `mp_balance_max` (kg/day) are ABSOLUTE daily amounts and must never
//     be scaled.
export interface DietLimits {
  ash_max: number;
  ee_max: number; // Ether Extract (fat)
  ndf_max: number; // Neutral Detergent Fiber
  starch_max: number;
  conc_max: number; // total concentrates
  ndf_for_min: number; // MINIMUM forage NDF — a floor, not a ceiling
  nel_balance_max: number; // Mcal/day — absolute, NOT a percentage
  mp_balance_max: number; // kg/day — absolute, NOT a percentage
}

// ─── API Cattle Info payload (matches Android CattleInfo @SerializedName keys) ─

export interface CattleInfoPayload {
  breed: string;
  bc_score: number;
  body_weight: number;
  calving_interval: number;
  bw_gain: number;
  days_in_milk: number;
  days_of_pregnancy: number;
  distance: number;
  grazing: boolean;
  lactating: boolean;
  fat_milk: number;
  milk_production: number;
  tp_milk: number;
  parity: number;
  temperature: number;
  topography: string;
  // Y3 §1.3 — milk price (optional; null/undefined safely ignored by FastAPI).
  milk_price?: number | null;
  // Physiological state — the backend's required CattleInfo field. Value is
  // one of the four AnimalCategory strings (Lactating Cow | Dry Cow | Heifer
  // | Baby Calf/Heifer). Sourced from the store's `animal_category` field.
  physiological_state: string;
}

// Backend has no field distinct from `simulation_id` for a "clean" display
// name — it treats simulation_id AS the identifier/name, full stop (see
// SimulationListItem in the v1 swagger: only `simulation_id`, no separate
// name). We append a mode suffix to it (buildDietSimulationId) so
// regenerating the same case under a different diet mode gets its own
// Simulation History entry instead of colliding on an identical id.
// But restoring a saved simulation (Simulation History → tap a row)
// writes the backend's ECHOED simulation_id straight back into the
// editable Simulation Name field (cattle-info's loadSimulation), since
// that's the only name-like value the backend gives us — with no
// stripping, regenerating from a restored row appends the suffix AGAIN
// onto an already-suffixed name ("Sim 1 (Recommendation) (Recommendation)",
// compounding on every restore+regenerate cycle). Strip a recognized
// suffix before restoring into the form so each regenerate starts from
// the true base name and appends exactly one clean suffix.
const DIET_MODE_SUFFIXES = [" (Recommendation)", " (Evaluation)"] as const;

export function buildDietSimulationId(baseName: string, isEvaluation: boolean): string {
  return `${stripDietModeSuffix(baseName)} (${isEvaluation ? "Evaluation" : "Recommendation"})`;
}

export function stripDietModeSuffix(name: string): string {
  for (const suffix of DIET_MODE_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

// DEFAULT_BASE_THRESHOLDS (ash=10, ee=7, ndf=45, starch=26) was REMOVED on
// 2026-09-21 and must not come back. It was a copy of Android's defaults that
// the client merged under the user's limits and sent on EVERY recommendation.
// That was harmless only while the backend mis-read the values as fractions
// (45 meant 4500% of DM — no constraint at all). The backend now converts
// percent → fraction and validates the range per physiological state, so those
// constants began BINDING: ash 10 and ndf 45 silently over-constrained every
// lactating diet (engine defaults are 15 and 60), and ee 7 / starch 26 exceed
// the Dry Cow and Heifer ceilings (5 / 18 and 5 / 20) — a hard 422 on every
// non-lactating recommendation.
//
// The engine already holds the correct per-state defaults. Send ONLY the keys
// the user set, and omit `base_thresholds` entirely when they set none.

export function toCattleInfoPayload(ci: CattleInfo): CattleInfoPayload {
  // Y3 §1.4 — `lactating` is now derived from the user's physiological-state
  // choice instead of being hardcoded true. The Android app always sent
  // `true`. The backend now models the state directly via
  // `physiological_state`; `lactating` is kept as a derived convenience
  // signal (harmless extra field — FastAPI ignores keys it doesn't model).
  //
  // When the animal isn't a Lactating Cow we zero out the milk-side
  // fields at payload time rather than relying on the form to clear
  // them. This way:
  //  - User can flip category back and forth without losing values
  //    they previously typed (the data stays in cattleInfo).
  //  - The wire payload always reflects the CURRENT category — no
  //    stale milk_production / fat / protein bleeding through for a
  //    dry cow.
  //  - Backend sees consistent data: lactating=false → all milk-side
  //    numerics are 0 and milk_price is null.
  const isLactating = ci.animal_category === "Lactating Cow";
  return {
    breed: ci.breed,
    bc_score: ci.body_condition_score,
    body_weight: ci.body_weight,
    calving_interval: 370, // Android hardcodes 370
    bw_gain: ci.body_weight_gain,
    days_in_milk: isLactating ? ci.days_in_milk : 0,
    days_of_pregnancy: ci.days_of_pregnancy,
    distance: ci.grazing ? (ci.distance ?? 0) : 0,
    grazing: ci.grazing,
    lactating: isLactating,
    fat_milk: isLactating ? ci.milk_fat_percent : 0,
    milk_production: isLactating ? ci.milk_production : 0,
    tp_milk: isLactating ? ci.milk_protein_percent : 0,
    parity: ci.parity,
    temperature: ci.average_temperature,
    topography: ci.grazing ? (ci.topography ?? "Flat") : "Flat",
    milk_price: isLactating ? (ci.milk_price ?? null) : null,
    // Wire key is `physiological_state` (backend contract); value comes from
    // the store's `animal_category` field.
    physiological_state: ci.animal_category,
  };
}

// ─── Request Types ────────────────────────────────────────────────────────────

export interface EvaluationRequest {
  user_id: string;
  country_id: string;
  currency: string;
  simulation_id: string;
  cattle_info: CattleInfoPayload;
  feed_evaluation: Array<{
    feed_id: string;
    quantity_as_fed: number;
    price_per_kg: number;
  }>;
}

export interface RecommendationRequest {
  user_id: string;
  country_id: string;
  simulation_id: string;
  cattle_info: CattleInfoPayload;
  feed_selection: Array<{
    feed_id: string;
    price_per_kg: number;
    // Y3 §1.1.2 — optional per-feed inclusion bounds (kg/day, as-fed).
    // Omitted entirely when the toggle is off. Either bound can also be
    // null when the toggle is on but the user left that side blank.
    // Wire names are min_kg_asfed / max_kg_asfed — confirmed against
    // FeedWithPrice in the v1 OpenAPI spec. They deliberately differ from
    // the store's min_kg_per_day / max_kg_per_day; map at this boundary
    // only. Pydantic drops unknown keys silently, so a mismatch here
    // means the optimizer never sees the user's limits.
    min_kg_asfed?: number | null;
    max_kg_asfed?: number | null;
  }>;
  // OPTIONAL — send only the limits the user actually set, and omit the key
  // entirely when they set none (see the DietLimits contract above). An
  // omitted object means "use the engine defaults for this physiological
  // state"; sending a full object overrides them.
  base_thresholds?: Partial<DietLimits>;
}

// ─── Evaluation Response Types (matches Android FeedEvaluationResponse) ───────

export interface CostAnalysis {
  currency: string | null;
  feed_cost_per_kg_milk: number | null;
  total_diet_cost_as_fed: number | null;
  recommendations: string[];
  warnings: string[];
}

export interface EvaluationSummary {
  limiting_factor: string | null;
  overall_status: string | null;
}

export interface FeedBreakdown {
  contribution_percent: number | null;
  currency: string | null;
  feed_id: string | null;
  feed_name: string | null;
  feed_type: string | null;
  // i18n V2 — optional translated fields. The diet endpoints aren't
  // listed in the i18n API doc as `?lang=` aware, but the consistent
  // server-side pattern is to add display_* fields whenever a name/type
  // is returned, so we accept them defensively and prefer them at render.
  display_name?: string;
  display_type?: string;
  price_per_kg: number | null;
  quantity_dm_kg_per_day: number | null;
  quantity_as_fed_kg_per_day: number | null;
  total_cost: number | null;
}

export interface IntakeEvaluation {
  intake_difference_kg_per_day: number | null;
  actual_intake_kg_per_day: number | null;
  intake_percentage: number | null;
  intake_status: string | null;
  target_intake_kg_per_day: number | null;
  recommendations: string[];
  warnings: string[];
}

export interface MethaneAnalysis {
  classification: string | null;
  methane_yield_g_per_kg_dmi: number | null;
  methane_conversion_range: string | null;
  "Ym (%)": number | null;
  methane_emission_mj_per_day: number | null;
  methane_intensity_g_per_kg_ecm: number | null;
  methane_production_g_per_day: number | null;
  recommendations: string[];
  warnings: string[];
}

export interface MilkProductionAnalysis {
  actual_milk_supported_kg_per_day: number | null;
  energy_available_mcal: number | null;
  limiting_nutrient: string | null;
  milk_supported_by_energy_kg_per_day: number | null;
  milk_supported_by_protein_kg_per_day: number | null;
  target_production_kg_per_day: number | null;
  protein_available_g: number | null;
  recommendations: string[];
  warnings: string[];
}

export interface NutrientBalance {
  calcium_balance_kg: number | null;
  energy_balance_mcal: number | null;
  ndf_balance_kg: number | null;
  phosphorus_balance_kg: number | null;
  protein_balance_kg: number | null;
  recommendations: string[];
  warnings: string[];
}

// ─── Optional v1 report blocks ────────────────────────────────────────────
// Forward-compatible fields the report prefers when the backend sends them
// and computes client-side when absent (older responses). Declared here so
// the report reads them typed instead of casting (audit B-23).

/** Which report sections to render; see buildReportContext in report/parts. */
export interface ReportContextFlags {
  showMilkProductionSection?: boolean;
  showMilkCostMarginCard?: boolean;
  showSolutionSummaryMilk?: boolean;
  showCalfMilkFeedingSection?: boolean;
  /**
   * Methane INTENSITY is g of CH4 per kg of energy-corrected milk. A dry
   * cow, heifer or calf produces no milk, so the figure has no meaning for
   * them. Per the backend owner (QA row 12): the engine still calculates it
   * for non-lactating animals, but it must not be DISPLAYED for them.
   * Production / yield / Ym are per-day or per-kg-DMI and stay visible.
   */
  showMethaneIntensity?: boolean;
}

export interface MilkCostMargin {
  milk_price_per_litre?: number | null;
  cost_per_litre?: number | null;
  margin_per_litre?: number | null;
  total_diet_cost_as_fed?: number | null;
  daily_milk_production_l?: number | null;
  currency?: string | null;
}

export interface CalfMilkFeedingPlan {
  daily_milk_volume_l?: number;
  feedings_per_day?: number;
  estimated_weaning_age_days?: number;
  notes?: string[];
}

export interface ForageConcentrateRatio {
  forage_kg_as_fed?: number | null;
  concentrate_kg_as_fed?: number | null;
  other_kg_as_fed?: number | null;
  forage_pct?: number | null;
  concentrate_pct?: number | null;
  other_pct?: number | null;
  basis?: string | null;
}

export interface ReportExtras {
  /** v1 may carry the id here instead of report_id / report_info.report_id. */
  id?: string | null;
  report_id?: string | null;
  generated_at?: string | null;
  report_context?: ReportContextFlags;
  milk_cost_margin?: MilkCostMargin;
  calf_milk_feeding_plan?: CalfMilkFeedingPlan;
  forage_concentrate_ratio?: ForageConcentrateRatio;
}

export interface EvaluationResponse extends ReportExtras {
  mode: "evaluation";
  cost_analysis: CostAnalysis;
  currency: string | null;
  evaluation_summary: EvaluationSummary;
  feed_breakdown: FeedBreakdown[];
  intake_evaluation: IntakeEvaluation;
  methane_analysis: MethaneAnalysis;
  milk_production_analysis: MilkProductionAnalysis;
  nutrient_balance: NutrientBalance;
  report_id: string | null;
  simulation_id: string | null;
}

// ─── Recommendation Response Types (matches Android FeedRecommendationResponse) ─

export interface AdditionalInformation {
  diet_status: string | null;
  recommendations: string[];
  violated_parameters: string[];
  warnings: string[] | null;
}

// i18n V2 — see FeedBreakdown comment; display_name is optional and
// preferred at render time, with feed_name as the English fallback.
export interface CostEffectiveDiet {
  currency: string;
  daily_cost: number | null;
  feed_name: string | null;
  display_name?: string;
  price_per_kg: number | null;
  quantity_kg_per_day: number | null;
}

export interface EnvironmentalImpact {
  classification: string | null;
  "Ym (%)": string | null;
  methane_intensity_grams_per_kg_ecm: string | null;
  methane_production_grams_per_day: string | null;
  methane_yield_grams_per_kg_dmi: string | null;
  /** v1 name for Ym; read when "Ym (%)" is absent. */
  methane_conversion_rate_percent?: number | string | null;
}

export interface ReportInfo {
  diet_rating: string | null;
  generated_date: string | null;
  user_name: string | null;
  report_id: string | null;
  simulation_id: string | null;
}

export interface SolutionSummary {
  daily_cost: number | null;
  dry_matter_intake: string | null;
  milk_production: string | null;
}

export interface RecommendationResponse extends ReportExtras {
  mode: "recommendation";
  // Top-level advisory notes about limits the diet did not meet, e.g.
  // "Fat Content: above maximum (result = 2.66% of DM; target = 2.00% of DM)".
  //
  // `ndf_max`, `starch_max` and `ee_max` are SOFT: the optimizer minimises the
  // breach in the cost objective but may still exceed them, by design. The run
  // is a success and the report is still valid, so these render as advisory
  // notes and NEVER as errors.
  //
  // Optional: the backend change that populates this (T4 of the ingredient-
  // inclusion-limits plan) was not deployed as of 2026-09-21, so the key is
  // simply absent on today's responses and nothing renders.
  warnings?: string[] | null;
  additional_information: AdditionalInformation;
  least_cost_diet: CostEffectiveDiet[];
  environmental_impact: EnvironmentalImpact | null;
  report_info: ReportInfo | null;
  solution_summary: SolutionSummary | null;
  total_diet_cost: number | null;
}

export interface Country {
  id: string;
  name: string;
  code: string;
  country_code?: string;
  currency?: string;
  // i18n V2: backend now returns the language codes active for this country.
  // Always includes "en". The Profile language selector reads this list to
  // know what to offer the user — and hides itself when only "en" is present.
  supported_languages?: string[];
}

// ─── i18n V2 — language code → native-script display name ────────────────────
// Hardcoded on the frontend per user preference (native script labels). When
// the backend ships /v1/admin/languages with proper names, we can swap to that
// as a source of truth; until then this map covers the rollout locales.
export const LANGUAGE_NATIVE_LABELS: Record<string, string> = {
  en: "English",
  hi: "हिन्दी",
  tl: "Tagalog", // Filipino
  id: "Bahasa Indonesia",
  th: "ไทย",
  vi: "Tiếng Việt",
  bn: "বাংলা",
  ne: "नेपाली",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  sw: "Kiswahili",
};
export const labelForLanguage = (code: string): string =>
  LANGUAGE_NATIVE_LABELS[code] ?? code.toUpperCase();
