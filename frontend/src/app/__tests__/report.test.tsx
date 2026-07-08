import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push, back, saveReport } = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  saveReport: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, saveReport };
});

import ReportPage from "@/app/(main)/report/page";
import { useStore, type User } from "@/lib/store";
import type {
  EvaluationResponse,
  RecommendationResponse,
  CattleInfo,
  ReportInfo,
  FeedItem,
} from "@/lib/api";

// jsdom normalizes inline hex colors to rgb(...) when read back via
// getComputedStyle / jest-dom's toHaveStyle. Convert our expected Android
// hex tokens (from CLAUDE.md §12 / §5) to the same format so the
// assertions compare like-for-like (see src/components/__tests__/Toolbar.test.tsx
// for the existing precedent of this pattern).
function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function seedUser(over: Partial<User> = {}): User {
  return {
    id: "u-1",
    name: "Aiyappa",
    email: "aiyappa@dg.org",
    country: "Philippines",
    country_id: "3",
    country_code: "PH",
    currency: "PHP",
    pin: "123456",
    is_admin: false,
    token: "jwt",
    registered_language: "en",
    preferred_language: "en",
    ...over,
  };
}

function baseCattleInfo(over: Partial<CattleInfo> = {}): CattleInfo {
  return {
    simulation_name: "Sim A",
    country: "Philippines",
    country_id: "3",
    breed: "Cross Bred",
    body_weight: 450,
    body_weight_gain: 0.5,
    body_condition_score: 3,
    parity: 2,
    days_in_milk: 100,
    days_of_pregnancy: 60,
    milk_production: 12,
    milk_protein_percent: 3.2,
    milk_fat_percent: 3.8,
    average_temperature: 28,
    grazing: false,
    distance: 0,
    topography: "Flat",
    milk_price: null,
    animal_category: "Lactating Cow",
    simulation_language: null,
    ...over,
  };
}

function makeEvalResponse(over: Partial<EvaluationResponse> = {}): EvaluationResponse {
  return {
    mode: "evaluation",
    report_id: "R-EVAL-1",
    simulation_id: "SIM-1",
    currency: "PHP",
    cost_analysis: {
      currency: "PHP",
      feed_cost_per_kg_milk: 5.25,
      total_diet_cost_as_fed: 120.5,
      recommendations: [],
      warnings: [],
    },
    evaluation_summary: { limiting_factor: null, overall_status: "Optimized" },
    feed_breakdown: [
      {
        contribution_percent: 60,
        currency: "PHP",
        feed_id: "uuid-1",
        feed_name: "Napier Grass",
        feed_type: "Forage",
        price_per_kg: 5,
        quantity_dm_kg_per_day: 3,
        quantity_as_fed_kg_per_day: 10,
        total_cost: 50,
      },
    ],
    intake_evaluation: {
      intake_difference_kg_per_day: 0.5,
      actual_intake_kg_per_day: 12,
      intake_percentage: 96,
      intake_status: "Optimized",
      target_intake_kg_per_day: 12.5,
      recommendations: [],
      warnings: [],
    },
    methane_analysis: {
      classification: "Low",
      methane_yield_g_per_kg_dmi: 20,
      methane_conversion_range: "6-7%",
      "Ym (%)": 6.5,
      methane_emission_mj_per_day: 15,
      methane_intensity_g_per_kg_ecm: 12,
      methane_production_g_per_day: 250,
      recommendations: [],
      warnings: [],
    },
    milk_production_analysis: {
      actual_milk_supported_kg_per_day: 10,
      energy_available_mcal: 20,
      limiting_nutrient: null,
      milk_supported_by_energy_kg_per_day: 11,
      milk_supported_by_protein_kg_per_day: 10,
      target_production_kg_per_day: 12,
      protein_available_g: 500,
      recommendations: [],
      warnings: [],
    },
    nutrient_balance: {
      calcium_balance_kg: 0.1,
      energy_balance_mcal: 0.2,
      ndf_balance_kg: -0.1,
      phosphorus_balance_kg: 0.05,
      protein_balance_kg: 0.3,
      recommendations: [],
      warnings: [],
    },
    ...over,
  };
}

function makeRecResponse(
  over: Partial<RecommendationResponse> = {},
  reportInfoOver: Partial<ReportInfo> = {}
): RecommendationResponse {
  return {
    mode: "recommendation",
    additional_information: {
      diet_status: "OK",
      recommendations: [],
      violated_parameters: [],
      warnings: [],
    },
    least_cost_diet: [
      { currency: "PHP", daily_cost: 60, feed_name: "Napier Grass", price_per_kg: 5, quantity_kg_per_day: 12 },
    ],
    environmental_impact: {
      classification: "Low",
      "Ym (%)": "6.2",
      methane_intensity_grams_per_kg_ecm: "12",
      methane_production_grams_per_day: "220",
      methane_yield_grams_per_kg_dmi: "18",
    },
    report_info: {
      diet_rating: "OPTIMAL",
      generated_date: "2026-07-01T10:00:00Z",
      user_name: "Aiyappa",
      report_id: "R-REC-1",
      simulation_id: "SIM-2",
      ...reportInfoOver,
    },
    solution_summary: { daily_cost: 60, dry_matter_intake: "12.5 kg", milk_production: "10.2 L" },
    total_diet_cost: 60,
    ...over,
  };
}

beforeEach(() => {
  push.mockClear();
  back.mockClear();
  saveReport.mockReset();
  useStore.setState({
    user: seedUser(),
    cattleInfo: baseCattleInfo(),
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

// ─── 1. Diet Status banner color/icon/title per report_info.diet_rating ────
// The banner lives INSIDE the Notes card (SCard title="Notes"), themed by
// `banner` in the page source. Because showNotesCard = !isOptimalOrUnknown,
// the "OPTIMAL / else → green" branch of `banner` is computed but never
// actually rendered — see the dedicated test below and the final report.
describe("Report — Diet Status banner theme by diet_rating", () => {
  it("ADVISORY renders the orange-family theme (title #FF7800, body #FF9800)", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ADVISORY" }) });
    render(<ReportPage />);
    expect(screen.getByText("Simulation Status")).toHaveStyle({ color: hexToRgb("#FF7800") });
    expect(screen.getByText("Solution has safety/nutritional violations")).toHaveStyle({
      color: hexToRgb("#FF9800"),
    });
  });

  it("ERROR_NO_BEST renders the red theme (title #FC2E20, body #E44A4A)", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ERROR_NO_BEST" }) });
    render(<ReportPage />);
    expect(screen.getByText("Simulation Status")).toHaveStyle({ color: hexToRgb("#FC2E20") });
    expect(screen.getByText("No optimized solution found")).toHaveStyle({ color: hexToRgb("#E44A4A") });
  });

  it("ERROR_PRECHECK shares the same red theme as the other ERROR_* ratings", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ERROR_PRECHECK" }) });
    render(<ReportPage />);
    expect(screen.getByText("No optimized solution found")).toHaveStyle({ color: hexToRgb("#E44A4A") });
  });

  it("INFEASIBLE renders the green-ish theme (title #1CA069, body #064E3B) — intentional Android parity, not a bug", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "INFEASIBLE" }) });
    render(<ReportPage />);
    expect(screen.getByText("Simulation Status")).toHaveStyle({ color: hexToRgb("#1CA069") });
    expect(screen.getByText("Solution has safety/nutritional violations")).toHaveStyle({
      color: hexToRgb("#064E3B"),
    });
  });

  it("OPTIMAL never shows the banner at all — showNotesCard hides the entire containing Notes card", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "OPTIMAL" }) });
    render(<ReportPage />);
    expect(screen.queryByText("Simulation Status")).toBeNull();
    expect(screen.queryByText("Optimized solution found")).toBeNull();
  });
});

// ─── 2. showSolutionSections = !isErrorState ───────────────────────────────
describe("Report — showSolutionSections = !isErrorState", () => {
  it("hides Solution Summary / Cost-Effective Diet / Environmental Impact for an ERROR_* rating", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ERROR_NO_RESULT" }) });
    render(<ReportPage />);
    expect(screen.queryByText("Solution Summary")).toBeNull();
    expect(screen.queryByText("Cost-Effective Diet")).toBeNull();
    expect(screen.queryByText("Environmental Impact")).toBeNull();
  });

  it("shows Solution Summary / Cost-Effective Diet / Environmental Impact for a non-error rating (ADVISORY)", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ADVISORY" }) });
    render(<ReportPage />);
    expect(screen.getByText("Solution Summary")).toBeInTheDocument();
    expect(screen.getByText("Cost-Effective Diet")).toBeInTheDocument();
    expect(screen.getByText("Environmental Impact")).toBeInTheDocument();
  });
});

// ─── 3. showNotesCard = !isOptimalOrUnknown ─────────────────────────────────
describe("Report — showNotesCard = !isOptimalOrUnknown", () => {
  it("hides the Notes card when rating is OPTIMAL", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "OPTIMAL" }) });
    render(<ReportPage />);
    expect(screen.queryByText("Notes")).toBeNull();
  });

  it("shows the Notes card for ADVISORY", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "ADVISORY" }) });
    render(<ReportPage />);
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });
});

// ─── 4. mode discriminator ──────────────────────────────────────────────────
describe("Report — mode discriminator", () => {
  it("evaluation mode renders Evaluation-only sections and hides Recommendation-only sections", () => {
    useStore.setState({ reportData: makeEvalResponse() });
    render(<ReportPage />);

    expect(screen.getByText("Cost Analysis")).toBeInTheDocument();
    expect(screen.getByText("Evaluation Summary")).toBeInTheDocument();
    expect(screen.getByText("Feed Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Dry Matter Intake")).toBeInTheDocument();
    expect(screen.getByText("Milk Production Analysis")).toBeInTheDocument();
    expect(screen.getByText("Nutrient Balance")).toBeInTheDocument();
    expect(screen.getByText("Environment Impact")).toBeInTheDocument();

    expect(screen.queryByText("Solution Summary")).toBeNull();
    expect(screen.queryByText("Cost-Effective Diet")).toBeNull();
    expect(screen.queryByText("Environmental Impact")).toBeNull();
  });

  it("recommendation mode renders Recommendation-only sections and hides Evaluation-only sections", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "OPTIMAL" }) });
    render(<ReportPage />);

    expect(screen.getByText("Solution Summary")).toBeInTheDocument();
    expect(screen.getByText("Cost-Effective Diet")).toBeInTheDocument();
    expect(screen.getByText("Total Diet Cost")).toBeInTheDocument();
    expect(screen.getByText("Environmental Impact")).toBeInTheDocument();

    expect(screen.queryByText("Cost Analysis")).toBeNull();
    expect(screen.queryByText("Evaluation Summary")).toBeNull();
    expect(screen.queryByText("Feed Breakdown")).toBeNull();
    // NB: "Dry Matter Intake" as a plain string also appears as a small
    // label inside Recommendation's own Solution Summary card, so it's
    // not a safe negative-assertion string here. "Actual Intake" /
    // "Target Intake" are MetricTile labels unique to Evaluation's
    // intake_evaluation card and don't collide with anything in
    // Recommendation mode.
    expect(screen.queryByText("Actual Intake")).toBeNull();
    expect(screen.queryByText("Target Intake")).toBeNull();
    expect(screen.queryByText("Milk Production Analysis")).toBeNull();
    expect(screen.queryByText("Nutrient Balance")).toBeNull();
    expect(screen.queryByText("Environment Impact")).toBeNull();
  });
});

// ─── 5. Notes card content ──────────────────────────────────────────────────
describe("Report — Notes card content", () => {
  it("concatenates recommendations + warnings, and lists violated_parameters with empties filtered", () => {
    useStore.setState({
      reportData: makeRecResponse(
        {
          additional_information: {
            diet_status: "ADVISORY",
            recommendations: ["Increase protein intake"],
            warnings: ["Watch calcium levels"],
            violated_parameters: ["NDF exceeded", "", "   "],
          },
        },
        { diet_rating: "ADVISORY" }
      ),
    });
    render(<ReportPage />);

    expect(screen.getByText("Violated Parameters:")).toBeInTheDocument();
    expect(screen.getByText("NDF exceeded")).toBeInTheDocument();
    // Blank / whitespace-only violated_parameters entries are filtered out —
    // only ONE bullet should exist under the heading.
    const violatedHeading = screen.getByText("Violated Parameters:");
    const listContainer = violatedHeading.nextElementSibling as HTMLElement;
    expect(listContainer.children.length).toBe(1);

    expect(screen.getByText("Recommendations & Warnings:")).toBeInTheDocument();
    expect(screen.getByText("Increase protein intake")).toBeInTheDocument();
    expect(screen.getByText("Watch calcium levels")).toBeInTheDocument();
  });

  it('shows the "No recommendation/warnings available!" placeholder when both source arrays are empty', () => {
    useStore.setState({
      reportData: makeRecResponse(
        {
          additional_information: {
            diet_status: "ADVISORY",
            recommendations: [],
            warnings: [],
            violated_parameters: [],
          },
        },
        { diet_rating: "ADVISORY" }
      ),
    });
    render(<ReportPage />);
    expect(screen.getByText("No recommendation/warnings available!")).toBeInTheDocument();
    // No "Violated Parameters:" heading when osPoints is empty.
    expect(screen.queryByText("Violated Parameters:")).toBeNull();
  });
});

// ─── 6. Currency rendering — raw code suffix, never Intl currency style ────
// NB: the ACTUAL priority in src/app/(main)/report/page.tsx is
// `user?.currency || reportCurrency || ""` where reportCurrency itself is
// `cost_analysis.currency ?? currency`. That means user.currency wins
// FIRST when present — which is the OPPOSITE priority order documented in
// CLAUDE.md §5 ("cost_analysis.currency (evaluation), then currency, then
// user.currency"). These tests lock in the real, current behavior; the
// doc/code mismatch is flagged in the final report.
describe("Report — currency rendering (raw suffix, real priority order)", () => {
  it("user.currency wins over cost_analysis.currency when both are present", () => {
    useStore.setState({
      user: seedUser({ currency: "VND" }),
      reportData: makeEvalResponse({
        cost_analysis: {
          currency: "PHP",
          feed_cost_per_kg_milk: 5.25,
          total_diet_cost_as_fed: 120.5,
          recommendations: [],
          warnings: [],
        },
      }),
    });
    render(<ReportPage />);
    expect(screen.getByText("120.50 VND")).toBeInTheDocument();
    expect(screen.queryByText(/PHP/)).toBeNull();
  });

  it("falls back to cost_analysis.currency when user.currency is empty", () => {
    useStore.setState({
      user: seedUser({ currency: "" }),
      reportData: makeEvalResponse({
        cost_analysis: {
          currency: "PHP",
          feed_cost_per_kg_milk: 5.25,
          total_diet_cost_as_fed: 120.5,
          recommendations: [],
          warnings: [],
        },
      }),
    });
    render(<ReportPage />);
    expect(screen.getByText("120.50 PHP")).toBeInTheDocument();
  });

  it("renders as a raw code suffix — never an Intl.NumberFormat currency glyph", () => {
    useStore.setState({
      user: seedUser({ currency: "VND" }),
      reportData: makeEvalResponse(),
    });
    render(<ReportPage />);
    expect(screen.queryByText(/₫/)).toBeNull();
    expect(screen.getByText("120.50 VND")).toBeInTheDocument();
  });
});

// ─── 7. Bottom action bar ───────────────────────────────────────────────────
describe('Report — "New Case" button', () => {
  it("navigates to /cattle-info", () => {
    useStore.setState({ reportData: makeRecResponse({}, { diet_rating: "OPTIMAL" }) });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /New Case/ }));
    expect(push).toHaveBeenCalledWith("/cattle-info");
  });

  it("does NOT clear feedSelections or reset feedSelectionType — current source deliberately preserves them (diverges from CLAUDE.md §5's documented behavior)", () => {
    const existingSelections: FeedItem[] = [
      {
        id: "f1",
        feed_type_id: 1,
        feed_type_name: "Forage",
        category_id: 1,
        category_name: "Grass",
        sub_category_id: 1,
        sub_category_name: "Napier",
        feed_uuid: "u1",
        price_per_kg: 5,
        quantity_kg: 10,
      } as FeedItem,
    ];
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL" }),
      feedSelections: existingSelections,
      feedSelectionType: "evaluation",
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /New Case/ }));
    expect(useStore.getState().feedSelections.length).toBe(1);
    expect(useStore.getState().feedSelectionType).toBe("evaluation");
  });
});

describe('Report — "Save Report" + "View PDF"', () => {
  it("POSTs saveReport({report_id, user_id}) and opens the PDF from bucket_url", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: true, message: "Saved!", bucket_url: "https://x/1.pdf" },
    });
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL", report_id: "R-REC-99" }),
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    await waitFor(() => expect(saveReport).toHaveBeenCalledWith("R-REC-99", "u-1"));
    await waitFor(() => expect(screen.getByRole("button", { name: /View PDF/ })).toBeInTheDocument());

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /View PDF/ }));
    expect(openSpy).toHaveBeenCalledWith("https://x/1.pdf", "_blank", "noopener,noreferrer");
  });

  it("falls back to report.bucket_url when the top-level bucket_url is absent", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: true, report: { bucket_url: "https://x/2.pdf" } },
    });
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL", report_id: "R-REC-2" }),
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /View PDF/ })).toBeInTheDocument());

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /View PDF/ }));
    expect(openSpy).toHaveBeenCalledWith("https://x/2.pdf", "_blank", "noopener,noreferrer");
  });

  it("falls back to pdf_url when neither bucket_url variant is present", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: true, pdf_url: "https://x/3.pdf" },
    });
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL", report_id: "R-REC-3" }),
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /View PDF/ })).toBeInTheDocument());

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /View PDF/ }));
    expect(openSpy).toHaveBeenCalledWith("https://x/3.pdf", "_blank", "noopener,noreferrer");
  });

  // Regression coverage: per the v1 swagger, SaveReportResponse's
  // `success` and `error_message` fields are independent — a save can
  // succeed (report persisted) while error_message separately explains
  // that PDF generation (POST /v1/animal/reports/pdf) isn't implemented
  // yet. The old code treated ANY error_message as a hard failure
  // (regardless of `success`) and bailed out with an error toast before
  // ever confirming the report was actually saved.
  it("success:true + error_message (PDF-pending) shows an info toast, not an error — and does NOT early-return", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: true, message: "Report saved", error_message: "PDF generation not yet implemented", bucket_url: null },
    });
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL", report_id: "R-REC-4" }),
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    await waitFor(() => expect(saveReport).toHaveBeenCalled());

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("info");
      expect(snap?.message).toContain("PDF generation not yet implemented");
    });
    // No PDF link should appear since bucket_url is null, but this must
    // NOT be treated the same as a save failure.
    expect(screen.queryByRole("button", { name: /View PDF/ })).not.toBeInTheDocument();
  });

  it("success:false still shows a hard error toast", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: false, error_message: "Simulation not found", message: "Save failed" },
    });
    useStore.setState({
      reportData: makeRecResponse({}, { diet_rating: "OPTIMAL", report_id: "R-REC-5" }),
    });
    render(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Simulation not found");
    });
    expect(screen.queryByRole("button", { name: /View PDF/ })).not.toBeInTheDocument();
  });
});

// ─── 8. StatusBadge color mapping ───────────────────────────────────────────
// Confirmed rendered on this page: Evaluation Summary's "Overall Status"
// row and Intake Evaluation's "Status" row (evaluation mode only).
describe("Report — StatusBadge color mapping", () => {
  it("Optimized → green (#05BC6D)", () => {
    useStore.setState({
      reportData: makeEvalResponse({
        evaluation_summary: { limiting_factor: null, overall_status: "Optimized" },
        // Default fixture also sets intake_status: "Optimized", which would
        // render a second identical badge — null it out so this test
        // exercises exactly one StatusBadge instance.
        intake_evaluation: {
          intake_difference_kg_per_day: 0.5,
          actual_intake_kg_per_day: 12,
          intake_percentage: 96,
          intake_status: null,
          target_intake_kg_per_day: 12.5,
          recommendations: [],
          warnings: [],
        },
      }),
    });
    render(<ReportPage />);
    expect(screen.getByText("Optimized")).toHaveStyle({ backgroundColor: hexToRgb("#05BC6D") });
  });

  it("Not Feasible → red (#E44A4A)", () => {
    useStore.setState({
      reportData: makeEvalResponse({
        intake_evaluation: {
          intake_difference_kg_per_day: 0.5,
          actual_intake_kg_per_day: 12,
          intake_percentage: 96,
          intake_status: "Not Feasible",
          target_intake_kg_per_day: 12.5,
          recommendations: [],
          warnings: [],
        },
      }),
    });
    render(<ReportPage />);
    expect(screen.getByText("Not Feasible")).toHaveStyle({ backgroundColor: hexToRgb("#E44A4A") });
  });

  it("Evaluation → orange (#FF9800)", () => {
    useStore.setState({
      reportData: makeEvalResponse({
        evaluation_summary: { limiting_factor: null, overall_status: "Evaluation" },
      }),
    });
    render(<ReportPage />);
    expect(screen.getByText("Evaluation")).toHaveStyle({ backgroundColor: hexToRgb("#FF9800") });
  });
});
