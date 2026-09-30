"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { useT, fillText } from "@/lib/i18n-ui";
import {
  ReportContext,
  buildReportContext,
  SCard,
  LabelValue,
  type BannerTheme,
} from "@/components/report/parts";
import RecommendationSections from "@/components/report/RecommendationSections";
import EvaluationSections from "@/components/report/EvaluationSections";
import ReportContextSections from "@/components/report/ReportContextSections";
import {
  CalfMilkFeedingCard,
  ForageConcentrateCard,
  MilkCostMarginCard,
} from "@/components/report/Y3Cards";
import { useSaveReport } from "@/components/report/useSaveReport";
import {
  IcSave,
  IcNewCase,
  IcSimulationDetails,
  IcDietReport,
  IcViewPdf,
  IcShareReport,
} from "@/components/Icons";
import { COLUMN_WIDTH } from "@/lib/column";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";
import type {
  EvaluationResponse,
  RecommendationResponse,
  FeedBreakdown,
  CostEffectiveDiet,
} from "@/lib/api";
import { sumMoney } from "@/lib/money";

export default function ReportPage() {
  const router = useRouter();
  const { user, cattleInfo, reportData, feedSelections, showSnackbar, setFeedSelectionType } =
    useStore((s) => ({
      feedSelections: s.feedSelections,
      user: s.user,
      cattleInfo: s.cattleInfo,
      reportData: s.reportData,
      showSnackbar: s.showSnackbar,
      setFeedSelectionType: s.setFeedSelectionType,
    }));

  // UI-label i18n — this screen (cattle-info → feed-selection → report)
  // is driven by the per-simulation language, not the profile-wide
  // preferred_language, per explicit product decision. Same priority
  // chain as store.ts's langProvider (used for feed-data i18n). See the
  // doc comment on useT() in src/lib/i18n-ui.ts for why this screen
  // passes an explicit langOverride instead of calling useT() bare.
  const t = useT(cattleInfo?.simulation_language ?? user?.preferred_language ?? "en");
  const { isSaving, pdfUrl, save: saveReportPdf } = useSaveReport(t);

  // i18n V2 — fallback lookup so the report body shows translated feed
  // names even if the backend diet endpoints aren't yet returning
  // display_name on FeedBreakdown / CostEffectiveDiet rows. Each entry
  // in feedSelections was populated at pick-time via a ?lang= aware
  // dropdown / search call, so its display_name (or sub_category_name)
  // is already in the user's chosen language. Priority in JSX:
  //   backend row.display_name  →  this map  →  English row.feed_name.
  const feedNameByUuid: Record<string, string> = {};
  for (const s of feedSelections) {
    if (s.feed_uuid) {
      feedNameByUuid[s.feed_uuid] = s.display_name ?? s.sub_category_name;
    }
  }
  const displayFeedName = (row: {
    feed_id?: string | null;
    feed_name?: string | null;
    display_name?: string | null;
  }) =>
    row.display_name ??
    (row.feed_id ? feedNameByUuid[row.feed_id] : undefined) ??
    row.feed_name ??
    "";

  // §2.3 — gate report sections by animal state. When backend ships a
  // server-built report_context, prefer that; otherwise compute locally
  // from the form's animal_category. cattleInfo.animal_category is the
  // 4-state enum (Lactating Cow / Dry Cow / Heifer / Baby Calf/Heifer).
  const serverCtx = reportData?.report_context;
  // Undefined keys are stripped before the spread: a server report_context
  // that merely *mentions* a flag without a value would otherwise overwrite
  // the locally-computed one with `undefined` and hide a section that should
  // be visible (e.g. Methane Intensity for a lactating cow).
  const reportCtx: ReportContext = serverCtx
    ? {
        ...buildReportContext(cattleInfo?.animal_category),
        ...(Object.fromEntries(
          Object.entries(serverCtx).filter(([, v]) => v !== undefined)
        ) as Partial<ReportContext>),
      }
    : buildReportContext(cattleInfo?.animal_category);

  // Use the user's / report's currency CODE (PHP / INR / VND / …)
  // directly. Android renders totals as e.g. "108,199.8 VND" — value
  // with the code as a suffix — rather than swapping in a glyph.
  const currencySymbol = (() => {
    const reportCurrency =
      (reportData as EvaluationResponse)?.cost_analysis?.currency ??
      (reportData as EvaluationResponse)?.currency ??
      null;
    // The report's own currency wins: a restored report was priced in the
    // currency it was generated with, which may differ from the profile's
    // current one (audit B-05, and CLAUDE.md §5 order).
    return reportCurrency || user?.currency || "";
  })();
  const currencySuffix = currencySymbol ? ` ${currencySymbol}` : "";

  const fmt = (n: number | string | null | undefined, d = 2) => {
    if (n === null || n === undefined || n === "") return "—";
    const num = Number(n);
    return isNaN(num) ? String(n) : num.toFixed(d);
  };

  if (!reportData) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
        style={{ backgroundColor: COLORS.authenticWhite }}
      >
        <Toolbar type="back" title={t("Diet Report")} onBack={() => router.back()} />
        <div
          className="flex items-center justify-center rounded-full mb-5 mt-10"
          style={{ width: 80, height: 80, backgroundColor: COLORS.honeydew }}
        >
          <IcDietReport />
        </div>
        <p className="text-xl font-bold mb-2" style={{ color: COLORS.darkAquamarineGreen }}>
          {t("No Report")}
        </p>
        <p className="text-sm mb-8" style={{ color: COLORS.darkSilver }}>
          {t("Generate a report from the Feed Selection screen")}
        </p>
        <button
          onClick={() => router.push("/feed-selection")}
          className="px-8 py-4 rounded-xl font-bold text-base text-white"
          style={{
            backgroundColor: COLORS.darkAquamarineGreen,
            border: "none",
            cursor: "pointer",
          }}
        >
          {t("Go to Feed Selection")}
        </button>
      </div>
    );
  }

  const report = reportData;
  const isEval = report.mode === "evaluation";
  const evalReport = isEval ? (report as EvaluationResponse) : null;
  const recReport = !isEval ? (report as RecommendationResponse) : null;

  // Try every place the v1 backend might surface the report_id —
  // legacy lived at report_info.report_id (recommendation) or top-
  // level report_id (evaluation). v1 may put it elsewhere.
  const reportIdForSave =
    (isEval ? evalReport?.report_id : recReport?.report_info?.report_id) ??
    reportData?.report_id ??
    reportData?.id ??
    "";

  const handleSave = () => void saveReportPdf(reportIdForSave);

  // Android Ext.toReportDisplayDate renders as e.g. "May 13, 2026 at 07:32 AM".
  const formatReportDate = (raw?: string | null) => {
    const d = raw ? new Date(raw) : new Date();
    if (isNaN(d.getTime())) return "—";
    const datePart = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return t("${date} at ${time}").replace("${date}", datePart).replace("${time}", timePart);
  };
  // EvaluationResponse doesn't carry generated_date / user_name / simulation_id
  // at top level — fall back to the local store and current time. Recommendation
  // payload has report_info with those fields populated.
  const generatedOn = formatReportDate(
    isEval ? (evalReport?.generated_at ?? null) : (recReport?.report_info?.generated_date ?? null)
  );
  const ownerName = isEval
    ? (user?.name ?? "")
    : (recReport?.report_info?.user_name ?? user?.name ?? "");
  const simulationId = isEval
    ? (evalReport?.simulation_id ?? cattleInfo?.simulation_name ?? "")
    : (recReport?.report_info?.simulation_id ?? cattleInfo?.simulation_name ?? "");

  // Diet rating state machine — mirrors FragmentRecommendationReport
  // .initUi() when (dietRating). Drives the Simulation Status banner
  // (color/icon/title) and the visibility of Solution Summary,
  // Cost-Effective Diet, Environmental Impact, and the Notes card.
  const dietRating = (recReport?.report_info?.diet_rating ?? "").toUpperCase();
  const isErrorState =
    dietRating === "ERROR_NO_BEST" ||
    dietRating === "ERROR_PRECHECK" ||
    dietRating === "ERROR_NO_RESULT";
  const isAdvisory = dietRating === "ADVISORY";
  const isInfeasible = dietRating === "INFEASIBLE";
  const isOptimalOrUnknown = !isErrorState && !isAdvisory && !isInfeasible;
  // Per Android: hide solution/cost/env when there is no feasible solution.
  const showSolutionSections = !isErrorState;
  // Per Android: hide the entire Notes card when dietRating is OPTIMAL / else.
  const showNotesCard = !isOptimalOrUnknown;

  const banner: BannerTheme = (() => {
    if (isAdvisory) {
      return {
        bg: "rgba(255,152,0,0.15)", // vivid_gamboge_15
        stroke: "rgba(255,152,0,0.30)", // vivid_gamboge_30
        iconBg: COLORS.darkYellow, // dark_yellow
        titleColor: COLORS.fireOrange, // fire_orange
        bodyColor: COLORS.vividGamboge, // vivid_gamboge
        statusText: "Solution has safety/nutritional violations",
      };
    }
    if (isErrorState) {
      return {
        bg: COLORS.peachyPink, // peachy_pink
        stroke: "rgba(228,74,74,0.20)", // carmine_pink_20
        iconBg: COLORS.carminePink, // red_shimmer
        titleColor: COLORS.redRyb, // red_ryb
        bodyColor: COLORS.carminePink, // carmine_pink
        statusText: "No optimized solution found",
      };
    }
    if (isInfeasible) {
      return {
        bg: COLORS.honeydew, // honeydew
        stroke: COLORS.goGreen15, // go_green_15
        iconBg: COLORS.darkGreenTurquoise, // dark_green_turquoise
        titleColor: COLORS.crayolaGreen, // la_salle_green
        bodyColor: COLORS.darkAquamarineGreen, // dark_aquamarine_green
        statusText: "Solution has safety/nutritional violations",
      };
    }
    // Optimal / else
    return {
      bg: COLORS.honeydew,
      stroke: COLORS.goGreen15,
      iconBg: COLORS.darkGreenTurquoise,
      titleColor: COLORS.crayolaGreen,
      bodyColor: COLORS.darkAquamarineGreen,
      statusText: "Optimized solution found",
    };
  })();

  // Build osPoints + rwPoints exactly the way FragmentRecommendationReport
  // does: filter empty strings out of violated_parameters; concat
  // recommendations + warnings; if both are empty insert the
  // "No recommendation/warnings available!" placeholder.
  const violatedRaw = recReport?.additional_information?.violated_parameters ?? [];
  const recommendationsRaw = recReport?.additional_information?.recommendations ?? [];
  const warningsRaw = recReport?.additional_information?.warnings ?? [];
  const osPoints = violatedRaw.filter((s) => s && s.trim().length > 0);
  const rwPoints = [...recommendationsRaw, ...warningsRaw];
  const rwDisplay = rwPoints.length === 0 ? [t("No recommendation/warnings available!")] : rwPoints;

  // Top-level `warnings` — advisory notes about limits the diet did not meet.
  // Distinct from additional_information.warnings above: these come from the
  // SOFT limits (ndf_max / starch_max / ee_max), which the optimizer only
  // penalises in the cost objective and may legitimately exceed. The run
  // succeeds and the report stays valid, so they get their own advisory card
  // rather than joining the Notes card — the Notes card is hidden precisely
  // when the rating is OPTIMAL, which is exactly when a soft breach is
  // reported.
  const softLimitNotes = (recReport?.warnings ?? []).filter((w) => w && w.trim().length > 0);

  // Total cost sums for footers
  // Cent-exact sums (audit B-25): the footer equals the rows the user sees.
  const recTotalCost = sumMoney(
    (recReport?.least_cost_diet ?? []).map((r: CostEffectiveDiet) => r.daily_cost)
  );
  const evalTotalCost = sumMoney(
    (evalReport?.feed_breakdown ?? []).map((r: FeedBreakdown) => r.total_cost)
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar
        type="back"
        title={isEval ? t("Evaluation Report") : t("Recommendation Report")}
        onBack={() => router.back()}
      />

      <div className="flex-1 overflow-y-auto pb-28">
        {/* Section 1: Report Details — matches Android layout_report:
            REPORT ID | SIMULATION ID, OWNER NAME (full), GENERATED ON (full).
            No Status badge — Android does not show one here. */}
        <SCard
          title={t("Report Details")}
          icon={<IcSimulationDetails size={24} color={COLORS.darkAquamarineGreen} />}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <LabelValue label={t("Report ID")} value={reportIdForSave || t("N/A")} />
            <LabelValue label={t("Simulation ID")} value={simulationId || t("N/A")} />
            <div className="col-span-2">
              <LabelValue label={t("Owner Name")} value={ownerName || t("N/A")} />
            </div>
            <div className="col-span-2">
              <LabelValue label={t("Generated On")} value={generatedOn} />
            </div>
          </div>
        </SCard>

        {/* Section 2: Animal Characteristics — field order from
            layout_animal_characteristics_report.xml:
            Breed | Body Weight
            Body Condition Score | Daily BW Gain
            Parity | Days in Milk
            Days of Pregnancy | Temperature
            Distance | Topography
            Milk Production | Milk Protein %
            Milk Fat % */}
        {cattleInfo && (
          <ReportContextSections cattleInfo={cattleInfo} reportCtx={reportCtx} t={t} />
        )}

        {/* Y3 §2.1 — Milk Cost Margin card. Shows only when the user
            entered a milk price on the Animal Inputs screen. Compares
            the diet's cost-per-litre against that price and surfaces a
            positive (green) or negative (red) margin per litre.
            Computed client-side from existing response fields until
            Maria ships a backend MilkCostMargin block on the response
            (see docs/Search_Implmentation.md §12.5). */}
        <MilkCostMarginCard
          reportCtx={reportCtx}
          reportData={reportData}
          cattleInfo={cattleInfo}
          isEval={isEval}
          evalReport={evalReport}
          recReport={recReport}
          currencySymbol={currencySymbol}
          t={t}
        />

        {/* Y3 §2.3 — Calf milk-feeding section. Only renders for animals
            in the "Baby Calf/Heifer" state. Backend will eventually ship
            a CalfMilkFeedingPlan block on the response (see
            docs/Search_Implmentation.md §14.3); until then the card
            shows the rule-of-thumb default (10% of body weight per day,
            split into 2 feedings, weaning ~8 weeks) using the cattle
            info the user already entered. */}
        <CalfMilkFeedingCard
          reportCtx={reportCtx}
          reportData={reportData}
          cattleInfo={cattleInfo}
          t={t}
        />

        {/* Y3 §2.2 — Forage : Concentrate ratio tile on a fresh matter
            (as-fed) basis. Evaluation mode reads the feed_breakdown
            rows (which carry feed_type directly). Recommendation mode
            reads least_cost_diet rows (no feed_type field on the
            response) and cross-references feed_name against the
            store's feedSelections to recover each line's type. The
            tile hides when there's no usable data (both totals zero)
            so an evaluator that returned an empty breakdown doesn't
            leave an empty card on the page. */}
        <ForageConcentrateCard
          reportData={reportData}
          isEval={isEval}
          evalReport={evalReport}
          recReport={recReport}
          feedSelections={feedSelections}
          t={t}
        />

        {/* ─── EVALUATION SECTIONS ─── */}
        {isEval && evalReport && (
          <EvaluationSections
            currencySuffix={currencySuffix}
            currencySymbol={currencySymbol}
            displayFeedName={displayFeedName}
            evalReport={evalReport}
            evalTotalCost={evalTotalCost}
            fmt={fmt}
            reportCtx={reportCtx}
            t={t}
          />
        )}

        {/* ─── RECOMMENDATION SECTIONS ─── */}
        {!isEval && recReport && (
          <RecommendationSections
            banner={banner}
            currencySymbol={currencySymbol}
            displayFeedName={displayFeedName}
            fmt={fmt}
            isAdvisory={isAdvisory}
            isErrorState={isErrorState}
            osPoints={osPoints}
            recReport={recReport}
            recTotalCost={recTotalCost}
            reportCtx={reportCtx}
            rwDisplay={rwDisplay}
            rwPoints={rwPoints}
            showNotesCard={showNotesCard}
            showSolutionSections={showSolutionSections}
            softLimitNotes={softLimitNotes}
            t={t}
            user={user}
          />
        )}
      </div>

      {/* Fixed bottom buttons */}
      <div
        className="px-4 py-4"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: COLUMN_WIDTH,
          backgroundColor: COLORS.white,
          borderTop: `1px solid ${COLORS.webDivider}`,
          zIndex: 30,
        }}
      >
        {isEval && (
          <button
            onClick={() => {
              setFeedSelectionType("recommendation");
              router.push("/feed-selection");
            }}
            className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5 mb-3"
            style={{
              backgroundColor: COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("Generate Diet Recommendation")}
          </button>
        )}
        {pdfUrl && (
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{
                backgroundColor: COLORS.honeydew,
                color: COLORS.darkAquamarineGreen,
                border: `1px solid ${COLORS.darkAquamarineGreen}`,
                cursor: "pointer",
              }}
            >
              <IcViewPdf />
              {t("View PDF")}
            </button>
            {/* Share report — Web Share API on mobile pops the native
                sheet (WhatsApp / Telegram / etc.), matching the Android
                "Share the report" function in the test matrix. Falls back
                to copy-to-clipboard on desktop browsers without
                navigator.share. */}
            <button
              onClick={async () => {
                if (!pdfUrl) return;
                const shareData = {
                  title: t("RationSmart Diet Report"),
                  text: fillText(
                    isEval
                      ? t("Evaluation report for simulation ${id}")
                      : t("Recommendation report for simulation ${id}"),
                    { id: simulationId }
                  ),
                  url: pdfUrl,
                };
                try {
                  if (typeof navigator !== "undefined" && navigator.share) {
                    await navigator.share(shareData);
                  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(pdfUrl);
                    showSnackbar(t("PDF link copied to clipboard"), "success");
                  } else {
                    window.open(pdfUrl, "_blank", "noopener,noreferrer");
                  }
                } catch (err) {
                  // navigator.share rejects with AbortError if the user
                  // dismisses the sheet — that's not a real failure.
                  if (err instanceof Error && err.name !== "AbortError") {
                    showSnackbar(t("Could not share the report"), "error");
                  }
                }
              }}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{
                backgroundColor: COLORS.darkAquamarineGreen,
                color: COLORS.white,
                border: "none",
                cursor: "pointer",
              }}
            >
              <IcShareReport />
              {t("Share Report")}
            </button>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => {
              // New Case = "make a small tweak and run again" rather
              // than "start from scratch". Everything the user typed
              // stays populated: cattle info + feed selections + the
              // recommendation/evaluation toggle + the per-simulation
              // language override. Only the just-generated report goes
              // (it will be overwritten anyway when the user re-runs).
              //
              // Users who want a truly clean slate use the Reset button
              // on Cattle Info instead — that wipes the form + feeds
              // back to defaults.
              router.push("/cattle-info");
            }}
            className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
            style={{
              border: `2px solid ${COLORS.darkAquamarineGreen}`,
              color: COLORS.darkAquamarineGreen,
              background: COLORS.white,
              cursor: "pointer",
            }}
          >
            <IcNewCase size={18} color={COLORS.darkAquamarineGreen} />
            {t("New Case")}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !reportIdForSave}
            className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
            style={{
              backgroundColor:
                isSaving || !reportIdForSave ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
              color: isSaving || !reportIdForSave ? COLORS.spanishGray : COLORS.white,
              border: "none",
              cursor: isSaving || !reportIdForSave ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? (
              <>
                <Spinner size={16} />
                {t("Saving...")}
              </>
            ) : (
              <>
                <IcSave size={18} color={!reportIdForSave ? COLORS.spanishGray : COLORS.white} />
                {t("Save Report")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
