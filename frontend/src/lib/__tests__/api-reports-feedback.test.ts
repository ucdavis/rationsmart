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
  requestReportPdf,
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
  // One call to /v1/animal/user-reports (W11): /v1/animal/reports runs the
  // same backend function, so querying both and merging only added load.

  it("GETs only /v1/animal/user-reports and normalizes a {reports: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { reports: [{ report_id: "r2" }] } });
    const res = await getSavedReports("u1");
    expect(mockApi.get).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledWith("/v1/animal/user-reports");
    expect(res.data).toEqual({ reports: [{ report_id: "r2" }], success: true, message: null });
  });

  it("normalizes a bare array and an {items: [...]} wrapper", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [{ report_id: "r1" }] });
    expect((await getSavedReports("u1")).data.reports).toEqual([{ report_id: "r1" }]);
    mockApi.get.mockResolvedValueOnce({ data: { items: [{ report_id: "r3" }] } });
    expect((await getSavedReports("u1")).data.reports).toEqual([{ report_id: "r3" }]);
  });

  it("normalizes an unrecognized shape to an empty reports array", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { nonsense: true } });
    expect((await getSavedReports("u1")).data.reports).toEqual([]);
  });

  it("throws when the call fails so the page can show an error (REPORTS-006)", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("boom"));
    await expect(getSavedReports("u1")).rejects.toThrow("boom");
  });
});

describe("requestReportPdf", () => {
  it("POSTs { report_id, user_id } to /v1/animal/reports/pdf (W5)", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { success: true, bucket_url: "https://x/r.pdf" } });
    const res = await requestReportPdf("R-1", "u1");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/reports/pdf", {
      report_id: "R-1",
      user_id: "u1",
    });
    expect(res.data.bucket_url).toBe("https://x/r.pdf");
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

// The v1 backend reads custom-feed fields FLAT at the top level (verified
// live): feed_name→fd_name, country_name→fd_country_name, taxonomy as
// fd_type/fd_category. The legacy {country_id,user_id,feed_insert,feed_details}
// envelope and the legacy feed_type/feed_category dupes are dropped, and
// country_code is stripped because sending it 500s the backend.
describe("insertCustomFeed", () => {
  it("flattens feed_details into the top-level v1 wire body", async () => {
    const body = {
      country_id: "1",
      user_id: "u1",
      feed_insert: true,
      feed_details: {
        feed_name: "My Feed",
        country_name: "India",
        feed_type: "Forage",
        feed_category: "Grass/Legume Forage",
        country_code: "IND",
        fd_type: "Forage",
        fd_category: "Grass/Legume Forage",
        fd_dm: 90,
      },
    };
    // The real reply is flat (N2).
    const reply = { success: true, feed_id: "f-new", fd_name: "My Feed" };
    mockApi.post.mockResolvedValueOnce({ data: reply });
    const res = await insertCustomFeed(body);
    expect(res.data).toEqual(reply);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/animal/custom-feeds", {
      fd_type: "Forage",
      fd_category: "Grass/Legume Forage",
      fd_dm: 90,
      fd_name: "My Feed",
      fd_country_name: "India",
    });
  });
});

describe("updateCustomFeed", () => {
  it("PUTs the flattened body to /v1/animal/custom-feeds with feed_id as a query param", async () => {
    const body = {
      country_id: "1",
      user_id: "u1",
      feed_id: "feed-uuid-1",
      feed_insert: false,
      feed_details: {
        feed_name: "My Feed",
        country_name: "India",
        country_code: "IND",
        fd_type: "Forage",
        fd_category: "Grass/Legume Forage",
      },
    };
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await updateCustomFeed(body);
    expect(mockApi.put).toHaveBeenCalledWith(
      "/v1/animal/custom-feeds",
      {
        fd_type: "Forage",
        fd_category: "Grass/Legume Forage",
        fd_name: "My Feed",
        fd_country_name: "India",
      },
      { params: { feed_id: "feed-uuid-1" } }
    );
  });
});
