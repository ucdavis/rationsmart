// Baby Calf/Heifer milk plan — Maria's engine rule (QA row 8):
//   Dt_DMIn = 0.10 * An_BW   → litres of milk per day
//   fed in two equal feedings (morning / evening), each rounded UP to
//   0.1 L so the calf is never fed less than the target.
// 10% by mass ≈ 10% by volume for whole cow milk (density ~1.03 g/mL).

export const CALF_FEEDINGS_PER_DAY = 2;

export interface CalfMilkPlan {
  /** Target milk, L/day (0.10 × body weight). */
  dailyTargetL: number;
  /** Each feeding, rounded up to 0.1 L. */
  perFeedingL: number;
  feedingsPerDay: number;
  /** What is actually fed per day — perFeedingL × feedingsPerDay. */
  dailyFedL: number;
}

export function calfMilkPlan(
  bodyWeightKg: number,
  feedingsPerDay = CALF_FEEDINGS_PER_DAY,
  dailyTargetL = bodyWeightKg * 0.1
): CalfMilkPlan | null {
  if (!Number.isFinite(dailyTargetL) || dailyTargetL <= 0) return null;
  const feedings = Math.max(1, Math.round(feedingsPerDay));
  // Round to 6 places first so float noise (e.g. 2.0000000001) can't push
  // an exact value up a whole 0.1 L step.
  const perFeedingL = Math.ceil(Number(((dailyTargetL / feedings) * 10).toFixed(6))) / 10;
  return {
    dailyTargetL,
    perFeedingL,
    feedingsPerDay: feedings,
    dailyFedL: Number((perFeedingL * feedings).toFixed(1)),
  };
}
