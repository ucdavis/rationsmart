import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GeneratingReportDialog from "@/components/GeneratingReportDialog";
import { useStore } from "@/lib/store";

// GeneratingReportDialog takes no props — callers gate it with
// `{isLoading && <GeneratingReportDialog />}` (see
// src/app/(main)/feed-selection/page.tsx:1094). We mirror that pattern
// here rather than inventing an `open` prop the component doesn't have.
function Harness({ open }: { open: boolean }) {
  return <>{open && <GeneratingReportDialog />}</>;
}

beforeEach(() => {
  useStore.setState({ user: null, cattleInfo: null } as never);
});

describe("GeneratingReportDialog", () => {
  it("renders the title and icon when mounted (open)", () => {
    render(<Harness open />);
    expect(screen.getByText("Generating your report")).toBeInTheDocument();
  });

  it("does not render anything when not open (unmounted by parent gate)", () => {
    const { container } = render(<Harness open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the indeterminate spinner (animate-spin svg)", () => {
    const { container } = render(<Harness open />);
    const spinner = container.querySelector("svg.animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("renders the go_green_15 tinted icon pill behind the report icon", () => {
    const { container } = render(<Harness open />);
    // jsdom re-serializes the style attribute (adds spaces after commas),
    // so compare against the computed style rather than a raw substring.
    const candidates = Array.from(container.querySelectorAll("div"));
    const pill = candidates.find(
      (el) => getComputedStyle(el).backgroundColor === "rgba(5, 188, 109, 0.15)"
    );
    expect(pill).toBeTruthy();
  });

  it("uses dark_aquamarine_green (#064E3B) for the title text color", () => {
    render(<Harness open />);
    const title = screen.getByText("Generating your report");
    expect(title).toHaveStyle({ color: "#064E3B" });
  });

  it("is centred within the 480px app column, not the full viewport", () => {
    const { container } = render(<Harness open />);
    const overlay = container.firstChild as HTMLElement;
    // jsdom's CSSOM reformats the calc() expression (e.g. "0.5 * (100vw -
    // 480px)") so we can't compare the exact source string — assert on the
    // ingredients that matter instead: the 480px column cap and 100vw.
    expect(overlay.style.left).toMatch(/480px/);
    expect(overlay.style.left).toMatch(/100vw/);
    expect(overlay.style.width).toBe("min(100vw, 480px)");
  });

  // UI-label i18n — same per-simulation resolution as feed-selection/page.tsx
  // and FeedRow (cattleInfo.simulation_language ahead of user.preferred_language).
  it("translates the title to Hindi when cattleInfo.simulation_language is 'hi'", async () => {
    useStore.setState({
      cattleInfo: { simulation_language: "hi" } as never,
      user: { preferred_language: "en" } as never,
    });
    render(<Harness open />);
    await screen.findByText("आपकी रिपोर्ट तैयार की जा रही है"); // "Generating your report"
    expect(screen.queryByText("Generating your report")).not.toBeInTheDocument();
  });
});
