"use client";

// Admin > Feed Library Sync (CLIMDES) — split out of admin/feed-sync/page.tsx (audit B-17).

import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";
import { saveBlob } from "@/lib/download";

export interface SchedulerStatus {
  scheduler_enabled: boolean;
  sync_day_of_week: string;
  next_scheduled_run: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  running: boolean;
}
export interface SyncConfig {
  endpoint_url: string | null;
  auth_type: string;
  auth_header_name: string | null;
  auth_token_masked: string | null;
  sync_day_of_week: string;
  scheduler_enabled: boolean;
  scheduler_toggled_by: string | null;
  scheduler_toggled_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
}
export interface FeedSyncLogItem {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string; // "running" | "success" | "failed"
  trigger_type: string; // "scheduled" | "manual"
  triggered_by: string | null;
  http_status: number | null;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  translations_inserted: number;
  translations_updated: number;
  translations_skipped: number;
}
interface FailedRow {
  row?: number;
  fd_code?: string;
  reason?: string;
  [key: string]: unknown;
}
export interface SkippedTranslation {
  fd_code?: string;
  language?: string;
  reason?: string;
  [key: string]: unknown;
}
export interface FeedSyncLogDetail extends FeedSyncLogItem {
  success: boolean;
  error_message: string | null;
  failed_rows: FailedRow[] | null;
  skipped_translations: SkippedTranslation[] | null;
}
export type Tab = "sync" | "history";
export type ConfirmState = {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;
export const DAY_OPTIONS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((d) => ({
  value: d,
  label: d.charAt(0).toUpperCase() + d.slice(1),
}));
export const AUTH_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API key" },
  { value: "bearer", label: "Bearer" },
];
export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// UTC ISO-8601 in, local-time display out, with a UTC tooltip (per the
// doc's formatting notes — "render in local timezone with a UTC hint").
export function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
// next_scheduled_run is a plain YYYY-MM-DD date meaning "00:00 UTC that day".
export function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
// Deep-links per §4.2 — grouped skip reasons that map to a provisioning
// screen. "language is 'en'" / blank-invalid reasons are informational
// only and deliberately return null (no action to take).
export function deepLinkForReason(reason: string): { label: string; href: string } | null {
  const r = reason.toLowerCase();
  if (r.includes("not assigned to") || r.includes("not a registered active language")) {
    return { label: "Assign language →", href: "/admin/country-language" };
  }
  if (
    r.includes("does not match any active feed type") ||
    r.includes("is not a valid active category")
  ) {
    return { label: "Manage feed types →", href: "/admin/feeds" };
  }
  return null;
}
// Polling cadence (audit D-08). Scheduler status refreshes slowly in the
// background; a sync someone else started is checked every 5 s; a sync
// started from this page is followed every 4 s.
export const STATUS_REFRESH_MS = 60_000;
export const OTHER_RUN_POLL_MS = 5_000;
export const OWN_RUN_POLL_MS = 4_000;
// Longest a manual sync is polled for before the page stops waiting.
export const SYNC_POLL_MAX_MS = 30 * 60 * 1000;
// The scheduler runs weekly, so no success for 8 days means a run was missed.
export const STALE_SUCCESS_MS = 8 * 24 * 60 * 60 * 1000;
function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Cells come from the external CLIMDES feed. A leading = + - @ (or tab /
  // CR) makes Excel/Sheets evaluate the cell as a formula, so neutralise it
  // with a leading apostrophe (OWASP CSV-injection guidance).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  saveBlob(blob, filename);
}
export const cardStyle = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };
export const inputStyle = {
  backgroundColor: COLORS.americanDiamond,
  color: COLORS.raisinBlack,
};
export const sheetOverlayStyle = {
  left: COLUMN_LEFT,
  width: COLUMN_WIDTH,
  backgroundColor: "rgba(0,0,0,0.65)",
};
export function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cfg =
    s === "success"
      ? { bg: "rgba(28,160,105,0.12)", fg: COLORS.crayolaGreen, label: "Success" }
      : s === "failed"
        ? { bg: "rgba(228,74,74,0.12)", fg: COLORS.carminePink, label: "Failed" }
        : { bg: "rgba(255,152,0,0.14)", fg: COLORS.webAmberText, label: "Running" };
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${s === "running" ? "animate-pulse" : ""}`}
      style={{ backgroundColor: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}
