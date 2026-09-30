"use client";

// Country / Language — Associate-a-language sheet (per country).
// Split out of CountriesLanguagesTab.tsx (audit B-17); the tab owns the state.

import type { Dispatch, SetStateAction } from "react";
import { COLORS } from "@/lib/colors";
import { fillText } from "@/lib/i18n-ui";
import { labelForLanguage } from "@/lib/api";
import { type CountryRow, type SystemLanguage, sheetOverlayStyle } from "./shared";

export interface AssociateLanguageSheetProps {
  allLanguages: SystemLanguage[];
  assocFor: CountryRow;
  handleAssociate: (code: string) => void | Promise<void>;
  isAssociating: boolean;
  setAssocFor: Dispatch<SetStateAction<CountryRow | null>>;
  t: (source: string) => string;
}

export default function AssociateLanguageSheet({
  allLanguages,
  assocFor,
  handleAssociate,
  isAssociating,
  setAssocFor,
  t,
}: AssociateLanguageSheetProps) {
  const available = allLanguages.filter((l) => l.is_active && !assocFor.languages.includes(l.code));
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={sheetOverlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) setAssocFor(null);
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
        <h3
          className="text-center font-bold mb-1"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
        >
          {fillText(t("Associate a language — ${country}"), { country: assocFor.name })}
        </h3>
        <p className="text-center text-sm mb-5" style={{ color: COLORS.darkSilver }}>
          {fillText(
            t("The combination will appear in the Cattle Info screen for farmers in ${country}."),
            { country: assocFor.name }
          )}
        </p>
        {available.length === 0 ? (
          <p className="text-sm text-center" style={{ color: COLORS.darkSilver }}>
            {t(
              "All active languages are already associated. Register or activate a language first."
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {available.map((l) => (
              <button
                key={l.code}
                onClick={() => handleAssociate(l.code)}
                disabled={isAssociating}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                style={{
                  border: `1px solid ${COLORS.gainsboro}`,
                  background: COLORS.white,
                  cursor: isAssociating ? "wait" : "pointer",
                }}
              >
                <span className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                  {labelForLanguage(l.code)}{" "}
                  <span style={{ color: COLORS.darkSilver, fontWeight: 400 }}>· {l.name}</span>
                </span>
                <span className="text-xs font-bold" style={{ color: COLORS.darkAquamarineGreen }}>
                  {t("Associate →")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
