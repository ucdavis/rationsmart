"use client";

// Admin > Feed Library Sync (CLIMDES)
// Spec: CLIMDES admin UI design doc — verified live against the dev
// backend's /openapi.json (2026-07-20). CLIMDES is an external
// org whose API publishes a Feed Library (Excel export) with English + a
// local-language name per feed. RationSmart imports it weekly on an
// admin-chosen day (default Wednesday, 00:00 UTC); the admin can also
// trigger a sync manually and audit past runs.
//
// Two tabs:
//   Sync & Settings — status card (toggle, sync day, next/last run info,
//     "Sync now" with poll-driven progress) + connection settings form.
//   Run History — paginated log list + a detail drawer with row-level
//     failed_rows / skipped_translations (the latter grouped by reason,
//     which is the doc's "killer feature" — turns hundreds of skipped
//     rows into a handful of actionable lines with deep-links to the
//     screens that fix them).
//
// Behavioral rules from the doc, load-bearing — don't relax these:
//   - The toggle gates ONLY scheduled runs; "Sync now" works regardless,
//     even while the toggle is off.
//   - Enabling requires a configured endpoint_url — disable the toggle
//     client-side with a hint instead of letting the 400 happen.
//   - Only one run at a time (409 on overlap) — disable "Sync now" while
//     status.running is true, whether that's our own manual run or a
//     scheduled one happening in the background.
//   - No "feeds removed" concept exists anywhere — never render one.
//   - Skips are normal, not errors — presented as actionable info.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import CustomSelect from "@/components/CustomSelect";
import {
  getFeedSyncSchedulerStatus,
  getFeedSyncConfig,
  updateFeedSyncConfig,
  toggleFeedSyncScheduler,
  runFeedSyncNow,
  getFeedSyncLogs,
  getFeedSyncLog,
} from "@/lib/api";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";

interface SchedulerStatus {
  scheduler_enabled: boolean;
  sync_day_of_week: string;
  next_scheduled_run: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  running: boolean;
}
interface SyncConfig {
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
interface FeedSyncLogItem {
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
interface SkippedTranslation {
  fd_code?: string;
  language?: string;
  reason?: string;
  [key: string]: unknown;
}
interface FeedSyncLogDetail extends FeedSyncLogItem {
  success: boolean;
  error_message: string | null;
  failed_rows: FailedRow[] | null;
  skipped_translations: SkippedTranslation[] | null;
}

type Tab = "sync" | "history";
type ConfirmState = {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

const DAY_OPTIONS = [
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
const AUTH_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API key" },
  { value: "bearer", label: "Bearer" },
];

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// UTC ISO-8601 in, local-time display out, with a UTC tooltip (per the
// doc's formatting notes — "render in local timezone with a UTC hint").
function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// next_scheduled_run is a plain YYYY-MM-DD date meaning "00:00 UTC that day".
function formatNextRun(dateStr: string | null): string {
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

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
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
function deepLinkForReason(reason: string): { label: string; href: string } | null {
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

// Longest a manual sync is polled for before the page stops waiting.
const SYNC_POLL_MAX_MS = 30 * 60 * 1000;

function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Cells come from the external CLIMDES feed. A leading = + - @ (or tab /
  // CR) makes Excel/Sheets evaluate the cell as a formula, so neutralise it
  // with a leading apostrophe (OWASP CSV-injection guidance).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cardStyle = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };
const inputStyle = {
  backgroundColor: "#F1F5F9",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
};
const sheetOverlayStyle = {
  left: COLUMN_LEFT,
  width: COLUMN_WIDTH,
  backgroundColor: "rgba(0,0,0,0.65)",
};

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cfg =
    s === "success"
      ? { bg: "rgba(28,160,105,0.12)", fg: "#1CA069", label: "Success" }
      : s === "failed"
        ? { bg: "rgba(228,74,74,0.12)", fg: "#E44A4A", label: "Failed" }
        : { bg: "rgba(255,152,0,0.14)", fg: "#B4690E", label: "Running" };
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${s === "running" ? "animate-pulse" : ""}`}
      style={{ backgroundColor: cfg.bg, color: cfg.fg, fontFamily: "Nunito, sans-serif" }}
    >
      {cfg.label}
    </span>
  );
}

export default function AdminFeedSyncPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [tab, setTab] = useState<Tab>("sync");
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  useEscapeKey(!!confirm, () => setConfirm(null));
  const [viewLogId, setViewLogId] = useState<string | null>(null);

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = useCallback(() => {
    setIsLoading(true);
    return Promise.allSettled([getFeedSyncSchedulerStatus(), getFeedSyncConfig()])
      .then(([statusRes, configRes]) => {
        if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
        else showSnackbar("Could not load sync status", "error");
        if (configRes.status === "fulfilled") setConfig(configRes.value.data);
        else showSnackbar("Could not load sync configuration", "error");
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.is_admin) reload();
  }, [user?.is_admin, reload]);

  // Cheap endpoint — auto-refresh the status card every 60s while the
  // page is open, per the doc's nice-to-have.
  useEffect(() => {
    if (!user?.is_admin) return;
    const id = setInterval(() => {
      getFeedSyncSchedulerStatus()
        .then((res) => setStatus(res.data))
        // Background refresh on an interval: a missed tick is retried on
        // the next one, so there's nothing useful to tell the admin.
        .catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [user?.is_admin]);

  const askConfirm = (
    title: string,
    body: string,
    label: string,
    danger: boolean,
    onConfirm: () => void
  ) => {
    setConfirm({
      title,
      body,
      label,
      danger,
      onConfirm: () => {
        onConfirm();
        setConfirm(null);
      },
    });
  };

  const handleViewDetails = (logId: string) => {
    setTab("history");
    setViewLogId(logId);
  };

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Feed Library Sync" onBack={() => router.back()} />

      <div className="px-3 pt-3">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: "#E4F7EF" }}>
          {(
            [
              { key: "sync", label: "Sync & Settings" },
              { key: "history", label: "Run History" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{
                backgroundColor: tab === t.key ? "#064E3B" : "transparent",
                color: tab === t.key ? "#FFFFFF" : "#064E3B",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
                transition: "background-color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !status && !config ? (
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
          <div className="bg-white rounded-2xl p-4 space-y-3" style={cardStyle}>
            <div className="h-4 w-40 rounded-full shimmer" />
            <div className="h-4 w-56 rounded-full shimmer" />
            <div className="h-4 w-48 rounded-full shimmer" />
            <div className="h-10 w-32 rounded-xl shimmer" />
          </div>
          <div className="bg-white rounded-2xl p-4 space-y-3" style={cardStyle}>
            <div className="h-4 w-52 rounded-full shimmer" />
            <div className="h-4 w-full rounded-full shimmer" />
            <div className="h-4 w-full rounded-full shimmer" />
          </div>
        </div>
      ) : tab === "sync" ? (
        <SyncSettingsTab
          status={status}
          config={config}
          setStatus={setStatus}
          setConfig={setConfig}
          reload={reload}
          showSnackbar={showSnackbar}
          askConfirm={askConfirm}
          onViewDetails={handleViewDetails}
        />
      ) : (
        <RunHistoryTab
          showSnackbar={showSnackbar}
          viewLogId={viewLogId}
          onViewLogIdConsumed={() => setViewLogId(null)}
        />
      )}

      {confirm && (
        <div
          className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
          style={{
            left: COLUMN_LEFT,
            width: COLUMN_WIDTH,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl w-full px-5 py-5"
            style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
          >
            <p
              className="font-bold mb-2"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 15 }}
            >
              {confirm.title}
            </p>
            <p
              className="text-sm mb-4"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}
            >
              {confirm.body}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: "transparent",
                  color: "#064E3B",
                  border: "1.5px solid #064E3B",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirm.onConfirm}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: confirm.danger ? "#E44A4A" : "#064E3B",
                  color: "#FFFFFF",
                  border: "none",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                {confirm.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 1 — Sync & Settings
// ══════════════════════════════════════════════════════════════════════

function SyncSettingsTab({
  status,
  config,
  setStatus,
  setConfig,
  reload,
  showSnackbar,
  askConfirm,
  onViewDetails,
}: {
  status: SchedulerStatus | null;
  config: SyncConfig | null;
  setStatus: (
    s: SchedulerStatus | ((prev: SchedulerStatus | null) => SchedulerStatus | null)
  ) => void;
  setConfig: (c: SyncConfig) => void;
  reload: () => Promise<void> | void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  askConfirm: (
    title: string,
    body: string,
    label: string,
    danger: boolean,
    onConfirm: () => void
  ) => void;
  onViewDetails: (logId: string) => void;
}) {
  const [isTogglingScheduler, setIsTogglingScheduler] = useState(false);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [runningLogId, setRunningLogId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FeedSyncLogDetail | null>(null);

  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formAuthType, setFormAuthType] = useState("none");
  const [formHeaderName, setFormHeaderName] = useState("");
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const [formToken, setFormToken] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    },
    []
  );

  // Someone else's run (a scheduled tick, or another admin's manual sync)
  // is in progress — poll status (not a log_id we don't have) until it
  // clears, then do a full reload so the settings/status cards catch up.
  useEffect(() => {
    if (!status?.running || runningLogId) return;
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(() => {
      getFeedSyncSchedulerStatus()
        .then((res) => {
          setStatus(res.data);
          if (!res.data.running) {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
            reload();
          }
        })
        .catch(() => {}); // transient — the next 5-s tick retries
    }, 5000);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.running, runningLogId]);

  const openSettingsEditor = () => {
    if (!config) return;
    setFormEndpoint(config.endpoint_url ?? "");
    setFormAuthType(config.auth_type || "none");
    setFormHeaderName(config.auth_header_name ?? "");
    setIsReplacingToken(false);
    setFormToken("");
    setSettingsError(null);
    setIsEditingSettings(true);
  };

  const handleToggleScheduler = () => {
    if (!status || !config) return;
    if (!status.scheduler_enabled) {
      if (!config.endpoint_url) return; // guarded by disabled UI already
      doToggle("enable");
    } else {
      askConfirm(
        "Disable automatic scheduler?",
        "Automatic syncing will stop. Manual sync stays available.",
        "Disable",
        true,
        () => doToggle("disable")
      );
    }
  };

  const doToggle = async (action: "enable" | "disable") => {
    setIsTogglingScheduler(true);
    setStatus((prev) => (prev ? { ...prev, scheduler_enabled: action === "enable" } : prev));
    try {
      const res = await toggleFeedSyncScheduler(action);
      showSnackbar(res.data.message, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update the scheduler";
      showSnackbar(msg, "error");
    } finally {
      try {
        const res = await getFeedSyncSchedulerStatus();
        setStatus(res.data);
      } catch {
        // leave the optimistic value in place if even the refresh fails
      }
      setIsTogglingScheduler(false);
    }
  };

  const handleDayChange = async (day: string) => {
    setIsSavingDay(true);
    try {
      const res = await updateFeedSyncConfig({ sync_day_of_week: day });
      setConfig(res.data);
      showSnackbar(`Sync day set to ${capitalize(day)}`, "success");
      const statusRes = await getFeedSyncSchedulerStatus();
      setStatus(statusRes.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update the sync day";
      showSnackbar(msg, "error");
    } finally {
      setIsSavingDay(false);
    }
  };

  const startPolling = (logId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    // Upper bound so a run the backend never finalises (worker crash) can't
    // poll forever. The run keeps going server-side; the history table
    // below still shows its final status on the next reload.
    const deadline = Date.now() + SYNC_POLL_MAX_MS;
    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setRunningLogId(null);
        reload();
        showSnackbar("Sync is taking longer than expected — check Sync History later", "info");
        return;
      }
      try {
        const res = await getFeedSyncLog(logId);
        const log: FeedSyncLogDetail = res.data;
        if (log.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setRunningLogId(null);
          setLastResult(log);
          reload();
          if (log.status === "success") {
            showSnackbar(
              `Sync complete — ${log.inserted} added, ${log.updated} updated, ${log.skipped} rows skipped`,
              "success"
            );
          } else {
            showSnackbar(log.error_message ?? "Sync failed", "error");
          }
        }
      } catch {
        // transient network hiccup — keep polling, don't abandon the run
      }
    }, 4000);
  };

  const handleSyncNow = async () => {
    setIsDispatching(true);
    setLastResult(null);
    try {
      const res = await runFeedSyncNow();
      setRunningLogId(res.data.log_id);
      showSnackbar(res.data.message, "info");
      startPolling(res.data.log_id);
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } };
      const httpStatus = anyErr?.response?.status;
      if (httpStatus === 409) showSnackbar("A sync is already running", "error");
      else if (httpStatus === 503)
        showSnackbar("Sync service unavailable — try again shortly", "error");
      else showSnackbar(err instanceof Error ? err.message : "Could not start the sync", "error");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!config) return;
    setSettingsError(null);
    // A NEW endpoint must be https — the request carries the CLIMDES API
    // key / bearer token. An already-saved http:// endpoint is left alone so
    // other settings can still be saved; the backend should enforce https
    // and block private address ranges too (it chooses where to connect).
    const endpointChanged = formEndpoint.trim() !== (config.endpoint_url ?? "");
    if (formEndpoint && endpointChanged && !/^https:\/\//i.test(formEndpoint.trim())) {
      setSettingsError("Endpoint URL must start with https://");
      return;
    }
    const body: Parameters<typeof updateFeedSyncConfig>[0] = {};
    if (formEndpoint.trim() !== (config.endpoint_url ?? ""))
      body.endpoint_url = formEndpoint.trim();
    if (formAuthType !== config.auth_type)
      body.auth_type = formAuthType as "none" | "api_key" | "bearer";
    if (formAuthType === "api_key" && formHeaderName.trim() !== (config.auth_header_name ?? "")) {
      body.auth_header_name = formHeaderName.trim();
    }
    if (isReplacingToken && formToken.trim()) body.auth_token = formToken.trim();

    if (Object.keys(body).length === 0) {
      setIsEditingSettings(false);
      return;
    }

    setIsSavingSettings(true);
    try {
      const res = await updateFeedSyncConfig(body);
      setConfig(res.data);
      showSnackbar("Connection settings saved", "success");
      setIsEditingSettings(false);
      const statusRes = await getFeedSyncSchedulerStatus();
      setStatus(statusRes.data);
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (!status || !config) return null;

  const canEnable = !!config.endpoint_url;
  const isRunning = !!status.running || !!runningLogId;
  const isStale =
    status.scheduler_enabled &&
    !!status.last_success_at &&
    Date.now() - new Date(status.last_success_at).getTime() > 8 * 24 * 60 * 60 * 1000;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* STATUS CARD */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="px-4 py-3"
          style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            Automatic Sync
          </p>
        </div>
        <div className="px-4 py-4 space-y-4">
          {isStale && (
            <div
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{
                backgroundColor: "rgba(255,152,0,0.14)",
                color: "#B4690E",
                fontFamily: "Nunito, sans-serif",
              }}
            >
              Last sync overdue — check Run History
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p
                className="font-bold text-sm"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                Automatic Scheduler
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                {status.scheduler_enabled
                  ? `Syncs automatically every ${capitalize(status.sync_day_of_week)} at 00:00 UTC.`
                  : "Automatic sync is off. You can still sync manually."}
              </p>
              {!canEnable && !status.scheduler_enabled && (
                <p
                  className="text-xs mt-0.5 font-bold"
                  style={{ color: "#B4690E", fontFamily: "Nunito, sans-serif" }}
                >
                  Configure the CLIMDES endpoint first
                </p>
              )}
              {config.scheduler_toggled_by && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}
                >
                  Last changed by {config.scheduler_toggled_by.slice(0, 8)}… on{" "}
                  {formatDateTime(config.scheduler_toggled_at)}
                </p>
              )}
            </div>
            <label
              className="toggle-switch flex-shrink-0"
              aria-label={
                status.scheduler_enabled
                  ? "Disable automatic scheduler"
                  : "Enable automatic scheduler"
              }
              style={{
                opacity: isTogglingScheduler || (!canEnable && !status.scheduler_enabled) ? 0.5 : 1,
                cursor:
                  isTogglingScheduler || (!canEnable && !status.scheduler_enabled)
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={status.scheduler_enabled}
                disabled={isTogglingScheduler || (!canEnable && !status.scheduler_enabled)}
                onChange={handleToggleScheduler}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div>
            <p
              className="text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Sync day
            </p>
            <CustomSelect
              value={status.sync_day_of_week}
              onChange={handleDayChange}
              options={DAY_OPTIONS}
              disabled={isSavingDay}
              style={{ backgroundColor: "#F1F5F9", borderRadius: 14, padding: "10px 12px" }}
            />
            <p
              className="text-xs mt-1"
              style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}
            >
              Changing the day doesn&apos;t trigger a run today — use Sync now for an immediate
              refresh.
            </p>
          </div>

          <div className="space-y-2 pt-1" style={{ borderTop: "1px solid #F1F5F9" }}>
            <div className="flex justify-between text-sm pt-2">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                Next scheduled sync
              </span>
              <span
                className="font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                {formatNextRun(status.next_scheduled_run)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Last run</span>
              <span
                className="font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                title={status.last_run_at ?? undefined}
              >
                {formatDateTime(status.last_run_at)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                Last successful sync
              </span>
              <span
                className="font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                title={status.last_success_at ?? undefined}
              >
                {formatDateTime(status.last_success_at)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSyncNow}
              disabled={isDispatching || isRunning}
              className="py-2.5 px-5 rounded-xl font-bold text-sm flex-shrink-0"
              style={{
                backgroundColor: isDispatching || isRunning ? "#D3D3D3" : "#064E3B",
                color: "#FFFFFF",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: isDispatching || isRunning ? "not-allowed" : "pointer",
              }}
            >
              <span aria-hidden="true">⟳</span> Sync now
            </button>
            <span
              className="text-xs font-bold"
              style={{ color: isRunning ? "#B4690E" : "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              status: {isRunning ? "running…" : "idle"}
            </span>
          </div>
        </div>
      </div>

      {/* Result summary panel */}
      {lastResult && (
        <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
          <div
            className="px-4 py-3"
            style={{
              backgroundColor:
                lastResult.status === "success" ? "rgba(28,160,105,0.12)" : "rgba(228,74,74,0.12)",
              borderBottom: "1px solid #F1F5F9",
            }}
          >
            <p
              className="font-bold text-sm"
              style={{
                color: lastResult.status === "success" ? "#1CA069" : "#E44A4A",
                fontFamily: "Nunito, sans-serif",
              }}
            >
              {lastResult.status === "success" ? "✅ Sync complete" : "❌ Sync failed"} —{" "}
              {formatDateTime(lastResult.finished_at)}
            </p>
          </div>
          <div
            className="px-4 py-3 space-y-1 text-sm"
            style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          >
            {lastResult.status === "success" ? (
              <>
                <p>{lastResult.total_rows.toLocaleString()} rows processed</p>
                <p>
                  {lastResult.inserted.toLocaleString()} feeds added ·{" "}
                  {lastResult.updated.toLocaleString()} feeds updated ·{" "}
                  {lastResult.skipped.toLocaleString()} rows skipped
                </p>
                <p>
                  {lastResult.translations_inserted.toLocaleString()} local names saved ·{" "}
                  {lastResult.translations_skipped.toLocaleString()} local names skipped
                </p>
              </>
            ) : (
              <p style={{ color: "#E44A4A" }}>
                {lastResult.error_message ?? "An unexpected error occurred."}
              </p>
            )}
            <button
              onClick={() => onViewDetails(lastResult.id)}
              className="text-sm font-bold mt-2"
              style={{
                background: "none",
                border: "none",
                color: "#064E3B",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
                padding: 0,
              }}
            >
              View details →
            </button>
          </div>
        </div>
      )}

      {/* CONNECTION SETTINGS */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide flex-1"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            Connection Settings
          </p>
          {!isEditingSettings && (
            <button
              onClick={openSettingsEditor}
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{
                backgroundColor: "#064E3B",
                color: "#FFFFFF",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          )}
        </div>

        {!isEditingSettings ? (
          <div className="px-4 py-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                Endpoint URL
              </span>
              <span
                className="font-bold text-right break-all"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                {config.endpoint_url || "Not configured"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Auth type</span>
              <span
                className="font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                {AUTH_TYPE_OPTIONS.find((o) => o.value === config.auth_type)?.label ??
                  capitalize(config.auth_type)}
              </span>
            </div>
            {config.auth_type === "api_key" && (
              <div className="flex justify-between gap-3">
                <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  Header name
                </span>
                <span
                  className="font-bold"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {config.auth_header_name || "—"}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Token</span>
              <span
                className="font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                {config.auth_token_masked || "Not set"}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                Endpoint URL
              </p>
              <input
                type="text"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                placeholder="https://api.example.com/feed-library"
                className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                Auth type
              </p>
              <CustomSelect
                value={formAuthType}
                onChange={setFormAuthType}
                options={AUTH_TYPE_OPTIONS}
                style={{ backgroundColor: "#F1F5F9", borderRadius: 14, padding: "10px 12px" }}
              />
            </div>
            {formAuthType === "api_key" && (
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-wide mb-1"
                  style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  Header name
                </p>
                <input
                  type="text"
                  value={formHeaderName}
                  onChange={(e) => setFormHeaderName(e.target.value)}
                  placeholder="X-API-Key"
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                Token
              </p>
              {!isReplacingToken ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl px-4 py-3 text-sm" style={inputStyle}>
                    {config.auth_token_masked || "Not set"}
                  </div>
                  <button
                    onClick={() => setIsReplacingToken(true)}
                    className="text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0"
                    style={{
                      backgroundColor: "transparent",
                      color: "#064E3B",
                      border: "1.5px solid #064E3B",
                      fontFamily: "Nunito, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Replace token
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder="Enter new token"
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>

            {settingsError && (
              <p
                className="text-xs font-bold"
                style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
              >
                {settingsError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setIsEditingSettings(false)}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: "transparent",
                  color: "#064E3B",
                  border: "1.5px solid #064E3B",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: isSavingSettings ? "#D3D3D3" : "#064E3B",
                  color: "#FFFFFF",
                  border: "none",
                  fontFamily: "Nunito, sans-serif",
                  cursor: isSavingSettings ? "not-allowed" : "pointer",
                }}
              >
                {isSavingSettings ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 2 — Run History
// ══════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;
const ROWS_CHUNK = 100;

function RunHistoryTab({
  showSnackbar,
  viewLogId,
  onViewLogIdConsumed,
}: {
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  viewLogId: string | null;
  onViewLogIdConsumed: () => void;
}) {
  const [logs, setLogs] = useState<FeedSyncLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const [openLog, setOpenLog] = useState<FeedSyncLogDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  useEscapeKey(!!isDetailOpen, () => setIsDetailOpen(false));
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [rowFilter, setRowFilter] = useState("");
  const [rowsExpanded, setRowsExpanded] = useState(false);
  const [rowsShown, setRowsShown] = useState(ROWS_CHUNK);

  const [transExpanded, setTransExpanded] = useState(false);

  const loadLogs = useCallback((p: number) => {
    setIsLoadingLogs(true);
    getFeedSyncLogs(p, PAGE_SIZE)
      .then((res) => {
        setLogs(res.data.logs);
        setTotalPages(res.data.total_pages || 1);
        setTotalCount(res.data.total_count || 0);
      })
      .catch(() => showSnackbar("Could not load run history", "error"))
      .finally(() => setIsLoadingLogs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLogs(page);
  }, [page, loadLogs]);

  const openDetail = useCallback((id: string) => {
    setIsDetailOpen(true);
    setIsLoadingDetail(true);
    setOpenLog(null);
    setRowFilter("");
    setRowsExpanded(false);
    setRowsShown(ROWS_CHUNK);
    setTransExpanded(false);
    getFeedSyncLog(id)
      .then((res) => setOpenLog(res.data))
      .catch(() => {
        showSnackbar("Could not load run detail", "error");
        setIsDetailOpen(false);
      })
      .finally(() => setIsLoadingDetail(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!viewLogId) return;
    openDetail(viewLogId);
    onViewLogIdConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewLogId]);

  const filteredFailedRows = useMemo(() => {
    const rows = openLog?.failed_rows ?? [];
    if (!rowFilter.trim()) return rows;
    const q = rowFilter.trim().toLowerCase();
    return rows.filter(
      (r) =>
        String(r.fd_code ?? "")
          .toLowerCase()
          .includes(q) ||
        String(r.reason ?? "")
          .toLowerCase()
          .includes(q) ||
        String(r.row ?? "").includes(q)
    );
  }, [openLog, rowFilter]);

  const groupedSkippedTranslations = useMemo(() => {
    const map = new Map<string, SkippedTranslation[]>();
    for (const t of openLog?.skipped_translations ?? []) {
      const key = t.reason ?? "Unknown reason";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [openLog]);

  const namesLabel = (l: FeedSyncLogItem) =>
    `${l.translations_inserted + l.translations_updated}/${l.translations_skipped}`;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            Run History
          </p>
          <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            {totalCount} runs
          </p>
        </div>

        {isLoadingLogs ? (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="px-4 py-3 space-y-2"
                style={{ borderTop: "1px solid #F8FAF9" }}
              >
                <div className="h-4 w-40 rounded-full shimmer" />
                <div className="h-3 w-56 rounded-full shimmer" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p
            className="text-sm text-center py-6"
            style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
          >
            No sync runs yet.
          </p>
        ) : (
          logs.map((log) => (
            <button
              key={log.id}
              onClick={() => openDetail(log.id)}
              className="w-full text-left px-4 py-3"
              style={{
                borderTop: "1px solid #F8FAF9",
                background: "none",
                border: "none",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: "#F8FAF9",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-bold text-sm"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  title={log.started_at ?? undefined}
                >
                  {formatDateTime(log.started_at)}
                </p>
                <StatusChip status={log.status} />
              </div>
              <p
                className="text-xs mt-1"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                {capitalize(log.trigger_type)}
                {log.status !== "running" && (
                  <>
                    {" "}
                    · Rows {log.total_rows.toLocaleString()} · +New {log.inserted.toLocaleString()}{" "}
                    · ~Upd {log.updated.toLocaleString()} · Skip {log.skipped.toLocaleString()} ·
                    Names {namesLabel(log)}
                  </>
                )}
              </p>
            </button>
          ))
        )}

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid #F8FAF9" }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-sm font-bold px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "transparent",
                color: page <= 1 ? "#C2C2C2" : "#064E3B",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              ‹ Prev
            </button>
            <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Page {page} of {totalPages}
            </p>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-sm font-bold px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "transparent",
                color: page >= totalPages ? "#C2C2C2" : "#064E3B",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next ›
            </button>
          </div>
        )}
      </div>

      {/* Run detail drawer */}
      {isDetailOpen && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={sheetOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDetailOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", maxHeight: "88vh" }}
          >
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>

            {isLoadingDetail || !openLog ? (
              <div className="space-y-3 py-4">
                <div className="h-5 w-52 rounded-full shimmer" />
                <div className="h-4 w-40 rounded-full shimmer" />
                <div className="h-24 w-full rounded-2xl shimmer" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p
                    className="font-bold"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                    title={openLog.started_at ?? undefined}
                  >
                    Run {formatDateTime(openLog.started_at)}
                  </p>
                  <StatusChip status={openLog.status} />
                </div>
                <p
                  className="text-xs mb-4"
                  style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  {capitalize(openLog.trigger_type)} · Duration{" "}
                  {formatDuration(openLog.started_at, openLog.finished_at)}
                  {openLog.http_status ? ` · HTTP ${openLog.http_status}` : ""}
                </p>

                {openLog.status === "failed" && openLog.error_message && (
                  <div
                    className="rounded-xl px-3 py-2 mb-4 text-sm"
                    style={{
                      backgroundColor: "#FEC5BB",
                      color: "#E44A4A",
                      fontFamily: "Nunito, sans-serif",
                    }}
                  >
                    {openLog.error_message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl p-3" style={{ backgroundColor: "#F8FAF9" }}>
                    <p
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                    >
                      Feeds
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                    >
                      {openLog.inserted.toLocaleString()} added
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                    >
                      {openLog.updated.toLocaleString()} updated
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                    >
                      {openLog.skipped.toLocaleString()} rows skipped
                    </p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: "#F8FAF9" }}>
                    <p
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                    >
                      Local names
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                    >
                      {(
                        openLog.translations_inserted + openLog.translations_updated
                      ).toLocaleString()}{" "}
                      saved
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                    >
                      {openLog.translations_skipped.toLocaleString()} skipped
                    </p>
                  </div>
                </div>

                {/* Skipped rows */}
                {!!openLog.failed_rows?.length && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between w-full">
                      <button
                        onClick={() => setRowsExpanded((v) => !v)}
                        className="flex-1 text-left"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <p
                          className="font-bold text-sm"
                          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                        >
                          {rowsExpanded ? "▾" : "▸"} Skipped rows (
                          {openLog.failed_rows.length.toLocaleString()})
                        </p>
                      </button>
                      <button
                        aria-label="Download CSV"
                        onClick={() =>
                          downloadCsv(
                            `feed-sync-${openLog.id}-skipped-rows.csv`,
                            openLog.failed_rows ?? []
                          )
                        }
                        className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: "#E4F7EF",
                          color: "#064E3B",
                          border: "none",
                          fontFamily: "Nunito, sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        <span aria-hidden="true">⬇</span> CSV
                      </button>
                    </div>
                    {rowsExpanded && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={rowFilter}
                          onChange={(e) => {
                            setRowFilter(e.target.value);
                            setRowsShown(ROWS_CHUNK);
                          }}
                          placeholder="Search by row, feed code, or reason…"
                          className="w-full rounded-xl px-3 py-2 text-sm border-none focus:outline-none mb-2"
                          style={inputStyle}
                        />
                        <div style={{ maxHeight: 240, overflowY: "auto" }} className="rounded-xl">
                          {filteredFailedRows.slice(0, rowsShown).map((r, i) => (
                            <div
                              key={i}
                              className="text-xs px-2 py-1.5"
                              style={{
                                borderBottom: "1px solid #F1F5F9",
                                color: "#231F20",
                                fontFamily: "Nunito, sans-serif",
                              }}
                            >
                              <span className="font-bold">row {r.row ?? "—"}</span>
                              {r.fd_code ? ` · ${r.fd_code}` : ""} — {r.reason ?? "No reason given"}
                            </div>
                          ))}
                          {filteredFailedRows.length === 0 && (
                            <p
                              className="text-xs py-3 text-center"
                              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                            >
                              No matching rows.
                            </p>
                          )}
                        </div>
                        {rowsShown < filteredFailedRows.length && (
                          <button
                            onClick={() => setRowsShown((n) => n + ROWS_CHUNK)}
                            className="text-xs font-bold mt-2"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#064E3B",
                              fontFamily: "Nunito, sans-serif",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Show {Math.min(ROWS_CHUNK, filteredFailedRows.length - rowsShown)} more
                            (of {filteredFailedRows.length.toLocaleString()})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Skipped local names, grouped by reason */}
                {!!openLog.skipped_translations?.length && (
                  <div>
                    <div className="flex items-center justify-between w-full">
                      <button
                        onClick={() => setTransExpanded((v) => !v)}
                        className="flex-1 text-left"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <p
                          className="font-bold text-sm"
                          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                        >
                          {transExpanded ? "▾" : "▸"} Skipped local names (
                          {openLog.skipped_translations.length.toLocaleString()}) — grouped by
                          reason
                        </p>
                      </button>
                      <button
                        aria-label="Download CSV"
                        onClick={() =>
                          downloadCsv(
                            `feed-sync-${openLog.id}-skipped-names.csv`,
                            openLog.skipped_translations ?? []
                          )
                        }
                        className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: "#E4F7EF",
                          color: "#064E3B",
                          border: "none",
                          fontFamily: "Nunito, sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        <span aria-hidden="true">⬇</span> CSV
                      </button>
                    </div>
                    {transExpanded && (
                      <div className="mt-2 space-y-2">
                        {groupedSkippedTranslations.map(([reason, items]) => {
                          const link = deepLinkForReason(reason);
                          return (
                            <div
                              key={reason}
                              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                              style={{ backgroundColor: "#F8FAF9" }}
                            >
                              <p
                                className="text-xs flex-1"
                                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                              >
                                {reason} <span className="font-bold">({items.length})</span>
                              </p>
                              {link && (
                                <a
                                  href={link.href}
                                  className="text-xs font-bold flex-shrink-0"
                                  style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                                >
                                  {link.label}
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
