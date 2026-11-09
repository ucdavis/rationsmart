import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { getCatalogCategoriesForType, getFeedCategories, getFeedTypes } = vi.hoisted(() => ({
  getCatalogCategoriesForType: vi.fn(),
  getFeedCategories: vi.fn(),
  getFeedTypes: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getCatalogCategoriesForType, getFeedCategories, getFeedTypes };
});

import { useCustomFeed } from "@/components/feed-selection/useCustomFeed";
import type { User } from "@/lib/store";

const user = { id: "u-1", name: "A", country: "India", country_id: "1" } as User;
const MASTER = [
  "By-Product/Other",
  "Plant Protein",
  "Animal Protein",
  "Energy Source",
  "Minerals",
  "Additive",
  "Concentrate Mixtures",
];

async function categoriesFor(feedType: string) {
  const showSnackbar = vi.fn();
  const { result } = renderHook(() => useCustomFeed(user, (s) => s, showSnackbar));
  await act(async () => {
    await result.current.sheetProps.handleCustomTypeChange(feedType);
  });
  return { categories: result.current.sheetProps.customFeedCategories, showSnackbar };
}

beforeEach(() => {
  vi.resetAllMocks();
  // The country (India) only has feeds in Energy Source.
  getFeedCategories.mockResolvedValue({ data: ["Energy Source"] });
});

describe("Custom Feed categories (N6)", () => {
  it("lists every master category of the type, in catalogue order, not just the country's", async () => {
    getCatalogCategoriesForType.mockResolvedValue(MASTER);
    const { categories } = await categoriesFor("Concentrate");
    expect(getCatalogCategoriesForType).toHaveBeenCalledWith("Concentrate");
    expect(categories).toEqual(MASTER);
    expect(getFeedCategories).not.toHaveBeenCalled();
  });

  it("falls back to the country's categories when the master lookup fails", async () => {
    getCatalogCategoriesForType.mockResolvedValue(null);
    const { categories, showSnackbar } = await categoriesFor("Concentrate");
    expect(getFeedCategories).toHaveBeenCalledWith("Concentrate", "1", "u-1");
    expect(categories).toEqual(["Energy Source"]);
    expect(showSnackbar).not.toHaveBeenCalled();
  });
});
