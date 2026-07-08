import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { push, getCountries, getUserReports, getSimulationDetails } = vi.hoisted(() => ({
  push: vi.fn(),
  getCountries: vi.fn(),
  getUserReports: vi.fn(),
  getSimulationDetails: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getCountries, getUserReports, getSimulationDetails };
});

import CattleInfoPage from "@/app/(main)/cattle-info/page";
import { useStore, type User, type CattleInfo, type FeedItem } from "@/lib/store";

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

const countries = [
  { id: "1", name: "India", code: "IN", country_code: "IN", currency: "INR", supported_languages: ["en", "hi"] },
  { id: "2", name: "Vietnam", code: "VN", country_code: "VN", currency: "VND" },
];

beforeEach(() => {
  push.mockClear();
  getCountries.mockReset();
  getUserReports.mockReset();
  getSimulationDetails.mockReset();
  useStore.setState({
    user: null,
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

// ---- CustomSelect helpers -------------------------------------------------
// CustomSelect (src/components/CustomSelect.tsx) is NOT a native <select> —
// it's a <button> trigger + a popup of option <button>s, both rendered
// inside the same wrapper element that immediately follows the FieldLabel's
// <p> in the JSX (see cattle-info/page.tsx SelectInput). FieldLabel strips
// the trailing " *" into a separate <span>, so the label <p>'s own text node
// is the label text minus " *" — that's what we query on.
async function dropdownWrapper(labelText: string): Promise<HTMLElement> {
  // Country/Language render behind a loading skeleton until getCountries
  // resolves (see FieldSkeleton in cattle-info/page.tsx) — findByText
  // waits for that swap instead of assuming the label is already mounted.
  const label = await screen.findByText(labelText);
  return label.nextElementSibling as HTMLElement;
}

async function openDropdown(labelText: string): Promise<HTMLElement> {
  const wrapper = await dropdownWrapper(labelText);
  const trigger = within(wrapper).getAllByRole("button")[0];
  fireEvent.click(trigger);
  return wrapper;
}

async function chooseOption(wrapper: HTMLElement, optionLabel: string) {
  // The trigger button can ALREADY display optionLabel as its current
  // selected value (e.g. re-picking "India" when it's already selected),
  // which would tie with the popup's option button on an exact name match.
  // The trigger always renders before the popup in DOM order, so the last
  // match is always the popup's option row.
  const options = await within(wrapper).findAllByRole("button", { name: optionLabel });
  fireEvent.click(options[options.length - 1]);
}

async function selectCountry(name: string) {
  const wrapper = await openDropdown("Country");
  await chooseOption(wrapper, name);
}

async function selectMilkFields(protein = "3.0", fat = "4.0") {
  const proteinWrapper = await openDropdown("Milk Protein %");
  await chooseOption(proteinWrapper, protein);
  const fatWrapper = await openDropdown("Milk Fat %");
  await chooseOption(fatWrapper, fat);
}

function fillSimulationName(name = "Test Sim") {
  const nameInput = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: name } });
}

function inputAfterLabel(labelText: string): HTMLInputElement {
  return screen.getByText(labelText).nextElementSibling as HTMLInputElement;
}

// Fills every field the requiredFilled gate needs EXCEPT grazing/distance
// (default numeric fields already ship valid values per EMPTY_FORM).
async function fillBaselineRequired(countryName = "India") {
  fillSimulationName();
  await selectCountry(countryName);
  await selectMilkFields("3.0", "4.0");
}

// ---------------------------------------------------------------------------

describe("Cattle Info — field validation handlers", () => {
  it("handleBodyWeight: flags out-of-range (350-720) but keeps the typed value, clears the error back in range", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    const bwInput = inputAfterLabel("Body Weight (BW; kg)");
    expect(bwInput.value).toBe("500"); // EMPTY_FORM default

    fireEvent.change(bwInput, { target: { value: "800" } });
    expect(bwInput.value).toBe("800");
    expect(screen.getByText("Value Range 350-720")).toBeInTheDocument();

    fireEvent.change(bwInput, { target: { value: "500" } });
    expect(bwInput.value).toBe("500");
    expect(screen.queryByText("Value Range 350-720")).toBeNull();
  });

  it("handleMilkProduction: flags out-of-range (1-59)", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    const mpInput = inputAfterLabel("Milk Production (L)");

    fireEvent.change(mpInput, { target: { value: "70" } });
    expect(mpInput.value).toBe("70");
    expect(screen.getByText("Value Range 1-59")).toBeInTheDocument();

    fireEvent.change(mpInput, { target: { value: "30" } });
    expect(mpInput.value).toBe("30");
    expect(screen.queryByText("Value Range 1-59")).toBeNull();
  });

  it("handleBCS: flags out-of-range (1-5) with the exact Android-ported message", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    const bcsInput = inputAfterLabel("Body Condition Score");

    fireEvent.change(bcsInput, { target: { value: "6" } });
    expect(screen.getByText("Value Range 1-5")).toBeInTheDocument();

    fireEvent.change(bcsInput, { target: { value: "4" } });
    expect(screen.queryByText("Value Range 1-5")).toBeNull();
  });

  it("handleBCS: a leading-dot edit (\".5\") is rejected — the field reverts to its last valid value", async () => {
    // Android parity comment: "clears if starts with '.'" — handleBCS
    // returns early without calling setState, so React's controlled-input
    // sync restores the DOM to the last committed value ("3.0").
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    const bcsInput = inputAfterLabel("Body Condition Score");
    expect(bcsInput.value).toBe("3.0");

    fireEvent.change(bcsInput, { target: { value: ".5" } });
    expect(bcsInput.value).toBe("3.0");
  });

  it("handleBWGain: a leading-dot edit is rejected the same way", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    const gainInput = inputAfterLabel("BW Gain (kg/day)");
    expect(gainInput.value).toBe("0.2");

    fireEvent.change(gainInput, { target: { value: ".9" } });
    expect(gainInput.value).toBe("0.2");

    fireEvent.change(gainInput, { target: { value: "2" } });
    expect(screen.getByText("Value Range 0-1.8")).toBeInTheDocument();
  });
});

describe("Cattle Info — Active Grazing toggle", () => {
  it("reveals Distance Walked + Topography when turned ON, hides them when turned OFF", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    expect(screen.queryByText("Distance Walked (km)")).toBeNull();
    expect(screen.queryByText("Topography")).toBeNull();

    const grazingToggle = screen.getByRole("checkbox");
    fireEvent.click(grazingToggle);

    expect(screen.getByText("Distance Walked (km)")).toBeInTheDocument();
    expect(screen.getByText("Topography")).toBeInTheDocument();
    expect(screen.getByText("Flat")).toBeInTheDocument();
    expect(screen.getByText("Hilly")).toBeInTheDocument();

    fireEvent.click(grazingToggle);
    expect(screen.queryByText("Distance Walked (km)")).toBeNull();
    expect(screen.queryByText("Topography")).toBeNull();
  });
});

describe("Cattle Info — requiredFilled gate (Continue to Feed)", () => {
  it("is disabled on the initial empty form (Simulation Name blank)", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });
    expect(screen.getByRole("button", { name: "Continue to Feed" })).toBeDisabled();
  });

  it("stays disabled when grazing is ON but Distance Walked is empty", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");
    fireEvent.click(screen.getByRole("checkbox")); // grazing ON, distance cleared

    expect(screen.getByRole("button", { name: "Continue to Feed" })).toBeDisabled();
  });

  it("enables once every currently-relevant required field (incl. Distance Walked) is filled", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");
    fireEvent.click(screen.getByRole("checkbox")); // grazing ON
    const distInput = inputAfterLabel("Distance Walked (km)");
    fireEvent.change(distInput, { target: { value: "5" } });

    expect(screen.getByRole("button", { name: "Continue to Feed" })).not.toBeDisabled();
  });

  it("enables with only the baseline fields when grazing stays OFF (distance/topography not required)", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");

    expect(screen.getByRole("button", { name: "Continue to Feed" })).not.toBeDisabled();
  });
});

describe("Cattle Info — handleContinue currency propagation (§10.9)", () => {
  it("calls setUser with the newly-selected country's currency/country_code BEFORE navigating to /feed-selection", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    useStore.setState({
      user: seedUser({ country_id: "1", country: "India", country_code: "IN", currency: "INR" }),
    });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("Vietnam");

    const continueBtn = screen.getByRole("button", { name: "Continue to Feed" });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    expect(push).toHaveBeenCalledWith("/feed-selection");
    const u = useStore.getState().user!;
    expect(u.country_id).toBe("2");
    expect(u.country).toBe("Vietnam");
    expect(u.country_code).toBe("VN");
    expect(u.currency).toBe("VND");
  });

  it("does NOT touch the user object when the country is left unchanged", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    const originalUser = seedUser({ country_id: "1", country: "India", country_code: "IN", currency: "INR" });
    useStore.setState({ user: originalUser });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");
    const continueBtn = screen.getByRole("button", { name: "Continue to Feed" });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    expect(push).toHaveBeenCalledWith("/feed-selection");
    expect(useStore.getState().user).toEqual(originalUser);
  });
});

describe("Cattle Info — whole-page loading shimmer (real elements, not a separate skeleton layout)", () => {
  // Every field ultimately depends on the same getCountries() call
  // resolving before the form is fully meaningful. Originally only
  // Country+Language got a loading treatment while every other section
  // rendered instantly with EMPTY_FORM defaults — a jarring mix of
  // "ready" and "loading" on the same screen. Then a hand-built parallel
  // skeleton tree replaced the whole form during load — but an
  // approximated skeleton risks drifting from the real field layout.
  // The real form (same SectionCards, same FieldLabels, same
  // input/SelectInput/toggle elements) now ALWAYS renders; only each
  // field's own appearance (shimmer background, hidden value, disabled)
  // changes while loading, so there is zero layout difference between
  // the loading and loaded states — it's literally the same DOM.
  it("shimmers every real field in place while countries are fetching, then the same elements become interactive", async () => {
    let resolveCountries!: (v: { data: typeof countries }) => void;
    getCountries.mockReturnValueOnce(
      new Promise((resolve) => { resolveCountries = resolve; })
    );
    useStore.setState({ user: seedUser({ country_id: "1" }) });
    const { container } = render(<CattleInfoPage />);

    // The real form is mounted immediately — same labels, same
    // Simulation History button, same section structure.
    expect(screen.getByRole("button", { name: "Simulation history" })).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
    expect(screen.getByText("Breed Selection")).toBeInTheDocument();

    // But the actual fields are shimmering + non-interactive: the
    // Simulation Name input is disabled with the shimmer class...
    const simNameInput = screen.getByText("Simulation Name").nextElementSibling as HTMLInputElement;
    expect(simNameInput).toBeDisabled();
    expect(simNameInput.className).toContain("shimmer");
    // ...the Country dropdown trigger is disabled...
    const countryWrapper = screen.getByText("Country").nextElementSibling as HTMLElement;
    expect(countryWrapper.className).toContain("shimmer");
    expect(within(countryWrapper).getByRole("button")).toBeDisabled();
    // ...and the grazing toggle switch is shimmering too.
    const toggleSlider = container.querySelector(".toggle-slider");
    expect(toggleSlider?.className).toContain("shimmer");
    expect(container.querySelectorAll(".shimmer").length).toBeGreaterThan(10);

    resolveCountries({ data: countries });

    // Once resolved, the SAME elements become fully interactive.
    await waitFor(() => expect(simNameInput).not.toBeDisabled());
    expect(simNameInput.className).not.toContain("shimmer");
    await waitFor(() => expect(within(countryWrapper).getByRole("button")).not.toBeDisabled());
    expect(countryWrapper.className).not.toContain("shimmer");
    expect(container.querySelectorAll(".shimmer").length).toBe(0);

    await fillBaselineRequired("India");
    expect(screen.getByRole("button", { name: "Continue to Feed" })).not.toBeDisabled();
  });
});

describe("Cattle Info — Language dropdown explicit English selection", () => {
  // Regression coverage: explicitly picking "English" for a specific
  // simulation used to be stored as `simulation_language: null` (meant
  // to signal "no override, inherit profile"). For a user whose PROFILE
  // language is non-English (Hindi here), that made an explicit English
  // pick indistinguishable from "never touched the dropdown" — so
  // restoring the simulation later fell through to a country-language
  // guess (Hindi for India) instead of honoring the English the user
  // actually chose. The fix stores whatever the user picks verbatim,
  // including "en".
  it("storing English explicitly persists 'en' (not null) through handleContinue", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    useStore.setState({ user: seedUser({ country_id: "1", preferred_language: "hi" }) });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");

    const langWrapper = await openDropdown("Language");
    await chooseOption(langWrapper, "English");

    const continueBtn = screen.getByRole("button", { name: "Continue to Feed" });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    expect(push).toHaveBeenCalledWith("/feed-selection");
    expect(useStore.getState().cattleInfo?.simulation_language).toBe("en");
  });

  it("an untouched Language dropdown still persists null (inherit profile default)", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    useStore.setState({ user: seedUser({ country_id: "1", preferred_language: "hi" }) });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    await fillBaselineRequired("India");
    // Deliberately do NOT touch the Language dropdown.

    const continueBtn = screen.getByRole("button", { name: "Continue to Feed" });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    expect(useStore.getState().cattleInfo?.simulation_language).toBeNull();
  });
});

describe("Cattle Info — handleReset", () => {
  it("clears feedSelections, resets feedSelectionType to recommendation, nulls cattleInfo, and resets the form", async () => {
    getCountries.mockResolvedValueOnce({ data: [] });
    const priorFeedItem: FeedItem = {
      id: "f1",
      feed_type_id: 1,
      feed_type_name: "Forage",
      category_id: 1,
      category_name: "Grass",
      sub_category_id: 1,
      sub_category_name: "Napier",
      feed_uuid: "uuid-1",
      price_per_kg: 5,
      quantity_kg: 2,
      inclusion_limits_enabled: false,
      min_kg_per_day: null,
      max_kg_per_day: null,
    };
    const priorCattleInfo: CattleInfo = {
      simulation_name: "Old Sim",
      country: "India",
      country_id: "1",
      breed: "Holstein",
      body_weight: 500,
      body_weight_gain: 0.2,
      body_condition_score: 3,
      parity: 1,
      days_in_milk: 100,
      days_of_pregnancy: 40,
      milk_production: 15,
      milk_protein_percent: 3,
      milk_fat_percent: 4,
      average_temperature: 25,
      grazing: false,
      distance: 0,
      topography: "Flat",
      milk_price: null,
      animal_category: "Lactating Cow",
      simulation_language: null,
    };
    useStore.setState({
      user: seedUser(),
      cattleInfo: priorCattleInfo,
      feedSelectionType: "evaluation",
      feedSelections: [priorFeedItem],
    });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    const nameInput = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Something typed" } });
    expect(nameInput.value).toBe("Something typed");

    fireEvent.click(screen.getByRole("button", { name: /^Reset/ }));

    expect(useStore.getState().feedSelections).toEqual([]);
    expect(useStore.getState().feedSelectionType).toBe("recommendation");
    expect(useStore.getState().cattleInfo).toBeNull();
    expect(nameInput.value).toBe("");
  });
});

describe("Cattle Info — Simulation History", () => {
  it("opens the history modal and lists getUserReports(user.id) results", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    getUserReports.mockResolvedValueOnce({
      data: {
        simulations: [
          { report_id: "R-1", simulation_id: "SIM-1", country_name: "India", created_at: "2026-01-01T00:00:00Z" },
        ],
      },
    });
    useStore.setState({ user: seedUser() });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    fireEvent.click(screen.getByRole("button", { name: "Simulation history" }));
    await waitFor(() => expect(getUserReports).toHaveBeenCalledWith("u-1"));
    expect(await screen.findByText("SIM-1")).toBeInTheDocument();
    expect(screen.getByText("Country: India")).toBeInTheDocument();
  });

  it("loadSimulation → getSimulationDetails populates the form and sets feedSelectionType to EVALUATION when quantity_as_fed is present", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    getUserReports.mockResolvedValueOnce({
      data: { simulations: [{ report_id: "R-1", simulation_id: "SIM-1", country_name: "India" }] },
    });
    getSimulationDetails.mockResolvedValueOnce({
      data: {
        simulation_id: "SIM-1",
        country_name: "India",
        cattle_info: {
          breed: "Holstein",
          body_weight: 400,
          bw_gain: 0.5,
          bc_score: 3.5,
          days_in_milk: 120,
          days_of_pregnancy: 60,
          parity: 2,
          milk_production: 20,
          tp_milk: 3.2,
          fat_milk: 4.0,
          temperature: 22,
          grazing: false,
          distance: 0,
          topography: "Flat",
        },
        feed_selection: [
          { feed_type: "Forage", feed_category: "Grass", feed_name: "Napier", feed_id: "uuid-1", price_per_kg: 5, quantity_as_fed: 10 },
        ],
      },
    });
    useStore.setState({ user: seedUser() });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    fireEvent.click(screen.getByRole("button", { name: "Simulation history" }));
    const row = await screen.findByText("SIM-1");
    fireEvent.click(row);

    await waitFor(() => expect(getSimulationDetails).toHaveBeenCalledWith("R-1", "u-1"));
    await waitFor(() => expect(useStore.getState().feedSelectionType).toBe("evaluation"));

    const feedSelections = useStore.getState().feedSelections;
    expect(feedSelections).toHaveLength(1);
    expect(feedSelections[0].feed_uuid).toBe("uuid-1");
    expect(feedSelections[0].feed_type_name).toBe("Forage");

    const nameInput = screen.getByRole("textbox") as HTMLInputElement;
    expect(nameInput.value).toBe("SIM-1");
    expect(inputAfterLabel("Body Weight (BW; kg)").value).toBe("400");

    expect(useStore.getState().cattleInfo?.simulation_name).toBe("SIM-1");
  });

  it("loadSimulation sets feedSelectionType to RECOMMENDATION when quantity_as_fed is absent", async () => {
    getCountries.mockResolvedValueOnce({ data: countries });
    getUserReports.mockResolvedValueOnce({
      data: { simulations: [{ report_id: "R-2", simulation_id: "SIM-2", country_name: "India" }] },
    });
    getSimulationDetails.mockResolvedValueOnce({
      data: {
        simulation_id: "SIM-2",
        country_name: "India",
        cattle_info: {
          breed: "Holstein",
          body_weight: 400,
          bw_gain: 0.5,
          bc_score: 3.5,
          days_in_milk: 120,
          days_of_pregnancy: 60,
          parity: 2,
          milk_production: 20,
          tp_milk: 3.2,
          fat_milk: 4.0,
          temperature: 22,
          grazing: false,
          distance: 0,
          topography: "Flat",
        },
        feed_selection: [
          { feed_type: "Forage", feed_category: "Grass", feed_name: "Napier", feed_id: "uuid-2", price_per_kg: 5, quantity_as_fed: null },
        ],
      },
    });
    useStore.setState({ user: seedUser() });
    render(<CattleInfoPage />);
    // The whole form now renders behind a loading skeleton until
    // getCountries resolves (see CattleInfoSkeleton) — wait for a
    // real-form-only marker (absent from the skeleton) before
    // interacting with any field.
    await screen.findByRole("button", { name: "Simulation history" });

    fireEvent.click(screen.getByRole("button", { name: "Simulation history" }));
    const row = await screen.findByText("SIM-2");
    fireEvent.click(row);

    await waitFor(() => expect(getSimulationDetails).toHaveBeenCalledWith("R-2", "u-1"));
    await waitFor(() => expect(useStore.getState().feedSelections).toHaveLength(1));
    expect(useStore.getState().feedSelectionType).toBe("recommendation");
  });
});
