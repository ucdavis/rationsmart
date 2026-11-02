"use client";

// Report screen — shown after Save Report when the PDF isn't ready yet (W5).
// Asks POST /v1/animal/reports/pdf for it; on success the screen switches to
// its View PDF / Share row.

import { COLORS } from "@/lib/colors";
import Spinner from "@/components/ui/Spinner";
import { useReportPdf } from "./useReportPdf";

export default function GetPdfButton({
  reportId,
  onReady,
  t,
}: {
  reportId: string;
  onReady: (url: string) => void;
  t: (source: string) => string;
}) {
  const { getPdf, loadingIds, failedIds } = useReportPdf(t);
  const loading = loadingIds.has(reportId);
  return (
    <button
      onClick={() =>
        void getPdf(reportId).then((url) => {
          if (url) onReady(url);
        })
      }
      disabled={loading}
      className="w-full mb-3 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
      style={{
        backgroundColor: COLORS.vividGamboge15,
        color: COLORS.vividGamboge,
        border: `1px solid ${COLORS.vividGamboge}`,
        cursor: loading ? "wait" : "pointer",
      }}
    >
      {loading && <Spinner size={16} />}
      {loading ? t("Getting PDF…") : failedIds.has(reportId) ? t("Try again") : t("Get PDF")}
    </button>
  );
}
