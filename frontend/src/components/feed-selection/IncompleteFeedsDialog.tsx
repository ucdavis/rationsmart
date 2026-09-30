"use client";

// Incomplete Feeds pre-flight dialog (Feed Selection); split out of feed-selection/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

import type React from "react";

export interface IncompleteFeedsDialogProps {
  generateReport: () => Promise<void>;
  incompleteFeedNames: string[];
  setShowIncompleteFeedsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function IncompleteFeedsDialog({
  generateReport,
  incompleteFeedNames,
  setShowIncompleteFeedsDialog,
  t,
}: IncompleteFeedsDialogProps) {
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
        {/* Orange warning icon pill */}
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
        {/* Title */}
        <p
          className="text-center font-bold"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 20,
            margin: "20px 16px 0",
          }}
        >
          {t("Incomplete Feeds")}
        </p>
        {/* Description */}
        <p
          className="text-center"
          style={{
            color: COLORS.darkSilver,
            fontSize: 16,
            margin: "16px 16px 0",
            lineHeight: 1.5,
          }}
        >
          {t(
            "The following feeds have missing nutritional data and will be automatically discarded from the formulation:"
          )}
        </p>
        {/* Honeydew card with feed names */}
        <div
          style={{
            backgroundColor: COLORS.honeydew,
            borderRadius: 20,
            padding: 16,
            margin: "16px 16px 0",
            border: "1px solid rgba(5,188,109,0.15)",
          }}
        >
          {incompleteFeedNames.map((name, i) => (
            <p
              key={i}
              className="font-bold"
              style={{
                color: COLORS.crayolaGreen,
                marginTop: i > 0 ? 6 : 0,
                lineHeight: 1.6,
              }}
            >
              • {name}
            </p>
          ))}
        </div>
        {/* Proceed question */}
        <p
          className="text-center"
          style={{
            color: COLORS.darkSilver,
            fontSize: 16,
            margin: "30px 12px 0",
          }}
        >
          {t("Would you like to proceed?")}
        </p>
        {/* No, Review button */}
        <button
          onClick={() => setShowIncompleteFeedsDialog(false)}
          className="font-bold"
          style={{
            display: "block",
            width: "calc(100% - 32px)",
            backgroundColor: COLORS.lightCarminePink,
            color: COLORS.white,
            borderRadius: 60,
            padding: "14px 0",
            border: "none",
            fontSize: 16,
            cursor: "pointer",
            margin: "30px 16px 0",
          }}
        >
          {t("No, Review")}
        </button>
        {/* Yes, Proceed button */}
        <button
          onClick={() => {
            setShowIncompleteFeedsDialog(false);
            void generateReport();
          }}
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
            margin: "20px 16px 0",
          }}
        >
          {t("Yes, Proceed")}
        </button>
      </div>
    </div>
  );
}
