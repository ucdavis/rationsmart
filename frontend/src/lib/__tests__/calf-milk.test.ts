import { describe, it, expect } from "vitest";
import { calfMilkPlan } from "@/lib/calf-milk";

describe("calfMilkPlan — Maria's rule (QA row 8)", () => {
  it("targets 10% of body weight, split into two feedings", () => {
    expect(calfMilkPlan(40)).toEqual({
      dailyTargetL: 4,
      perFeedingL: 2,
      feedingsPerDay: 2,
      dailyFedL: 4,
    });
  });

  it("rounds each feeding UP to 0.1 L so the calf is never under-fed", () => {
    // 5.5 L/day → 2.75 per feeding → 2.8
    expect(calfMilkPlan(55)).toMatchObject({ perFeedingL: 2.8, dailyFedL: 5.6 });
    // 4.3 L/day → 2.15 → 2.2
    expect(calfMilkPlan(43)).toMatchObject({ perFeedingL: 2.2, dailyFedL: 4.4 });
  });

  it("does not round an exact value up a step because of float noise", () => {
    // 0.1 * 42 = 4.2000000000000002 → 2.1 per feeding, not 2.2
    expect(calfMilkPlan(42)?.perFeedingL).toBe(2.1);
  });

  it("uses a server-supplied volume and feeding count when given", () => {
    expect(calfMilkPlan(40, 3, 5)).toMatchObject({ perFeedingL: 1.7, feedingsPerDay: 3 });
  });

  it("returns null without a usable body weight", () => {
    expect(calfMilkPlan(0)).toBeNull();
    expect(calfMilkPlan(Number.NaN)).toBeNull();
  });
});
