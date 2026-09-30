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

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { getFeedSyncSchedulerStatus, getFeedSyncConfig } from "@/lib/api";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import { RunHistoryTab } from "@/components/admin/feed-sync/RunHistoryTab";
import { SyncSettingsTab } from "@/components/admin/feed-sync/SyncSettingsTab";
import {
  ConfirmState,
  STATUS_REFRESH_MS,
  SchedulerStatus,
  SyncConfig,
  Tab,
  cardStyle,
} from "@/components/admin/feed-sync/shared";
import { useT } from "@/lib/i18n-ui";

export default function AdminFeedSyncPage() {
  const t = useT();
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

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs1 = useLatestRef({ showSnackbar, t });
  const reload = useCallback(() => {
    const { showSnackbar, t } = effectInputs1.current;
    setIsLoading(true);
    return Promise.allSettled([getFeedSyncSchedulerStatus(), getFeedSyncConfig()])
      .then(([statusRes, configRes]) => {
        if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
        else showSnackbar(t("Could not load sync status"), "error");
        if (configRes.status === "fulfilled") setConfig(configRes.value.data);
        else showSnackbar(t("Could not load sync configuration"), "error");
      })
      .finally(() => setIsLoading(false));
  }, [effectInputs1]);

  useEffect(() => {
    if (user?.is_admin) void reload();
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
    }, STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, [user?.is_admin]);

  const askConfirm = (
    title: string,
    body: string,
    label: string,
    danger: boolean,
    onConfirm: () => void | Promise<void>
  ) => {
    setConfirm({
      title,
      body,
      label,
      danger,
      onConfirm: () => {
        void onConfirm();
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
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Feed Library Sync")} onBack={() => router.back()} />

      <div className="px-3 pt-3">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: COLORS.brightGrayNew }}>
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
                backgroundColor: tab === t.key ? COLORS.darkAquamarineGreen : "transparent",
                color: tab === t.key ? COLORS.white : COLORS.darkAquamarineGreen,
                border: "none",
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
            <p className="font-bold mb-2" style={{ color: COLORS.raisinBlack, fontSize: 15 }}>
              {confirm.title}
            </p>
            <p className="text-sm mb-4" style={{ color: COLORS.darkSilver, lineHeight: 1.5 }}>
              {confirm.body}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
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
                onClick={confirm.onConfirm}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: confirm.danger ? COLORS.carminePink : COLORS.darkAquamarineGreen,
                  color: COLORS.white,
                  border: "none",
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
