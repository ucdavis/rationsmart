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
  getSavedReports,
  getUserReports,
  saveReport,
  getSimulationDetails,
  submitFeedback,
  getMyFeedback,
  checkInsertOrUpdate,
  insertCustomFeed,
  updateCustomFeed,
} from "@/lib/api";

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  mockApi.patch.mockReset();
});

// ─── Reports ────────────────────────────────────────────────────────────────

describe("getSavedReports", () => {
  // getSavedReports always queries BOTH /v1/animal/reports and
  // /v1/animal/user-reports (via Promise.all) and merges the results,
  // deduped by report_id — because either endpoint has independently
  // been seen in production to omit entries (most notably the
  // just-saved report) that the other one has. Every test therefore
  // mocks two sequential mockApi.get calls: the first is always
  // /v1/animal/reports, the second /v1/animal/user-reports.

  it("normalizes a bare array response from /v1/animal/reports", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [{ report_id: "r1" }] });
    mockApi.get.mockResolvedValueOnce({ data: [] });
    const res = await getSavedReports("u1");
    expect(mockApi.get).toHaveBeenNthCalledWith(1, "/v1/animal/reports");
    expect(mockApi.get).toHaveBeenNthCalledWith(2, "/v1/animal/user-reports");
    expect(res.data).toEqual({ reports: [{ report_id: "r1" }], success: true, message: null });
  });

  it("normalizes a {reports: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { reports: [{ report_id: "r2" }] } });
    mockApi.get.mockResolvedValueOnce({ data: [] });
    const res = await getSavedReports("u1");
    expect(res.data.reports).toEqual([{ report_id: "r2" }]);
  });

  it("normalizes a {items: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [{ report_id: "r3" }] } });
    mockApi.get.mockResolvedValueOnce({ data: [] });
    const res = await getSavedReports("u1");
    expect(res.data.reports).toEqual([{ report_id: "r3" }]);
  });

  it("normalizes an unrecognized shape to an empty reports array", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { nonsense: true } });
    mockApi.get.mockResolvedValueOnce({ data: [] });
    const res = await getSavedReports("u1");
    expect(res.data.reports).toEqual([]);
  });

  it("falls back to /v1/animal/user-reports's reports when /v1/animal/reports throws", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("404"));
    mockApi.get.mockResolvedValueOnce({ data: { reports: [{ report_id: "legacy" }] } });

    const res = await getSavedReports("u1");

    expect(mockApi.get).toHaveBeenNthCalledWith(1, "/v1/animal/reports");
    expect(mockApi.get).toHaveBeenNthCalledWith(2, "/v1/animal/user-reports");
    expect(res.data.reports).toEqual([{ report_id: "legacy" }]);
  });

  it("merges reports from both endpoints, deduped by report_id — covers the 'missing latest entry' regression", async () => {
    // /v1/animal/reports is missing the newest report (r2)...
    mockApi.get.mockResolvedValueOnce({ data: [{ report_id: "r1", simulation_id: "s1" }] });
    // ...but /v1/animal/user-reports has both.
    mockApi.get.mockResolvedValueOnce({
      data: {
        reports: [
          { report_id: "r1", simulation_id: "s1" },
          { report_id: "r2", simulation_id: "s2" },
        ],
      },
    });

    const res = await getSavedReports("u1");

    expect(res.data.reports).toHaveLength(2);
    expect(res.data.reports.map((r) => r.report_id).sort()).toEqual(["r1", "r2"]);
  });

  it("dedupes by simulation_id when report_id is null on both copies of the same row", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [{ report_id: null, simulation_id: "s1" }] });
    mockApi.get.mockResolvedValueOnce({ data: [{ report_id: null, simulation_id: "s1" }] });

    const res = await getSavedReports("u1");

    expect(res.data.reports).toHaveLength(1);
  });

  it("both endpoints failing resolves to an empty list instead of throwing", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("down"));
    mockApi.get.mockRejectedValueOnce(new Error("also down"));

    const res = await getSavedReports("u1");

    expect(res.data).toEqual({ reports: [], success: true, message: null });
  });
});

describe("getUserReports", () => {
  it("GETs /v1/animal/simulations with no params (user_id JWT-derived)", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getUserReports("u1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/simulations");
  });
});

describe("saveReport", () => {
  it("POSTs {report_id, user_id} to /v1/animal/save-report", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await saveReport("r1", "u1");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/save-report", {
      report_id: "r1",
      user_id: "u1",
    });
  });
});

describe("getSimulationDetails", () => {
  it("GETs /v1/animal/simulations/{report_id} with the id URI-encoded", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await getSimulationDetails("r1/with slash", "u1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/simulations/r1%2Fwith%20slash");
  });
});

// ─── Feedback ───────────────────────────────────────────────────────────────

describe("submitFeedback", () => {
  it("POSTs the feedback payload to /v1/user-feedback/submit without a user_id", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await submitFeedback("u1", {
      feedback_type: "General",
      text_feedback: "great",
      overall_rating: 5,
    });
    expect(mockApi.post).toHaveBeenCalledWith("/v1/user-feedback/submit", {
      feedback_type: "General",
      text_feedback: "great",
      overall_rating: 5,
    });
  });
});

describe("getMyFeedback", () => {
  it("GETs /v1/user-feedback/my with default limit=50, offset=0", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getMyFeedback("u1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/user-feedback/my", {
      params: { limit: 50, offset: 0 },
    });
  });

  it("forwards explicit limit/offset", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getMyFeedback("u1", 5, 10);
    expect(mockApi.get).toHaveBeenCalledWith("/v1/user-feedback/my", {
      params: { limit: 5, offset: 10 },
    });
  });
});

// ─── Custom feed ────────────────────────────────────────────────────────────

describe("checkInsertOrUpdate", () => {
  it("POSTs to /v1/animal/custom-feeds/check with a null body and feed_id as a query param", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { insert_feed: true, feed_details: {} } });
    await checkInsertOrUpdate("country-1", "some-feed-uuid", "user-1");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/custom-feeds/check", null, {
      params: { feed_id: "some-feed-uuid" },
    });
  });

  it("forwards whatever feed_id it's given — a trimmed feed NAME works exactly the same as a feed_uuid", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { insert_feed: false, feed_details: {} } });
    await checkInsertOrUpdate("country-1", "John-MyCustomFeed", "user-1");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/custom-feeds/check", null, {
      params: { feed_id: "John-MyCustomFeed" },
    });
  });
});

describe("insertCustomFeed", () => {
  it("POSTs the full body to /v1/animal/custom-feeds", async () => {
    const body = {
      country_id: "1",
      user_id: "u1",
      feed_insert: true,
      feed_details: { fd_name: "X" },
    };
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await insertCustomFeed(body);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/custom-feeds", body);
  });
});

describe("updateCustomFeed", () => {
  it("PUTs the body to /v1/animal/custom-feeds AND repeats feed_id as a query param", async () => {
    const body = {
      country_id: "1",
      user_id: "u1",
      feed_id: "feed-uuid-1",
      feed_insert: false,
      feed_details: { fd_name: "X" },
    };
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await updateCustomFeed(body);
    expect(mockApi.put).toHaveBeenCalledWith("/v1/animal/custom-feeds", body, {
      params: { feed_id: "feed-uuid-1" },
    });
  });
});
