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

// Response error interceptor — safely extract message from FastAPI errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail;
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

// PUT /v1/auth/user/{email_id} — public — { name, country_id }
// NOTE — intentionally does NOT accept preferred_language. Language is set
// once at registration (registered_language on the user record) and is the
// source of truth restored on every login. Profile-side language changes
// are session-only (local state only) and never reach the backend.
export const updateUserProfile = (email_id: string, data: { name: string; country_id: string }) =>
  api.put(`/v1/auth/user/${encodeURIComponent(email_id)}`, data);

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

// i18n V2: append ?lang= so the backend returns translated display strings
// for feed types / categories / feed names. ?lang= falls through to the
// user's preferred_language server-side if omitted, but we always pass it
// explicitly for determinism (per frontend-team convention).
export const getFeedTypes = (country_id: string, _user_id?: string) =>
  api.get<string[]>(`/v1/animal/unique-feed-type/${country_id}`, { params: { ...langParam() } });

export const getFeedCategories = (feed_type: string, country_id: string, _user_id?: string) =>
  api.get("/v1/animal/unique-feed-category", { params: { country_id, feed_type, ...langParam() } });

// Returns List<FeedSubCategory> with {feed_name, feed_uuid, feed_category, feed_type, feed_cd}
// i18n V2 — response now also carries display_name / display_type /
// display_category translated into the requested lang. Identity fields
// (id, fd_code, fd_name) remain stable English.
export const getFeedSubCategories = (
  feed_type: string,
  feed_category: string,
  country_id: string,
  _user_id?: string
) =>
  api.get("/v1/animal/feed-name", { params: { country_id, feed_type, category: feed_category, ...langParam() } });

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

export const getSavedReports = async (_user_id?: string) => {
  try {
    const res = await api.get("/v1/animal/reports");
    const data = res.data as unknown;
    const reports: FeedReport[] = Array.isArray(data)
      ? (data as FeedReport[])
      : Array.isArray((data as { reports?: FeedReport[] })?.reports)
        ? (data as { reports: FeedReport[] }).reports
        : Array.isArray((data as { items?: FeedReport[] })?.items)
          ? (data as { items: FeedReport[] }).items
          : [];
    return { data: { reports, success: true, message: null } as FeedReportListResponse };
  } catch (err) {
    // Fall back to the legacy /user-reports endpoint
    console.warn("[getSavedReports] /v1/animal/reports failed, falling back to /v1/animal/user-reports", err);
    return api.get<FeedReportListResponse>("/v1/animal/user-reports");
  }
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
