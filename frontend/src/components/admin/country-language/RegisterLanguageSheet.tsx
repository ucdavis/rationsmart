"use client";

// Country / Language — Register-a-language sheet — Name + Code only.
// Split out of CountriesLanguagesTab.tsx (audit B-17); the tab owns the state.

import type { Dispatch, SetStateAction } from "react";
import { COLORS } from "@/lib/colors";
import { inputStyle, sheetOverlayStyle } from "./shared";

export interface RegisterLanguageSheetProps {
  handleRegister: () => void | Promise<void>;
  isRegistering: boolean;
  regCode: string;
  regName: string;
  setRegCode: Dispatch<SetStateAction<string>>;
  setRegName: Dispatch<SetStateAction<string>>;
  setShowRegister: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function RegisterLanguageSheet({
  handleRegister,
  isRegistering,
  regCode,
  regName,
  setRegCode,
  setRegName,
  setShowRegister,
  t,
}: RegisterLanguageSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={sheetOverlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowRegister(false);
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
          className="text-center font-bold mb-4"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
        >
          {t("Register a new language")}
        </h3>
        <label
          htmlFor="new-language-name"
          className="block text-xs font-bold uppercase tracking-wide mb-1"
          style={{ color: COLORS.darkSilver }}
        >
          {t("Language name (English)")}
        </label>
        <input
          id="new-language-name"
          aria-label={t("Language name (English)")}
          type="text"
          value={regName}
          onChange={(e) => setRegName(e.target.value)}
          placeholder={t("e.g. Swahili")}
          maxLength={100}
          className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
          style={inputStyle}
        />
        <label
          htmlFor="new-language-code"
          className="block text-xs font-bold uppercase tracking-wide mb-1"
          style={{ color: COLORS.darkSilver }}
        >
          {t("ISO code")}
        </label>
        <input
          id="new-language-code"
          aria-label={t("ISO code")}
          type="text"
          value={regCode}
          onChange={(e) => setRegCode(e.target.value.toLowerCase())}
          placeholder={t("e.g. sw")}
          maxLength={10}
          className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
          style={inputStyle}
        />
        <button
          onClick={handleRegister}
          disabled={isRegistering}
          className="w-full py-3 rounded-xl font-bold"
          style={{
            backgroundColor: isRegistering ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
            color: COLORS.white,
            border: "none",
            cursor: isRegistering ? "not-allowed" : "pointer",
          }}
        >
          {isRegistering ? t("Registering…") : t("Register language")}
        </button>
      </div>
    </div>
  );
}
