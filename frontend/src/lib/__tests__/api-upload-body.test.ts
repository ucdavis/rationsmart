import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import api, { bulkUploadFeeds, uploadTranslationWorkbook } from "@/lib/api";

// Runs the REAL axios instance (api-admin.test.ts mocks axios away, which is
// how the uploads shipped broken). A stub adapter captures what axios would
// put on the wire after its request transforms.
let sent: InternalAxiosRequestConfig | null = null;
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  sent = null;
  const capture: AxiosAdapter = async (config) => {
    sent = config;
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = capture;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("file uploads reach the adapter as FormData, not JSON", () => {
  it("bulkUploadFeeds keeps the file in a multipart body", async () => {
    const file = new File(["fd_code,fd_name"], "feeds.xlsx");
    await bulkUploadFeeds("admin-1", file);
    expect(sent?.data).toBeInstanceOf(FormData);
    expect((sent?.data as FormData).get("file")).toBeInstanceOf(File);
    expect(String(sent?.headers["Content-Type"])).toContain("multipart/form-data");
  });

  it("uploadTranslationWorkbook keeps the file in a multipart body", async () => {
    const file = new File(["x"], "workbook.xlsx");
    await uploadTranslationWorkbook("7", file);
    expect(sent?.data).toBeInstanceOf(FormData);
    expect((sent?.data as FormData).get("file")).toBeInstanceOf(File);
    expect(sent?.params).toEqual({ country_id: "7" });
  });
});
