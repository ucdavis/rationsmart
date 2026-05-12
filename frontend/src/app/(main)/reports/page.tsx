"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getSavedReports } from "@/lib/api";
import type { FeedReport } from "@/lib/api";
import Toolbar from "@/components/Toolbar";

function SkeletonCard() {
  return (
    <div className="mx-3 bg-white overflow-hidden" style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginTop: 16 }}>
      <div className="flex items-center justify-between" style={{ padding: "10px 10px 0 10px" }}>
        <div className="h-9 w-9 rounded-full shimmer" style={{ backgroundColor: "#E2E8F0" }} />
        <div className="h-8 w-28 rounded-full shimmer" style={{ backgroundColor: "#E2E8F0" }} />
      </div>
      <div style={{ padding: "20px 10px 0 10px" }}>
        <div className="h-3 w-24 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
      </div>
      <div style={{ padding: "4px 10px 10px 10px" }}>
        <div className="h-5 w-44 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
      </div>
      <div className="h-10 shimmer" style={{ backgroundColor: "#E2E8F0" }} />
    </div>
  );
}

function formatDate(raw: string | null): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return raw;
  }
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [reports, setReports] = useState<FeedReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const REPORTS_PER_PAGE = 5;

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    getSavedReports(user.id)
      .then((res) => {
        const data = res.data;
        setReports(data?.reports ?? []);
      })
      .catch(() => showSnackbar("Could not load reports", "error"))
      .finally(() => setIsLoading(false));
  }, [user, showSnackbar]);

  const openPdf = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const totalPages = Math.max(1, Math.ceil(reports.length / REPORTS_PER_PAGE));
  const pagedReports = reports.slice(page * REPORTS_PER_PAGE, (page + 1) * REPORTS_PER_PAGE);

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Feed Reports" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pt-2 pb-6">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="flex items-center justify-center rounded-full mb-5" style={{ width: 80, height: 80, backgroundColor: "#F0FDF4" }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="5" y="4" width="26" height="28" rx="3" stroke="#064E3B" strokeWidth="2" />
                <path d="M11 12H25M11 17H22M11 22H17" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-lg font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>No saved reports</p>
            <p className="text-sm mb-8" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Generate a ration report and tap &quot;Save Report&quot; to see it here
            </p>
            <button
              onClick={() => router.push("/cattle-info")}
              className="px-8 py-4 rounded-xl font-bold text-base text-white"
              style={{ backgroundColor: "#064E3B", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
            >
              Create Report
            </button>
          </div>
        ) : (
          <>
            {pagedReports.map((report, i) => {
              const cardId = report.report_id ?? String(i);
              const isExpanded = expandedId === cardId;
              return (
                <div
                  key={cardId}
                  className="mx-3 bg-white overflow-hidden"
                  style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginTop: 16 }}
                >
                  {/* Top row: report icon pill (left) + View Report pill (right) */}
                  <div className="flex items-center justify-between" style={{ padding: "10px 10px 0 10px" }}>
                    <div
                      className="flex items-center justify-center"
                      style={{ borderRadius: 60, backgroundColor: "rgba(5,188,109,0.15)", padding: 6 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="4" y="3" width="16" height="18" rx="2" stroke="#064E3B" strokeWidth="1.8" />
                        <path d="M8 8h8M8 12h8M8 16h5" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                    {report.bucket_url && (
                      <button
                        onClick={() => openPdf(report.bucket_url!)}
                        className="flex items-center gap-2 font-bold"
                        style={{
                          borderRadius: 60,
                          backgroundColor: "#E4F7EF",
                          padding: "6px 6px 6px 14px",
                          border: "none",
                          cursor: "pointer",
                          color: "#064E3B",
                          fontFamily: "Nunito, sans-serif",
                          fontSize: 13,
                        }}
                      >
                        View Report
                        {/* Filled green circle with white arrow (matches Android) */}
                        <span
                          className="flex items-center justify-center"
                          style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#064E3B" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Simulation ID label + value */}
                  <p
                    className="uppercase tracking-wide"
                    style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 20, marginLeft: 10 }}
                  >
                    Simulation ID
                  </p>
                  <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, margin: "4px 10px 0 10px" }}>
                    {report.simulation_id ?? "—"}
                  </p>

                  {/* Expandable: Report ID, Report Type, Date */}
                  {isExpanded && (
                    <div style={{ padding: "0 10px" }}>
                      {report.report_id && (
                        <>
                          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 10 }}>Report ID</p>
                          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>{report.report_id}</p>
                        </>
                      )}
                      {report.report_type && (
                        <>
                          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 10 }}>Report Type</p>
                          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>{report.report_type}</p>
                        </>
                      )}
                      {report.report_created_date && (
                        <>
                          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 10 }}>Date</p>
                          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>{formatDate(report.report_created_date)}</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Expand/collapse bottom card */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : cardId)}
                    className="w-full flex items-center justify-center"
                    style={{
                      marginTop: 10,
                      backgroundColor: "rgba(5,188,109,0.15)",
                      border: "none",
                      cursor: "pointer",
                      padding: "8px 0",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="#064E3B"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                    >
                      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* Pagination: Previous (E4F7EF pill) | page number | Next (E4F7EF pill) */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mx-3 mt-5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1.5 font-bold"
                  style={{
                    borderRadius: 60,
                    backgroundColor: "#E4F7EF",
                    color: "#064E3B",
                    border: "none",
                    padding: "8px 16px",
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 13,
                    cursor: page === 0 ? "not-allowed" : "pointer",
                    opacity: page === 0 ? 0.4 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 3L5 7L9 11" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                  {page + 1}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1.5 font-bold"
                  style={{
                    borderRadius: 60,
                    backgroundColor: "#E4F7EF",
                    color: "#064E3B",
                    border: "none",
                    padding: "8px 16px",
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 13,
                    cursor: page === totalPages - 1 ? "not-allowed" : "pointer",
                    opacity: page === totalPages - 1 ? 0.4 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3L9 7L5 11" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
