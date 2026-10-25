"use client";

// Profile — Reset-PIN bottom sheet: the signed-in user's email (read-only, audit A-20) and Proceed.
// Split out of profile/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import type { User } from "@/lib/store";
import PoweredBy from "@/components/PoweredBy";
import Spinner from "@/components/ui/Spinner";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface ResetPinSheetProps {
  handleResetSend: () => void | Promise<void>;
  isResetReady: boolean;
  isSendingReset: boolean;
  setShowResetSheet: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
  user: User;
}

export default function ResetPinSheet({
  handleResetSend,
  isResetReady,
  isSendingReset,
  setShowResetSheet,
  t,
  user,
}: ResetPinSheetProps) {
  return (
    <>
      {/* Backdrop — confined to centered column. Tap to dismiss. */}
      <div
        className="fixed top-0 h-full z-50"
        style={{
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onClick={() => !isSendingReset && setShowResetSheet(false)}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 left-0 right-0 mx-auto bg-white pb-5"
        style={{
          maxWidth: COLUMN_WIDTH,
          width: "100%",
          zIndex: 51,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          animation: "slideUp 0.28s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 mb-4">
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.goGreen15,
            }}
          />
        </div>

        {/* Title */}
        <p
          className="text-center font-bold"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Reset Your PIN")}
        </p>
        <p className="text-center mt-1 px-3" style={{ color: COLORS.darkSilver, fontSize: 14 }}>
          {t("Enter your registered email to receive a reset link")}
        </p>

        {/* Email label + input */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
          style={{ color: COLORS.darkSilver }}
        >
          {t("Email Address")} <span style={{ color: COLORS.redRyb }}>*</span>
        </p>
        <div className="px-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            // Locked to the signed-in account (audit A-20): a signed-in user
            // must not be able to send PIN-reset emails to other people.
            value={user.email ?? ""}
            readOnly
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={{
              backgroundColor: COLORS.americanDiamond,
              color: COLORS.raisinBlack,
            }}
            aria-label={t("Email address")}
          />
        </div>

        {/* Proceed */}
        <div className="px-3 mt-5">
          <button
            onClick={handleResetSend}
            disabled={!isResetReady || isSendingReset}
            className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                isResetReady && !isSendingReset ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
              color: isResetReady && !isSendingReset ? COLORS.white : COLORS.spanishGray,
              border: "none",
              cursor: isResetReady && !isSendingReset ? "pointer" : "not-allowed",
              transition: "background-color 0.2s, color 0.2s",
            }}
          >
            {isSendingReset ? (
              <Spinner size={22} />
            ) : (
              <>
                {t("Proceed")}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </div>

        <div className="mt-8">
          <PoweredBy />
        </div>
      </div>
    </>
  );
}
