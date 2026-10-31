import { describe, it, expect } from "vitest";
import {
  isEvaluationRun,
  matchCountry,
  restoreDietLimits,
  restoreFeedItems,
  restoreForm,
  restoredStateOf,
} from "@/components/cattle-info/restore";
import { EMPTY_FORM, type Country } from "@/components/cattle-info/form-model";

const india: Country = { id: "1", name: "India", supported_languages: ["en", "hi"] };
const kenya: Country = { id: "2", name: "Kenya" };

describe("restore — simulation history mapping", () => {
  it("matches the country case-insensitively", () => {
    expect(matchCountry([kenya, india], "INDIA")).toBe(india);
    expect(matchCountry([kenya], "India")).toBeUndefined();
  });

  it("reads physiological_state, then the legacy animal_category, then the fallback", () => {
    expect(restoredStateOf({ physiological_state: "Heifer" }, "Lactating Cow")).toBe("Heifer");
    expect(restoredStateOf({ animal_category: "Dry Cow" }, "Lactating Cow")).toBe("Dry Cow");
    expect(restoredStateOf({}, "Lactating Cow")).toBe("Lactating Cow");
  });

  it("restores present fields, falls back to prev for missing ones, and blanks the name", () => {
    const prev = { ...EMPTY_FORM, body_weight: "400", simulation_name: "Old", parity: "1" };
    const form = restoreForm(
      { country_name: "India", cattle_info: { body_weight: 520, tp_milk: 3.1, grazing: true } },
      prev,
      india,
      "Lactating Cow"
    );
    expect(form).toMatchObject({
      simulation_name: "",
      country_id: "1",
      country_name: "India",
      body_weight: "520",
      milk_protein_percent: "3.1",
      grazing: true,
      parity: "1", // not in the payload → prev
    });
  });

  it("language: backend value, else the form's, else null — never guessed from the country", () => {
    const prev = { ...EMPTY_FORM, simulation_language: "sw" };
    expect(
      restoreForm({ simulation_language: "hi" }, prev, india, "Heifer").simulation_language
    ).toBe("hi");
    expect(restoreForm({}, prev, india, "Heifer").simulation_language).toBe("sw");
    expect(restoreForm({}, EMPTY_FORM, india, "Heifer").simulation_language).toBeNull();
    expect(restoreForm({}, EMPTY_FORM, kenya, "Heifer").simulation_language).toBeNull();
  });

  it("maps feed rows, preferring the wire names for inclusion bounds", () => {
    const items = restoreFeedItems(
      {
        feed_selection: [
          {
            feed_type: "Forage",
            feed_id: "f1",
            price_per_kg: "12",
            min_kg_asfed: 2,
            max_kg_per_day: 5,
          },
          { feed_type: "Concentrate", feed_id: "f2", quantity_as_fed: "", price_per_kg: null },
        ],
      },
      42
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "feed_restored_0_42",
      feed_uuid: "f1",
      price_per_kg: 12,
      min_kg_per_day: 2,
      max_kg_per_day: 5,
      inclusion_limits_enabled: true,
    });
    expect(items[1]).toMatchObject({
      price_per_kg: null,
      quantity_kg: null,
      inclusion_limits_enabled: false,
    });
    expect(restoreFeedItems({ feed_selection: "junk" }, 1)).toEqual([]);
  });

  it("is an evaluation run only when some row carries a quantity", () => {
    expect(
      isEvaluationRun({ feed_selection: [{ quantity_as_fed: null }, { quantity_as_fed: "" }] })
    ).toBe(false);
    expect(isEvaluationRun({ feed_selection: [{ quantity_as_fed: 0 }] })).toBe(true);
  });

  it("keeps only finite diet limits, and clears them when the run has none", () => {
    expect(
      restoreDietLimits({ custom_constraints: { ash_max: "12", ee_max: "", ndf_max: "x", foo: 3 } })
    ).toEqual({ ash_max: 12 });
    expect(restoreDietLimits({})).toEqual({});
    expect(restoreDietLimits({ custom_constraints: null })).toEqual({});
  });
});
