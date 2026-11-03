import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push, replace, saveReport, requestReportPdf } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  saveReport: vi.fn(),
  requestReportPdf: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, saveReport, requestReportPdf };
});

import CalfPlanPage from "@/app/(main)/calf-plan/page";
import { useStore, type User } from "@/lib/store";
import type { CattleInfo, RecommendationResponse } from "@/lib/api";

const user = {
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@dg.org",
  country: "Vietnam",
  country_id: "5",
  country_code: "VN",
  currency: "VND",
  pin: "123456",
  is_admin: false,
  preferred_language: "en",
} as User;

const calf = {
  simulation_name: "Calf 1",
  animal_category: "Baby Calf/Heifer",
  body_weight: 46,
  simulation_language: "en",
} as unknown as CattleInfo;

// The backend's answer for a 46 kg calf (W13 handoff, §2).
const answer = {
  mode: "recommendation",
  report_id: "rec-1a2b3c4d",
  simulation_id: "Calf 1-rec-20261102",
  solution_status: "MILK_FEEDING_ONLY",
  calf_milk_feeding_plan: {
    daily_milk_volume_l: 4.6,
    feedings_per_day: 2,
    per_feeding_l: 2.3,
    daily_milk_fed_l: 4.6,
    estimated_weaning_age_days: 56,
    notes: ["Cho bê uống sữa sạch, ấm (38–40°C).", "Có thể thay sữa nguyên bằng sữa thay thế."],
  },
} as unknown as RecommendationResponse;

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  saveReport.mockReset();
  requestReportPdf.mockReset();
  useStore.setState({
    user,
    cattleInfo: calf,
    reportData: answer,
    reportInputs: { cattleInfo: calf, feedSelections: [] },
    snackbar: null,
  });
});

describe("Calf milk plan — the backend's answer (W13)", () => {
  it("shows the backend's amounts, weaning age and its translated notes as they come", () => {
    render(<CalfPlanPage />);
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("2.3")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByText("Cho bê uống sữa sạch, ấm (38–40°C).")).toBeInTheDocument();
    expect(screen.getByText("Có thể thay sữa nguyên bằng sữa thay thế.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes back to Cattle Info when the stored run isn't a calf answer", () => {
    useStore.setState({ reportData: { ...answer, calf_milk_feeding_plan: undefined } });
    render(<CalfPlanPage />);
    expect(replace).toHaveBeenCalledWith("/cattle-info");
  });

  it("New Case returns to Cattle Info", () => {
    render(<CalfPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: /New Case/ }));
    expect(push).toHaveBeenCalledWith("/cattle-info");
  });

  it("Save Report saves the run's report_id and offers View PDF", async () => {
    saveReport.mockResolvedValueOnce({
      data: { success: true, message: "Saved!", bucket_url: "https://x/calf.pdf" },
    });
    render(<CalfPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    await waitFor(() => expect(saveReport).toHaveBeenCalledWith("rec-1a2b3c4d", "u-1"));

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(await screen.findByRole("button", { name: /View PDF/ }));
    expect(openSpy).toHaveBeenCalledWith("https://x/calf.pdf", "_blank", "noopener,noreferrer");
  });

  it("while the PDF is still being made, Get PDF asks for it", async () => {
    saveReport.mockResolvedValueOnce({ data: { success: true, bucket_url: null } });
    requestReportPdf.mockResolvedValueOnce({ data: { bucket_url: "https://x/calf.pdf" } });
    vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CalfPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Report/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Get PDF" }));
    await waitFor(() => expect(requestReportPdf).toHaveBeenCalledWith("rec-1a2b3c4d", "u-1"));
    expect(await screen.findByRole("button", { name: /View PDF/ })).toBeInTheDocument();
  });
});
