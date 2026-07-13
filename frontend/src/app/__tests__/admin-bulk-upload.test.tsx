import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const { replace, back, bulkUploadFeeds, exportAdminFeeds, exportCustomFeeds } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  bulkUploadFeeds: vi.fn(),
  exportAdminFeeds: vi.fn(),
  exportCustomFeeds: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, bulkUploadFeeds, exportAdminFeeds, exportCustomFeeds };
});

import BulkUploadPage from "@/app/(main)/admin/bulk-upload/page";
import { useStore, type User } from "@/lib/store";

const TEMPLATE_URL =
  "https://ucd-reports.s3.ap-southeast-2.amazonaws.com/feed_exports/template_upload/feeds_table_tempate.xlsx";

const seedUser = (over: Partial<User> = {}): User => ({
  id: "admin-1",
  name: "Admin",
  email: "admin@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: true,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

// jsdom doesn't implement createObjectURL/revokeObjectURL at all. Patch
// them directly onto the real URL constructor (not vi.stubGlobal, which
// would replace `URL` with a plain object and break `new URL(...)` in
// every other test file that shares this worker process afterward).
// The page schedules a `setTimeout(() => URL.revokeObjectURL(...), 1000)`
// after a successful export, so these need to stay in place for the
// whole file rather than being stubbed/unstubbed per-test.
Object.assign(URL, {
  createObjectURL: vi.fn(() => "blob:mock-url"),
  revokeObjectURL: vi.fn(),
});

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  bulkUploadFeeds.mockReset();
  exportAdminFeeds.mockReset();
  exportCustomFeeds.mockReset();
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

function selectCsvFile(name = "feeds.csv") {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["a,b,c"], name, { type: "text/csv" });
  fireEvent.change(fileInput, { target: { files: [file] } });
  return file;
}

describe("Bulk Upload — Upload Feed CSV", () => {
  it("picking a file shows the preview card with Cancel + Confirm actions", () => {
    render(<BulkUploadPage />);
    const file = selectCsvFile();
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm upload" })).toBeInTheDocument();
  });

  it("Cancel clears the selection without calling bulkUploadFeeds", () => {
    render(<BulkUploadPage />);
    const file = selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Cancel file" }));
    expect(screen.queryByText(file.name)).toBeNull();
    expect(bulkUploadFeeds).not.toHaveBeenCalled();
  });

  it("Confirm upload calls bulkUploadFeeds(admin_user_id, file, onProgress) and shows backend's success message", async () => {
    bulkUploadFeeds.mockResolvedValueOnce({ data: { message: "42 feeds uploaded successfully." } });
    render(<BulkUploadPage />);
    const file = selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => expect(bulkUploadFeeds).toHaveBeenCalledOnce());
    const [adminId, uploadedFile, onProgress] = bulkUploadFeeds.mock.calls[0];
    expect(adminId).toBe("admin-1");
    expect(uploadedFile).toBe(file);
    expect(typeof onProgress).toBe("function");

    await waitFor(() => expect(screen.getByText("Upload Successful")).toBeInTheDocument());
    expect(screen.getByText("42 feeds uploaded successfully.")).toBeInTheDocument();
    // File preview is cleared on success
    expect(screen.queryByText(file.name)).toBeNull();
  });

  it("the progress bar reflects onUploadProgress callback values mid-flight, then completes to 100%", async () => {
    let progressCb: ((pct: number) => void) | undefined;
    let resolveUpload!: (v: unknown) => void;
    bulkUploadFeeds.mockImplementationOnce((_id: string, _file: File, onProgress?: (pct: number) => void) => {
      progressCb = onProgress;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });

    render(<BulkUploadPage />);
    selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => expect(screen.getByText("Uploading")).toBeInTheDocument());
    // Simulate the axios onUploadProgress firing mid-transfer
    act(() => progressCb?.(42));
    await waitFor(() => expect(document.querySelector('[style*="width: 42%"]')).not.toBeNull());

    resolveUpload({ data: { message: "Done" } });
    await waitFor(() => expect(screen.getByText("Upload Successful")).toBeInTheDocument());
    expect(document.querySelector('[style*="width: 100%"]')).not.toBeNull();
  });

  it("shows an Upload Failed banner with the error message on rejection", async () => {
    bulkUploadFeeds.mockRejectedValueOnce(new Error("Malformed CSV headers"));
    render(<BulkUploadPage />);
    selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => expect(screen.getByText("Upload Failed")).toBeInTheDocument());
    expect(screen.getByText("Malformed CSV headers")).toBeInTheDocument();
  });
});

describe("Bulk Upload — Export Standard Feeds (green theme)", () => {
  it("downloads the exported blob and shows a green 'Export Successful' banner", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    exportAdminFeeds.mockResolvedValueOnce({
      headers: { "content-type": "application/octet-stream" },
      data: new Blob(["xlsx-bytes"], { type: "application/octet-stream" }),
    });

    render(<BulkUploadPage />);
    fireEvent.click(screen.getByRole("button", { name: /STANDARD/ }));

    await waitFor(() => expect(exportAdminFeeds).toHaveBeenCalledWith("admin-1"));
    await waitFor(() => expect(screen.getByText("Export Successful")).toBeInTheDocument());
    expect(screen.getByText("Export Successful")).toHaveStyle({ color: "#064E3B" }); // green theme title color
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});

describe("Bulk Upload — Export Custom Feeds (orange theme)", () => {
  it("downloads the exported blob and shows an orange 'Export Successful' banner", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    exportCustomFeeds.mockResolvedValueOnce({
      headers: { "content-type": "application/octet-stream" },
      data: new Blob(["xlsx-bytes"], { type: "application/octet-stream" }),
    });

    render(<BulkUploadPage />);
    fireEvent.click(screen.getByRole("button", { name: /FILTERED/ }));

    await waitFor(() => expect(exportCustomFeeds).toHaveBeenCalledWith("admin-1"));
    await waitFor(() => expect(screen.getByText("Export Successful")).toBeInTheDocument());
    expect(screen.getByText("Export Successful")).toHaveStyle({ color: "#FF7800" }); // orange theme title color

    clickSpy.mockRestore();
  });

  it("shows an Export Failed banner on rejection (failure styling is shared across both kinds)", async () => {
    exportCustomFeeds.mockRejectedValueOnce(new Error("Backend timeout"));
    render(<BulkUploadPage />);
    fireEvent.click(screen.getByRole("button", { name: /FILTERED/ }));

    await waitFor(() => expect(screen.getByText("Export Failed")).toBeInTheDocument());
    expect(screen.getByText("Backend timeout")).toBeInTheDocument();
    expect(screen.getByText("Export Failed")).toHaveStyle({ color: "#E44A4A" });
  });
});

describe("Bulk Upload — Download Template", () => {
  it("opens the exact (misspelled) S3 template URL in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<BulkUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: /Download Template/ }));

    expect(openSpy).toHaveBeenCalledWith(TEMPLATE_URL, "_blank", "noopener,noreferrer");
    // Confirms the client never "fixes" the server's misspelled filename in the URL itself
    expect(TEMPLATE_URL).toContain("feeds_table_tempate.xlsx");

    await waitFor(
      () => expect(useStore.getState().snackbar?.message).toBe("Template opened in a new tab"),
      { timeout: 1000 }
    );
    expect(useStore.getState().snackbar?.type).toBe("success");

    openSpy.mockRestore();
  });
});

// UI-label translation (src/lib/i18n-ui.ts) — same mechanism proven on
// src/app/help/page.tsx. Only OUR hardcoded chrome strings are wrapped in
// t(); backend-supplied messages (bulkUploadFeeds' res.data.message, an
// export's parsed.message, err.message) are always shown verbatim in
// whatever language the backend sent them, so they aren't asserted here.
describe("Bulk Upload — UI-label translation (Hindi)", () => {
  it("translates the toolbar title, headers, and section headings when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<BulkUploadPage />);

    // The "hi" dictionary lazy-loads via dynamic import() — findBy waits for it.
    await screen.findByText("चारा प्रबंधन"); // Feed Management (toolbar title)
    expect(screen.getByText("डेटा सिंक")).toBeInTheDocument(); // Data Sync
    expect(screen.getByText("चारा निर्यात और अपलोड")).toBeInTheDocument(); // Feed Export & Upload
    expect(screen.getByText("अपलोड")).toBeInTheDocument(); // Upload (section header)
    expect(screen.getByText("डाउनलोड")).toBeInTheDocument(); // Download (section header)
    expect(screen.queryByText("Feed Management")).not.toBeInTheDocument();
  });

  it("translates the upload dropzone copy and the Download Template button", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<BulkUploadPage />);

    await screen.findByText("चारा अपलोड करें"); // UPLOAD FEEDS
    expect(screen.getByText("CSV या Excel ब्राउज़ करने के लिए टैप करें")).toBeInTheDocument(); // Tap to browse CSV or Excel
    expect(screen.getByText("* केवल आपके डिवाइस पर संग्रहीत फ़ाइलें समर्थित हैं।")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /टेम्पलेट डाउनलोड करें/ })).toBeInTheDocument(); // Download Template
  });

  it("translates the STANDARD/FILTERED export card labels and the upload status banner title", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<BulkUploadPage />);

    await screen.findByText("STANDARD"); // untranslated in the sheet (same word) — still exercises the key
    expect(screen.getByText("चारा")).toBeInTheDocument(); // Feeds
    expect(screen.getByText("FILTERED")).toBeInTheDocument(); // untranslated in the sheet
    expect(screen.getByText("कस्टम चारा")).toBeInTheDocument(); // Custom Feeds

    bulkUploadFeeds.mockImplementationOnce(() => new Promise(() => {})); // never resolves — keeps "uploading" visible
    selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: /अपलोड की पुष्टि करें/ })); // Confirm upload aria-label
    await screen.findByText("अपलोड हो रहा है"); // Uploading (banner title)
    expect(screen.getByText("आपके चारे अपलोड किए जा रहे हैं।")).toBeInTheDocument(); // Your feeds are being uploaded.
  });
});
