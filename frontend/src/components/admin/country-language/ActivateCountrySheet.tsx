"use client";

// Country / Language — Activate-a-country sheet.
// Split out of CountriesLanguagesTab.tsx (audit B-17); the tab owns the state.

import type { Dispatch, SetStateAction } from "react";
import { COLORS } from "@/lib/colors";
import { type InactiveCountryRow, SkeletonPickerRow, sheetOverlayStyle } from "./shared";

export interface ActivateCountrySheetProps {
  handleActivateCountry: (c: InactiveCountryRow) => void | Promise<void>;
  inactiveCountries: InactiveCountryRow[];
  isLoadingInactive: boolean;
  setShowActivate: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function ActivateCountrySheet({
  handleActivateCountry,
  inactiveCountries,
  isLoadingInactive,
  setShowActivate,
  t,
}: ActivateCountrySheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={sheetOverlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowActivate(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto overscroll-contain"
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
        <h3
          className="text-center font-bold mb-1"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
        >
          {t("Activate a country")}
        </h3>
        <p className="text-center text-sm mb-5" style={{ color: COLORS.darkSilver }}>
          {t("RationSmart becomes available to farmers in the activated country.")}
        </p>
        {isLoadingInactive ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <SkeletonPickerRow key={i} />
            ))}
          </div>
        ) : inactiveCountries.length === 0 ? (
          <p className="text-sm text-center" style={{ color: COLORS.darkSilver }}>
            {t("All registered countries are already enabled.")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {inactiveCountries.map((c) => (
              <button
                key={c.id}
                onClick={() => handleActivateCountry(c)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                style={{
                  border: `1px solid ${COLORS.gainsboro}`,
                  background: COLORS.white,
                  cursor: "pointer",
                }}
              >
                <span className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                  {c.name}
                </span>
                <span className="text-xs font-bold" style={{ color: COLORS.darkAquamarineGreen }}>
                  {t("Activate →")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
