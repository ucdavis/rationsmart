"use client";

// Report — the three Y3 cards: Milk Cost Margin (§2.1), Calf Milk Feeding
// (§2.3) and the Forage : Concentrate ratio (§2.2). Milk Cost Margin takes
// the backend's margin_summary on an Evaluation (N13) and is computed here
// for a Recommendation; Forage : Concentrate prefers the backend block and
// falls back to a client-side estimate; the calf card has no fallback (W13:
// the calf rule lives in the backend only). Split out of report/page.tsx
// (audit B-17).

import type {
  CattleInfo,
  CostEffectiveDiet,
  EvaluationResponse,
  FeedItem,
  RecommendationResponse,
} from "@/lib/api";
import { fillTemplate, fillText } from "@/lib/i18n-ui";
import { formatMoney, roundMoney } from "@/lib/money";
import { COLORS } from "@/lib/colors";
import { IcCalfMilk } from "@/components/Icons";
import { SCard, type ReportContext } from "./parts";

type Translate = (source: string) => string;
type ReportData = EvaluationResponse | RecommendationResponse | null;

type MarginTone = "above" | "below" | "equal";

interface MarginFigures {
  milkPrice: number;
  costPerLitre: number;
  margin: number;
  /** Litres per day the figures are based on. */
  litres: number;
  /** Signed daily amount: margin × litres (IOFC). */
  dailyAmount: number;
  /** Set when the litres are below the target (Evaluation only). */
  basedOn: { nutrient: string | null } | null;
}

// N13: Evaluation takes every figure from the backend's
// cost_analysis.margin_summary, which costs the diet on the milk it
// SUPPORTS (not the target) — the same numbers as Cost Analysis and the
// PDF. No margin_summary (no milk price, 0 L supported): no card.
function evaluationMargin(
  evalReport: EvaluationResponse | null,
  cattleInfo: CattleInfo | null
): MarginFigures | null {
  const ms = evalReport?.cost_analysis?.margin_summary;
  if (!ms) return null;
  const mpa = evalReport?.milk_production_analysis;
  const litres = mpa?.actual_milk_supported_kg_per_day ?? 0;
  if (!(litres > 0)) return null;
  const target = mpa?.target_production_kg_per_day ?? cattleInfo?.milk_production ?? null;
  return {
    milkPrice: ms.milk_price,
    costPerLitre: ms.cost_per_liter,
    margin: ms.margin_per_liter,
    litres,
    dailyAmount: ms.daily_iofc,
    basedOn:
      target != null && litres < target ? { nutrient: mpa?.limiting_nutrient ?? null } : null,
  };
}

// Recommendation: the diet is built to meet the target milk, so the card
// costs it on the target, from the form and the run's daily cost.
function recommendationMargin(
  recReport: RecommendationResponse | null,
  cattleInfo: CattleInfo | null
): MarginFigures | null {
  const milkPrice = cattleInfo?.milk_price ?? null;
  const litres = cattleInfo?.milk_production ?? null;
  if (milkPrice == null || !litres) return null;
  // Top-level total_diet_cost equals solution_summary's daily_cost when
  // present, but is the more reliable source since some payloads omit
  // solution_summary.
  const dailyCost = recReport?.total_diet_cost ?? recReport?.solution_summary?.daily_cost ?? null;
  if (dailyCost == null || dailyCost <= 0) return null;
  const costPerLitre = roundMoney(dailyCost / litres);
  const margin = roundMoney(milkPrice - costPerLitre);
  return { milkPrice, costPerLitre, margin, litres, dailyAmount: margin * litres, basedOn: null };
}

export function MilkCostMarginCard({
  reportCtx,
  cattleInfo,
  isEval,
  evalReport,
  recReport,
  currencySymbol,
  t,
}: {
  reportCtx: ReportContext;
  cattleInfo: CattleInfo | null;
  isEval: boolean;
  evalReport: EvaluationResponse | null;
  recReport: RecommendationResponse | null;
  currencySymbol: string;
  t: Translate;
}) {
  if (!reportCtx.showMilkCostMarginCard) return null;
  const m = isEval
    ? evaluationMargin(evalReport, cattleInfo)
    : recommendationMargin(recReport, cattleInfo);
  if (!m) return null;
  const { milkPrice, costPerLitre, margin, litres, dailyAmount, basedOn } = m;
  // Up to 2 decimals, as the backend sends them: 7.68 L, 15 L.
  const litresText = `${Math.round(litres * 100) / 100} L`;
  // N12: the margin is milk price minus FEED cost only (no labour, water,
  // vet…), so it reads "milk revenue over feed costs", never profit/loss —
  // the same meaning as the backend's margin_summary.message and the PDF.
  const tone: MarginTone = margin > 0 ? "above" : margin < 0 ? "below" : "equal";
  // Color tokens chosen to match existing report banners
  // (dark_green_turquoise / carmine_pink theme); break-even is neutral.
  const accent = {
    above: COLORS.darkGreenTurquoise,
    below: COLORS.carminePink,
    equal: COLORS.darkSilver,
  }[tone];
  const accentBg = {
    above: COLORS.honeydew,
    below: COLORS.peachyPink,
    equal: COLORS.authenticWhite,
  }[tone];
  const accentBorder = {
    above: "rgba(5,188,109,0.20)",
    below: "rgba(228,74,74,0.25)",
    equal: COLORS.webDivider,
  }[tone];
  const bannerLabel = {
    above: t("Milk revenue over feed costs / Litre"),
    below: t("Feed costs over milk revenue / Litre"),
    equal: t("Milk revenue equals feed costs"),
  }[tone];
  return (
    <SCard
      title={t("Milk Cost Margin")}
      icon={
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v18M5 12h14" stroke={accent} strokeWidth="2" strokeLinecap="round" />
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
              {formatMoney(costPerLitre)}
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
              {formatMoney(milkPrice)}
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
            {bannerLabel}
          </p>
          <div className="flex items-baseline gap-1" style={{ marginTop: 2 }}>
            <p className="font-bold" style={{ color: accent, fontSize: 24 }}>
              {{ above: "+", below: "−", equal: "" }[tone]}
              {formatMoney(Math.abs(margin))}
            </p>
            <p className="font-bold" style={{ color: accent, fontSize: 13 }}>
              {currencySymbol}/L
            </p>
          </div>
        </div>
        {tone !== "equal" && (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d={tone === "above" ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"}
              stroke={accent}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {/* Daily margin context line */}
      {tone !== "equal" && (
        <p className="mt-2 ml-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {fillTemplate(
            tone === "above"
              ? t("Across ${L}/day, milk revenue over feed costs: ${amount} ${currency}/day")
              : t("Across ${L}/day, feed costs over milk revenue: ${amount} ${currency}/day"),
            {
              L: litresText,
              amount: (
                <span className="font-bold" style={{ color: accent }}>
                  {formatMoney(Math.abs(dailyAmount))}
                </span>
              ),
              currency: currencySymbol,
            }
          )}
        </p>
      )}
      {/* N13: an evaluated diet that can't reach the target milk is costed
          on the litres it supports — say so, and what limits it. */}
      {basedOn && (
        <p className="mt-1 ml-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {basedOn.nutrient
            ? fillText(t("Based on the ${L}/day this diet supports (limited by ${nutrient})"), {
                L: litresText,
                nutrient:
                  { Energy: t("Energy"), Protein: t("Protein") }[basedOn.nutrient] ??
                  basedOn.nutrient,
              })
            : fillText(t("Based on the ${L}/day this diet supports"), {
                L: litresText,
              })}
        </p>
      )}
    </SCard>
  );
}

export function CalfMilkFeedingCard({
  reportCtx,
  reportData,
  cattleInfo,
  t,
}: {
  reportCtx: ReportContext;
  reportData: ReportData;
  cattleInfo: CattleInfo | null;
  t: Translate;
}) {
  if (!reportCtx.showCalfMilkFeedingSection || !cattleInfo) return null;

  // W13: the backend owns the calf rule — it answers a calf run with the
  // whole plan, its amounts already rounded and its care notes already in
  // the simulation's language (plain text, no t()).
  const plan = reportData?.calf_milk_feeding_plan;
  const dailyVolume = Number(plan?.daily_milk_volume_l);
  const perFeedingL = Number(plan?.per_feeding_l);
  if (!(dailyVolume > 0) || !(perFeedingL > 0)) return null;
  const feedings = plan?.feedings_per_day ?? 2;
  const weaningDays = plan?.estimated_weaning_age_days;
  const notes = plan?.notes ?? [];
  return (
    <SCard title={t("Calf Milk Feeding")} icon={<IcCalfMilk />}>
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
            <p className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}>
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
            <p className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}>
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
            <p className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}>
              {weaningDays ?? "—"}
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
        {t("Plan from server. Adjust with vet guidance.")}
      </p>
    </SCard>
  );
}

export function ForageConcentrateCard({
  reportData,
  isEval,
  evalReport,
  recReport,
  feedSelections,
  t,
}: {
  reportData: ReportData;
  isEval: boolean;
  evalReport: EvaluationResponse | null;
  recReport: RecommendationResponse | null;
  feedSelections: FeedItem[];
  t: Translate;
}) {
  // Prefer the backend-computed ForageConcentrateRatio block
  // when Maria ships it.
  // Falls through to client-side compute when absent. Same UI.
  const serverRatio = reportData?.forage_concentrate_ratio;
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
          <rect x="3" y="10" width="8" height="9" rx="1.5" stroke={forageColor} strokeWidth="1.8" />
          <rect x="13" y="6" width="8" height="13" rx="1.5" stroke={concColor} strokeWidth="1.8" />
        </svg>
      }
    >
      {/* Big numeric headline — "65 : 35" style */}
      <div className="flex items-baseline justify-center gap-2" style={{ marginBottom: 12 }}>
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
}
