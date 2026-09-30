"use client";

// Report — Environmental Impact (methane production / yield / intensity / Ym
// and the classification banner). Hidden when the diet rating is ERROR_*
// (FragmentRecommendationReport.kt:219). Split out of
// RecommendationSections.tsx (audit B-17).

import {
  SCard,
  MethaneBar,
  MAX_METHANE_PRODUCTION,
  MAX_METHANE_YIELD,
  MAX_METHANE_INTENSITY,
  MAX_YM_PERCENT,
  calcPct,
} from "@/components/report/parts";
import { IcEnvironment } from "@/components/Icons";
import { COLORS } from "@/lib/colors";

import type { RecommendationResponse } from "@/lib/api-client/models";
import type { ReportContext } from "@/components/report/parts";

export interface EnvironmentalImpactSectionProps {
  recReport: RecommendationResponse;
  reportCtx: ReportContext;
  fmt: (n: string | number | null | undefined, d?: number) => string;
  t: (source: string) => string;
}

export default function EnvironmentalImpactSection({
  recReport,
  reportCtx,
  fmt,
  t,
}: EnvironmentalImpactSectionProps) {
  if (!recReport.environmental_impact) return null;
  const env = recReport.environmental_impact;
  const productionVal = Number(env.methane_production_grams_per_day ?? 0);
  const yieldVal = Number(env.methane_yield_grams_per_kg_dmi ?? 0);
  const intensityVal = Number(env.methane_intensity_grams_per_kg_ecm ?? 0);
  const ymVal = Number(env["Ym (%)"] ?? env.methane_conversion_rate_percent ?? 0);
  return (
    <SCard
      title={t("Environmental Impact")}
      icon={<IcEnvironment size={24} color={COLORS.darkAquamarineGreen} />}
    >
      {/* Methane Production */}
      <div className="flex items-center justify-between mt-1">
        <p className="font-bold uppercase" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
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
        <p className="font-bold uppercase" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
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
        <p className="font-bold uppercase" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
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
}
