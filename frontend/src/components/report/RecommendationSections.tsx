"use client";

// Recommendation-mode report sections (solution summary, cost-effective diet, environmental impact); split out of report/page.tsx (audit B-17).
import {
  SCard,
  MethaneBar,
  MAX_METHANE_PRODUCTION,
  MAX_METHANE_YIELD,
  MAX_METHANE_INTENSITY,
  MAX_YM_PERCENT,
  calcPct,
  BulletList,
} from "@/components/report/parts";
import {
  IcEnvironment,
  IcSolutionSummary,
  IcDailyCost,
  IcMilkDroplet,
  IcDmIntakeGrass,
  IcCostEffectiveDiet,
  IcNotes,
  IcViolatedParameter,
} from "@/components/Icons";
import { COLORS } from "@/lib/colors";
import type { CostEffectiveDiet } from "@/lib/api";

import type { RecommendationResponse } from "@/lib/api-client/models";
import type { ReportContext } from "@/components/report/parts";
import type { User } from "@/lib/store";

import type { BannerTheme } from "@/components/report/parts";

export interface RecommendationSectionsProps {
  banner: BannerTheme;
  currencySymbol: string;
  displayFeedName: (row: {
    feed_id?: string | null | undefined;
    feed_name?: string | null | undefined;
    display_name?: string | null | undefined;
  }) => string;
  fmt: (n: string | number | null | undefined, d?: number) => string;
  isAdvisory: boolean;
  isErrorState: boolean;
  osPoints: string[];
  recReport: RecommendationResponse;
  recTotalCost: number;
  reportCtx: ReportContext;
  rwDisplay: string[];
  rwPoints: string[];
  showNotesCard: boolean;
  showSolutionSections: boolean;
  softLimitNotes: string[];
  t: (source: string) => string;
  user: User | null;
}

export default function RecommendationSections({
  banner,
  currencySymbol,
  displayFeedName,
  fmt,
  isAdvisory,
  isErrorState,
  osPoints,
  recReport,
  recTotalCost,
  reportCtx,
  rwDisplay,
  rwPoints,
  showNotesCard,
  showSolutionSections,
  softLimitNotes,
  t,
  user,
}: RecommendationSectionsProps) {
  return (
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
                <span className="font-bold" style={{ color: COLORS.crayolaGreen, fontSize: 16 }}>
                  {fmt(recTotalCost)} {user?.currency || ""}
                </span>
              </div>
            }
          >
            <div
              className="grid items-center py-3 px-2"
              style={{
                gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
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
                  gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
                  borderBottom: `1px solid ${COLORS.americanDiamond}`,
                }}
              >
                <span className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 14 }}>
                  {displayFeedName(row)}
                </span>
                <span className="text-center" style={{ color: COLORS.raisinBlack, fontSize: 14 }}>
                  {fmt(row.price_per_kg, 0)}
                </span>
                <span className="text-center" style={{ color: COLORS.raisinBlack, fontSize: 14 }}>
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
              <MethaneBar progress={calcPct(ymVal, MAX_YM_PERCENT)} color={COLORS.vividGamboge} />

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
                        backgroundColor: COLORS.goGreen15,
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
  );
}
