import { describe, it, expect } from "vitest";
import { applyDietLimitRanges, dietLimitSpecsFromTable } from "../diet-limit-ranges";
import type { DietThresholdSpec } from "../api-client/diet";

const apiSpec: DietThresholdSpec = {
  key: "ndf_max",
  default: 45,
  min: 20,
  max: 45,
  unit: "pct_dm",
  direction: "max",
  enforcement: "soft",
};

describe("diet-limit-ranges (Constraints sheet)", () => {
  it("overrides min / max / default per state, keeping the endpoint's unit and enforcement", () => {
    const [dry] = applyDietLimitRanges("Dry Cow", [apiSpec]);
    expect(dry).toEqual({ ...apiSpec, min: 40, max: 100, default: 90 });
    const [heifer] = applyDietLimitRanges("Heifer", [apiSpec]);
    expect(heifer).toMatchObject({ min: 30, max: 100, default: 70, enforcement: "soft" });
  });

  it("passes specs through for a state the sheet doesn't cover", () => {
    expect(applyDietLimitRanges("Baby Calf/Heifer", [apiSpec])).toEqual([apiSpec]);
    expect(dietLimitSpecsFromTable("Baby Calf/Heifer")).toBeNull();
  });

  it("builds all eight rows from the sheet with the right units and direction", () => {
    const specs = dietLimitSpecsFromTable("Lactating Cow")!;
    expect(specs).toHaveLength(8);
    const by = Object.fromEntries(specs.map((s) => [s.key, s]));
    expect(by.ndf_for_min).toMatchObject({ min: 15, max: 30, default: 20, direction: "min" });
    expect(by.nel_balance_max).toMatchObject({ unit: "mcal_day", min: 1, max: 4, default: 2 });
    expect(by.mp_balance_max).toMatchObject({ unit: "kg_day", min: 0.1, max: 1, default: 1 });
    expect(by.conc_max?.unit).toBe("pct_dm");
  });
});
