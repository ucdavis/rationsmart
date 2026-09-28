// Saved reports, simulation history and user feedback.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api } from "./client";

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
  return Array.isArray(data)
    ? (data as FeedReport[])
    : Array.isArray((data as { reports?: FeedReport[] })?.reports)
      ? (data as { reports: FeedReport[] }).reports
      : Array.isArray((data as { items?: FeedReport[] })?.items)
        ? (data as { items: FeedReport[] }).items
        : [];
}

async function fetchReportsFrom(path: string): Promise<{ ok: boolean; list: FeedReport[] }> {
  try {
    const res = await api.get(path);
    return { ok: true, list: extractReportsList(res.data) };
  } catch {
    // The axios error interceptor already logged status + URL. Don't log
    // `err` itself: its config carries the Authorization header (the JWT).
    return { ok: false, list: [] };
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

  // Only a genuine both-endpoints-failed state is an error worth showing the
  // user. If either responded (even with an empty list) that's a valid "no
  // reports yet" — a toast then would be a false alarm. Throwing here lets the
  // reports page's .catch surface the "Could not load reports" snackbar
  // (REPORTS-006: previously both-fail resolved success:true → dead catch).
  if (!primary.ok && !fallback.ok) {
    throw new Error("Could not load reports");
  }

  const merged = new Map<string, FeedReport>();
  [...primary.list, ...fallback.list].forEach((r, i) => {
    merged.set(r.report_id ?? r.simulation_id ?? `__idx_${i}`, r);
  });

  return {
    data: {
      reports: Array.from(merged.values()),
      success: true,
      message: null,
    } as FeedReportListResponse,
  };
};

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
