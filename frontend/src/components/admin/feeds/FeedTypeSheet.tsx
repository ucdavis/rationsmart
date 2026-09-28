"use client";

// Add feed type sheet (Admin > Feed Management); split out of admin/feeds/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";

import type React from "react";

export interface FeedTypeSheetProps {
  handleSaveType: () => Promise<void>;
  isSavingType: boolean;
  newTypeDescription: string;
  newTypeName: string;
  setNewTypeDescription: React.Dispatch<React.SetStateAction<string>>;
  setNewTypeName: React.Dispatch<React.SetStateAction<string>>;
  setShowTypeModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function FeedTypeSheet({
  handleSaveType,
  isSavingType,
  newTypeDescription,
  newTypeName,
  setNewTypeDescription,
  setNewTypeName,
  setShowTypeModal,
  t,
}: FeedTypeSheetProps) {
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
        {/* Centered title: dark_aquamarine_green, font_20, bold */}
        <h3
          className="text-center font-bold"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 20,
            marginBottom: 20,
          }}
        >
          {t("Add Feed Type")}
        </h3>

        {/* FEED TYPE * label + input */}
        <p className="font-bold uppercase mb-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {t("Feed Type")}
          <span style={{ color: COLORS.redRyb }}> *</span>
        </p>
        <input
          aria-label={t("Feed Type")}
          type="text"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          placeholder={t("e.g. Forage")}
          className="w-full focus:outline-none mb-3"
          style={{
            backgroundColor: COLORS.americanDiamond,
            color: COLORS.raisinBlack,
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 14,
            border: "none",
          }}
        />

        {/* DESCRIPTION label + multiline textarea (4:1 aspect, max 100 chars) */}
        <p className="font-bold uppercase mb-1" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {t("Description")}
        </p>
        <textarea
          value={newTypeDescription}
          onChange={(e) => setNewTypeDescription(e.target.value)}
          maxLength={100}
          placeholder={t("Short description")}
          className="w-full focus:outline-none mb-5"
          style={{
            backgroundColor: COLORS.americanDiamond,
            color: COLORS.raisinBlack,
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 14,
            border: "none",
            resize: "none",
            minHeight: 80,
          }}
        />

        {/* Submit button — Android LoadingButton: disabled state =
                light_gray_new bg + spanish_gray text; enabled =
                dark_aquamarine_green bg + white text; corner 12. */}
        <button
          onClick={handleSaveType}
          disabled={!newTypeName.trim() || isSavingType}
          className="w-full font-bold flex items-center justify-center gap-2"
          style={{
            backgroundColor:
              newTypeName.trim() && !isSavingType
                ? COLORS.darkAquamarineGreen
                : COLORS.lightGrayNew,
            color: newTypeName.trim() && !isSavingType ? "white" : "#999",
            border: "none",
            cursor: newTypeName.trim() && !isSavingType ? "pointer" : "not-allowed",
            padding: "12px 0",
            borderRadius: 12,
            fontSize: 16,
          }}
        >
          {isSavingType ? <Spinner size={18} /> : t("Submit")}
        </button>

        {/* Cancel link — small text-only secondary action */}
        <button
          onClick={() => {
            setShowTypeModal(false);
            setNewTypeName("");
            setNewTypeDescription("");
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
