"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchFeeds, type FeedSearchResult } from "@/lib/api";
import { FOCUS_AFTER_SCROLL_MS, SEARCH_DEBOUNCE_MS } from "@/lib/ui-timings";

/**
 * Feed Selection's single page-level feed search (Y3 §1.1.1): debounced
 * query, results, the open/closed dropdown (closes on outside click) and the
 * "jump to search" shortcut FeedRow cards use. Split out of
 * feed-selection/page.tsx (audit B-17).
 */
export function useFeedSearch(user: { id: string; country_id: string } | null) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FeedSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const userId = user?.id;
  const countryId = user?.country_id;

  // Debounced search. `stale` flips when the query changes: a slow earlier
  // response must not overwrite the results for what the user has typed
  // since (audit B-07).
  useEffect(() => {
    if (!searchQuery.trim() || !userId || !countryId) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    let stale = false;
    const timer = setTimeout(() => {
      searchFeeds(searchQuery.trim(), countryId, userId)
        .then((res) => {
          if (!stale) setSearchResults(res.data ?? []);
        })
        .catch(() => {
          if (!stale) setSearchResults([]);
        })
        .finally(() => {
          if (!stale) setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchQuery, userId, countryId]);

  // Close the result dropdown on an outside click.
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

  // Per-card "Search to fill": scroll the bar into view, then focus it (after
  // the scroll, so iOS Safari's keyboard opens at the bottom, not mid-page).
  const jumpToSearch = useCallback(() => {
    searchContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), FOCUS_AFTER_SCROLL_MS);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchOpen,
    setSearchOpen,
    searchContainerRef,
    searchInputRef,
    jumpToSearch,
  };
}
