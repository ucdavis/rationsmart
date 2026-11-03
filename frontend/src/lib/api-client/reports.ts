// Saved reports, simulation history and user feedback.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api } from "./client";
import { listFrom } from "./normalize";

// ─── Reports (JWT-protected) ────────────────────────────────────────────────

// Saved PDF reports (Feed Reports screen): GET /v1/animal/user-reports
// (GetUserReportsResponse). /v1/animal/reports runs the same backend function
// (routers/animal.py) and used to be called too and merged; one call is
// enough (W11). bucket_url is null while the PDF isn't ready —
// requestReportPdf() below returns or generates it.
export interface FeedReport {
  report_id: string | null;
  report_type: string | null;
  bucket_url: string | null; // PDF download URL
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
  return listFrom<FeedReport>(data, "reports", "items");
}

export const getSavedReports = async (_user_id?: string) => {
  const res = await api.get("/v1/animal/user-reports");
  return {
    data: {
      reports: extractReportsList(res.data),
      success: true,
      message: null,
    } as FeedReportListResponse,
  };
};

// POST /v1/animal/reports/pdf — { report_id, user_id }. Returns the saved
// report's PDF, rendering it now if the background job hasn't finished or
// failed. 200 → { bucket_url }; 409 not saved / no content; 404 not found or
// not this user's; 502 render/upload failed (safe to retry).
export const requestReportPdf = (report_id: string, user_id: string) =>
  api.post<{ success?: boolean; message?: string | null; bucket_url?: string | null }>(
    "/v1/animal/reports/pdf",
    { report_id, user_id }
  );

// GET /v1/animal/simulations — simulation history (was POST /fetch-all-simulations)
export const getUserReports = (_user_id?: string) => api.get("/v1/animal/simulations");

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
