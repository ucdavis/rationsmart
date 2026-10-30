"use client";

// Admin Feeds — Feed Categories tab (Android fragment_feed_category.xml): list, delete and the add button.
// Split out of admin/feeds/page.tsx (audit B-17); the page owns the state
// and every create / delete handler.

import type { Dispatch, SetStateAction } from "react";
import { COLORS } from "@/lib/colors";
import { SkeletonCard, type AdminFeedCategory } from "./shared";

export interface FeedCategoriesTabProps {
  deletingCatId: string | null;
  feedCategories: AdminFeedCategory[];
  getCatName: (category: AdminFeedCategory) => string;
  getFeedTypeName: (category: AdminFeedCategory) => string;
  isLoading: boolean;
  setConfirmDeleteCat: Dispatch<SetStateAction<AdminFeedCategory | null>>;
  setShowCatModal: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function FeedCategoriesTab({
  deletingCatId,
  feedCategories,
  getCatName,
  getFeedTypeName,
  isLoading,
  setConfirmDeleteCat,
  setShowCatModal,
  t,
}: FeedCategoriesTabProps) {
  return (
    <>
      <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
        {isLoading ? (
          [0, 1, 2].map((i) => <SkeletonCard key={i} />)
        ) : feedCategories.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ color: COLORS.spanishGray }}>{t("No categories found")}</p>
          </div>
        ) : (
          feedCategories.map((fc) => {
            const isActive = fc.is_active !== false;
            return (
              <div
                key={fc.id}
                className="mx-3 my-2 rounded-2xl bg-white p-4"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="font-bold flex-1 min-w-0"
                    style={{ color: COLORS.raisinBlack, fontSize: 20 }}
                  >
                    {getCatName(fc) || t("N/A")}
                  </p>
                  <span
                    className="font-bold uppercase flex-shrink-0"
                    style={{
                      backgroundColor: isActive ? COLORS.honeydew : COLORS.peachyPink,
                      color: isActive ? COLORS.darkAquamarineGreen : COLORS.carminePink,
                      border: `1px solid ${isActive ? COLORS.goGreen15 : "rgba(228,74,74,0.20)"}`,
                      fontSize: 10,
                      padding: "2px 10px",
                      borderRadius: 10,
                      marginTop: 4,
                    }}
                  >
                    {isActive ? t("ACTIVE") : t("INACTIVE")}
                  </span>
                </div>
                <p
                  className="uppercase mt-2"
                  style={{ color: COLORS.darkAquamarineGreen, fontSize: 14 }}
                >
                  {getFeedTypeName(fc) || t("N/A")}
                </p>
                <div className="flex items-end justify-between gap-3 mt-2">
                  <p className="flex-1 min-w-0" style={{ color: COLORS.raisinBlack, fontSize: 14 }}>
                    {fc.description || t("N/A")}
                  </p>
                  {/* Delete — Android ic_delete inside circular pill */}
                  <button
                    onClick={() => setConfirmDeleteCat(fc)}
                    disabled={deletingCatId === fc.id}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(228,74,74,0.2)",
                      border: "none",
                      borderRadius: 60,
                      padding: 10,
                      cursor: "pointer",
                    }}
                    aria-label={t("Delete category")}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.redRyb}>
                      <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB — btn_add_feed_category */}
      <button
        onClick={() => setShowCatModal(true)}
        aria-label={t("Add feed category")}
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
