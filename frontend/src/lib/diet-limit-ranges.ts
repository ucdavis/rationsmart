// Custom Diet Limits — ranges and defaults shown in the UI.
//
// Source: RFT_FD_Lib_Y2test.xlsx, sheet "Constraints" (user request,
// 2026-09-30). These WIN over the min / max / default returned by
// GET /v1/animal/diet-thresholds; the endpoint still supplies unit,
// direction and enforcement. If the endpoint fails, the dialog is built
// from this table alone so it stays usable.
//
// Leaving a field blank still omits the key (§19.1), i.e. the ENGINE's own
// default applies — keep the engine in step with the "default" column.
//
// Dry Cow ndf_for_min: the sheet says min 25 / default 20 (default below
// min); aligned with the backend to min 20 on 2026-10-12 at the user's request.
import type { DietLimits } from "@/lib/api-client/models";
import type { DietThresholdSpec } from "@/lib/api-client/diet";

type Range = { min: number; max: number; default: number };
type StateRanges = Partial<Record<keyof DietLimits, Range>>;

export const DIET_LIMIT_RANGES: Record<string, StateRanges> = {
  "Lactating Cow": {
    ndf_for_min: { min: 15, max: 30, default: 20 },
    ndf_max: { min: 30, max: 100, default: 60 },
    starch_max: { min: 15, max: 30, default: 26 },
    conc_max: { min: 20, max: 80, default: 80 },
    ee_max: { min: 3, max: 7, default: 7 },
    ash_max: { min: 8, max: 15, default: 15 },
    nel_balance_max: { min: 1, max: 4, default: 2 },
    mp_balance_max: { min: 0.1, max: 1, default: 1 },
  },
  "Dry Cow": {
    ndf_for_min: { min: 20, max: 50, default: 20 },
    ndf_max: { min: 40, max: 100, default: 90 },
    starch_max: { min: 8, max: 25, default: 18 },
    conc_max: { min: 10, max: 80, default: 50 },
    ee_max: { min: 2, max: 7, default: 5 },
    ash_max: { min: 8, max: 15, default: 15 },
    nel_balance_max: { min: 0.5, max: 3, default: 1.5 },
    mp_balance_max: { min: 0.1, max: 1, default: 0.7 },
  },
  Heifer: {
    ndf_for_min: { min: 14, max: 40, default: 20 },
    ndf_max: { min: 30, max: 100, default: 70 },
    starch_max: { min: 8, max: 25, default: 20 },
    conc_max: { min: 10, max: 80, default: 50 },
    ee_max: { min: 2, max: 7, default: 5 },
    ash_max: { min: 8, max: 15, default: 10 },
    nel_balance_max: { min: 0.1, max: 4, default: 2 },
    mp_balance_max: { min: 0.1, max: 1, default: 0.5 },
  },
};

const UNIT: Record<string, DietThresholdSpec["unit"]> = {
  nel_balance_max: "mcal_day",
  mp_balance_max: "kg_day",
};

/** API specs with the sheet's min / max / default applied. */
export function applyDietLimitRanges(
  state: string,
  specs: DietThresholdSpec[]
): DietThresholdSpec[] {
  const table = DIET_LIMIT_RANGES[state];
  if (!table) return specs;
  return specs.map((s) => {
    const r = table[s.key];
    return r ? { ...s, ...r } : s;
  });
}

/** Specs built from the sheet alone — used when the endpoint fails. */
export function dietLimitSpecsFromTable(state: string): DietThresholdSpec[] | null {
  const table = DIET_LIMIT_RANGES[state];
  if (!table) return null;
  return (Object.entries(table) as [keyof DietLimits, Range][]).map(([key, r]) => ({
    key,
    ...r,
    unit: UNIT[key] ?? "pct_dm",
    direction: key === "ndf_for_min" ? "min" : "max",
    // Engine detail, not shown in the UI (§19.2).
    enforcement: "hard",
  }));
}
