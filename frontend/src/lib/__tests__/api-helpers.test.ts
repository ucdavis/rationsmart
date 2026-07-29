import { describe, it, expect, beforeEach } from "vitest";
import {
  labelForLanguage,
  LANGUAGE_NATIVE_LABELS,
  langParam,
  setLangProvider,
  setTokenProvider,
  toCattleInfoPayload,
  isLactating,
  ANIMAL_CATEGORIES,
  ANIMAL_CATEGORY_LABELS,
  DEFAULT_BASE_THRESHOLDS,
  buildDietSimulationId,
  stripDietModeSuffix,
  type CattleInfo,
} from "@/lib/api";

// Restore providers between tests so setLangProvider mutations don't
// bleed. The store wires providers at module load; we override them
// per test then reset.
beforeEach(() => {
  setLangProvider(() => "en");
  setTokenProvider(() => null);
});

// ─── labelForLanguage ─────────────────────────────────────────────────

describe("labelForLanguage / LANGUAGE_NATIVE_LABELS", () => {
  it("returns the native-script label for known codes", () => {
    expect(labelForLanguage("en")).toBe("English");
    expect(labelForLanguage("hi")).toBe("हिन्दी");
    expect(labelForLanguage("vi")).toBe("Tiếng Việt");
    expect(labelForLanguage("th")).toBe("ไทย");
    expect(labelForLanguage("bn")).toBe("বাংলা");
    expect(labelForLanguage("am")).toBe("አማርኛ");
  });

  it("falls back to the upper-case code for unknown languages", () => {
    expect(labelForLanguage("zz")).toBe("ZZ");
    expect(labelForLanguage("xh")).toBe("XH");
  });

  it("covers every rollout locale in the labels map", () => {
    const rollout = ["en", "hi", "tl", "id", "th", "vi", "bn", "ne", "am", "om"];
    for (const c of rollout) {
      expect(LANGUAGE_NATIVE_LABELS[c]).toBeTruthy();
    }
  });
});

// ─── langParam / provider wiring ──────────────────────────────────────

describe("langParam + setLangProvider", () => {
  it("defaults to 'en' when no provider is registered", () => {
    setLangProvider(() => "en");
    expect(langParam()).toEqual({ lang: "en" });
  });

  it("reflects the latest provider return value on every call", () => {
    setLangProvider(() => "hi");
    expect(langParam()).toEqual({ lang: "hi" });
    setLangProvider(() => "vi");
    expect(langParam()).toEqual({ lang: "vi" });
  });

  it("returns a fresh object each call (no mutation surprises)", () => {
    const a = langParam();
    const b = langParam();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── ANIMAL_CATEGORIES / isLactating ──────────────────────────────────

describe("animal category helpers", () => {
  it("ANIMAL_CATEGORIES lists all four values in the documented order", () => {
    expect(ANIMAL_CATEGORIES).toEqual(["Lactating Cow", "Dry Cow", "Heifer", "Baby Calf/Heifer"]);
  });

  it("ANIMAL_CATEGORY_LABELS uses plural display strings", () => {
    expect(ANIMAL_CATEGORY_LABELS["Lactating Cow"]).toBe("Lactating cows");
    expect(ANIMAL_CATEGORY_LABELS["Dry Cow"]).toBe("Dry cows");
    expect(ANIMAL_CATEGORY_LABELS["Heifer"]).toBe("Heifers");
    expect(ANIMAL_CATEGORY_LABELS["Baby Calf/Heifer"]).toBe("Baby calves/heifers");
  });

  it("isLactating is true only for Lactating Cow", () => {
    expect(isLactating("Lactating Cow")).toBe(true);
    expect(isLactating("Dry Cow")).toBe(false);
    expect(isLactating("Heifer")).toBe(false);
    expect(isLactating("Baby Calf/Heifer")).toBe(false);
  });
});

// ─── DEFAULT_BASE_THRESHOLDS ──────────────────────────────────────────

describe("DEFAULT_BASE_THRESHOLDS", () => {
  it("matches the Android defaults exactly", () => {
    expect(DEFAULT_BASE_THRESHOLDS).toEqual({
      ash_max: 10,
      ee_max: 7,
      ndf_max: 45,
      starch_max: 26,
    });
  });
});

// ─── buildDietSimulationId / stripDietModeSuffix ────────────────────────
// Backend has no field distinct from simulation_id for a display name —
// it treats simulation_id AS the identifier. buildDietSimulationId
// appends a mode suffix so Simulation History doesn't collapse two
// generates of the same case under one row; stripDietModeSuffix undoes
// that when restoring a saved simulation's echoed simulation_id back
// into the editable Simulation Name field, so regenerating from a
// restored row doesn't compound the suffix.

describe("buildDietSimulationId", () => {
  it("appends (Recommendation) / (Evaluation) to a clean base name", () => {
    expect(buildDietSimulationId("Sim 1", false)).toBe("Sim 1 (Recommendation)");
    expect(buildDietSimulationId("Sim 1", true)).toBe("Sim 1 (Evaluation)");
  });

  it("does not compound when the base name already carries a suffix from a restored simulation", () => {
    // This is the exact bug: restoring "Sim 1 (Recommendation)" (the
    // backend's echoed simulation_id) into cattleInfo.simulation_name,
    // then generating again, must NOT produce "Sim 1 (Recommendation)
    // (Recommendation)".
    expect(buildDietSimulationId("Sim 1 (Recommendation)", false)).toBe("Sim 1 (Recommendation)");
    expect(buildDietSimulationId("Sim 1 (Recommendation)", true)).toBe("Sim 1 (Evaluation)");
    expect(buildDietSimulationId("Sim 1 (Evaluation)", false)).toBe("Sim 1 (Recommendation)");
  });
});

describe("stripDietModeSuffix", () => {
  it("removes a trailing (Recommendation) or (Evaluation)", () => {
    expect(stripDietModeSuffix("Sim 1 (Recommendation)")).toBe("Sim 1");
    expect(stripDietModeSuffix("Sim 1 (Evaluation)")).toBe("Sim 1");
  });

  it("leaves a name with no recognized suffix untouched", () => {
    expect(stripDietModeSuffix("Sim 1")).toBe("Sim 1");
    expect(stripDietModeSuffix("SIM-1")).toBe("SIM-1");
  });

  it("only strips a single trailing suffix, not one baked into the middle of the name", () => {
    expect(stripDietModeSuffix("Sim (Recommendation) 1")).toBe("Sim (Recommendation) 1");
  });
});

// ─── toCattleInfoPayload ──────────────────────────────────────────────

function makeCattleInfo(over: Partial<CattleInfo> = {}): CattleInfo {
  return {
    simulation_name: "s1",
    country: "India",
    country_id: "1",
    breed: "Cross Bred",
    body_weight: 500,
    body_weight_gain: 0.5,
    body_condition_score: 3,
    parity: 2,
    days_in_milk: 150,
    days_of_pregnancy: 80,
    milk_production: 15,
    milk_protein_percent: 3.4,
    milk_fat_percent: 4.1,
    average_temperature: 26,
    grazing: false,
    distance: 0,
    topography: "Flat",
    milk_price: 50,
    animal_category: "Lactating Cow",
    ...over,
  };
}

describe("toCattleInfoPayload — Lactating Cow (default)", () => {
  const p = toCattleInfoPayload(makeCattleInfo());

  it("maps human-readable field names to Android API names", () => {
    expect(p.bc_score).toBe(3);
    expect(p.bw_gain).toBe(0.5);
    expect(p.tp_milk).toBe(3.4);
    expect(p.fat_milk).toBe(4.1);
    expect(p.temperature).toBe(26);
  });

  it("hardcodes calving_interval to 370 (Android parity)", () => {
    expect(p.calving_interval).toBe(370);
  });

  it("carries lactating=true for Lactating Cow", () => {
    expect(p.lactating).toBe(true);
  });

  it("keeps all milk-side numerics when lactating", () => {
    expect(p.days_in_milk).toBe(150);
    expect(p.milk_production).toBe(15);
    expect(p.fat_milk).toBe(4.1);
    expect(p.tp_milk).toBe(3.4);
    expect(p.milk_price).toBe(50);
  });

  it("sends the store's animal_category on the wire as physiological_state", () => {
    expect(p.physiological_state).toBe("Lactating Cow");
  });
});

describe("toCattleInfoPayload — non-lactating categories zero out milk fields", () => {
  it.each(["Dry Cow", "Heifer", "Baby Calf/Heifer"] as const)(
    "%s → lactating=false, all milk-side numerics zeroed and milk_price null",
    (cat) => {
      const p = toCattleInfoPayload(makeCattleInfo({ animal_category: cat }));
      expect(p.lactating).toBe(false);
      expect(p.days_in_milk).toBe(0);
      expect(p.milk_production).toBe(0);
      expect(p.fat_milk).toBe(0);
      expect(p.tp_milk).toBe(0);
      expect(p.milk_price).toBeNull();
    }
  );
});

describe("toCattleInfoPayload — grazing rules", () => {
  it("grazing=false ⇒ distance forced to 0 even if UI had a value", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ grazing: false, distance: 5 }));
    expect(p.grazing).toBe(false);
    expect(p.distance).toBe(0);
  });

  it("grazing=false ⇒ topography forced to 'Flat'", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ grazing: false, topography: "Hilly" }));
    expect(p.topography).toBe("Flat");
  });

  it("grazing=true ⇒ distance + topography are preserved", () => {
    const p = toCattleInfoPayload(
      makeCattleInfo({ grazing: true, distance: 5, topography: "Hilly" })
    );
    expect(p.grazing).toBe(true);
    expect(p.distance).toBe(5);
    expect(p.topography).toBe("Hilly");
  });

  it("grazing=true + distance null ⇒ falls back to 0", () => {
    const p = toCattleInfoPayload(
      makeCattleInfo({ grazing: true, distance: null as unknown as number })
    );
    expect(p.distance).toBe(0);
  });

  it("grazing=true + topography null/undefined ⇒ falls back to 'Flat'", () => {
    const p = toCattleInfoPayload(
      makeCattleInfo({ grazing: true, topography: undefined as unknown as string })
    );
    expect(p.topography).toBe("Flat");
  });
});

describe("toCattleInfoPayload — milk_price handling", () => {
  it("null milk_price stays null when lactating", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ milk_price: null }));
    expect(p.milk_price).toBeNull();
  });

  it("undefined milk_price is coerced to null", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ milk_price: undefined as unknown as number }));
    expect(p.milk_price).toBeNull();
  });

  it("numeric milk_price is preserved when lactating", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ milk_price: 42.5 }));
    expect(p.milk_price).toBe(42.5);
  });

  it("non-lactating always sends null even with a value set", () => {
    const p = toCattleInfoPayload(makeCattleInfo({ animal_category: "Dry Cow", milk_price: 42 }));
    expect(p.milk_price).toBeNull();
  });
});
