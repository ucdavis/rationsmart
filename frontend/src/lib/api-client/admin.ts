// Admin endpoints: users, feeds, feedback, reports, bulk upload / export,
// i18n translation + language catalog, and CLIMDES feed sync.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api } from "./client";

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
) => api.get("/v1/admin/users", { params: { page, page_size, country, status, search } });

// PUT /v1/admin/users/{user_id}/toggle-status — JWT-derived admin.
// v1 body shape is AdminUserToggleRequest { action: string }, NOT
// { is_active: bool } like legacy. The backend validates the value against
// "enable"/"disable" (it rejects "activate"/"deactivate" with
// "Value error, action must be 'enable' or 'disable'") — matching the
// sibling toggleCountryStatus / toggleFeedSyncScheduler endpoints.
export const toggleUserStatus = (user_id: string, _admin_user_id: string, is_active: boolean) =>
  api.put(`/v1/admin/users/${user_id}/toggle-status`, {
    action: is_active ? "enable" : "disable",
  });

// PUT /v1/admin/users/{user_id}/toggle-admin — JWT-derived admin.
// Body shape is AdminUserRoleToggleRequest { action: "grant" | "revoke" }.
// `make_admin=true` grants the admin role, false revokes it. Mirrors the
// toggle-status contract (which uses "enable"/"disable").
export const toggleUserAdmin = (user_id: string, _admin_user_id: string, make_admin: boolean) =>
  api.put(`/v1/admin/users/${user_id}/toggle-admin`, {
    action: make_admin ? "grant" : "revoke",
  });

export const getAdminFeedTypes = (_admin_user_id: string) => api.get("/v1/admin/list-feed-types");

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

// GET /v1/admin/feed-template — the current bulk-upload template (has the
// mandatory fd_code / fd_language_cd columns), served as an xlsx binary
// (rs_template_feed_upload.xlsx). Replaces the old Android-era S3 file,
// which those columns are missing from, so every upload built on it was
// rejected. Admin JWT, like export-feeds.
export const downloadFeedTemplate = () =>
  api.get("/v1/admin/feed-template", { responseType: "blob" });

// Overrides the instance's JSON default for FormData uploads (see below).
const MULTIPART_HEADERS = { "Content-Type": "multipart/form-data" };

// POST /v1/admin/feed-sync/run-from-file (multipart, JWT-derived admin).
// Replaces the removed /v1/admin/bulk-upload-feeds: the workbook goes
// through the same validate -> upsert -> translate pipeline as a CLIMDES
// sync and is logged in the feed-sync run history (trigger_type
// "file_upload"). Synchronous — the response is the finished run, same
// shape as getFeedSyncLog(). 400 = bad file extension, 409 = a sync run
// is already in progress.
// CRITICAL: uploads MUST pass MULTIPART_HEADERS. The shared instance
// defaults to Content-Type: application/json, and axios serialises a
// FormData body under a JSON content type as JSON — `{"file":{}}` — so
// the file never leaves the browser and FastAPI answers 422 "Field
// required". With the multipart header axios keeps the FormData, then
// (in a browser) drops the header so the browser writes
// `multipart/form-data; boundary=…` itself.
export const bulkUploadFeeds = (
  _admin_user_id: string,
  file: File,
  onProgress?: (pct: number) => void
) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/v1/admin/feed-sync/run-from-file", form, {
    headers: MULTIPART_HEADERS,
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded * 100) / evt.total));
      }
    },
  });
};

// DELETE /v1/admin/feeds — empty the whole standard feed library (feeds +
// feed translations; types, categories and custom feeds stay). The server
// takes a pg_dump first. Off unless the server sets ALLOW_FEED_LIBRARY_WIPE
// (403 otherwise — production refuses). `?dry_run=true` only counts.
// The real run's body MUST go in axios' `data` option: api.delete(url, body)
// treats the body as config, sends nothing, and the server answers 400.
export interface FeedLibraryWipeResult {
  success: boolean;
  dry_run: boolean;
  message: string;
  feeds: number;
  feed_translations: number;
  backup_file: string | null;
}
export const FEED_LIBRARY_CONFIRM_PHRASE = "DELETE ALL FEEDS";
export const previewFeedLibraryWipe = () =>
  api.delete<FeedLibraryWipeResult>("/v1/admin/feeds", { params: { dry_run: true } });
export const wipeFeedLibrary = (confirm: string) =>
  api.delete<FeedLibraryWipeResult>("/v1/admin/feeds", { data: { confirm } });

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

// ─── i18n V2 Phase 2: Admin Translation + Language endpoints ────────────────
// Spec source: backend i18n V2 "API endpoints for frontend" spec
// (sections 3 and 4). All JWT-admin protected. Always operate on a country_id.

// 3.1 — workbook download. Response is a binary xlsx; we ask axios for a Blob
// so the caller can pipe through URL.createObjectURL() + <a download>.
export const downloadTranslationWorkbook = (country_id: string) =>
  api.get("/v1/admin/translations/workbook", {
    params: { country_id },
    responseType: "blob",
  });

// 3.2 — workbook upload. Needs MULTIPART_HEADERS for the same reason as
// bulkUploadFeeds: without it the JSON default sends `{"file":{}}`.
export const uploadTranslationWorkbook = (country_id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/v1/admin/translations/workbook", form, {
    params: { country_id },
    headers: MULTIPART_HEADERS,
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
export const listLanguages = () => api.get("/v1/admin/languages");

// 4.3 — update a language (name / is_active)
export const patchLanguage = (code: string, body: { name?: string; is_active?: boolean }) =>
  api.patch(`/v1/admin/languages/${code}`, body);

// 4.4 — list countries with their assigned languages
export const listCountriesWithLanguages = () => api.get("/v1/admin/countries");

// 4.5 — assign a language to a country
export const assignLanguageToCountry = (country_id: string, code: string) =>
  api.post(`/v1/admin/countries/${country_id}/languages/${code}`);

// 4.6 — unassign a language from a country
export const unassignLanguageFromCountry = (country_id: string, code: string) =>
  api.delete(`/v1/admin/countries/${country_id}/languages/${code}`);

// 4.7 — activate/deactivate a country. Verified live 2026-07-20: a
// deactivated country is hidden from GET /v1/auth/countries (registration/
// profile) and from GET /v1/admin/countries (the active-only admin list —
// see 4.4), but existing users/feeds/reports referencing it are untouched.
export const toggleCountryStatus = (country_id: string, action: "enable" | "disable") =>
  api.put(`/v1/admin/countries/${country_id}/toggle-status`, { action });

// 4.8 — list EVERY country, active and inactive (companion to 4.7 — 4.4
// only returns active ones, so this is the only way to find inactive
// countries to offer in an "Activate a country" picker). No `languages`
// field on these rows (AdminCountryListItem) — that's only echoed on the
// active-only 4.4 response.
export const listAllCountries = () => api.get("/v1/admin/list-all-countries");

// ─── CLIMDES Feed Library Sync (Admin) ──────────────────────────────────────
// Spec source: CLIMDES admin UI design doc, verified live against the dev
// backend's /openapi.json (2026-07-20) — all six endpoints
// below exist exactly as documented. External org CLIMDES publishes a Feed
// Library (Excel export); this lets an admin configure the connection, flip
// the weekly auto-sync on/off, trigger a manual sync, and audit past runs.

// Lightweight status for the toggle + day picker + "Sync now" gating.
export const getFeedSyncSchedulerStatus = () => api.get("/v1/admin/feed-sync/scheduler/status");

// Full connection config. auth_token_masked is write-only on the way in —
// the GET only ever echoes a masked form (e.g. "****9xyz") or null.
export const getFeedSyncConfig = () => api.get("/v1/admin/feed-sync/config");

// Partial update — only send changed fields. scheduler_enabled is
// deliberately NOT accepted here; use toggleFeedSyncScheduler for that.
export const updateFeedSyncConfig = (body: {
  endpoint_url?: string;
  auth_type?: "none" | "api_key" | "bearer";
  auth_header_name?: string | null;
  auth_token?: string;
  sync_day_of_week?: string;
}) => api.put("/v1/admin/feed-sync/config", body);

// Gates automatic (scheduled) runs only — "Sync now" always works regardless
// of this toggle. Enabling with no endpoint_url configured returns 400.
export const toggleFeedSyncScheduler = (action: "enable" | "disable") =>
  api.put("/v1/admin/feed-sync/scheduler/toggle", { action });

// "Sync now" — non-blocking. Returns 202 + log_id immediately; poll
// getFeedSyncLog(log_id) until status leaves "running". 400 = endpoint not
// configured, 409 = a run is already in progress, 503 = worker/broker down.
export const runFeedSyncNow = () => api.post("/v1/admin/feed-sync/run");

// Paginated run history, newest first. page_size capped at 100 server-side.
export const getFeedSyncLogs = (page = 1, page_size = 20) =>
  api.get("/v1/admin/feed-sync/logs", { params: { page, page_size } });

// Single run with row-level detail (failed_rows, skipped_translations) —
// absent on the list endpoint to keep that response small.
export const getFeedSyncLog = (log_id: string) => api.get(`/v1/admin/feed-sync/logs/${log_id}`);
