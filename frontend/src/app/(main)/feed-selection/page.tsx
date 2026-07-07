"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import FeedRow from "@/components/FeedRow";
import Toolbar from "@/components/Toolbar";
import GeneratingReportDialog from "@/components/GeneratingReportDialog";
import CustomSelect from "@/components/CustomSelect";
import { evaluateDiet, recommendDiet, getFeedTypes, getFeedCategories, insertCustomFeed, checkInsertOrUpdate, updateCustomFeed, toCattleInfoPayload, DEFAULT_BASE_THRESHOLDS, searchFeeds } from "@/lib/api";
import type { FeedItem, DietLimits, FeedSearchResult } from "@/lib/api";
import { IcAddFeed } from "@/components/Icons";

let idCounter = 0;
const createFeedItem = (): FeedItem => ({
  id: `feed_${++idCounter}_${Date.now()}`,
  feed_type_id: null,
  feed_type_name: "",
  category_id: null,
  category_name: "",
  sub_category_id: null,
  sub_category_name: "",
  feed_uuid: null,
  price_per_kg: null,
  quantity_kg: null,
  // Y3 §1.1.2 — toggle off by default; bounds blank.
  inclusion_limits_enabled: false,
  min_kg_per_day: null,
  max_kg_per_day: null,
});

// Matches Android BaseThresholds — single max value per nutrient
// Custom Diet Limits — Y3 QA matrix specifies ranges per nutrient.
// Values outside these bounds are clamped and a hint appears below
// the field. min is always 0; max varies per nutrient.
const LIMIT_ROWS: { label: string; key: keyof DietLimits; min: number; max: number }[] = [
  { label: "Ash Max (%)",         key: "ash_max",    min: 0, max: 15  },
  { label: "EE Max (%) — Fat",    key: "ee_max",     min: 0, max: 7   },
  { label: "NDF Max (%) — Fiber", key: "ndf_max",    min: 0, max: 100 },
  { label: "Starch Max (%)",      key: "starch_max", min: 0, max: 30  },
];

// Custom feed form — keys mirror Android FeedDetailsViewModel fields.
// Android DialogFeedDetails only shows the 13 nutrients listed below
// (Additive layout = all 13; General omits NPN; Mineral keeps only 4).
const EMPTY_CUSTOM = {
  feed_type: "",
  feed_category: "",
  feed_name: "",
  fd_dm: "",        // Dry Matter
  fd_ash: "",       // Ash
  fd_cp: "",        // Crude Protein
  fd_npn_cp: "",    // NPN (Additive only)
  fd_ee: "",        // Ether Extract
  fd_st: "",        // Starch
  fd_ndf: "",       // NDF
  fd_adf: "",       // ADF
  fd_lg: "",        // Lignin
  fd_ndin: "",      // NDIN
  fd_adin: "",      // ADIN
  fd_ca: "",        // Calcium
  fd_p: "",         // Phosphorus
};

// Match Android DialogFeedDetails category → layout mapping.
// "Additive" → 13 fields incl. NPN
// "Mineral"/"Minerals" → 4 fields (DM, Ash, Ca, P)
// else → General (12 fields, no NPN)
type NutrientLayout = "additive" | "mineral" | "general";
function getNutrientLayout(category: string): NutrientLayout {
  if (category === "Additive") return "additive";
  if (category === "Mineral" || category === "Minerals") return "mineral";
  return "general";
}

type CustomFeedFormKey = keyof typeof EMPTY_CUSTOM;
const NUTRIENT_FIELDS_ADDITIVE: { key: CustomFeedFormKey; label: string }[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_cp", label: "Protein" },
  { key: "fd_npn_cp", label: "NPN" },
  { key: "fd_ee", label: "Ether Extract" },
  { key: "fd_st", label: "Starch" },
  { key: "fd_ndf", label: "NDF" },
  { key: "fd_adf", label: "ADF" },
  { key: "fd_lg", label: "Lignin" },
  { key: "fd_ndin", label: "NDIN" },
  { key: "fd_adin", label: "ADIN" },
  { key: "fd_ca", label: "Calcium" },
  { key: "fd_p", label: "Phosphorus" },
];
const NUTRIENT_FIELDS_GENERAL: { key: CustomFeedFormKey; label: string }[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_cp", label: "Protein" },
  { key: "fd_ee", label: "Ether Extract" },
  { key: "fd_st", label: "Starch" },
  { key: "fd_ndf", label: "NDF" },
  { key: "fd_adf", label: "ADF" },
  { key: "fd_lg", label: "Lignin" },
  { key: "fd_ndin", label: "NDIN" },
  { key: "fd_adin", label: "ADIN" },
  { key: "fd_ca", label: "Calcium" },
  { key: "fd_p", label: "Phosphorus" },
];
const NUTRIENT_FIELDS_MINERAL: { key: CustomFeedFormKey; label: string }[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_ca", label: "Calcium" },
  { key: "fd_p", label: "Phosphorus" },
];

function CustomFeedNutrientInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
        style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
      />
    </div>
  );
}

export default function FeedSelectionPage() {
  const router = useRouter();
  const {
    user,
    cattleInfo,
    feedSelections,
    setFeedSelections,
    feedSelectionType,
    setFeedSelectionType,
    setReportData,
    dietLimits,
    setDietLimits,
    showSnackbar,
  } = useStore((s) => ({
    user: s.user,
    cattleInfo: s.cattleInfo,
    feedSelections: s.feedSelections,
    setFeedSelections: s.setFeedSelections,
    feedSelectionType: s.feedSelectionType,
    setFeedSelectionType: s.setFeedSelectionType,
    setReportData: s.setReportData,
    dietLimits: s.dietLimits,
    setDietLimits: s.setDietLimits,
    showSnackbar: s.showSnackbar,
  }));

  // Use the user's currency CODE directly (PHP / INR / VND / …) so the
  // Price field label reads e.g. "Price PHP/KG", matching Android.
  const currencySymbol = user?.currency ?? "";

  // Diagnostic — feed-selection nothing-loads investigation. Prints the
  // user fields the cascade depends on. If country_id is missing/empty
  // the FeedRow cascade short-circuits and dropdowns stay empty.
  if (typeof window !== "undefined") {
    console.log("[feed-selection mount] user state:", {
      has_user: !!user,
      user_id: user?.id,
      country_id: user?.country_id,
      currency: user?.currency,
      country: user?.country,
      has_token: !!user?.token,
      cattleInfo_country_id: cattleInfo?.country_id,
    });
  }

  const [items, setItems] = useState<FeedItem[]>(() => {
    const stored = feedSelections.length > 0 ? [...feedSelections] : [];
    while (stored.length < 3) stored.push(createFeedItem());
    return stored;
  });

  // Defensive resync — when the user navigates back to /cattle-info and
  // returns to /feed-selection (which unmounts + remounts this
  // component), the useState initializer above reads feedSelections
  // once from the Zustand snapshot. If Zustand hadn't fully hydrated at
  // that instant (persist hydration race — see CLAUDE.md §10.1), items
  // could pick up an empty array and the user would see their previous
  // feed selections disappear. This effect catches that on the next
  // paint by re-taking feedSelections whenever it has entries that
  // items doesn't reflect. Runs on mount + on feedSelections change.
  useEffect(() => {
    // Only resync when the store has entries that meaningfully differ
    // from what items currently reflects. We ignore length differences
    // caused by the local 3-row padding (empty rows) — if every stored
    // item is already represented in items by feed_uuid, do nothing.
    if (feedSelections.length === 0) return;
    const itemsUuids = new Set(items.map((i) => i.feed_uuid).filter(Boolean));
    const storedUuids = feedSelections.map((s) => s.feed_uuid).filter(Boolean);
    const missing = storedUuids.some((u) => !itemsUuids.has(u));
    if (missing) {
      const padded = [...feedSelections];
      while (padded.length < 3) padded.push(createFeedItem());
      setItems(padded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedSelections]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [limits, setLimits] = useState<Partial<DietLimits>>(dietLimits);
  const [showIncompleteFeedsDialog, setShowIncompleteFeedsDialog] = useState(false);
  // Y3 — diet optimization / evaluation requires at least one Forage
  // ingredient. The block fires before generate when none is present.
  const [showNoForageDialog, setShowNoForageDialog] = useState(false);
  const [incompleteFeedNames, setIncompleteFeedNames] = useState<string[]>([]);

  // Custom Feed modal state
  const [showCustomFeedModal, setShowCustomFeedModal] = useState(false);
  // Two collapsible sections, both expanded by default (matches Android
  // DialogFeedDetails isFeedDetailsExpanded/isNutritionalInfoExpanded = true).
  const [feedDetailsExpanded, setFeedDetailsExpanded] = useState(true);
  const [nutritionalInfoExpanded, setNutritionalInfoExpanded] = useState(true);
  const [customFeedForm, setCustomFeedForm] = useState(EMPTY_CUSTOM);
  const [customFeedTypes, setCustomFeedTypes] = useState<string[]>([]);
  const [customFeedCategories, setCustomFeedCategories] = useState<string[]>([]);
  const [loadingCustomTypes, setLoadingCustomTypes] = useState(false);
  const [loadingCustomCats, setLoadingCustomCats] = useState(false);
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  // Y3 §1.1.1 — single page-level search bar. The user taps a FeedRow
  // card to mark it as the "search target" (activeRowId); typing a
  // query + tapping a result then populates that card. If no card is
  // explicitly active when the user picks a result, fall back to the
  // first row without a feed_uuid (or row 1 if all are populated).
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FeedSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Set of row ids currently fetching their cascade (types / categories /
  // sub-categories). Generate is blocked while non-empty so a user
  // landing from simulation history can't submit before stored names
  // have been validated against the live dropdown options.
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());
  const handleCascadeLoading = useCallback((rowId: string, loading: boolean) => {
    setLoadingRows((prev) => {
      const has = prev.has(rowId);
      if (loading && !has) {
        const next = new Set(prev);
        next.add(rowId);
        return next;
      }
      if (!loading && has) {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      }
      return prev;
    });
  }, []);

  // Per-card "Search to fill" shortcut: scroll the global search bar
  // into view + focus its input. The caller (FeedRow) marks itself as
  // the active target first, so the next picked result lands on that
  // card. ScrollIntoView with block:"start" anchors the bar near the
  // viewport top; tiny extra padding so it isn't clipped by the toolbar.
  const handleJumpToSearch = useCallback(() => {
    searchContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Focus after scroll so iOS Safari's virtual keyboard pops up at
    // the bottom rather than mid-page.
    setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 300);
  }, []);

  // Debounced search — 250 ms after last keystroke.
  useEffect(() => {
    if (!searchQuery.trim() || !user?.id || !user?.country_id) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchFeeds(searchQuery.trim(), user.country_id, user.id)
        .then((res) => { setSearchResults(res.data ?? []); })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id, user?.country_id]);

  // Close result dropdown on outside click.
  useEffect(() => {
    if (!searchOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [searchOpen]);

  // Apply the picked result to the targeted row. Target priority:
  //   1. The explicitly-tapped activeRowId, if any
  //   2. The first row whose feed_uuid is still null (empty row)
  //   3. Row 0 as the final fallback
  const applySearchResult = (result: FeedSearchResult) => {
    let landedIdx = -1;
    let usedFallback = false;
    setItems((prev) => {
      let idx = -1;
      if (activeRowId) idx = prev.findIndex((r) => r.id === activeRowId);
      if (idx === -1) {
        idx = prev.findIndex((r) => !r.feed_uuid);
        usedFallback = true;
      }
      if (idx === -1) idx = 0;
      landedIdx = idx;
      const next = prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              feed_type_name: result.feed_type,
              category_name: result.feed_category,
              sub_category_name: result.feed_name,
              feed_uuid: result.feed_uuid,
              sub_category_id: 1,
              // i18n V2 — capture the translated name for the /report
              // fallback. searchFeeds always populates display_name
              // (falls back to English source if no translation exists).
              display_name: result.display_name ?? result.feed_name,
              // FeedRow's cascade `useEffect`s will repopulate the *_id
              // fields when the dropdown lists arrive — leaving them
              // null here would clear them prematurely.
            }
          : row
      );
      setFeedSelections(next);
      return next;
    });
    setSearchQuery("");
    setSearchOpen(false);
    setActiveRowId(null);

    // When the user did NOT tap a card before searching, the result
    // lands silently in the first empty row — which can confuse users
    // who don't realise where it went. Confirm the destination via
    // snackbar. (When a card was tapped, the green ring already told
    // them where it would land, so we skip the toast.)
    if (usedFallback && landedIdx >= 0) {
      showSnackbar(`Added to FEED ${landedIdx + 1}`, "success");
    }
  };

  const openCustomFeedModal = async () => {
    setCustomFeedForm(EMPTY_CUSTOM);
    setCustomFeedTypes([]);
    setCustomFeedCategories([]);
    if (!user?.country_id || !user?.id) {
      showSnackbar("Country info missing. Please update your profile.", "error");
      return;
    }
    setShowCustomFeedModal(true);
    setLoadingCustomTypes(true);
    try {
      const res = await getFeedTypes(user.country_id, user.id);
      // v1 backend may return bare string[] (e.g. ["Roughage","Concentrate"])
      // OR objects with type_name OR a wrapper. Same defensive parsing
      // as FeedRow's cascade — keep both paths in sync.
      const data = res.data as unknown;
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { feed_types?: unknown[] })?.feed_types)
          ? (data as { feed_types: unknown[] }).feed_types
          : Array.isArray((data as { unique_feed_types?: unknown[] })?.unique_feed_types)
            ? (data as { unique_feed_types: unknown[] }).unique_feed_types
            : [];
      const names: string[] = raw.map((it) => {
        if (typeof it === "string") return it;
        const o = it as { type_name?: string; name?: string };
        return o?.type_name ?? o?.name ?? "";
      }).filter((n) => n);
      setCustomFeedTypes(names);
    } catch {
      showSnackbar("Could not load feed types", "error");
    } finally {
      setLoadingCustomTypes(false);
    }
  };

  const handleCustomTypeChange = async (feedType: string) => {
    setCustomFeedForm((p) => ({ ...p, feed_type: feedType, feed_category: "" }));
    setCustomFeedCategories([]);
    if (!feedType || !user?.country_id || !user?.id) return;
    setLoadingCustomCats(true);
    try {
      const res = await getFeedCategories(feedType, user.country_id, user.id);
      const data = res.data as unknown;
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { categories?: unknown[] })?.categories)
          ? (data as { categories: unknown[] }).categories
          : Array.isArray((data as { unique_feed_categories?: unknown[] })?.unique_feed_categories)
            ? (data as { unique_feed_categories: unknown[] }).unique_feed_categories
            : Array.isArray((data as { feed_categories?: unknown[] })?.feed_categories)
              ? (data as { feed_categories: unknown[] }).feed_categories
              : [];
      const names: string[] = raw.map((it) => {
        if (typeof it === "string") return it;
        const o = it as { category_name?: string; name?: string };
        return o?.category_name ?? o?.name ?? "";
      }).filter((n) => n);
      setCustomFeedCategories(names);
    } catch {
      showSnackbar("Could not load categories", "error");
    } finally {
      setLoadingCustomCats(false);
    }
  };

  const handleSaveCustomFeed = async () => {
    if (!user?.id || !user?.country_id) return;
    if (!customFeedForm.feed_name.trim() || !customFeedForm.feed_type) {
      showSnackbar("Feed name and type are required", "error");
      return;
    }
    setIsSavingCustom(true);
    try {
      // Match Android FeedDetailsViewModel.insertFeed payload: numeric fields
      // default to 0.0 (toDoubleOrZero) for any nutrient the chosen layout
      // does not surface. We mirror that — empty inputs become 0.
      const toNum = (v: string) => (v ? Number(v) : 0);
      const feedDetails = {
        feed_name: customFeedForm.feed_name.trim(),
        feed_type: customFeedForm.feed_type,
        feed_category: customFeedForm.feed_category,
        country_code: user.country_code ?? "",
        country_name: user.country ?? "",
        fd_dm: toNum(customFeedForm.fd_dm),
        fd_ash: toNum(customFeedForm.fd_ash),
        fd_cp: toNum(customFeedForm.fd_cp),
        fd_npn_cp: toNum(customFeedForm.fd_npn_cp),
        fd_ee: toNum(customFeedForm.fd_ee),
        fd_st: toNum(customFeedForm.fd_st),
        fd_ndf: toNum(customFeedForm.fd_ndf),
        fd_adf: toNum(customFeedForm.fd_adf),
        fd_lg: toNum(customFeedForm.fd_lg),
        fd_ndin: toNum(customFeedForm.fd_ndin),
        fd_adin: toNum(customFeedForm.fd_adin),
        fd_ca: toNum(customFeedForm.fd_ca),
        fd_p: toNum(customFeedForm.fd_p),
      };

      // Check if it already exists
      let isUpdate = false;
      let existingFeedId = "";
      try {
        const checkRes = await checkInsertOrUpdate(user.country_id, customFeedForm.feed_name.trim(), user.id);
        const checkData = checkRes.data;
        isUpdate = !(checkData?.insert_feed ?? true);
        existingFeedId = checkData?.feed_details?.feed_id ?? "";
      } catch {
        // assume new feed
      }

      if (isUpdate && existingFeedId) {
        await updateCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_id: existingFeedId,
          feed_insert: false,
          feed_details: feedDetails,
        });
        showSnackbar("Custom feed updated!", "success");
      } else {
        await insertCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_insert: true,
          feed_details: feedDetails,
        });
        showSnackbar("Custom feed saved! It will appear in the feed list.", "success");
      }
      setShowCustomFeedModal(false);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Failed to save custom feed", "error");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const isEvaluation = feedSelectionType === "evaluation";

  const addFeed = () => {
    const updated = [...items, createFeedItem()];
    setItems(updated);
    setFeedSelections(updated);
  };

  const updateItem = (id: string, updates: Partial<FeedItem>) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    setItems(updated);
    setFeedSelections(updated);
  };

  const deleteItem = (id: string) => {
    if (items.length === 1) {
      showSnackbar("At least one feed item is required", "info");
      return;
    }
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    setFeedSelections(updated);
  };

  const isValid = () => {
    if (!cattleInfo) return false;
    // Block the Generate button while ANY row is still resolving its
    // cascade fetches. This matters most for history-restored sessions:
    // the FeedRow effects re-fetch type/category/feed options and need
    // to validate stored names against the live response before the
    // payload is safe to send. Sending mid-load could ship an obsolete
    // feed_uuid the backend has since removed/renamed.
    if (loadingRows.size > 0) return false;
    // Validate on the NAME fields, not the *_id fields. The id values are
    // looked up after the cascade dropdowns load, so a search-picked row
    // has names set immediately but ids only after a brief async fill.
    // The payload itself only uses feed_uuid + price_per_kg, so the ids
    // are purely UI-state — gating on names is the right semantic.
    return items.some(
      (item) =>
        item.feed_uuid !== null &&
        !!item.feed_type_name &&
        !!item.category_name &&
        item.price_per_kg !== null &&
        (!isEvaluation || item.quantity_kg !== null)
    );
  };

  const handleGenerateClick = () => {
    const incomplete = items
      .filter(
        (item) =>
          (item.feed_type_name || item.category_name) &&
          !(
            item.feed_uuid !== null &&
            item.price_per_kg !== null &&
            (!isEvaluation || item.quantity_kg !== null)
          )
      )
      .map((item) => item.feed_type_name || item.sub_category_name || `Feed ${items.indexOf(item) + 1}`);
    if (incomplete.length > 0) {
      setIncompleteFeedNames(incomplete);
      setShowIncompleteFeedsDialog(true);
      return;
    }
    // Y3 — block generate when no Forage feed is selected. Apply to both
    // recommendation AND evaluation modes per the user's spec. A "Forage"
    // means at least one row with feed_type_name === "Forage" AND a
    // populated feed_uuid (i.e. actually picked, not just typed).
    const hasForage = items.some(
      (item) => item.feed_type_name === "Forage" && item.feed_uuid !== null
    );
    if (!hasForage) {
      setShowNoForageDialog(true);
      return;
    }
    generateReport();
  };

  const generateReport = async () => {
    if (!cattleInfo || !user) return;
    setIsLoading(true);
    try {
      let res;
      const validItems = items.filter(
        (item) => item.feed_uuid !== null && item.price_per_kg !== null
      );

      const simulationId = cattleInfo.simulation_name;
      const cattlePayload = toCattleInfoPayload(cattleInfo);

      if (isEvaluation) {
        res = await evaluateDiet({
          user_id: user.id,
          country_id: cattleInfo.country_id,
          currency: user.currency || "USD",
          simulation_id: simulationId,
          cattle_info: cattlePayload,
          feed_evaluation: validItems.map((item) => ({
            feed_id: item.feed_uuid!,
            quantity_as_fed: item.quantity_kg ?? 0,
            price_per_kg: item.price_per_kg!,
          })),
        });
        setReportData({ ...res.data, mode: "evaluation" });
      } else {
        res = await recommendDiet({
          user_id: user.id,
          country_id: cattleInfo.country_id,
          simulation_id: simulationId,
          cattle_info: cattlePayload,
          feed_selection: validItems.map((item) => {
            // Y3 §1.1.2 — only include bounds when the toggle is ON AND
            // the corresponding side has a value. Blank min → omit min;
            // blank max → omit max; toggle off → omit both. Backend
            // §2.4 reads these and overrides default constraints.
            // TODO(maria-y3): confirm canonical key names.
            const base: { feed_id: string; price_per_kg: number; min_kg_per_day?: number; max_kg_per_day?: number } = {
              feed_id: item.feed_uuid!,
              price_per_kg: item.price_per_kg!,
            };
            if (item.inclusion_limits_enabled) {
              if (item.min_kg_per_day != null) base.min_kg_per_day = item.min_kg_per_day;
              if (item.max_kg_per_day != null) base.max_kg_per_day = item.max_kg_per_day;
            }
            return base;
          }),
          // Android always sends base_thresholds; merge user limits over defaults
          base_thresholds: { ...DEFAULT_BASE_THRESHOLDS, ...limits },
        });
        setReportData({ ...res.data, mode: "recommendation" });
      }
      setDietLimits(limits);
      router.push("/report");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate report";
      showSnackbar(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const updateLimit = (key: keyof DietLimits, val: string) => {
    setLimits((prev) => {
      const next = { ...prev };
      if (val) {
        next[key] = Number(val);
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const btnBase = {
    fontFamily: "Nunito, sans-serif",
    fontWeight: 700,
    fontSize: 16,
    borderRadius: 12,
    padding: "10px 16px",
    cursor: "pointer",
    transition: "all 0.15s",
  } as const;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Feed Selection" onBack={() => router.back()} />

      {/* Custom buttons row */}
      <div className="flex gap-3 px-4 pt-4">
        <button
          onClick={() => setShowLimitsModal(true)}
          disabled={isEvaluation}
          style={{
            ...btnBase,
            flex: 1,
            backgroundColor: "transparent",
            color: isEvaluation ? "#999999" : "#064E3B",
            border: `2px solid ${isEvaluation ? "#D3D3D3" : "#064E3B"}`,
          }}
        >
          Custom Diet Limits
        </button>
        <button
          onClick={openCustomFeedModal}
          style={{
            ...btnBase,
            flex: 1,
            backgroundColor: "#064E3B",
            color: "white",
            border: "none",
          }}
        >
          Custom Feed
        </button>
      </div>

      {/* Radio group: Diet Recommendation | Diet Evaluation.
          Matches Android rg_feed_selection_type which is a horizontal
          RadioGroup with weightSum=2 + each RadioButton weight=1 — so
          each radio lines up under the button above it (Recommendation
          under Custom Diet Limits, Evaluation under Custom Feed). */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-1">
        {(["recommendation", "evaluation"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFeedSelectionType(mode)}
            className="flex items-center gap-2"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, justifyContent: "flex-start" }}
          >
            {/* Radio button */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${feedSelectionType === mode ? "#064E3B" : "#E2E8F0"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {feedSelectionType === mode && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#064E3B",
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 14,
                fontWeight: feedSelectionType === mode ? 700 : 400,
                color: feedSelectionType === mode ? "#064E3B" : "#6D6D6D",
                whiteSpace: "nowrap",
              }}
            >
              {mode === "recommendation" ? "Diet Recommendation" : "Diet Evaluation"}
            </span>
          </button>
        ))}
      </div>

      {/* Y3 §1.1.1 — single page-level search. The look is a premium
          elevated card with a green icon-badge — bigger, more obviously
          interactive than the previous flat pill. Tapping any FeedRow
          marks it as the active target (dark-green ring + "Selected"
          pill on the card); the badge + border flip to crayola_green
          while a target is active so the user can see the link between
          the bar and the highlighted card. */}
      <div ref={searchContainerRef} className="px-3 pt-4 pb-1" style={{ position: "relative" }}>
        {/* Tiny section header — pulls the search bar out of the noise
            of the buttons above and gives it a clear identity. */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span
            style={{
              fontFamily: "Nunito, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              color: "#064E3B",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Find Feeds
          </span>
          {activeRowId && (
            <button
              type="button"
              onClick={() => {
                // Smooth-scroll to the selected card so the user can see
                // exactly which row they've targeted. block:"center" keeps
                // it nicely framed inside the scrolling feed list.
                const el = document.getElementById(`feed-card-${activeRowId}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 13,
                fontWeight: 800,
                color: "#064E3B",
                backgroundColor: "#E4F7EF",
                padding: "7px 14px",
                borderRadius: 60,
                letterSpacing: 0.2,
                border: "1.5px solid #1CA069",
                cursor: "pointer",
                minHeight: 32,
                display: "inline-flex",
                alignItems: "center",
                boxShadow: "0 2px 6px rgba(28,160,105,0.18)",
              }}
              aria-label="Scroll to selected card"
            >
              {(() => {
                const idx = items.findIndex((it) => it.id === activeRowId);
                return idx >= 0 ? `↓ Jump to Feed ${idx + 1}` : "↓ Jump to card";
              })()}
            </button>
          )}
        </div>

        <div
          className="flex items-center rounded-2xl"
          style={{
            backgroundColor: "#FFFFFF",
            border: `1.5px solid ${searchOpen ? "#064E3B" : activeRowId ? "#1CA069" : "#DCE0E4"}`,
            boxShadow: searchOpen
              ? "0 6px 20px rgba(6,78,59,0.16), 0 2px 4px rgba(6,78,59,0.06)"
              : "0 2px 8px rgba(0,0,0,0.05)",
            transition: "border-color 0.18s ease, box-shadow 0.18s ease",
            padding: 6,
            gap: 10,
          }}
        >
          {/* Icon badge — accent square that flips dark-green on focus.
              Makes the search affordance obvious from across the page. */}
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: searchOpen ? "#064E3B" : activeRowId ? "#1CA069" : "#E4F7EF",
              transition: "background-color 0.18s ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke={searchOpen || activeRowId ? "#FFFFFF" : "#064E3B"} strokeWidth="2.2" />
              <path d="M16.5 16.5L21 21" stroke={searchOpen || activeRowId ? "#FFFFFF" : "#064E3B"} strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => searchQuery.trim() && setSearchOpen(true)}
            placeholder={activeRowId ? "Search to fill the selected card…" : "Search feeds — corn, silage, soybean…"}
            className="flex-1 border-none focus:outline-none"
            style={{
              backgroundColor: "transparent",
              color: "#231F20",
              fontFamily: "Nunito, sans-serif",
              fontSize: 15,
              fontWeight: 500,
              padding: "8px 0",
              minWidth: 0,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
              aria-label="Clear search"
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 30,
                height: 30,
                background: "#F1F5F9",
                border: "none",
                borderRadius: 9,
                cursor: "pointer",
                color: "#6D6D6D",
                marginRight: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Tap-to-target hint — always visible. Flips to a green
            confirmation line once a card is selected. */}
        <div
          className="flex items-center gap-2 mt-2.5 ml-1"
          style={{ fontFamily: "Nunito, sans-serif", fontSize: 12.5, color: activeRowId ? "#064E3B" : "#6D6D6D", fontWeight: activeRowId ? 700 : 500 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            {activeRowId ? (
              <>
                <circle cx="12" cy="12" r="10" fill="#1CA069" />
                <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            )}
          </svg>
          <span>
            {activeRowId
              ? "Selected card will receive the next search result"
              : "Tip — tap a feed card below to choose where the result will go"}
          </span>
        </div>

        {searchOpen && searchQuery.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 12,
              right: 12,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              boxShadow: "0 10px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)",
              maxHeight: 320,
              overflowY: "auto",
              zIndex: 50,
              border: "1px solid #E4F7EF",
            }}
          >
            {isSearching ? (
              <div style={{ padding: "12px 14px", color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{ padding: "12px 14px", color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                No matches yet. (Search backend coming soon.)
              </div>
            ) : (
              searchResults.map((r, i) => (
                <button
                  key={`${r.feed_uuid}_${i}`}
                  type="button"
                  onClick={() => applySearchResult(r)}
                  className="w-full text-left"
                  style={{
                    background: i % 2 === 1 ? "#E4F7EF" : "#FFFFFF",
                    border: "none",
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "block",
                    fontFamily: "Nunito, sans-serif",
                  }}
                >
                  {/* i18n V2 — render display_* (translated, English fallback). */}
                  <p style={{ color: "#231F20", fontSize: 14, fontWeight: 700, margin: 0 }}>{r.display_name ?? r.feed_name}</p>
                  <p style={{ color: "#6D6D6D", fontSize: 12, margin: "2px 0 0" }}>{(r.display_type ?? r.feed_type)} · {(r.display_category ?? r.feed_category)}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2" style={{ paddingBottom: 100 }}>
        <div className="space-y-3">
          {items.map((item, index) => (
            // id="feed-card-<id>" is the scroll target for the
            // "↓ JUMP TO CARD" pill in the search header.
            <div key={item.id} id={`feed-card-${item.id}`} style={{ scrollMarginTop: 12 }}>
              <FeedRow
                item={item}
                index={index}
                showQuantity={isEvaluation}
                currencySymbol={currencySymbol}
                isActive={activeRowId === item.id}
                onActivate={setActiveRowId}
                onCascadeLoading={handleCascadeLoading}
                onJumpToSearch={handleJumpToSearch}
                onUpdate={updateItem}
                onDelete={deleteItem}
              />
            </div>
          ))}
        </div>

        {/* Add More Feed button (dashed border) */}
        <button
          onClick={addFeed}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl mt-3 mb-3"
          style={{
            border: "2px dashed #064E3B",
            backgroundColor: "transparent",
            color: "#064E3B",
            fontFamily: "Nunito, sans-serif",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          <IcAddFeed size={20} color="#064E3B" />
          Add More Feed
        </button>
      </div>

      {/* Fixed bottom Generate button */}
      <div
        className="px-4 py-4"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "min(100vw, 480px)",
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
          zIndex: 30,
        }}
      >
        <button
          onClick={handleGenerateClick}
          disabled={!isValid() || isLoading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base"
          style={{
            backgroundColor: isValid() && !isLoading ? "#064E3B" : "#D3D3D3",
            color: isValid() && !isLoading ? "#FFFFFF" : "#999999",
            border: "none",
            fontFamily: "Nunito, sans-serif",
            cursor: isValid() && !isLoading ? "pointer" : "not-allowed",
            transition: "background-color 0.2s",
          }}
        >
          {/* Button text/icon stays unchanged while loading — the progress
              UI lives in the GeneratingReportDialog overlay below, matching
              Android dialog_generating_report (a modal MaterialAlertDialog
              shown for the duration of the API call). */}
          <span>
            {loadingRows.size > 0
              ? "Loading feed data…"
              : isEvaluation
                ? "Get Evaluation"
                : "Generate Recommendation"}
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4.5 9H13.5M10 5.5L13.5 9L10 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Modal "Generating your report" dialog while recommendDiet /
          evaluateDiet is in flight. Mirrors Android dialog_generating_report. */}
      {isLoading && <GeneratingReportDialog />}

      {/* Custom Feed Modal — confined to the 480px centered column so the
          bottom sheet does not span the entire desktop viewport. */}
      {showCustomFeedModal && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCustomFeedModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
            style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            {/* Drag handle (matches Android view_drag_handle) */}
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>

            {/* Title — matches Android DialogFeedDetails tv_title:
                "Add Custom Feed" for isAdd=true, "Edit Nutritional Information"
                for isAdd=false. Centered, bold, 20sp, dark_aquamarine_green. */}
            <div className="relative mb-4">
              <h3
                className="text-center font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
              >
                Add Custom Feed
              </h3>
              <button
                onClick={() => setShowCustomFeedModal(false)}
                style={{ position: "absolute", right: 0, top: 0, background: "none", border: "none", cursor: "pointer" }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Separator line below title (matches Android view_separator_feed_details) */}
            <div className="mb-4" style={{ height: 1, backgroundColor: "#E2E8F0" }} />

            {/* "Feed Details" expand/collapse header (matches Android cvExpandFeedDetails).
                Icon mirrors Android drawables: minus when expanded, plus when collapsed. */}
            <button
              onClick={() => setFeedDetailsExpanded((p) => !p)}
              className="w-full flex items-center justify-between mb-3"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              <span className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                Feed Details
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                {!feedDetailsExpanded && (
                  <path d="M9 3v12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>

            {feedDetailsExpanded && (
            <>
            {/* Feed Type — first required field (no Country in Android end-user UI) */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Feed Type<span style={{ color: "#FC2E20" }}> *</span>
            </p>
            <div className="relative mb-3">
              {loadingCustomTypes ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: "#F1F5F9", opacity: !user?.country_id ? 0.6 : 1 }}
                >
                  <CustomSelect
                    transparentTrigger
                    value={customFeedForm.feed_type}
                    onChange={handleCustomTypeChange}
                    disabled={!user?.country_id}
                    placeholder="Select feed type"
                    options={customFeedTypes.map((t) => ({ value: t, label: t }))}
                  />
                </div>
              )}
            </div>

            {/* Feed Category — gated on feed type */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Feed Category<span style={{ color: "#FC2E20" }}> *</span>
            </p>
            <div className="relative mb-3">
              {loadingCustomCats ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: !customFeedForm.feed_type ? "#EBEAEA" : "#F1F5F9",
                    opacity: !customFeedForm.feed_type ? 0.6 : 1,
                  }}
                >
                  <CustomSelect
                    transparentTrigger
                    value={customFeedForm.feed_category}
                    onChange={(v) => setCustomFeedForm((p) => ({ ...p, feed_category: v }))}
                    disabled={!customFeedForm.feed_type}
                    placeholder={!customFeedForm.feed_type ? "Select type first" : "Select category"}
                    options={customFeedCategories.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              )}
            </div>

            {/* Feed Name — gated on category. Android DialogFeedDetails
                also shows a user-name prefix (e.g. "John-") via
                PrefsManager.getUserNamePrefix(). We render the same. */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Feed Name<span style={{ color: "#FC2E20" }}> *</span>
            </p>
            <div
              className="flex items-center rounded-xl mb-4"
              style={{
                backgroundColor: !customFeedForm.feed_category ? "#EBEAEA" : "#F1F5F9",
                opacity: !customFeedForm.feed_category ? 0.6 : 1,
              }}
            >
              <span
                className="pl-4 pr-1 text-sm"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                {user?.name ? `${user.name.split(" ")[0]}-` : ""}
              </span>
              <input
                type="text"
                value={customFeedForm.feed_name}
                onChange={(e) => setCustomFeedForm((p) => ({ ...p, feed_name: e.target.value }))}
                disabled={!customFeedForm.feed_category}
                className="flex-1 bg-transparent px-1 py-3 text-sm border-none focus:outline-none"
                style={{
                  color: "#231F20",
                  fontFamily: "Nunito, sans-serif",
                  cursor: !customFeedForm.feed_category ? "not-allowed" : "text",
                }}
              />
            </div>
            </>
            )}

            {/* "Nutritional Information" expand/collapse header
                (matches Android cvExpandNutritionalInformation).
                Icon mirrors Android drawables: minus when expanded, plus when collapsed. */}
            <button
              onClick={() => setNutritionalInfoExpanded((p) => !p)}
              className="w-full flex items-center justify-between mb-3"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              <span className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                Nutritional Information
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                {!nutritionalInfoExpanded && (
                  <path d="M9 3v12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>

            {nutritionalInfoExpanded && (() => {
              // Match Android DialogFeedDetails: layout is chosen by feedCategory.
              // Before category is selected, default to General (matches Android
              // initUi where layoutNutrientInfoGeneral.root.visibility = VISIBLE).
              const layout = getNutrientLayout(customFeedForm.feed_category);
              const fields =
                layout === "additive" ? NUTRIENT_FIELDS_ADDITIVE :
                layout === "mineral" ? NUTRIENT_FIELDS_MINERAL :
                NUTRIENT_FIELDS_GENERAL;
              return (
                <>
                  <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                    Nutrient Composition (%)
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {fields.map((f) => (
                      <CustomFeedNutrientInput
                        key={f.key}
                        label={f.label}
                        value={customFeedForm[f.key]}
                        onChange={(v) => setCustomFeedForm((p) => ({ ...p, [f.key]: v }))}
                      />
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Submit — Android btn_submit. Disabled (light_gray_new bg +
                spanish_gray text) until ALL four required fields are filled. */}
            {(() => {
              const ready = !!user?.country_id && !!customFeedForm.feed_type && !!customFeedForm.feed_category && customFeedForm.feed_name.trim() !== "" && !isSavingCustom;
              return (
                <button
                  onClick={handleSaveCustomFeed}
                  disabled={!ready}
                  className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: ready ? "#064E3B" : "#D3D3D3",
                    color: ready ? "white" : "#999",
                    border: "none",
                    fontFamily: "Nunito, sans-serif",
                    cursor: ready ? "pointer" : "not-allowed",
                  }}
                >
                  {isSavingCustom ? (
                    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                    </svg>
                  ) : "Submit"}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Incomplete Feeds Dialog — confined to centered column */}
      {showIncompleteFeedsDialog && (
        <div
          className="fixed top-0 h-full z-[100] flex items-center justify-center px-4"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div className="bg-white w-full max-w-xs" style={{ borderRadius: 16, paddingBottom: 30 }}>
            {/* Orange warning icon pill */}
            <div className="flex justify-center" style={{ marginTop: 30 }}>
              <div
                className="flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,152,0,0.15)", borderRadius: 60, padding: 14 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#FF9800" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" stroke="#FF9800" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            {/* Title */}
            <p
              className="text-center font-bold"
              style={{ color: "#064E3B", fontSize: 20, fontFamily: "Nunito, sans-serif", margin: "20px 16px 0" }}
            >
              Incomplete Feeds
            </p>
            {/* Description */}
            <p
              className="text-center"
              style={{ color: "#6D6D6D", fontSize: 16, fontFamily: "Nunito, sans-serif", margin: "16px 16px 0", lineHeight: 1.5 }}
            >
              The following feeds have missing nutritional data and will be automatically discarded from the formulation:
            </p>
            {/* Honeydew card with feed names */}
            <div
              style={{
                backgroundColor: "#F0FDF4",
                borderRadius: 20,
                padding: 16,
                margin: "16px 16px 0",
                border: "1px solid rgba(5,188,109,0.15)",
              }}
            >
              {incompleteFeedNames.map((name, i) => (
                <p
                  key={i}
                  className="font-bold"
                  style={{
                    color: "#1CA069",
                    fontFamily: "Nunito, sans-serif",
                    marginTop: i > 0 ? 6 : 0,
                    lineHeight: 1.6,
                  }}
                >
                  • {name}
                </p>
              ))}
            </div>
            {/* Proceed question */}
            <p
              className="text-center"
              style={{ color: "#6D6D6D", fontSize: 16, fontFamily: "Nunito, sans-serif", margin: "30px 12px 0" }}
            >
              Would you like to proceed?
            </p>
            {/* No, Review button */}
            <button
              onClick={() => setShowIncompleteFeedsDialog(false)}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 32px)",
                backgroundColor: "#EF6464",
                color: "white",
                borderRadius: 60,
                padding: "14px 0",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
                cursor: "pointer",
                margin: "30px 16px 0",
              }}
            >
              No, Review
            </button>
            {/* Yes, Proceed button */}
            <button
              onClick={() => { setShowIncompleteFeedsDialog(false); generateReport(); }}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 32px)",
                backgroundColor: "#064E3B",
                color: "white",
                borderRadius: 60,
                padding: "14px 0",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
                cursor: "pointer",
                margin: "20px 16px 0",
              }}
            >
              Yes, Proceed
            </button>
          </div>
        </div>
      )}

      {/* No-Forage Dialog — Y3 requirement. Same visual language as the
          Incomplete Feeds dialog so users recognise the pattern. */}
      {showNoForageDialog && (
        <div
          className="fixed top-0 h-full z-[100] flex items-center justify-center px-4"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div className="bg-white w-full max-w-xs" style={{ borderRadius: 16, paddingBottom: 30 }}>
            <div className="flex justify-center" style={{ marginTop: 30 }}>
              <div
                className="flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,152,0,0.15)", borderRadius: 60, padding: 14 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#FF9800" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" stroke="#FF9800" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <p
              className="text-center font-bold"
              style={{ color: "#064E3B", fontSize: 20, fontFamily: "Nunito, sans-serif", margin: "20px 16px 0" }}
            >
              Forage Required
            </p>
            <p
              className="text-center"
              style={{ color: "#6D6D6D", fontSize: 16, fontFamily: "Nunito, sans-serif", margin: "16px 16px 0", lineHeight: 1.5 }}
            >
              Add at least one <span style={{ color: "#1CA069", fontWeight: 700 }}>Forage</span> feed
              {" "}before generating a {isEvaluation ? "diet evaluation" : "recommendation"}.
              Forages are the backbone of a balanced ration — the optimizer
              needs one to produce a sensible result.
            </p>
            <button
              onClick={() => setShowNoForageDialog(false)}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 32px)",
                backgroundColor: "#064E3B",
                color: "white",
                borderRadius: 60,
                padding: "14px 0",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
                cursor: "pointer",
                margin: "30px 16px 0",
              }}
            >
              OK, Add a Forage
            </button>
          </div>
        </div>
      )}

      {/* Custom Diet Limits Modal (bottom sheet) — confined to centered column */}
      {showLimitsModal && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLimitsModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-base font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
              >
                Custom Diet Limits
              </h3>
              <button
                onClick={() => setShowLimitsModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {LIMIT_ROWS.map(({ label, key, min, max }) => {
              const val = limits[key];
              const outOfRange = val != null && (val < min || val > max);
              return (
                <div key={key} className="mb-4">
                  <p
                    className="text-xs font-bold uppercase mb-2"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  >
                    {label}
                  </p>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="—"
                    min={min}
                    max={max}
                    step="0.1"
                    value={val ?? ""}
                    onChange={(e) => updateLimit(key, e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                    style={{
                      backgroundColor: outOfRange ? "#FEC5BB" : "#F1F5F9",
                      color: "#231F20",
                      fontFamily: "Nunito, sans-serif",
                    }}
                  />
                  <p
                    className="text-xs mt-1 ml-1"
                    style={{
                      color: outOfRange ? "#E44A4A" : "#6D6D6D",
                      fontFamily: "Nunito, sans-serif",
                    }}
                  >
                    {outOfRange ? `Value must be between ${min} and ${max}` : `Range ${min} – ${max}`}
                  </p>
                </div>
              );
            })}

            {(() => {
              // Y3 QA matrix: block Apply Limits when any field is out
              // of its declared range OR when every field is empty (the
              // modal exists to *set* at least one custom limit — if the
              // user submits with nothing filled, the call is pointless).
              const anyOutOfRange = LIMIT_ROWS.some(({ key, min, max }) => {
                const v = limits[key];
                return v != null && (v < min || v > max);
              });
              const anyFilled = LIMIT_ROWS.some(({ key }) => limits[key] != null);
              const cantApply = anyOutOfRange || !anyFilled;
              return (
                <button
                  onClick={() => {
                    if (anyOutOfRange) {
                      showSnackbar("Please correct out-of-range values before applying", "error");
                      return;
                    }
                    if (!anyFilled) {
                      showSnackbar("Enter at least one limit before applying", "info");
                      return;
                    }
                    setDietLimits(limits);
                    setShowLimitsModal(false);
                  }}
                  disabled={cantApply}
                  className="w-full py-4 rounded-xl font-bold text-base mt-2"
                  style={{
                    backgroundColor: cantApply ? "#D3D3D3" : "#064E3B",
                    color: cantApply ? "#999999" : "white",
                    border: "none",
                    fontFamily: "Nunito, sans-serif",
                    cursor: cantApply ? "not-allowed" : "pointer",
                  }}
                >
                  Apply Limits
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
