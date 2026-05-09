"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getAdminReports, getSimulationDetails } from "@/lib/api";
import { toAdminReportDisplayDate } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";

interface AdminReport {
  simulation_id: string;
  simulation_name?: string;
  user_name?: string;
  user_email?: string;
  cattle_breed?: string;
  country?: string;
  created_at: string;
  optimization_status: string;
  report_mode?: string;
}

const statusColor: Record<string, { bg: string; text: string }> = {
  Optimized: { bg: "#05BC6D", text: "#fff" },
  Optimised: { bg: "#05BC6D", text: "#fff" },
  "Not Optimized": { bg: "#E44A4A", text: "#fff" },
  "Not Feasible": { bg: "#E44A4A", text: "#fff" },
  Evaluation: { bg: "#FF9800", text: "#fff" },
  Evaluated: { bg: "#FF9800", text: "#fff" },
};

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, setReportData, showSnackbar } = useStore((s) => ({
    user: s.user,
    setReportData: s.setReportData,
    showSnackbar: s.showSnackbar,
  }));

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setIsLoading(true);
    getAdminReports(user.id, 1, 50)
      .then((res) => {
        const data = res.data;
        setReports(Array.isArray(data) ? data : data?.reports ?? data?.items ?? []);
      })
      .catch(() => showSnackbar("Could not load reports", "error"))
      .finally(() => setIsLoading(false));
  }, [user?.id]);

  const viewReport = async (simId: string) => {
    if (!user?.id) return;
    setLoadingId(simId);
    try {
      const res = await getSimulationDetails(simId, user.id);
      setReportData(res.data);
      router.push("/report");
    } catch {
      showSnackbar("Could not load report", "error");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Feed Reports" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pt-2 pb-6">
        {isLoading ? (
          [0,1,2].map((i) => (
            <div key={i} className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div className="flex justify-between">
                <div className="h-3.5 w-32 rounded-full shimmer" />
                <div className="h-6 w-20 rounded-full shimmer" />
              </div>
              <div className="h-4 w-44 rounded-full shimmer" />
            </div>
          ))
        ) : reports.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-center px-6">
            <p className="text-base" style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No reports found</p>
          </div>
        ) : (
          reports.map((r) => {
            const colors = statusColor[r.optimization_status] ?? { bg: "#E2E8F0", text: "#231F20" };
            return (
              <button
                key={r.simulation_id}
                onClick={() => viewReport(r.simulation_id)}
                disabled={loadingId === r.simulation_id}
                className="w-full text-left"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <div
                  className="mx-3 my-2 rounded-2xl bg-white p-4"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)", opacity: loadingId === r.simulation_id ? 0.6 : 1 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                      {toAdminReportDisplayDate(r.created_at)}
                    </span>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
                      style={{ backgroundColor: colors.bg, color: colors.text, fontFamily: "Nunito, sans-serif" }}
                    >
                      {r.optimization_status}
                    </span>
                  </div>
                  <p className="text-sm font-bold mb-1.5" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                    {r.simulation_name || r.cattle_breed || "Simulation"}
                  </p>
                  {(r.user_name || r.user_email) && (
                    <p className="text-xs" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                      {r.user_name ?? r.user_email}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2 flex-wrap">
                      {r.country && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F0FDF4", color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>{r.country}</span>
                      )}
                      {r.cattle_breed && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F1F5F9", color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>{r.cattle_breed}</span>
                      )}
                    </div>
                    {loadingId === r.simulation_id ? (
                      <div className="w-5 h-5 rounded-full animate-spin" style={{ border: "2.5px solid #F0FDF4", borderTopColor: "#064E3B" }} />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
