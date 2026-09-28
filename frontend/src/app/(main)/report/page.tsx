"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { useT } from "@/lib/i18n-ui";
import {
  ReportContext,
  buildReportContext,
  StatusBadge,
  SCard,
  LabelValue,
  MethaneBar,
  MAX_METHANE_PRODUCTION,
  MAX_METHANE_YIELD,
  MAX_METHANE_INTENSITY,
  MAX_YM_PERCENT,
  calcPct,
  MetricTile,
  BalanceRow,
  BulletList,
  TotalCostFooter,
} from "@/components/report/parts";
import { useSaveReport } from "@/components/report/useSaveReport";
import {
  IcSave,
  IcNewCase,
  IcAnimalCharacteristics,
  IcEnvironment,
  IcSimulationDetails,
  IcDietReport,
  IcCalfMilk,
  IcEvaluationSummary,
  IcCostAnalysis,
  IcFeedBreakdown,
  IcDryMatterIntake,
  IcMilkProductionAnalysis,
  IcSolutionSummary,
  IcDailyCost,
  IcMilkDroplet,
  IcDmIntakeGrass,
  IcCostEffectiveDiet,
  IcNotes,
  IcViolatedParameter,
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
  const serverCtx = (reportData as { report_context?: Partial<ReportContext> } | null)
    ?.report_context;
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
    (reportData as { report_id?: string })?.report_id ??
    (reportData as { id?: string })?.id ??
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
    return `${datePart} at ${timePart}`;
  };
  // EvaluationResponse doesn't carry generated_date / user_name / simulation_id
  // at top level — fall back to the local store and current time. Recommendation
  // payload has report_info with those fields populated.
  const evalRaw = evalReport as unknown as Record<string, unknown> | null;
  const generatedOn = formatReportDate(
    isEval
      ? ((evalRaw?.generated_at as string | undefined) ?? null)
      : (recReport?.report_info?.generated_date ?? null)
  );
  const ownerName = isEval
    ? (user?.name ?? "")
    : (recReport?.report_info?.user_name ?? user?.name ?? "");
  const simulationId = isEval
    ? ((evalRaw?.simulation_id as string | undefined) ?? cattleInfo?.simulation_name ?? "")
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

  type BannerTheme = {
    bg: string;
    stroke: string;
    iconBg: string;
    titleColor: string;
    bodyColor: string;
    statusText: string;
  };
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
        stroke: "rgba(5,188,109,0.15)", // go_green_15
        iconBg: COLORS.darkGreenTurquoise, // dark_green_turquoise
        titleColor: COLORS.crayolaGreen, // la_salle_green
        bodyColor: COLORS.darkAquamarineGreen, // dark_aquamarine_green
        statusText: "Solution has safety/nutritional violations",
      };
    }
    // Optimal / else
    return {
      bg: COLORS.honeydew,
      stroke: "rgba(5,188,109,0.15)",
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
  const recTotalCost = recReport?.least_cost_diet
    ? recReport.least_cost_diet.reduce(
        (sum: number, r: CostEffectiveDiet) => sum + (Number(r.daily_cost) || 0),
        0
      )
    : 0;

  const evalTotalCost = evalReport?.feed_breakdown
    ? evalReport.feed_breakdown.reduce(
        (sum: number, r: FeedBreakdown) => sum + (Number(r.total_cost) || 0),
        0
      )
    : 0;

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
          <SCard
            title={t("Animal Characteristics")}
            icon={<IcAnimalCharacteristics size={24} color={COLORS.darkAquamarineGreen} />}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <LabelValue label={t("Breed")} value={cattleInfo.breed || t("N/A")} />
              <LabelValue label={t("Body Weight")} value={`${cattleInfo.body_weight} ${t("Kg")}`} />
              <LabelValue
                label={t("Body Condition Score")}
                value={`${cattleInfo.body_condition_score}`}
              />
              <LabelValue
                label={t("Daily BW Gain")}
                value={`${cattleInfo.body_weight_gain} ${t("kg/day")}`}
              />
              <LabelValue label={t("Parity")} value={`${cattleInfo.parity}`} />
              <LabelValue
                label={t("Days in Milk")}
                value={`${cattleInfo.days_in_milk} ${t("Days")}`}
              />
              <LabelValue
                label={t("Days of Pregnancy")}
                value={`${cattleInfo.days_of_pregnancy} ${t("Days")}`}
              />
              <LabelValue
                label={t("Temperature")}
                value={`${cattleInfo.average_temperature} ${t("°C")}`}
              />
              <LabelValue
                label={t("Distance")}
                value={
                  cattleInfo.grazing
                    ? `${Number(cattleInfo.distance ?? 0).toFixed(2)} ${t("km")}`
                    : `0.00 ${t("km")}`
                }
              />
              <LabelValue
                label={t("Topography")}
                value={cattleInfo.grazing ? cattleInfo.topography || t("N/A") : t("Not Selected")}
              />
              {/* Y3 §2.3 — milk rows only for Lactating Cow. Other states
                  don't capture milk values on the form, so showing them
                  here would just print "0 Liter" / "0 %". */}
              {reportCtx.showMilkProductionSection && (
                <>
                  <LabelValue
                    label={t("Milk Production")}
                    value={`${cattleInfo.milk_production} ${t("Liter")}`}
                  />
                  <LabelValue
                    label={t("Milk Protein %")}
                    value={`${cattleInfo.milk_protein_percent} %`}
                  />
                  <div className="col-span-2">
                    <LabelValue
                      label={t("Milk Fat %")}
                      value={`${cattleInfo.milk_fat_percent} %`}
                    />
                  </div>
                </>
              )}
            </div>
          </SCard>
        )}

        {/* Y3 §2.1 — Milk Cost Margin card. Shows only when the user
            entered a milk price on the Animal Inputs screen. Compares
            the diet's cost-per-litre against that price and surfaces a
            positive (green) or negative (red) margin per litre.
            Computed client-side from existing response fields until
            Maria ships a backend MilkCostMargin block on the response
            (see docs/Search_Implmentation.md §12.5). */}
        {(() => {
          if (!reportCtx.showMilkCostMarginCard) return null;
          // Prefer the backend-computed MilkCostMargin block when Maria
          // ships it (see docs/Search_Implmentation.md §12.5 Option A).
          // Falls through to the client-side compute when the block is
          // absent. Either path produces the same UI.
          const serverMargin = (
            reportData as {
              milk_cost_margin?: {
                milk_price_per_litre?: number | null;
                cost_per_litre?: number | null;
                margin_per_litre?: number | null;
                total_diet_cost_as_fed?: number | null;
                daily_milk_production_l?: number | null;
                currency?: string | null;
              };
            } | null
          )?.milk_cost_margin;
          const milkPrice = serverMargin?.milk_price_per_litre ?? cattleInfo?.milk_price ?? null;
          const milkProduction =
            serverMargin?.daily_milk_production_l ?? cattleInfo?.milk_production ?? null;
          if (milkPrice == null || !milkProduction) return null;
          // Pick the right daily cost source per mode. Evaluation uses
          // cost_analysis.total_diet_cost_as_fed; Recommendation uses
          // top-level total_diet_cost (which equals solution_summary's
          // daily_cost when present, but is the more reliable source
          // since some payloads omit solution_summary).
          const dailyCost =
            serverMargin?.total_diet_cost_as_fed ??
            (isEval
              ? (evalReport?.cost_analysis?.total_diet_cost_as_fed ?? null)
              : (recReport?.total_diet_cost ?? recReport?.solution_summary?.daily_cost ?? null));
          if (dailyCost == null || dailyCost <= 0) return null;
          const costPerLitre = serverMargin?.cost_per_litre ?? dailyCost / milkProduction;
          const margin = serverMargin?.margin_per_litre ?? milkPrice - costPerLitre;
          const isPositive = margin >= 0;
          // Color tokens chosen to match existing report banners
          // (dark_green_turquoise / carmine_pink theme).
          const accent = isPositive ? COLORS.darkGreenTurquoise : COLORS.carminePink;
          const accentBg = isPositive ? COLORS.honeydew : COLORS.peachyPink;
          const accentBorder = isPositive ? "rgba(5,188,109,0.20)" : "rgba(228,74,74,0.25)";
          return (
            <SCard
              title={t("Milk Cost Margin")}
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3v18M5 12h14"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1.8" />
                </svg>
              }
            >
              {/* Two-column comparison */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: COLORS.authenticWhite,
                    border: `1px solid ${COLORS.webDivider}`,
                  }}
                >
                  <p
                    className="font-bold uppercase mb-1"
                    style={{
                      color: COLORS.darkSilver,
                      fontSize: 11,
                      letterSpacing: 0.3,
                    }}
                  >
                    {t("Diet Cost / L")}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 20 }}>
                      {costPerLitre.toFixed(2)}
                    </p>
                    <p style={{ color: COLORS.darkSilver, fontSize: 12 }}>{currencySymbol}</p>
                  </div>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: COLORS.authenticWhite,
                    border: `1px solid ${COLORS.webDivider}`,
                  }}
                >
                  <p
                    className="font-bold uppercase mb-1"
                    style={{
                      color: COLORS.darkSilver,
                      fontSize: 11,
                      letterSpacing: 0.3,
                    }}
                  >
                    {t("Milk Price / L")}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 20 }}>
                      {milkPrice.toFixed(2)}
                    </p>
                    <p style={{ color: COLORS.darkSilver, fontSize: 12 }}>{currencySymbol}</p>
                  </div>
                </div>
              </div>
              {/* Big margin banner — sign-coloured */}
              <div
                className="rounded-xl p-3 flex items-center justify-between"
                style={{ backgroundColor: accentBg, border: `1px solid ${accentBorder}` }}
              >
                <div>
                  <p
                    className="font-bold uppercase"
                    style={{
                      color: accent,
                      fontSize: 11,
                      letterSpacing: 0.3,
                    }}
                  >
                    {isPositive ? t("Profit / Litre") : t("Loss / Litre")}
                  </p>
                  <div className="flex items-baseline gap-1" style={{ marginTop: 2 }}>
                    <p className="font-bold" style={{ color: accent, fontSize: 24 }}>
                      {isPositive ? "+" : "−"}
                      {Math.abs(margin).toFixed(2)}
                    </p>
                    <p className="font-bold" style={{ color: accent, fontSize: 13 }}>
                      {currencySymbol}/L
                    </p>
                  </div>
                </div>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  {isPositive ? (
                    <path
                      d="M7 14l5-5 5 5"
                      stroke={accent}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M7 10l5 5 5-5"
                      stroke={accent}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </div>
              {/* Daily margin context line */}
              <p className="mt-2 ml-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
                {t("Across")} {milkProduction.toFixed(1)} L/day,
                {isPositive ? ` ${t("net profit")}` : ` ${t("net loss")}`}{" "}
                <span className="font-bold" style={{ color: accent }}>
                  {(Math.abs(margin) * milkProduction).toFixed(2)} {currencySymbol}/day
                </span>
              </p>
            </SCard>
          );
        })()}

        {/* Y3 §2.3 — Calf milk-feeding section. Only renders for animals
            in the "Baby Calf/Heifer" state. Backend will eventually ship
            a CalfMilkFeedingPlan block on the response (see
            docs/Search_Implmentation.md §14.3); until then the card
            shows the rule-of-thumb default (10% of body weight per day,
            split into 2 feedings, weaning ~8 weeks) using the cattle
            info the user already entered. */}
        {reportCtx.showCalfMilkFeedingSection &&
          cattleInfo &&
          (() => {
            const bw = Number(cattleInfo.body_weight ?? 0);
            if (bw <= 0) return null;
            // Backend-supplied plan (when present) wins; else compute the
            // rule-of-thumb. cattleInfo.body_weight is in kg → 10% by mass
            // ≈ 10% by volume for whole cow milk (density ~1.03 g/mL).
            const serverPlan = (
              reportData as {
                calf_milk_feeding_plan?: {
                  daily_milk_volume_l?: number;
                  feedings_per_day?: number;
                  estimated_weaning_age_days?: number;
                  notes?: string[];
                };
              } | null
            )?.calf_milk_feeding_plan;
            const dailyVolume = serverPlan?.daily_milk_volume_l ?? bw * 0.1;
            const feedings = serverPlan?.feedings_per_day ?? 2;
            const weaningDays = serverPlan?.estimated_weaning_age_days ?? 56;
            const perFeedingL = dailyVolume / Math.max(feedings, 1);
            const notes = serverPlan?.notes ?? [
              t("Use clean, warm milk at 38–40°C; never cold from the fridge."),
              t("Replace whole milk with a quality milk replacer if cost is a concern."),
              t("Wean gradually over 7–10 days once the calf eats 1.5–2 kg of starter daily."),
            ];
            return (
              <SCard title={t("Calf Milk Feeding")} icon={<IcCalfMilk />}>
                {/* Without a backend plan these figures are the rule of thumb
                    above, not an engine result — say so (audit D-02). */}
                {!serverPlan && (
                  <p className="text-xs mb-2" style={{ color: COLORS.darkSilver }}>
                    {t(
                      "Estimated from body weight using general guidance — not calculated by the ration engine."
                    )}
                  </p>
                )}
                {/* Three tiles: daily volume, per-feeding split, weaning age */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div
                    className="rounded-xl p-2.5"
                    style={{
                      backgroundColor: COLORS.honeydew,
                      border: "1px solid rgba(5,188,109,0.20)",
                    }}
                  >
                    <p
                      className="font-bold uppercase mb-1"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 10,
                        letterSpacing: 0.3,
                      }}
                    >
                      {t("Daily milk")}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className="font-bold"
                        style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
                      >
                        {dailyVolume.toFixed(1)}
                      </p>
                      <p style={{ color: COLORS.darkSilver, fontSize: 11 }}>{t("L")}</p>
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5"
                    style={{
                      backgroundColor: COLORS.honeydew,
                      border: "1px solid rgba(5,188,109,0.20)",
                    }}
                  >
                    <p
                      className="font-bold uppercase mb-1"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 10,
                        letterSpacing: 0.3,
                      }}
                    >
                      {t("Per feeding")}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className="font-bold"
                        style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
                      >
                        {perFeedingL.toFixed(1)}
                      </p>
                      <p style={{ color: COLORS.darkSilver, fontSize: 11 }}>
                        {t("L")} × {feedings}
                      </p>
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5"
                    style={{
                      backgroundColor: COLORS.honeydew,
                      border: "1px solid rgba(5,188,109,0.20)",
                    }}
                  >
                    <p
                      className="font-bold uppercase mb-1"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 10,
                        letterSpacing: 0.3,
                      }}
                    >
                      {t("Wean by")}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className="font-bold"
                        style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
                      >
                        {weaningDays}
                      </p>
                      <p style={{ color: COLORS.darkSilver, fontSize: 11 }}>{t("days")}</p>
                    </div>
                  </div>
                </div>
                {/* Notes */}
                {notes.length > 0 && (
                  <div>
                    {notes.map((n, i) => (
                      <div key={i} className="flex items-start gap-2" style={{ marginBottom: 6 }}>
                        <span
                          style={{
                            flexShrink: 0,
                            marginTop: 7,
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            backgroundColor: COLORS.crayolaGreen,
                          }}
                        />
                        <p
                          style={{
                            color: COLORS.raisinBlack,
                            fontSize: 13,
                            lineHeight: 1.45,
                            margin: 0,
                          }}
                        >
                          {n}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p
                  className="mt-2 ml-1"
                  style={{
                    color: COLORS.darkSilver,
                    fontSize: 11,
                    fontStyle: "italic",
                  }}
                >
                  {serverPlan
                    ? t("Plan from server. Adjust with vet guidance.")
                    : t(
                        "Default plan — 10% of body weight per day. Backend will refine when available."
                      )}
                </p>
              </SCard>
            );
          })()}

        {/* Y3 §2.2 — Forage : Concentrate ratio tile on a fresh matter
            (as-fed) basis. Evaluation mode reads the feed_breakdown
            rows (which carry feed_type directly). Recommendation mode
            reads least_cost_diet rows (no feed_type field on the
            response) and cross-references feed_name against the
            store's feedSelections to recover each line's type. The
            tile hides when there's no usable data (both totals zero)
            so an evaluator that returned an empty breakdown doesn't
            leave an empty card on the page. */}
        {(() => {
          // Prefer the backend-computed ForageConcentrateRatio block
          // when Maria ships it (see docs/Search_Implmentation.md §13.3).
          // Falls through to client-side compute when absent. Same UI.
          const serverRatio = (
            reportData as {
              forage_concentrate_ratio?: {
                forage_kg_as_fed?: number | null;
                concentrate_kg_as_fed?: number | null;
                other_kg_as_fed?: number | null;
                forage_pct?: number | null;
                concentrate_pct?: number | null;
                other_pct?: number | null;
                basis?: string | null;
              };
            } | null
          )?.forage_concentrate_ratio;
          let forageKg = 0;
          let concKg = 0;
          let otherKg = 0;
          if (serverRatio) {
            forageKg = Number(serverRatio.forage_kg_as_fed ?? 0);
            concKg = Number(serverRatio.concentrate_kg_as_fed ?? 0);
            otherKg = Number(serverRatio.other_kg_as_fed ?? 0);
          } else {
            // Build a uniform [{ feed_type, as_fed_kg }] list from
            // whichever response branch is active.
            let lines: { feed_type: string; as_fed: number }[] = [];
            if (isEval && evalReport?.feed_breakdown) {
              lines = evalReport.feed_breakdown
                .map((b) => ({
                  feed_type: (b.feed_type ?? "").trim(),
                  as_fed: Number(b.quantity_as_fed_kg_per_day ?? 0),
                }))
                .filter((l) => l.as_fed > 0);
            } else if (!isEval && recReport?.least_cost_diet) {
              // Cross-ref by feed_name — case + whitespace tolerant.
              // Prefer per-row feed_type when backend ships it (Y3 §13.2);
              // fall back to the store lookup for older responses.
              const typeByName = new Map<string, string>();
              for (const sel of feedSelections) {
                if (sel.sub_category_name && sel.feed_type_name) {
                  typeByName.set(sel.sub_category_name.trim().toLowerCase(), sel.feed_type_name);
                }
              }
              lines = recReport.least_cost_diet
                .map((r) => ({
                  feed_type:
                    (r as CostEffectiveDiet & { feed_type?: string }).feed_type?.trim() ||
                    typeByName.get((r.feed_name ?? "").trim().toLowerCase()) ||
                    "",
                  as_fed: Number(r.quantity_kg_per_day ?? 0),
                }))
                .filter((l) => l.as_fed > 0);
            }
            if (lines.length === 0) return null;
            // Forage / Roughage → forage bucket; everything else → concentrate.
            // Lines we can't classify (empty feed_type) fall into "other";
            // we still count them in the total so percentages add to 100,
            // but expose them as a tiny grey segment with its own label.
            for (const l of lines) {
              const t = l.feed_type.toLowerCase();
              if (t === "forage" || t === "roughage") forageKg += l.as_fed;
              else if (t === "") otherKg += l.as_fed;
              else concKg += l.as_fed;
            }
          }
          const total = forageKg + concKg + otherKg;
          if (total <= 0) return null;
          const fPct = serverRatio?.forage_pct ?? (forageKg / total) * 100;
          const cPct = serverRatio?.concentrate_pct ?? (concKg / total) * 100;
          const oPct = serverRatio?.other_pct ?? (otherKg / total) * 100;
          // Color tokens — go_green family for Forage, vivid_gamboge
          // amber for Concentrate (matches the Diet Status badge palette
          // used elsewhere on the page).
          const forageColor = COLORS.crayolaGreen;
          const concColor = COLORS.vividGamboge;
          const otherColor = COLORS.silverSand;
          return (
            <SCard
              title={t("Forage : Concentrate Ratio")}
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="10"
                    width="8"
                    height="9"
                    rx="1.5"
                    stroke={forageColor}
                    strokeWidth="1.8"
                  />
                  <rect
                    x="13"
                    y="6"
                    width="8"
                    height="13"
                    rx="1.5"
                    stroke={concColor}
                    strokeWidth="1.8"
                  />
                </svg>
              }
            >
              {/* Big numeric headline — "65 : 35" style */}
              <div
                className="flex items-baseline justify-center gap-2"
                style={{ marginBottom: 12 }}
              >
                <span className="font-bold" style={{ color: forageColor, fontSize: 32 }}>
                  {Math.round(fPct)}
                </span>
                <span style={{ color: COLORS.darkSilver, fontSize: 22 }}>:</span>
                <span className="font-bold" style={{ color: concColor, fontSize: 32 }}>
                  {Math.round(cPct)}
                </span>
                {oPct > 0.5 && (
                  <>
                    <span style={{ color: COLORS.darkSilver, fontSize: 22 }}>:</span>
                    <span className="font-bold" style={{ color: otherColor, fontSize: 32 }}>
                      {Math.round(oPct)}
                    </span>
                  </>
                )}
              </div>
              {/* Stacked horizontal bar showing the split visually */}
              <div
                className="flex w-full overflow-hidden"
                style={{
                  height: 12,
                  borderRadius: 6,
                  marginBottom: 10,
                  backgroundColor: COLORS.americanDiamond,
                }}
              >
                {fPct > 0 && <div style={{ width: `${fPct}%`, backgroundColor: forageColor }} />}
                {cPct > 0 && <div style={{ width: `${cPct}%`, backgroundColor: concColor }} />}
                {oPct > 0 && <div style={{ width: `${oPct}%`, backgroundColor: otherColor }} />}
              </div>
              {/* Legend rows — name, kg/day as-fed, % share */}
              <div style={{ marginBottom: 6 }}>
                <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: forageColor,
                        display: "inline-block",
                      }}
                    />
                    <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                      {t("Forage")}
                    </span>
                  </div>
                  <span style={{ color: COLORS.darkSilver }}>
                    {forageKg.toFixed(2)} {t("kg/day")} ·{" "}
                    <span className="font-bold" style={{ color: forageColor }}>
                      {fPct.toFixed(0)}%
                    </span>
                  </span>
                </div>
              </div>
              <div style={{ marginBottom: oPct > 0 ? 6 : 0 }}>
                <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: concColor,
                        display: "inline-block",
                      }}
                    />
                    <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                      {t("Concentrate")}
                    </span>
                  </div>
                  <span style={{ color: COLORS.darkSilver }}>
                    {concKg.toFixed(2)} {t("kg/day")} ·{" "}
                    <span className="font-bold" style={{ color: concColor }}>
                      {cPct.toFixed(0)}%
                    </span>
                  </span>
                </div>
              </div>
              {oPct > 0 && (
                <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: otherColor,
                        display: "inline-block",
                      }}
                    />
                    <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                      {t("Other")}
                    </span>
                  </div>
                  <span style={{ color: COLORS.darkSilver }}>
                    {otherKg.toFixed(2)} {t("kg/day")} ·{" "}
                    <span className="font-bold" style={{ color: COLORS.darkSilver }}>
                      {oPct.toFixed(0)}%
                    </span>
                  </span>
                </div>
              )}
              <p
                className="mt-3 ml-1"
                style={{
                  color: COLORS.darkSilver,
                  fontSize: 11,
                  fontStyle: "italic",
                }}
              >
                {t("Fresh matter (as-fed) basis")} · {t("total")} {total.toFixed(2)} {t("kg/day")}
              </p>
            </SCard>
          );
        })()}

        {/* ─── EVALUATION SECTIONS ─── */}
        {isEval && evalReport && (
          <>
            {/* Evaluation Summary */}
            {evalReport.evaluation_summary &&
              (evalReport.evaluation_summary.overall_status ||
                evalReport.evaluation_summary.limiting_factor) && (
                <SCard title={t("Evaluation Summary")} icon={<IcEvaluationSummary />}>
                  {evalReport.evaluation_summary.overall_status && (
                    <div
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2"
                      style={{ backgroundColor: COLORS.authenticWhite }}
                    >
                      <span className="text-sm font-bold" style={{ color: COLORS.darkSilver }}>
                        {t("Overall Status")}
                      </span>
                      <StatusBadge status={evalReport.evaluation_summary.overall_status} />
                    </div>
                  )}
                  {evalReport.evaluation_summary.limiting_factor && (
                    <div
                      className="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: COLORS.authenticWhite }}
                    >
                      <span className="text-sm font-bold" style={{ color: COLORS.darkSilver }}>
                        {t("Limiting Factor")}
                      </span>
                      <span className="text-sm font-bold" style={{ color: COLORS.carminePink }}>
                        {evalReport.evaluation_summary.limiting_factor}
                      </span>
                    </div>
                  )}
                </SCard>
              )}

            {/* Cost Analysis */}
            <SCard title={t("Cost Analysis")} icon={<IcCostAnalysis />}>
              <div className="flex gap-3 mb-3">
                <MetricTile
                  label={t("Total Diet Cost")}
                  value={`${fmt(evalReport.cost_analysis?.total_diet_cost_as_fed)}${currencySuffix}`}
                  unit=""
                />
                <MetricTile
                  label={t("Cost/Litre Milk")}
                  value={`${fmt(evalReport.cost_analysis?.feed_cost_per_kg_milk)}${currencySuffix}`}
                  unit={t("per litre")}
                />
              </div>
              {(evalReport.cost_analysis?.recommendations?.length > 0 ||
                (evalReport.cost_analysis?.warnings?.length ?? 0) > 0) && (
                <div className="mt-2 space-y-2">
                  <BulletList
                    items={evalReport.cost_analysis?.recommendations ?? []}
                    color={COLORS.darkAquamarineGreen}
                  />
                  <BulletList
                    items={evalReport.cost_analysis?.warnings ?? []}
                    color={COLORS.vividGamboge}
                  />
                </div>
              )}
            </SCard>

            {/* Feed Breakdown */}
            {evalReport.feed_breakdown && evalReport.feed_breakdown.length > 0 && (
              <SCard
                title={t("Feed Breakdown")}
                icon={<IcFeedBreakdown />}
                footer={
                  <TotalCostFooter
                    label={t("Total Diet Cost")}
                    value={`${fmt(evalTotalCost)}${currencySuffix}`}
                  />
                }
              >
                <div
                  className="flex text-xs font-bold py-2 px-1 rounded-lg mb-1"
                  style={{
                    backgroundColor: COLORS.americanDiamond,
                    color: COLORS.darkSilver,
                  }}
                >
                  <span className="flex-1">{t("Feed")}</span>
                  <span className="w-20 text-right">
                    {currencySymbol ? `${t("Price/kg")} (${currencySymbol})` : t("Price/kg")}
                  </span>
                  <span className="w-16 text-right">{t("As Fed")}</span>
                  <span className="w-16 text-right">{t("Cost/day")}</span>
                </div>
                {evalReport.feed_breakdown.map((row: FeedBreakdown, i: number) => (
                  <div
                    key={i}
                    className="flex items-center py-2 px-1 border-b last:border-0"
                    style={{ borderColor: COLORS.americanDiamond }}
                  >
                    <span className="flex-1 text-sm" style={{ color: COLORS.raisinBlack }}>
                      {displayFeedName(row)}
                    </span>
                    <span
                      className="w-20 text-right text-sm font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      {fmt(row.price_per_kg)}
                    </span>
                    <span
                      className="w-16 text-right text-sm font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      {fmt(row.quantity_as_fed_kg_per_day, 1)}
                    </span>
                    <span
                      className="w-16 text-right text-sm font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      {fmt(row.total_cost)}
                    </span>
                  </div>
                ))}
              </SCard>
            )}

            {/* Dry Matter Intake */}
            {evalReport.intake_evaluation && (
              <SCard title={t("Dry Matter Intake")} icon={<IcDryMatterIntake />}>
                <div className="flex gap-3 mb-3">
                  <MetricTile
                    label={t("Actual Intake")}
                    value={`${fmt(evalReport.intake_evaluation.actual_intake_kg_per_day, 1)} ${t("kg")}`}
                    unit={t("per day")}
                  />
                  <MetricTile
                    label={t("Target Intake")}
                    value={`${fmt(evalReport.intake_evaluation.target_intake_kg_per_day, 1)} ${t("kg")}`}
                    unit={t("per day")}
                  />
                </div>
                {evalReport.intake_evaluation.intake_status && (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2"
                    style={{ backgroundColor: COLORS.authenticWhite }}
                  >
                    <span className="text-sm font-bold" style={{ color: COLORS.darkSilver }}>
                      {t("Status")}
                    </span>
                    <StatusBadge status={evalReport.intake_evaluation.intake_status} />
                  </div>
                )}
                <BulletList
                  items={evalReport.intake_evaluation.recommendations ?? []}
                  color={COLORS.darkAquamarineGreen}
                />
                <BulletList
                  items={evalReport.intake_evaluation.warnings ?? []}
                  color={COLORS.vividGamboge}
                />
              </SCard>
            )}

            {/* Milk Production Analysis — only relevant for lactating
                animals (Y3 §2.3). Hidden for Dry Cow / Heifer / Calf. */}
            {reportCtx.showMilkProductionSection && evalReport.milk_production_analysis && (
              <SCard title={t("Milk Production Analysis")} icon={<IcMilkProductionAnalysis />}>
                <div className="flex gap-3 mb-3 flex-wrap">
                  <MetricTile
                    label={t("Actual Milk")}
                    value={`${fmt(evalReport.milk_production_analysis.actual_milk_supported_kg_per_day, 1)}`}
                    unit={t("kg/day")}
                  />
                  <MetricTile
                    label={t("Target")}
                    value={`${fmt(evalReport.milk_production_analysis.target_production_kg_per_day, 1)}`}
                    unit={t("kg/day")}
                  />
                  <MetricTile
                    label={t("Energy-Supported")}
                    value={`${fmt(evalReport.milk_production_analysis.milk_supported_by_energy_kg_per_day, 1)}`}
                    unit={t("kg/day")}
                  />
                  <MetricTile
                    label={t("Protein-Supported")}
                    value={`${fmt(evalReport.milk_production_analysis.milk_supported_by_protein_kg_per_day, 1)}`}
                    unit={t("kg/day")}
                  />
                </div>
                {evalReport.milk_production_analysis.limiting_nutrient && (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2"
                    style={{ backgroundColor: COLORS.authenticWhite }}
                  >
                    <span className="text-sm font-bold" style={{ color: COLORS.darkSilver }}>
                      {t("Limiting Nutrient")}
                    </span>
                    <span className="text-sm font-bold" style={{ color: COLORS.carminePink }}>
                      {evalReport.milk_production_analysis.limiting_nutrient}
                    </span>
                  </div>
                )}
                <BulletList
                  items={evalReport.milk_production_analysis.recommendations ?? []}
                  color={COLORS.darkAquamarineGreen}
                />
                <BulletList
                  items={evalReport.milk_production_analysis.warnings ?? []}
                  color={COLORS.vividGamboge}
                />
              </SCard>
            )}

            {/* Nutrient Balance */}
            {evalReport.nutrient_balance && (
              <SCard
                title={t("Nutrient Balance")}
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 17l5-5 4 4 5-7 4 3"
                      stroke={COLORS.darkAquamarineGreen}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
              >
                <BalanceRow
                  label={t("Energy")}
                  value={evalReport.nutrient_balance.energy_balance_mcal}
                  unit={t("Mcal")}
                />
                <BalanceRow
                  label={t("Protein")}
                  value={evalReport.nutrient_balance.protein_balance_kg}
                  unit={t("kg")}
                />
                <BalanceRow
                  label={t("NDF")}
                  value={evalReport.nutrient_balance.ndf_balance_kg}
                  unit={t("kg")}
                />
                <BalanceRow
                  label={t("Calcium")}
                  value={evalReport.nutrient_balance.calcium_balance_kg}
                  unit={t("kg")}
                />
                <BalanceRow
                  label={t("Phosphorus")}
                  value={evalReport.nutrient_balance.phosphorus_balance_kg}
                  unit={t("kg")}
                />
                <div className="mt-3 space-y-2">
                  <BulletList
                    items={evalReport.nutrient_balance.recommendations ?? []}
                    color={COLORS.darkAquamarineGreen}
                  />
                  <BulletList
                    items={evalReport.nutrient_balance.warnings ?? []}
                    color={COLORS.vividGamboge}
                  />
                </div>
              </SCard>
            )}

            {/* Environment Impact */}
            {evalReport.methane_analysis && (
              <SCard
                title={t("Environment Impact")}
                icon={<IcEnvironment size={24} color={COLORS.darkAquamarineGreen} />}
              >
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile
                    label={t("CH₄ Production")}
                    value={`${fmt(evalReport.methane_analysis.methane_production_g_per_day, 1)}`}
                    unit={t("g/day")}
                  />
                  {/* Per kg of ENERGY-CORRECTED MILK — meaningless without
                      milk, so hidden for every non-lactating state (QA row
                      12). The engine still computes it; we just don't show
                      it. */}
                  {reportCtx.showMethaneIntensity && (
                    <MetricTile
                      label={t("CH₄ Intensity")}
                      value={`${fmt(evalReport.methane_analysis.methane_intensity_g_per_kg_ecm, 2)}`}
                      unit={t("g/kg ECM")}
                    />
                  )}
                  <MetricTile
                    label={t("CH₄ Yield")}
                    value={`${fmt(evalReport.methane_analysis.methane_yield_g_per_kg_dmi, 3)}`}
                    unit={t("g/kg DMI")}
                  />
                  <MetricTile
                    label={t("CH₄ Emission")}
                    value={`${fmt(evalReport.methane_analysis.methane_emission_mj_per_day, 1)}`}
                    unit={t("MJ/day")}
                  />
                </div>
                {evalReport.methane_analysis.classification && (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 mt-3"
                    style={{ backgroundColor: COLORS.authenticWhite }}
                  >
                    <span className="text-sm font-bold" style={{ color: COLORS.darkSilver }}>
                      {t("Classification")}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      {evalReport.methane_analysis.classification}
                    </span>
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  <BulletList
                    items={evalReport.methane_analysis.recommendations ?? []}
                    color={COLORS.darkAquamarineGreen}
                  />
                  <BulletList
                    items={evalReport.methane_analysis.warnings ?? []}
                    color={COLORS.vividGamboge}
                  />
                </div>
              </SCard>
            )}
          </>
        )}

        {/* ─── RECOMMENDATION SECTIONS ─── */}
        {!isEval && recReport && (
          <>
            {/* Diet Limit Notes — the backend's top-level `warnings`.
                Advisory, never an error: a soft limit is a TARGET the
                optimizer minimises the breach of, so exceeding it is a
                legitimate outcome and the report is still valid. Shown
                above the solution so the numbers below are read in context.
                Renders nothing when the key is absent or empty. */}
            {softLimitNotes.length > 0 && (
              <SCard
                title={t("Diet Limit Notes")}
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill={COLORS.vividGamboge}>
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 15a1.25 1.25 0 110-2.5A1.25 1.25 0 0112 17zm1-4.75a1 1 0 01-2 0V7a1 1 0 012 0z" />
                  </svg>
                }
              >
                <p className="text-xs mb-2" style={{ color: COLORS.darkSilver }}>
                  {t(
                    "These limits are targets. The diet is still valid — the optimizer kept the difference as small as cost allowed."
                  )}
                </p>
                <BulletList items={softLimitNotes} color={COLORS.vividGamboge} />
              </SCard>
            )}

            {/* Solution Summary — icons sourced directly from Android
                drawables (ic_solution_summary, ic_daily_cost,
                ic_milk_production_20, ic_dm_intake). Hidden when diet
                rating is ERROR_*. */}
            {showSolutionSections && recReport.solution_summary && (
              <SCard
                title={t("Solution Summary")}
                icon={
                  /* ic_solution_summary — clipboard with checkmark */
                  <IcSolutionSummary />
                }
              >
                {/* Daily Cost — ic_daily_cost (filled $ in circle, go_green tint) */}
                {recReport.solution_summary.daily_cost != null && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                      <IcDailyCost />
                      <p className="font-bold" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
                        {t("Daily Cost")}
                      </p>
                    </div>
                    {/* Value + currency code suffix — Android "108,199.8 VND" */}
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 20 }}>
                        {Number(recReport.solution_summary.daily_cost).toFixed(2)}
                      </p>
                      <p style={{ color: COLORS.darkSilver, fontSize: 14 }}>{currencySymbol}</p>
                    </div>
                  </div>
                )}
                {/* Milk Production + Dry Matter Intake — 2 columns */}
                <div className="grid grid-cols-2 gap-x-4">
                  {reportCtx.showSolutionSummaryMilk &&
                    recReport.solution_summary.milk_production &&
                    (() => {
                      const parts = recReport.solution_summary.milk_production.split(" ");
                      return (
                        <div>
                          <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                            {/* ic_milk_production_20 — droplet with notch (azure tint) */}
                            <IcMilkDroplet />
                            <p
                              className="font-bold"
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 12,
                              }}
                            >
                              {t("Milk Production")}
                            </p>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <p
                              className="font-bold"
                              style={{
                                color: COLORS.raisinBlack,
                                fontSize: 20,
                              }}
                            >
                              {parts[0]}
                            </p>
                            <p
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 14,
                              }}
                            >
                              {parts.slice(1).join(" ")}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  {recReport.solution_summary.dry_matter_intake &&
                    (() => {
                      const parts = recReport.solution_summary.dry_matter_intake.split(" ");
                      return (
                        <div>
                          <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                            {/* ic_dm_intake — Material Symbols "grass" (vivid_gamboge tint) */}
                            <IcDmIntakeGrass />
                            <p
                              className="font-bold"
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 12,
                              }}
                            >
                              {t("Dry Matter Intake")}
                            </p>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <p
                              className="font-bold"
                              style={{
                                color: COLORS.raisinBlack,
                                fontSize: 20,
                              }}
                            >
                              {parts[0]}
                            </p>
                            <p
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 14,
                              }}
                            >
                              {parts.slice(1).join(" ")}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                </div>
              </SCard>
            )}

            {/* Cost-Effective Diet — hidden when diet rating is ERROR_*
                (matches FragmentRecommendationReport.kt:218). */}
            {showSolutionSections &&
              recReport.least_cost_diet &&
              recReport.least_cost_diet.length > 0 && (
                <SCard
                  title={t("Cost-Effective Diet")}
                  icon={<IcCostEffectiveDiet />}
                  footer={
                    <div
                      className="flex items-center justify-between"
                      style={{ backgroundColor: COLORS.brightGrayNew, padding: "12px 14px" }}
                    >
                      <span
                        className="font-bold uppercase"
                        style={{
                          color: COLORS.darkAquamarineGreen,
                          fontSize: 12,
                          letterSpacing: 0.5,
                        }}
                      >
                        {t("Total Diet Cost")}
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: COLORS.crayolaGreen, fontSize: 16 }}
                      >
                        {fmt(recTotalCost)} {user?.currency || ""}
                      </span>
                    </div>
                  }
                >
                  <div
                    className="grid items-center py-3 px-2"
                    style={{
                      gridTemplateColumns:
                        "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
                      borderBottom: `1px solid ${COLORS.webDivider}`,
                    }}
                  >
                    <span
                      className="font-bold uppercase"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t("NAME")}
                    </span>
                    <span
                      className="font-bold uppercase text-center"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t("PRICE")}
                    </span>
                    <span
                      className="font-bold uppercase text-center"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t("AF_KG")}
                    </span>
                    <span
                      className="font-bold uppercase text-right"
                      style={{
                        color: COLORS.darkSilver,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t("COST")}
                    </span>
                  </div>
                  {recReport.least_cost_diet.map((row: CostEffectiveDiet, i: number) => (
                    <div
                      key={i}
                      className="grid items-center py-3 px-2"
                      style={{
                        gridTemplateColumns:
                          "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
                        borderBottom: `1px solid ${COLORS.americanDiamond}`,
                      }}
                    >
                      <span
                        className="font-bold"
                        style={{ color: COLORS.raisinBlack, fontSize: 14 }}
                      >
                        {displayFeedName(row)}
                      </span>
                      <span
                        className="text-center"
                        style={{ color: COLORS.raisinBlack, fontSize: 14 }}
                      >
                        {fmt(row.price_per_kg, 0)}
                      </span>
                      <span
                        className="text-center"
                        style={{ color: COLORS.raisinBlack, fontSize: 14 }}
                      >
                        {fmt(row.quantity_kg_per_day, 2)}
                      </span>
                      <span
                        className="text-right font-bold"
                        style={{ color: COLORS.crayolaGreen, fontSize: 14 }}
                      >
                        {fmt(row.daily_cost, 0)}
                      </span>
                    </div>
                  ))}
                </SCard>
              )}

            {/* Environmental Impact — also hidden when diet rating is
                ERROR_* (matches FragmentRecommendationReport.kt:219). */}
            {showSolutionSections &&
              recReport.environmental_impact &&
              (() => {
                const env = recReport.environmental_impact;
                const productionVal = Number(env.methane_production_grams_per_day ?? 0);
                const yieldVal = Number(env.methane_yield_grams_per_kg_dmi ?? 0);
                const intensityVal = Number(env.methane_intensity_grams_per_kg_ecm ?? 0);
                const envRaw = env as unknown as Record<string, unknown>;
                const ymVal = Number(
                  env["Ym (%)"] ??
                    (envRaw.methane_conversion_rate_percent as number | string | undefined) ??
                    0
                );
                return (
                  <SCard
                    title={t("Environmental Impact")}
                    icon={<IcEnvironment size={24} color={COLORS.darkAquamarineGreen} />}
                  >
                    {/* Methane Production */}
                    <div className="flex items-center justify-between mt-1">
                      <p
                        className="font-bold uppercase"
                        style={{ color: COLORS.darkSilver, fontSize: 12 }}
                      >
                        {t("Methane Production")}
                      </p>
                      <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                        {fmt(productionVal, 2)} {t("g/day")}
                      </p>
                    </div>
                    <MethaneBar
                      progress={calcPct(productionVal, MAX_METHANE_PRODUCTION)}
                      color={COLORS.crayolaGreen}
                    />

                    {/* Methane Yield */}
                    <div className="flex items-center justify-between mt-4">
                      <p
                        className="font-bold uppercase"
                        style={{ color: COLORS.darkSilver, fontSize: 12 }}
                      >
                        {t("Methane Yield")}
                      </p>
                      <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                        {fmt(yieldVal, 2)} {t("g/kg DMI")}
                      </p>
                    </div>
                    <MethaneBar
                      progress={calcPct(yieldVal, MAX_METHANE_YIELD)}
                      color={COLORS.darkAquamarineGreen}
                    />

                    {/* Methane Intensity — per kg of ENERGY-CORRECTED MILK,
                        so it is only shown for a Lactating Cow (QA row 12).
                        The engine still calculates it for the other states;
                        it just isn't displayed for them. */}
                    {reportCtx.showMethaneIntensity && (
                      <>
                        <div className="flex items-center justify-between mt-4">
                          <p
                            className="font-bold uppercase"
                            style={{
                              color: COLORS.darkSilver,
                              fontSize: 12,
                            }}
                          >
                            {t("Methane Intensity")}
                          </p>
                          <p
                            className="font-bold"
                            style={{
                              color: COLORS.raisinBlack,
                              fontSize: 16,
                            }}
                          >
                            {fmt(intensityVal, 2)} {t("g/kg ECM")}
                          </p>
                        </div>
                        <MethaneBar
                          progress={calcPct(intensityVal, MAX_METHANE_INTENSITY)}
                          color={COLORS.celticBlue}
                        />
                      </>
                    )}

                    {/* Methane Conversion Rate (Ym %) */}
                    <div className="flex items-center justify-between mt-4">
                      <p
                        className="font-bold uppercase"
                        style={{ color: COLORS.darkSilver, fontSize: 12 }}
                      >
                        {t("Methane Conversion Rate (Ym %)")}
                      </p>
                      <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                        {fmt(ymVal, 2)} %
                      </p>
                    </div>
                    <MethaneBar
                      progress={calcPct(ymVal, MAX_YM_PERCENT)}
                      color={COLORS.vividGamboge}
                    />

                    {/* Classification banner */}
                    {env.classification && (
                      <div
                        className="flex items-center gap-3 mt-5"
                        style={{
                          backgroundColor: COLORS.water,
                          border: "1px solid rgba(41,108,211,0.25)",
                          borderRadius: 16,
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          className="flex items-center justify-center flex-shrink-0"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            backgroundColor: COLORS.ultramarine,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill={COLORS.white}>
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-6h2zm0-8h-2V6h2z" />
                          </svg>
                        </div>
                        <div>
                          <p
                            className="font-bold uppercase"
                            style={{
                              color: COLORS.ultramarine,
                              fontSize: 12,
                              letterSpacing: 0.5,
                            }}
                          >
                            {t("Classification")}
                          </p>
                          <p
                            className="font-bold"
                            style={{
                              color: COLORS.ultramarine,
                              fontSize: 16,
                            }}
                          >
                            {env.classification}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Ym footnote */}
                    <p
                      style={{
                        color: COLORS.ultramarine,
                        fontSize: 12,
                        marginTop: 12,
                      }}
                    >
                      {t("* Ym (%) = percentage of energy intake lost as methane.")}
                    </p>
                  </SCard>
                );
              })()}

            {/* Notes — Android layout_additional_information.
                Hidden entirely when dietRating resolves to OPTIMAL / else
                (FragmentRecommendationReport.kt:232 hides
                layoutAdditionalInformation). Otherwise renders a Simulation
                Status banner themed by dietRating, then optionally the
                Optimization Summary (violated_parameters) and the
                Recommendations & Warnings list. */}
            {showNotesCard && recReport.additional_information && (
              <SCard title={t("Notes")} icon={<IcNotes />}>
                {/* SIMULATION STATUS banner — colored by dietRating */}
                <div
                  className="flex items-center gap-3"
                  style={{
                    backgroundColor: banner.bg,
                    border: `1px solid ${banner.stroke}`,
                    borderRadius: 14,
                    padding: 10,
                  }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: banner.iconBg,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={COLORS.white}>
                      {isErrorState ? (
                        // X (no solution)
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4 14.59L14.59 18 12 15.41 9.41 18 8 16.59 10.59 14 8 11.41 9.41 10 12 12.59 14.59 10 16 11.41 13.41 14 16 16.59z" />
                      ) : isAdvisory ? (
                        // i (info)
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-6h2zm0-8h-2V6h2z" />
                      ) : (
                        // ✓ check (optimal / infeasible-with-solution)
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8z" />
                      )}
                    </svg>
                  </div>
                  <div>
                    <p
                      className="font-bold uppercase"
                      style={{
                        color: banner.titleColor,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t("Simulation Status")}
                    </p>
                    <p
                      style={{
                        color: banner.bodyColor,
                        fontSize: 14,
                      }}
                    >
                      {t(banner.statusText)}
                    </p>
                  </div>
                </div>

                {/* Violated Parameters (osPoints) — only when non-empty,
                    matching FragmentRecommendationReport.kt:260-262
                    which hides layoutOptimizationSummary when osPoints
                    is empty. */}
                {osPoints.length > 0 && (
                  <>
                    <p
                      className="font-bold"
                      style={{
                        color: COLORS.raisinBlack,
                        fontSize: 14,
                        marginTop: 16,
                      }}
                    >
                      {t("Violated Parameters:")}
                    </p>
                    <div className="mt-3 space-y-3">
                      {osPoints.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div
                            className="flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: "rgba(5,188,109,0.15)",
                              borderRadius: 10,
                              padding: 6,
                              marginTop: 2,
                            }}
                          >
                            <IcViolatedParameter />
                          </div>
                          <p
                            style={{
                              color: COLORS.raisinBlack,
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {item}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Recommendations & Warnings — always rendered (Android
                    falls back to "No recommendation/warnings available!"
                    when both lists are empty). */}
                <p
                  className="font-bold"
                  style={{
                    color: COLORS.raisinBlack,
                    fontSize: 14,
                    marginTop: 16,
                    marginBottom: 8,
                  }}
                >
                  {t("Recommendations & Warnings:")}
                </p>
                <BulletList
                  items={rwDisplay}
                  color={rwPoints.length === 0 ? COLORS.darkSilver : COLORS.darkAquamarineGreen}
                />
              </SCard>
            )}
          </>
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
              color: "white",
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
                  text: `${isEval ? t("Evaluation") : t("Recommendation")} ${t("report for simulation")} ${simulationId}`,
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
                color: "white",
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
              background: "white",
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
              color: isSaving || !reportIdForSave ? COLORS.spanishGray : "white",
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
                <IcSave size={18} color={!reportIdForSave ? COLORS.spanishGray : "white"} />
                {t("Save Report")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
