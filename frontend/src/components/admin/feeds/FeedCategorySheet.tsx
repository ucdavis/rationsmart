"use client";

// Add feed category sheet (Admin > Feed Management); split out of admin/feeds/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";

import type { AdminFeedType } from "@/components/admin/feeds/shared";
import type React from "react";

export interface FeedCategorySheetProps {
  feedTypes: AdminFeedType[];
  getName: (t: AdminFeedType) => string;
  handleSaveCategory: () => Promise<void>;
  isSavingCat: boolean;
  newCatDescription: string;
  newCatName: string;
  newCatTypeId: string;
  setNewCatDescription: React.Dispatch<React.SetStateAction<string>>;
  setNewCatName: React.Dispatch<React.SetStateAction<string>>;
  setNewCatTypeId: React.Dispatch<React.SetStateAction<string>>;
  setShowCatModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function FeedCategorySheet({
  feedTypes,
  getName,
  handleSaveCategory,
  isSavingCat,
  newCatDescription,
  newCatName,
  newCatTypeId,
  setNewCatDescription,
  setNewCatName,
  setNewCatTypeId,
  setShowCatModal,
  t,
}: FeedCategorySheetProps) {
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
        className="bg-white rounded-2xl w-full max-w-sm"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "30px 12px 30px" }}
      >
        <h3
          className="text-center font-bold"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 20,
            marginBottom: 20,
          }}
        >
          {t("Add Feed Category")}
        </h3>

        {/* FEED TYPE * dropdown (required) */}
        <p className="font-bold uppercase mb-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {t("Feed Type")}
          <span style={{ color: COLORS.redRyb }}> *</span>
        </p>
        <div className="relative mb-3">
          <select
            value={newCatTypeId}
            onChange={(e) => {
              setNewCatTypeId(e.target.value);
              setNewCatName("");
              setNewCatDescription("");
            }}
            className="w-full focus:outline-none appearance-none pr-8"
            style={{
              backgroundColor: COLORS.americanDiamond,
              color: newCatTypeId ? COLORS.raisinBlack : "#999",
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 14,
              border: "none",
            }}
          >
            <option value="">{t("Select type")}</option>
            {feedTypes.map((ft) => (
              <option key={ft.id} value={ft.id}>
                {getName(ft)}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 5L7 9L11 5"
                stroke={COLORS.darkSilver}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* FEED CATEGORY * input — disabled until type selected
                (bright_gray bg when disabled). */}
        <label
          htmlFor="feed-category-name"
          className="block font-bold uppercase mb-1"
          style={{ color: COLORS.darkSilver, fontSize: 12 }}
        >
          {t("Feed Category")}
          <span style={{ color: COLORS.redRyb }}> *</span>
        </label>
        <input
          id="feed-category-name"
          aria-label={t("Feed Category")}
          type="text"
          value={newCatName}
          disabled={!newCatTypeId}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder={!newCatTypeId ? t("Select feed type first") : t("e.g. Cereal Grains")}
          className="w-full focus:outline-none mb-3"
          style={{
            backgroundColor: newCatTypeId ? COLORS.americanDiamond : COLORS.brightGray,
            color: COLORS.raisinBlack,
            opacity: !newCatTypeId ? 0.6 : 1,
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 14,
            border: "none",
          }}
        />

        {/* DESCRIPTION multiline — disabled until type selected */}
        <label
          htmlFor="feed-category-description"
          className="block font-bold uppercase mb-1"
          style={{ color: COLORS.darkSilver, fontSize: 12 }}
        >
          {t("Description")}
        </label>
        <textarea
          id="feed-category-description"
          value={newCatDescription}
          disabled={!newCatTypeId}
          onChange={(e) => setNewCatDescription(e.target.value)}
          maxLength={100}
          placeholder={!newCatTypeId ? t("Select feed type first") : t("Short description")}
          className="w-full focus:outline-none mb-5"
          style={{
            backgroundColor: newCatTypeId ? COLORS.americanDiamond : COLORS.brightGray,
            color: COLORS.raisinBlack,
            opacity: !newCatTypeId ? 0.6 : 1,
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 14,
            border: "none",
            resize: "none",
            minHeight: 80,
          }}
        />

        {/* Submit — disabled until type + category filled */}
        <button
          onClick={handleSaveCategory}
          disabled={!newCatName.trim() || !newCatTypeId || isSavingCat}
          className="w-full font-bold flex items-center justify-center gap-2"
          style={{
            backgroundColor:
              newCatName.trim() && newCatTypeId && !isSavingCat
                ? COLORS.darkAquamarineGreen
                : COLORS.lightGrayNew,
            color: newCatName.trim() && newCatTypeId && !isSavingCat ? "white" : "#999",
            border: "none",
            cursor: newCatName.trim() && newCatTypeId && !isSavingCat ? "pointer" : "not-allowed",
            padding: "12px 0",
            borderRadius: 12,
            fontSize: 16,
          }}
        >
          {isSavingCat ? <Spinner size={18} /> : t("Submit")}
        </button>

        <button
          onClick={() => {
            setShowCatModal(false);
            setNewCatTypeId("");
            setNewCatName("");
            setNewCatDescription("");
          }}
          className="w-full mt-3"
          style={{
            background: "none",
            border: "none",
            color: COLORS.darkSilver,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
