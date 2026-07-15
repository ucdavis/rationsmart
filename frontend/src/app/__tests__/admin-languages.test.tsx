import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const {
  replace,
  back,
  listLanguages,
  listCountriesWithLanguages,
  createLanguage,
  patchLanguage,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getTranslationCoverage,
  getAdminFeeds,
  listFeedTranslations,
  upsertFeedTranslation,
  deleteFeedTranslation,
} = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  listLanguages: vi.fn(),
  listCountriesWithLanguages: vi.fn(),
  createLanguage: vi.fn(),
  patchLanguage: vi.fn(),
  assignLanguageToCountry: vi.fn(),
  unassignLanguageFromCountry: vi.fn(),
  downloadTranslationWorkbook: vi.fn(),
  uploadTranslationWorkbook: vi.fn(),
  getTranslationCoverage: vi.fn(),
  getAdminFeeds: vi.fn(),
  listFeedTranslations: vi.fn(),
  upsertFeedTranslation: vi.fn(),
  deleteFeedTranslation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listLanguages,
    listCountriesWithLanguages,
    createLanguage,
    patchLanguage,
    assignLanguageToCountry,
    unassignLanguageFromCountry,
    downloadTranslationWorkbook,
    uploadTranslationWorkbook,
    getTranslationCoverage,
    getAdminFeeds,
    listFeedTranslations,
    upsertFeedTranslation,
    deleteFeedTranslation,
  };
});

import AdminLanguagesPage from "@/app/(main)/admin/languages/page";
import { useStore, type User } from "@/lib/store";

const seedAdmin = (over: Partial<User> = {}): User => ({
  id: "admin-1",
  name: "Admin",
  email: "admin@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: true,
  token: "jwt",
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  listLanguages.mockReset();
  listCountriesWithLanguages.mockReset();
  createLanguage.mockReset();
  patchLanguage.mockReset();
  assignLanguageToCountry.mockReset();
  unassignLanguageFromCountry.mockReset();
  downloadTranslationWorkbook.mockReset();
  uploadTranslationWorkbook.mockReset();
  getTranslationCoverage.mockReset();
  getAdminFeeds.mockReset();
  listFeedTranslations.mockReset();
  upsertFeedTranslation.mockReset();
  deleteFeedTranslation.mockReset();
  assignLanguageToCountry.mockResolvedValue({ status: 200, data: {}, headers: {} });
  unassignLanguageFromCountry.mockResolvedValue({ status: 200, data: {} });
  createLanguage.mockResolvedValue({ status: 200, data: {} });
  useStore.setState({
    user: seedAdmin(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  } as never);
});

const CATALOG_BASE = [
  { code: "en", name: "English", is_active: true },
  { code: "hi", name: "Hindi", is_active: true },
  { code: "tl", name: "Filipino", is_active: true },
  { code: "vi", name: "Vietnamese", is_active: true },
  { code: "am", name: "Amharic", is_active: true },
  { code: "om", name: "Oromo", is_active: true },
];

async function renderReady(
  countries: Array<{ id: string; name: string; country_code?: string; languages: string[] }>,
  languages = CATALOG_BASE
) {
  // Persistent (not "Once") — several actions (assign/unassign/create/
  // patch) call reload() afterwards, firing extra round-trips. Tests that
  // need a DIFFERENT post-action shape can still layer a mockResolvedValueOnce
  // on top; this is just the steady-state fallback so unrelated reloads
  // never resolve to undefined.
  listLanguages.mockResolvedValue({ status: 200, data: { languages } });
  listCountriesWithLanguages.mockResolvedValue({ status: 200, data: { countries } });
  render(<AdminLanguagesPage />);
  // Wait for the loading gate to clear — Countries tab is default, so a
  // country name (or the empty-state text) becomes visible once loaded.
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

const ETHIOPIA_REAL = { id: "99", name: "Ethiopia", languages: ["en"] };

describe("Admin Languages — tab bar", () => {
  it("renders 3 tabs with Countries active by default", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    expect(screen.getByRole("button", { name: "Countries" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Languages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feeds" })).toBeInTheDocument();
    expect(screen.getByText("India")).toBeInTheDocument();
  });

  it("switches to the Languages tab and shows the registry", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    expect(screen.getByText("Hindi")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("switches to the Feeds tab and shows the search box", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Feeds" }));
    expect(screen.getByPlaceholderText("Search any feed…")).toBeInTheDocument();
  });
});

describe("Admin Languages — Countries tab (C1 → C2)", () => {
  it("lists countries with EN + extra language chips", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi", "tl"] }, ETHIOPIA_REAL]);
    const indiaCard = screen.getByText("India").closest("button")!;
    expect(within(indiaCard).getByText("EN")).toBeInTheDocument();
    expect(within(indiaCard).getByText("HI")).toBeInTheDocument();
    expect(within(indiaCard).getByText("TL")).toBeInTheDocument();
  });

  it("synthesizes a placeholder Ethiopia card when the backend hasn't seeded it, and it's not clickable", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en"] }]);
    expect(screen.getByText("Ethiopia")).toBeInTheDocument();
    expect(screen.getByText("Backend pending")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ethiopia"));
    // Placeholder card is not a drill-in button — no detail screen appears.
    expect(screen.queryByText("Languages offered")).not.toBeInTheDocument();
  });

  it("drilling into a country shows English (locked) + offered languages, with a Withdraw button per language", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));

    expect(await screen.findByText("Languages offered")).toBeInTheDocument();
    expect(screen.getByText(/baseline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw hi from India" })).toBeInTheDocument();
  });

  it("Withdraw calls unassignLanguageFromCountry (DELETE 4.6) with country_id + code", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw hi from India" }));
    await waitFor(() => expect(unassignLanguageFromCountry).toHaveBeenCalledWith("1", "hi"));
  });

  it('"Offer another language" opens a sheet filtered to regional codes, and confirming calls assignLanguageToCountry (POST 4.5)', async () => {
    await renderReady([{ id: "2", name: "Vietnam", languages: ["en"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("Vietnam"));
    fireEvent.click(await screen.findByRole("button", { name: "Offer another language" }));

    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.some((o) => o.textContent?.includes("Vietnamese"))).toBe(true);
    expect(options.some((o) => o.textContent?.includes("Hindi"))).toBe(false);

    fireEvent.change(select, { target: { value: "vi" } });
    fireEvent.click(screen.getByRole("button", { name: "Offer" }));

    await waitFor(() => expect(assignLanguageToCountry).toHaveBeenCalledWith("2", "vi"));
  });

  it("Export workbook calls downloadTranslationWorkbook with the country id", async () => {
    downloadTranslationWorkbook.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: {},
    });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByRole("button", { name: /Export workbook/ }));
    await waitFor(() => expect(downloadTranslationWorkbook).toHaveBeenCalledWith("1"));
  });

  it("uploading a workbook file calls uploadTranslationWorkbook and renders the import summary", async () => {
    uploadTranslationWorkbook.mockResolvedValueOnce({
      data: { success: true, message: "Imported", feeds_inserted: 5, feeds_updated: 2, feeds_skipped: 10 },
    });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));

    const file = new File(["data"], "workbook.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fileInput = (await screen.findByRole("button", { name: /Import workbook/ })).closest("div")!.parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /Import workbook/ }));
    await waitFor(() => expect(uploadTranslationWorkbook).toHaveBeenCalledWith("1", file));
    expect(await screen.findByText(/5 added · 2 updated · 10 unchanged/)).toBeInTheDocument();
  });

  it("tapping an offered language row opens the shared Translation Workspace with coverage", async () => {
    getTranslationCoverage.mockResolvedValueOnce({
      data: { total_feeds: 100, translated_feeds: 60, missing_feeds: 40, total_types: 5, translated_types: 5, total_categories: 10, translated_categories: 8 },
    });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByText("Hindi"));

    await waitFor(() => expect(getTranslationCoverage).toHaveBeenCalledWith("1", "hi"));
    expect(await screen.findByText("India · हिन्दी (hi)")).toBeInTheDocument();
    expect(screen.getByText("60 / 100 · 40 missing")).toBeInTheDocument();
  });
});

describe("Admin Languages — Translation Workspace feed search + edit", () => {
  beforeEach(() => {
    getTranslationCoverage.mockResolvedValue({
      data: { total_feeds: 10, translated_feeds: 5, total_types: 2, translated_types: 2, total_categories: 3, translated_categories: 2 },
    });
  });

  async function openWorkspace() {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }, ETHIOPIA_REAL]);
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByText("Hindi"));
    await screen.findByText("India · हिन्दी (hi)");
  }

  it("searching hydrates each result's translation via listFeedTranslations (#5)", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f1", fd_name: "Maize silage" }] } });
    listFeedTranslations.mockResolvedValueOnce({
      data: { translations: [{ feed_id: "f1", language: "hi", name: "मक्का साइलेज" }] },
    });
    await openWorkspace();

    fireEvent.change(screen.getByPlaceholderText("Search feeds…"), { target: { value: "maize" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(getAdminFeeds).toHaveBeenCalledWith("", 1, 20, "", "", "India", "maize"));
    await waitFor(() => expect(listFeedTranslations).toHaveBeenCalledWith("f1"));
    expect(await screen.findByText("मक्का साइलेज")).toBeInTheDocument();
  });

  it("shows 'not translated' for a feed with no matching-language translation, and Add opens the edit sheet", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f2", fd_name: "Napier grass" }] } });
    // Two calls: one to hydrate the search result row, one for the edit
    // sheet's own independent fetch when it opens.
    listFeedTranslations.mockResolvedValue({ data: { translations: [] } });
    await openWorkspace();

    fireEvent.change(screen.getByPlaceholderText("Search feeds…"), { target: { value: "napier" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("⚠ not translated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Napier grass translation" }));
    // "Napier grass" now appears twice (search row + sheet title) —
    // "English (read-only)" is unique to the sheet having opened.
    expect(await screen.findByText("English (read-only)")).toBeInTheDocument();
    expect(screen.getByText("हिन्दी (hi)")).toBeInTheDocument();
  });

  it("saving the edit sheet calls upsertFeedTranslation (POST #3) with feed_id/language/name", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f2", fd_name: "Napier grass" }] } });
    listFeedTranslations.mockResolvedValue({ data: { translations: [] } });
    upsertFeedTranslation.mockResolvedValueOnce({ data: { feed_id: "f2", language: "hi", name: "नेपियर घास", action: "inserted" } });
    await openWorkspace();

    fireEvent.change(screen.getByPlaceholderText("Search feeds…"), { target: { value: "napier" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Napier grass translation" }));

    const input = await screen.findByDisplayValue("");
    fireEvent.change(input, { target: { value: "नेपियर घास" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ✓" }));

    await waitFor(() =>
      expect(upsertFeedTranslation).toHaveBeenCalledWith({ feed_id: "f2", language: "hi", name: "नेपियर घास" })
    );
  });
});

describe("Admin Languages — Languages tab (registry)", () => {
  it("English renders locked, others show a toggle switch", async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    expect(screen.getByText(/locked/)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it('"+ Add language" creates a language via POST 4.1', async () => {
    await renderReady([{ id: "1", name: "India", languages: ["en"] }]);
    listLanguages.mockResolvedValueOnce({ status: 200, data: { languages: CATALOG_BASE } });
    listCountriesWithLanguages.mockResolvedValueOnce({ status: 200, data: { countries: [{ id: "1", name: "India", languages: ["en"] }] } });

    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByRole("button", { name: "Add language" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. hi, vi, sw"), { target: { value: "sw" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Hindi, Vietnamese, Kiswahili"), { target: { value: "Kiswahili" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(createLanguage).toHaveBeenCalledWith({ code: "sw", name: "Kiswahili" }));
  });

  it("deactivating a language asks for confirmation and calls patchLanguage (#9) with is_active:false", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    patchLanguage.mockResolvedValueOnce({ data: {} });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    listLanguages.mockResolvedValueOnce({ status: 200, data: { languages: CATALOG_BASE } });
    listCountriesWithLanguages.mockResolvedValueOnce({ status: 200, data: { countries: [{ id: "1", name: "India", languages: ["en", "hi"] }] } });

    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByLabelText("Deactivate Hindi"));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(patchLanguage).toHaveBeenCalledWith("hi", { is_active: false }));
    confirmSpy.mockRestore();
  });

  it("declining the confirmation does not call patchLanguage", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByLabelText("Deactivate Hindi"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(patchLanguage).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("renaming a language calls patchLanguage (#9) with the new name", async () => {
    patchLanguage.mockResolvedValueOnce({ data: {} });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    listLanguages.mockResolvedValueOnce({ status: 200, data: { languages: CATALOG_BASE } });
    listCountriesWithLanguages.mockResolvedValueOnce({ status: 200, data: { countries: [{ id: "1", name: "India", languages: ["en", "hi"] }] } });

    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByLabelText("Rename Hindi"));
    const input = screen.getByDisplayValue("Hindi");
    fireEvent.change(input, { target: { value: "हिन्दी" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchLanguage).toHaveBeenCalledWith("hi", { name: "हिन्दी" }));
  });
});

describe("Admin Languages — Feeds tab (feed-centric editor, endpoint #5)", () => {
  it("searching, opening a feed, and seeing every language's translation on one card", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f1", fd_name: "Maize silage", fd_country_name: "India" }] } });
    listFeedTranslations.mockResolvedValueOnce({
      data: {
        translations: [
          { feed_id: "f1", language: "hi", name: "मक्का साइलेज" },
          { feed_id: "f1", language: "vi", name: "Ngô ủ chua" },
        ],
      },
    });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Feeds" }));

    fireEvent.change(screen.getByPlaceholderText("Search any feed…"), { target: { value: "maize" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    fireEvent.click(await screen.findByText("Maize silage"));
    await waitFor(() => expect(listFeedTranslations).toHaveBeenCalledWith("f1"));
    expect(await screen.findByText("मक्का साइलेज")).toBeInTheDocument();
    expect(screen.getByText("Ngô ủ chua")).toBeInTheDocument();
  });

  it("deleting a translation calls deleteFeedTranslation (#6) with feed_id + language", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f1", fd_name: "Maize silage" }] } });
    listFeedTranslations.mockResolvedValueOnce({
      data: { translations: [{ feed_id: "f1", language: "hi", name: "मक्का साइलेज" }] },
    });
    deleteFeedTranslation.mockResolvedValueOnce({ data: { success: true } });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Feeds" }));
    fireEvent.change(screen.getByPlaceholderText("Search any feed…"), { target: { value: "maize" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByText("Maize silage"));
    await screen.findByText("मक्का साइलेज");

    fireEvent.click(screen.getByLabelText("Delete hi"));
    await waitFor(() => expect(deleteFeedTranslation).toHaveBeenCalledWith("f1", "hi"));
  });

  it("adding a new translation for a language not yet translated calls upsertFeedTranslation (#3)", async () => {
    getAdminFeeds.mockResolvedValueOnce({ data: { feeds: [{ feed_id: "f1", fd_name: "Maize silage" }] } });
    listFeedTranslations.mockResolvedValueOnce({ data: { translations: [] } });
    upsertFeedTranslation.mockResolvedValueOnce({ data: { feed_id: "f1", language: "vi", name: "Ngô ủ chua", action: "inserted" } });
    await renderReady([{ id: "1", name: "India", languages: ["en", "hi"] }]);
    fireEvent.click(screen.getByRole("button", { name: "Feeds" }));
    fireEvent.change(screen.getByPlaceholderText("Search any feed…"), { target: { value: "maize" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByText("Maize silage"));
    await screen.findByText("+ Add translation");

    const langSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(langSelect, { target: { value: "vi" } });
    fireEvent.change(screen.getByPlaceholderText("Translated name"), { target: { value: "Ngô ủ chua" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(upsertFeedTranslation).toHaveBeenCalledWith({ feed_id: "f1", language: "vi", name: "Ngô ủ chua" })
    );
  });
});
