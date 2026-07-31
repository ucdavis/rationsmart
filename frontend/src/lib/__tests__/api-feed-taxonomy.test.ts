import { describe, it, expect, beforeEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock("axios", () => ({
  default: { create: () => mockApi },
}));

import {
  getFeedTypes,
  getFeedTypesLocalized,
  getFeedCategories,
  getFeedCategoriesLocalized,
  getFeedSubCategories,
  fetchFeedTaxonomyLabels,
  evaluateDiet,
  recommendDiet,
  getFeedClassification,
  searchFeeds,
  setLangProvider,
  DEFAULT_BASE_THRESHOLDS,
  type EvaluationRequest,
  type RecommendationRequest,
} from "@/lib/api";

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  mockApi.patch.mockReset();
  setLangProvider(() => "en");
});

// ─── Feed taxonomy ──────────────────────────────────────────────────────────

describe("getFeedTypes", () => {
  it("GETs /v1/animal/unique-feed-type/{country_id} with lang FORCED to en, no user_id, regardless of active locale", async () => {
    setLangProvider(() => "hi");
    mockApi.get.mockResolvedValueOnce({ data: ["Forage", "Concentrate"] });
    await getFeedTypes("7", "unused-user-id");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/unique-feed-type/7", {
      params: { lang: "en" },
    });
  });

  it("getFeedTypesLocalized is the same function reference (simple alias)", () => {
    expect(getFeedTypesLocalized).toBe(getFeedTypes);
  });
});

describe("getFeedCategories", () => {
  it("GETs /v1/animal/unique-feed-category with {country_id, feed_type}, lang FORCED to en regardless of active locale", async () => {
    setLangProvider(() => "hi");
    mockApi.get.mockResolvedValueOnce({ data: ["Grain"] });
    await getFeedCategories("Concentrate", "7");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/unique-feed-category", {
      params: { country_id: "7", feed_type: "Concentrate", lang: "en" },
    });
  });

  it("getFeedCategoriesLocalized forwards to getFeedCategories with the same params", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getFeedCategoriesLocalized("Concentrate", "7");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/unique-feed-category", {
      params: { country_id: "7", feed_type: "Concentrate", lang: "en" },
    });
  });
});

describe("getFeedSubCategories", () => {
  it("GETs /v1/animal/feed-name with feed_category renamed to `category`, FORCED lang=en regardless of active locale (identity must stay complete)", async () => {
    setLangProvider(() => "vi");
    mockApi.get.mockResolvedValueOnce({ data: [{ feed_name: "Maize", feed_uuid: "u1" }] });
    await getFeedSubCategories("Concentrate", "Grain", "7", "unused-user-id");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/feed-name", {
      params: { country_id: "7", feed_type: "Concentrate", category: "Grain", lang: "en" },
    });
  });
});

describe("fetchFeedTaxonomyLabels", () => {
  it("GETs /v1/animal/feed-name?country_id=&lang= (no type/category filter)", async () => {
    setLangProvider(() => "hi");
    mockApi.get.mockResolvedValueOnce({ data: { standard_feeds: [], custom_feeds: [] } });
    await fetchFeedTaxonomyLabels("7");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/feed-name", {
      params: { country_id: "7", lang: "hi" },
    });
  });

  it("builds English→localized maps from both standard_feeds and custom_feeds", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        standard_feeds: [
          {
            fd_type: "Forage",
            display_type: "चारा",
            fd_category: "Grass",
            display_category: "घास",
          },
        ],
        custom_feeds: [
          {
            fd_type: "Concentrate",
            display_type: "सांद्रण",
            fd_category: "Grain",
            display_category: "अनाज",
          },
        ],
      },
    });
    const labels = await fetchFeedTaxonomyLabels("7");
    expect(labels.types).toEqual({ Forage: "चारा", Concentrate: "सांद्रण" });
    expect(labels.categories).toEqual({ Grass: "घास", Grain: "अनाज" });
  });

  it("skips entries missing either the English source or the display field", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        standard_feeds: [
          {
            fd_type: "Forage" /* no display_type */,
            fd_category: "Grass",
            display_category: "घास",
          },
          { display_type: "सांद्रण" /* no fd_type */ },
        ],
      },
    });
    const labels = await fetchFeedTaxonomyLabels("7");
    expect(labels.types).toEqual({});
    expect(labels.categories).toEqual({ Grass: "घास" });
  });

  it("tolerates a missing/empty response body", async () => {
    mockApi.get.mockResolvedValueOnce({ data: null });
    const labels = await fetchFeedTaxonomyLabels("7");
    expect(labels).toEqual({ types: {}, categories: {}, feeds: {} });
  });

  it("builds a feed id → display_name map from both standard_feeds and custom_feeds", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        standard_feeds: [{ id: "f1", fd_name: "Maize", display_name: "मक्का" }],
        custom_feeds: [{ id: "f2", fd_name: "Wheat bran", display_name: "गेहूं की भूसी" }],
      },
    });
    const labels = await fetchFeedTaxonomyLabels("7");
    expect(labels.feeds).toEqual({ f1: "मक्का", f2: "गेहूं की भूसी" });
  });
});

// ─── Diet ───────────────────────────────────────────────────────────────────

describe("evaluateDiet", () => {
  it("POSTs the EvaluationRequest verbatim to /v1/animal/evaluate-diet", async () => {
    const req = { user_id: "u1", country_id: "1", currency: "INR" } as unknown as EvaluationRequest;
    mockApi.post.mockResolvedValueOnce({ data: { mode: "evaluation" } });
    await evaluateDiet(req);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/evaluate-diet", req);
  });
});

describe("recommendDiet", () => {
  it("POSTs the RecommendationRequest to /v1/animal/diet-recommendation, forwarding base_thresholds unchanged", async () => {
    const req = {
      user_id: "u1",
      country_id: "1",
      simulation_id: "s1",
      cattle_info: {},
      feed_selection: [],
      base_thresholds: { ...DEFAULT_BASE_THRESHOLDS, ash_max: 12 },
    } as unknown as RecommendationRequest;
    mockApi.post.mockResolvedValueOnce({ data: { mode: "recommendation" } });
    await recommendDiet(req);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/diet-recommendation", req);
    // The helper does not merge/mutate base_thresholds — that's the caller's job
    // (see feed-selection page). Verify it isn't silently replaced with defaults.
    const sentBody = mockApi.post.mock.calls[0][1] as RecommendationRequest;
    expect(sentBody.base_thresholds).toEqual({ ...DEFAULT_BASE_THRESHOLDS, ash_max: 12 });
  });
});

describe("getFeedClassification", () => {
  it("GETs /v1/feed-classification/structure", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await getFeedClassification();
    expect(mockApi.get).toHaveBeenCalledWith("/v1/feed-classification/structure");
  });
});

// ─── searchFeeds ────────────────────────────────────────────────────────────

describe("searchFeeds", () => {
  it("short-circuits to {data: []} without an API call when query is blank", async () => {
    const res = await searchFeeds("   ", "1", "u1");
    expect(res).toEqual({ data: [] });
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it("short-circuits to {data: []} without an API call when country_id is empty", async () => {
    const res = await searchFeeds("maize", "", "u1");
    expect(res).toEqual({ data: [] });
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it("sends the trimmed query, country_id, a fixed limit of 20, and ?lang=", async () => {
    setLangProvider(() => "th");
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await searchFeeds("  maize  ", "7", "u1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/search-feeds", {
      params: { query: "maize", country_id: "7", limit: 20, lang: "th" },
    });
  });

  it("accepts a bare array response", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        { feed_uuid: "u1", feed_name: "Maize", feed_type: "Concentrate", feed_category: "Grain" },
      ],
    });
    const res = await searchFeeds("maize", "7", "u1");
    expect(res.data).toHaveLength(1);
    expect(res.data[0].feed_uuid).toBe("u1");
  });

  it("accepts a {feeds: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: { feeds: [{ feed_uuid: "u1", feed_name: "Maize" }], total_count: 1 },
    });
    const res = await searchFeeds("maize", "7", "u1");
    expect(res.data).toHaveLength(1);
  });

  it("dedupes rows that share a feed_uuid (backend returns N identical copies)", async () => {
    // Mirrors the real bug: a "sugarcane" search returned 24 rows, all the
    // same feed_uuid / fd_code. The picker must collapse them to one entry.
    const dupe = {
      feed_uuid: "66acc192-9490-4ae1-9cd0-c22a1cb3fabf",
      feed_name: "Sugarcane tops, Wet season",
      feed_type: "Forage",
      feed_category: "By-Product/Other-Forage",
    };
    mockApi.get.mockResolvedValueOnce({
      data: { feeds: Array.from({ length: 24 }, () => ({ ...dupe })), total_count: 24 },
    });
    const res = await searchFeeds("sugarcane", "7", "u1");
    expect(res.data).toHaveLength(1);
    expect(res.data[0].feed_uuid).toBe("66acc192-9490-4ae1-9cd0-c22a1cb3fabf");
  });

  it("keeps distinct feeds that share a display name but differ by feed_uuid", async () => {
    // Guard against over-deduping: same name, different uuid = real choices.
    mockApi.get.mockResolvedValueOnce({
      data: {
        feeds: [
          { feed_uuid: "a", feed_name: "Sugarcane tops", feed_type: "Forage" },
          { feed_uuid: "b", feed_name: "Sugarcane tops", feed_type: "Forage" },
        ],
      },
    });
    const res = await searchFeeds("sugarcane", "7", "u1");
    expect(res.data).toHaveLength(2);
  });

  it("accepts a {results: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: { results: [{ feed_uuid: "u1", feed_name: "Maize" }] },
    });
    const res = await searchFeeds("maize", "7", "u1");
    expect(res.data).toHaveLength(1);
  });

  it("concatenates {standard_feeds, custom_feeds} and flags only custom_feeds as is_custom", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        standard_feeds: [{ feed_uuid: "s1", feed_name: "Standard Feed" }],
        custom_feeds: [{ feed_uuid: "c1", feed_name: "Custom Feed" }],
      },
    });
    const res = await searchFeeds("feed", "7", "u1");
    expect(res.data).toHaveLength(2);
    const std = res.data.find((r) => r.feed_uuid === "s1")!;
    const custom = res.data.find((r) => r.feed_uuid === "c1")!;
    expect(std.is_custom).toBeUndefined();
    expect(custom.is_custom).toBe(true);
  });

  it("normalizeRow prefers fd_name > feed_name > name, and feed_uuid > feed_id > id", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        {
          id: "id1",
          feed_id: "fid1",
          feed_uuid: "uuid1",
          fd_name: "FdName",
          feed_name: "FeedName",
          name: "Name",
        },
      ],
    });
    const res = await searchFeeds("x", "7", "u1");
    expect(res.data[0].feed_uuid).toBe("uuid1");
    expect(res.data[0].feed_name).toBe("FdName");
  });

  it("filters out rows missing an identity (feed_uuid) or a name", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        { feed_uuid: "u1" /* no name */ },
        { feed_name: "No UUID" /* no id */ },
        { feed_uuid: "u2", feed_name: "Valid" },
      ],
    });
    const res = await searchFeeds("x", "7", "u1");
    expect(res.data).toHaveLength(1);
    expect(res.data[0].feed_uuid).toBe("u2");
  });

  it("display_* fields fall back to the English source when absent", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        { feed_uuid: "u1", feed_name: "Maize", feed_type: "Concentrate", feed_category: "Grain" },
      ],
    });
    const res = await searchFeeds("x", "7", "u1");
    expect(res.data[0].display_name).toBe("Maize");
    expect(res.data[0].display_type).toBe("Concentrate");
    expect(res.data[0].display_category).toBe("Grain");
  });

  it("display_* fields are preferred over the English source when present", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        {
          feed_uuid: "u1",
          feed_name: "Maize",
          feed_type: "Concentrate",
          feed_category: "Grain",
          display_name: "मक्का",
          display_type: "सांद्रण",
          display_category: "अनाज",
        },
      ],
    });
    const res = await searchFeeds("x", "7", "u1");
    expect(res.data[0].display_name).toBe("मक्का");
  });

  it("swallows request failures and returns {data: []} instead of throwing", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("network down"));
    const res = await searchFeeds("x", "7", "u1");
    expect(res).toEqual({ data: [] });
  });

  it("returns an empty array for an unrecognized response shape", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { unexpected: "shape" } });
    const res = await searchFeeds("x", "7", "u1");
    expect(res).toEqual({ data: [] });
  });
});
