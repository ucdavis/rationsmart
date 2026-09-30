"use client";

// Admin > Feed Library Sync (CLIMDES) — split out of admin/feed-sync/page.tsx (audit B-17).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFeedSyncLogs, getFeedSyncLog } from "@/lib/api";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import {
  FeedSyncLogDetail,
  FeedSyncLogItem,
  SkippedTranslation,
  StatusChip,
  capitalize,
  cardStyle,
  deepLinkForReason,
  downloadCsv,
  formatDateTime,
  formatDuration,
  inputStyle,
  sheetOverlayStyle,
} from "./shared";
import { PAGE_SIZES } from "@/lib/pagination";

const PAGE_SIZE = PAGE_SIZES.syncHistory;
const ROWS_CHUNK = PAGE_SIZES.syncFailedRows;
export function RunHistoryTab({
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
  const [rowsShown, setRowsShown] = useState<number>(ROWS_CHUNK);

  const [transExpanded, setTransExpanded] = useState(false);

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs3 = useLatestRef({ showSnackbar });
  const loadLogs = useCallback(
    (p: number) => {
      const { showSnackbar } = effectInputs3.current;
      setIsLoadingLogs(true);
      getFeedSyncLogs(p, PAGE_SIZE)
        .then((res) => {
          setLogs(res.data.logs);
          setTotalPages(res.data.total_pages || 1);
          setTotalCount(res.data.total_count || 0);
        })
        .catch(() => showSnackbar("Could not load run history", "error"))
        .finally(() => setIsLoadingLogs(false));
    },
    [effectInputs3]
  );

  useEffect(() => {
    loadLogs(page);
  }, [page, loadLogs]);

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs4 = useLatestRef({ showSnackbar });
  const openDetail = useCallback(
    (id: string) => {
      const { showSnackbar } = effectInputs4.current;
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
    },
    [effectInputs4]
  );

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs5 = useLatestRef({ onViewLogIdConsumed, openDetail });
  useEffect(() => {
    const { onViewLogIdConsumed, openDetail } = effectInputs5.current;
    if (!viewLogId) return;
    openDetail(viewLogId);
    onViewLogIdConsumed();
  }, [viewLogId, effectInputs5]);

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
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            Run History
          </p>
          <p className="text-xs" style={{ color: COLORS.darkSilver }}>
            {totalCount} runs
          </p>
        </div>

        {isLoadingLogs ? (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="px-4 py-3 space-y-2"
                style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}
              >
                <div className="h-4 w-40 rounded-full shimmer" />
                <div className="h-3 w-56 rounded-full shimmer" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: COLORS.darkSilver }}>
            No sync runs yet.
          </p>
        ) : (
          logs.map((log) => (
            <button
              key={log.id}
              onClick={() => openDetail(log.id)}
              className="w-full text-left px-4 py-3"
              style={{
                borderTop: `1px solid ${COLORS.authenticWhite}`,
                background: "none",
                border: "none",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: COLORS.authenticWhite,
                cursor: "pointer",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-bold text-sm"
                  style={{ color: COLORS.raisinBlack }}
                  title={log.started_at ?? undefined}
                >
                  {formatDateTime(log.started_at)}
                </p>
                <StatusChip status={log.status} />
              </div>
              <p className="text-xs mt-1" style={{ color: COLORS.darkSilver }}>
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
            style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-sm font-bold px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "transparent",
                color: page <= 1 ? COLORS.silverSand : COLORS.darkAquamarineGreen,
                border: "none",
                cursor: page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <span aria-hidden="true">‹</span> Prev
            </button>
            <p className="text-xs" style={{ color: COLORS.darkSilver }}>
              Page {page} of {totalPages}
            </p>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-sm font-bold px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "transparent",
                color: page >= totalPages ? COLORS.silverSand : COLORS.darkAquamarineGreen,
                border: "none",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next <span aria-hidden="true">›</span>
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
              <div
                style={{
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: COLORS.sageBreeze,
                }}
              />
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
                    style={{ color: COLORS.raisinBlack, fontSize: 16 }}
                    title={openLog.started_at ?? undefined}
                  >
                    Run {formatDateTime(openLog.started_at)}
                  </p>
                  <StatusChip status={openLog.status} />
                </div>
                <p className="text-xs mb-4" style={{ color: COLORS.darkSilver }}>
                  {capitalize(openLog.trigger_type)} · Duration{" "}
                  {formatDuration(openLog.started_at, openLog.finished_at)}
                  {openLog.http_status ? ` · HTTP ${openLog.http_status}` : ""}
                </p>

                {openLog.status === "failed" && openLog.error_message && (
                  <div
                    className="rounded-xl px-3 py-2 mb-4 text-sm"
                    style={{
                      backgroundColor: COLORS.peachyPink,
                      color: COLORS.carminePink,
                    }}
                  >
                    {openLog.error_message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: COLORS.authenticWhite }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      Feeds
                    </p>
                    <p className="text-sm" style={{ color: COLORS.raisinBlack }}>
                      {openLog.inserted.toLocaleString()} added
                    </p>
                    <p className="text-sm" style={{ color: COLORS.raisinBlack }}>
                      {openLog.updated.toLocaleString()} updated
                    </p>
                    <p className="text-sm" style={{ color: COLORS.raisinBlack }}>
                      {openLog.skipped.toLocaleString()} rows skipped
                    </p>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: COLORS.authenticWhite }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      Local names
                    </p>
                    <p className="text-sm" style={{ color: COLORS.raisinBlack }}>
                      {(
                        openLog.translations_inserted + openLog.translations_updated
                      ).toLocaleString()}{" "}
                      saved
                    </p>
                    <p className="text-sm" style={{ color: COLORS.raisinBlack }}>
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
                          style={{ color: COLORS.darkAquamarineGreen }}
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
                          backgroundColor: COLORS.brightGrayNew,
                          color: COLORS.darkAquamarineGreen,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <span aria-hidden="true">⬇</span> CSV
                      </button>
                    </div>
                    {rowsExpanded && (
                      <div className="mt-2">
                        <input
                          aria-label="Search rows"
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
                                borderBottom: `1px solid ${COLORS.americanDiamond}`,
                                color: COLORS.raisinBlack,
                              }}
                            >
                              <span className="font-bold">row {r.row ?? "—"}</span>
                              {r.fd_code ? ` · ${r.fd_code}` : ""} — {r.reason ?? "No reason given"}
                            </div>
                          ))}
                          {filteredFailedRows.length === 0 && (
                            <p
                              className="text-xs py-3 text-center"
                              style={{ color: COLORS.darkSilver }}
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
                              color: COLORS.darkAquamarineGreen,
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
                          style={{ color: COLORS.darkAquamarineGreen }}
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
                          backgroundColor: COLORS.brightGrayNew,
                          color: COLORS.darkAquamarineGreen,
                          border: "none",
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
                              style={{ backgroundColor: COLORS.authenticWhite }}
                            >
                              <p className="text-xs flex-1" style={{ color: COLORS.raisinBlack }}>
                                {reason} <span className="font-bold">({items.length})</span>
                              </p>
                              {link && (
                                <a
                                  href={link.href}
                                  className="text-xs font-bold flex-shrink-0"
                                  style={{ color: COLORS.darkAquamarineGreen }}
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
