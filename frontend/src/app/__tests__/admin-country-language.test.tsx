import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const {
  back,
  listLanguages,
  createLanguage,
  patchLanguage,
  listCountriesWithLanguages,
  listAllCountries,
  toggleCountryStatus,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getAdminFeeds,
  listFeedTranslations,
  upsertFeedTranslation,
  deleteFeedTranslation,
} = vi.hoisted(() => ({
  back: vi.fn(),
  listLanguages: vi.fn(),
  createLanguage: vi.fn(),
  patchLanguage: vi.fn(),
  listCountriesWithLanguages: vi.fn(),
  listAllCountries: vi.fn(),
  toggleCountryStatus: vi.fn(),
  assignLanguageToCountry: vi.fn(),
  unassignLanguageFromCountry: vi.fn(),
  downloadTranslationWorkbook: vi.fn(),
  uploadTranslationWorkbook: vi.fn(),
  getAdminFeeds: vi.fn(),
  listFeedTranslations: vi.fn(),
  upsertFeedTranslation: vi.fn(),
  deleteFeedTranslation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listLanguages,
    createLanguage,
    patchLanguage,
    listCountriesWithLanguages,
    listAllCountries,
    toggleCountryStatus,
    assignLanguageToCountry,
    unassignLanguageFromCountry,
    downloadTranslationWorkbook,
    uploadTranslationWorkbook,
    getAdminFeeds,
    listFeedTranslations,
    upsertFeedTranslation,
    deleteFeedTranslation,
  };
});

import AdminCountryLanguagePage from "@/app/(main)/admin/country-language/page";
import { useStore, type User } from "@/lib/store";

const seedUser = (over: Partial<User> = {}): User => ({
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
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

const languages = [
  { code: "en", name: "English", is_active: true },
  { code: "hi", name: "Hindi", is_active: true },
  { code: "tl", name: "Tagalog", is_active: true },
];

const countries = [
  { id: "c-in", name: "India", country_code: "IN", is_active: true, languages: ["en", "hi"] },
];

function seedLoad(opts: { languages?: unknown[]; countries?: unknown[] } = {}) {
  listLanguages.mockResolvedValue({ data: { success: true, languages: opts.languages ?? languages } });
  listCountriesWithLanguages.mockResolvedValue({ data: { success: true, countries: opts.countries ?? countries } });
}

beforeEach(() => {
  back.mockClear();
  listLanguages.mockReset();
  createLanguage.mockReset();
  patchLanguage.mockReset();
  listCountriesWithLanguages.mockReset();
  listAllCountries.mockReset();
  toggleCountryStatus.mockReset();
  assignLanguageToCountry.mockReset();
  unassignLanguageFromCountry.mockReset();
  downloadTranslationWorkbook.mockReset();
  uploadTranslationWorkbook.mockReset();
  getAdminFeeds.mockReset();
  listFeedTranslations.mockReset();
  upsertFeedTranslation.mockReset();
  deleteFeedTranslation.mockReset();
  seedLoad();
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
    showSnackbar: vi.fn(),
  } as never);
});

describe("Admin Country/Language — Countries & Languages screen", () => {
  it("loads and renders enabled countries with their language chips", async () => {
    render(<AdminCountryLanguagePage />);
    expect(await screen.findByText("India")).toBeInTheDocument();
    expect(screen.getByText("Hindi")).toBeInTheDocument();
    expect(screen.getByText("Registered Languages")).toBeInTheDocument();
  });

  it("deactivates a country after confirming", async () => {
    toggleCountryStatus.mockResolvedValue({ data: { success: true } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByLabelText("Deactivate India"));
    expect(await screen.findByText(/Deactivate India\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(toggleCountryStatus).toHaveBeenCalledWith("c-in", "disable"));
  });

  it("dis-associates a language from a country after confirming", async () => {
    unassignLanguageFromCountry.mockResolvedValue({ data: { success: true } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByLabelText("Dis-associate Hindi from India"));
    expect(await screen.findByText(/Dis-associate Hindi from India\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dis-associate" }));
    await waitFor(() => expect(unassignLanguageFromCountry).toHaveBeenCalledWith("c-in", "hi"));
  });

  it("associates a not-yet-assigned language to a country immediately (no confirm)", async () => {
    assignLanguageToCountry.mockResolvedValue({ data: { success: true } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByText("+ Add language"));
    const sheet = await screen.findByText(/Associate a language — India/);
    // Only Tagalog is unassigned for India (en, hi already present).
    fireEvent.click(within(sheet.closest("div")!.parentElement as HTMLElement).getByText(/Associate →/));
    await waitFor(() => expect(assignLanguageToCountry).toHaveBeenCalledWith("c-in", "tl"));
  });

  it("shows only inactive countries in the Activate-a-country sheet", async () => {
    listAllCountries.mockResolvedValue({
      data: {
        success: true,
        total_count: 2,
        countries: [
          { id: "c-in", name: "India", country_code: "IN", is_active: true },
          { id: "c-ph", name: "Philippines", country_code: "PH", is_active: false },
        ],
      },
    });
    toggleCountryStatus.mockResolvedValue({ data: { success: true } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByLabelText("Activate a country"));
    expect(await screen.findByText("Philippines")).toBeInTheDocument();
    expect(screen.queryByText("India", { selector: "span" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Philippines"));
    await waitFor(() => expect(toggleCountryStatus).toHaveBeenCalledWith("c-ph", "enable"));
  });

  it("registers a new language with only name + code (no native-name field)", async () => {
    createLanguage.mockResolvedValue({ data: { code: "sw", name: "Swahili", is_active: true } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("Registered Languages");
    fireEvent.click(screen.getByLabelText("Register a new language"));
    expect(await screen.findByText("Register a new language")).toBeInTheDocument();
    expect(screen.queryByText(/Native name/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("e.g. Swahili"), { target: { value: "Swahili" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. sw"), { target: { value: "sw" } });
    fireEvent.click(screen.getByText("Register language"));
    await waitFor(() => expect(createLanguage).toHaveBeenCalledWith({ code: "sw", name: "Swahili" }));
  });

  it("asks for confirmation before deactivating a language globally", async () => {
    patchLanguage.mockResolvedValue({ data: { code: "hi", name: "Hindi", is_active: false } });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("Registered Languages");
    fireEvent.click(screen.getByLabelText("Deactivate Hindi"));
    expect(await screen.findByText(/Deactivate Hindi\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(patchLanguage).toHaveBeenCalledWith("hi", { is_active: false }));
  });

  it("does not redirect a non-admin user and shows nothing", () => {
    useStore.setState({ user: seedUser({ is_admin: false }) } as never);
    const { container } = render(<AdminCountryLanguagePage />);
    expect(container.firstChild).toBeNull();
  });
});

describe("Admin Country/Language — Local Feed Names screen", () => {
  const switchToFeedsTab = async () => {
    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByText("Local Feed Names"));
  };

  it("defaults to the first country + its first local language and shows its feeds without any extra clicks", async () => {
    listCountriesWithLanguages.mockResolvedValue({
      data: {
        success: true,
        countries: [
          { id: "c-in", name: "India", country_code: "IN", is_active: true, languages: ["en", "hi"] },
          { id: "c-ph", name: "Philippines", country_code: "PH", is_active: true, languages: ["en", "tl"] },
        ],
      },
    });
    getAdminFeeds.mockResolvedValue({
      data: { success: true, message: "ok", feeds: [{ feed_id: "f1", fd_name: "Maize" }], total_count: 1, page: 1, page_size: 100, total_pages: 1 },
    });
    listFeedTranslations.mockResolvedValue({ data: { success: true, feed_id: "f1", translations: [] } });

    render(<AdminCountryLanguagePage />);
    await screen.findByText("India");
    fireEvent.click(screen.getByText("Local Feed Names"));

    // No country/language chip click — India + Hindi (its first local
    // language) should already be selected, and its feed list visible.
    await waitFor(() => expect(getAdminFeeds).toHaveBeenCalledWith("", 1, 100, "", "", "India", ""));
    expect(await screen.findByText("Maize")).toBeInTheDocument();
    expect(screen.getByText("3 · Feed names in हिन्दी")).toBeInTheDocument();
  });

  it("lists feeds for the selected country + language with named/unnamed status", async () => {
    getAdminFeeds.mockResolvedValue({
      data: {
        success: true,
        message: "ok",
        feeds: [
          { feed_id: "f1", fd_name: "Maize" },
          { feed_id: "f2", fd_name: "Wheat Bran" },
        ],
        total_count: 2,
        page: 1,
        page_size: 100,
        total_pages: 1,
      },
    });
    listFeedTranslations.mockImplementation((feed_id: string) =>
      Promise.resolve({
        data: {
          success: true,
          feed_id,
          translations: feed_id === "f1" ? [{ feed_id: "f1", language: "hi", name: "मक्का" }] : [],
        },
      })
    );

    await switchToFeedsTab();
    fireEvent.click(screen.getByText("India"));

    expect(await screen.findByText("Maize")).toBeInTheDocument();
    expect(await screen.findByText("मक्का")).toBeInTheDocument();
    expect(await screen.findByText("Wheat Bran")).toBeInTheDocument();
    expect(screen.getByText("+ Add name")).toBeInTheDocument();
    expect(await screen.findByText("1 of 2 named")).toBeInTheDocument();
  });

  it("saves a new local feed name via the edit sheet", async () => {
    getAdminFeeds.mockResolvedValue({
      data: { success: true, message: "ok", feeds: [{ feed_id: "f2", fd_name: "Wheat Bran" }], total_count: 1, page: 1, page_size: 100, total_pages: 1 },
    });
    listFeedTranslations.mockResolvedValue({ data: { success: true, feed_id: "f2", translations: [] } });
    upsertFeedTranslation.mockResolvedValue({ data: { feed_id: "f2", language: "hi", name: "गेहूं की भूसी", action: "inserted" } });

    await switchToFeedsTab();
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByText("Wheat Bran"));

    const input = await screen.findByPlaceholderText(/Type the .* name…/);
    fireEvent.change(input, { target: { value: "गेहूं की भूसी" } });
    fireEvent.click(screen.getByText("Save name"));

    await waitFor(() =>
      expect(upsertFeedTranslation).toHaveBeenCalledWith({ feed_id: "f2", language: "hi", name: "गेहूं की भूसी" })
    );
  });

  it("deletes an existing local feed name after confirming", async () => {
    getAdminFeeds.mockResolvedValue({
      data: { success: true, message: "ok", feeds: [{ feed_id: "f1", fd_name: "Maize" }], total_count: 1, page: 1, page_size: 100, total_pages: 1 },
    });
    listFeedTranslations.mockResolvedValue({
      data: { success: true, feed_id: "f1", translations: [{ feed_id: "f1", language: "hi", name: "मक्का" }] },
    });
    deleteFeedTranslation.mockResolvedValue({ data: { success: true } });

    await switchToFeedsTab();
    fireEvent.click(screen.getByText("India"));
    fireEvent.click(await screen.findByText("Maize"));
    fireEvent.click(await screen.findByText("Delete this name"));
    await waitFor(() => expect(deleteFeedTranslation).toHaveBeenCalledWith("f1", "hi"));
  });

  it("shows a message directing to Screen 1 when the country has no local language", async () => {
    listCountriesWithLanguages.mockResolvedValue({
      data: { success: true, countries: [{ id: "c-vn", name: "Vietnam", country_code: "VN", is_active: true, languages: ["en"] }] },
    });
    render(<AdminCountryLanguagePage />);
    await screen.findByText("Vietnam");
    fireEvent.click(screen.getByText("Local Feed Names"));
    fireEvent.click(screen.getByText("Vietnam"));
    expect(
      await screen.findByText(/No local language is associated with this country yet/)
    ).toBeInTheDocument();
  });
});
