"use client";

// Feed Selection rows — the list state, its mirror into the persisted
// store, the resync after navigation, per-row cascade loading and
// add / update / delete. Split out of feed-selection/page.tsx (audit B-17).

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeedTaxonomyLabels } from "@/lib/api";
import type { FeedItem, FeedTaxonomyLabels } from "@/lib/api";
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

type Snackbar = (message: string, type?: "success" | "error" | "info") => void;

export function useFeedItems(
  feedSelections: FeedItem[],
  setFeedSelections: (items: FeedItem[]) => void,
  showSnackbar: Snackbar,
  t: (s: string) => string
) {
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

  return { items, setItems, loadingRows, handleCascadeLoading, addFeed, updateItem, deleteItem };
}

/**
 * i18n V2 — localized Feed Type / Category / Feed labels for the country.
 * Re-fetched when the country or the active language changes.
 */
export function useFeedTaxonomyLabels(
  countryId: string | undefined,
  simulationLanguage: string | null,
  preferredLanguage: string | null
): FeedTaxonomyLabels {
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
  useEffect(() => {
    if (!countryId) return;
    let cancelled = false;
    fetchFeedTaxonomyLabels(countryId)
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
  }, [countryId, simulationLanguage, preferredLanguage]);

  return taxonomyLabels;
}
