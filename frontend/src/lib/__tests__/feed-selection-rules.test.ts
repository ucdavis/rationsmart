import { describe, it, expect } from "vitest";
import { filledFeedCount, isFeedOnOtherCard } from "@/lib/feed-selection-rules";

const cards = [
  { id: "a", feed_uuid: "napier", sub_category_name: "Napier" },
  { id: "b", feed_uuid: null, sub_category_name: "" },
  { id: "c", feed_uuid: null, sub_category_name: "Restored by name" },
];

describe("feed-selection rules", () => {
  it("counts the cards that have a feed (N8)", () => {
    expect(filledFeedCount(cards)).toBe(2);
    expect(filledFeedCount([])).toBe(0);
    expect(filledFeedCount(null)).toBe(0);
  });

  it("finds a feed held by ANOTHER card only", () => {
    expect(isFeedOnOtherCard(cards, "napier", "b")).toBe(true);
    expect(isFeedOnOtherCard(cards, "napier", "a")).toBe(false);
    expect(isFeedOnOtherCard(cards, "maize", "b")).toBe(false);
    expect(isFeedOnOtherCard(cards, null, "b")).toBe(false);
  });
});
