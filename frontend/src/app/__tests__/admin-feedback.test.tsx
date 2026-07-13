import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { replace, back, push, getAdminFeedbacks, getAdminFeedbackStats } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  getAdminFeedbacks: vi.fn(),
  getAdminFeedbackStats: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getAdminFeedbacks, getAdminFeedbackStats };
});

import AdminFeedbackPage from "@/app/(main)/admin/feedback/page";
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
  getAdminFeedbacks.mockReset();
  getAdminFeedbackStats.mockReset();
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

describe("Admin feedback — loads via Promise.all", () => {
  it("calls getAdminFeedbacks(user.id, 50, 0) and getAdminFeedbackStats(user.id)", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({ data: { feedbacks: [] } });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: { total_feedbacks: 0, overall_rating: 0 } });

    render(<AdminFeedbackPage />);

    expect(getAdminFeedbacks).toHaveBeenCalledWith("u-1", 50, 0);
    expect(getAdminFeedbackStats).toHaveBeenCalledWith("u-1");
    await waitFor(() => expect(screen.getByText("No feedbacks found")).toBeInTheDocument());
  });

  it("shows an error snackbar when either call fails", async () => {
    getAdminFeedbacks.mockRejectedValueOnce(new Error("boom"));
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);
    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Could not load feedback");
    });
  });
});

describe("Admin feedback — Aggregated Insights stats (exact decimal, no rounding)", () => {
  it('renders overall_rating 3.95 verbatim as "3.95" — NOT rounded to "4" or "4.0"', async () => {
    getAdminFeedbacks.mockResolvedValueOnce({ data: { feedbacks: [] } });
    getAdminFeedbackStats.mockResolvedValueOnce({
      data: { total_feedbacks: 20, overall_rating: 3.95 },
    });

    render(<AdminFeedbackPage />);

    await waitFor(() => expect(screen.getByText("Aggregated Insights")).toBeInTheDocument());
    expect(screen.getByText("3.95")).toBeInTheDocument();
    expect(screen.queryByText("4.0")).not.toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("renders total_feedbacks from stats verbatim", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({ data: { feedbacks: [] } });
    getAdminFeedbackStats.mockResolvedValueOnce({
      data: { total_feedbacks: 42, overall_rating: 3.5 },
    });

    render(<AdminFeedbackPage />);
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText("3.50")).toBeInTheDocument();
  });

  it("falls back to average_rating when overall_rating is absent, still 2-decimal formatted", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({ data: { feedbacks: [] } });
    getAdminFeedbackStats.mockResolvedValueOnce({
      data: { total_feedbacks: 5, average_rating: 4.1 },
    });

    render(<AdminFeedbackPage />);
    await waitFor(() => expect(screen.getByText("4.10")).toBeInTheDocument());
  });

  it("falls back to feedbacks.length for Total Feedbacks when stats omits it", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: {
        feedbacks: [
          { id: 1, created_at: "2026-06-04T10:30:00Z" },
          { id: 2, created_at: "2026-06-04T10:30:00Z" },
        ],
      },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: { overall_rating: 4 } });

    render(<AdminFeedbackPage />);
    await waitFor(() => expect(screen.getByText("Aggregated Insights")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("Admin feedback — category pill styling + label", () => {
  const baseFeedback = {
    id: 1,
    user_name: "Farmer Joe",
    user_email: "joe@example.com",
    text_feedback: "Great app!",
    overall_rating: 4,
    created_at: "2026-06-04T10:30:00Z",
  };

  it("Defect → carmine_pink badge (#FC2E20 text / 20% bg)", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, feedback_type: "Defect" }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);
    const badge = await screen.findByText("Defect");
    expect(badge).toHaveStyle({ color: "#FC2E20", backgroundColor: "rgba(228,74,74,0.2)" });
  });

  it("Feature Request → ultramarine badge (#1E40AF text / 15% bg)", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, feedback_type: "Feature Request" }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);
    const badge = await screen.findByText("Feature Request");
    expect(badge).toHaveStyle({ color: "#1E40AF", backgroundColor: "rgba(30,64,175,0.15)" });
  });

  it("General (and any unrecognized type) → dark_aquamarine_green badge (#064E3B text / 15% bg)", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, feedback_type: "General" }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);
    const badge = await screen.findByText("General");
    expect(badge).toHaveStyle({ color: "#064E3B", backgroundColor: "rgba(5,188,109,0.15)" });
  });

  it("defaults the category to 'General' when feedback_type is missing", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, feedback_type: undefined }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);
    const badge = await screen.findByText("General");
    expect(badge).toHaveStyle({ color: "#064E3B" });
  });
});

describe("Admin feedback — star row rendering", () => {
  const baseFeedback = {
    id: 1,
    user_name: "Farmer Joe",
    user_email: "joe@example.com",
    text_feedback: "Great app!",
    feedback_type: "General",
    created_at: "2026-06-04T10:30:00Z",
  };

  it("rating=3 renders 3 filled stars (#FFDB58) and 2 empty stars (#C2C2C2)", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, overall_rating: 3 }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    const { container } = render(<AdminFeedbackPage />);
    await screen.findByText("Farmer Joe");

    const filled = container.querySelectorAll('path[fill="#FFDB58"]');
    const empty = container.querySelectorAll('path[stroke="#C2C2C2"]');
    expect(filled).toHaveLength(3);
    expect(empty).toHaveLength(2);
  });

  it("rating=0/missing renders 0 filled and 5 empty stars", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, overall_rating: undefined }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    const { container } = render(<AdminFeedbackPage />);
    await screen.findByText("Farmer Joe");

    expect(container.querySelectorAll('path[fill="#FFDB58"]')).toHaveLength(0);
    expect(container.querySelectorAll('path[stroke="#C2C2C2"]')).toHaveLength(5);
  });

  it("rating=5 renders 5 filled and 0 empty stars", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: { feedbacks: [{ ...baseFeedback, overall_rating: 5 }] },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    const { container } = render(<AdminFeedbackPage />);
    await screen.findByText("Farmer Joe");

    expect(container.querySelectorAll('path[fill="#FFDB58"]')).toHaveLength(5);
    expect(container.querySelectorAll('path[stroke="#C2C2C2"]')).toHaveLength(0);
  });
});

describe("Admin feedback — list population from the API", () => {
  it("renders user name, email, feedback text, and formatted date", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: {
        feedbacks: [
          {
            id: 7,
            user_name: "Farmer Joe",
            user_email: "joe@example.com",
            text_feedback: "Loved the new report screen.",
            feedback_type: "General",
            overall_rating: 4,
            created_at: "2026-06-04T10:30:00Z",
          },
        ],
      },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);

    await waitFor(() => expect(screen.getByText("Farmer Joe")).toBeInTheDocument());
    expect(screen.getByText("joe@example.com")).toBeInTheDocument();
    expect(screen.getByText("Loved the new report screen.")).toBeInTheDocument();
    // en-GB "day month(short) year" format, e.g. "4 Jun 2026"
    expect(screen.getByText(/^\d{1,2} \w{3} 2026$/)).toBeInTheDocument();
  });

  it('falls back to "N/A" for missing name/email and "Feedback not provided!" for empty text', async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: {
        feedbacks: [
          {
            id: 8,
            feedback_type: "General",
            overall_rating: 2,
            created_at: "2026-06-04T10:30:00Z",
          },
        ],
      },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);

    await waitFor(() => expect(screen.getByText("Feedback not provided!")).toBeInTheDocument());
    expect(screen.getAllByText("N/A")).toHaveLength(2); // name + email
  });

  it("renders one card per feedback item", async () => {
    getAdminFeedbacks.mockResolvedValueOnce({
      data: {
        feedbacks: [
          { id: 1, user_name: "A", feedback_type: "General", overall_rating: 1, created_at: "2026-06-04T10:30:00Z" },
          { id: 2, user_name: "B", feedback_type: "Defect", overall_rating: 2, created_at: "2026-06-04T10:30:00Z" },
          { id: 3, user_name: "C", feedback_type: "Feature Request", overall_rating: 3, created_at: "2026-06-04T10:30:00Z" },
        ],
      },
    });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: {} });

    render(<AdminFeedbackPage />);

    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});

// UI-label translation (src/lib/i18n-ui.ts) — the "hi" dictionary
// lazy-loads via dynamic import(), so findBy waits for it to resolve.
describe("Admin feedback — i18n (Hindi)", () => {
  it("renders the toolbar title and stats labels in Hindi when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) } as never);
    getAdminFeedbacks.mockResolvedValueOnce({ data: { feedbacks: [] } });
    getAdminFeedbackStats.mockResolvedValueOnce({ data: { total_feedbacks: 0, overall_rating: 0 } });

    render(<AdminFeedbackPage />);

    await screen.findByText("प्रतिक्रिया प्रबंधन"); // Feedback Management (toolbar title)
    expect(screen.getByText("समग्र अंतर्दृष्टि")).toBeInTheDocument(); // Aggregated Insights
    expect(screen.getByText("कुल प्रतिक्रियाएं")).toBeInTheDocument(); // Total Feedbacks
    expect(screen.queryByText("Feedback Management")).not.toBeInTheDocument();
  });
});
