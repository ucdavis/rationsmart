import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";

const {
  getFeedTypes,
  getFeedCategories,
  getFeedSubCategories,
  updateCustomFeed,
  insertCustomFeed,
  checkInsertOrUpdate,
} = vi.hoisted(() => ({
  getFeedTypes: vi.fn(),
  getFeedCategories: vi.fn(),
  getFeedSubCategories: vi.fn(),
  updateCustomFeed: vi.fn(),
  insertCustomFeed: vi.fn(),
  checkInsertOrUpdate: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getFeedTypes,
    getFeedCategories,
    getFeedSubCategories,
    updateCustomFeed,
    insertCustomFeed,
    checkInsertOrUpdate,
  };
});

import FeedRow from "@/components/FeedRow";
import type { FeedItem } from "@/lib/api";
import { useStore, type User } from "@/lib/store";

// --- fixtures --------------------------------------------------------

function makeItem(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "row-1",
    feed_type_id: null,
    feed_type_name: "",
    category_id: null,
    category_name: "",
    sub_category_id: null,
    sub_category_name: "",
    feed_uuid: null,
    display_name: null,
    price_per_kg: null,
    quantity_kg: null,
    inclusion_limits_enabled: false,
    min_kg_per_day: null,
    max_kg_per_day: null,
    ...over,
  };
}

function seedUser(over: Partial<User> = {}): User {
  return {
    id: "u-1",
    name: "Aiyappa Test",
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
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Persistent, harmless defaults — individual tests override with
  // mockResolvedValueOnce for the specific call(s) they care about.
  getFeedTypes.mockResolvedValue({ data: [] });
  getFeedCategories.mockResolvedValue({ data: [] });
  getFeedSubCategories.mockResolvedValue({ data: { standard_feeds: [], custom_feeds: [] } });
  checkInsertOrUpdate.mockResolvedValue({ data: { insert_feed: false, feed_details: {} } });
  insertCustomFeed.mockResolvedValue({ data: { feed_details: {} } });
  updateCustomFeed.mockResolvedValue({ data: {} });

  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  } as never);
});

// --- 1. default first row ---------------------------------------------
// NOTE: CLAUDE.md §6 documents "Default first row: if index === 0 &&
// !item.feed_type_name, the default feed type is 'Forage'". That behavior
// was removed from the current source in commit 614bcf9 ("Auto-default-
// to-Forage on FEED 1 removed by request"). This test documents/locks in
// the CURRENT behavior (no auto-selection for any index) rather than the
// stale doc claim — see final report for this finding.
describe("default first row (documents stale CLAUDE.md §6 claim)", () => {
  it("index 0 with empty feed_type_name does NOT auto-select Forage", async () => {
    const onUpdate = vi.fn();
    getFeedTypes.mockResolvedValueOnce({ data: ["Forage", "Concentrate"] });
    render(
      <FeedRow item={makeItem()} index={0} showQuantity={false} onUpdate={onUpdate} onDelete={vi.fn()} />
    );
    await screen.findByText("Forage");
    expect(onUpdate).not.toHaveBeenCalledWith(
      "row-1",
      expect.objectContaining({ feed_type_name: "Forage" })
    );
  });
});

// --- 2. feedTypeLocked prop --------------------------------------------
describe("feedTypeLocked prop", () => {
  it("disables every Feed Type radio and blocks onUpdate when clicked", async () => {
    const onUpdate = vi.fn();
    getFeedTypes.mockResolvedValueOnce({ data: ["Forage", "Concentrate"] });
    render(
      <FeedRow
        item={makeItem({ feed_type_id: 1, feed_type_name: "Forage" })}
        index={0}
        showQuantity={false}
        feedTypeLocked
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    const concentrateBtn = await screen.findByRole("button", { name: "Concentrate" });
    const forageBtn = screen.getByRole("button", { name: "Forage" });

    expect(concentrateBtn).toBeDisabled();
    expect(forageBtn).toBeDisabled();

    // Mount settles with its own (harmless) cascade-driven onUpdate calls
    // for the empty category/sub-category fields — clear those before
    // isolating the click-specific assertion below.
    onUpdate.mockClear();
    fireEvent.click(concentrateBtn);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// --- 3. cascade fetch order ---------------------------------------------
describe("cascade fetch order", () => {
  it("fetches categories only after feed_type_name is set, sub-categories only once both type+category are set", async () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={onUpdate} onDelete={vi.fn()} />
    );
    await waitFor(() => expect(getFeedTypes).toHaveBeenCalledTimes(1));
    expect(getFeedCategories).not.toHaveBeenCalled();
    expect(getFeedSubCategories).not.toHaveBeenCalled();

    getFeedCategories.mockResolvedValueOnce({ data: ["Cat1", "Cat2"] });
    rerender(
      <FeedRow
        item={makeItem({ feed_type_name: "Concentrate" })}
        index={1}
        showQuantity={false}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedCategories).toHaveBeenCalledWith("Concentrate", "1", "u-1"));
    expect(getFeedSubCategories).not.toHaveBeenCalled();

    getFeedSubCategories.mockResolvedValueOnce({ data: { standard_feeds: [], custom_feeds: [] } });
    rerender(
      <FeedRow
        item={makeItem({ feed_type_name: "Concentrate", category_name: "Cat1" })}
        index={1}
        showQuantity={false}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedSubCategories).toHaveBeenCalledTimes(1));
    expect(getFeedSubCategories).toHaveBeenCalledWith("Concentrate", "Cat1", "1", "u-1");
  });
});

// --- 4. cascade-reset rule (§10.10) --------------------------------------
describe("cascade-reset rule (§10.10)", () => {
  it("preserves a restored category_name that IS present in the freshly fetched list", async () => {
    const onUpdate = vi.fn();
    getFeedCategories.mockResolvedValueOnce({
      data: [
        { category_name: "Preserved", display_category: "Preserved" },
        { category_name: "Other", display_category: "Other" },
      ],
    });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Concentrate", category_id: 1, category_name: "Preserved" })}
        index={1}
        showQuantity={false}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedCategories).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Preserved" });
    expect(onUpdate).not.toHaveBeenCalledWith(
      "row-1",
      expect.objectContaining({ category_name: "" })
    );
  });

  it("clears a restored category_name that is NOT present in the freshly fetched list (no feed_uuid to lean on)", async () => {
    const onUpdate = vi.fn();
    getFeedCategories.mockResolvedValueOnce({
      data: [{ category_name: "Other", display_category: "Other" }],
    });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Concentrate", category_name: "Ghost", feed_uuid: null })}
        index={1}
        showQuantity={false}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("row-1", {
        category_id: null,
        category_name: "",
        sub_category_id: null,
        sub_category_name: "",
        feed_uuid: null,
      })
    );
  });
});

// --- 5. delete button visibility ----------------------------------------
describe("delete button visibility", () => {
  it("is NOT rendered for index 0", async () => {
    render(
      <FeedRow item={makeItem()} index={0} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Remove feed" })).not.toBeInTheDocument();
    // Let the (harmless) cascade effects settle before the test unmounts,
    // so their state updates land inside act() rather than after.
    await waitFor(() => expect(getFeedTypes).toHaveBeenCalledTimes(1));
  });

  it("is rendered and calls onDelete for index > 0", async () => {
    const onDelete = vi.fn();
    render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={onDelete} />
    );
    const btn = screen.getByRole("button", { name: "Remove feed" });
    fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledWith("row-1");
    await waitFor(() => expect(getFeedTypes).toHaveBeenCalledTimes(1));
  });
});

// --- 6 & 7. Edit dialog insert / update paths ----------------------------
describe("edit dialog — insert path (§10.8 regression guard)", () => {
  it("calls insertCustomFeed and the new feed becomes the SELECTED option, not a placeholder fallback", async () => {
    const initialItem = makeItem({
      feed_type_name: "Concentrate",
      category_id: 1,
      category_name: "Grain",
      feed_uuid: "old-uuid",
      sub_category_id: 1,
      sub_category_name: "Old Feed",
    });
    getFeedTypes.mockResolvedValueOnce({ data: [{ type_name: "Concentrate", display_type: "Concentrate" }] });
    getFeedCategories.mockResolvedValueOnce({ data: [{ category_name: "Grain", display_category: "Grain" }] });
    getFeedSubCategories.mockResolvedValueOnce({
      data: { standard_feeds: [{ feed_id: "old-uuid", fd_name: "Old Feed" }], custom_feeds: [] },
    });
    checkInsertOrUpdate.mockResolvedValueOnce({
      data: { insert_feed: true, feed_details: { feed_name: "Old Feed" } },
    });
    insertCustomFeed.mockResolvedValueOnce({
      data: { feed_details: { feed_name: "Aiyappa-NewCustomFeed", feed_id: "brand-new-uuid" } },
    });

    function Wrapper() {
      const [item, setItem] = useState(initialItem);
      return (
        <FeedRow
          item={item}
          index={1}
          showQuantity={false}
          onUpdate={(_id, updates) => setItem((p) => ({ ...p, ...updates }))}
          onDelete={() => {}}
        />
      );
    }
    const { container } = render(<Wrapper />);

    // Row is fully hydrated (Feed dropdown shows the existing selection).
    await screen.findByRole("button", { name: "Old Feed" });

    fireEvent.click(screen.getByRole("button", { name: "Edit feed nutritional values" }));
    await screen.findByText("Add Custom Feed");

    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput).not.toBeDisabled();
    fireEvent.change(nameInput, { target: { value: "NewCustomFeed" } });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(insertCustomFeed).toHaveBeenCalledTimes(1));
    const body = insertCustomFeed.mock.calls[0][0];
    expect(body.feed_insert).toBe(true);
    expect(body.feed_details.feed_name).toBe("Aiyappa-NewCustomFeed");

    // The exact §10.8 regression: after insert, the new feed_uuid must be
    // selectable immediately — no fallback to "Select feed".
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Aiyappa-NewCustomFeed" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Select feed")).not.toBeInTheDocument();
  });
});

describe("edit dialog — update path", () => {
  it("calls updateCustomFeed; Feed Name input is disabled so the stored name survives unchanged", async () => {
    const initialItem = makeItem({
      feed_type_name: "Forage",
      category_id: 1,
      category_name: "Green Fodder",
      feed_uuid: "existing-uuid",
      sub_category_id: 1,
      sub_category_name: "John-MyFeed",
    });
    getFeedTypes.mockResolvedValueOnce({ data: [{ type_name: "Forage", display_type: "Forage" }] });
    getFeedCategories.mockResolvedValueOnce({ data: [{ category_name: "Green Fodder", display_category: "Green Fodder" }] });
    getFeedSubCategories.mockResolvedValueOnce({
      data: { standard_feeds: [], custom_feeds: [{ feed_id: "existing-uuid", fd_name: "John-MyFeed" }] },
    });
    checkInsertOrUpdate.mockResolvedValueOnce({
      data: { insert_feed: false, feed_details: { feed_name: "John-MyFeed" } },
    });
    updateCustomFeed.mockResolvedValueOnce({ data: {} });

    function Wrapper() {
      const [item, setItem] = useState(initialItem);
      return (
        <FeedRow
          item={item}
          index={1}
          showQuantity={false}
          onUpdate={(_id, updates) => setItem((p) => ({ ...p, ...updates }))}
          onDelete={() => {}}
        />
      );
    }
    const { container } = render(<Wrapper />);
    await screen.findByRole("button", { name: "John-MyFeed" });

    fireEvent.click(screen.getByRole("button", { name: "Edit feed nutritional values" }));
    await screen.findByText("Edit Nutritional Information");

    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    // Current code disables the name field whenever editIsInsert is false
    // (disabled={!editIsInsert}) — the user cannot actually rename a feed
    // from the update path via this UI. See final report: this contradicts
    // CLAUDE.md §6's "if the feed name changed, also patch..." framing.
    expect(nameInput).toBeDisabled();
    expect(nameInput.value).toBe("MyFeed");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(updateCustomFeed).toHaveBeenCalledTimes(1));
    const body = updateCustomFeed.mock.calls[0][0];
    expect(body.feed_id).toBe("existing-uuid");
    expect(body.feed_insert).toBe(false);
    expect(body.feed_details.feed_name).toBe("John-MyFeed");

    await waitFor(() => expect(screen.queryByText("Edit Nutritional Information")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "John-MyFeed" })).toBeInTheDocument();
  });
});

// --- 8. Feed-name prefix logic --------------------------------------------
describe("edit dialog — feed name prefix logic", () => {
  it("!isInsert + name containing '-' splits prefix/value at the FIRST dash", async () => {
    const item = makeItem({ feed_type_name: "Forage", category_name: "Green Fodder", feed_uuid: "u1" });
    checkInsertOrUpdate.mockResolvedValueOnce({
      data: { insert_feed: false, feed_details: { feed_name: "John-MyFeed-Extra" } },
    });
    const { container } = render(
      <FeedRow item={item} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit feed nutritional values" }));
    await screen.findByText("Edit Nutritional Information");

    expect(screen.getByText("John-")).toBeInTheDocument();
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.value).toBe("MyFeed-Extra");
  });

  it("!isInsert + name without '-' falls back to `${userFirstName}-`", async () => {
    const item = makeItem({ feed_type_name: "Forage", category_name: "Green Fodder", feed_uuid: "u1" });
    checkInsertOrUpdate.mockResolvedValueOnce({
      data: { insert_feed: false, feed_details: { feed_name: "PlainName" } },
    });
    const { container } = render(
      <FeedRow item={item} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit feed nutritional values" }));
    await screen.findByText("Edit Nutritional Information");

    // seeded user.name = "Aiyappa Test" -> first word + "-"
    expect(screen.getByText("Aiyappa-")).toBeInTheDocument();
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput.value).toBe("PlainName");
  });
});

// --- 9. Nutrient field layout by category ---------------------------------
describe("edit dialog — nutrient field layout by category", () => {
  const cases: Array<[string, number, boolean]> = [
    ["Additive", 13, true],
    ["Mineral", 4, false],
    ["Minerals", 4, false],
    ["Roughage", 12, false],
  ];

  it.each(cases)(
    "category=%s renders %i nutrient fields (NPN present=%s)",
    async (category, count, hasNpn) => {
      const item = makeItem({ feed_type_name: "Forage", category_name: category, feed_uuid: "u1" });
      checkInsertOrUpdate.mockResolvedValueOnce({
        data: { insert_feed: false, feed_details: { feed_name: "SomeFeed" } },
      });
      const { container } = render(
        <FeedRow item={item} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      fireEvent.click(screen.getByRole("button", { name: "Edit feed nutritional values" }));
      await screen.findByText("Edit Nutritional Information");

      const grid = container.querySelector(".grid.grid-cols-2.gap-3.mb-5") as HTMLElement;
      expect(grid).not.toBeNull();
      expect(grid.querySelectorAll("input")).toHaveLength(count);

      if (hasNpn) {
        expect(within(grid).getByText("NPN")).toBeInTheDocument();
      } else {
        expect(within(grid).queryByText("NPN")).not.toBeInTheDocument();
      }
    }
  );
});

// --- 10. Bare single-object response handling ------------------------------
// Some backend responses come back as a single bare object instead of a
// 1-item array when exactly one result matches (a common REST quirk).
// Regression coverage for the "for few category even though data present
// empty shown" report — the extractors must wrap a bare object rather than
// silently producing an empty option list.
describe("bare single-object cascade responses (singleton REST quirk)", () => {
  it("wraps a bare feed-type object instead of showing an empty list", async () => {
    getFeedTypes.mockResolvedValueOnce({ data: { type_name: "Forage" } });
    render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    await screen.findByText("Forage");
  });

  it("wraps a bare category object instead of showing an empty dropdown", async () => {
    getFeedCategories.mockResolvedValueOnce({ data: { category_name: "Mineral" } });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Forage" })}
        index={1}
        showQuantity={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedCategories).toHaveBeenCalled());
    // Open the Category CustomSelect popup and confirm the singleton
    // category made it into the options list instead of being dropped.
    fireEvent.click(await screen.findByRole("button", { name: "Select" }));
    expect(await screen.findByText("Mineral")).toBeInTheDocument();
  });

  it("wraps a bare sub-category (feed) object instead of showing an empty Feed dropdown", async () => {
    getFeedSubCategories.mockResolvedValueOnce({ data: { feed_id: "u9", fd_name: "Solo Feed" } });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Forage", category_name: "Green Fodder" })}
        index={1}
        showQuantity={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedSubCategories).toHaveBeenCalled());
  });
});

// --- 11. Parse-error isolation ----------------------------------------------
// If the cascade's success handler throws while parsing an unexpected shape,
// that must NOT surface the "Could not load X" toast — the request itself
// succeeded, so showing a load-failure message is misleading. Regression
// coverage for the "even though api success it shows snackbar could not
// load data" report.
describe("parse-error isolation (success handler throws ≠ load failure)", () => {
  it("a malformed feed-types response does not show the 'Could not load feed types' toast", async () => {
    // Array.isArray(null) is false and none of the wrapper-object checks
    // match null, but a hostile shape reaching into extractOptions'
    // .map/.filter chain differently could still throw — simulate that by
    // returning a value whose `feed_types` getter throws mid-access.
    const hostile = { get feed_types() { throw new Error("boom"); } };
    getFeedTypes.mockResolvedValueOnce({ data: hostile });
    render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    await waitFor(() => expect(getFeedTypes).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().snackbar).toBeNull();
  });

  it("a malformed categories response does not show the 'Could not load categories' toast", async () => {
    const hostile = { get categories() { throw new Error("boom"); } };
    getFeedCategories.mockResolvedValueOnce({ data: hostile });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Forage" })}
        index={1}
        showQuantity={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedCategories).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().snackbar).toBeNull();
  });

  it("a malformed sub-categories response does not show the 'Could not load sub-categories' toast", async () => {
    const hostile = { get standard_feeds() { throw new Error("boom"); } };
    getFeedSubCategories.mockResolvedValueOnce({ data: hostile });
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Forage", category_name: "Green Fodder" })}
        index={1}
        showQuantity={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedSubCategories).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().snackbar).toBeNull();
  });

  it("a genuine network failure on feed types (no stored value) still shows the toast", async () => {
    getFeedTypes.mockRejectedValueOnce(new Error("Network Error"));
    render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    await waitFor(() => {
      expect(useStore.getState().snackbar?.message).toBe("Could not load feed types");
    });
  });
});

// --- 12. Loading shimmer on the real elements, not a separate skeleton ----
// Matches the cattle-info page's pattern: while a cascade is in flight,
// the SAME field markup (radio grid / FieldBox+CustomSelect) renders,
// just shimmering and non-interactive, instead of being swapped for a
// bare placeholder div — so there's no layout drift once data arrives.
describe("loading shimmer uses the real elements (not a separate skeleton div)", () => {
  it("Feed Type: shows a 2-radio shimmer placeholder (same grid) while loadingTypes, then the real Forage/Concentrate radios", async () => {
    let resolveTypes!: (v: { data: string[] }) => void;
    getFeedTypes.mockReturnValueOnce(new Promise((resolve) => { resolveTypes = resolve; }));
    const { container } = render(
      <FeedRow item={makeItem()} index={1} showQuantity={false} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.queryByText("Forage")).not.toBeInTheDocument();
    const grid = container.querySelector(".grid.grid-cols-2.gap-3.ml-1");
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll(".shimmer").length).toBe(2);

    resolveTypes({ data: ["Forage", "Concentrate"] });
    await screen.findByText("Forage");
    expect(screen.getByText("Concentrate")).toBeInTheDocument();
    expect(container.querySelectorAll(".grid.grid-cols-2.gap-3.ml-1 .shimmer").length).toBe(0);
  });

  it("Feed Category: shimmers the same FieldBox+CustomSelect in place while loadingCats, then shows the real dropdown", async () => {
    let resolveCats!: (v: { data: { category_name: string; display_category: string }[] }) => void;
    getFeedTypes.mockResolvedValueOnce({ data: ["Forage"] });
    getFeedCategories.mockReturnValueOnce(new Promise((resolve) => { resolveCats = resolve; }));
    render(
      <FeedRow
        item={makeItem({ feed_type_name: "Forage" })}
        index={1}
        showQuantity={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(getFeedCategories).toHaveBeenCalled());

    // Label cutout is hidden while shimmering (see FieldBox), but the
    // trigger button (real CustomSelect) is present, disabled.
    const triggers = screen.getAllByRole("button").filter((b) => b.className.includes("w-full flex items-center justify-between"));
    expect(triggers.length).toBeGreaterThan(0);
    triggers.forEach((t) => expect(t).toBeDisabled());

    resolveCats({ data: [{ category_name: "Green Fodder", display_category: "Green Fodder" }] });
    await screen.findByText("Feed Category");
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(await screen.findByText("Green Fodder")).toBeInTheDocument();
  });
});
