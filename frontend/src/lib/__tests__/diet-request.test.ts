import { describe, it, expect } from "vitest";
import {
  buildEvaluationRequest,
  buildRecommendationRequest,
  checkedLimits,
  sendableFeeds,
} from "@/lib/diet-request";
import type { CattleInfo, DietThresholdSpec, FeedItem } from "@/lib/api";

const cattle = { simulation_name: "Sim 1", country_id: "c1" } as unknown as CattleInfo;
const row = (over: Partial<FeedItem>): FeedItem =>
  ({
    id: "r",
    feed_uuid: "f1",
    price_per_kg: 10,
    quantity_kg: 2,
    inclusion_limits_enabled: false,
    min_kg_per_day: null,
    max_kg_per_day: null,
    ...over,
  }) as FeedItem;
const spec = (key: string) => ({ key }) as unknown as DietThresholdSpec;

describe("diet-request (audit B-17 extraction)", () => {
  it("only sends rows with a feed and a price", () => {
    expect(
      sendableFeeds([row({}), row({ feed_uuid: null }), row({ price_per_kg: null })])
    ).toHaveLength(1);
  });

  it("keeps only limits the current spec lists; none without a spec", () => {
    const limits = { ash_max: 9, ee_max: 5 };
    expect(checkedLimits(limits, [spec("ash_max")])).toEqual({ ash_max: 9 });
    expect(checkedLimits(limits, null)).toEqual({});
  });

  it("builds the evaluation body with the mode-suffixed simulation id", () => {
    const body = buildEvaluationRequest({ id: "u1", currency: "INR" }, cattle, [row({})]);
    expect(body.simulation_id).toBe("Sim 1 (Evaluation)");
    expect(body.currency).toBe("INR");
    expect(body.feed_evaluation).toEqual([{ feed_id: "f1", quantity_as_fed: 2, price_per_kg: 10 }]);
  });

  it("maps inclusion bounds to the *_asfed wire names only when the toggle is on", () => {
    const body = buildRecommendationRequest(
      { id: "u1" },
      cattle,
      [
        row({ inclusion_limits_enabled: true, min_kg_per_day: 1, max_kg_per_day: 3 }),
        row({ feed_uuid: "f2", inclusion_limits_enabled: false, max_kg_per_day: 9 }),
      ],
      {}
    );
    expect(body.feed_selection).toEqual([
      { feed_id: "f1", price_per_kg: 10, min_kg_asfed: 1, max_kg_asfed: 3 },
      { feed_id: "f2", price_per_kg: 10 },
    ]);
    expect("base_thresholds" in body).toBe(false);
    expect(body.simulation_id).toBe("Sim 1 (Recommendation)");
  });

  it("includes base_thresholds only when there are limits to send", () => {
    const body = buildRecommendationRequest({ id: "u1" }, cattle, [row({})], { ash_max: 9 });
    expect(body.base_thresholds).toEqual({ ash_max: 9 });
  });
});
