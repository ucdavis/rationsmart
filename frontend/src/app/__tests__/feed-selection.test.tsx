import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const {
  push,
  back,
  getFeedTypes,
  getFeedCategories,
  getFeedSubCategories,
  fetchFeedTaxonomyLabels,
  searchFeeds,
  recommendDiet,
  evaluateDiet,
  insertCustomFeed,
  updateCustomFeed,
  checkInsertOrUpdate,
} = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  getFeedTypes: vi.fn(),
  getFeedCategories: vi.fn(),
  getFeedSubCategories: vi.fn(),
  fetchFeedTaxonomyLabels: vi.fn(),
  searchFeeds: vi.fn(),
  recommendDiet: vi.fn(),
  evaluateDiet: vi.fn(),
  insertCustomFeed: vi.fn(),
  updateCustomFeed: vi.fn(),
  checkInsertOrUpdate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getFeedTypes,
    getFeedCategories,
    getFeedSubCategories,
    fetchFeedTaxonomyLabels,
    searchFeeds,
    recommendDiet,
    evaluateDiet,
    insertCustomFeed,
    updateCustomFeed,
    checkInsertOrUpdate,
  };
});

import FeedSelectionPage from "@/app/(main)/feed-selection/page";
import { useStore, type User } from "@/lib/store";
import {
  DEFAULT_BASE_THRESHOLDS,
  toCattleInfoPayload,
  type CattleInfo,
  type FeedItem,
} from "@/lib/api";

// ─── Fixtures ──────────────────────────────────────────────────────────────

let feedIdCounter = 0;
function mkFeed(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `test_feed_${++feedIdCounter}`,
    feed_type_id: null,
    feed_type_name: "",
    category_id: null,
    category_name: "",
    sub_category_id: null,
    sub_category_name: "",
    feed_uuid: null,
    price_per_kg: null,
    quantity_kg: null,
    inclusion_limits_enabled: false,
    min_kg_per_day: null,
    max_kg_per_day: null,
    ...overrides,
  };
}

// A row that is fully valid (identity + price[+qty]) AND is a Forage row —
// satisfies both isValid() and the Y3 "at least one Forage" gate so tests
// can drive all the way to generateReport() without extra plumbing.
function mkValidForageRow(overrides: Partial<FeedItem> = {}): FeedItem {
  return mkFeed({
    feed_type_name: "Forage",
    category_name: "Green Fodder",
    sub_category_name: "Napier Grass",
    feed_uuid: "uuid-forage-1",
    price_per_kg: 10,
    ...overrides,
  });
}

function mkCattleInfo(overrides: Partial<CattleInfo> = {}): CattleInfo {
  return {
    simulation_name: "Sim-1",
    country: "India",
    country_id: "1",
    breed: "Local",
    body_weight: 450,
    body_weight_gain: 0.5,
    body_condition_score: 3,
    parity: 2,
    days_in_milk: 100,
    days_of_pregnancy: 0,
    milk_production: 10,
    milk_protein_percent: 3.2,
    milk_fat_percent: 4,
    average_temperature: 28,
    grazing: false,
    distance: 0,
    topography: "Flat",
    milk_price: null,
    animal_category: "Lactating Cow",
    simulation_language: null,
    ...overrides,
  };
}

function seedUser(overrides: Partial<User> = {}): User {
  return {
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
    ...overrides,
  };
}

beforeEach(() => {
  push.mockClear();
  back.mockClear();

  getFeedTypes.mockReset().mockResolvedValue({ data: ["Forage", "Concentrate"] });
  getFeedCategories.mockReset().mockResolvedValue({ data: [] });
  getFeedSubCategories
    .mockReset()
    .mockResolvedValue({ data: { standard_feeds: [], custom_feeds: [] } });
  fetchFeedTaxonomyLabels.mockReset().mockResolvedValue({ types: {}, categories: {} });
  searchFeeds.mockReset().mockResolvedValue({ data: [] });
  recommendDiet.mockReset();
  evaluateDiet.mockReset();
  insertCustomFeed.mockReset();
  updateCustomFeed.mockReset();
  checkInsertOrUpdate.mockReset();

  useStore.setState({
    user: seedUser(),
    cattleInfo: mkCattleInfo(),
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

// Renders and waits for every row's cascade fetch to settle (Generate
// button text flips from "Loading feed data…" to its steady-state label).
async function renderReady() {
  render(<FeedSelectionPage />);
  await waitFor(() => {
    expect(screen.queryByText(/Loading feed data/)).not.toBeInTheDocument();
  });
}

function feedHeaders() {
  return screen.getAllByText(/^FEED \d+$/);
}

// ─── 1. Row count / 3-row minimum pad (CLAUDE.md §11) ───────────────────────

describe("feed-selection — row count / padding", () => {
  it("pads up to 3 rows when the store has 0 stored selections", async () => {
    useStore.setState({ feedSelections: [] });
    await renderReady();
    expect(feedHeaders().map((n) => n.textContent)).toEqual(["FEED 1", "FEED 2", "FEED 3"]);
  });

  it("shows exactly 5 rows for a restored simulation with 5 stored items (no padding down)", async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      mkValidForageRow({ feed_uuid: `uuid-${i}`, sub_category_name: `Feed ${i}` })
    );
    useStore.setState({ feedSelections: items });
    await renderReady();
    expect(feedHeaders()).toHaveLength(5);
  });

  it("pads a single stored item up to 3 rows total", async () => {
    useStore.setState({ feedSelections: [mkValidForageRow()] });
    await renderReady();
    expect(feedHeaders()).toHaveLength(3);
  });
});

// ─── 2. First-row Feed Type lock ─────────────────────────────────────────────
//
// CLAUDE.md §5 documents: "The first row's feed_type is LOCKED in
// recommendation mode (feedTypeLocked={index === 0 && !isEvaluation})".
// That is NOT what the current source does. `git log` shows the prop was
// deliberately dropped from the page in commit 614bcf9 ("remove FEED 1
// type lock"), replaced by Forage-first dropdown ordering + the separate
// "Forage required" gate (showNoForageDialog) that blocks Generate instead
// of locking the row. `feedTypeLocked` still exists as a FeedRow prop
// (defaults to false) but src/app/(main)/feed-selection/page.tsx never
// passes it. These tests assert the ACTUAL current behavior — the Feed
// Type radios on row 1 are never disabled, in either mode — and exist to
// catch a regression if locking is ever reintroduced without updating docs.
describe("feed-selection — first row Feed Type lock (CLAUDE.md §5 is stale here)", () => {
  it("row 1's Feed Type radios are NOT disabled in recommendation mode", async () => {
    useStore.setState({ feedSelectionType: "recommendation", feedSelections: [] });
    await renderReady();
    const card1 = screen.getByText("FEED 1").closest('[id^="feed-card-"]') as HTMLElement;
    const forageBtn = within(card1).getByRole("button", { name: "Forage" });
    expect(forageBtn).not.toBeDisabled();
  });

  it("row 1's Feed Type radios are NOT disabled in evaluation mode either", async () => {
    useStore.setState({ feedSelectionType: "evaluation", feedSelections: [] });
    await renderReady();
    const card1 = screen.getByText("FEED 1").closest('[id^="feed-card-"]') as HTMLElement;
    const forageBtn = within(card1).getByRole("button", { name: "Forage" });
    expect(forageBtn).not.toBeDisabled();
  });
});

// ─── 3. Custom Diet Limits disabled in evaluation mode ──────────────────────

describe("feed-selection — Custom Diet Limits gating", () => {
  it("is enabled in recommendation mode, disabled in evaluation mode", async () => {
    useStore.setState({ feedSelectionType: "recommendation", feedSelections: [] });
    await renderReady();
    const btn = screen.getByRole("button", { name: "Custom Diet Limits" });
    expect(btn).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Diet Evaluation" }));
    await waitFor(() => expect(btn).toBeDisabled());
  });
});

// ─── 3b. Search result keeps the target card highlighted ────────────────────

describe("feed-selection — search result highlights the filled card", () => {
  it("leaves the landed card marked Selected (active ring) after picking a result", async () => {
    useStore.setState({ feedSelectionType: "recommendation", feedSelections: [] });
    searchFeeds.mockReset().mockResolvedValue({
      data: [
        {
          feed_uuid: "sugar-1",
          feed_name: "Sugarcane tops, Wet season",
          feed_type: "Forage",
          feed_category: "By-Product/Other-Forage",
          display_name: "Sugarcane tops, Wet season",
          display_type: "Forage",
          display_category: "By-Product/Other-Forage",
        },
      ],
    });
    await renderReady();

    // No card is active to begin with — nothing shows "Selected".
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();

    // Type a query; the debounced search resolves and a result appears.
    const searchBox = screen.getByPlaceholderText(/Search feeds/i);
    fireEvent.change(searchBox, { target: { value: "sugar" } });
    const result = await screen.findByText("Sugarcane tops, Wet season");

    // Pick it → it lands in a card, and that card must stay highlighted so
    // the user can see where the feed went (regression: this used to clear
    // the active row to null, leaving no indication).
    fireEvent.click(result);
    await waitFor(() => expect(screen.getByText("Selected")).toBeInTheDocument());
  });
});

// ─── 3c. Concurrent cascade writes must not clobber Category ────────────────

describe("feed-selection — search pick keeps Category (no cascade clobber)", () => {
  it("keeps category_id after a picked feed's cascades resolve out of order", async () => {
    // Root-cause regression: after a search pick, FeedRow's category cascade
    // sets category_id, then the sub-category cascade resolves later and
    // issues its own onUpdate. With updateItem built off a stale `items`
    // closure, that later write rebuilt from a snapshot where category_id was
    // still null and wiped it — so the Feed filled but Category went blank.
    // Here the sub-category fetch resolves AFTER the category fetch and
    // returns a slightly different feed name, forcing that second onUpdate.
    useStore.setState({ feedSelectionType: "evaluation", feedSelections: [] });
    getFeedTypes.mockReset().mockResolvedValue({ data: ["Forage", "Concentrate"] });
    getFeedCategories.mockReset().mockImplementation((feedType: string) =>
      Promise.resolve({
        data:
          feedType === "Forage"
            ? [
                {
                  category_name: "By-Product/Other-Forage",
                  display_category: "By-Product/Other-Forage",
                },
              ]
            : [{ category_name: "Grain", display_category: "Grain" }],
      })
    );
    getFeedSubCategories.mockReset().mockImplementation((feedType: string, category: string) => {
      if (feedType === "Forage" && category === "By-Product/Other-Forage") {
        // Resolve later than the category cascade, and return a name that
        // differs from what search stored so the sub-category cascade fires
        // its own onUpdate (the clobbering write under the old code).
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {
                  standard_feeds: [{ feed_id: "sugar-1", fd_name: "Sugarcane tops (Wet)" }],
                  custom_feeds: [],
                },
              }),
            30
          )
        );
      }
      return Promise.resolve({ data: { standard_feeds: [], custom_feeds: [] } });
    });
    searchFeeds.mockReset().mockResolvedValue({
      data: [
        {
          feed_uuid: "sugar-1",
          feed_name: "Sugarcane tops, Wet season",
          feed_type: "Forage",
          feed_category: "By-Product/Other-Forage",
          display_name: "Sugarcane tops, Wet season",
          display_type: "Forage",
          display_category: "By-Product/Other-Forage",
        },
      ],
    });

    await renderReady();
    const card1 = () => screen.getByText("FEED 1").closest('[id^="feed-card-"]') as HTMLElement;

    fireEvent.change(screen.getByPlaceholderText(/Search feeds|Search to fill/i), {
      target: { value: "sugar" },
    });
    fireEvent.click(await screen.findByText("Sugarcane tops, Wet season"));

    // Category must remain populated even after the late sub-category write.
    await waitFor(() =>
      expect(within(card1()).queryByText(/By-Product\/Other-Forage/)).toBeInTheDocument()
    );
    // And stay populated after the delayed cascade fully settles.
    await new Promise((r) => setTimeout(r, 60));
    expect(within(card1()).queryByText(/By-Product\/Other-Forage/)).toBeInTheDocument();
  });
});

// ─── 3d. Category shows even when the category-list endpoint omits it ───────

describe("feed-selection — picked feed's Category shows despite list mismatch", () => {
  it("displays the category from a picked feed even if getFeedCategories omits it", async () => {
    // Real backend inconsistency: /search-feeds reports the feed's category
    // as "By-Product/Other-Forage", but /unique-feed-category for Forage does
    // NOT return that exact string — so the cascade can't match it. The row
    // still has a picked feed_uuid + category_name, so the Category dropdown
    // must display it rather than going blank.
    useStore.setState({ feedSelectionType: "evaluation", feedSelections: [] });
    getFeedTypes.mockReset().mockResolvedValue({ data: ["Forage", "Concentrate"] });
    getFeedCategories.mockReset().mockResolvedValue({
      data: [{ category_name: "Green Fodder", display_category: "Green Fodder" }],
    });
    getFeedSubCategories.mockReset().mockResolvedValue({
      data: {
        standard_feeds: [{ feed_id: "sugar-1", fd_name: "Sugarcane tops, Wet season" }],
        custom_feeds: [],
      },
    });
    searchFeeds.mockReset().mockResolvedValue({
      data: [
        {
          feed_uuid: "sugar-1",
          feed_name: "Sugarcane tops, Wet season",
          feed_type: "Forage",
          feed_category: "By-Product/Other-Forage",
          display_name: "Sugarcane tops, Wet season",
          display_type: "Forage",
          display_category: "By-Product/Other-Forage",
        },
      ],
    });

    await renderReady();
    const card1 = () => screen.getByText("FEED 1").closest('[id^="feed-card-"]') as HTMLElement;

    fireEvent.change(screen.getByPlaceholderText(/Search feeds|Search to fill/i), {
      target: { value: "sugar" },
    });
    fireEvent.click(await screen.findByText("Sugarcane tops, Wet season"));

    await waitFor(() =>
      expect(within(card1()).queryByText("By-Product/Other-Forage")).toBeInTheDocument()
    );
  });
});

// ─── 4. Recommendation / Evaluation toggle reveals Quantity + Cost ──────────

describe("feed-selection — mode toggle", () => {
  it("hides Quantity/Cost in recommendation mode, shows them per-row in evaluation mode", async () => {
    useStore.setState({ feedSelectionType: "recommendation", feedSelections: [] });
    await renderReady();
    expect(screen.queryAllByText(/Quantity/)).toHaveLength(0);
    expect(screen.queryAllByText(/^Cost/)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Diet Evaluation" }));
    await waitFor(() => {
      expect(screen.getAllByText(/Quantity/)).toHaveLength(3);
      expect(screen.getAllByText(/^Cost/)).toHaveLength(3);
    });
  });
});

// ─── 5. Add More Feed ────────────────────────────────────────────────────────

describe("feed-selection — Add More Feed", () => {
  it("appends a new empty row and syncs the store", async () => {
    useStore.setState({ feedSelections: [] });
    await renderReady();
    expect(feedHeaders()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /Add More Feed/ }));

    await waitFor(() => expect(feedHeaders()).toHaveLength(4));
    expect(useStore.getState().feedSelections).toHaveLength(4);
    // The new row is a fresh, fully-empty FeedItem.
    const last = useStore.getState().feedSelections[3];
    expect(last.feed_uuid).toBeNull();
    expect(last.feed_type_name).toBe("");
  });
});

// ─── 6. handleGenerateClick pre-flight validation ───────────────────────────

describe("feed-selection — Incomplete Feeds pre-flight", () => {
  it("blocks on a partially-filled row and lists it, ignoring fully-empty rows", async () => {
    const validRow = mkValidForageRow();
    const partialRow = mkFeed({ feed_type_name: "Concentrate" }); // type started, nothing else
    useStore.setState({ feedSelections: [validRow, partialRow] }); // pads 1 empty row to reach 3
    await renderReady();

    const generateBtn = screen.getByRole("button", { name: "Generate Recommendation" });
    expect(generateBtn).not.toBeDisabled(); // validRow alone satisfies isValid()

    fireEvent.click(generateBtn);

    expect(await screen.findByText("Incomplete Feeds")).toBeInTheDocument();
    // The dialog's bullet row renders "• {name}" as a single text node —
    // scoped to avoid matching the "Concentrate" radio label in FeedRow.
    expect(screen.getByText("• Concentrate")).toBeInTheDocument();
    expect(recommendDiet).not.toHaveBeenCalled();
    expect(evaluateDiet).not.toHaveBeenCalled();
  });

  it("proceeds straight to generateReport when every non-empty row is fully valid", async () => {
    recommendDiet.mockResolvedValueOnce({ data: { report_id: "R1" } });
    const validRow = mkValidForageRow();
    useStore.setState({ feedSelections: [validRow] }); // pads to 3 with 2 empty rows — ignored
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendation" }));

    expect(screen.queryByText("Incomplete Feeds")).not.toBeInTheDocument();
    await waitFor(() => expect(recommendDiet).toHaveBeenCalledTimes(1));
  });
});

// ─── 7. generateReport payload shapes ────────────────────────────────────────

describe("feed-selection — generateReport payloads", () => {
  it("evaluation mode calls evaluateDiet with the right shape", async () => {
    evaluateDiet.mockResolvedValueOnce({ data: { report_id: "EVAL-1" } });
    const cattleInfo = mkCattleInfo();
    const validRow = mkValidForageRow({ quantity_kg: 3 });
    useStore.setState({
      feedSelectionType: "evaluation",
      cattleInfo,
      feedSelections: [validRow],
      user: seedUser(),
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Get Evaluation" }));

    await waitFor(() => expect(evaluateDiet).toHaveBeenCalledTimes(1));
    expect(evaluateDiet).toHaveBeenCalledWith({
      user_id: "u-1",
      country_id: cattleInfo.country_id,
      currency: "INR",
      simulation_id: `${cattleInfo.simulation_name} (Evaluation)`,
      cattle_info: toCattleInfoPayload(cattleInfo),
      feed_evaluation: [{ feed_id: "uuid-forage-1", quantity_as_fed: 3, price_per_kg: 10 }],
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/report"));
    expect(useStore.getState().reportData).toEqual({ report_id: "EVAL-1", mode: "evaluation" });
  });

  it("recommendation mode ALWAYS sends base_thresholds merged over DEFAULT_BASE_THRESHOLDS", async () => {
    recommendDiet.mockResolvedValueOnce({ data: { report_id: "REC-1" } });
    const cattleInfo = mkCattleInfo();
    const validRow = mkValidForageRow();
    useStore.setState({
      feedSelectionType: "recommendation",
      cattleInfo,
      feedSelections: [validRow],
      dietLimits: { ash_max: 12 }, // user's saved Custom Diet Limits — partial override
      user: seedUser(),
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendation" }));

    await waitFor(() => expect(recommendDiet).toHaveBeenCalledTimes(1));
    expect(recommendDiet).toHaveBeenCalledWith({
      user_id: "u-1",
      country_id: cattleInfo.country_id,
      simulation_id: `${cattleInfo.simulation_name} (Recommendation)`,
      cattle_info: toCattleInfoPayload(cattleInfo),
      feed_selection: [{ feed_id: "uuid-forage-1", price_per_kg: 10 }],
      base_thresholds: { ...DEFAULT_BASE_THRESHOLDS, ash_max: 12 },
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/report"));
    expect(useStore.getState().reportData).toEqual({ report_id: "REC-1", mode: "recommendation" });
  });

  it("recommendation mode sends the bare DEFAULT_BASE_THRESHOLDS when no custom limits are set", async () => {
    recommendDiet.mockResolvedValueOnce({ data: { report_id: "REC-2" } });
    useStore.setState({
      feedSelectionType: "recommendation",
      feedSelections: [mkValidForageRow()],
      dietLimits: {},
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendation" }));

    await waitFor(() => expect(recommendDiet).toHaveBeenCalledTimes(1));
    const payload = recommendDiet.mock.calls[0][0];
    expect(payload.base_thresholds).toEqual(DEFAULT_BASE_THRESHOLDS);
  });
});

// ─── 8. GeneratingReportDialog overlay ───────────────────────────────────────

describe("feed-selection — Generating Report overlay", () => {
  it("shows the modal while the request is in flight and hides it after resolution", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    recommendDiet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        })
    );
    useStore.setState({
      feedSelectionType: "recommendation",
      feedSelections: [mkValidForageRow()],
    });
    await renderReady();

    expect(screen.queryByText("Generating your report")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendation" }));

    expect(await screen.findByText("Generating your report")).toBeInTheDocument();

    resolveFn({ data: { report_id: "R1" } });

    await waitFor(() => {
      expect(screen.queryByText("Generating your report")).not.toBeInTheDocument();
    });
    expect(push).toHaveBeenCalledWith("/report");
  });
});

// ─── 9. UI-label i18n — per-simulation language override ────────────────────
//
// This screen resolves display language from cattleInfo.simulation_language
// (the COMMITTED store value) ahead of user.preferred_language — the exact
// same priority chain feed-data i18n's langProvider already uses (see
// src/lib/store.ts / CLAUDE.md §18.3). cattle-info/page.tsx uses a DIFFERENT,
// live form-pending resolution and is out of scope here.
describe("feed-selection — UI-label i18n (simulation_language override)", () => {
  it("renders the toolbar title and custom-buttons row in Hindi when cattleInfo.simulation_language is 'hi', even though user.preferred_language stays 'en'", async () => {
    useStore.setState({
      cattleInfo: mkCattleInfo({ simulation_language: "hi" }),
      user: seedUser({ preferred_language: "en" }),
      feedSelections: [],
    });
    render(<FeedSelectionPage />);

    await screen.findByText("चारा चयन"); // "Feed Selection" (toolbar title)
    expect(screen.getByText("कस्टम आहार सीमाएं")).toBeInTheDocument(); // "Custom Diet Limits"
    expect(screen.getByText("कस्टम चारा")).toBeInTheDocument(); // "Custom Feed"
    expect(screen.queryByText("Feed Selection")).not.toBeInTheDocument();
  });

  it("translates the Diet Recommendation / Diet Evaluation radio labels", async () => {
    useStore.setState({
      cattleInfo: mkCattleInfo({ simulation_language: "hi" }),
      feedSelections: [],
    });
    render(<FeedSelectionPage />);

    await screen.findByText("आहार सिफारिश"); // "Diet Recommendation"
    expect(screen.getByText("आहार मूल्यांकन")).toBeInTheDocument(); // "Diet Evaluation"
  });
});
