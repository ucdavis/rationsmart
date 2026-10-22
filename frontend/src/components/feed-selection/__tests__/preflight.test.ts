import { describe, it, expect } from "vitest";
import type { DietThresholdSpec, FeedItem } from "@/lib/api";
import {
  generatePreflight,
  limitOutOfRange,
  ndfFloorAboveCeiling,
  type PreflightInput,
} from "@/components/feed-selection/preflight";

const row = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: Math.random().toString(36),
  feed_type_id: 1,
  feed_type_name: "Forage",
  category_id: 1,
  category_name: "Grass",
  sub_category_id: 1,
  sub_category_name: "Napier",
  feed_uuid: "f1",
  price_per_kg: 10,
  quantity_kg: 5,
  inclusion_limits_enabled: false,
  min_kg_per_day: null,
  max_kg_per_day: null,
  ...over,
});

const ashSpec: DietThresholdSpec = {
  key: "ash_max",
  default: 15,
  min: 5,
  max: 15,
  unit: "pct_dm",
  direction: "max",
  enforcement: "hard",
};

const run = (over: Partial<PreflightInput>) =>
  generatePreflight({
    items: [row()],
    isEvaluation: false,
    taxonomyTypes: {},
    limits: {},
    limitSpecs: null,
    animalCategory: "Lactating Cow",
    t: (s) => s,
    ...over,
  });

describe("feed-selection preflight", () => {
  it("passes a complete forage diet", () => {
    expect(run({})).toEqual({ kind: "ok" });
  });

  it("lists partially filled rows by their localized type name", () => {
    const res = run({
      items: [row(), row({ feed_uuid: null, feed_type_name: "Concentrate" })],
      taxonomyTypes: { Concentrate: "सांद्र" },
    });
    expect(res).toEqual({ kind: "incomplete", names: ["सांद्र"] });
  });

  it("blocks a negative price but allows a price of 0", () => {
    expect(run({ items: [row({ price_per_kg: -1 })] }).kind).toBe("error");
    expect(run({ items: [row({ price_per_kg: 0 })] })).toEqual({ kind: "ok" });
  });

  it("requires a quantity above 0 only in evaluation", () => {
    expect(run({ isEvaluation: true, items: [row({ quantity_kg: 0 })] }).kind).toBe("error");
    expect(run({ items: [row({ quantity_kg: 0 })] })).toEqual({ kind: "ok" });
  });

  it("requires at least one picked forage feed", () => {
    expect(run({ items: [row({ feed_type_name: "Concentrate" })] })).toEqual({ kind: "noForage" });
  });

  it("accepts a Complete diet feed in place of a forage", () => {
    expect(run({ items: [row({ feed_type_name: "Complete diet" })] })).toEqual({ kind: "ok" });
  });

  it("rejects a typed 0 bound and a minimum above the maximum", () => {
    const zero = row({ inclusion_limits_enabled: true, min_kg_per_day: 0 });
    const crossed = row({ inclusion_limits_enabled: true, min_kg_per_day: 5, max_kg_per_day: 2 });
    expect(run({ items: [zero] }).kind).toBe("error");
    expect(run({ items: [crossed] })).toEqual({
      kind: "error",
      message: "Minimum can't be more than the maximum.",
    });
  });

  it("flags a saved diet limit that is out of range for the animal", () => {
    expect(limitOutOfRange({ ash_max: 20 }, ashSpec)).toBe(true);
    expect(limitOutOfRange({ ash_max: 10 }, ashSpec)).toBe(false);
    expect(limitOutOfRange({}, ashSpec)).toBe(false);
    const res = run({ limits: { ash_max: 20 }, limitSpecs: [ashSpec] });
    expect(res.kind).toBe("error");
  });

  it("rejects a forage NDF floor above the NDF ceiling", () => {
    expect(ndfFloorAboveCeiling({ ndf_for_min: 40, ndf_max: 30 })).toBe(true);
    expect(ndfFloorAboveCeiling({ ndf_for_min: 40 })).toBe(false);
  });
});
