"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getAdminReports } from "@/lib/api";
import { toAdminReportDisplayDate } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";

// Mirrors Android AdminFeedReport — only these fields exist in the API.
// Critically, the "View Report" button opens bucket_url (a PDF URL),
// not an in-app report. There is no simulation-details refetch.
interface AdminReport {
  report_id?: string;
  simulation_id?: string;
  simulation_name?: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  bucket_url?: string;
  report_url?: string;
  created_at: string;
  report_type?: string;
  optimization_status?: string;
  report_mode?: string;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({
    user: s.user,
    showSnackbar: s.showSnackbar,
  }));

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Android FragmentAdminFeedReports.onClickViewReport calls
  // FileUtils.sharePdf(url) — i.e. opens the bucket_url PDF directly.
  // It does NOT re-fetch simulation details. Matching that behavior here:
  // open the URL in a new tab (browser handles the PDF/share). On mobile
  // PWA this triggers native share/open via the browser.
  const viewReport = (r: AdminReport) => {
    const url = r.bucket_url || r.report_url;
    if (!url) {
      showSnackbar("Report URL not available", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
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
          reports.map((r, idx) => {
            // Android FeedReportPagingAdapter switches on item.reportType.
            // Evaluation → vivid_gamboge / vivid_gamboge_15
            // Recommendation → celtic_blue / celtic_blue_15
            // else → dark_aquamarine_green / bright_gray_new
            const reportType = r.report_type ?? (
              r.report_mode === "evaluation" ||
              (r.optimization_status?.toLowerCase().includes("evaluat") ?? false)
                ? "Evaluation" : "Recommendation"
            );
            const themed = reportType === "Evaluation"
              ? { bg: "rgba(255,159,28,0.15)", text: "#FF9F1C" }       // vivid_gamboge_15 / vivid_gamboge
              : reportType === "Recommendation"
                ? { bg: "rgba(41,108,211,0.15)", text: "#296CD3" }     // celtic_blue_15 / celtic_blue
                : { bg: "#E4F7EF", text: "#064E3B" };                  // bright_gray_new / dark_aquamarine_green
            const key = r.report_id ?? r.simulation_id ?? String(idx);
            return (
              <div
                key={key}
                className="mx-3 bg-white overflow-hidden"
                style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginTop: 16, paddingBottom: 10 }}
              >
                {/* Top row: ic_report_nav pill + user name + View Report pill */}
                <div className="flex items-center justify-between" style={{ padding: "10px 10px 0 10px" }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {/* ic_report_nav inside go_green_15 circular pill (6dp content padding) */}
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(5,188,109,0.15)", borderRadius: 60, padding: 6 }}
                    >
                      <svg width="24" height="24" viewBox="0 0 960 960" fill="#064E3B">
                        <path d="M360,720h240q17,0 28.5,-11.5T640,680q0,-17 -11.5,-28.5T600,640L360,640q-17,0 -28.5,11.5T320,680q0,17 11.5,28.5T360,720ZM360,560h240q17,0 28.5,-11.5T640,520q0,-17 -11.5,-28.5T600,480L360,480q-17,0 -28.5,11.5T320,520q0,17 11.5,28.5T360,560ZM240,880q-33,0 -56.5,-23.5T160,800v-640q0,-33 23.5,-56.5T240,80h287q16,0 30.5,6t25.5,17l194,194q11,11 17,25.5t6,30.5v447q0,33 -23.5,56.5T720,880L240,880ZM520,320v-160L240,160v640h480v-440L560,360q-17,0 -28.5,-11.5T520,320Z" />
                      </svg>
                    </div>
                    {/* tv_user_name: crayola_green (#1CA069), bold, font_16 */}
                    <p
                      className="font-bold truncate flex-1 min-w-0"
                      style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                    >
                      {r.user_name || r.user_email || "N/A"}
                    </p>
                  </div>
                  {/* cv_view_report: themed bg, "View Report" + ic_view_report drawableEnd */}
                  <button
                    onClick={() => viewReport(r)}
                    className="flex items-center font-bold flex-shrink-0"
                    style={{
                      backgroundColor: themed.bg,
                      borderRadius: 60,
                      padding: "8px 12px",
                      gap: 8,
                      border: "none",
                      cursor: "pointer",
                      color: themed.text,
                      fontFamily: "Nunito, sans-serif",
                      fontSize: 12,
                      marginLeft: 8,
                    }}
                  >
                    View Report
                    {/* ic_view_report — circle with right-arrow inside */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill={themed.text}>
                      <path d="M18,10c0,-4.42 -3.58,-8 -8,-8s-8,3.58 -8,8s3.58,8 8,8S18,14.42 18,10zM10,11.79v-1.04H7.75C7.34,10.75 7,10.41 7,10s0.34,-0.75 0.75,-0.75H10V8.21c0,-0.45 0.54,-0.67 0.85,-0.35l1.79,1.79c0.2,0.2 0.2,0.51 0,0.71l-1.79,1.79C10.54,12.46 10,12.24 10,11.79z" />
                    </svg>
                  </button>
                </div>

                {/* Simulation ID + Report Type (Android tv_title_simulation_id /
                    tv_title_report_type are regular weight, dark_silver, font_12;
                    values are bold, raisin_black) */}
                <div className="grid grid-cols-2" style={{ padding: "20px 10px 0" }}>
                  <div>
                    <p style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Simulation ID</p>
                    <p className="font-bold" style={{ color: "#231F20", fontSize: 14, fontFamily: "Nunito, sans-serif", marginTop: 4 }}>
                      {r.simulation_id || r.simulation_name || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Report Type</p>
                    <p className="font-bold" style={{ color: "#231F20", fontSize: 14, fontFamily: "Nunito, sans-serif", marginTop: 4 }}>
                      {reportType || "N/A"}
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
            );
          })
        )}
      </div>
    </div>
  );
}
