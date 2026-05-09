"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { saveReport } from "@/lib/api";
import type { EvaluationResponse, RecommendationResponse, FeedBreakdown, CostEffectiveDiet } from "@/lib/api";
import { IcSave, IcNewCase } from "@/components/Icons";

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

function SCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mx-3 my-2.5 rounded-2xl bg-white px-4 py-4"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      {title && (
        <p
          className="text-base font-bold mb-3"
          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
        >
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

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

export default function ReportPage() {
  const router = useRouter();
  const { user, cattleInfo, reportData, feedSelectionType, showSnackbar, setFeedSelectionType } = useStore((s) => ({
    user: s.user,
    cattleInfo: s.cattleInfo,
    reportData: s.reportData,
    feedSelectionType: s.feedSelectionType,
    showSnackbar: s.showSnackbar,
    setFeedSelectionType: s.setFeedSelectionType,
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const currencySymbol = (() => {
    // Prefer user's stored currency; fall back to what the report response gives us
    const reportCurrency =
      (reportData as EvaluationResponse)?.cost_analysis?.currency ??
      (reportData as EvaluationResponse)?.currency ??
      null;
    const code = user?.currency || reportCurrency || "";
    if (!code) return "";
    try {
      const sym = (0).toLocaleString("en", { style: "currency", currency: code, minimumFractionDigits: 0 }).replace(/[0-9,.\s]/g, "").trim();
      return sym || code;
    } catch { return code; }
  })();

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

  // Determine optimization status label
  const statusLabel = isEval
    ? (evalReport?.evaluation_summary?.overall_status ?? "Evaluated")
    : (recReport?.report_info?.diet_rating ?? "—");

  // Determine report_id for saving
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

  // Generated date
  const generatedOn = isEval
    ? new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : (recReport?.report_info?.generated_date
        ? new Date(recReport.report_info.generated_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));

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
        {/* Section 1: Report Summary */}
        <SCard title="">
          <div className="flex items-start justify-between">
            <div>
              <p
                className="text-base font-bold"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              >
                {isEval ? "Diet Evaluation" : "Diet Recommendation"}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                {generatedOn}
              </p>
              {!isEval && recReport?.report_info?.user_name && (
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {recReport.report_info.user_name}
                </p>
              )}
            </div>
            <StatusBadge status={statusLabel} />
          </div>
        </SCard>

        {/* Section 2: Animal Characteristics */}
        {cattleInfo && (
          <SCard title="Animal Characteristics">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                ["Breed", cattleInfo.breed],
                ["Body Weight", `${cattleInfo.body_weight} kg`],
                ["Body Condition Score", `${cattleInfo.body_condition_score}`],
                ["Body Weight Gain", `${cattleInfo.body_weight_gain} kg/day`],
                ["Days in Milk", `${cattleInfo.days_in_milk}`],
                ["Days of Pregnancy", `${cattleInfo.days_of_pregnancy}`],
                ["Milk Production", `${cattleInfo.milk_production} L/day`],
                ["Milk Fat %", `${cattleInfo.milk_fat_percent}%`],
                ["Milk Protein %", `${cattleInfo.milk_protein_percent}%`],
                ["Parity", `${cattleInfo.parity}`],
                ["Avg. Temperature", `${cattleInfo.average_temperature} °C`],
                ...(cattleInfo.grazing ? [
                  ["Topography", cattleInfo.topography],
                  ["Distance Walked", `${cattleInfo.distance} km`],
                ] as [string, string | number | undefined][]: []),
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "#F8FAF9" }}
                >
                  <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
                  <p
                    className="text-sm font-bold mt-0.5"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </SCard>
        )}

        {/* ─── EVALUATION SECTIONS ─── */}
        {isEval && evalReport && (
          <>
            {/* Section 3: Evaluation Summary */}
            {evalReport.evaluation_summary && (evalReport.evaluation_summary.overall_status || evalReport.evaluation_summary.limiting_factor) && (
              <SCard title="Evaluation Summary">
                {evalReport.evaluation_summary.overall_status && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Overall Status</span>
                    <StatusBadge status={evalReport.evaluation_summary.overall_status} />
                  </div>
                )}
                {evalReport.evaluation_summary.limiting_factor && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Limiting Factor</span>
                    <span className="text-sm font-bold" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>{evalReport.evaluation_summary.limiting_factor}</span>
                  </div>
                )}
              </SCard>
            )}

            {/* Section 4: Cost Analysis */}
            <SCard title="Cost Analysis">
              <div className="flex gap-3 mb-3">
                <MetricTile
                  label="Total Diet Cost"
                  value={`${currencySymbol}${fmt(evalReport.cost_analysis?.total_diet_cost_as_fed)}`}
                  unit=""
                />
                <MetricTile
                  label="Cost/Litre Milk"
                  value={`${currencySymbol}${fmt(evalReport.cost_analysis?.feed_cost_per_kg_milk)}`}
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

            {/* Section 4: Feed Breakdown */}
            {evalReport.feed_breakdown && evalReport.feed_breakdown.length > 0 && (
              <SCard title="Feed Breakdown">
                <div
                  className="flex text-xs font-bold py-2 px-2 rounded-lg mb-1"
                  style={{ backgroundColor: "#F1F5F9", color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  <span className="flex-1">Feed</span>
                  <span className="w-16 text-right">As Fed</span>
                  <span className="w-16 text-right">Price/kg</span>
                  <span className="w-16 text-right">Cost/day</span>
                </div>
                {evalReport.feed_breakdown.map((row: FeedBreakdown, i: number) => (
                  <div
                    key={i}
                    className="flex items-center py-2 px-2 border-b last:border-0"
                    style={{ borderColor: "#F1F5F9" }}
                  >
                    <span className="flex-1 text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{row.feed_name}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{fmt(row.quantity_as_fed_kg_per_day, 1)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{currencySymbol}{fmt(row.price_per_kg)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{currencySymbol}{fmt(row.total_cost)}</span>
                  </div>
                ))}
              </SCard>
            )}

            {/* Section 5: Intake Evaluation */}
            {evalReport.intake_evaluation && (
              <SCard title="Dry Matter Intake">
                <div className="flex gap-3 mb-3">
                  <MetricTile label="Actual Intake" value={`${fmt(evalReport.intake_evaluation.actual_intake_kg_per_day, 1)} kg`} unit="per day" />
                  <MetricTile label="Target Intake" value={`${fmt(evalReport.intake_evaluation.target_intake_kg_per_day, 1)} kg`} unit="per day" />
                </div>
                {evalReport.intake_evaluation.intake_status && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Status</span>
                    <StatusBadge status={evalReport.intake_evaluation.intake_status} />
                  </div>
                )}
                <BulletList items={evalReport.intake_evaluation.recommendations ?? []} color="#064E3B" />
                <BulletList items={evalReport.intake_evaluation.warnings ?? []} color="#FF9800" />
              </SCard>
            )}

            {/* Section 6: Milk Production Analysis */}
            {evalReport.milk_production_analysis && (
              <SCard title="Milk Production Analysis">
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
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mb-2" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Limiting Nutrient</span>
                    <span className="text-sm font-bold" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>{evalReport.milk_production_analysis.limiting_nutrient}</span>
                  </div>
                )}
                <BulletList items={evalReport.milk_production_analysis.recommendations ?? []} color="#064E3B" />
                <BulletList items={evalReport.milk_production_analysis.warnings ?? []} color="#FF9800" />
              </SCard>
            )}

            {/* Section 7: Nutrient Balance */}
            {evalReport.nutrient_balance && (
              <SCard title="Nutrient Balance">
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

            {/* Section 8: Methane Analysis */}
            {evalReport.methane_analysis && (
              <SCard title="Environment Impact">
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="CH₄ Production" value={`${fmt(evalReport.methane_analysis.methane_production_g_per_day, 1)}`} unit="g/day" />
                  <MetricTile label="CH₄ Intensity" value={`${fmt(evalReport.methane_analysis.methane_intensity_g_per_kg_ecm, 2)}`} unit="g/kg ECM" />
                  <MetricTile label="CH₄ Yield" value={`${fmt(evalReport.methane_analysis.methane_yield_g_per_kg_dmi, 3)}`} unit="g/kg DMI" />
                  <MetricTile label="CH₄ Emission" value={`${fmt(evalReport.methane_analysis.methane_emission_mj_per_day, 1)}`} unit="MJ/day" />
                </div>
                {evalReport.methane_analysis.classification && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mt-3" style={{ backgroundColor: "#F8FAF9" }}>
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
            {/* Section 3: Solution Summary */}
            {recReport.solution_summary && (
              <SCard title="Solution Summary">
                <div className="flex gap-3">
                  {recReport.solution_summary.daily_cost != null && (
                    <MetricTile
                      label="Daily Cost"
                      value={`${currencySymbol}${Number(recReport.solution_summary.daily_cost).toFixed(2)}`}
                      unit=""
                    />
                  )}
                  {recReport.solution_summary.dry_matter_intake && (
                    <MetricTile
                      label="DM Intake"
                      value={recReport.solution_summary.dry_matter_intake.split(" ")[0]}
                      unit={recReport.solution_summary.dry_matter_intake.split(" ").slice(1).join(" ") || "kg"}
                    />
                  )}
                  {recReport.solution_summary.milk_production && (
                    <MetricTile
                      label="Milk Prod."
                      value={recReport.solution_summary.milk_production.split(" ")[0]}
                      unit={recReport.solution_summary.milk_production.split(" ").slice(1).join(" ") || "L/day"}
                    />
                  )}
                </div>
              </SCard>
            )}

            {/* Section 4: Least Cost Diet */}
            {recReport.least_cost_diet && recReport.least_cost_diet.length > 0 && (
              <SCard title="Cost Effective Diet">
                <div
                  className="flex text-xs font-bold py-2 px-2 rounded-lg mb-1"
                  style={{ backgroundColor: "#F1F5F9", color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  <span className="flex-1">Feed</span>
                  <span className="w-16 text-right">Qty</span>
                  <span className="w-16 text-right">Price/kg</span>
                  <span className="w-16 text-right">Cost/day</span>
                </div>
                {recReport.least_cost_diet.map((row: CostEffectiveDiet, i: number) => (
                  <div
                    key={i}
                    className="flex items-center py-2 px-2 border-b last:border-0"
                    style={{ borderColor: "#F1F5F9" }}
                  >
                    <span className="flex-1 text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{row.feed_name}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{fmt(row.quantity_kg_per_day, 1)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{currencySymbol}{fmt(row.price_per_kg)}</span>
                    <span className="w-16 text-right text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{currencySymbol}{fmt(row.daily_cost)}</span>
                  </div>
                ))}
              </SCard>
            )}

            {/* Section 5: Environmental Impact */}
            {recReport.environmental_impact && (
              <SCard title="Environment Impact">
                <div className="grid grid-cols-2 gap-3">
                  {recReport.environmental_impact.methane_production_grams_per_day && (
                    <MetricTile label="CH₄ Production" value={recReport.environmental_impact.methane_production_grams_per_day} unit="g/day" />
                  )}
                  {recReport.environmental_impact.methane_intensity_grams_per_kg_ecm && (
                    <MetricTile label="CH₄ Intensity" value={recReport.environmental_impact.methane_intensity_grams_per_kg_ecm} unit="g/kg ECM" />
                  )}
                  {recReport.environmental_impact.methane_yield_grams_per_kg_dmi && (
                    <MetricTile label="CH₄ Yield" value={recReport.environmental_impact.methane_yield_grams_per_kg_dmi} unit="g/kg DMI" />
                  )}
                  {recReport.environmental_impact["Ym (%)"] && (
                    <MetricTile label="Ym (%)" value={recReport.environmental_impact["Ym (%)"]} unit="conversion rate" />
                  )}
                </div>
                {recReport.environmental_impact.classification && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mt-3" style={{ backgroundColor: "#F8FAF9" }}>
                    <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Classification</span>
                    <span className="text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{recReport.environmental_impact.classification}</span>
                  </div>
                )}
              </SCard>
            )}

            {/* Section 6: Recommendations & Warnings */}
            {recReport.additional_information && (
              <>
                {(recReport.additional_information.violated_parameters?.length ?? 0) > 0 && (
                  <SCard title="Optimization Violations">
                    <BulletList items={recReport.additional_information.violated_parameters} color="#E44A4A" />
                  </SCard>
                )}
                {((recReport.additional_information.recommendations?.length ?? 0) > 0 ||
                  (recReport.additional_information.warnings?.length ?? 0) > 0) && (
                  <SCard title="Recommendations & Warnings">
                    <BulletList items={recReport.additional_information.recommendations ?? []} color="#064E3B" />
                    <BulletList items={recReport.additional_information.warnings ?? []} color="#FF9800" />
                  </SCard>
                )}
              </>
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
          maxWidth: 430,
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
          zIndex: 30,
        }}
      >
        {/* Generate Recommendation from Evaluation — shown only in eval mode */}
        {isEval && (
          <button
            onClick={() => {
              setFeedSelectionType("recommendation");
              router.push("/feed-selection");
            }}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 mb-3"
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
        {/* View PDF — appears after save if backend returns bucket_url */}
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
            onClick={() => router.push("/cattle-info")}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5"
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
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5"
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
