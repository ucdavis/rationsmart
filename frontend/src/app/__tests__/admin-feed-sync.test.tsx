import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

const {
  back,
  getFeedSyncSchedulerStatus,
  getFeedSyncConfig,
  updateFeedSyncConfig,
  toggleFeedSyncScheduler,
  runFeedSyncNow,
  getFeedSyncLogs,
  getFeedSyncLog,
} = vi.hoisted(() => ({
  back: vi.fn(),
  getFeedSyncSchedulerStatus: vi.fn(),
  getFeedSyncConfig: vi.fn(),
  updateFeedSyncConfig: vi.fn(),
  toggleFeedSyncScheduler: vi.fn(),
  runFeedSyncNow: vi.fn(),
  getFeedSyncLogs: vi.fn(),
  getFeedSyncLog: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getFeedSyncSchedulerStatus,
    getFeedSyncConfig,
    updateFeedSyncConfig,
    toggleFeedSyncScheduler,
    runFeedSyncNow,
    getFeedSyncLogs,
    getFeedSyncLog,
  };
});

import AdminFeedSyncPage from "@/app/(main)/admin/feed-sync/page";
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

const baseStatus = {
  success: true,
  scheduler_enabled: true,
  sync_day_of_week: "wednesday",
  next_scheduled_run: "2026-07-22",
  last_run_at: "2026-07-19T00:00:04Z",
  last_success_at: "2026-07-19T00:00:41Z",
  running: false,
};

const baseConfig = {
  success: true,
  endpoint_url: "https://api.msu.climdesdata.com/api/v1/product/export/digital_green",
  auth_type: "none",
  auth_header_name: null,
  auth_token_masked: null,
  sync_day_of_week: "wednesday",
  scheduler_enabled: true,
  scheduler_toggled_by: "9c1f7e2a-aaaa-bbbb-cccc-000000000000",
  scheduler_toggled_at: "2026-07-20T09:12:00Z",
  last_run_at: "2026-07-19T00:00:04Z",
  last_success_at: "2026-07-19T00:00:41Z",
};

function seedLoad(
  statusOver: Partial<typeof baseStatus> = {},
  configOver: Partial<typeof baseConfig> = {}
) {
  getFeedSyncSchedulerStatus.mockResolvedValue({ data: { ...baseStatus, ...statusOver } });
  getFeedSyncConfig.mockResolvedValue({ data: { ...baseConfig, ...configOver } });
}

// jsdom doesn't implement createObjectURL/revokeObjectURL — patched directly
// onto the real URL constructor (same pattern as admin-bulk-upload.test.tsx)
// so CSV export doesn't throw.
Object.assign(URL, {
  createObjectURL: vi.fn(() => "blob:mock-url"),
  revokeObjectURL: vi.fn(),
});

beforeEach(() => {
  back.mockClear();
  getFeedSyncSchedulerStatus.mockReset();
  getFeedSyncConfig.mockReset();
  updateFeedSyncConfig.mockReset();
  toggleFeedSyncScheduler.mockReset();
  runFeedSyncNow.mockReset();
  getFeedSyncLogs.mockReset();
  getFeedSyncLog.mockReset();
  seedLoad();
  getFeedSyncLogs.mockResolvedValue({
    data: { success: true, total_count: 0, page: 1, page_size: 20, total_pages: 1, logs: [] },
  });
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
    showSnackbar: vi.fn(),
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Admin Feed Library Sync — Sync & Settings tab", () => {
  it("renders the status card and connection settings from the two GET calls", async () => {
    render(<AdminFeedSyncPage />);
    expect(await screen.findByText("Automatic Scheduler")).toBeInTheDocument();
    expect(
      screen.getByText(/Syncs automatically every Wednesday at 00:00 UTC/)
    ).toBeInTheDocument();
    // Locale-robust: the component formats next_scheduled_run via
    // toLocaleDateString(undefined, …), so field ORDER follows the runtime
    // locale — "Wed, 22 Jul 2026" (en-GB, dev machines) vs "Wed, Jul 22,
    // 2026" (en-US, CI). Accept both so the assertion isn't machine-locale
    // dependent.
    expect(screen.getByText(/Wed,\s*(22 Jul|Jul 22),?\s*2026/)).toBeInTheDocument();
    expect(screen.getByText(baseConfig.endpoint_url)).toBeInTheDocument();
  });

  it("does not redirect a non-admin user and renders nothing", () => {
    useStore.setState({ user: seedUser({ is_admin: false }) } as never);
    const { container } = render(<AdminFeedSyncPage />);
    expect(container.firstChild).toBeNull();
  });

  it("disables the toggle and shows a hint when no endpoint is configured", async () => {
    seedLoad(
      { scheduler_enabled: false, next_scheduled_run: null },
      { endpoint_url: null, scheduler_enabled: false }
    );
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    expect(screen.getByText("Configure the CLIMDES endpoint first")).toBeInTheDocument();
    const toggleLabel = screen.getByLabelText("Enable automatic scheduler");
    const toggle = within(toggleLabel).getByRole("checkbox") as HTMLInputElement;
    expect(toggle).toBeDisabled();
  });

  it("asks for confirmation before disabling the scheduler, then calls the toggle endpoint", async () => {
    toggleFeedSyncScheduler.mockResolvedValue({
      data: {
        success: true,
        message: "Automatic scheduler disabled successfully",
        scheduler_enabled: false,
        new_status: "disabled",
      },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByLabelText("Disable automatic scheduler"));
    expect(await screen.findByText(/Disable automatic scheduler\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(toggleFeedSyncScheduler).toHaveBeenCalledWith("disable"));
  });

  it("enables the scheduler with a single click (no confirm) when an endpoint is configured", async () => {
    seedLoad({ scheduler_enabled: false, next_scheduled_run: null }, { scheduler_enabled: false });
    toggleFeedSyncScheduler.mockResolvedValue({
      data: {
        success: true,
        message: "Automatic scheduler enabled successfully",
        scheduler_enabled: true,
        new_status: "enabled",
      },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByLabelText("Enable automatic scheduler"));
    await waitFor(() => expect(toggleFeedSyncScheduler).toHaveBeenCalledWith("enable"));
    expect(screen.queryByText(/Disable automatic scheduler\?/)).not.toBeInTheDocument();
  });

  it("persists a sync-day change via the config PUT and refreshes status", async () => {
    updateFeedSyncConfig.mockResolvedValue({ data: { ...baseConfig, sync_day_of_week: "friday" } });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Wednesday"));
    fireEvent.click(await screen.findByText("Friday"));
    await waitFor(() =>
      expect(updateFeedSyncConfig).toHaveBeenCalledWith({ sync_day_of_week: "friday" })
    );
  });

  it("disables Sync now while a run is already in progress", async () => {
    seedLoad({ running: true });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeDisabled();
    expect(screen.getByText("status: running…")).toBeInTheDocument();
  });

  it("dispatches a manual sync, polls until success, and shows the result summary", async () => {
    runFeedSyncNow.mockResolvedValue({
      data: {
        success: true,
        message: "Feed sync dispatched — poll the log for progress",
        log_id: "log-123",
      },
    });
    getFeedSyncLog
      .mockResolvedValueOnce({
        data: {
          id: "log-123",
          status: "running",
          started_at: "2026-07-20T10:00:00Z",
          finished_at: null,
          trigger_type: "manual",
          triggered_by: "admin-1",
          http_status: null,
          total_rows: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          translations_inserted: 0,
          translations_updated: 0,
          translations_skipped: 0,
          success: false,
          error_message: null,
          failed_rows: null,
          skipped_translations: null,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "log-123",
          status: "success",
          started_at: "2026-07-20T10:00:00Z",
          finished_at: "2026-07-20T10:00:41Z",
          trigger_type: "manual",
          triggered_by: "admin-1",
          http_status: 200,
          total_rows: 5708,
          inserted: 1490,
          updated: 28,
          skipped: 4190,
          translations_inserted: 595,
          translations_updated: 0,
          translations_skipped: 216,
          success: true,
          error_message: null,
          failed_rows: [],
          skipped_translations: [],
        },
      });

    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");

    // Fake timers only from here on — findByText's internal waitFor
    // polling doesn't play well with them, so the initial render settles
    // under real timers first.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runFeedSyncNow).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(getFeedSyncLog).toHaveBeenCalledWith("log-123");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByText(/✅ Sync complete/)).toBeInTheDocument();
    expect(screen.getByText(/1,490 feeds added/)).toBeInTheDocument();
    expect(screen.getByText(/595 local names saved/)).toBeInTheDocument();
  });

  it("View details on the result summary switches to Run History and opens that run's drawer", async () => {
    runFeedSyncNow.mockResolvedValue({
      data: { success: true, message: "dispatched", log_id: "log-999" },
    });
    getFeedSyncLog.mockResolvedValue({
      data: {
        id: "log-999",
        status: "success",
        started_at: "2026-07-20T10:00:00Z",
        finished_at: "2026-07-20T10:00:05Z",
        trigger_type: "manual",
        triggered_by: "admin-1",
        http_status: 200,
        total_rows: 10,
        inserted: 5,
        updated: 1,
        skipped: 4,
        translations_inserted: 2,
        translations_updated: 0,
        translations_skipped: 1,
        success: true,
        error_message: null,
        failed_rows: [],
        skipped_translations: [],
      },
    });
    getFeedSyncLogs.mockResolvedValue({
      data: { success: true, total_count: 1, page: 1, page_size: 20, total_pages: 1, logs: [] },
    });

    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByText(/✅ Sync complete/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("View details →"));
    vi.useRealTimers();

    expect(await screen.findByText(/Duration 5 s/)).toBeInTheDocument();
  });

  it("shows 409/503 errors from Sync now without starting a run", async () => {
    const err409 = Object.assign(new Error("A run is already in progress"), {
      response: { status: 409 },
    });
    runFeedSyncNow.mockRejectedValueOnce(err409);
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await waitFor(() =>
      expect(useStore.getState().showSnackbar).toHaveBeenCalledWith(
        "A sync is already running",
        "error"
      )
    );
  });

  it("edits connection settings and sends only the changed fields", async () => {
    updateFeedSyncConfig.mockResolvedValue({
      data: { ...baseConfig, endpoint_url: "https://new.example.com/export" },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Edit"));
    const input = await screen.findByPlaceholderText("https://api.example.com/feed-library");
    fireEvent.change(input, { target: { value: "https://new.example.com/export" } });
    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(updateFeedSyncConfig).toHaveBeenCalledWith({
        endpoint_url: "https://new.example.com/export",
      })
    );
  });

  it("never sends the masked token back — Replace token opens an empty input", async () => {
    seedLoad({}, { auth_token_masked: "****9xyz" });
    updateFeedSyncConfig.mockResolvedValue({
      data: { ...baseConfig, auth_token_masked: "****abcd" },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Edit"));
    expect(await screen.findByText("****9xyz")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Replace token"));
    const tokenInput = screen.getByPlaceholderText("Enter new token") as HTMLInputElement;
    expect(tokenInput.value).toBe("");
    fireEvent.change(tokenInput, { target: { value: "brand-new-secret" } });
    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(updateFeedSyncConfig).toHaveBeenCalledWith({ auth_token: "brand-new-secret" })
    );
  });
});

describe("Admin Feed Library Sync — Run History tab", () => {
  const logItem = {
    id: "log-1",
    started_at: "2026-07-20T10:14:00Z",
    finished_at: "2026-07-20T10:14:41Z",
    status: "success",
    trigger_type: "manual",
    triggered_by: "admin-1",
    http_status: 200,
    total_rows: 5708,
    inserted: 1490,
    updated: 28,
    skipped: 4190,
    translations_inserted: 595,
    translations_updated: 0,
    translations_skipped: 216,
  };

  it("lists runs newest-first with a status chip and rolled-up counts", async () => {
    getFeedSyncLogs.mockResolvedValue({
      data: {
        success: true,
        total_count: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        logs: [logItem],
      },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Run History"));
    expect(await screen.findByText("Success")).toBeInTheDocument();
    expect(
      screen.getByText(/Rows 5,708 · \+New 1,490 · ~Upd 28 · Skip 4,190 · Names 595\/216/)
    ).toBeInTheDocument();
  });

  it("opens the run detail drawer and groups skipped translations by reason with a deep-link", async () => {
    getFeedSyncLogs.mockResolvedValue({
      data: {
        success: true,
        total_count: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        logs: [logItem],
      },
    });
    getFeedSyncLog.mockResolvedValue({
      data: {
        ...logItem,
        success: true,
        error_message: null,
        failed_rows: [{ row: 17, fd_code: "ABC123", reason: "unknown country 'Atlantis'" }],
        skipped_translations: [
          { fd_code: "D0Q91DZPTX", language: "bn", reason: "'bn' not assigned to Bangladesh" },
          { fd_code: "D0Q91DZPTY", language: "bn", reason: "'bn' not assigned to Bangladesh" },
          {
            fd_code: "D0Q91DZPTZ",
            language: "en",
            reason: "language is 'en' — English is the baseline (I3)",
          },
        ],
      },
    });

    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Run History"));
    fireEvent.click(await screen.findByText(/Rows 5,708/));

    const rowsToggle = await screen.findByText(/Skipped rows \(1\)/);
    fireEvent.click(rowsToggle);
    expect(await screen.findByText(/unknown country 'Atlantis'/)).toBeInTheDocument();

    const namesToggle = screen.getByText(/Skipped local names \(3\) — grouped by reason/);
    fireEvent.click(namesToggle);
    expect(await screen.findByText(/'bn' not assigned to Bangladesh/)).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("Assign language →")).toBeInTheDocument();
    // The 'en' reason is informational — no deep-link rendered for it.
    expect(screen.getByText(/language is 'en'/)).toBeInTheDocument();
  });

  it("shows the error_message for a failed run", async () => {
    const failedItem = {
      ...logItem,
      id: "log-2",
      status: "failed",
      inserted: 0,
      updated: 0,
      skipped: 0,
    };
    getFeedSyncLogs.mockResolvedValue({
      data: {
        success: true,
        total_count: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        logs: [failedItem],
      },
    });
    getFeedSyncLog.mockResolvedValue({
      data: {
        ...failedItem,
        success: false,
        error_message:
          "Mandatory column(s) missing from the Feed Library file: fd_language_cd — nothing imported",
        failed_rows: null,
        skipped_translations: null,
      },
    });

    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Run History"));
    fireEvent.click(await screen.findByText("Failed"));
    expect(await screen.findByText(/Mandatory column\(s\) missing/)).toBeInTheDocument();
  });

  it("paginates when there is more than one page of runs", async () => {
    getFeedSyncLogs.mockResolvedValue({
      data: {
        success: true,
        total_count: 42,
        page: 1,
        page_size: 20,
        total_pages: 3,
        logs: [logItem],
      },
    });
    render(<AdminFeedSyncPage />);
    await screen.findByText("Automatic Scheduler");
    fireEvent.click(screen.getByText("Run History"));
    await screen.findByText("Page 1 of 3");
    fireEvent.click(screen.getByText("Next ›"));
    await waitFor(() => expect(getFeedSyncLogs).toHaveBeenCalledWith(2, 20));
  });
});
