"use client";

// Forage-required dialog (Feed Selection); split out of feed-selection/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

import type React from "react";

export interface NoForageDialogProps {
  isEvaluation: boolean;
  setShowNoForageDialog: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function NoForageDialog({
  isEvaluation,
  setShowNoForageDialog,
  t,
}: NoForageDialogProps) {
  return (
    <div
      className="fixed top-0 h-full z-[100] flex items-center justify-center px-4"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white w-full max-w-xs"
        style={{ borderRadius: 16, paddingBottom: 30 }}
      >
        <div className="flex justify-center" style={{ marginTop: 30 }}>
          <div
            className="flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,152,0,0.15)", borderRadius: 60, padding: 14 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                stroke={COLORS.vividGamboge}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M12 9v4M12 17h.01"
                stroke={COLORS.vividGamboge}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <p
          className="text-center font-bold"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 20,
            margin: "20px 16px 0",
          }}
        >
          {t("Forage Required")}
        </p>
        <p
          className="text-center"
          style={{
            color: COLORS.darkSilver,
            fontSize: 16,
            margin: "16px 16px 0",
            lineHeight: 1.5,
          }}
        >
          {/* Rendered as one flat dictionary key with an embedded ${mode}
                  token — collapses the inline "Forage" color-emphasis span
                  from the English-only version since the sheet stores this
                  as a single sentence. "Forage" itself is a feed-type
                  identity word, so the dictionary intentionally keeps it
                  untranslated (see the Hindi cell — still reads "Forage"). */}
          {t(
            "Add at least one Forage feed before generating a ${mode}. Forages are the backbone of a balanced ration — the optimizer needs one to produce a sensible result."
          ).replace("${mode}", isEvaluation ? "diet evaluation" : "recommendation")}
        </p>
        <button
          onClick={() => setShowNoForageDialog(false)}
          className="font-bold"
          style={{
            display: "block",
            width: "calc(100% - 32px)",
            backgroundColor: COLORS.darkAquamarineGreen,
            color: COLORS.white,
            borderRadius: 60,
            padding: "14px 0",
            border: "none",
            fontSize: 16,
            cursor: "pointer",
            margin: "30px 16px 0",
          }}
        >
          {t("OK, Add a Forage")}
        </button>
      </div>
    </div>
  );
}
