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
    <div className="flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}>
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
          reports.map((r) => (
            <div
              key={r.simulation_id}
              className="mx-3 bg-white overflow-hidden"
              style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginTop: 16, paddingBottom: 10, opacity: loadingId === r.simulation_id ? 0.6 : 1 }}
            >
              {/* Top row: icon pill + user name + View Report pill */}
              <div className="flex items-center justify-between" style={{ padding: "10px 10px 0 10px" }}>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(5,188,109,0.15)", borderRadius: 60, padding: 6 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="4" y="3" width="16" height="18" rx="2" stroke="#064E3B" strokeWidth="1.8" />
                      <path d="M8 8h8M8 12h8M8 16h5" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="font-bold truncate text-base flex-1 min-w-0" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif" }}>
                    {r.user_name || r.user_email || "Unknown User"}
                  </p>
                </div>
                <button
                  onClick={() => viewReport(r.simulation_id)}
                  disabled={!!loadingId}
                  className="flex items-center gap-1.5 font-bold flex-shrink-0"
                  style={{
                    backgroundColor: "#E4F7EF",
                    borderRadius: 60,
                    padding: "8px 12px",
                    border: "none",
                    cursor: loadingId ? "not-allowed" : "pointer",
                    color: "#064E3B",
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 12,
                    marginLeft: 8,
                  }}
                >
                  {loadingId === r.simulation_id ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#064E3B" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <>
                      View Report
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="#064E3B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

              {/* Simulation ID (left) + Report Type (right) */}
              <div className="grid grid-cols-2" style={{ padding: "20px 10px 0" }}>
                <div>
                  <p style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Simulation ID</p>
                  <p className="font-bold" style={{ color: "#231F20", fontSize: 14, fontFamily: "Nunito, sans-serif", marginTop: 4 }}>
                    {r.simulation_id || "—"}
                  </p>
                </div>
                <div>
                  <p style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Report Type</p>
                  <p className="font-bold" style={{ color: "#231F20", fontSize: 14, fontFamily: "Nunito, sans-serif", marginTop: 4 }}>
                    {r.report_mode === "evaluation" ? "Diet Evaluation" : r.report_mode === "recommendation" ? "Diet Recommendation" : "—"}
                  </p>
                </div>
              </div>

              {/* Date */}
              <div style={{ padding: "10px 10px 0" }}>
                <p style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Date</p>
                <p className="font-bold" style={{ color: "#231F20", fontSize: 14, fontFamily: "Nunito, sans-serif", marginTop: 4 }}>
                  {toAdminReportDisplayDate(r.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
