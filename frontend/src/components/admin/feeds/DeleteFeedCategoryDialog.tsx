"use client";

// Delete-category confirmation (Admin > Feed Management); split out of admin/feeds/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

import type { AdminFeedCategory } from "@/components/admin/feeds/shared";
import type React from "react";

export interface DeleteFeedCategoryDialogProps {
  confirmDeleteCat: AdminFeedCategory;
  deletingCatId: string | null;
  getCatName: (c: AdminFeedCategory) => string;
  handleDeleteCategory: (cat: AdminFeedCategory) => Promise<void>;
  setConfirmDeleteCat: React.Dispatch<React.SetStateAction<AdminFeedCategory | null>>;
  t: (source: string) => string;
}

export default function DeleteFeedCategoryDialog({
  confirmDeleteCat,
  deletingCatId,
  getCatName,
  handleDeleteCategory,
  setConfirmDeleteCat,
  t,
}: DeleteFeedCategoryDialogProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl w-full max-w-xs pb-5"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
      >
        <div className="flex justify-center mt-7 mb-4">
          <div
            className="flex items-center justify-center"
            style={{ backgroundColor: "rgba(228,74,74,0.2)", borderRadius: 60, padding: 14 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke={COLORS.redRyb} strokeWidth="2" />
              <path
                d="M12 7v5M12 16v1"
                stroke={COLORS.redRyb}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <h3
          className="text-center font-bold mb-4"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Are you sure you want to delete category?")}
        </h3>
        <p className="text-center text-sm mb-5 px-3" style={{ color: COLORS.darkSilver }}>
          {t('"${name}" will be permanently deleted. This action cannot be undone.').replace(
            "${name}",
            getCatName(confirmDeleteCat)
          )}
        </p>
        <div className="flex gap-2 px-3">
          <button
            onClick={() => setConfirmDeleteCat(null)}
            className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5"
            style={{
              border: `2px solid ${COLORS.darkAquamarineGreen}`,
              color: COLORS.darkAquamarineGreen,
              background: COLORS.white,
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke={COLORS.darkAquamarineGreen}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {t("No")}
          </button>
          <button
            onClick={() => handleDeleteCategory(confirmDeleteCat)}
            className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: COLORS.carminePink,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 4h10M5 4V3h4v1M4 4v8h6V4H4Z"
                stroke={COLORS.white}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {deletingCatId === confirmDeleteCat.id ? t("Deleting...") : t("Yes")}
          </button>
        </div>
      </div>
    </div>
  );
}
