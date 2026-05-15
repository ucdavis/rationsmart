"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { saveReport } from "@/lib/api";
import type { EvaluationResponse, RecommendationResponse, FeedBreakdown, CostEffectiveDiet } from "@/lib/api";
import { IcSave, IcNewCase, IcAnimalCharacteristics, IcEnvironment, IcSimulationDetails } from "@/components/Icons";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    Optimized: { bg: "#05BC6D", text: "#fff" },
    Optimised: { bg: "#05BC6D", text: "#fff" },
    "Not Optimized": { bg: "#E44A4A", text: "#fff" },
    "Not Feasible": { bg: "#E44A4A", text: "#fff" },
    Evaluation: { bg: "#FF9800", text: "#fff" },
    Evaluated: { bg: "#FF9800", text: "#fff" },
    ADVISORY: { bg: "#FF9800", text: "#fff" },
    INFEASIBLE: { bg: "#E44A4A", text: "#fff" },
    OPTIMAL: { bg: "#05BC6D", text: "#fff" },
  };
  const colors = map[status] ?? { bg: "#E2E8F0", text: "#231F20" };
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
      style={{ backgroundColor: colors.bg, color: colors.text, fontFamily: "Nunito, sans-serif" }}
    >
      {status}
    </span>
  );
}

// Card header — matches Android layout_*_report cards: icon in a
// go_green_15 (rgba(5,188,109,0.15)) pill with a dark_aquamarine_green
// tinted icon (24dp inside 6dp content padding, corner 10), then title
// bold font_16 raisin_black to the right.
function SCard({
  title,
  icon,
  footer,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-3 my-2 bg-white overflow-hidden"
      style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      {title && (
        <div className="flex items-center gap-2.5" style={{ padding: "10px 10px 14px" }}>
          {icon && (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(5,188,109,0.15)", borderRadius: 10, padding: 6 }}
            >
              {icon}
            </div>
          )}
          <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
            {title}
          </p>
        </div>
      )}
      <div style={{ paddingInline: 10, paddingBottom: 10 }}>{children}</div>
      {footer}
    </div>
  );
}

// Label/value pair as used by layout_animal_characteristics_report:
// label = nunito_bold, font_12, dark_silver; value = nunito_bold,
// font_16, raisin_black.
function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>
        {label}
      </p>
      <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, marginTop: 4 }}>
        {value}
      </p>
    </div>
  );
}

// Progress bar — Android LinearProgressIndicator with trackCornerRadius=6
// and small filled circles at both ends. Track is the same color as the
// indicator but at ~15% alpha. The dots draw at the actual progress
// position and at the right end.
function MethaneBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 6,
        borderRadius: 6,
        backgroundColor: `${color}26`,
        marginTop: 6,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 6,
          backgroundColor: color,
          transition: "width 0.3s",
        }}
      />
      {/* Cap dot at end of fill */}
      <span
        style={{
          position: "absolute",
          left: `calc(${pct}% - 4px)`,
          top: -1,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      {/* Cap dot at right end of track */}
      <span
        style={{
          position: "absolute",
          right: -1,
          top: -1,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </div>
  );
}

// Android MethaneUiRanges constants (utils/MethaneUiRanges.kt)
const MAX_METHANE_PRODUCTION = 1000.0; // g/day
const MAX_METHANE_YIELD = 100.0;       // g/kg DMI
const MAX_METHANE_INTENSITY = 100.0;   // g/kg ECM
const MAX_YM_PERCENT = 100.0;          // %
const calcPct = (v: number | string | null | undefined, max: number) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, (n / max) * 100);
};

function MetricTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      className="flex-1 rounded-xl p-3 text-center"
      style={{ backgroundColor: "#F0FDF4" }}
    >
      <p className="text-xs font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{value}</p>
      {unit && <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{unit}</p>}
    </div>
  );
}

function BalanceRow({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: "#F1F5F9" }}>
      <span className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{label}</span>
      <span
        className="text-sm font-bold"
        style={{ color: isPositive ? "#05BC6D" : "#E44A4A", fontFamily: "Nunito, sans-serif" }}
      >
        {isPositive ? "+" : ""}{Number(value).toFixed(3)} {unit}
      </span>
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TotalCostFooter({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ backgroundColor: "#F0FDF4", paddingInline: 10, paddingBlock: 12 }}
    >
      <span className="text-xs font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
        {label}
      </span>
      <span className="font-bold" style={{ color: "#087F23", fontSize: 18, fontFamily: "Nunito, sans-serif" }}>
        {value}
      </span>
    </div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const { user, cattleInfo, reportData, showSnackbar, setFeedSelectionType, setFeedSelections } = useStore((s) => ({
    user: s.user,
    cattleInfo: s.cattleInfo,
    reportData: s.reportData,
    showSnackbar: s.showSnackbar,
    setFeedSelectionType: s.setFeedSelectionType,
    setFeedSelections: s.setFeedSelections,
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Use the user's / report's currency CODE (PHP / INR / VND / …)
  // directly. Android renders totals as e.g. "108,199.8 VND" — value
  // with the code as a suffix — rather than swapping in a glyph.
  const currencySymbol = (() => {
    const reportCurrency =
      (reportData as EvaluationResponse)?.cost_analysis?.currency ??
      (reportData as EvaluationResponse)?.currency ??
      null;
    return user?.currency || reportCurrency || "";
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
        style={{ backgroundColor: "#F8FAF9" }}
      >
        <Toolbar type="back" title="Diet Report" onBack={() => router.back()} />
        <div
          className="flex items-center justify-center rounded-full mb-5 mt-10"
          style={{ width: 80, height: 80, backgroundColor: "#F0FDF4" }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="5" y="4" width="26" height="28" rx="3" stroke="#064E3B" strokeWidth="2" />
            <path d="M11 12H25M11 17H22M11 22H17" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-xl font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
          No Report
        </p>
        <p className="text-sm mb-8" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          Generate a report from the Feed Selection screen
        </p>
        <button
          onClick={() => router.push("/feed-selection")}
          className="px-8 py-4 rounded-xl font-bold text-base text-white"
          style={{ backgroundColor: "#064E3B", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
        >
          Go to Feed Selection
        </button>
      </div>
    );
  }

  const report = reportData;
  const isEval = report.mode === "evaluation";
  const evalReport = isEval ? (report as EvaluationResponse) : null;
  const recReport = !isEval ? (report as RecommendationResponse) : null;

  const statusLabel = isEval
    ? (evalReport?.evaluation_summary?.overall_status ?? "Evaluated")
    : (recReport?.report_info?.diet_rating ?? "—");

  const reportIdForSave = isEval
    ? (evalReport?.report_id ?? "")
    : (recReport?.report_info?.report_id ?? "");

  const handleSave = async () => {
    if (!user || !reportIdForSave) {
      showSnackbar("Report not ready — generate a report first", "info");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveReport(reportIdForSave, user.id);
      const url: string | null =
        res.data?.bucket_url ??
        res.data?.report?.bucket_url ??
        res.data?.pdf_url ??
        null;
      setPdfUrl(url);
      showSnackbar("Report saved successfully!", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save report";
      showSnackbar(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Android Ext.toReportDisplayDate renders as e.g. "May 13, 2026 at 07:32 AM".
  const formatReportDate = (raw?: string | null) => {
    const d = raw ? new Date(raw) : new Date();
    if (isNaN(d.getTime())) return "—";
    const datePart = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
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
  const isErrorState = dietRating === "ERROR_NO_BEST" || dietRating === "ERROR_PRECHECK" || dietRating === "ERROR_NO_RESULT";
  const isAdvisory = dietRating === "ADVISORY";
  const isInfeasible = dietRating === "INFEASIBLE";
  const isOptimalOrUnknown = !isErrorState && !isAdvisory && !isInfeasible;
  // Per Android: hide solution/cost/env when there is no feasible solution.
  const showSolutionSections = !isErrorState;
  // Per Android: hide the entire Notes card when dietRating is OPTIMAL / else.
  const showNotesCard = !isOptimalOrUnknown;

  type BannerTheme = { bg: string; stroke: string; iconBg: string; titleColor: string; bodyColor: string; statusText: string };
  const banner: BannerTheme = (() => {
    if (isAdvisory) {
      return {
        bg: "rgba(255,152,0,0.15)",        // vivid_gamboge_15
        stroke: "rgba(255,152,0,0.30)",    // vivid_gamboge_30
        iconBg: "#FFB300",                  // dark_yellow
        titleColor: "#FF7800",              // fire_orange
        bodyColor: "#FF9800",               // vivid_gamboge
        statusText: "Solution has safety/nutritional violations",
      };
    }
    if (isErrorState) {
      return {
        bg: "#FEC5BB",                       // peachy_pink
        stroke: "rgba(228,74,74,0.20)",     // carmine_pink_20
        iconBg: "#E44A4A",                  // red_shimmer
        titleColor: "#FC2E20",              // red_ryb
        bodyColor: "#E44A4A",               // carmine_pink
        statusText: "No optimized solution found",
      };
    }
    if (isInfeasible) {
      return {
        bg: "#F0FDF4",                       // honeydew
        stroke: "rgba(5,188,109,0.15)",     // go_green_15
        iconBg: "#10B981",                  // dark_green_turquoise
        titleColor: "#1CA069",              // la_salle_green
        bodyColor: "#064E3B",               // dark_aquamarine_green
        statusText: "Solution has safety/nutritional violations",
      };
    }
    // Optimal / else
    return {
      bg: "#F0FDF4",
      stroke: "rgba(5,188,109,0.15)",
      iconBg: "#10B981",
      titleColor: "#1CA069",
      bodyColor: "#064E3B",
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
  const rwDisplay = rwPoints.length === 0 ? ["No recommendation/warnings available!"] : rwPoints;

  // Total cost sums for footers
  const recTotalCost = recReport?.least_cost_diet
    ? recReport.least_cost_diet.reduce((sum: number, r: CostEffectiveDiet) => sum + (Number(r.daily_cost) || 0), 0)
    : 0;

  const evalTotalCost = evalReport?.feed_breakdown
    ? evalReport.feed_breakdown.reduce((sum: number, r: FeedBreakdown) => sum + (Number(r.total_cost) || 0), 0)
    : 0;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar
        type="back"
        title={isEval ? "Evaluation Report" : "Recommendation Report"}
        onBack={() => router.back()}
      />

      <div className="flex-1 overflow-y-auto pb-28">
        {/* Section 1: Report Details — matches Android layout_report:
            REPORT ID | SIMULATION ID, OWNER NAME (full), GENERATED ON (full).
            No Status badge — Android does not show one here. */}
        <SCard title="Report Details" icon={<IcSimulationDetails size={24} color="#064E3B" />}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <LabelValue label="Report ID" value={reportIdForSave || "N/A"} />
            <LabelValue label="Simulation ID" value={simulationId || "N/A"} />
            <div className="col-span-2">
              <LabelValue label="Owner Name" value={ownerName || "N/A"} />
            </div>
            <div className="col-span-2">
              <LabelValue label="Generated On" value={generatedOn} />
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
          <SCard title="Animal Characteristics" icon={<IcAnimalCharacteristics size={24} color="#064E3B" />}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <LabelValue label="Breed" value={cattleInfo.breed || "N/A"} />
              <LabelValue label="Body Weight" value={`${cattleInfo.body_weight} Kg`} />
              <LabelValue label="Body Condition Score" value={`${cattleInfo.body_condition_score}`} />
              <LabelValue label="Daily BW Gain" value={`${cattleInfo.body_weight_gain} kg/day`} />
              <LabelValue label="Parity" value={`${cattleInfo.parity}`} />
              <LabelValue label="Days in Milk" value={`${cattleInfo.days_in_milk} Days`} />
              <LabelValue label="Days of Pregnancy" value={`${cattleInfo.days_of_pregnancy} Days`} />
              <LabelValue label="Temperature" value={`${cattleInfo.average_temperature} °C`} />
              <LabelValue
                label="Distance"
                value={cattleInfo.grazing ? `${Number(cattleInfo.distance ?? 0).toFixed(2)} km` : "0.00 km"}
              />
              <LabelValue label="Topography" value={cattleInfo.grazing ? (cattleInfo.topography || "N/A") : "Not Selected"} />
              <LabelValue label="Milk Production" value={`${cattleInfo.milk_production} Liter`} />
              <LabelValue label="Milk Protein %" value={`${cattleInfo.milk_protein_percent} %`} />
              <div className="col-span-2">
                <LabelValue label="Milk Fat %" value={`${cattleInfo.milk_fat_percent} %`} />
              </div>
            </div>
          </SCard>
        )}

        {/* ─── EVALUATION SECTIONS ─── */}
        {isEval && evalReport && (
          <>
            {/* Evaluation Summary */}
            {evalReport.evaluation_summary && (evalReport.evaluation_summary.overall_status || evalReport.evaluation_summary.limiting_factor) && (
              <SCard title="Evaluation Summary" icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="3" width="16" height="18" rx="2" stroke="#064E3B" strokeWidth="1.8" />
                  <path d="M8 9l2 2 4-4M8 14h5M8 17h3" stroke="#064E3B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }>
                {evalReport.evaluation_summary.overall_status && (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Overall Status</span>
                    <StatusBadge status={evalReport.evaluation_summary.overall_status} />
                  </div>
                )}
                {evalReport.evaluation_summary.limiting_factor && (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Limiting Factor</span>
                    <span className="text-sm font-bold" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>{evalReport.evaluation_summary.limiting_factor}</span>
                  </div>
                )}
              </SCard>
            )}

            {/* Cost Analysis */}
            <SCard title="Cost Analysis" icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#064E3B" strokeWidth="1.8" />
                <path d="M12 7.5V9M12 15v1.5M9.5 10.5a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2.5-2.5 4" stroke="#064E3B" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }>
              <div className="flex gap-3 mb-3">
                <MetricTile
                  label="Total Diet Cost"
                  value={`${fmt(evalReport.cost_analysis?.total_diet_cost_as_fed)}${currencySuffix}`}
                  unit=""
                />
                <MetricTile
                  label="Cost/Litre Milk"
                  value={`${fmt(evalReport.cost_analysis?.feed_cost_per_kg_milk)}${currencySuffix}`}
                  unit="per litre"
                />
              </div>
              {(evalReport.cost_analysis?.recommendations?.length > 0 || (evalReport.cost_analysis?.warnings?.length ?? 0) > 0) && (
                <div className="mt-2 space-y-2">
                  <BulletList items={evalReport.cost_analysis?.recommendations ?? []} color="#064E3B" />
                  <BulletList items={evalReport.cost_analysis?.warnings ?? []} color="#FF9800" />
                </div>
              )}
            </SCard>

            {/* Feed Breakdown */}
            {evalReport.feed_breakdown && evalReport.feed_breakdown.length > 0 && (
              <SCard
                title="Feed Breakdown"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="#064E3B" strokeWidth="1.8" />
                    <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="#064E3B" strokeWidth="1.8" />
                    <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="#064E3B" strokeWidth="1.8" />
                    <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="#064E3B" strokeWidth="1.8" />
                  </svg>
                }
                footer={
                  <TotalCostFooter
                    label="Total Diet Cost"
                    value={`${fmt(evalTotalCost)}${currencySuffix}`}
                  />
                }
              >
                <div
                  className="flex text-xs font-bold py-2 px-1 rounded-lg mb-1"
                  style={{ backgroundColor: "#F1F5F9", color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  <span className="flex-1">Feed</span>
                  <span className="w-20 text-right">{currencySymbol ? `Price/kg (${currencySymbol})` : "Price/kg"}</span>
                  <span className="w-16 text-right">As Fed</span>
                  <span className="w-16 text-right">Cost/day</span>
                </div>
                {evalReport.feed_breakdown.map((row: FeedBreakdown, i: number) => (
                  <div
                    key={i}
                    className="flex items-center py-2 px-1 border-b last:border-0"
                    style={{ borderColor: "#F1F5F9" }}
                  >
                    <span className="flex-1 text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{row.feed_name}</span>
                    <span className="w-20 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{fmt(row.price_per_kg)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{fmt(row.quantity_as_fed_kg_per_day, 1)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{fmt(row.total_cost)}</span>
                  </div>
                ))}
              </SCard>
            )}

            {/* Dry Matter Intake */}
            {evalReport.intake_evaluation && (
              <SCard title="Dry Matter Intake" icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3C7 3 3 7.5 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="#064E3B" strokeWidth="1.8" />
                  <path d="M12 8v4l3 2" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              }>
                <div className="flex gap-3 mb-3">
                  <MetricTile label="Actual Intake" value={`${fmt(evalReport.intake_evaluation.actual_intake_kg_per_day, 1)} kg`} unit="per day" />
                  <MetricTile label="Target Intake" value={`${fmt(evalReport.intake_evaluation.target_intake_kg_per_day, 1)} kg`} unit="per day" />
                </div>
                {evalReport.intake_evaluation.intake_status && (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Status</span>
                    <StatusBadge status={evalReport.intake_evaluation.intake_status} />
                  </div>
                )}
                <BulletList items={evalReport.intake_evaluation.recommendations ?? []} color="#064E3B" />
                <BulletList items={evalReport.intake_evaluation.warnings ?? []} color="#FF9800" />
              </SCard>
            )}

            {/* Milk Production Analysis */}
            {evalReport.milk_production_analysis && (
              <SCard title="Milk Production Analysis" icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M8 3h8l1 4H7L8 3z" stroke="#064E3B" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M6 7c0 0-2 3-2 7a8 8 0 0 0 16 0c0-4-2-7-2-7" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M10 14a3 3 0 0 0 4 0" stroke="#064E3B" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              }>
                <div className="flex gap-3 mb-3 flex-wrap">
                  <MetricTile
                    label="Actual Milk"
                    value={`${fmt(evalReport.milk_production_analysis.actual_milk_supported_kg_per_day, 1)}`}
                    unit="kg/day"
                  />
                  <MetricTile
                    label="Target"
                    value={`${fmt(evalReport.milk_production_analysis.target_production_kg_per_day, 1)}`}
                    unit="kg/day"
                  />
                  <MetricTile
                    label="Energy-Supported"
                    value={`${fmt(evalReport.milk_production_analysis.milk_supported_by_energy_kg_per_day, 1)}`}
                    unit="kg/day"
                  />
                  <MetricTile
                    label="Protein-Supported"
                    value={`${fmt(evalReport.milk_production_analysis.milk_supported_by_protein_kg_per_day, 1)}`}
                    unit="kg/day"
                  />
                </div>
                {evalReport.milk_production_analysis.limiting_nutrient && (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Limiting Nutrient</span>
                    <span className="text-sm font-bold" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>{evalReport.milk_production_analysis.limiting_nutrient}</span>
                  </div>
                )}
                <BulletList items={evalReport.milk_production_analysis.recommendations ?? []} color="#064E3B" />
                <BulletList items={evalReport.milk_production_analysis.warnings ?? []} color="#FF9800" />
              </SCard>
            )}

            {/* Nutrient Balance */}
            {evalReport.nutrient_balance && (
              <SCard title="Nutrient Balance" icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l5-5 4 4 5-7 4 3" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }>
                <BalanceRow label="Energy" value={evalReport.nutrient_balance.energy_balance_mcal} unit="Mcal" />
                <BalanceRow label="Protein" value={evalReport.nutrient_balance.protein_balance_kg} unit="kg" />
                <BalanceRow label="NDF" value={evalReport.nutrient_balance.ndf_balance_kg} unit="kg" />
                <BalanceRow label="Calcium" value={evalReport.nutrient_balance.calcium_balance_kg} unit="kg" />
                <BalanceRow label="Phosphorus" value={evalReport.nutrient_balance.phosphorus_balance_kg} unit="kg" />
                <div className="mt-3 space-y-2">
                  <BulletList items={evalReport.nutrient_balance.recommendations ?? []} color="#064E3B" />
                  <BulletList items={evalReport.nutrient_balance.warnings ?? []} color="#FF9800" />
                </div>
              </SCard>
            )}

            {/* Environment Impact */}
            {evalReport.methane_analysis && (
              <SCard title="Environment Impact" icon={<IcEnvironment size={24} color="#064E3B" />}>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="CH₄ Production" value={`${fmt(evalReport.methane_analysis.methane_production_g_per_day, 1)}`} unit="g/day" />
                  <MetricTile label="CH₄ Intensity" value={`${fmt(evalReport.methane_analysis.methane_intensity_g_per_kg_ecm, 2)}`} unit="g/kg ECM" />
                  <MetricTile label="CH₄ Yield" value={`${fmt(evalReport.methane_analysis.methane_yield_g_per_kg_dmi, 3)}`} unit="g/kg DMI" />
                  <MetricTile label="CH₄ Emission" value={`${fmt(evalReport.methane_analysis.methane_emission_mj_per_day, 1)}`} unit="MJ/day" />
                </div>
                {evalReport.methane_analysis.classification && (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mt-3" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Classification</span>
                    <span className="text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{evalReport.methane_analysis.classification}</span>
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  <BulletList items={evalReport.methane_analysis.recommendations ?? []} color="#064E3B" />
                  <BulletList items={evalReport.methane_analysis.warnings ?? []} color="#FF9800" />
                </div>
              </SCard>
            )}
          </>
        )}

        {/* ─── RECOMMENDATION SECTIONS ─── */}
        {!isEval && recReport && (
          <>
            {/* Solution Summary — icons sourced directly from Android
                drawables (ic_solution_summary, ic_daily_cost,
                ic_milk_production_20, ic_dm_intake). Hidden when diet
                rating is ERROR_*. */}
            {showSolutionSections && recReport.solution_summary && (
              <SCard
                title="Solution Summary"
                icon={
                  /* ic_solution_summary — clipboard with checkmark */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#064E3B">
                    <path d="M18,12c-3.314,0 -6,2.686 -6,6s2.686,6 6,6 6,-2.686 6,-6 -2.686,-6 -6,-6ZM21.683,17.712l-2.703,2.614c-0.452,0.446 -1.052,0.671 -1.653,0.671s-1.203,-0.225 -1.663,-0.674l-1.354,-1.332c-0.395,-0.387 -0.4,-1.02 -0.014,-1.414 0.386,-0.395 1.019,-0.401 1.414,-0.014l1.354,1.331c0.144,0.142 0.38,0.139 0.522,-0.002l2.713,-2.624c0.397,-0.381 1.031,-0.37 1.414,0.029 0.382,0.398 0.369,1.031 -0.029,1.414ZM10,18c0,-4.411 3.589,-8 8,-8 0.692,0 1.359,0.097 2,0.263v-3.263c0,-2.045 -1.237,-3.802 -3,-4.576L17,1c0,-0.552 -0.447,-1 -1,-1s-1,0.448 -1,1v1h-2L13,1c0,-0.552 -0.447,-1 -1,-1s-1,0.448 -1,1v1h-2L9,1c0,-0.552 -0.447,-1 -1,-1s-1,0.448 -1,1v1h-2L5,1c0,-0.552 -0.447,-1 -1,-1s-1,0.448 -1,1v1.424C1.237,3.198 0,4.955 0,7v12c0,2.757 2.243,5 5,5h7.726c-1.667,-1.467 -2.726,-3.61 -2.726,-6ZM5,7L15,7c0.553,0 1,0.448 1,1s-0.447,1 -1,1L5,9c-0.553,0 -1,-0.448 -1,-1s0.447,-1 1,-1ZM8.5,13h-3.5c-0.553,0 -1,-0.448 -1,-1s0.447,-1 1,-1h3.5c0.553,0 1,0.448 1,1s-0.447,1 -1,1Z" />
                  </svg>
                }
              >
                {/* Daily Cost — ic_daily_cost (filled $ in circle, go_green tint) */}
                {recReport.solution_summary.daily_cost != null && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#05BC6D">
                        <path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10s10,-4.48 10,-10S17.52,2 12,2zM12.88,17.76v0.36c0,0.48 -0.39,0.88 -0.88,0.88h0c-0.48,0 -0.88,-0.39 -0.88,-0.88v-0.42c-0.63,-0.15 -1.93,-0.61 -2.69,-2.1c-0.23,-0.44 -0.01,-0.99 0.45,-1.18l0.07,-0.03c0.41,-0.17 0.87,0 1.08,0.39c0.32,0.61 0.95,1.37 2.12,1.37c0.93,0 1.98,-0.48 1.98,-1.61c0,-0.96 -0.7,-1.46 -2.28,-2.03c-1.1,-0.39 -3.35,-1.03 -3.35,-3.31c0,-0.1 0.01,-2.4 2.62,-2.96V5.88C11.12,5.39 11.52,5 12,5h0c0.48,0 0.88,0.39 0.88,0.88v0.37c1.07,0.19 1.75,0.76 2.16,1.3c0.34,0.44 0.16,1.08 -0.36,1.3l0,0C14.32,9 13.9,8.88 13.66,8.57c-0.28,-0.38 -0.78,-0.77 -1.6,-0.77c-0.7,0 -1.81,0.37 -1.81,1.39c0,0.95 0.86,1.31 2.64,1.9c2.4,0.83 3.01,2.05 3.01,3.45C15.9,17.17 13.4,17.67 12.88,17.76z" />
                      </svg>
                      <p className="font-bold" style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Daily Cost</p>
                    </div>
                    {/* Value + currency code suffix — Android "108,199.8 VND" */}
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-bold" style={{ color: "#231F20", fontSize: 20, fontFamily: "Nunito, sans-serif" }}>
                        {Number(recReport.solution_summary.daily_cost).toFixed(2)}
                      </p>
                      <p style={{ color: "#6D6D6D", fontSize: 14, fontFamily: "Nunito, sans-serif" }}>
                        {currencySymbol}
                      </p>
                    </div>
                  </div>
                )}
                {/* Milk Production + Dry Matter Intake — 2 columns */}
                <div className="grid grid-cols-2 gap-x-4">
                  {recReport.solution_summary.milk_production && (() => {
                    const parts = recReport.solution_summary.milk_production.split(" ");
                    return (
                      <div>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                          {/* ic_milk_production_20 — droplet with notch (azure tint) */}
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="#007BFF">
                            <path d="M10.65,2.55c-0.38,-0.33 -0.93,-0.33 -1.31,0C7.7,4 3.5,8.01 3.5,11.5c0,3.59 2.91,6.5 6.5,6.5s6.5,-2.91 6.5,-6.5C16.5,8.01 12.3,4 10.65,2.55zM7.03,11.93c0.24,1.66 1.79,2.77 3.4,2.54c0.3,-0.04 0.57,0.19 0.57,0.49c0,0.28 -0.2,0.47 -0.42,0.5c-2.23,0.31 -4.22,-1.23 -4.54,-3.39C6,11.77 6.23,11.5 6.54,11.5C6.79,11.5 7,11.68 7.03,11.93z" />
                          </svg>
                          <p className="font-bold" style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Milk Production</p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <p className="font-bold" style={{ color: "#231F20", fontSize: 20, fontFamily: "Nunito, sans-serif" }}>{parts[0]}</p>
                          <p style={{ color: "#6D6D6D", fontSize: 14, fontFamily: "Nunito, sans-serif" }}>{parts.slice(1).join(" ")}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {recReport.solution_summary.dry_matter_intake && (() => {
                    const parts = recReport.solution_summary.dry_matter_intake.split(" ");
                    return (
                      <div>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                          {/* ic_dm_intake — Material Symbols "grass" (vivid_gamboge tint) */}
                          <svg width="20" height="20" viewBox="0 0 960 960" fill="#FF9800">
                            <path d="M120,800q-17,0 -28.5,-11.5T80,760q0,-17 11.5,-28.5T120,720h190q-17,-63 -56,-114t-94,-83q-22,-13 -21,-28.5t27,-14.5q131,2 222.5,95T480,800L120,800ZM560,800q0,-42 -9,-83.5T525,637q42,-69 112.5,-112T794,480q24,-1 25,15.5T800,523q-55,32 -94,83t-56,114h190q17,0 28.5,11.5T880,760q0,17 -11.5,28.5T840,800L560,800ZM480,561q0,-106 60.5,-188.5T696,258q23,-8 34,5t-9,32q-32,30 -55.5,67T626,441q-44,21 -80.5,51.5T480,561ZM407,486q-12,-9 -24,-17t-25,-16q0,-6 1,-12.5t1,-12.5q0,-53 -11.5,-101T315,234q-11,-22 1.5,-32.5T349,207q36,29 63.5,66t44.5,81q-18,30 -31,63.5T407,486Z" />
                          </svg>
                          <p className="font-bold" style={{ color: "#6D6D6D", fontSize: 12, fontFamily: "Nunito, sans-serif" }}>Dry Matter Intake</p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <p className="font-bold" style={{ color: "#231F20", fontSize: 20, fontFamily: "Nunito, sans-serif" }}>{parts[0]}</p>
                          <p style={{ color: "#6D6D6D", fontSize: 14, fontFamily: "Nunito, sans-serif" }}>{parts.slice(1).join(" ")}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </SCard>
            )}

            {/* Cost-Effective Diet — hidden when diet rating is ERROR_*
                (matches FragmentRecommendationReport.kt:218). */}
            {showSolutionSections && recReport.least_cost_diet && recReport.least_cost_diet.length > 0 && (
              <SCard
                title="Cost-Effective Diet"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#064E3B">
                    <path d="M12 2C9 2 5 4 5 8c0 2.5 2 3.5 4 4-1 2-1 5 0 7 1 1.5 3 2 5 2-1-2-1-5 1-7v9h-2v-9c-2 0-4-1-4-3 0-4 3-4 3-4z" opacity="0.3"/>
                    <path d="M3 14c0-1.5 1.5-3 4-3s4 1.5 4 3v6H3v-6z" />
                    <path d="M3 17h8M3 20h8" stroke="#FFFFFF" strokeWidth="0.6" />
                  </svg>
                }
                footer={
                  <div
                    className="flex items-center justify-between"
                    style={{ backgroundColor: "#E4F7EF", padding: "12px 14px" }}
                  >
                    <span
                      className="font-bold uppercase"
                      style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}
                    >
                      Total Diet Cost
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                    >
                      {fmt(recTotalCost)} {user?.currency || ""}
                    </span>
                  </div>
                }
              >
                <div
                  className="grid items-center py-3 px-2"
                  style={{
                    gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  <span className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>NAME</span>
                  <span className="font-bold uppercase text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>PRICE</span>
                  <span className="font-bold uppercase text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>AF_KG</span>
                  <span className="font-bold uppercase text-right" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>COST</span>
                </div>
                {recReport.least_cost_diet.map((row: CostEffectiveDiet, i: number) => (
                  <div
                    key={i}
                    className="grid items-center py-3 px-2"
                    style={{
                      gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
                      borderBottom: "1px solid #F1F5F9",
                    }}
                  >
                    <span className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{row.feed_name}</span>
                    <span className="text-center" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{fmt(row.price_per_kg, 0)}</span>
                    <span className="text-center" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{fmt(row.quantity_kg_per_day, 2)}</span>
                    <span className="text-right font-bold" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{fmt(row.daily_cost, 0)}</span>
                  </div>
                ))}
              </SCard>
            )}

            {/* Environmental Impact — also hidden when diet rating is
                ERROR_* (matches FragmentRecommendationReport.kt:219). */}
            {showSolutionSections && recReport.environmental_impact && (() => {
              const env = recReport.environmental_impact;
              const productionVal = Number(env.methane_production_grams_per_day ?? 0);
              const yieldVal = Number(env.methane_yield_grams_per_kg_dmi ?? 0);
              const intensityVal = Number(env.methane_intensity_grams_per_kg_ecm ?? 0);
              const envRaw = env as unknown as Record<string, unknown>;
              const ymVal = Number(env["Ym (%)"] ?? (envRaw.methane_conversion_rate_percent as number | string | undefined) ?? 0);
              return (
                <SCard title="Environmental Impact" icon={<IcEnvironment size={24} color="#064E3B" />}>
                  {/* Methane Production */}
                  <div className="flex items-center justify-between mt-1">
                    <p className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Methane Production</p>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                      {fmt(productionVal, 2)} g/day
                    </p>
                  </div>
                  <MethaneBar progress={calcPct(productionVal, MAX_METHANE_PRODUCTION)} color="#1CA069" />

                  {/* Methane Yield */}
                  <div className="flex items-center justify-between mt-4">
                    <p className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Methane Yield</p>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                      {fmt(yieldVal, 2)} g/kg DMI
                    </p>
                  </div>
                  <MethaneBar progress={calcPct(yieldVal, MAX_METHANE_YIELD)} color="#064E3B" />

                  {/* Methane Intensity */}
                  <div className="flex items-center justify-between mt-4">
                    <p className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Methane Intensity</p>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                      {fmt(intensityVal, 2)} g/kg ECM
                    </p>
                  </div>
                  <MethaneBar progress={calcPct(intensityVal, MAX_METHANE_INTENSITY)} color="#296CD3" />

                  {/* Methane Conversion Rate (Ym %) */}
                  <div className="flex items-center justify-between mt-4">
                    <p className="font-bold uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>Methane Conversion Rate (Ym %)</p>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                      {fmt(ymVal, 2)} %
                    </p>
                  </div>
                  <MethaneBar progress={calcPct(ymVal, MAX_YM_PERCENT)} color="#FF9800" />

                  {/* Classification banner */}
                  {env.classification && (
                    <div
                      className="flex items-center gap-3 mt-5"
                      style={{ backgroundColor: "#E3F2FD", border: "1px solid rgba(41,108,211,0.25)", borderRadius: 16, padding: "10px 12px" }}
                    >
                      <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "#1E40AF" }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-6h2zm0-8h-2V6h2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold uppercase" style={{ color: "#1E40AF", fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>
                          Classification
                        </p>
                        <p className="font-bold" style={{ color: "#1E40AF", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                          {env.classification}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ym footnote */}
                  <p
                    style={{ color: "#1E40AF", fontFamily: "Nunito, sans-serif", fontSize: 12, marginTop: 12 }}
                  >
                    * Ym (%) = percentage of energy intake lost as methane.
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
              <SCard
                title="Notes"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#064E3B">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M7 10v6M11 8v8M15 12v4M19 6v10" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                }
              >
                {/* SIMULATION STATUS banner — colored by dietRating */}
                <div
                  className="flex items-center gap-3"
                  style={{ backgroundColor: banner.bg, border: `1px solid ${banner.stroke}`, borderRadius: 14, padding: 10 }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: banner.iconBg }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
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
                    <p className="font-bold uppercase" style={{ color: banner.titleColor, fontFamily: "Nunito, sans-serif", fontSize: 12, letterSpacing: 0.5 }}>
                      Simulation Status
                    </p>
                    <p style={{ color: banner.bodyColor, fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                      {banner.statusText}
                    </p>
                  </div>
                </div>

                {/* Violated Parameters (osPoints) — only when non-empty,
                    matching FragmentRecommendationReport.kt:260-262
                    which hides layoutOptimizationSummary when osPoints
                    is empty. */}
                {osPoints.length > 0 && (
                  <>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14, marginTop: 16 }}>
                      Violated Parameters:
                    </p>
                    <div className="mt-3 space-y-3">
                      {osPoints.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div
                            className="flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: "rgba(5,188,109,0.15)", borderRadius: 10, padding: 6, marginTop: 2 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M9 11l3 3L20 6M4 12l3 3" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <p style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14, lineHeight: 1.5 }}>
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
                <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14, marginTop: 16, marginBottom: 8 }}>
                  Recommendations &amp; Warnings:
                </p>
                <BulletList items={rwDisplay} color={rwPoints.length === 0 ? "#6D6D6D" : "#064E3B"} />
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
          maxWidth: "min(100vw, 480px)",
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
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
              backgroundColor: "#064E3B",
              color: "white",
              border: "none",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            Generate Diet Recommendation
          </button>
        )}
        {pdfUrl && (
          <button
            onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 mb-3"
            style={{
              backgroundColor: "#F0FDF4",
              color: "#064E3B",
              border: "1px solid #064E3B",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3.5 2h7.5l4 4v10a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M5.5 10h7M5.5 12.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            View PDF
          </button>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => {
              // Match Android btnNewCase: clears feed selections + report
              // so the next pass starts from a clean Cattle Info step.
              setFeedSelections([]);
              setFeedSelectionType("recommendation");
              router.push("/cattle-info");
            }}
            className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
            style={{
              border: "2px solid #064E3B",
              color: "#064E3B",
              background: "white",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            <IcNewCase size={18} color="#064E3B" />
            New Case
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !reportIdForSave}
            className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: isSaving || !reportIdForSave ? "#D3D3D3" : "#064E3B",
              color: isSaving || !reportIdForSave ? "#999999" : "white",
              border: "none",
              fontFamily: "Nunito, sans-serif",
              cursor: isSaving || !reportIdForSave ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <IcSave size={18} color={!reportIdForSave ? "#999999" : "white"} />
                Save Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
