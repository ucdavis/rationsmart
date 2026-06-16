import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterData {
  name: string;
  email_id: string;
  pin: string;
  country_id: string;
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
  const isLactating = ci.animal_category === "Lactating Cow";
  return {
    breed: ci.breed,
    bc_score: ci.body_condition_score,
    body_weight: ci.body_weight,
    calving_interval: 370,   // Android hardcodes 370
    bw_gain: ci.body_weight_gain,
    days_in_milk: ci.days_in_milk,
    days_of_pregnancy: ci.days_of_pregnancy,
    distance: ci.grazing ? (ci.distance ?? 0) : 0,
    grazing: ci.grazing,
    lactating: isLactating,
    fat_milk: ci.milk_fat_percent,
    milk_production: ci.milk_production,
    tp_milk: ci.milk_protein_percent,
    parity: ci.parity,
    temperature: ci.average_temperature,
    topography: ci.grazing ? (ci.topography ?? "Flat") : "Flat",
    // Y3 §1.3 / §1.4 — optional payload extras. null/undefined keys are
    // safely ignored by FastAPI; once Maria confirms canonical names just
    // rename these two keys here + in CattleInfoPayload.
    milk_price: ci.milk_price ?? null,
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

export interface CostEffectiveDiet {
  currency: string;
  daily_cost: number | null;
  feed_name: string | null;
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
}

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

api.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

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

export const getFeedTypes = (country_id: string, _user_id?: string) =>
  api.get<string[]>(`/v1/animal/unique-feed-type/${country_id}`);

export const getFeedCategories = (feed_type: string, country_id: string, _user_id?: string) =>
  api.get("/v1/animal/unique-feed-category", { params: { country_id, feed_type } });

// Returns List<FeedSubCategory> with {feed_name, feed_uuid, feed_category, feed_type, feed_cd}
export const getFeedSubCategories = (
  feed_type: string,
  feed_category: string,
  country_id: string,
  _user_id?: string
) =>
  api.get("/v1/animal/feed-name", { params: { country_id, feed_type, category: feed_category } });

// ─── Evaluation & Recommendation (JWT-protected) ────────────────────────────

export const evaluateDiet = (data: EvaluationRequest) =>
  api.post("/v1/animal/evaluate-diet", data);

export const recommendDiet = (data: RecommendationRequest) =>
  api.post("/v1/animal/diet-recommendation", data);

// ─── Reports (JWT-protected) ────────────────────────────────────────────────

// GET /v1/animal/user-reports — saved PDF reports (Feed Reports screen)
// user_id query removed — JWT-derived.
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

// `_user_id` accepted for call-site backward compatibility; ignored.
export const getSavedReports = (_user_id?: string) =>
  api.get<FeedReportListResponse>("/v1/animal/user-reports");

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

// PUT /v1/admin/users/{user_id}/toggle-status — JWT-derived admin; body { is_active }
export const toggleUserStatus = (user_id: string, _admin_user_id: string, is_active: boolean) =>
  api.put(`/v1/admin/users/${user_id}/toggle-status`, { is_active });

export const getAdminFeedTypes = (_admin_user_id: string) =>
  api.get("/v1/admin/list-feed-types");

export const getAdminFeedCategories = (_admin_user_id: string) =>
  api.get("/v1/admin/list-feed-categories");

export const getAdminFeedbacks = (_admin_user_id: string, limit = 20, offset = 0) =>
  api.get("/v1/admin/user-feedback/all", { params: { limit, offset } });

export const getAdminFeedbackStats = (_admin_user_id: string) =>
  api.get("/v1/admin/user-feedback/stats");

export const exportAdminFeeds = (_admin_user_id: string) =>
  api.get("/v1/admin/export-feeds");

// POST /v1/admin/bulk-upload-feeds (multipart, JWT-derived admin)
export const bulkUploadFeeds = (
  _admin_user_id: string,
  file: File,
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/v1/admin/bulk-upload-feeds", form, {
    headers: { "Content-Type": "multipart/form-data" },
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
  api.get("/v1/admin/export-custom-feeds");

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

// Y3 §1.1.1 — feed search. Backend endpoint not yet live.
// TODO(maria-y3): swap to real `api.get("/v1/animal/search-feeds", { params })`
// once Maria ships the endpoint. Spec v4.0.0 does NOT include it yet.
// Until then this stub returns [] so the search-bar UI compiles and renders
// an empty results list.
export interface FeedSearchResult {
  feed_uuid: string;
  feed_name: string;
  feed_type: string;
  feed_category: string;
}
export const searchFeeds = async (
  _query: string,
  _country_id: string,
  _user_id: string
): Promise<{ data: FeedSearchResult[] }> => {
  return Promise.resolve({ data: [] });
};

export default api;
