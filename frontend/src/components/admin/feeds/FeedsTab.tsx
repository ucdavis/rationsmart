"use client";

// Admin Feeds — Feeds tab (Android fragment_feed.xml): name search, list, edit / delete and the add button.
// Split out of admin/feeds/page.tsx (audit B-17); the page owns the state
// and every create / delete handler.

import type { Dispatch, SetStateAction } from "react";
import { COLORS } from "@/lib/colors";
import { SkeletonCard, type AdminFeed } from "./shared";

export interface FeedsTabProps {
  deletingFeedId: string | null;
  filteredFeeds: AdminFeed[];
  isLoading: boolean;
  openAddFeed: () => void;
  openEditFeed: (feed: AdminFeed) => void;
  searchQuery: string;
  setConfirmDeleteFeed: Dispatch<SetStateAction<AdminFeed | null>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  t: (source: string) => string;
}

export default function FeedsTab({
  deletingFeedId,
  filteredFeeds,
  isLoading,
  openAddFeed,
  openEditFeed,
  searchQuery,
  setConfirmDeleteFeed,
  setSearchQuery,
  t,
}: FeedsTabProps) {
  return (
    <>
      {/* Search by feed name — matches Android til_search_feed */}
      <div className="px-3 pt-3">
        <div
          className="flex items-center"
          style={{
            backgroundColor: COLORS.americanDiamond,
            borderRadius: 16,
            padding: "10px 14px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke={COLORS.darkSilver} strokeWidth="2" />
            <path
              d="M21 21l-4.35-4.35"
              stroke={COLORS.darkSilver}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            aria-label={t("Search by feed name")}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search by feed name")}
            className="flex-1 bg-transparent border-none focus:outline-none ml-2"
            style={{ color: COLORS.raisinBlack, fontSize: 14 }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
        ) : filteredFeeds.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-base" style={{ color: COLORS.spanishGray }}>
              {searchQuery ? t("No feeds match your search") : t("No feeds found")}
            </p>
          </div>
        ) : (
          filteredFeeds.map((f, idx) => (
            <div
              key={f.feed_id ?? idx}
              className="mx-3 my-2 bg-white"
              style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", padding: 16 }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0" style={{ marginRight: 10 }}>
                  <p
                    className="font-bold truncate"
                    style={{ color: COLORS.raisinBlack, fontSize: 20 }}
                  >
                    {f.fd_name || t("N/A")}
                  </p>
                  <p
                    className="uppercase"
                    style={{
                      color: COLORS.darkAquamarineGreen,
                      fontSize: 14,
                      marginTop: 10,
                    }}
                  >
                    {f.fd_category || t("N/A")}
                  </p>
                  <p
                    style={{
                      color: COLORS.darkSilver,
                      fontSize: 14,
                      marginTop: 10,
                    }}
                  >
                    {f.fd_type || t("N/A")}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {/* Edit: go_green_15 bg + dark_aquamarine_green tint,
                      icon = ic_edit_nutrient_info */}
                  <button
                    onClick={() => openEditFeed(f)}
                    className="flex items-center justify-center"
                    style={{
                      borderRadius: 60,
                      backgroundColor: COLORS.goGreen15,
                      padding: 10,
                      border: "none",
                      cursor: "pointer",
                    }}
                    aria-label={t("Edit feed")}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 960 960"
                      fill={COLORS.darkAquamarineGreen}
                    >
                      <path d="M216,744h51l375,-375 -51,-51 -375,375v51ZM180.18,816q-15.18,0 -25.68,-10.3 -10.5,-10.29 -10.5,-25.52v-86.85q0,-14.33 5,-27.33 5,-13 16,-24l477,-477q11,-11 23.84,-16 12.83,-5 27,-5 14.16,0 27.16,5t24,16l51,51q11,11 16,24t5,26.54q0,14.45 -5.02,27.54T795,318L318,795q-11,11 -23.95,16t-27.24,5h-86.63ZM744,267l-51,-51 51,51ZM616.05,343.95L591,318l51,51 -25.95,-25.05Z" />
                    </svg>
                  </button>
                  {/* Delete: carmine_pink_20 bg + red_ryb tint,
                      icon = ic_delete */}
                  <button
                    onClick={() => setConfirmDeleteFeed(f)}
                    disabled={deletingFeedId === f.feed_id}
                    className="flex items-center justify-center"
                    style={{
                      borderRadius: 60,
                      backgroundColor: "rgba(228,74,74,0.2)",
                      padding: 10,
                      border: "none",
                      cursor: "pointer",
                    }}
                    aria-label={t("Delete feed")}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.redRyb}>
                      <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button — Android btn_add_feed (dark_aquamarine_green
          bg, white +, 56dp, bottom-right inside the centered column). */}
      <button
        onClick={openAddFeed}
        aria-label={t("Add feed")}
        style={{
          position: "fixed",
          bottom: 20,
          right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.darkAquamarineGreen,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 960 960" fill={COLORS.white}>
          <path d="M440,520L240,520q-17,0 -28.5,-11.5T200,480q0,-17 11.5,-28.5T240,440h200v-200q0,-17 11.5,-28.5T480,200q17,0 28.5,11.5T520,240v200h200q17,0 28.5,11.5T760,480q0,17 -11.5,28.5T720,520L520,520v200q0,17 -11.5,28.5T480,760q-17,0 -28.5,-11.5T440,720v-200Z" />
        </svg>
      </button>
    </>
  );
}
