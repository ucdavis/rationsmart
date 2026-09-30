"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import FeedRow from "@/components/FeedRow";
import Toolbar from "@/components/Toolbar";
import GeneratingReportDialog from "@/components/GeneratingReportDialog";
import {
  evaluateDiet,
  recommendDiet,
  getFeedTypes,
  getFeedCategories,
  insertCustomFeed,
  checkInsertOrUpdate,
  updateCustomFeed,
  parseFeedCategoryOptions,
  parseFeedTypeOptions,
  getCountries,
  fetchFeedTaxonomyLabels,
  getDietThresholds,
  ANIMAL_CATEGORY_LABELS,
  DIET_LIMIT_LABELS,
  sortDietThresholds,
} from "@/lib/api";
import type {
  FeedItem,
  DietLimits,
  DietThresholdSpec,
  FeedSearchResult,
  FeedTaxonomyLabels,
} from "@/lib/api";
import { isForageType } from "@/lib/feed-type-aliases";
import { applyDietLimitRanges, dietLimitSpecsFromTable } from "@/lib/diet-limit-ranges";
import {
  anyNutrientInvalid,
  inclusionBoundIsInvalid,
  inclusionBoundsCrossed,
  NUTRIENT_RANGE_MESSAGE,
} from "@/lib/validators";
import { IcAddFeed, IcTune } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";
import { COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { SCROLL_AFTER_RENDER_MS } from "@/lib/ui-timings";
import { COLORS } from "@/lib/colors";
import {
  buildEvaluationRequest,
  buildRecommendationRequest,
  checkedLimits,
} from "@/lib/diet-request";
import { useFeedSearch } from "@/components/feed-selection/useFeedSearch";
import IncompleteFeedsDialog from "@/components/feed-selection/IncompleteFeedsDialog";
import NoForageDialog from "@/components/feed-selection/NoForageDialog";
import DietLimitsSheet from "@/components/feed-selection/DietLimitsSheet";
import CustomFeedSheet, { EMPTY_CUSTOM } from "@/components/feed-selection/CustomFeedSheet";
import { useLatestRef } from "@/lib/use-latest";

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

// Custom Diet Limits rows are NOT hardcoded any more. They are built from
// GET /v1/animal/diet-thresholds for the simulation's physiological state,
// which returns each limit's default, accepted range, unit, direction and
// enforcement. The old hardcoded table (ash 0–15, ee 0–7, ndf 0–100,
// starch 0–30) is gone for three reasons:
//   * min 0 is now rejected with a 422 — a zero limit degenerates the solve.
//   * ndf 100 / starch 30 exceed the lactating ceilings (60 / 26), so the
//     dialog was offering values the backend refuses.
//   * the ranges differ per state and get retuned; a copy in the client
//     drifts silently, which is the exact failure this endpoint fixes.
// When the endpoint can't be reached we DISABLE the dialog rather than fall
// back to a guess — we'd only be offering ranges we know to be wrong.

// Custom feed form — keys mirror Android FeedDetailsViewModel fields.
// Android DialogFeedDetails only shows the 13 nutrients listed below
// (Additive layout = all 13; General omits NPN; Mineral keeps only 4).

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
    setUser,
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
    setUser: s.setUser,
    showSnackbar: s.showSnackbar,
  }));

  // Use the user's currency CODE directly (PHP / INR / VND / …) so the
  // Price field label reads e.g. "Price PHP/KG", matching Android.
  const currencySymbol = user?.currency ?? "";

  // UI-label i18n — this screen (and FeedRow) resolve language from the
  // PER-SIMULATION override (cattleInfo.simulation_language), not the
  // profile-wide user.preferred_language, matching the exact priority
  // chain the feed-data i18n langProvider already uses in store.ts.
  // See src/lib/i18n-ui.ts's doc comment on the `langOverride` param.
  const t = useT(cattleInfo?.simulation_language ?? user?.preferred_language ?? "en");

  const [items, setItems] = useState<FeedItem[]>(() => {
    const stored = feedSelections.length > 0 ? [...feedSelections] : [];
    while (stored.length < 3) stored.push(createFeedItem());
    return stored;
  });
  // Mirror row edits into the persisted store. Done here rather than inside
  // the setItems updaters: updaters must be pure (StrictMode runs them twice)
  // and a store write there is a side effect (audit B-08). The initial,
  // padded-to-3 list is skipped so merely opening the screen doesn't write.
  const initialItems = useRef(items);
  useEffect(() => {
    if (items !== initialItems.current) setFeedSelections(items);
  }, [items, setFeedSelections]);

  // i18n V2 — translation dictionary for Feed Type + Feed Category
  // labels. Backend `/v1/animal/unique-feed-*` endpoints only return
  // English identity strings (no display fields), so we call
  // `/v1/animal/feed-name?country_id=…&lang=<active>` once here — that
  // endpoint returns every feed in the country, and each item carries
  // English identity + localized display for both type and category.
  // One request builds a full dict FeedRow uses to render Hindi labels
  // while keeping English identity in state.
  //
  // Re-runs when country or active language changes. The Zustand values
  // that langProvider reads are `preferred_language` (profile-scoped)
  // and `cattleInfo.simulation_language` (per-run override), so we
  // depend on both here.
  const [taxonomyLabels, setTaxonomyLabels] = useState<FeedTaxonomyLabels>({
    types: {},
    categories: {},
    feeds: {},
  });
  const simulationLanguage = cattleInfo?.simulation_language ?? null;
  const preferredLanguage = user?.preferred_language ?? null;
  useEffect(() => {
    if (!user?.country_id) return;
    let cancelled = false;
    fetchFeedTaxonomyLabels(user.country_id)
      .then((labels) => {
        if (!cancelled) {
          setTaxonomyLabels(labels);
        }
      })
      .catch(() => {
        /* silent — labels just fall back to English identity */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.country_id, simulationLanguage, preferredLanguage]);

  // Defensive resync — when the user navigates back to /cattle-info and
  // returns to /feed-selection (which unmounts + remounts this
  // component), the useState initializer above reads feedSelections
  // once from the Zustand snapshot. If Zustand hadn't fully hydrated at
  // that instant (persist hydration race — see CLAUDE.md §10.1), items
  // could pick up an empty array and the user would see their previous
  // feed selections disappear. This effect catches that on the next
  // paint by re-taking feedSelections whenever it has entries that
  // items doesn't reflect. Runs on mount + on feedSelections change.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs1 = useLatestRef({ items });
  useEffect(() => {
    const { items } = effectInputs1.current;
    // Resync local items whenever the store's feedSelections has data
    // that isn't reflected locally. Compares by feed_uuid first (final
    // selection), then by feed_type_name / category_name (partial state
    // — user picked a type + category but not the specific feed yet).
    // Without the partial-state check, partial data was silently lost on
    // navigate-away-and-back.
    if (feedSelections.length === 0) return;
    const itemsFingerprint = items
      .map((i) => `${i.feed_uuid ?? ""}|${i.feed_type_name ?? ""}|${i.category_name ?? ""}`)
      .sort()
      .join("\n");
    const storedFingerprint = feedSelections
      .map((s) => `${s.feed_uuid ?? ""}|${s.feed_type_name ?? ""}|${s.category_name ?? ""}`)
      .sort()
      .join("\n");
    // Only take from store when it has strictly more information than
    // items does — a stored entry whose fingerprint is non-empty AND
    // isn't already in the local items set. Empty (all-blank) rows
    // never trigger a resync.
    const storedHasNonEmpty = feedSelections.some(
      (s) => s.feed_uuid || s.feed_type_name || s.category_name
    );
    if (!storedHasNonEmpty) return;
    if (itemsFingerprint === storedFingerprint) return;

    // Store diverges from items and has real data — pull from store.
    const padded = [...feedSelections];
    while (padded.length < 3) padded.push(createFeedItem());
    setItems(padded);
  }, [feedSelections, effectInputs1]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  useEscapeKey(!!showLimitsModal, () => setShowLimitsModal(false));
  const [limits, setLimits] = useState<Partial<DietLimits>>(dietLimits);
  // Custom Diet Limits specs, fetched per physiological state. `null` while
  // in flight; `[]` never happens on success (the endpoint always returns all
  // eight). `limitSpecsError` holds the reason the dialog is unavailable.
  const [limitSpecs, setLimitSpecs] = useState<DietThresholdSpec[] | null>(null);
  const [limitSpecsError, setLimitSpecsError] = useState<string | null>(null);
  const [showIncompleteFeedsDialog, setShowIncompleteFeedsDialog] = useState(false);
  useEscapeKey(!!showIncompleteFeedsDialog, () => setShowIncompleteFeedsDialog(false));
  // Y3 — diet optimization / evaluation requires at least one Forage
  // ingredient. The block fires before generate when none is present.
  const [showNoForageDialog, setShowNoForageDialog] = useState(false);
  useEscapeKey(!!showNoForageDialog, () => setShowNoForageDialog(false));
  const [incompleteFeedNames, setIncompleteFeedNames] = useState<string[]>([]);

  // Custom Feed modal state
  const [showCustomFeedModal, setShowCustomFeedModal] = useState(false);
  useEscapeKey(!!showCustomFeedModal, () => setShowCustomFeedModal(false));
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
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchOpen,
    setSearchOpen,
    searchContainerRef,
    searchInputRef,
    jumpToSearch: handleJumpToSearch,
  } = useFeedSearch(user);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

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

  // Apply the picked result to the targeted row. Target priority:
  //   1. The explicitly-tapped activeRowId, if any
  //   2. The first row whose feed_uuid is still null (empty row)
  //   3. Row 0 as the final fallback
  const applySearchResult = (result: FeedSearchResult) => {
    // Resolve the target row from CURRENT state BEFORE setItems. The setItems
    // updater runs during React's render phase — i.e. AFTER the synchronous
    // setActiveRowId / snackbar calls below — so anything computed inside it
    // would still be stale here. Compute landedRowId/landedIdx up front.
    let idx = activeRowId ? items.findIndex((r) => r.id === activeRowId) : -1;
    const usedFallback = idx === -1;
    if (idx === -1) idx = items.findIndex((r) => !r.feed_uuid);
    if (idx === -1) idx = 0;
    const landedIdx = idx;
    const landedRowId = items[idx]?.id ?? null;

    setItems((prev) => {
      const next = prev.map((row) =>
        row.id === landedRowId
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
      return next;
    });
    setSearchQuery("");
    setSearchOpen(false);
    // Keep the green focus ring on the card the feed just landed in, so the
    // user can see WHICH card they filled. Previously this was cleared to
    // null, so after a search the feed appeared in the card with no
    // indication of where it went. The highlighted card also remains the
    // active search target — tap another card to retarget. Scroll it into
    // view so control visibly returns to the card once the panel closes.
    setActiveRowId(landedRowId);
    if (landedRowId) {
      const rowId = landedRowId;
      setTimeout(() => {
        document
          .getElementById(`feed-card-${rowId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, SCROLL_AFTER_RENDER_MS);
    }

    // When the user did NOT tap a card before searching, the result lands in
    // the first empty row. The ring + scroll now point there too, but keep a
    // confirming snackbar for that no-tap case.
    if (usedFallback && landedIdx >= 0) {
      showSnackbar(t("Added to FEED ${N}").replace("${N}", String(landedIdx + 1)), "success");
    }
  };

  const openCustomFeedModal = async () => {
    setCustomFeedForm(EMPTY_CUSTOM);
    setCustomFeedTypes([]);
    setCustomFeedCategories([]);
    if (!user?.country_id || !user?.id) {
      showSnackbar(t("Country info missing. Please update your profile."), "error");
      return;
    }
    setShowCustomFeedModal(true);
    setLoadingCustomTypes(true);
    try {
      const res = await getFeedTypes(user.country_id, user.id);
      const names = parseFeedTypeOptions(res.data).map((o) => o.name);
      setCustomFeedTypes(names);
    } catch {
      showSnackbar(t("Could not load feed types"), "error");
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
      const names = parseFeedCategoryOptions(res.data).map((o) => o.name);
      setCustomFeedCategories(names);
    } catch {
      showSnackbar(t("Could not load categories"), "error");
    } finally {
      setLoadingCustomCats(false);
    }
  };

  const handleSaveCustomFeed = async () => {
    if (!user?.id || !user?.country_id) return;
    if (!customFeedForm.feed_name.trim() || !customFeedForm.feed_type) {
      showSnackbar(t("Feed name and type are required"), "error");
      return;
    }
    if (
      anyNutrientInvalid(
        Object.entries(customFeedForm)
          .filter(([k]) => k.startsWith("fd_"))
          .map(([, v]) => v as string)
      )
    ) {
      showSnackbar(t(NUTRIENT_RANGE_MESSAGE), "error");
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
        // v1 backend requires fd_type/fd_category (or the *_id variants) on
        // custom-feed insert/update. The legacy backend (which Android targets
        // via InsertFeedDetails: feed_type/feed_category) did not, so Android
        // parity alone isn't enough here — we send BOTH the English-source
        // identity names under each key set. Values are the English source
        // (from getFeedTypes/getFeedCategories with lang=en), never display_*.
        fd_type: customFeedForm.feed_type,
        fd_category: customFeedForm.feed_category,
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
        const checkRes = await checkInsertOrUpdate(
          user.country_id,
          customFeedForm.feed_name.trim(),
          user.id
        );
        // v1 check endpoint returns { action: "insert"|"update", feed_id }.
        // It's UUID-based, so a name string (what we pass here) always yields
        // "insert" — the sheet is an add-flow, so that's the intended path.
        const checkData = checkRes.data;
        isUpdate = checkData?.action === "update";
        existingFeedId = checkData?.feed_id ?? "";
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
        showSnackbar(t("Custom feed updated!"), "success");
      } else {
        await insertCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_insert: true,
          feed_details: feedDetails,
        });
        showSnackbar(t("Custom feed saved! It will appear in the feed list."), "success");
      }
      setShowCustomFeedModal(false);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Failed to save custom feed"), "error");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const isEvaluation = feedSelectionType === "evaluation";

  // ─── Custom Diet Limits — discover what this animal may override ─────────
  // A "Baby Calf/Heifer" is answered with a milk-feeding schedule rather than
  // a formulated ration, so it has no editable limits at all and the endpoint
  // returns 422 for it. Hide the whole control rather than offering one that
  // can only fail.
  const animalCategory = cattleInfo?.animal_category ?? "Lactating Cow";
  const limitsApplyToAnimal = animalCategory !== "Baby Calf/Heifer";

  useEffect(() => {
    if (!limitsApplyToAnimal || !user?.id) {
      setLimitSpecs(null);
      setLimitSpecsError(null);
      return;
    }
    let cancelled = false;
    setLimitSpecs(null);
    setLimitSpecsError(null);
    getDietThresholds(animalCategory)
      .then((res) => {
        if (cancelled) return;
        const specs = res.data?.thresholds;
        if (Array.isArray(specs) && specs.length > 0) {
          // Sorted once, here, so the dialog rows and the pre-flight
          // out-of-range list read in the same (Maria's) order.
          // Ranges/defaults come from the "Constraints" sheet
          // (lib/diet-limit-ranges.ts), which wins over the endpoint's.
          setLimitSpecs(sortDietThresholds(applyDietLimitRanges(animalCategory, specs)));
        } else {
          fallBackToTable();
        }
      })
      .catch(() => {
        if (cancelled) return;
        fallBackToTable();
      });
    // Endpoint down or empty: build the rows from the sheet so the dialog
    // still works; "unavailable" only for a state the sheet doesn't cover.
    function fallBackToTable() {
      const fromTable = dietLimitSpecsFromTable(animalCategory);
      if (fromTable) setLimitSpecs(sortDietThresholds(fromTable));
      else setLimitSpecsError("Limits unavailable");
    }
    return () => {
      cancelled = true;
    };
  }, [animalCategory, limitsApplyToAnimal, user?.id]);

  const limitSpecsLoading = limitsApplyToAnimal && !limitSpecs && !limitSpecsError;
  // Evaluation doesn't run the optimizer, so limits have nothing to act on.
  const limitsDisabled = isEvaluation || !limitSpecs;

  // Range check for one limit. The endpoint gives an explicit min AND max for
  // both directions (for a ceiling `max` is the animal's own default, for the
  // `ndf_for_min` floor it's `min`), so one inclusive check covers both — and
  // it rejects 0 automatically, since every floor sits above zero.
  const limitOutOfRange = (spec: DietThresholdSpec): boolean => {
    const v = limits[spec.key];
    return v != null && (v < spec.min || v > spec.max);
  };

  // Cross-field rule the backend enforces on the model: forage NDF is part of
  // total NDF, so a floor above the ceiling is unsatisfiable by construction.
  // Only checked when the user set BOTH, matching the server-side validator.
  const ndfFloorAboveCeiling =
    limits.ndf_for_min != null && limits.ndf_max != null && limits.ndf_for_min > limits.ndf_max;

  const addFeed = () => {
    // Functional updater — see updateItem for why (avoid clobbering a
    // concurrent cascade write off a stale `items` snapshot).
    setItems((prev) => [...prev, createFeedItem()]);
  };

  const updateItem = (id: string, updates: Partial<FeedItem>) => {
    // Functional updater — NOT `items.map(...)` off the render-time closure.
    // FeedRow fires several cascade onUpdate()s asynchronously (feed_type_id,
    // category_id, sub-category fields). Two resolving close together would
    // each rebuild from the SAME stale `items` snapshot, so the later write
    // silently clobbers the earlier one's field (observed: the category
    // cascade sets category_id, then another cascade's write — built from a
    // snapshot where category_id was still null — wipes it, leaving Category
    // blank after a search pick). Deriving from `prev` makes every write see
    // the latest state, so concurrent field updates compose instead of race.
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const deleteItem = (id: string) => {
    if (items.length === 1) {
      showSnackbar(t("At least one feed item is required"), "info");
      return;
    }
    // Functional updater — see updateItem.
    setItems((prev) => prev.filter((item) => item.id !== id));
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
    // Saved Custom Diet Limits are range-checked against the per-state spec
    // before sending, so wait for it rather than send unchecked limits (or
    // silently drop them) during the brief fetch window.
    if (!isEvaluation && limitSpecsLoading && Object.keys(limits).length > 0) return false;
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
      .map((item) => {
        // Show the localized Feed Type label when we have a dict entry
        // (state stores English identity, but users see Hindi on screen).
        // Falls back to sub_category_name (which is already display-agnostic
        // — carries English but the row's Feed dropdown labels come from a
        // different endpoint that translates in place) then to "Feed N".
        const localizedType = item.feed_type_name
          ? (taxonomyLabels.types[item.feed_type_name] ?? item.feed_type_name)
          : "";
        return (
          localizedType ||
          item.sub_category_name ||
          t("Feed ${N}").replace("${N}", String(items.indexOf(item) + 1))
        );
      });
    if (incomplete.length > 0) {
      setIncompleteFeedNames(incomplete);
      setShowIncompleteFeedsDialog(true);
      return;
    }
    // Values the number inputs let through but the diet can't use (audit
    // B-14): a negative price, or — in evaluation, where the quantity IS the
    // diet — a quantity of 0 or less. A price of 0 stays allowed (own-farm
    // feed); Android has no such rules, so they only block clear typos.
    const picked = items.filter((item) => item.feed_uuid !== null);
    if (picked.some((item) => item.price_per_kg != null && item.price_per_kg < 0)) {
      showSnackbar(t("Price can't be negative."), "error");
      return;
    }
    if (isEvaluation && picked.some((item) => item.quantity_kg != null && item.quantity_kg <= 0)) {
      showSnackbar(
        t("Enter a quantity greater than 0 for every feed, or remove the feed."),
        "error"
      );
      return;
    }
    // Y3 — block generate when no Forage feed is selected. Apply to both
    // recommendation AND evaluation modes per the user's spec. A "Forage"
    // means at least one row whose feed_type_name resolves to Forage
    // (English identity OR any localized alias — see feed-type-aliases.ts)
    // AND has a populated feed_uuid (actually picked, not just typed).
    const hasForage = items.some(
      (item) => isForageType(item.feed_type_name) && item.feed_uuid !== null
    );
    if (!hasForage) {
      setShowNoForageDialog(true);
      return;
    }
    // Y3 §1.1.2 — a typed 0 in an inclusion bound is rejected by the
    // backend (`exclusiveMinimum: 0` on min_kg_asfed / max_kg_asfed). Catch
    // it here with the message that says what to do instead. We do NOT
    // coerce it to an omitted key: that would silently throw away what the
    // user asked for, which is the defect, not the fix.
    if (
      !isEvaluation &&
      items.some(
        (it) =>
          it.inclusion_limits_enabled &&
          (inclusionBoundIsInvalid(it.min_kg_per_day) || inclusionBoundIsInvalid(it.max_kg_per_day))
      )
    ) {
      showSnackbar(
        t(
          "Enter a value greater than 0, or leave the field empty for no limit. To exclude a feed, remove it from the selection."
        ),
        "error"
      );
      return;
    }
    if (
      !isEvaluation &&
      items.some(
        (it) =>
          it.inclusion_limits_enabled &&
          inclusionBoundsCrossed(it.min_kg_per_day, it.max_kg_per_day)
      )
    ) {
      showSnackbar(t("Minimum can't be more than the maximum."), "error");
      return;
    }
    // Custom Diet Limits are persisted across simulations, but the accepted
    // range is per physiological state — so a limit saved for a Lactating Cow
    // can be out of range once the user switches to a Dry Cow, and the
    // backend would reject the whole request with a 422. Say so here instead
    // of silently dropping the value (dropping it is the original defect) or
    // letting a raw validation error through.
    if (!isEvaluation && limitSpecs) {
      const invalid = limitSpecs.filter(limitOutOfRange).map((sp) => t(DIET_LIMIT_LABELS[sp.key]));
      if (invalid.length > 0 || ndfFloorAboveCeiling) {
        showSnackbar(
          t("Custom Diet Limits are out of range for ${animal} — open them and adjust.").replace(
            "${animal}",
            t(ANIMAL_CATEGORY_LABELS[animalCategory])
          ),
          "error"
        );
        return;
      }
    }
    void generateReport();
  };

  const generateReport = async () => {
    if (!cattleInfo || !user) return;
    setIsLoading(true);
    try {
      // The saved limits themselves are kept for the next run; only the
      // spec-checked subset is sent. When the spec fetch FAILED nothing
      // could be checked, so none are sent and the user is told.
      const limitsSkipped =
        limitsApplyToAnimal && !!limitSpecsError && Object.keys(limits).length > 0;

      if (isEvaluation) {
        // Evaluation prices the diet, so it needs a currency. Accounts
        // persisted before currency was stored have none: derive it from
        // the simulation's country (and remember it), or stop and say so
        // rather than silently pricing in USD (audit D-03).
        let currency = user.currency;
        if (!currency) {
          try {
            const res = await getCountries();
            currency =
              (res.data ?? []).find((c) => String(c.id) === String(cattleInfo.country_id))
                ?.currency ?? "";
            if (currency) setUser({ ...user, currency });
          } catch {
            currency = "";
          }
        }
        if (!currency) {
          showSnackbar(
            t("Your country's currency is unknown — pick your country in Profile, then try again."),
            "error"
          );
          return;
        }
        const res = await evaluateDiet(
          buildEvaluationRequest({ ...user, currency }, cattleInfo, items)
        );
        setReportData({ ...res.data, mode: "evaluation" });
      } else {
        const res = await recommendDiet(
          buildRecommendationRequest(user, cattleInfo, items, checkedLimits(limits, limitSpecs))
        );
        if (limitsSkipped) {
          showSnackbar(
            t("Diet limits unavailable — report generated with the default limits."),
            "info"
          );
        }
        setReportData({ ...res.data, mode: "recommendation" });
      }
      setDietLimits(limits);
      router.push("/report");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("Failed to generate report");
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

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Feed Selection")} onBack={() => router.back()} />

      {/* Optional tools row — these two are INDEPENDENT actions (each opens
          its own tool), NOT a mode choice. Previously they were an equal
          50/50 split with one filled + one outlined, which read as a
          "selected vs unselected" toggle — especially sitting right above the
          real Recommendation/Evaluation radio group. Now: same-weight soft
          chips, sized to content and left-aligned (not a full-width split),
          each with a decorative leading icon and a muted "Optional" caption,
          so they read as optional tools rather than a pick-one control.
          Icons are aria-hidden so each button's accessible name stays exactly
          "Custom Diet Limits" / "Custom Feed" (tests + i18n depend on it). */}
      <div className="px-4 pt-4">
        <p
          className="text-[11px] font-bold uppercase tracking-wide mb-2 ml-1"
          style={{ color: COLORS.spanishGray }}
        >
          {t("Optional")}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Custom Diet Limits — white pill, mint icon-badge (SectionCard
              aesthetic). Greyed out in evaluation mode (no optimizer to
              constrain), while the per-state ranges are still loading, and
              when they couldn't be fetched at all. Not rendered AT ALL for a
              Baby Calf/Heifer, which has no editable limits. */}
          {limitsApplyToAnimal && (
            <button
              onClick={() => setShowLimitsModal(true)}
              disabled={limitsDisabled}
              style={{
                fontWeight: 700,
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 16px 7px 7px",
                borderRadius: 999,
                backgroundColor: limitsDisabled ? COLORS.americanDiamond : COLORS.white,
                color: limitsDisabled ? COLORS.spanishGray : COLORS.darkAquamarineGreen,
                border: `1.5px solid ${limitsDisabled ? COLORS.webDivider : COLORS.gainsboro}`,
                boxShadow: limitsDisabled ? "none" : "0 1px 2px rgba(6,40,30,0.06)",
                cursor: limitsDisabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              <span
                aria-hidden="true"
                className="flex items-center justify-center"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  backgroundColor: limitsDisabled ? COLORS.webBorder : COLORS.brightGrayNew,
                  flexShrink: 0,
                }}
              >
                <IcTune
                  size={17}
                  color={limitsDisabled ? COLORS.spanishGray : COLORS.darkAquamarineGreen}
                />
              </span>
              {/* Label never changes — it's the button's accessible name and a
                translated string. Loading/unavailable is conveyed by the
                disabled state and the caption below. */}
              {t("Custom Diet Limits")}
            </button>
          )}
          {/* Custom Feed — same white-pill treatment, always enabled. */}
          <button
            onClick={openCustomFeedModal}
            style={{
              fontWeight: 700,
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 16px 7px 7px",
              borderRadius: 999,
              backgroundColor: COLORS.white,
              color: COLORS.darkAquamarineGreen,
              border: `1.5px solid ${COLORS.gainsboro}`,
              boxShadow: "0 1px 2px rgba(6,40,30,0.06)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                backgroundColor: COLORS.brightGrayNew,
                flexShrink: 0,
              }}
            >
              <IcAddFeed size={17} color={COLORS.darkAquamarineGreen} />
            </span>
            {t("Custom Feed")}
          </button>
        </div>
        {/* Say WHY the tool is unavailable instead of leaving a dead pill.
            Only shown for the fetch failure — evaluation mode already reads
            as "not applicable here" from the radio group right below. */}
        {limitsApplyToAnimal && !isEvaluation && limitSpecsError && (
          <p className="text-[11px] mt-1.5 ml-1" style={{ color: COLORS.darkSilver }}>
            {t("Diet limits unavailable — check your connection and reopen this screen.")}
          </p>
        )}
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
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              justifyContent: "flex-start",
            }}
          >
            {/* Radio button */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${feedSelectionType === mode ? COLORS.darkAquamarineGreen : COLORS.webDivider}`,
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
                    backgroundColor: COLORS.darkAquamarineGreen,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: feedSelectionType === mode ? 700 : 400,
                color: feedSelectionType === mode ? COLORS.darkAquamarineGreen : COLORS.darkSilver,
                whiteSpace: "nowrap",
              }}
            >
              {mode === "recommendation" ? t("Diet Recommendation") : t("Diet Evaluation")}
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
              fontSize: 11,
              fontWeight: 800,
              color: COLORS.darkAquamarineGreen,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            {t("Find Feeds")}
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
                fontSize: 13,
                fontWeight: 800,
                color: COLORS.darkAquamarineGreen,
                backgroundColor: COLORS.brightGrayNew,
                padding: "7px 14px",
                borderRadius: 60,
                letterSpacing: 0.2,
                border: `1.5px solid ${COLORS.crayolaGreen}`,
                cursor: "pointer",
                minHeight: 32,
                display: "inline-flex",
                alignItems: "center",
                boxShadow: "0 2px 6px rgba(28,160,105,0.18)",
              }}
              aria-label={t("Scroll to selected card")}
            >
              {(() => {
                const idx = items.findIndex((it) => it.id === activeRowId);
                return idx >= 0
                  ? t("↓ Jump to Feed ${N}").replace("${N}", String(idx + 1))
                  : t("↓ Jump to card");
              })()}
            </button>
          )}
        </div>

        <div
          className="flex items-center rounded-2xl"
          style={{
            backgroundColor: COLORS.white,
            border: `1.5px solid ${searchOpen ? COLORS.darkAquamarineGreen : activeRowId ? COLORS.crayolaGreen : COLORS.gainsboro}`,
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
              backgroundColor: searchOpen
                ? COLORS.darkAquamarineGreen
                : activeRowId
                  ? COLORS.crayolaGreen
                  : COLORS.brightGrayNew,
              transition: "background-color 0.18s ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke={searchOpen || activeRowId ? COLORS.white : COLORS.darkAquamarineGreen}
                strokeWidth="2.2"
              />
              <path
                d="M16.5 16.5L21 21"
                stroke={searchOpen || activeRowId ? COLORS.white : COLORS.darkAquamarineGreen}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            aria-label={t("Search feeds")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => searchQuery.trim() && setSearchOpen(true)}
            placeholder={
              activeRowId
                ? t("Search to fill the selected card…")
                : t("Search feeds — corn, silage, soybean…")
            }
            className="flex-1 border-none focus:outline-none"
            style={{
              backgroundColor: "transparent",
              color: COLORS.raisinBlack,
              fontSize: 15,
              fontWeight: 500,
              padding: "8px 0",
              minWidth: 0,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              aria-label={t("Clear search")}
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 30,
                height: 30,
                background: COLORS.americanDiamond,
                border: "none",
                borderRadius: 9,
                cursor: "pointer",
                color: COLORS.darkSilver,
                marginRight: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 3l8 8M11 3L3 11"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Tap-to-target hint — always visible. Flips to a green
            confirmation line once a card is selected. */}
        <div
          className="flex items-center gap-2 mt-2.5 ml-1"
          style={{
            fontSize: 12.5,
            color: activeRowId ? COLORS.darkAquamarineGreen : COLORS.darkSilver,
            fontWeight: activeRowId ? 700 : 500,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            {activeRowId ? (
              <>
                <circle cx="12" cy="12" r="10" fill={COLORS.crayolaGreen} />
                <path
                  d="M8 12.5l2.5 2.5L16 9.5"
                  stroke={COLORS.white}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 8v4M12 16h.01"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
          <span>
            {activeRowId
              ? t("Selected card will receive the next search result")
              : t("Tip — tap a feed card below to choose where the result will go")}
          </span>
        </div>

        {searchOpen && searchQuery.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 12,
              right: 12,
              backgroundColor: COLORS.white,
              borderRadius: 14,
              boxShadow: "0 10px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)",
              maxHeight: 320,
              overflowY: "auto",
              zIndex: 50,
              border: `1px solid ${COLORS.brightGrayNew}`,
            }}
          >
            {isSearching ? (
              <div
                style={{
                  padding: "12px 14px",
                  color: COLORS.darkSilver,
                  fontSize: 13,
                }}
              >
                {t("Searching…")}
              </div>
            ) : searchResults.length === 0 ? (
              <div
                style={{
                  padding: "12px 14px",
                  color: COLORS.darkSilver,
                  fontSize: 13,
                }}
              >
                {t("No matches yet. (Search backend coming soon.)")}
              </div>
            ) : (
              searchResults.map((r, i) => (
                <button
                  key={`${r.feed_uuid}_${i}`}
                  type="button"
                  onClick={() => applySearchResult(r)}
                  className="w-full text-left"
                  style={{
                    background: i % 2 === 1 ? COLORS.brightGrayNew : COLORS.white,
                    border: "none",
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  {/* i18n V2 — render display_* (translated, English fallback).
                      The English source name is appended in parentheses when
                      it differs, because the backend ALWAYS searches the
                      English name on top of the active language: a Hindi user
                      typing "corn" gets a row whose displayed name contains
                      none of the characters they typed. Showing the English
                      makes the match explain itself. Suppressed when the two
                      are equal (the English-selected case, and every custom
                      feed — those are never translated). */}
                  <p
                    style={{ color: COLORS.raisinBlack, fontSize: 14, fontWeight: 700, margin: 0 }}
                  >
                    {r.display_name ?? r.feed_name}
                    {r.feed_name_en && r.feed_name_en !== (r.display_name ?? r.feed_name) && (
                      <span style={{ color: COLORS.darkSilver, fontSize: 12, fontWeight: 400 }}>
                        {" "}
                        ({r.feed_name_en})
                      </span>
                    )}
                  </p>
                  <p style={{ color: COLORS.darkSilver, fontSize: 12, margin: "2px 0 0" }}>
                    {r.display_type ?? r.feed_type} · {r.display_category ?? r.feed_category}
                  </p>
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
                taxonomyLabels={taxonomyLabels}
              />
            </div>
          ))}
        </div>

        {/* Add More Feed button (dashed border) */}
        <button
          onClick={addFeed}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl mt-3 mb-3"
          style={{
            border: `2px dashed ${COLORS.darkAquamarineGreen}`,
            backgroundColor: "transparent",
            color: COLORS.darkAquamarineGreen,
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          <IcAddFeed size={20} color={COLORS.darkAquamarineGreen} />
          {t("Add More Feed")}
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
          maxWidth: COLUMN_WIDTH,
          backgroundColor: COLORS.white,
          borderTop: `1px solid ${COLORS.webDivider}`,
          zIndex: 30,
        }}
      >
        <button
          onClick={handleGenerateClick}
          disabled={!isValid() || isLoading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base"
          style={{
            backgroundColor:
              isValid() && !isLoading ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
            color: isValid() && !isLoading ? COLORS.white : COLORS.spanishGray,
            border: "none",
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
              ? t("Loading feed data…")
              : isEvaluation
                ? t("Get Evaluation")
                : t("Generate Recommendation")}
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M4.5 9H13.5M10 5.5L13.5 9L10 12.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Modal "Generating your report" dialog while recommendDiet /
          evaluateDiet is in flight. Mirrors Android dialog_generating_report. */}
      {isLoading && <GeneratingReportDialog />}

      {/* Custom Feed Modal — confined to the 480px centered column so the
          bottom sheet does not span the entire desktop viewport. */}
      {showCustomFeedModal && (
        <CustomFeedSheet
          customFeedCategories={customFeedCategories}
          customFeedForm={customFeedForm}
          customFeedTypes={customFeedTypes}
          feedDetailsExpanded={feedDetailsExpanded}
          handleCustomTypeChange={handleCustomTypeChange}
          handleSaveCustomFeed={handleSaveCustomFeed}
          isSavingCustom={isSavingCustom}
          loadingCustomCats={loadingCustomCats}
          loadingCustomTypes={loadingCustomTypes}
          nutritionalInfoExpanded={nutritionalInfoExpanded}
          setCustomFeedForm={setCustomFeedForm}
          setFeedDetailsExpanded={setFeedDetailsExpanded}
          setNutritionalInfoExpanded={setNutritionalInfoExpanded}
          setShowCustomFeedModal={setShowCustomFeedModal}
          t={t}
          user={user}
        />
      )}

      {/* Incomplete Feeds Dialog — confined to centered column */}
      {showIncompleteFeedsDialog && (
        <IncompleteFeedsDialog
          generateReport={generateReport}
          incompleteFeedNames={incompleteFeedNames}
          setShowIncompleteFeedsDialog={setShowIncompleteFeedsDialog}
          t={t}
        />
      )}

      {/* No-Forage Dialog — Y3 requirement. Same visual language as the
          Incomplete Feeds dialog so users recognise the pattern. */}
      {showNoForageDialog && (
        <NoForageDialog
          isEvaluation={isEvaluation}
          setShowNoForageDialog={setShowNoForageDialog}
          t={t}
        />
      )}

      {/* Custom Diet Limits Modal (bottom sheet) — confined to centered column */}
      {showLimitsModal && (
        <DietLimitsSheet
          limits={limits}
          limitSpecs={limitSpecs}
          ndfFloorAboveCeiling={ndfFloorAboveCeiling}
          limitOutOfRange={limitOutOfRange}
          updateLimit={updateLimit}
          setDietLimits={setDietLimits}
          setShowLimitsModal={setShowLimitsModal}
          showSnackbar={showSnackbar}
          t={t}
        />
      )}
    </div>
  );
}
