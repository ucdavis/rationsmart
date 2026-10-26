"use client";

// Feed Selection — the page-level "Find Feeds" search: header with the
// jump-to-card pill, the search input and the results popup. Split out of
// feed-selection/page.tsx (audit B-17). State lives in useFeedSearch.

import type { FeedItem, FeedSearchResult } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import type { useFeedSearch } from "./useFeedSearch";

type Search = ReturnType<typeof useFeedSearch>;

export interface FeedSearchPanelProps {
  search: Search;
  /** The card the next result will land in, if the user tapped one. */
  activeRowId: string | null;
  items: FeedItem[];
  onPick: (result: FeedSearchResult) => void;
  t: (source: string) => string;
}

/* Y3 §1.1.1 — single page-level search. The look is a premium
      elevated card with a green icon-badge — bigger, more obviously
      interactive than the previous flat pill. Tapping any FeedRow
      marks it as the active target (dark-green ring + "Selected"
      pill on the card); the badge + border flip to crayola_green
      while a target is active so the user can see the link between
      the bar and the highlighted card. */
export default function FeedSearchPanel({
  search,
  activeRowId,
  items,
  onPick,
  t,
}: FeedSearchPanelProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchOpen,
    setSearchOpen,
    searchContainerRef,
    searchInputRef,
  } = search;
  return (
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
                onClick={() => onPick(r)}
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
                <p style={{ color: COLORS.raisinBlack, fontSize: 14, fontWeight: 700, margin: 0 }}>
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
  );
}
