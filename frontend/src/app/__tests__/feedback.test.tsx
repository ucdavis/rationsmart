import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { replace, back, push, submitFeedback, getMyFeedback } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  submitFeedback: vi.fn(),
  getMyFeedback: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, submitFeedback, getMyFeedback };
});

import FeedbackPage from "@/app/(main)/feedback/page";
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
  is_admin: false,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  submitFeedback.mockReset();
  getMyFeedback.mockReset();
  getMyFeedback.mockResolvedValue({ data: [] }); // default fallback for history loads
  useStore.setState({ user: seedUser(), snackbar: null } as never);
});

const textareaEl = () => screen.getByPlaceholderText(/Tell us how we can improve/);
const submitButton = () => screen.getByRole("button", { name: /Submit Feedback/ });

describe("Feedback — layout", () => {
  it("defaults to the General category and loads history on mount", async () => {
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalledWith("u-1", 5, 0));
    expect(screen.getByRole("radio", { name: "General" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Defect" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Feature Request" })).not.toBeChecked();
  });

  it("Submit button starts disabled with no text and no rating", async () => {
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalled());
    expect(submitButton()).toBeDisabled();
  });
});

describe("Feedback — submit gating", () => {
  it("enables Submit once text is entered, disables again when cleared", async () => {
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalled());

    fireEvent.change(textareaEl(), { target: { value: "Nice app" } });
    expect(submitButton()).not.toBeDisabled();

    fireEvent.change(textareaEl(), { target: { value: "" } });
    expect(submitButton()).toBeDisabled();
  });

  it("enables Submit from a star rating alone (no text required)", async () => {
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "3 star" }));
    expect(submitButton()).not.toBeDisabled();
  });
});

describe("Feedback — category selection", () => {
  it("sends the selected category as feedback_type", async () => {
    submitFeedback.mockResolvedValueOnce({ data: {} });
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("radio", { name: "Defect" }));
    fireEvent.change(textareaEl(), { target: { value: "Found a bug" } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(submitFeedback).toHaveBeenCalledWith("u-1", {
        feedback_type: "Defect",
        text_feedback: "Found a bug",
      })
    );
  });
});

describe("Feedback — star rating selection", () => {
  it("clicking star N sets overall_rating to N in the submit payload", async () => {
    submitFeedback.mockResolvedValueOnce({ data: {} });
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "4 star" }));
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(submitFeedback).toHaveBeenCalledWith("u-1", {
        feedback_type: "General",
        overall_rating: 4,
      })
    );
  });
});

describe("Feedback — successful submit", () => {
  it("shows a success snackbar, clears the form, and reloads history", async () => {
    submitFeedback.mockResolvedValueOnce({ data: {} });
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: "Feature Request" }));
    fireEvent.change(textareaEl(), { target: { value: "Loved it" } });
    fireEvent.click(screen.getByRole("button", { name: "5 star" }));
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(submitFeedback).toHaveBeenCalledWith("u-1", {
        feedback_type: "Feature Request",
        text_feedback: "Loved it",
        overall_rating: 5,
      })
    );

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("success");
      expect(snap?.message).toBe("Thank you for your feedback!");
    });

    // Form resets
    expect(textareaEl()).toHaveValue("");
    expect(screen.getByRole("radio", { name: "General" })).toBeChecked();

    // History is reloaded after a successful submit
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalledTimes(2));
  });
});

describe("Feedback — submit error path", () => {
  it("shows an error snackbar with the failure message and does not clear the form", async () => {
    submitFeedback.mockRejectedValueOnce(new Error("Server exploded"));
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalledTimes(1));

    fireEvent.change(textareaEl(), { target: { value: "This will fail" } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Server exploded");
    });

    // Form is left untouched on failure (no reset)
    expect(textareaEl()).toHaveValue("This will fail");
    // History is not reloaded on failure
    expect(getMyFeedback).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the rejection isn't an Error instance", async () => {
    submitFeedback.mockRejectedValueOnce("boom");
    render(<FeedbackPage />);
    await waitFor(() => expect(getMyFeedback).toHaveBeenCalledTimes(1));

    fireEvent.change(textareaEl(), { target: { value: "Anything" } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Submission failed");
    });
  });
});

describe("Feedback — history list", () => {
  const historyItems = [
    { id: 1, feedback_type: "General", text_feedback: "Great app", overall_rating: 4, created_at: "2026-06-01T00:00:00Z" },
    { id: 2, feedback_type: "Defect", text_feedback: "Found a bug", overall_rating: 2, created_at: "2026-06-02T00:00:00Z" },
  ];

  it("renders the last-5 feedback list returned by getMyFeedback on mount", async () => {
    getMyFeedback.mockResolvedValueOnce({ data: historyItems });
    render(<FeedbackPage />);

    await waitFor(() => expect(screen.getByText("Great app")).toBeInTheDocument());
    expect(screen.getByText("Found a bug")).toBeInTheDocument();
    expect(screen.getByText("2 TOTAL")).toBeInTheDocument();
    expect(screen.getByText("GENERAL")).toBeInTheDocument();
    expect(screen.getByText("DEFECT")).toBeInTheDocument();
  });

  it("shows an empty-history message when there is no feedback yet", async () => {
    getMyFeedback.mockResolvedValueOnce({ data: [] });
    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText("No feedback submitted yet")).toBeInTheDocument());
  });

  it("shows an error snackbar when getMyFeedback rejects", async () => {
    getMyFeedback.mockReset();
    getMyFeedback.mockRejectedValueOnce(new Error("down"));
    render(<FeedbackPage />);

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Could not load feedback history");
    });
  });

  it("opens the details sheet when a history card is clicked, and Close dismisses it", async () => {
    getMyFeedback.mockResolvedValueOnce({ data: historyItems });
    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText("Great app")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Great app"));
    expect(screen.getByText("Your Rating")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(screen.queryByText("Your Rating")).toBeNull();
  });
});

describe("Feedback — UI-label translation", () => {
  it("translates the toolbar title, static copy, and category labels when user.preferred_language is 'hi'", async () => {
    getMyFeedback.mockResolvedValue({ data: [] });
    useStore.setState({ user: seedUser({ preferred_language: "hi" }), snackbar: null } as never);
    render(<FeedbackPage />);

    // The "hi" dictionary lazy-loads via dynamic import() — findBy waits
    // for it to resolve rather than assuming it's already in the cache.
    await screen.findByText("प्रतिक्रिया"); // toolbar title "Feedback"
    expect(screen.getByText("ऐप को रेट करें")).toBeInTheDocument(); // Rate The App
    expect(screen.getByText("प्रतिक्रिया श्रेणी")).toBeInTheDocument(); // Feedback Category
    expect(screen.getByText("सामान्य")).toBeInTheDocument(); // General (category label)
    expect(screen.getByText("प्रतिक्रिया जमा करें")).toBeInTheDocument(); // Submit Feedback
    expect(screen.getByText("आपकी प्रतिक्रियाएं")).toBeInTheDocument(); // Your Feedbacks
    expect(screen.queryByText("Feedback Category")).not.toBeInTheDocument();
  });
});
