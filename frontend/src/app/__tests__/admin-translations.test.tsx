import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { replace, getTranslationCoverage } = vi.hoisted(() => ({
  replace: vi.fn(),
  getTranslationCoverage: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getTranslationCoverage };
});

import AdminTranslationsRedirect from "@/app/(main)/admin/translations/page";
import TranslationCoverageCard from "@/components/admin/country-language/TranslationCoverageCard";

// /admin/translations duplicated Country/Language's workbook tools; its only
// unique piece — the coverage check — moved onto the Feed Names tab (B-18).
describe("Admin translations (merged into Country/Language)", () => {
  it("redirects to the Feed Names tab", async () => {
    render(<AdminTranslationsRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/country-language?tab=feeds"));
  });

  it("the coverage card fetches for the selected pair and shows percentages", async () => {
    getTranslationCoverage.mockResolvedValueOnce({
      data: {
        total_feeds: 10,
        translated_feeds: 9,
        missing_feeds: 1,
        total_types: 2,
        translated_types: 1,
        total_categories: 4,
        translated_categories: 0,
      },
    });
    render(<TranslationCoverageCard countryId="c1" lang="hi" showSnackbar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Check Coverage" }));
    await screen.findByText("90%");
    expect(getTranslationCoverage).toHaveBeenCalledWith("c1", "hi");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("is disabled until a language is picked", () => {
    render(<TranslationCoverageCard countryId="c1" lang={null} showSnackbar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Check Coverage" })).toBeDisabled();
  });
});
