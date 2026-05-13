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
                  {/* Top row: ic_report_nav doc icon (top-left) + View Report
                      pill (top-right). Matches layout_item_report.xml:19-67. */}
                  <div className="flex items-center justify-between" style={{ padding: "10px 10px 0 10px" }}>
                    <div
                      className="flex items-center justify-center"
                      style={{ borderRadius: 60, backgroundColor: "rgba(5,188,109,0.15)", padding: 6 }}
                    >
                      {/* ic_report_nav — Material Symbols "description" (filled
                          document with corner notch and inset lines) */}
                      <svg width="24" height="24" viewBox="0 0 960 960" fill="#064E3B">
                        <path d="M360,720h240q17,0 28.5,-11.5T640,680q0,-17 -11.5,-28.5T600,640L360,640q-17,0 -28.5,11.5T320,680q0,17 11.5,28.5T360,720ZM360,560h240q17,0 28.5,-11.5T640,520q0,-17 -11.5,-28.5T600,480L360,480q-17,0 -28.5,11.5T320,520q0,17 11.5,28.5T360,560ZM240,880q-33,0 -56.5,-23.5T160,800v-640q0,-33 23.5,-56.5T240,80h287q16,0 30.5,6t25.5,17l194,194q11,11 17,25.5t6,30.5v447q0,33 -23.5,56.5T720,880L240,880ZM520,320v-160L240,160v640h480v-440L560,360q-17,0 -28.5,-11.5T520,320Z" />
                      </svg>
                    </div>
                    {report.bucket_url && (
                      <button
                        onClick={() => openPdf(report.bucket_url!)}
                        className="flex items-center font-bold"
                        style={{
                          borderRadius: 60,
                          backgroundColor: "#E4F7EF",   // bright_gray_new
                          padding: "8px 14px",
                          gap: 8,
                          border: "none",
                          cursor: "pointer",
                          color: "#064E3B",              // dark_aquamarine_green
                          fontFamily: "Nunito, sans-serif",
                          fontSize: 12,                  // font_12 (matches Android)
                        }}
                      >
                        View Report
                        {/* ic_view_report — single filled path (circle with
                            inset right-arrow tail), tinted dark_aquamarine_green */}
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="#064E3B">
                          <path d="M18,10c0,-4.42 -3.58,-8 -8,-8s-8,3.58 -8,8s3.58,8 8,8S18,14.42 18,10zM10,11.79v-1.04H7.75C7.34,10.75 7,10.41 7,10s0.34,-0.75 0.75,-0.75H10V8.21c0,-0.45 0.54,-0.67 0.85,-0.35l1.79,1.79c0.2,0.2 0.2,0.51 0,0.71l-1.79,1.79C10.54,12.46 10,12.24 10,11.79z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* SIMULATION ID — always visible (Android keeps tv_title_simulation_id
                      and tv_simulation_id visible at all times). */}
                  <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 20, marginLeft: 10 }}>
                    Simulation ID
                  </p>
                  <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, margin: "4px 10px 0 10px" }}>
                    {report.simulation_id || "N/A"}
                  </p>

                  {/* Expanded: Report ID + Report Type side by side, then DATE */}
                  {isExpanded && (
                    <div style={{ padding: "0 10px" }}>
                      <div className="grid grid-cols-2 gap-x-3" style={{ marginTop: 10 }}>
                        <div>
                          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Report ID</p>
                          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>{report.report_id || "N/A"}</p>
                        </div>
                        <div>
                          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Report Type</p>
                          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>{report.report_type || "N/A"}</p>
                        </div>
                      </div>
                      <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 10 }}>Date</p>
                      <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>
                        {report.report_created_date ? formatDate(report.report_created_date) : "N/A"}
                      </p>
                    </div>
                  )}

                  {/* Expand/collapse strip — full-width go_green_15 bar at the
                      bottom of the card containing ic_expand_report_card (a
                      Material "arrow_drop_down" filled triangle). Rotates
                      180° when expanded (matches ReportListAdapter.animateIcon). */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : cardId)}
                    className="w-full flex items-center justify-center"
                    style={{
                      marginTop: 10,
                      backgroundColor: "rgba(5,188,109,0.15)",
                      border: "none",
                      cursor: "pointer",
                      padding: "6px 0",
                    }}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 960 960"
                      fill="#064E3B"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.3s linear" }}
                    >
                      <path d="M459,579 L314,434q-3,-3 -4.5,-6.5T308,420q0,-8 5.5,-14t14.5,-6h304q9,0 14.5,6t5.5,14q0,2 -6,14L501,579q-5,5 -10,7t-11,2q-6,0 -11,-2t-10,-7Z" />
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
