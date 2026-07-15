import axios from "axios";

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
  distance: number;    // km walked while grazing; 0 when grazing=false
  topography: string;  // "Flat" or "Hilly"; always "Flat" when grazing=false
  // Y3 §1.3 — milk price for §2.1 cost-per-liter comparison. Currency is
  // user's selected country currency (rendered as suffix by report page).
  // Optional: null means user did not provide a price; backend should skip
  // the margin card in that case.
  milk_price: number | null;
  // Y3 §1.4 — drives report-side section gating (§2.3) and may also gate
  // form sections (Milk Production hidden for non-lactating). Default
  // "Lactating Cow" preserves existing behaviour.
  // TODO(maria): confirm field name (animal_category vs state_phys) and
  // exact string values when the backend contract lands.
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
export const ANIMAL_CATEGORIES: AnimalCategory[] = ["Lactating Cow", "Dry Cow", "Heifer", "Baby Calf/Heifer"];
// Display labels — plural per the Y3 §1.4 spec wording. Wire values
// stay singular so saved simulations / backend stay backward-compatible.
export const ANIMAL_CATEGORY_LABELS: Record<AnimalCategory, string> = {
  "Lactating Cow": "Lactating cows",
  "Dry Cow": "Dry cows",
  "Heifer": "Heifers",
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
  feed_uuid: string | null;    // feed_id sent to the API (from FeedSubCategory.feed_uuid)
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

// Matches Android BaseThresholds — single max value per nutrient
export interface DietLimits {
  ash_max: number;
  ee_max: number;     // Ether Extract (fat)
  ndf_max: number;    // Neutral Detergent Fiber
  starch_max: number;
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
  // Y3 §1.3 / §1.4 — confirm exact backend field names with Maria.
  // Placeholder snake_case names used here; renaming is a one-line patch.
  // TODO(maria-y3): finalize field names + units (price per L? per Kg?).
  milk_price?: number | null;
  animal_category?: string;     // one of AnimalCategory string values
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

// Android default BaseThresholds (ash=10, fat/ee=7, ndf=45, starch=26)
export const DEFAULT_BASE_THRESHOLDS: DietLimits = {
  ash_max: 10,
  ee_max: 7,
  ndf_max: 45,
  starch_max: 26,
};

export function toCattleInfoPayload(ci: CattleInfo): CattleInfoPayload {
  // Y3 §1.4 — `lactating` is now derived from the user's category choice
  // instead of being hardcoded true. The Android app always sent `true`;
  // once Maria's backend honours `animal_category` we may remove the
  // legacy `lactating` field entirely.
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
    calving_interval: 370,   // Android hardcodes 370
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
    // Y3 §1.3 / §1.4 — optional payload extras. null/undefined keys are
    // safely ignored by FastAPI; once Maria confirms canonical names just
    // rename these two keys here + in CattleInfoPayload.
    milk_price: isLactating ? (ci.milk_price ?? null) : null,
    animal_category: ci.animal_category,
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
    // TODO(maria-y3): confirm canonical field names; backend §2.4 reads these.
    min_kg_per_day?: number | null;
    max_kg_per_day?: number | null;
  }>;
  base_thresholds: DietLimits;   // Android always sends this — never omit
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

export interface EvaluationResponse {
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

export interface RecommendationResponse {
  mode: "recommendation";
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
  tl: "Tagalog",                  // Filipino
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

// ─── Axios Instance ───────────────────────────────────────────────────────────
//
// Testing-branch note (2026-06): the backend at <DEV_BACKEND_IP>:8000 was migrated
// to RationSmart v4.0.0:
//   1. All endpoints now live under /v1/...
//   2. Authenticated endpoints require Authorization: Bearer <jwt> (HTTPBearer)
//   3. Many endpoints dropped the user_id query param — it's derived from
//      the JWT instead
//   4. Custom-feed update is now PUT (was POST) with feed_id as a query param
//   5. /fetch-* POST endpoints became GET equivalents
//   6. The dev/prod backends (<DEV_BACKEND_IP> was reused so the IP didn't change;
//      <PROD_BACKEND_IP> is still on legacy) are still on the OLD API — this
//      file is incompatible with them.
// `tokenProvider` is set from src/lib/store.ts so the interceptor can read
// the latest JWT on every request without a circular import.

const api = axios.create({
  baseURL: "/api/proxy",
  timeout: 60000,   // Android uses 60s connect/read/write timeouts
  headers: {
    "Content-Type": "application/json",
  },
});

let tokenProvider: () => string | null = () => null;
export const setTokenProvider = (fn: () => string | null) => {
  tokenProvider = fn;
};

// i18n V2: the store wires this to read user.preferred_language at call
// time, so every API helper can append ?lang= without reaching into the
// store. Falls back to "en" when no user is signed in.
let langProvider: () => string = () => "en";
export const setLangProvider = (fn: () => string) => {
  langProvider = fn;
};
// Helper for endpoint helpers to spread the current ?lang= into their params.
export const langParam = (): { lang: string } => ({ lang: langProvider() });

// Build marker — visible in DevTools Console on first paint. Bump the
// timestamp when pushing a diagnostic build so we can confirm the new
// bundle is what's actually running (not a stale SW cache).
if (typeof window !== "undefined") {
  console.log("%c[RationSmart] testing build · v1+diag · 2026-06-16T11:30Z",
    "color:#064E3B;font-weight:700;background:#E4F7EF;padding:2px 6px;border-radius:4px;");
}

api.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  // Verbose logger — prints every outgoing API call in DevTools so
  // shape mismatches can be diagnosed without server-side access.
  // Remove this block once feed-selection is stable.
  if (typeof window !== "undefined") {
    const method = (config.method || "GET").toUpperCase();
    const url = (config.baseURL ?? "") + (config.url ?? "");
    console.log(`[api →] ${method} ${url}`, {
      params: config.params,
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 16) + "…" : null,
      bodyKeys: config.data && typeof config.data === "object" && !(config.data instanceof FormData)
        ? Object.keys(config.data as Record<string, unknown>)
        : undefined,
    });
  }
  return config;
});

// Response logger — pairs with the request logger above so each call
// is visible as a (→ request, ← response) pair in DevTools Console.
api.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      const method = (response.config.method || "GET").toUpperCase();
      const url = (response.config.baseURL ?? "") + (response.config.url ?? "");
      console.log(`[api ←] ${response.status} ${method} ${url}`, response.data);
    }
    return response;
  },
  (err) => {
    if (typeof window !== "undefined") {
      const cfg = err?.config ?? {};
      const method = (cfg.method || "GET").toUpperCase();
      const url = (cfg.baseURL ?? "") + (cfg.url ?? "");
      console.error(`[api ×] ${err?.response?.status ?? "ERR"} ${method} ${url}`, err?.response?.data ?? err?.message);
    }
    return Promise.reject(err);
  }
);

// Auth-expired handler — the store registers a callback that clears
// state and redirects to /login. Wired via setUnauthorizedHandler()
// to avoid a circular import between api.ts and store.ts.
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  unauthorizedHandler = fn;
};

// Response error interceptor — safely extract message from FastAPI errors.
// Also intercepts 401 (typically "Token expired") and kicks the user back
// to /login so they don't get stranded on a screen whose data will never
// load. Without this handler the user sees empty dropdowns forever and
// has no clue their session died.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;

    // 401 → session invalid. Fire the handler once, then let the
    // rejected promise flow through so call sites can still their own
    // fallback UI if they want. Guard with a module-level flag so
    // multiple in-flight requests don't stack duplicate redirects.
    if (status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }

    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI validation errors: [{loc, msg, type}]
      message = detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(", ");
    } else {
      message =
        error?.response?.data?.message ??
        error?.message ??
        "An unexpected error occurred";
    }
    return Promise.reject(new Error(message));
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
// All auth-tier endpoints are PUBLIC (no Bearer header required) except where
// noted. The `login` response carries the JWT used by every animal/* and
// most admin/* endpoint below.

export interface LoginResponse {
  success: boolean;
  message: string;
  requires_pin_reset: boolean;
  user: unknown | null;
  token: string | null;
}

export const login = (email_id: string, pin: string) =>
  api.post<LoginResponse>("/v1/auth/login", { email_id, pin });

export const register = (data: RegisterData) =>
  api.post("/v1/auth/register", data);

// POST /v1/auth/forgot-pin — { email_id }
export const resetPin = (email_id: string) =>
  api.post("/v1/auth/forgot-pin", { email_id });

// POST /v1/auth/set-new-pin — { email_id, old_pin (4 digits), new_pin (6 digits) }
// Used when login returns requires_pin_reset=true. Migrates a legacy
// 4-digit PIN to a 6-digit one. Public endpoint (no JWT required because
// the user has not finished authenticating yet).
export const setNewPin = (email_id: string, old_pin: string, new_pin: string) =>
  api.post("/v1/auth/set-new-pin", { email_id, old_pin, new_pin });

// POST /v1/auth/change-pin — { email_id, current_pin (4-6), new_pin (6) }
// User-initiated change from the profile screen.
export const changePin = (email_id: string, current_pin: string, new_pin: string) =>
  api.post("/v1/auth/change-pin", { email_id, current_pin, new_pin });

// POST /v1/auth/verify-email — { token } — email verification flow
export const verifyEmail = (token: string) =>
  api.post("/v1/auth/verify-email", { token });

// POST /v1/auth/resend-verification — { email_id }
export const resendVerification = (email_id: string) =>
  api.post("/v1/auth/resend-verification", { email_id });

export const getCountries = () => api.get<Country[]>("/v1/auth/countries");

// GET /v1/auth/user/{email_id} — public — returns UserProfileInfoResponse
export const getUserProfile = (email_id: string) =>
  api.get(`/v1/auth/user/${encodeURIComponent(email_id)}`);

// PUT /v1/auth/user/{email_id} — public — { name, country_id, preferred_language? }
// preferred_language is optional; when the user changes their language from
// the Profile screen we include it here so the choice PERSISTS across
// sessions. The backend updates the user record's language; the next login
// reads that value straight back. There is no separate "registered
// language" baseline — one field, one source of truth.
export const updateUserProfile = (
  email_id: string,
  data: { name: string; country_id: string; preferred_language?: string }
) => api.put(`/v1/auth/user/${encodeURIComponent(email_id)}`, data);

// POST /v1/auth/user-delete-account — JWT auth; body { pin } (6-digit)
// user identity comes from the JWT, no more user_id query param.
export const deleteAccount = (pin: string) =>
  api.post("/v1/auth/user-delete-account", { pin });

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

export const getFeedCategories = (feed_type: string, country_id: string, _user_id?: string) =>
  api.get("/v1/animal/unique-feed-category", { params: { country_id, feed_type, lang: "en" } });

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
  api.get("/v1/animal/feed-name", { params: { country_id, feed_type, category: feed_category, lang: "en" } });

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
  types: Record<string, string>;      // English identity → localized label
  categories: Record<string, string>; // English identity → localized label
  feeds: Record<string, string>;      // feed id/uuid → localized display_name
};

export async function fetchFeedTaxonomyLabels(country_id: string): Promise<FeedTaxonomyLabels> {
  const res = await api.get("/v1/animal/feed-name", {
    params: { country_id, ...langParam() },
  });
  const feeds = (res.data as {
    standard_feeds?: { id?: string; feed_id?: string; fd_type?: string; display_type?: string; fd_category?: string; display_category?: string; display_name?: string }[];
    custom_feeds?: { id?: string; feed_id?: string; fd_type?: string; display_type?: string; fd_category?: string; display_category?: string; display_name?: string }[];
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

// ─── Evaluation & Recommendation (JWT-protected) ────────────────────────────

export const evaluateDiet = (data: EvaluationRequest) =>
  api.post("/v1/animal/evaluate-diet", data);

export const recommendDiet = (data: RecommendationRequest) =>
  api.post("/v1/animal/diet-recommendation", data);

// ─── Reports (JWT-protected) ────────────────────────────────────────────────

// Saved PDF reports (Feed Reports screen). v1 exposes TWO endpoints
// that look related:
//   GET /v1/animal/reports      → "List saved reports for the authenticated user" (no schema declared)
//   GET /v1/animal/user-reports → "List ALL saved reports for the authenticated user" (GetUserReportsResponse)
// User reports the Feed Reports screen is missing the latest entry
// while the simulation-history modal (which hits /v1/animal/simulations)
// shows it. Try `/v1/animal/reports` first; if it 404s or returns the
// wrong shape, fall back to `/v1/animal/user-reports`. The two responses
// are merged into the same UserReportItem-shaped array so the page
// code is agnostic.
export interface FeedReport {
  report_id: string | null;
  report_type: string | null;
  bucket_url: string | null;   // PDF download URL
  simulation_id: string | null;
  user_name: string | null;
  report_created_date: string | null;
}

export interface FeedReportListResponse {
  message: string | null;
  reports: FeedReport[];
  success: boolean | null;
}

function extractReportsList(data: unknown): FeedReport[] {
  return Array.isArray(data)
    ? (data as FeedReport[])
    : Array.isArray((data as { reports?: FeedReport[] })?.reports)
      ? (data as { reports: FeedReport[] }).reports
      : Array.isArray((data as { items?: FeedReport[] })?.items)
        ? (data as { items: FeedReport[] }).items
        : [];
}

async function fetchReportsFrom(path: string): Promise<FeedReport[]> {
  try {
    const res = await api.get(path);
    return extractReportsList(res.data);
  } catch (err) {
    console.warn(`[getSavedReports] ${path} failed`, err);
    return [];
  }
}

// Both endpoints have independently been observed in production to be
// missing entries the other one has — /v1/animal/reports has shown up
// success:true but without the just-saved report, while
// /v1/animal/user-reports had it (and vice versa on other accounts).
// The original single-endpoint-with-catch-fallback here only helped when
// the primary call actually threw (404/5xx) — a same-shape response that
// merely omits the newest report never triggered it. Always fetch both
// and merge, deduped by report_id (falling back to simulation_id for
// rows the backend returns without an id), so neither endpoint's gaps
// can hide a saved report from the Feed Reports screen.
export const getSavedReports = async (_user_id?: string) => {
  const [primary, fallback] = await Promise.all([
    fetchReportsFrom("/v1/animal/reports"),
    fetchReportsFrom("/v1/animal/user-reports"),
  ]);

  const merged = new Map<string, FeedReport>();
  [...primary, ...fallback].forEach((r, i) => {
    merged.set(r.report_id ?? r.simulation_id ?? `__idx_${i}`, r);
  });

  return { data: { reports: Array.from(merged.values()), success: true, message: null } as FeedReportListResponse };
};

// GET /v1/animal/simulations — simulation history (was POST /fetch-all-simulations)
export const getUserReports = (_user_id?: string) =>
  api.get("/v1/animal/simulations");

// POST /v1/animal/save-report — { report_id, user_id } (user_id still required in body per spec)
export const saveReport = (report_id: string, user_id: string) =>
  api.post("/v1/animal/save-report", { report_id, user_id });

// GET /v1/animal/simulations/{report_id} (was POST /fetch-simulation-details)
export const getSimulationDetails = (report_id: string, _user_id?: string) =>
  api.get(`/v1/animal/simulations/${encodeURIComponent(report_id)}`);

// ─── Feedback (JWT-protected) ───────────────────────────────────────────────
// user_id no longer passed — JWT-derived.

export const submitFeedback = (
  _user_id: string,
  data: { feedback_type: string; text_feedback?: string; overall_rating?: number }
) => api.post("/v1/user-feedback/submit", data);

export const getMyFeedback = (_user_id: string, limit = 50, offset = 0) =>
  api.get("/v1/user-feedback/my", { params: { limit, offset } });

// ─── Admin (JWT-protected, server-side role check) ──────────────────────────
// admin_user_id removed everywhere — JWT-derived.
// Filter params renamed on /admin/users: country_filter → country,
// status_filter → status.

export const getAdminUsers = (
  _admin_user_id: string,
  page = 1,
  page_size = 20,
  country = "",
  status = "",
  search = ""
) =>
  api.get("/v1/admin/users", { params: { page, page_size, country, status, search } });

// PUT /v1/admin/users/{user_id}/toggle-status — JWT-derived admin.
// v1 body shape is AdminUserToggleRequest { action: string }, NOT
// { is_active: bool } like legacy. The `action` value drives whether the
// user is enabled or disabled. We pass "activate" / "deactivate" — the
// other naming variant the server might prefer is "enable"/"disable";
// swap if the backend rejects.
export const toggleUserStatus = (user_id: string, _admin_user_id: string, is_active: boolean) =>
  api.put(`/v1/admin/users/${user_id}/toggle-status`, { action: is_active ? "activate" : "deactivate" });

export const getAdminFeedTypes = (_admin_user_id: string) =>
  api.get("/v1/admin/list-feed-types");

export const getAdminFeedCategories = (_admin_user_id: string) =>
  api.get("/v1/admin/list-feed-categories");

// GET /v1/admin/user-feedback/all — JWT-derived admin.
// v1 spec uses `page` + `page_size` (legacy was limit/offset). Function
// signature retains the legacy positional `limit, offset` for backward
// compatibility with callers — internally we map limit → page_size and
// derive page from offset.
export const getAdminFeedbacks = (_admin_user_id: string, limit = 20, offset = 0) => {
  const page_size = Math.min(Math.max(limit || 20, 1), 100);
  const page = Math.max(Math.floor((offset || 0) / page_size) + 1, 1);
  return api.get("/v1/admin/user-feedback/all", { params: { page, page_size } });
};

export const getAdminFeedbackStats = (_admin_user_id: string) =>
  api.get("/v1/admin/user-feedback/stats");

// GET /v1/admin/export-feeds — the v1 backend may return EITHER
//   - JSON { file_url, file_name, success, message, total_records }  (legacy / S3-link style)
//   - the xlsx file binary directly with Content-Disposition: attachment
// We request as a blob so both work; the caller inspects the
// response's content-type to decide which path to follow.
export const exportAdminFeeds = (_admin_user_id: string) =>
  api.get("/v1/admin/export-feeds", { responseType: "blob" });

// POST /v1/admin/bulk-upload-feeds (multipart, JWT-derived admin).
// CRITICAL: do NOT explicitly set the Content-Type header. When axios
// hands a FormData body to the XHR layer, the browser auto-generates
// `multipart/form-data; boundary=----WebKitFormBoundary...` with the
// correct boundary parameter. Setting "multipart/form-data" by hand
// strips the boundary, so FastAPI can't parse the multipart and
// rejects the upload (typically 400 / 422 "Body is invalid"). Letting
// axios / the browser populate the header is what makes uploads work.
export const bulkUploadFeeds = (
  _admin_user_id: string,
  file: File,
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/v1/admin/bulk-upload-feeds", form, {
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded * 100) / evt.total));
      }
    },
  });
};

// GET /v1/admin/get-all-reports/ — JWT-derived admin
export const getAdminReports = (_user_id: string, page = 1, page_size = 20) =>
  api.get("/v1/admin/get-all-reports/", { params: { page, page_size } });

// ─── Admin Feed CRUD (JWT-protected) ────────────────────────────────────────

export const getAdminFeeds = (
  _admin_user_id: string,
  page = 1,
  page_size = 20,
  feed_type = "",
  feed_category = "",
  country_name = "",
  search = ""
) =>
  api.get("/v1/admin/list-feeds", {
    params: { page, page_size, feed_type, feed_category, country_name, search },
  });

export const addAdminFeed = (_admin_user_id: string, body: Record<string, unknown>) =>
  api.post("/v1/admin/add-feed", body);

export const updateAdminFeed = (
  feed_id: string,
  _admin_user_id: string,
  body: Record<string, unknown>
) => api.put(`/v1/admin/update-feed/${feed_id}`, body);

export const deleteAdminFeed = (feed_id: string, _admin_user_id: string) =>
  api.delete(`/v1/admin/delete-feed/${feed_id}`);

export const addAdminFeedCategory = (
  _admin_user_id: string,
  body: { category_name: string; description: string; feed_type_id: string; sort_order: number }
) => api.post("/v1/admin/add-feed-category", body);

export const deleteAdminFeedCategory = (category_id: string, _admin_user_id: string) =>
  api.delete(`/v1/admin/delete-feed-category/${category_id}`);

export const addAdminFeedType = (
  _admin_user_id: string,
  body: { type_name: string; description: string; sort_order: number }
) => api.post("/v1/admin/add-feed-type", body);

export const deleteAdminFeedType = (type_id: string, _admin_user_id: string) =>
  api.delete(`/v1/admin/delete-feed-type/${type_id}`);

export const exportCustomFeeds = (_admin_user_id: string) =>
  api.get("/v1/admin/export-custom-feeds", { responseType: "blob" });

// ─── Custom Feed (user, JWT-protected) ──────────────────────────────────────
// All three endpoints restructured:
//   POST /check-insert-or-update body{country_id,feed_id,user_id}
//     → POST /v1/animal/custom-feeds/check?feed_id=...
//   POST /insert-custom-feed
//     → POST /v1/animal/custom-feeds
//   POST /update-custom-feed (with feed_id in body)
//     → PUT  /v1/animal/custom-feeds?feed_id=... (note method + query param!)
// user_id derived from JWT in all three.

export const checkInsertOrUpdate = (_country_id: string, feed_id: string, _user_id: string) =>
  api.post("/v1/animal/custom-feeds/check", null, { params: { feed_id } });

export const insertCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) => api.post("/v1/animal/custom-feeds", body);

export const updateCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) => api.put("/v1/animal/custom-feeds", body, { params: { feed_id: body.feed_id } });

// GET /v1/feed-classification/structure (JWT-protected)
export const getFeedClassification = () => api.get("/v1/feed-classification/structure");

// ─── i18n V2 Phase 2: Admin Translation + Language endpoints ────────────────
// Spec source: ~/Desktop/post_impl_multi_language/api_endpoints_for_frontend.md
// (sections 3 and 4). All JWT-admin protected. Always operate on a country_id.

// 3.1 — workbook download. Response is a binary xlsx; we ask axios for a Blob
// so the caller can pipe through URL.createObjectURL() + <a download>.
export const downloadTranslationWorkbook = (country_id: string) =>
  api.get("/v1/admin/translations/workbook", {
    params: { country_id },
    responseType: "blob",
  });

// 3.2 — workbook upload. Content-Type is left to the browser so the
// multipart boundary param is generated correctly (same pattern as
// bulkUploadFeeds — see CLAUDE.md note on this).
export const uploadTranslationWorkbook = (country_id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/v1/admin/translations/workbook", form, {
    params: { country_id },
  });
};

// 3.3 — coverage report for a country + language
export const getTranslationCoverage = (country_id: string, lang: string) =>
  api.get("/v1/admin/translations/coverage", { params: { country_id, lang } });

// 3.4 — insert / update a single feed translation
export const upsertFeedTranslation = (body: { feed_id: string; language: string; name: string }) =>
  api.post("/v1/admin/translations", body);

// 3.5 — list all translations across all languages for one feed
export const listFeedTranslations = (feed_id: string) =>
  api.get(`/v1/admin/translations/${feed_id}`);

// 3.6 — delete a single feed×language translation
export const deleteFeedTranslation = (feed_id: string, language: string) =>
  api.delete(`/v1/admin/translations/${feed_id}/${language}`);

// 4.1 — register a new language in the system
export const createLanguage = (body: { code: string; name: string }) =>
  api.post("/v1/admin/languages", body);

// 4.2 — list all registered languages (system-wide)
export const listLanguages = () =>
  api.get("/v1/admin/languages");

// 4.3 — update a language (name / is_active)
export const patchLanguage = (code: string, body: { name?: string; is_active?: boolean }) =>
  api.patch(`/v1/admin/languages/${code}`, body);

// 4.4 — list countries with their assigned languages
export const listCountriesWithLanguages = () =>
  api.get("/v1/admin/countries");

// 4.5 — assign a language to a country
export const assignLanguageToCountry = (country_id: string, code: string) =>
  api.post(`/v1/admin/countries/${country_id}/languages/${code}`);

// 4.6 — unassign a language from a country
export const unassignLanguageFromCountry = (country_id: string, code: string) =>
  api.delete(`/v1/admin/countries/${country_id}/languages/${code}`);

// Y3 §1.1.1 — feed search. Live backend endpoint per
// docs/Search_Implmentation.md §9.1:
//   GET /v1/animal/search-feeds?query=...&country_id=...&limit=20
// JWT comes from the axios interceptor; no user_id query param.
// Response is defensively parsed so the UI keeps working if the
// backend shape drifts (per §6 of the spec, three wrappers accepted).
export interface FeedSearchResult {
  feed_uuid: string;
  feed_name: string;          // English source — stable; used to talk to backend
  feed_type: string;          // English source
  feed_category: string;      // English source
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
      const o = body as { feeds?: RawFeed[]; results?: RawFeed[]; standard_feeds?: RawFeed[]; custom_feeds?: RawFeed[] };
      if (Array.isArray(o.feeds)) raw = o.feeds;
      else if (Array.isArray(o.results)) raw = o.results;
      else if (Array.isArray(o.standard_feeds) || Array.isArray(o.custom_feeds)) {
        raw = [...(o.standard_feeds ?? []), ...(o.custom_feeds ?? []).map((f) => ({ ...f, is_custom: true }))];
      }
    }
    const normalized = raw.map(normalizeRow).filter((r): r is FeedSearchResult => r !== null);
    return { data: normalized };
  } catch (err) {
    console.warn("[searchFeeds] request failed", err);
    return { data: [] };
  }
};

export default api;
