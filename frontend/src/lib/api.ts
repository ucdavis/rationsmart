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
}

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
}

// Android default BaseThresholds (ash=10, fat/ee=7, ndf=45, starch=26)
export const DEFAULT_BASE_THRESHOLDS: DietLimits = {
  ash_max: 10,
  ee_max: 7,
  ndf_max: 45,
  starch_max: 26,
};

export function toCattleInfoPayload(ci: CattleInfo): CattleInfoPayload {
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
    lactating: true,          // Android hardcodes true
    fat_milk: ci.milk_fat_percent,
    milk_production: ci.milk_production,
    tp_milk: ci.milk_protein_percent,
    parity: ci.parity,
    temperature: ci.average_temperature,
    topography: ci.grazing ? (ci.topography ?? "Flat") : "Flat",
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

const api = axios.create({
  baseURL: "/api/proxy",
  timeout: 60000,   // Android uses 60s connect/read/write timeouts
  headers: {
    "Content-Type": "application/json",
  },
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

export const login = (email_id: string, pin: string) =>
  api.post("/auth/login", { email_id, pin });

export const register = (data: RegisterData) =>
  api.post("/auth/register", data);

// matches Android: POST /auth/forgot-pin with { email_id }
export const resetPin = (email_id: string) =>
  api.post("/auth/forgot-pin", { email_id });

export const getCountries = () => api.get<Country[]>("/auth/countries");

// GET /auth/user/{email_id} — returns UserProfileInfoResponse (includes is_admin)
export const getUserProfile = (email_id: string) =>
  api.get(`/auth/user/${encodeURIComponent(email_id)}`);

// PUT /auth/user/{email_id} with { name, country_id }
export const updateUserProfile = (email_id: string, data: { name: string; country_id: string }) =>
  api.put(`/auth/user/${encodeURIComponent(email_id)}`, data);

// POST /auth/user-delete-account — Android uses POST with query params
export const deleteAccount = (user_id: string, pin: string) =>
  api.post("/auth/user-delete-account", null, { params: { user_id, pin } });

// ─── Feed ─────────────────────────────────────────────────────────────────────

// GET /unique-feed-type/{country_id}/{user_id} → List<String>
export const getFeedTypes = (country_id: string, user_id: string) =>
  api.get<string[]>(`/unique-feed-type/${country_id}/${user_id}`);

// GET /unique-feed-category/?feed_type=...&country_id=...&user_id=...
export const getFeedCategories = (feed_type: string, country_id: string, user_id: string) =>
  api.get("/unique-feed-category", { params: { feed_type, country_id, user_id } });

// GET /feed-name/?feed_type=...&feed_category=...&country_id=...&user_id=...
// Returns List<FeedSubCategory> with {feed_name, feed_uuid, feed_category, feed_type, feed_cd}
export const getFeedSubCategories = (
  feed_type: string,
  feed_category: string,
  country_id: string,
  user_id: string
) =>
  api.get("/feed-name", { params: { feed_type, feed_category, country_id, user_id } });

// ─── Evaluation & Recommendation ─────────────────────────────────────────────

export const evaluateDiet = (data: EvaluationRequest) =>
  api.post("/diet-evaluation-working", data);

export const recommendDiet = (data: RecommendationRequest) =>
  api.post("/diet-recommendation-working", data);

// ─── Reports ─────────────────────────────────────────────────────────────────

// GET /get-user-reports/?user_id= — saved PDF reports (Feed Reports screen)
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

export const getSavedReports = (user_id: string) =>
  api.get<FeedReportListResponse>("/get-user-reports", { params: { user_id } });

// POST /fetch-all-simulations — simulation history (used in cattle-info history modal)
export const getUserReports = (user_id: string) =>
  api.post("/fetch-all-simulations", { user_id });

// POST /save-report with { report_id, user_id }
export const saveReport = (report_id: string, user_id: string) =>
  api.post("/save-report", { report_id, user_id });

export const getSimulationDetails = (report_id: string, user_id: string) =>
  api.post("/fetch-simulation-details", { report_id, user_id });

// ─── Feedback ─────────────────────────────────────────────────────────────────

// POST /user-feedback/submit?user_id=... with { text_feedback, feedback_type, overall_rating }
export const submitFeedback = (
  user_id: string,
  data: { feedback_type: string; text_feedback?: string; overall_rating?: number }
) => api.post("/user-feedback/submit", data, { params: { user_id } });

// GET /user-feedback/my?user_id=...&limit=...&offset=...
export const getMyFeedback = (user_id: string, limit = 50, offset = 0) =>
  api.get("/user-feedback/my", { params: { user_id, limit, offset } });

// ─── Admin ────────────────────────────────────────────────────────────────────

// GET /admin/users?admin_user_id=&page=&page_size=&country_filter=&status_filter=&search=
export const getAdminUsers = (
  admin_user_id: string,
  page = 1,
  page_size = 20,
  country_filter = "",
  status_filter = "",
  search = ""
) =>
  api.get("/admin/users", { params: { admin_user_id, page, page_size, country_filter, status_filter, search } });

// PUT /admin/users/{user_id}/toggle-status?admin_user_id=
export const toggleUserStatus = (user_id: string, admin_user_id: string, is_active: boolean) =>
  api.put(`/admin/users/${user_id}/toggle-status`, { is_active }, { params: { admin_user_id } });

// GET /admin/list-feed-types?admin_user_id=
export const getAdminFeedTypes = (admin_user_id: string) =>
  api.get("/admin/list-feed-types", { params: { admin_user_id } });

// GET /admin/list-feed-categories/?admin_user_id=
export const getAdminFeedCategories = (admin_user_id: string) =>
  api.get("/admin/list-feed-categories", { params: { admin_user_id } });

// GET /admin/user-feedback/all?admin_user_id=&limit=&offset=
export const getAdminFeedbacks = (admin_user_id: string, limit = 20, offset = 0) =>
  api.get("/admin/user-feedback/all", { params: { admin_user_id, limit, offset } });

// GET /admin/user-feedback/stats?admin_user_id=
export const getAdminFeedbackStats = (admin_user_id: string) =>
  api.get("/admin/user-feedback/stats", { params: { admin_user_id } });

// GET /admin/export-feeds?admin_user_id=
export const exportAdminFeeds = (admin_user_id: string) =>
  api.get("/admin/export-feeds", { params: { admin_user_id } });

// POST /admin/bulk-upload-feeds?admin_user_id= (multipart form data)
export const bulkUploadFeeds = (admin_user_id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/admin/bulk-upload-feeds", form, {
    params: { admin_user_id },
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// GET /admin/get-all-reports/ (admin all reports)
export const getAdminReports = (user_id: string, page = 1, page_size = 20) =>
  api.get("/admin/get-all-reports", { params: { user_id, page, page_size } });

// ─── Admin Feed CRUD ──────────────────────────────────────────────────────────

// GET /admin/list-feeds/?admin_user_id=&page=&page_size=&feed_type=&feed_category=&country_name=&search=
export const getAdminFeeds = (
  admin_user_id: string,
  page = 1,
  page_size = 20,
  feed_type = "",
  feed_category = "",
  country_name = "",
  search = ""
) =>
  api.get("/admin/list-feeds", {
    params: { admin_user_id, page, page_size, feed_type, feed_category, country_name, search },
  });

// POST /admin/add-feed?admin_user_id=
export const addAdminFeed = (admin_user_id: string, body: Record<string, unknown>) =>
  api.post("/admin/add-feed", body, { params: { admin_user_id } });

// PUT /admin/update-feed/{feed_id}?admin_user_id=
export const updateAdminFeed = (
  feed_id: string,
  admin_user_id: string,
  body: Record<string, unknown>
) => api.put(`/admin/update-feed/${feed_id}`, body, { params: { admin_user_id } });

// DELETE /admin/delete-feed/{feed_id}?admin_user_id=
export const deleteAdminFeed = (feed_id: string, admin_user_id: string) =>
  api.delete(`/admin/delete-feed/${feed_id}`, { params: { admin_user_id } });

// POST /admin/add-feed-category?admin_user_id=
// Android AddFeedCategoryRequest: { category_name, description, feed_type_id, sort_order }
export const addAdminFeedCategory = (
  admin_user_id: string,
  body: { category_name: string; description: string; feed_type_id: string; sort_order: number }
) => api.post("/admin/add-feed-category", body, { params: { admin_user_id } });

// DELETE /admin/delete-feed-category/{category_id}?admin_user_id=
export const deleteAdminFeedCategory = (category_id: string, admin_user_id: string) =>
  api.delete(`/admin/delete-feed-category/${category_id}`, { params: { admin_user_id } });

// POST /admin/add-feed-type?admin_user_id=
// Android AddFeedTypeRequest: { type_name, description, sort_order }
export const addAdminFeedType = (
  admin_user_id: string,
  body: { type_name: string; description: string; sort_order: number }
) => api.post("/admin/add-feed-type", body, { params: { admin_user_id } });

// DELETE /admin/delete-feed-type/{type_id}?admin_user_id=
export const deleteAdminFeedType = (type_id: string, admin_user_id: string) =>
  api.delete(`/admin/delete-feed-type/${type_id}`, { params: { admin_user_id } });

// GET /admin/export-custom-feeds?admin_user_id=
export const exportCustomFeeds = (admin_user_id: string) =>
  api.get("/admin/export-custom-feeds", { params: { admin_user_id } });

// ─── Custom Feed (user) ───────────────────────────────────────────────────────

// POST /check-insert-or-update — { country_id, feed_id, user_id }
export const checkInsertOrUpdate = (country_id: string, feed_id: string, user_id: string) =>
  api.post("/check-insert-or-update", { country_id, feed_id, user_id });

// POST /insert-custom-feed
export const insertCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) => api.post("/insert-custom-feed", body);

// POST /update-custom-feed
export const updateCustomFeed = (body: {
  country_id: string;
  user_id: string;
  feed_id: string;
  feed_insert: boolean;
  feed_details: Record<string, unknown>;
}) => api.post("/update-custom-feed", body);

// GET /feed-classification/structure
export const getFeedClassification = () => api.get("/feed-classification/structure");

export default api;
