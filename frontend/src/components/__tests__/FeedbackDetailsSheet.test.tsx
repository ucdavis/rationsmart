import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FeedbackDetailsSheet, { type FeedbackDetails } from "@/components/FeedbackDetailsSheet";

function make(over: Partial<FeedbackDetails> = {}): FeedbackDetails {
  return {
    rating: 4,
    category: "General",
    createdAt: "2026-06-04T00:00:00Z",
    text: "The report is very helpful!",
    ...over,
  };
}

describe("FeedbackDetailsSheet", () => {
  it("returns null when details are null (unmounted)", () => {
    const { container } = render(
      <FeedbackDetailsSheet details={null} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'Your Rating' + 'Your Feedback' titles when open", () => {
    render(<FeedbackDetailsSheet details={make()} onClose={() => {}} />);
    expect(screen.getByText("Your Rating")).toBeInTheDocument();
    expect(screen.getByText("Your Feedback")).toBeInTheDocument();
  });

  it("renders the category value and date", () => {
    render(<FeedbackDetailsSheet details={make({ category: "Defect" })} onClose={() => {}} />);
    expect(screen.getByText("Defect")).toBeInTheDocument();
    expect(screen.getByText("4 Jun 2026")).toBeInTheDocument();
  });

  it("renders the feedback text verbatim", () => {
    render(
      <FeedbackDetailsSheet
        details={make({ text: "Very nice thanks" })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Very nice thanks")).toBeInTheDocument();
  });

  it.each([
    [0, 0],
    [1, 1],
    [3, 3],
    [5, 5],
  ])("renders %i filled stars for rating=%i", (rating, filledCount) => {
    const { container } = render(
      <FeedbackDetailsSheet details={make({ rating })} onClose={() => {}} />
    );
    // Stars are <svg fill="#FFDB58"> for filled, <svg fill="#C2C2C2"> for empty.
    const svgs = container.querySelectorAll("svg[fill='#FFDB58']");
    expect(svgs.length).toBe(filledCount);
  });

  it("clamps ratings above 5 to 5 stars", () => {
    const { container } = render(
      <FeedbackDetailsSheet details={make({ rating: 42 })} onClose={() => {}} />
    );
    const filled = container.querySelectorAll("svg[fill='#FFDB58']");
    expect(filled.length).toBe(5);
  });

  it("clamps negative ratings to zero stars", () => {
    const { container } = render(
      <FeedbackDetailsSheet details={make({ rating: -1 })} onClose={() => {}} />
    );
    const filled = container.querySelectorAll("svg[fill='#FFDB58']");
    expect(filled.length).toBe(0);
  });

  it("falls back to 'Feedback not provided!' for empty text", () => {
    render(
      <FeedbackDetailsSheet
        details={make({ text: "" })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Feedback not provided!")).toBeInTheDocument();
  });

  it("falls back for whitespace-only text (matches Android trim behaviour)", () => {
    render(
      <FeedbackDetailsSheet
        details={make({ text: "   \n  " })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Feedback not provided!")).toBeInTheDocument();
  });

  it("falls back category to 'N/A' when empty", () => {
    render(
      <FeedbackDetailsSheet
        details={make({ category: "" })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("Close button invokes onClose", () => {
    const onClose = vi.fn();
    render(<FeedbackDetailsSheet details={make()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Backdrop click closes; click inside panel does NOT", () => {
    const onClose = vi.fn();
    const { container } = render(
      <FeedbackDetailsSheet details={make()} onClose={onClose} />
    );
    const backdrop = container.firstChild as HTMLElement;
    // Click on the backdrop element itself (target === currentTarget path)
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();

    // Click on a child (the panel) — should NOT close.
    onClose.mockClear();
    const panel = backdrop.firstChild as HTMLElement;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders 'Not available' when createdAt is missing/invalid", () => {
    render(
      <FeedbackDetailsSheet
        details={make({ createdAt: "" })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });
});
