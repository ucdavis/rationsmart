import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { replace, back, push, getAdminReports } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  getAdminReports: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getAdminReports };
});

import AdminReportsPage from "@/app/(main)/admin/reports/page";
import { useStore, type User } from "@/lib/store";

const seedUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@dg.org",
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

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  getAdminReports.mockReset();
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  } as never);
});

describe("Admin reports — list rendering", () => {
  it("calls getAdminReports(user.id, 1, 50) and renders each card", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: {
        reports: [
          {
            report_id: "r-1",
            simulation_id: "sim-1",
            user_name: "Farmer Joe",
            bucket_url: "https://example.com/r1.pdf",
            created_at: "2026-06-04T10:30:00Z",
            report_type: "Evaluation",
          },
        ],
      },
    });

    render(<AdminReportsPage />);

    expect(getAdminReports).toHaveBeenCalledWith("u-1", 1, 50);

    await waitFor(() => expect(screen.getByText("Farmer Joe")).toBeInTheDocument());
    expect(screen.getByText("sim-1")).toBeInTheDocument();
    expect(screen.getByText("Evaluation")).toBeInTheDocument();
  });

  it("accepts a bare array response body (not wrapped in {reports:})", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: [
        {
          report_id: "r-2",
          simulation_id: "sim-2",
          user_name: "Bare Array User",
          bucket_url: "https://example.com/r2.pdf",
          created_at: "2026-06-04T10:30:00Z",
          report_type: "Recommendation",
        },
      ],
    });

    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("Bare Array User")).toBeInTheDocument());
  });

  it("renders 'No reports found' on an empty result", async () => {
    getAdminReports.mockResolvedValueOnce({ data: { reports: [] } });
    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("No reports found")).toBeInTheDocument());
  });

  it("shows an error snackbar when the API call fails", async () => {
    getAdminReports.mockRejectedValueOnce(new Error("network down"));
    render(<AdminReportsPage />);
    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Could not load reports");
    });
  });
});

describe("Admin reports — report-type chip coloring", () => {
  const baseReport = {
    report_id: "r-1",
    simulation_id: "sim-1",
    user_name: "Farmer Joe",
    bucket_url: "https://example.com/r1.pdf",
    created_at: "2026-06-04T10:30:00Z",
  };

  it("Evaluation → vivid_gamboge theme (#FF9F1C text / 15% bg) on the View Report chip", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: { reports: [{ ...baseReport, report_type: "Evaluation" }] },
    });
    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("Evaluation")).toBeInTheDocument());

    const chip = screen.getByRole("button", { name: /View Report/ });
    expect(chip).toHaveStyle({ color: "#FF9F1C", backgroundColor: "rgba(255,159,28,0.15)" });
  });

  it("Recommendation → celtic_blue theme (#296CD3 text / 15% bg) on the View Report chip", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: { reports: [{ ...baseReport, report_type: "Recommendation" }] },
    });
    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("Recommendation")).toBeInTheDocument());

    const chip = screen.getByRole("button", { name: /View Report/ });
    expect(chip).toHaveStyle({ color: "#296CD3", backgroundColor: "rgba(41,108,211,0.15)" });
  });

  it("any other report_type → dark_aquamarine_green / bright_gray_new fallback theme", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: { reports: [{ ...baseReport, report_type: "Something Else" }] },
    });
    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("Something Else")).toBeInTheDocument());

    const chip = screen.getByRole("button", { name: /View Report/ });
    expect(chip).toHaveStyle({ color: "#064E3B", backgroundColor: "#E4F7EF" });
  });

  it("falls back to a derived type from report_mode when report_type is absent", async () => {
    getAdminReports.mockResolvedValueOnce({
      data: { reports: [{ ...baseReport, report_type: undefined, report_mode: "evaluation" }] },
    });
    render(<AdminReportsPage />);
    await waitFor(() => expect(screen.getByText("Evaluation")).toBeInTheDocument());
  });
});

describe("Admin reports — View Report action", () => {
  it("opens bucket_url in a new tab and does not refetch simulation details", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getAdminReports.mockResolvedValueOnce({
      data: {
        reports: [
          {
            report_id: "r-1",
            simulation_id: "sim-1",
            user_name: "Farmer Joe",
            bucket_url: "https://example.com/r1.pdf",
            created_at: "2026-06-04T10:30:00Z",
            report_type: "Evaluation",
          },
        ],
      },
    });
    render(<AdminReportsPage />);
    const chip = await screen.findByRole("button", { name: /View Report/ });
    fireEvent.click(chip);

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/r1.pdf",
      "_blank",
      "noopener,noreferrer"
    );
    // No secondary fetch call beyond the initial list load.
    expect(getAdminReports).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it("falls back to report_url when bucket_url is missing", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getAdminReports.mockResolvedValueOnce({
      data: {
        reports: [
          {
            report_id: "r-3",
            simulation_id: "sim-3",
            user_name: "No Bucket",
            report_url: "https://example.com/fallback.pdf",
            created_at: "2026-06-04T10:30:00Z",
            report_type: "Evaluation",
          },
        ],
      },
    });
    render(<AdminReportsPage />);
    const chip = await screen.findByRole("button", { name: /View Report/ });
    fireEvent.click(chip);

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/fallback.pdf",
      "_blank",
      "noopener,noreferrer"
    );
    openSpy.mockRestore();
  });

  it("shows an error snackbar and does not open a tab when no URL is available", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getAdminReports.mockResolvedValueOnce({
      data: {
        reports: [
          {
            report_id: "r-4",
            simulation_id: "sim-4",
            user_name: "No URL",
            created_at: "2026-06-04T10:30:00Z",
            report_type: "Evaluation",
          },
        ],
      },
    });
    render(<AdminReportsPage />);
    const chip = await screen.findByRole("button", { name: /View Report/ });
    fireEvent.click(chip);

    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Report URL not available");
    });
    openSpy.mockRestore();
  });
});

// UI-label translation (src/lib/i18n-ui.ts) — the "hi" dictionary
// lazy-loads via dynamic import(), so findBy waits for it to resolve.
describe("Admin reports — i18n (Hindi)", () => {
  it("renders the toolbar title, View Report button, and the translated report-type value in Hindi", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) } as never);
    getAdminReports.mockResolvedValueOnce({
      data: {
        reports: [
          {
            report_id: "r-1",
            simulation_id: "sim-1",
            user_name: "Farmer Joe",
            bucket_url: "https://example.com/r1.pdf",
            created_at: "2026-06-04T10:30:00Z",
            report_type: "Evaluation",
          },
        ],
      },
    });

    render(<AdminReportsPage />);

    await screen.findByText("चारा रिपोर्ट"); // Feed Reports (toolbar title)
    expect(screen.getByText("रिपोर्ट देखें")).toBeInTheDocument(); // View Report
    expect(screen.getByText("मूल्यांकन")).toBeInTheDocument(); // Evaluation (translated display value)
    expect(screen.queryByText("Feed Reports")).not.toBeInTheDocument();
  });
});
