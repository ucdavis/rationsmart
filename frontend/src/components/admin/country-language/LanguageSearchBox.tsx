"use client";

// Country / Language — search box for the Registered Languages card.
// Filters the already-loaded list in the browser (no API call): see
// v1_Registered_Languages_Search_Decision.md, option A. Same look as the
// Feed Selection "Find Feeds" bar (FeedSearchPanel): icon badge, input, ✕.

import { useState } from "react";
import { COLORS } from "@/lib/colors";

export interface LanguageSearchBoxProps {
  query: string;
  setQuery: (q: string) => void;
  t: (source: string) => string;
}

export default function LanguageSearchBox({ query, setQuery, t }: LanguageSearchBoxProps) {
  const [focused, setFocused] = useState(false);
  // Badge + border go dark green while the admin is typing or a filter is applied,
  // so it's obvious the list below is narrowed.
  const active = focused || query !== "";
  return (
    <div className="px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.authenticWhite}` }}>
      <div
        className="flex items-center rounded-2xl"
        style={{
          backgroundColor: COLORS.white,
          border: `1.5px solid ${active ? COLORS.darkAquamarineGreen : COLORS.gainsboro}`,
          boxShadow: active
            ? "0 6px 20px rgba(6,78,59,0.16), 0 2px 4px rgba(6,78,59,0.06)"
            : "0 2px 8px rgba(0,0,0,0.05)",
          transition: "border-color 0.18s ease, box-shadow 0.18s ease",
          padding: 6,
          gap: 10,
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: active ? COLORS.darkAquamarineGreen : COLORS.brightGrayNew,
            transition: "background-color 0.18s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke={active ? COLORS.white : COLORS.darkAquamarineGreen}
              strokeWidth="2.2"
            />
            <path
              d="M16.5 16.5L21 21"
              stroke={active ? COLORS.white : COLORS.darkAquamarineGreen}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <input
          type="text"
          aria-label={t("Search languages")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("Search by name or code — Hindi, hi…")}
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
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
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
    </div>
  );
}
