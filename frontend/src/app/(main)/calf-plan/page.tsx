"use client";

// Baby Calf/Heifer result (QA row 8). A calf only needs its milk amount, so
// Cattle Info's Continue skips feed selection and the diet report.
//
// W13: Continue sends the calf to POST /v1/animal/diet-recommendation (no
// feeds); the backend answers with the milk plan and stores the run, so it is
// in Simulation History and can be saved here as a report with a PDF.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { useT, fillText } from "@/lib/i18n-ui";
import { COLORS } from "@/lib/colors";
import { CalfMilkFeedingCard } from "@/components/report/Y3Cards";
import { buildReportContext } from "@/components/report/parts";
import { useSaveReport } from "@/components/report/useSaveReport";
import GetPdfButton from "@/components/report/GetPdfButton";
import PdfActions from "@/components/report/PdfActions";
import ReportActionBar from "@/components/report/ReportActionBar";
import { stringField } from "@/lib/api-client/normalize";

export default function CalfPlanPage() {
  const router = useRouter();
  const reportData = useStore((s) => s.reportData);
  const reportInputs = useStore((s) => s.reportInputs);
  const liveCattleInfo = useStore((s) => s.cattleInfo);
  // The inputs this run was sent with, not the live form (as on /report).
  const cattleInfo = reportInputs?.cattleInfo ?? liveCattleInfo;
  const t = useT(cattleInfo?.simulation_language ?? undefined);
  const { isSaving, pdfUrl, setPdfUrl, savedReportId, save } = useSaveReport(t);
  const hasPlan = !!reportData?.calf_milk_feeding_plan;

  // Nothing to show without the backend's calf answer (e.g. a direct URL
  // visit, or the last run was a cow's).
  useEffect(() => {
    if (!hasPlan) router.replace("/cattle-info");
  }, [hasPlan, router]);
  if (!hasPlan) return null;

  const reportId = reportData.report_id ?? "";
  const simulationId =
    stringField(reportData, "simulation_id") ?? cattleInfo?.simulation_name ?? "";

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Calf Milk Feeding")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-28">
        <CalfMilkFeedingCard
          reportCtx={buildReportContext("Baby Calf/Heifer")}
          reportData={reportData}
          cattleInfo={cattleInfo}
          t={t}
        />
      </div>

      <ReportActionBar
        canSave={!!reportId}
        isSaving={isSaving}
        onSave={() => void save(reportId)}
        onNewCase={() => router.push("/cattle-info")}
        t={t}
      >
        {!pdfUrl && savedReportId && (
          <GetPdfButton reportId={savedReportId} onReady={setPdfUrl} t={t} />
        )}
        {pdfUrl && (
          <PdfActions
            pdfUrl={pdfUrl}
            shareText={fillText(t("Recommendation report for simulation ${id}"), {
              id: simulationId,
            })}
            t={t}
          />
        )}
      </ReportActionBar>
    </div>
  );
}
