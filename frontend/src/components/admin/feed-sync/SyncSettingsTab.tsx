"use client";

// Admin > Feed Library Sync (CLIMDES) — split out of admin/feed-sync/page.tsx (audit B-17).

import { useEffect, useRef, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import {
  getFeedSyncSchedulerStatus,
  updateFeedSyncConfig,
  toggleFeedSyncScheduler,
  runFeedSyncNow,
  getFeedSyncLog,
} from "@/lib/api";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import {
  AUTH_TYPE_OPTIONS,
  DAY_OPTIONS,
  FeedSyncLogDetail,
  OTHER_RUN_POLL_MS,
  OWN_RUN_POLL_MS,
  STALE_SUCCESS_MS,
  SYNC_POLL_MAX_MS,
  SchedulerStatus,
  SyncConfig,
  capitalize,
  cardStyle,
  formatDateTime,
  formatNextRun,
  inputStyle,
} from "./shared";
import { useT } from "@/lib/i18n-ui";
import { errorStatus } from "@/lib/errors";

export function SyncSettingsTab({
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
    onConfirm: () => void | Promise<void>
  ) => void;
  onViewDetails: (logId: string) => void;
}) {
  const t = useT();
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
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs2 = useLatestRef({ reload, setStatus });
  useEffect(() => {
    const { reload, setStatus } = effectInputs2.current;
    if (!status?.running || runningLogId) return;
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(() => {
      getFeedSyncSchedulerStatus()
        .then((res) => {
          setStatus(res.data);
          if (!res.data.running) {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
            void reload();
          }
        })
        .catch(() => {}); // transient — the next tick retries
    }, OTHER_RUN_POLL_MS);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [status?.running, runningLogId, effectInputs2]);

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
      void doToggle("enable");
    } else {
      askConfirm(
        t("Disable automatic scheduler?"),
        t("Automatic syncing will stop. Manual sync stays available."),
        t("Disable"),
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
      showSnackbar(t("Sync day set to ${day}").replace("${day}", t(capitalize(day))), "success");
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
    pollRef.current = setInterval(() => {
      void (async () => {
        if (Date.now() > deadline) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setRunningLogId(null);
          void reload();
          showSnackbar(t("Sync is taking longer than expected — check Sync History later"), "info");
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
            void reload();
            if (log.status === "success") {
              showSnackbar(
                t("Sync complete — ${inserted} added, ${updated} updated, ${skipped} rows skipped")
                  .replace("${inserted}", String(log.inserted))
                  .replace("${updated}", String(log.updated))
                  .replace("${skipped}", String(log.skipped)),
                "success"
              );
            } else {
              showSnackbar(log.error_message ?? t("Sync failed"), "error");
            }
          }
        } catch {
          // transient network hiccup — keep polling, don't abandon the run
        }
      })();
    }, OWN_RUN_POLL_MS);
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
      // The api client rejects with Error + `.status` (no axios `.response`),
      // so read it via errorStatus — the old `err.response.status` was
      // always undefined and the 409/503 messages never showed.
      const httpStatus = errorStatus(err);
      if (httpStatus === 409) showSnackbar(t("A sync is already running"), "error");
      else if (httpStatus === 503)
        showSnackbar(t("Sync service unavailable — try again shortly"), "error");
      else
        showSnackbar(err instanceof Error ? err.message : t("Could not start the sync"), "error");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!config) return;
    setSettingsError(null);
    // The endpoint must be https — every sync sends the CLIMDES API key /
    // bearer token to it (audit A-10). An http:// endpoint saved earlier has
    // to be corrected before any setting can be saved. The backend should
    // also enforce https and block private / link-local addresses, since it
    // is the one that connects.
    if (formEndpoint.trim() && !/^https:\/\//i.test(formEndpoint.trim())) {
      setSettingsError(t("Endpoint URL must start with https://"));
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
      showSnackbar(t("Connection settings saved"), "success");
      setIsEditingSettings(false);
      const statusRes = await getFeedSyncSchedulerStatus();
      setStatus(statusRes.data);
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : t("Could not save settings"));
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
    Date.now() - new Date(status.last_success_at).getTime() > STALE_SUCCESS_MS;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* STATUS CARD */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("Automatic Sync")}
          </p>
        </div>
        <div className="px-4 py-4 space-y-4">
          {isStale && (
            <div
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{
                backgroundColor: "rgba(255,152,0,0.14)",
                color: COLORS.webAmberText,
              }}
            >
              {t("Last sync overdue — check Run History")}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                {t("Automatic Scheduler")}
              </p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.darkSilver }}>
                {status.scheduler_enabled
                  ? `Syncs automatically every ${capitalize(status.sync_day_of_week)} at 00:00 UTC.`
                  : t("Automatic sync is off. You can still sync manually.")}
              </p>
              {!canEnable && !status.scheduler_enabled && (
                <p className="text-xs mt-0.5 font-bold" style={{ color: COLORS.webAmberText }}>
                  {t("Configure the CLIMDES endpoint first")}
                </p>
              )}
              {config.scheduler_toggled_by && (
                <p className="text-xs mt-1" style={{ color: COLORS.spanishGray }}>
                  {t("Last changed by")} {config.scheduler_toggled_by.slice(0, 8)}
                  {t("… on")} {formatDateTime(config.scheduler_toggled_at)}
                </p>
              )}
            </div>
            <label
              className="toggle-switch flex-shrink-0"
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
                aria-label={
                  status.scheduler_enabled
                    ? t("Disable automatic scheduler")
                    : t("Enable automatic scheduler")
                }
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
              style={{ color: COLORS.darkSilver }}
            >
              {t("Sync day")}
            </p>
            <CustomSelect
              value={status.sync_day_of_week}
              onChange={handleDayChange}
              options={DAY_OPTIONS}
              disabled={isSavingDay}
              style={{
                backgroundColor: COLORS.americanDiamond,
                borderRadius: 14,
                padding: "10px 12px",
              }}
            />
            <p className="text-xs mt-1" style={{ color: COLORS.spanishGray }}>
              {t(
                "Changing the day doesn&apos;t trigger a run today — use Sync now for an immediate refresh."
              )}
            </p>
          </div>

          <div
            className="space-y-2 pt-1"
            style={{ borderTop: `1px solid ${COLORS.americanDiamond}` }}
          >
            <div className="flex justify-between text-sm pt-2">
              <span style={{ color: COLORS.darkSilver }}>{t("Next scheduled sync")}</span>
              <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                {formatNextRun(status.next_scheduled_run)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.darkSilver }}>{t("Last run")}</span>
              <span
                className="font-bold"
                style={{ color: COLORS.raisinBlack }}
                title={status.last_run_at ?? undefined}
              >
                {formatDateTime(status.last_run_at)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.darkSilver }}>{t("Last successful sync")}</span>
              <span
                className="font-bold"
                style={{ color: COLORS.raisinBlack }}
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
                backgroundColor:
                  isDispatching || isRunning ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
                color: COLORS.white,
                border: "none",
                cursor: isDispatching || isRunning ? "not-allowed" : "pointer",
              }}
            >
              <span aria-hidden="true">⟳</span> {t("Sync now")}
            </button>
            <span
              className="text-xs font-bold"
              style={{ color: isRunning ? COLORS.webAmberText : COLORS.darkSilver }}
            >
              {t("status:")} {isRunning ? t("running…") : "idle"}
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
              borderBottom: `1px solid ${COLORS.americanDiamond}`,
            }}
          >
            <p
              className="font-bold text-sm"
              style={{
                color: lastResult.status === "success" ? COLORS.crayolaGreen : COLORS.carminePink,
              }}
            >
              {lastResult.status === "success" ? t("✅ Sync complete") : t("❌ Sync failed")} —{" "}
              {formatDateTime(lastResult.finished_at)}
            </p>
          </div>
          <div className="px-4 py-3 space-y-1 text-sm" style={{ color: COLORS.raisinBlack }}>
            {lastResult.status === "success" ? (
              <>
                <p>
                  {lastResult.total_rows.toLocaleString()} {t("rows processed")}
                </p>
                <p>
                  {lastResult.inserted.toLocaleString()} {t("feeds added ·")}{" "}
                  {lastResult.updated.toLocaleString()} {t("feeds updated ·")}{" "}
                  {lastResult.skipped.toLocaleString()} {t("rows skipped")}
                </p>
                <p>
                  {lastResult.translations_inserted.toLocaleString()} {t("local names saved ·")}{" "}
                  {lastResult.translations_skipped.toLocaleString()} {t("local names skipped")}
                </p>
              </>
            ) : (
              <p style={{ color: COLORS.carminePink }}>
                {lastResult.error_message ?? t("An unexpected error occurred.")}
              </p>
            )}
            <button
              onClick={() => onViewDetails(lastResult.id)}
              className="text-sm font-bold mt-2"
              style={{
                background: "none",
                border: "none",
                color: COLORS.darkAquamarineGreen,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {t("View details →")}
            </button>
          </div>
        </div>
      )}

      {/* CONNECTION SETTINGS */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide flex-1"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("Connection Settings")}
          </p>
          {!isEditingSettings && (
            <button
              onClick={openSettingsEditor}
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{
                backgroundColor: COLORS.darkAquamarineGreen,
                color: COLORS.white,
                border: "none",
                cursor: "pointer",
              }}
            >
              {t("Edit")}
            </button>
          )}
        </div>

        {!isEditingSettings ? (
          <div className="px-4 py-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span style={{ color: COLORS.darkSilver }}>{t("Endpoint URL")}</span>
              <span
                className="font-bold text-right break-all"
                style={{ color: COLORS.raisinBlack }}
              >
                {config.endpoint_url || t("Not configured")}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: COLORS.darkSilver }}>{t("Auth type")}</span>
              <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                {AUTH_TYPE_OPTIONS.find((o) => o.value === config.auth_type)?.label ??
                  capitalize(config.auth_type)}
              </span>
            </div>
            {config.auth_type === "api_key" && (
              <div className="flex justify-between gap-3">
                <span style={{ color: COLORS.darkSilver }}>{t("Header name")}</span>
                <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                  {config.auth_header_name || "—"}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span style={{ color: COLORS.darkSilver }}>{t("Token")}</span>
              <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                {config.auth_token_masked || t("Not set")}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <div>
              <label
                htmlFor="sync-endpoint-url"
                className="block text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: COLORS.darkSilver }}
              >
                {t("Endpoint URL")}
              </label>
              <input
                id="sync-endpoint-url"
                aria-label={t("Endpoint URL")}
                type="text"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                placeholder={t("https://api.example.com/feed-library")}
                className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: COLORS.darkSilver }}
              >
                {t("Auth type")}
              </p>
              <CustomSelect
                value={formAuthType}
                onChange={setFormAuthType}
                options={AUTH_TYPE_OPTIONS}
                style={{
                  backgroundColor: COLORS.americanDiamond,
                  borderRadius: 14,
                  padding: "10px 12px",
                }}
              />
            </div>
            {formAuthType === "api_key" && (
              <div>
                <label
                  htmlFor="sync-header-name"
                  className="block text-xs font-bold uppercase tracking-wide mb-1"
                  style={{ color: COLORS.darkSilver }}
                >
                  {t("Header name")}
                </label>
                <input
                  id="sync-header-name"
                  aria-label={t("Header name")}
                  type="text"
                  value={formHeaderName}
                  onChange={(e) => setFormHeaderName(e.target.value)}
                  placeholder={t("X-API-Key")}
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: COLORS.darkSilver }}
              >
                {t("Token")}
              </p>
              {!isReplacingToken ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl px-4 py-3 text-sm" style={inputStyle}>
                    {config.auth_token_masked || t("Not set")}
                  </div>
                  <button
                    onClick={() => setIsReplacingToken(true)}
                    className="text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0"
                    style={{
                      backgroundColor: "transparent",
                      color: COLORS.darkAquamarineGreen,
                      border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
                      cursor: "pointer",
                    }}
                  >
                    {t("Replace token")}
                  </button>
                </div>
              ) : (
                <input
                  aria-label={t("New token")}
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder={t("Enter new token")}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>

            {settingsError && (
              <p className="text-xs font-bold" style={{ color: COLORS.carminePink }}>
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
                  color: COLORS.darkAquamarineGreen,
                  border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
                  cursor: "pointer",
                }}
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: isSavingSettings
                    ? COLORS.lightGrayNew
                    : COLORS.darkAquamarineGreen,
                  color: COLORS.white,
                  border: "none",
                  cursor: isSavingSettings ? "not-allowed" : "pointer",
                }}
              >
                {isSavingSettings ? t("Saving…") : t("Save changes")}
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
