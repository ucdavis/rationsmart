import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const {
  replace,
  back,
  bulkUploadFeeds,
  downloadFeedTemplate,
  exportAdminFeeds,
  exportCustomFeeds,
  previewFeedLibraryWipe,
  wipeFeedLibrary,
} = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  bulkUploadFeeds: vi.fn(),
  downloadFeedTemplate: vi.fn(),
  exportAdminFeeds: vi.fn(),
  exportCustomFeeds: vi.fn(),
  previewFeedLibraryWipe: vi.fn(),
  wipeFeedLibrary: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    bulkUploadFeeds,
    downloadFeedTemplate,
    exportAdminFeeds,
    exportCustomFeeds,
    previewFeedLibraryWipe,
    wipeFeedLibrary,
  };
});

import BulkUploadPage from "@/app/(main)/admin/bulk-upload/page";
import { useStore, type User } from "@/lib/store";

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
  downloadFeedTemplate.mockReset();
  exportAdminFeeds.mockReset();
  exportCustomFeeds.mockReset();
  previewFeedLibraryWipe.mockReset();
  wipeFeedLibrary.mockReset();
  // Default: the server has the wipe switched off (production) — the Bulk
  // Delete section stays hidden and the other suites are unaffected.
  previewFeedLibraryWipe.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
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
    bulkUploadFeeds.mockImplementationOnce(
      (_id: string, _file: File, onProgress?: (pct: number) => void) => {
        progressCb = onProgress;
        return new Promise((resolve) => {
          resolveUpload = resolve;
        });
      }
    );

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

  it("summarises a feed-sync run-from-file result (inserted / updated / skipped)", async () => {
    bulkUploadFeeds.mockResolvedValueOnce({
      data: {
        success: true,
        total_rows: 10,
        inserted: 6,
        updated: 3,
        skipped: 1,
        error_message: null,
      },
    });
    render(<BulkUploadPage />);
    selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => expect(screen.getByText("Upload Successful")).toBeInTheDocument());
    expect(
      screen.getByText(/Processed 10 rows: 6 added, 3 updated, 1 skipped\./)
    ).toBeInTheDocument();
  });

  it("shows Upload Failed with error_message when the run comes back success: false", async () => {
    bulkUploadFeeds.mockResolvedValueOnce({
      data: {
        success: false,
        total_rows: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error_message: "Missing column fd_code",
      },
    });
    render(<BulkUploadPage />);
    const file = selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => expect(screen.getByText("Upload Failed")).toBeInTheDocument());
    expect(screen.getByText("Missing column fd_code")).toBeInTheDocument();
    // File stays selected so the admin can retry after fixing it
    expect(screen.getByText(file.name)).toBeInTheDocument();
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
  // GET /v1/admin/feed-template — the current template with the mandatory
  // fd_code / fd_language_cd columns (the old S3 file lacks them).
  it("saves the backend template as rs_template_feed_upload.xlsx, no new tab", async () => {
    downloadFeedTemplate.mockResolvedValueOnce({ data: new Blob(["xlsx"]), headers: {} });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const clicks: { href: string; download: string }[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
    });
    render(<BulkUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: /Download Template/ }));

    await waitFor(() => expect(useStore.getState().snackbar?.message).toBe("Template downloaded"));
    expect(downloadFeedTemplate).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(clicks[0]?.href).toBe("blob:mock-url");
    expect(clicks[0]?.download).toBe("rs_template_feed_upload.xlsx");
    openSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("shows an error snackbar and saves nothing when the template request fails", async () => {
    downloadFeedTemplate.mockRejectedValueOnce(
      Object.assign(new Error("Admin access required"), { status: 403 })
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<BulkUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: /Download Template/ }));

    await waitFor(() =>
      expect(useStore.getState().snackbar).toMatchObject({
        message: "Admin access required",
        type: "error",
      })
    );
    expect(clickSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Download Template/ })).not.toBeDisabled();
    clickSpy.mockRestore();
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
    await screen.findByText("पशु आहार प्रबंधन"); // Feed Management (toolbar title)
    expect(screen.getByText("डेटा समन्वयन")).toBeInTheDocument(); // Data Sync
    expect(screen.getByText("बल्क अपलोड / डाउनलोड / हटाएं")).toBeInTheDocument();
    expect(screen.getByText("अपलोड")).toBeInTheDocument(); // Upload (section header)
    expect(screen.getByText("डाउनलोड")).toBeInTheDocument(); // Download (section header)
    expect(screen.queryByText("Feed Management")).not.toBeInTheDocument();
  });

  it("translates the upload dropzone copy and the Download Template button", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<BulkUploadPage />);

    await screen.findByText("पशु आहार अपलोड करें"); // UPLOAD FEEDS
    expect(screen.getByText("CSV या Excel ब्राउज़ करने के लिए टैप करें")).toBeInTheDocument(); // Tap to browse CSV or Excel
    expect(
      screen.getByText("* केवल आपके डिवाइस में संग्रहीत फाइलें ही समर्थित हैं।")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /टेम्पलेट डाउनलोड करें/ })).toBeInTheDocument(); // Download Template
  });

  it("translates the STANDARD/FILTERED export card labels and the upload status banner title", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<BulkUploadPage />);

    await screen.findByText("मानक"); // STANDARD
    expect(screen.getByText("चारा")).toBeInTheDocument(); // Feeds
    expect(screen.getByText("छँटा हुआ")).toBeInTheDocument(); // FILTERED
    expect(screen.getByText("कस्टम पशु आहार")).toBeInTheDocument(); // Custom Feeds

    bulkUploadFeeds.mockImplementationOnce(() => new Promise(() => {})); // never resolves — keeps "uploading" visible
    selectCsvFile();
    fireEvent.click(screen.getByRole("button", { name: /अपलोड की पुष्टि करें/ })); // Confirm upload aria-label
    await screen.findByText("अपलोड हो रहा है"); // Uploading (banner title)
    expect(screen.getByText("आपके पशु आहार अपलोड किए जा रहे हैं।")).toBeInTheDocument(); // Your feeds are being uploaded.
  });
});

// Bulk Delete — DELETE /v1/admin/feeds. The section only shows when the dry
// run succeeds; the dialog's Delete button needs the exact phrase.
describe("Bulk Delete — feed library wipe", () => {
  const dryRun = (feeds: number, feed_translations: number) => ({
    data: {
      success: true,
      dry_run: true,
      message: "",
      feeds,
      feed_translations,
      backup_file: null,
    },
  });

  async function openDialog() {
    previewFeedLibraryWipe.mockReset();
    previewFeedLibraryWipe.mockResolvedValueOnce(dryRun(224, 60));
    previewFeedLibraryWipe.mockResolvedValueOnce(dryRun(225, 61));
    render(<BulkUploadPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete feed library" }));
    await screen.findByRole("dialog");
    return screen.getByLabelText(/to confirm/) as HTMLInputElement;
  }
  const deleteBtn = () => screen.getByRole("button", { name: "Delete" });

  it("renames the page heading", () => {
    render(<BulkUploadPage />);
    expect(screen.getByText("Bulk Upload / Download / Delete")).toBeInTheDocument();
  });

  it("hides the section when the dry run returns 403", async () => {
    render(<BulkUploadPage />);
    await waitFor(() => expect(previewFeedLibraryWipe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Delete feed library" })).not.toBeInTheDocument();
  });

  it("shows the current counts when the dry run succeeds", async () => {
    previewFeedLibraryWipe.mockReset();
    previewFeedLibraryWipe.mockResolvedValue(dryRun(224, 60));
    render(<BulkUploadPage />);
    expect(await screen.findByText("224 feeds, 60 translations")).toBeInTheDocument();
  });

  it("re-runs the dry run on click and shows the fresh counts in the dialog", async () => {
    await openDialog();
    expect(previewFeedLibraryWipe).toHaveBeenCalledTimes(2);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("225");
    expect(dialog).toHaveTextContent("61");
  });

  it("enables Delete only on the exact phrase (case-sensitive, no trim)", async () => {
    const input = await openDialog();
    expect(deleteBtn()).toBeDisabled();
    for (const wrong of [
      "delete all feeds",
      "DELETE ALL FEEDS ",
      " DELETE ALL FEEDS",
      "DELETE ALL",
    ]) {
      fireEvent.change(input, { target: { value: wrong } });
      expect(deleteBtn()).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: "DELETE ALL FEEDS" } });
    expect(deleteBtn()).toBeEnabled();
  });

  it("on success closes the dialog, toasts counts + backup, zeroes the counts and links to Feed Sync", async () => {
    wipeFeedLibrary.mockResolvedValueOnce({
      data: {
        success: true,
        dry_run: false,
        message: "Feed library deleted",
        feeds: 225,
        feed_translations: 61,
        backup_file: "pre_feed_wipe_20261016_101500.dump",
      },
    });
    const input = await openDialog();
    fireEvent.change(input, { target: { value: "DELETE ALL FEEDS" } });
    fireEvent.click(deleteBtn());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(wipeFeedLibrary).toHaveBeenCalledWith("DELETE ALL FEEDS");
    expect(useStore.getState().snackbar?.message).toBe(
      "Deleted 225 feeds and 61 translations. Backup: pre_feed_wipe_20261016_101500.dump"
    );
    expect(screen.getByText("0 feeds, 0 translations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Feed Library Sync" })).toHaveAttribute(
      "href",
      "/admin/feed-sync"
    );
  });

  it("on 409 keeps the dialog open, shows the server's message and doesn't retry", async () => {
    wipeFeedLibrary.mockRejectedValueOnce(
      Object.assign(new Error("A feed sync is running; try again when it has finished"), {
        status: 409,
      })
    );
    const input = await openDialog();
    fireEvent.change(input, { target: { value: "DELETE ALL FEEDS" } });
    fireEvent.click(deleteBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A feed sync is running; try again when it has finished"
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(wipeFeedLibrary).toHaveBeenCalledTimes(1);
    expect(screen.getByText("225 feeds, 61 translations")).toBeInTheDocument();
  });

  it("maps 500 to the backup-failed message", async () => {
    wipeFeedLibrary.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 500 }));
    const input = await openDialog();
    fireEvent.change(input, { target: { value: "DELETE ALL FEEDS" } });
    fireEvent.click(deleteBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backup failed, so nothing was deleted. Contact the backend team."
    );
  });

  it("can't be closed while the delete is in flight", async () => {
    wipeFeedLibrary.mockImplementationOnce(() => new Promise(() => {}));
    const input = await openDialog();
    fireEvent.change(input, { target: { value: "DELETE ALL FEEDS" } });
    fireEvent.click(deleteBtn());
    await screen.findByText("Deleting...");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
