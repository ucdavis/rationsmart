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
  getAdminUsers,
  toggleUserStatus,
  getAdminFeedTypes,
  getAdminFeedCategories,
  getAdminFeedbacks,
  getAdminFeedbackStats,
  exportAdminFeeds,
  bulkUploadFeeds,
  getAdminReports,
  getAdminFeeds,
  addAdminFeed,
  updateAdminFeed,
  deleteAdminFeed,
  addAdminFeedCategory,
  deleteAdminFeedCategory,
  addAdminFeedType,
  deleteAdminFeedType,
  exportCustomFeeds,
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getTranslationCoverage,
  upsertFeedTranslation,
  listFeedTranslations,
  deleteFeedTranslation,
  createLanguage,
  listLanguages,
  patchLanguage,
  listCountriesWithLanguages,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
} from "@/lib/api";

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  mockApi.patch.mockReset();
});

// ─── Admin users ────────────────────────────────────────────────────────────

describe("getAdminUsers", () => {
  it("GETs /v1/admin/users with defaults, renaming country_filter→country and status_filter→status", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminUsers("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/users", {
      params: { page: 1, page_size: 20, country: "", status: "", search: "" },
    });
  });

  it("forwards explicit filter values under the renamed keys", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminUsers("admin-1", 2, 50, "India", "Active", "aiya");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/users", {
      params: { page: 2, page_size: 50, country: "India", status: "Active", search: "aiya" },
    });
    // Legacy key names must NOT appear.
    const params = mockApi.get.mock.calls[0][1].params;
    expect(params).not.toHaveProperty("country_filter");
    expect(params).not.toHaveProperty("status_filter");
  });
});

describe("toggleUserStatus", () => {
  it("PUTs {action: 'activate'} when enabling a user", async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await toggleUserStatus("user-1", "admin-1", true);
    expect(mockApi.put).toHaveBeenCalledWith("/v1/admin/users/user-1/toggle-status", {
      action: "activate",
    });
  });

  it("PUTs {action: 'deactivate'} when disabling a user", async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await toggleUserStatus("user-1", "admin-1", false);
    expect(mockApi.put).toHaveBeenCalledWith("/v1/admin/users/user-1/toggle-status", {
      action: "deactivate",
    });
  });
});

describe("getAdminFeedTypes / getAdminFeedCategories", () => {
  it("GET their respective list endpoints with no query params", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    await getAdminFeedTypes("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/list-feed-types");
    await getAdminFeedCategories("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/list-feed-categories");
  });
});

describe("getAdminFeedbacks — legacy limit/offset mapped to page/page_size", () => {
  it("defaults to page=1, page_size=20", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminFeedbacks("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/user-feedback/all", {
      params: { page: 1, page_size: 20 },
    });
  });

  it("clamps page_size to a maximum of 100", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminFeedbacks("admin-1", 500, 0);
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/user-feedback/all", {
      params: { page: 1, page_size: 100 },
    });
  });

  it("derives page from offset / page_size (+1, 1-based)", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminFeedbacks("admin-1", 100, 250);
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/user-feedback/all", {
      params: { page: 3, page_size: 100 },
    });
  });
});

describe("getAdminFeedbackStats", () => {
  it("GETs /v1/admin/user-feedback/stats", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await getAdminFeedbackStats("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/user-feedback/stats");
  });
});

describe("exportAdminFeeds / exportCustomFeeds", () => {
  it("request blob responseType on their respective export endpoints", async () => {
    mockApi.get.mockResolvedValue({ data: new Blob() });
    await exportAdminFeeds("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/export-feeds", { responseType: "blob" });
    await exportCustomFeeds("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/export-custom-feeds", {
      responseType: "blob",
    });
  });
});

describe("bulkUploadFeeds", () => {
  it("POSTs a multipart FormData body without an explicit Content-Type header", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { success: true } });
    const file = new File(["a,b,c"], "feeds.csv", { type: "text/csv" });
    await bulkUploadFeeds("admin-1", file);

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockApi.post.mock.calls[0];
    expect(url).toBe("/v1/admin/bulk-upload-feeds");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
    // CRITICAL (CLAUDE.md §18.5): no headers key at all — letting the browser
    // set the multipart boundary is what makes the upload parseable server-side.
    expect(config).not.toHaveProperty("headers");
    expect(config).toHaveProperty("onUploadProgress");
  });

  it("reports upload progress as a rounded percentage via onProgress", async () => {
    mockApi.post.mockImplementationOnce((_url, _body, config) => {
      config.onUploadProgress({ loaded: 33, total: 100 });
      return Promise.resolve({ data: {} });
    });
    const onProgress = vi.fn();
    const file = new File(["x"], "f.csv");
    await bulkUploadFeeds("admin-1", file, onProgress);
    expect(onProgress).toHaveBeenCalledWith(33);
  });

  it("does not call onProgress when the event has no total (unknown length)", async () => {
    mockApi.post.mockImplementationOnce((_url, _body, config) => {
      config.onUploadProgress({ loaded: 10, total: 0 });
      return Promise.resolve({ data: {} });
    });
    const onProgress = vi.fn();
    await bulkUploadFeeds("admin-1", new File(["x"], "f.csv"), onProgress);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("getAdminReports", () => {
  it("GETs /v1/admin/get-all-reports/ with default page=1, page_size=20", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminReports("user-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/get-all-reports/", {
      params: { page: 1, page_size: 20 },
    });
  });
});

// ─── Admin feed CRUD ────────────────────────────────────────────────────────

describe("getAdminFeeds", () => {
  it("GETs /v1/admin/list-feeds with all filter defaults", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminFeeds("admin-1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/list-feeds", {
      params: {
        page: 1,
        page_size: 20,
        feed_type: "",
        feed_category: "",
        country_name: "",
        search: "",
      },
    });
  });

  it("forwards explicit filters", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await getAdminFeeds("admin-1", 2, 10, "Forage", "Grass", "India", "hay");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/list-feeds", {
      params: {
        page: 2,
        page_size: 10,
        feed_type: "Forage",
        feed_category: "Grass",
        country_name: "India",
        search: "hay",
      },
    });
  });
});

describe("addAdminFeed", () => {
  it("POSTs the body to /v1/admin/add-feed", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const body = { fd_name: "Maize" };
    await addAdminFeed("admin-1", body);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/add-feed", body);
  });
});

describe("updateAdminFeed", () => {
  it("PUTs to /v1/admin/update-feed/{feed_id} with the feed_id interpolated into the path", async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    const body = { fd_name: "Maize v2" };
    await updateAdminFeed("feed-42", "admin-1", body);
    expect(mockApi.put).toHaveBeenCalledWith("/v1/admin/update-feed/feed-42", body);
  });
});

describe("deleteAdminFeed", () => {
  it("DELETEs /v1/admin/delete-feed/{feed_id}", async () => {
    mockApi.delete.mockResolvedValueOnce({ data: {} });
    await deleteAdminFeed("feed-42", "admin-1");
    expect(mockApi.delete).toHaveBeenCalledWith("/v1/admin/delete-feed/feed-42");
  });
});

describe("addAdminFeedCategory", () => {
  it("POSTs the category body to /v1/admin/add-feed-category", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const body = { category_name: "Grain", description: "d", feed_type_id: "1", sort_order: 0 };
    await addAdminFeedCategory("admin-1", body);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/add-feed-category", body);
  });
});

describe("deleteAdminFeedCategory", () => {
  it("DELETEs /v1/admin/delete-feed-category/{category_id}", async () => {
    mockApi.delete.mockResolvedValueOnce({ data: {} });
    await deleteAdminFeedCategory("cat-1", "admin-1");
    expect(mockApi.delete).toHaveBeenCalledWith("/v1/admin/delete-feed-category/cat-1");
  });
});

describe("addAdminFeedType", () => {
  it("POSTs the type body to /v1/admin/add-feed-type", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const body = { type_name: "Forage", description: "d", sort_order: 0 };
    await addAdminFeedType("admin-1", body);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/add-feed-type", body);
  });
});

describe("deleteAdminFeedType", () => {
  it("DELETEs /v1/admin/delete-feed-type/{type_id}", async () => {
    mockApi.delete.mockResolvedValueOnce({ data: {} });
    await deleteAdminFeedType("type-1", "admin-1");
    expect(mockApi.delete).toHaveBeenCalledWith("/v1/admin/delete-feed-type/type-1");
  });
});

// ─── i18n V2 Phase 2 ────────────────────────────────────────────────────────

describe("downloadTranslationWorkbook", () => {
  it("GETs the workbook endpoint with {country_id} and blob responseType", async () => {
    mockApi.get.mockResolvedValueOnce({ data: new Blob() });
    await downloadTranslationWorkbook("7");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/translations/workbook", {
      params: { country_id: "7" },
      responseType: "blob",
    });
  });
});

describe("uploadTranslationWorkbook", () => {
  it("POSTs a multipart FormData with country_id as a query param, no explicit Content-Type", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const file = new File(["x"], "workbook.xlsx");
    await uploadTranslationWorkbook("7", file);
    const [url, body, config] = mockApi.post.mock.calls[0];
    expect(url).toBe("/v1/admin/translations/workbook");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
    expect(config).toEqual({ params: { country_id: "7" } });
  });
});

describe("getTranslationCoverage", () => {
  it("GETs the coverage endpoint with {country_id, lang}", async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} });
    await getTranslationCoverage("7", "hi");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/translations/coverage", {
      params: { country_id: "7", lang: "hi" },
    });
  });
});

describe("feed-level translation CRUD (3.4-3.6)", () => {
  it("upsertFeedTranslation POSTs the body to /v1/admin/translations", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const body = { feed_id: "f1", language: "hi", name: "मक्का" };
    await upsertFeedTranslation(body);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/translations", body);
  });

  it("listFeedTranslations GETs /v1/admin/translations/{feed_id}", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await listFeedTranslations("f1");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/translations/f1");
  });

  it("deleteFeedTranslation DELETEs /v1/admin/translations/{feed_id}/{language}", async () => {
    mockApi.delete.mockResolvedValueOnce({ data: {} });
    await deleteFeedTranslation("f1", "hi");
    expect(mockApi.delete).toHaveBeenCalledWith("/v1/admin/translations/f1/hi");
  });
});

describe("language catalog CRUD (4.1-4.6)", () => {
  it("createLanguage POSTs {code, name} to /v1/admin/languages", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await createLanguage({ code: "hi", name: "Hindi" });
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/languages", { code: "hi", name: "Hindi" });
  });

  it("listLanguages GETs /v1/admin/languages", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await listLanguages();
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/languages");
  });

  it("patchLanguage PATCHes /v1/admin/languages/{code} with the partial body", async () => {
    mockApi.patch.mockResolvedValueOnce({ data: {} });
    await patchLanguage("hi", { is_active: false });
    expect(mockApi.patch).toHaveBeenCalledWith("/v1/admin/languages/hi", { is_active: false });
  });

  it("listCountriesWithLanguages GETs /v1/admin/countries", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });
    await listCountriesWithLanguages();
    expect(mockApi.get).toHaveBeenCalledWith("/v1/admin/countries");
  });

  it("assignLanguageToCountry POSTs /v1/admin/countries/{country_id}/languages/{code} with no body", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await assignLanguageToCountry("7", "hi");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/admin/countries/7/languages/hi");
    expect(mockApi.post.mock.calls[0]).toHaveLength(1);
  });

  it("unassignLanguageFromCountry DELETEs /v1/admin/countries/{country_id}/languages/{code}", async () => {
    mockApi.delete.mockResolvedValueOnce({ data: {} });
    await unassignLanguageFromCountry("7", "hi");
    expect(mockApi.delete).toHaveBeenCalledWith("/v1/admin/countries/7/languages/hi");
  });
});
