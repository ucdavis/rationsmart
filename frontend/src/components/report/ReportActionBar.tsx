"use client";

// The fixed bottom bar of a result screen: whatever the screen puts on top
// (Get PDF, View PDF / Share…), then New Case + Save Report. Used by the diet
// report and the calf milk plan; split out of report/page.tsx (W13).

import type { ReactNode } from "react";
import { IcNewCase, IcSave } from "@/components/Icons";
import Spinner from "@/components/ui/Spinner";
import { COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export default function ReportActionBar({
  canSave,
  isSaving,
  onSave,
  onNewCase,
  t,
  children,
}: {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  /**
   * New Case = "make a small tweak and run again" rather than "start from
   * scratch": everything the user typed stays on Cattle Info. The clean
   * slate is Cattle Info's Reset.
   */
  onNewCase: () => void;
  t: (source: string) => string;
  children?: ReactNode;
}) {
  const saveOff = isSaving || !canSave;
  return (
    <div
      className="px-4 py-4"
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: COLUMN_WIDTH,
        backgroundColor: COLORS.white,
        borderTop: `1px solid ${COLORS.webDivider}`,
        zIndex: 30,
      }}
    >
      {children}
      <div className="flex gap-3">
        <button
          onClick={onNewCase}
          className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
          style={{
            border: `2px solid ${COLORS.darkAquamarineGreen}`,
            color: COLORS.darkAquamarineGreen,
            background: COLORS.white,
            cursor: "pointer",
          }}
        >
          <IcNewCase size={18} color={COLORS.darkAquamarineGreen} />
          {t("New Case")}
        </button>
        <button
          onClick={onSave}
          disabled={saveOff}
          className="flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: saveOff ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
            color: saveOff ? COLORS.spanishGray : COLORS.white,
            border: "none",
            cursor: saveOff ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? (
            <>
              <Spinner size={16} />
              {t("Saving...")}
            </>
          ) : (
            <>
              <IcSave size={18} color={!canSave ? COLORS.spanishGray : COLORS.white} />
              {t("Save Report")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
