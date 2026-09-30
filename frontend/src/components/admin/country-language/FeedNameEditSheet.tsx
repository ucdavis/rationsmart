"use client";

// Local Feed Names — the sheet that adds, updates or deletes one feed's local
// name. Split out of FeedNamesTab.tsx (audit B-17); the tab owns the state.

import type { Dispatch, SetStateAction } from "react";
import { labelForLanguage } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import {
  AdminFeedLite,
  CountryRow,
  FeedTranslation,
  inputStyle,
  sheetOverlayStyle,
} from "./shared";
import { fillText } from "@/lib/i18n-ui";

export interface FeedNameEditSheetProps {
  editValue: string;
  editingFeed: AdminFeedLite & { translation?: FeedTranslation | null };
  handleDeleteFeed: () => void | Promise<void>;
  handleSaveFeed: () => void | Promise<void>;
  isDeleting: boolean;
  isSaving: boolean;
  selCountry: CountryRow | null;
  selLang: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  setEditingFeed: Dispatch<
    SetStateAction<(AdminFeedLite & { translation?: FeedTranslation | null }) | null>
  >;
  t: (source: string) => string;
}

export function FeedNameEditSheet({
  editValue,
  editingFeed,
  handleDeleteFeed,
  handleSaveFeed,
  isDeleting,
  isSaving,
  selCountry,
  selLang,
  setEditValue,
  setEditingFeed,
  t,
}: FeedNameEditSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={sheetOverlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) setEditingFeed(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        <div className="flex justify-center mb-3">
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.goGreen15,
            }}
          />
        </div>
        <p className="text-xs font-bold" style={{ color: COLORS.darkSilver }}>
          {selCountry?.name} · {labelForLanguage(selLang)}
        </p>
        <h3 className="font-bold mb-4" style={{ color: COLORS.raisinBlack, fontSize: 17 }}>
          {editingFeed.fd_name}
        </h3>
        <label
          htmlFor="feed-local-name"
          className="block text-xs font-bold uppercase tracking-wide mb-1"
          style={{ color: COLORS.darkSilver }}
        >
          {fillText(t("Name in ${language}"), { language: labelForLanguage(selLang) })}
        </label>
        <input
          id="feed-local-name"
          aria-label={t("Name in ${language}").replace("${language}", labelForLanguage(selLang))}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder={t("Type the ${language} name…").replace(
            "${language}",
            labelForLanguage(selLang)
          )}
          className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-4"
          style={inputStyle}
          autoFocus
        />
        <button
          onClick={handleSaveFeed}
          disabled={isSaving}
          className="w-full py-3 rounded-xl font-bold mb-2"
          style={{
            backgroundColor: isSaving ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
            color: COLORS.white,
            border: "none",
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? t("Saving…") : editingFeed.translation ? t("Update name") : t("Save name")}
        </button>
        {editingFeed.translation && (
          <button
            onClick={handleDeleteFeed}
            disabled={isDeleting}
            className="w-full py-2.5 rounded-xl font-bold"
            style={{
              backgroundColor: "transparent",
              color: COLORS.carminePink,
              border: "1.5px solid rgba(228,74,74,0.4)",
              cursor: isDeleting ? "not-allowed" : "pointer",
            }}
          >
            {isDeleting ? t("Deleting…") : t("Delete this name")}
          </button>
        )}
      </div>
    </div>
  );
}
