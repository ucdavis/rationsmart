import { describe, it, expect } from "vitest";
import { parseFeedCategoryOptions, parseFeedTypeOptions } from "@/lib/api";
import { anyNutrientInvalid, nutrientValueInvalid } from "@/lib/validators";
import { nutrientFieldsFor } from "@/lib/nutrients";

describe("taxonomy parsers (audit B-21)", () => {
  it("handles bare strings, identity+display objects, wrappers and singletons", () => {
    expect(parseFeedTypeOptions(["Forage"])).toEqual([{ name: "Forage", display: "Forage" }]);
    expect(
      parseFeedTypeOptions({ feed_types: [{ type_name: "Forage", display_type: "चारा" }] })
    ).toEqual([{ name: "Forage", display: "चारा" }]);
    expect(parseFeedTypeOptions({ type_name: "Concentrate" })).toEqual([
      { name: "Concentrate", display: "Concentrate" },
    ]);
    expect(
      parseFeedCategoryOptions({ unique_feed_categories: [{ name: "Grass", display_name: "घास" }] })
    ).toEqual([{ name: "Grass", display: "घास" }]);
    expect(parseFeedCategoryOptions(null)).toEqual([]);
    expect(parseFeedCategoryOptions([null, { category_name: "" }])).toEqual([]);
  });
});

describe("nutrient rules (audit B-14 / B-21)", () => {
  it("accepts blank and 0–100, rejects the rest", () => {
    expect(nutrientValueInvalid("")).toBe(false);
    expect(nutrientValueInvalid("0")).toBe(false);
    expect(nutrientValueInvalid("100")).toBe(false);
    expect(nutrientValueInvalid("100.5")).toBe(true);
    expect(nutrientValueInvalid("-1")).toBe(true);
    expect(nutrientValueInvalid("abc")).toBe(true);
    expect(anyNutrientInvalid(["12", "", "101"])).toBe(true);
  });

  it("picks the Android field layout per category", () => {
    expect(nutrientFieldsFor("Additive")).toHaveLength(13);
    expect(nutrientFieldsFor("Minerals")).toHaveLength(4);
    expect(nutrientFieldsFor("Roughage")).toHaveLength(12);
  });
});
