"use client";

// Evaluation-mode report sections (cost analysis, summary, breakdown, intake, methane, milk, nutrient balance); split out of report/page.tsx (audit B-17).
import {
  StatusBadge,
  SCard,
  MetricTile,
  BalanceRow,
  BulletList,
  TotalCostFooter,
} from "@/components/report/parts";
import {
  IcEnvironment,
  IcEvaluationSummary,
  IcCostAnalysis,
  IcFeedBreakdown,
  IcDryMatterIntake,
  IcMilkProductionAnalysis,
} from "@/components/Icons";
import { COLORS } from "@/lib/colors";
import type { FeedBreakdown } from "@/lib/api";

import type { EvaluationResponse } from "@/lib/api-client/models";
import type { ReportContext } from "@/components/report/parts";

export interface EvaluationSectionsProps {
  currencySuffix: string;
  currencySymbol: string;
  displayFeedName: (row: {
    feed_id?: string | null | undefined;
    feed_name?: string | null | undefined;
    display_name?: string | null | undefined;
  }) => string;
  evalReport: EvaluationResponse;
  evalTotalCost: number;
  fmt: (n: string | number | null | undefined, d?: number) => string;
  reportCtx: ReportContext;
  t: (source: string) => string;
}

export default function EvaluationSections({
  currencySuffix,
  currencySymbol,
  displayFeedName,
  evalReport,
  evalTotalCost,
  fmt,
  reportCtx,
  t,
}: EvaluationSectionsProps) {
  return (
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
              <span className="text-sm font-bold" style={{ color: COLORS.darkAquamarineGreen }}>
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
  );
}
