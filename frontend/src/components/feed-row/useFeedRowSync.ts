"use client";

// FeedRow's bookkeeping effects: reset what described the old feed when the
// feed changes, backfill feed_type_id, and report cascade loading to the page.
// Split out of FeedRow.tsx as a hook (audit B-17).

import { useEffect, useRef } from "react";
import type { FeedItem } from "@/lib/api";
import { useLatestRef } from "@/lib/use-latest";
import type { FeedType } from "./useFeedCascade";

export interface FeedRowSyncArgs {
  item: FeedItem;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  onCascadeLoading?: (rowId: string, loading: boolean) => void;
  feedTypes: FeedType[];
  loadingTypes: boolean;
  loadingCats: boolean;
  loadingSubs: boolean;
}

export function useFeedRowSync({
  item,
  onUpdate,
  onCascadeLoading,
  feedTypes,
  loadingTypes,
  loadingCats,
  loadingSubs,
}: FeedRowSyncArgs) {
  // When the selected feed changes, everything that described the OLD feed
  // must reset, or the new feed silently inherits it (audit B-12):
  // - inclusion toggle + Min/Max, whenever the feed changes or clears;
  // - price + quantity, when one real feed is swapped for another (dropdown
  //   or a search pick over a filled row). Picking the first feed, or a
  //   cascade clearing an invalid one, leaves typed price/quantity alone.
  // The first render is skipped so a restored simulation keeps its values.
  const prevFeedUuid = useRef(item.feed_uuid);
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs5 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs5.current;
    const prev = prevFeedUuid.current;
    const swapped = prev !== item.feed_uuid;
    prevFeedUuid.current = item.feed_uuid;
    if (!swapped) return;
    const reset: Partial<FeedItem> = {};
    if (
      item.inclusion_limits_enabled ||
      item.min_kg_per_day != null ||
      item.max_kg_per_day != null
    ) {
      reset.inclusion_limits_enabled = false;
      reset.min_kg_per_day = null;
      reset.max_kg_per_day = null;
    }
    if (prev && item.feed_uuid && (item.price_per_kg != null || item.quantity_kg != null)) {
      reset.price_per_kg = null;
      reset.quantity_kg = null;
    }
    if (Object.keys(reset).length > 0) onUpdate(item.id, reset);
  }, [item.feed_uuid, effectInputs5]);

  // Backfill feed_type_id whenever the name is set but the id is null
  // and the matching id is available in `feedTypes`. The types cascade
  // above already backfills inside its .then(), but only once — if the
  // user picks a search result AFTER that fetch has finished (the common
  // case), feed_type_name is set programmatically and feed_type_id stays
  // null. isValid() gates the Generate button on feed_type_id, so without
  // this effect a search-filled row would never unlock the submit. Same
  // effect also covers simulation-history restore and any future flow
  // that updates feed_type_name without the matching id.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs6 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs6.current;
    if (item.feed_type_name && item.feed_type_id == null && feedTypes.length > 0) {
      const match = feedTypes.find((t) => t.name === item.feed_type_name);
      if (match) onUpdate(item.id, { feed_type_id: match.id });
    }
  }, [feedTypes, item.feed_type_name, item.feed_type_id, effectInputs6]);

  // Bubble per-row cascade loading state up to the parent. The parent
  // sums these across all rows so the Generate button can stay disabled
  // until history-restored data is fully resolved against the latest
  // dropdown options. Without this, a user landing from simulation
  // history could hit Generate while a stored category was still being
  // validated against the live category list, sending stale feed_uuid
  // or partially-matched values.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs7 = useLatestRef({ item, onCascadeLoading });
  useEffect(() => {
    const { item, onCascadeLoading } = effectInputs7.current;
    const loading = loadingTypes || loadingCats || loadingSubs;
    onCascadeLoading?.(item.id, loading);
  }, [loadingTypes, loadingCats, loadingSubs, effectInputs7]);

  // On unmount (row deletion), tell the parent this row is no longer
  // loading so it doesn't get stuck in the loadingRows set forever.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs8 = useLatestRef({ item, onCascadeLoading });
  useEffect(() => {
    const { item, onCascadeLoading } = effectInputs8.current;
    return () => onCascadeLoading?.(item.id, false);
  }, [effectInputs8]);
}
