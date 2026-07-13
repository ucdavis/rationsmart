import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const {
  back,
  getAdminFeedTypes,
  getAdminFeedCategories,
  getAdminFeeds,
  addAdminFeed,
  updateAdminFeed,
  deleteAdminFeed,
  addAdminFeedCategory,
  deleteAdminFeedCategory,
  addAdminFeedType,
  deleteAdminFeedType,
  getCountries,
} = vi.hoisted(() => ({
  back: vi.fn(),
  getAdminFeedTypes: vi.fn(),
  getAdminFeedCategories: vi.fn(),
  getAdminFeeds: vi.fn(),
  addAdminFeed: vi.fn(),
  updateAdminFeed: vi.fn(),
  deleteAdminFeed: vi.fn(),
  addAdminFeedCategory: vi.fn(),
  deleteAdminFeedCategory: vi.fn(),
  addAdminFeedType: vi.fn(),
  deleteAdminFeedType: vi.fn(),
  getCountries: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getAdminFeedTypes,
    getAdminFeedCategories,
    getAdminFeeds,
    addAdminFeed,
    updateAdminFeed,
    deleteAdminFeed,
    addAdminFeedCategory,
    deleteAdminFeedCategory,
    addAdminFeedType,
    deleteAdminFeedType,
    getCountries,
  };
});

import AdminFeedsPage from "@/app/(main)/admin/feeds/page";
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

const countries = [{ id: "1", name: "India", country_code: "IN", currency: "INR" }];

function resolveLoadAll(opts: {
  types?: unknown[];
  categories?: unknown[];
  feeds?: unknown[];
  countriesData?: unknown[];
}) {
  getAdminFeedTypes.mockResolvedValue({ data: opts.types ?? [] });
  getAdminFeedCategories.mockResolvedValue({ data: opts.categories ?? [] });
  getAdminFeeds.mockResolvedValue({ data: opts.feeds ?? [] });
  getCountries.mockResolvedValue({ data: opts.countriesData ?? countries });
}

beforeEach(() => {
  back.mockClear();
  getAdminFeedTypes.mockReset();
  getAdminFeedCategories.mockReset();
  getAdminFeeds.mockReset();
  addAdminFeed.mockReset();
  updateAdminFeed.mockReset();
  deleteAdminFeed.mockReset();
  addAdminFeedCategory.mockReset();
  deleteAdminFeedCategory.mockReset();
  addAdminFeedType.mockReset();
  deleteAdminFeedType.mockReset();
  getCountries.mockReset();
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

async function waitForLoaded() {
  // "Management" subheader only renders once section !== "landing"; for the
  // landing view itself, wait for the 3 nav cards.
  await waitFor(() => expect(getAdminFeedTypes).toHaveBeenCalled());
}

// ─── 1. Two-level navigation ────────────────────────────────────────────────

describe("Admin Feeds — two-level navigation", () => {
  it("landing view shows the 3 nav cards; clicking one opens that sub-section's list view", async () => {
    resolveLoadAll({});
    render(<AdminFeedsPage />);
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "Feed Type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feed Category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feed" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Feed Type" }));

    // Sub-section view: toolbar title becomes "Feed Type" and the
    // "Management" subheader + FAB for adding a type appear.
    expect(screen.getByRole("heading", { name: "Feed Type" })).toBeInTheDocument();
    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add feed type" })).toBeInTheDocument();
    // Landing cards are gone
    expect(screen.queryByRole("button", { name: "Feed Category" })).toBeNull();
  });

  it("the sub-section toolbar back button returns to the LANDING view, not router.back()", async () => {
    resolveLoadAll({});
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Category" }));
    expect(screen.getByRole("heading", { name: "Feed Category" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    // Back in the landing view — all 3 cards visible again.
    expect(screen.getByRole("button", { name: "Feed Type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feed Category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feed" })).toBeInTheDocument();
    // Crucially: browser history was NOT touched.
    expect(back).not.toHaveBeenCalled();
  });

  it("the LANDING view's own back button DOES call router.back() (contrast case)", async () => {
    resolveLoadAll({});
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalledOnce();
  });
});

// ─── 2. loadAll on mount + CRUD refetch ─────────────────────────────────────

describe("Admin Feeds — loadAll on mount + refetch after CRUD", () => {
  it("mounts by firing all four loaders (types, categories, feeds, countries)", async () => {
    resolveLoadAll({});
    render(<AdminFeedsPage />);

    await waitFor(() => {
      expect(getAdminFeedTypes).toHaveBeenCalledTimes(1);
      expect(getAdminFeedCategories).toHaveBeenCalledTimes(1);
      expect(getAdminFeeds).toHaveBeenCalledTimes(1);
      expect(getCountries).toHaveBeenCalledTimes(1);
    });
    expect(getAdminFeedTypes).toHaveBeenCalledWith("admin-1");
    expect(getAdminFeeds).toHaveBeenCalledWith("admin-1", 1, 100);
  });

  it("a successful CRUD call (add feed type) re-runs loadAll — all four loaders fire again", async () => {
    resolveLoadAll({});
    addAdminFeedType.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Add feed type" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. Forage"), { target: { value: "New Type" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(addAdminFeedType).toHaveBeenCalledOnce());

    await waitFor(() => {
      expect(getAdminFeedTypes).toHaveBeenCalledTimes(2);
      expect(getAdminFeedCategories).toHaveBeenCalledTimes(2);
      expect(getAdminFeeds).toHaveBeenCalledTimes(2);
      expect(getCountries).toHaveBeenCalledTimes(2);
    });
  });
});

// ─── 3. Feed CRUD modal ──────────────────────────────────────────────────────

const sampleFeed = {
  feed_id: "feed-1",
  fd_name: "Maize Silage",
  fd_type: "Forage",
  fd_category: "Roughage",
  fd_country_name: "India",
  fd_country_cd: "IN",
  fd_country_id: "1",
  fd_dm: 35.5,
  fd_cp: 8.2,
  fd_ee: 3.1,
  fd_cf: 0,
  fd_ash: 6.4,
  fd_ndf: 55,
  fd_adf: 30.2,
  fd_ca: 0.3,
  fd_p: 0.25,
  fd_st: 20,
  // Pre-existing fd_code / metadata on the loaded record — per CLAUDE.md
  // §10.15 these must NOT be echoed back on save; the wire payload always
  // sends "" for them regardless of what was loaded.
  fd_code: "OLD_CODE_123",
  fd_cellulose: 12,
  fd_hemicellulose: 10,
  fd_lg: 2,
  fd_ndin: 1,
  fd_nfe: 5,
  fd_npn_cp: 0.5,
  fd_adin: 0.2,
  fd_ipb_local_lab: "SomeLab",
  fd_orginin: "SomeOrigin",
  fd_season: "Summer",
};

describe("Admin Feeds — Feed CRUD modal", () => {
  it("openEditFeed pre-fills the form, and Save sends the full nutrient payload via updateAdminFeed with fd_code/meta forced to ''", async () => {
    resolveLoadAll({ feeds: [sampleFeed] });
    updateAdminFeed.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() => expect(screen.getByText("Maize Silage")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit feed" }));

    // Pre-fill: read-only base fields (scoped to the modal — "Forage" and
    // "Roughage" also appear in the feed list card behind the modal).
    expect(screen.getByRole("heading", { name: "Edit Feed" })).toBeInTheDocument();
    const modal = document.querySelector(".rounded-t-2xl") as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText("India")).toBeInTheDocument();
    expect(within(modal).getByText("Forage")).toBeInTheDocument();
    expect(within(modal).getByText("Roughage")).toBeInTheDocument();

    // Pre-fill: nutrient numeric inputs, in JSX declaration order
    const nutrientInputs = within(modal).getAllByPlaceholderText("0.00") as HTMLInputElement[];
    expect(nutrientInputs).toHaveLength(17);
    const [dm, ash, cellulose, cf, cp, ee, hemicellulose, st, ndf, adf, lg, ndin, nfe, npn, adin, ca, p] =
      nutrientInputs;
    expect(dm.value).toBe("35.5");
    expect(ash.value).toBe("6.4");
    expect(cellulose.value).toBe("12");
    expect(cf.value).toBe("0");
    expect(cp.value).toBe("8.2");
    expect(ee.value).toBe("3.1");
    expect(hemicellulose.value).toBe("10");
    expect(st.value).toBe("20");
    expect(ndf.value).toBe("55");
    expect(adf.value).toBe("30.2");
    expect(lg.value).toBe("2");
    expect(ndin.value).toBe("1");
    expect(nfe.value).toBe("5");
    expect(npn.value).toBe("0.5");
    expect(adin.value).toBe("0.2");
    expect(ca.value).toBe("0.3");
    expect(p.value).toBe("0.25");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(updateAdminFeed).toHaveBeenCalledOnce());
    const [feedId, adminUserId, body] = updateAdminFeed.mock.calls[0];
    expect(feedId).toBe("feed-1");
    expect(adminUserId).toBe("admin-1");
    expect(body).toEqual({
      fd_name: "Maize Silage",
      fd_type: "Forage",
      fd_category: "Roughage",
      fd_country_name: "India",
      fd_country_cd: "IN",
      fd_country_id: "1",
      fd_code: "",
      fd_dm: 35.5,
      fd_ash: 6.4,
      fd_cellulose: 12,
      fd_cf: 0,
      fd_cp: 8.2,
      fd_ee: 3.1,
      fd_hemicellulose: 10,
      fd_st: 20,
      fd_ndf: 55,
      fd_adf: 30.2,
      fd_lg: 2,
      fd_ndin: 1,
      fd_nfe: 5,
      fd_npn_cp: 0.5,
      fd_adin: 0.2,
      fd_ca: 0.3,
      fd_p: 0.25,
      fd_ipb_local_lab: "",
      fd_orginin: "",
      fd_season: "",
    });
    // addAdminFeed must NOT be used for an edit
    expect(addAdminFeed).not.toHaveBeenCalled();
  });

  it("openAddFeed builds a brand-new feed and Save calls addAdminFeed (not update) with the country/type/category cascade + coerced numerics", async () => {
    const feedTypes = [{ id: "t1", type_name: "Forage" }];
    const feedCategories = [{ id: "c1", category_name: "Roughage", feed_type: "Forage" }];
    resolveLoadAll({ types: feedTypes, categories: feedCategories });
    addAdminFeed.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    fireEvent.click(screen.getByRole("button", { name: "Add feed" }));
    expect(screen.getByRole("heading", { name: "Add Feed" })).toBeInTheDocument();

    const [countrySelect, typeSelect, categorySelect] = screen.getAllByRole("combobox");
    fireEvent.change(countrySelect, { target: { value: "India" } });
    fireEvent.change(typeSelect, { target: { value: "Forage" } });
    fireEvent.change(categorySelect, { target: { value: "Roughage" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Maize Silage"), { target: { value: "Test Feed" } });

    // Touch exactly one nutrient field to prove real values pass through
    // Number(), while every other untouched numeric defaults to 0.
    const nutrientInputs = screen.getAllByPlaceholderText("0.00") as HTMLInputElement[];
    fireEvent.change(nutrientInputs[0], { target: { value: "40" } }); // fd_dm

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(addAdminFeed).toHaveBeenCalledOnce());
    const [adminUserId, body] = addAdminFeed.mock.calls[0];
    expect(adminUserId).toBe("admin-1");
    expect(body).toEqual({
      fd_name: "Test Feed",
      fd_type: "Forage",
      fd_category: "Roughage",
      fd_country_name: "India",
      fd_country_cd: "IN",
      fd_country_id: "1",
      fd_code: "",
      fd_dm: 40,
      fd_ash: 0,
      fd_cellulose: 0,
      fd_cf: 0,
      fd_cp: 0,
      fd_ee: 0,
      fd_hemicellulose: 0,
      fd_st: 0,
      fd_ndf: 0,
      fd_adf: 0,
      fd_lg: 0,
      fd_ndin: 0,
      fd_nfe: 0,
      fd_npn_cp: 0,
      fd_adin: 0,
      fd_ca: 0,
      fd_p: 0,
      fd_ipb_local_lab: "",
      fd_orginin: "",
      fd_season: "",
    });
    expect(updateAdminFeed).not.toHaveBeenCalled();
  });
});

// ─── 4. Category CRUD ────────────────────────────────────────────────────────

describe("Admin Feeds — Category CRUD", () => {
  it("Save sends category_name/description/feed_type_id + a computed sort_order to addAdminFeedCategory", async () => {
    const feedTypes = [{ id: "t1", type_name: "Forage" }];
    // Two pre-existing categories: the code computes
    // sort_order = feedCategories.length + 1 at save time (NOT a hardcoded
    // 0 as CLAUDE.md §5 currently describes — see final report).
    const feedCategories = [
      { id: "c1", category_name: "Roughage", feed_type: "Forage" },
      { id: "c2", category_name: "Silage", feed_type: "Forage" },
    ];
    resolveLoadAll({ types: feedTypes, categories: feedCategories });
    addAdminFeedCategory.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Add feed category" }));

    const typeSelect = screen.getByRole("combobox");
    fireEvent.change(typeSelect, { target: { value: "t1" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Cereal Grains"), {
      target: { value: "New Category" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(addAdminFeedCategory).toHaveBeenCalledOnce());
    const [adminUserId, body] = addAdminFeedCategory.mock.calls[0];
    expect(adminUserId).toBe("admin-1");
    expect(body).toEqual({
      category_name: "New Category",
      description: "",
      feed_type_id: "t1",
      sort_order: 3,
    });
  });
});

// ─── 5. Type CRUD ────────────────────────────────────────────────────────────

describe("Admin Feeds — Type CRUD", () => {
  it("Save sends type_name/description + a computed sort_order to addAdminFeedType", async () => {
    // One pre-existing type: sort_order = feedTypes.length + 1 = 2
    // (again, code computes this rather than sending the literal 0).
    const feedTypes = [{ id: "t1", type_name: "Forage" }];
    resolveLoadAll({ types: feedTypes });
    addAdminFeedType.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Add feed type" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. Forage"), { target: { value: "New Type" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(addAdminFeedType).toHaveBeenCalledOnce());
    const [adminUserId, body] = addAdminFeedType.mock.calls[0];
    expect(adminUserId).toBe("admin-1");
    expect(body).toEqual({
      type_name: "New Type",
      description: "",
      sort_order: 2,
    });
  });
});

// ─── 6. Delete flow (Feed Type) ──────────────────────────────────────────────

describe("Admin Feeds — Delete flow", () => {
  const oneType = [{ id: "t1", type_name: "Forage", description: "Roughage-type feeds" }];

  it("shows a confirm dialog; cancelling does NOT call deleteAdminFeedType", async () => {
    resolveLoadAll({ types: oneType });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Type" }));
    await waitFor(() => expect(screen.getByText("Forage")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete type" }));
    expect(screen.getByText("Are you sure you want to delete type?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(screen.queryByText("Are you sure you want to delete type?")).toBeNull();
    expect(deleteAdminFeedType).not.toHaveBeenCalled();
  });

  it("confirming calls deleteAdminFeedType(type_id, admin_user_id)", async () => {
    resolveLoadAll({ types: oneType });
    deleteAdminFeedType.mockResolvedValueOnce({ data: {} });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed Type" }));
    await waitFor(() => expect(screen.getByText("Forage")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete type" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => expect(deleteAdminFeedType).toHaveBeenCalledOnce());
    expect(deleteAdminFeedType).toHaveBeenCalledWith("t1", "admin-1");
  });
});

// ─── 7. Feeds search filters by name only ───────────────────────────────────

describe("Admin Feeds — search filters by fd_name only", () => {
  const feeds = [
    { feed_id: "f1", fd_name: "Maize Silage", fd_type: "Forage", fd_category: "Roughage" },
    { feed_id: "f2", fd_name: "Soybean Meal", fd_type: "Concentrate", fd_category: "Protein Feed" },
  ];

  it("matches a substring of fd_name", async () => {
    resolveLoadAll({ feeds });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() => expect(screen.getByText("Maize Silage")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search by feed name"), {
      target: { value: "soy" },
    });

    expect(screen.getByText("Soybean Meal")).toBeInTheDocument();
    expect(screen.queryByText("Maize Silage")).toBeNull();
  });

  it("does NOT match on feed type or category text (Android FragmentFeed parity)", async () => {
    resolveLoadAll({ feeds });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() => expect(screen.getByText("Maize Silage")).toBeInTheDocument());

    // "Forage" is fd_type for Maize Silage, and "Protein Feed" is fd_category
    // for Soybean Meal — neither should match via search-by-name.
    fireEvent.change(screen.getByPlaceholderText("Search by feed name"), {
      target: { value: "Forage" },
    });
    expect(screen.queryByText("Maize Silage")).toBeNull();
    expect(screen.getByText("No feeds match your search")).toBeInTheDocument();
  });
});

// ─── 8. UI-label translation (src/lib/i18n-ui.ts) ───────────────────────────
// This screen is one of the largest rollouts of the useT() hook (proof of
// concept was src/app/help/page.tsx). The "hi" dictionary lazy-loads via
// dynamic import() — findBy* waits for it to resolve rather than assuming
// it's already cached from another test file in this worker.

describe("Admin Feeds — UI-label translation (preferred_language: hi)", () => {
  it("translates the toolbar title + all 3 landing nav card titles into Hindi", async () => {
    resolveLoadAll({});
    useStore.setState({ user: seedUser({ preferred_language: "hi", is_admin: true }) });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    await screen.findByText("चारा प्रबंधन"); // Feed Management (toolbar title)
    expect(screen.getByRole("button", { name: "चारा प्रकार" })).toBeInTheDocument(); // Feed Type
    expect(screen.getByRole("button", { name: "चारा श्रेणी" })).toBeInTheDocument(); // Feed Category
    expect(screen.getByRole("button", { name: "चारा" })).toBeInTheDocument(); // Feed
    expect(screen.queryByText("Feed Management")).not.toBeInTheDocument();
  });

  it("translates the Add Feed Type modal (heading, field label, placeholder, Submit)", async () => {
    resolveLoadAll({});
    useStore.setState({ user: seedUser({ preferred_language: "hi", is_admin: true }) });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(await screen.findByRole("button", { name: "चारा प्रकार" })); // Feed Type nav card
    await screen.findByText("प्रबंधन"); // Management subheader confirms sub-section loaded

    fireEvent.click(screen.getByRole("button", { name: "Add feed type" })); // aria-label untranslated (documented gap)

    expect(await screen.findByText("चारा प्रकार जोड़ें")).toBeInTheDocument(); // Add Feed Type heading
    expect(screen.getByPlaceholderText("जैसे Forage")).toBeInTheDocument(); // e.g. Forage
    expect(screen.getByRole("button", { name: "जमा करें" })).toBeInTheDocument(); // Submit
    expect(screen.getByRole("button", { name: "रद्द करें" })).toBeInTheDocument(); // Cancel
  });

  it("translates the delete-confirm dialog heading for Feed Type", async () => {
    const oneType = [{ id: "t1", type_name: "Forage", description: "Roughage-type feeds" }];
    resolveLoadAll({ types: oneType });
    useStore.setState({ user: seedUser({ preferred_language: "hi", is_admin: true }) });
    render(<AdminFeedsPage />);
    await waitForLoaded();

    fireEvent.click(await screen.findByRole("button", { name: "चारा प्रकार" }));
    await waitFor(() => expect(screen.getByText("Forage")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "प्रकार हटाएं" })); // Delete type — this aria-label DOES have a Hindi dictionary entry

    expect(await screen.findByText("क्या आप वाकई प्रकार हटाना चाहते हैं?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "हाँ" })).toBeInTheDocument(); // Yes
    expect(screen.getByRole("button", { name: "नहीं" })).toBeInTheDocument(); // No
  });

  it("renders in English when there is no signed-in user (pre-login fallback chain)", async () => {
    resolveLoadAll({});
    render(<AdminFeedsPage />);
    await waitForLoaded();
    expect(screen.getByText("Feed Management")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feed Type" })).toBeInTheDocument();
  });
});
