import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { replace, back, push, getSavedReports } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  getSavedReports: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getSavedReports };
});

import ReportsPage from "@/app/(main)/reports/page";
import { useStore, type User } from "@/lib/store";
import type { FeedReport } from "@/lib/api";

const seedUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: false,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

const report1: FeedReport = {
  report_id: "R-1",
  report_type: "Recommendation",
  bucket_url: "https://example.com/report1.pdf",
  simulation_id: "SIM-1",
  user_name: "Aiyappa",
  report_created_date: "2026-06-01T00:00:00Z",
};

const report2: FeedReport = {
  report_id: "R-2",
  report_type: "Evaluation",
  bucket_url: null,
  simulation_id: "SIM-2",
  user_name: "Aiyappa",
  report_created_date: "2026-06-05T00:00:00Z",
};

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  getSavedReports.mockReset();
  useStore.setState({ user: seedUser(), snackbar: null } as never);
});

describe("Reports — loading", () => {
  it("shows skeleton cards while the fetch is in flight", () => {
    getSavedReports.mockReturnValueOnce(new Promise(() => {})); // never resolves
    const { container } = render(<ReportsPage />);

    expect(container.querySelectorAll(".shimmer").length).toBeGreaterThan(0);
    expect(screen.queryByText("No saved reports")).toBeNull();
    expect(screen.queryByText("SIM-1")).toBeNull();
  });
});

describe("Reports — populated list", () => {
  it("renders a card per report with simulation ID + View Report / PDF Pending", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [report1, report2] } });
    render(<ReportsPage />);

    await waitFor(() => expect(screen.getByText("SIM-1")).toBeInTheDocument());
    expect(screen.getByText("SIM-2")).toBeInTheDocument();

    // report1 has a bucket_url -> View Report button
    expect(screen.getByRole("button", { name: /View Report/ })).toBeInTheDocument();
    // report2 has bucket_url: null -> PDF Pending badge, no button for it
    expect(screen.getByText("PDF Pending")).toBeInTheDocument();
  });

  it("calls getSavedReports with the current user's id", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [] } });
    render(<ReportsPage />);
    await waitFor(() => expect(getSavedReports).toHaveBeenCalledWith("u-1"));
  });
});

describe("Reports — empty state", () => {
  it("shows 'No saved reports' and the Create Report CTA routes to /cattle-info", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [] } });
    render(<ReportsPage />);

    await waitFor(() => expect(screen.getByText("No saved reports")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Create Report/ }));
    expect(push).toHaveBeenCalledWith("/cattle-info");
  });
});

describe("Reports — expand toggle", () => {
  it("reveals Report ID / Report Type / Date only while expanded", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [report1] } });
    render(<ReportsPage />);
    await waitFor(() => expect(screen.getByText("SIM-1")).toBeInTheDocument());

    // Collapsed by default
    expect(screen.queryByText("Report ID")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Report ID")).toBeInTheDocument();
    expect(screen.getByText("Report Type")).toBeInTheDocument();
    expect(screen.getByText("R-1")).toBeInTheDocument();
    expect(screen.getByText("Recommendation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Report ID")).toBeNull();
  });
});

describe("Reports — View Report opens the PDF", () => {
  it("calls window.open with the report's bucket_url in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    getSavedReports.mockResolvedValueOnce({ data: { reports: [report1] } });
    render(<ReportsPage />);
    await waitFor(() => expect(screen.getByText("SIM-1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /View Report/ }));
    expect(openSpy).toHaveBeenCalledWith(report1.bucket_url, "_blank", "noopener,noreferrer");
  });
});

describe("Reports — error path", () => {
  it("shows an error snackbar when getSavedReports rejects", async () => {
    getSavedReports.mockRejectedValueOnce(new Error("network down"));
    render(<ReportsPage />);

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Could not load reports");
    });
    // Falls through to the empty state once loading finishes
    expect(screen.getByText("No saved reports")).toBeInTheDocument();
  });
});

describe("Reports — UI-label translation", () => {
  it("translates the toolbar title and empty-state copy when user.preferred_language is 'hi'", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [] } });
    useStore.setState({ user: seedUser({ preferred_language: "hi" }), snackbar: null } as never);
    render(<ReportsPage />);

    // The "hi" dictionary lazy-loads via dynamic import() — findBy waits
    // for it to resolve rather than assuming it's already in the cache.
    await screen.findByText("चारा रिपोर्ट"); // toolbar title "Feed Reports"
    expect(screen.getByText("कोई सहेजी गई रिपोर्ट नहीं")).toBeInTheDocument(); // No saved reports
    expect(screen.getByText("रिपोर्ट बनाएं")).toBeInTheDocument(); // Create Report
    expect(screen.queryByText("Feed Reports")).not.toBeInTheDocument();
  });

  it("translates card labels (Simulation ID, View Report) and the Expand aria-label when 'hi'", async () => {
    getSavedReports.mockResolvedValueOnce({ data: { reports: [report1] } });
    useStore.setState({ user: seedUser({ preferred_language: "hi" }), snackbar: null } as never);
    render(<ReportsPage />);

    await screen.findByText("सिमुलेशन ID"); // Simulation ID
    expect(screen.getByRole("button", { name: "रिपोर्ट देखें" })).toBeInTheDocument(); // View Report
    expect(screen.getByRole("button", { name: "विस्तृत करें" })).toBeInTheDocument(); // Expand aria-label
  });
});
