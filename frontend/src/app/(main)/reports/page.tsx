"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getSavedReports } from "@/lib/api";
import type { FeedReport } from "@/lib/api";
import Toolbar from "@/components/Toolbar";

function SkeletonCard() {
  return (
    <div
      className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="flex justify-between">
        <div className="h-3.5 w-32 rounded-full shimmer" />
        <div className="h-6 w-20 rounded-full shimmer" />
      </div>
      <div className="h-4 w-44 rounded-full shimmer" />
      <div className="flex gap-2">
        <div className="h-6 w-20 rounded-full shimmer" />
        <div className="h-6 w-20 rounded-full shimmer" />
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  const isEval = type?.toLowerCase().includes("eval");
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
      style={{
        backgroundColor: isEval ? "#FFF3E0" : "#F0FDF4",
        color: isEval ? "#E65100" : "#064E3B",
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {isEval ? "Evaluation" : "Recommendation"}
    </span>
  );
}

function formatDate(raw: string | null): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({
    user: s.user,
    showSnackbar: s.showSnackbar,
  }));

  const [reports, setReports] = useState<FeedReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
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
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
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
            <div
              className="flex items-center justify-center rounded-full mb-5"
              style={{ width: 80, height: 80, backgroundColor: "#F0FDF4" }}
            >
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="5" y="4" width="26" height="28" rx="3" stroke="#064E3B" strokeWidth="2" />
                <path d="M11 12H25M11 17H22M11 22H17" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p
              className="text-lg font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              No saved reports
            </p>
            <p
              className="text-sm mb-8"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Generate a ration report and tap &quot;Save Report&quot; to see it here
            </p>
            <button
              onClick={() => router.push("/cattle-info")}
              className="px-8 py-4 rounded-xl font-bold text-base text-white"
              style={{
                backgroundColor: "#064E3B",
                border: "none",
                cursor: "pointer",
                fontFamily: "Nunito, sans-serif",
              }}
            >
              Create Report
            </button>
          </div>
        ) : (
          <>
            {pagedReports.map((report, i) => (
              <div
                key={report.report_id ?? i}
                className="mx-3 my-2 rounded-2xl bg-white p-4"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                {/* Date + Type badge */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs"
                    style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                  >
                    {formatDate(report.report_created_date)}
                  </span>
                  <TypeBadge type={report.report_type} />
                </div>

                {/* Simulation name */}
                <p
                  className="text-base font-bold mb-1"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {report.simulation_id ?? "Report"}
                </p>

                {/* User name if available */}
                {report.user_name && (
                  <p
                    className="text-xs mb-3"
                    style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                  >
                    {report.user_name}
                  </p>
                )}

                {/* View PDF button */}
                {report.bucket_url ? (
                  <button
                    onClick={() => openPdf(report.bucket_url!)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
                    style={{
                      backgroundColor: "#064E3B",
                      color: "#FFFFFF",
                      border: "none",
                      fontFamily: "Nunito, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" fill="none" />
                      <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    View PDF
                  </button>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: "#E2E8F0", fontFamily: "Nunito, sans-serif" }}
                  >
                    PDF not available
                  </span>
                )}
              </div>
            ))}

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between mx-3 mt-3 px-4 py-3 rounded-2xl bg-white"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm"
                  style={{
                    backgroundColor: page === 0 ? "#F1F5F9" : "#064E3B",
                    color: page === 0 ? "#999999" : "#FFFFFF",
                    border: "none",
                    fontFamily: "Nunito, sans-serif",
                    cursor: page === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Prev
                </button>
                <span
                  className="text-sm font-bold"
                  style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                >
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm"
                  style={{
                    backgroundColor: page === totalPages - 1 ? "#F1F5F9" : "#064E3B",
                    color: page === totalPages - 1 ? "#999999" : "#FFFFFF",
                    border: "none",
                    fontFamily: "Nunito, sans-serif",
                    cursor: page === totalPages - 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
