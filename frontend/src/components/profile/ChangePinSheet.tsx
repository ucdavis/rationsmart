"use client";

// Profile — Change-PIN sheet: current PIN, new 6-digit PIN and confirmation.
// Split out of profile/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import { LEGACY_PIN_LENGTH, PIN_LENGTH } from "@/lib/validators";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";
import Spinner from "@/components/ui/Spinner";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface ChangePinSheetProps {
  confirmNewPin: string;
  currentPin: string;
  handleChangePin: () => void | Promise<void>;
  isChangePinReady: boolean;
  isChangingPin: boolean;
  newPin: string;
  setConfirmNewPin: Dispatch<SetStateAction<string>>;
  setCurrentPin: Dispatch<SetStateAction<string>>;
  setNewPin: Dispatch<SetStateAction<string>>;
  setShowChangePinSheet: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function ChangePinSheet({
  confirmNewPin,
  currentPin,
  handleChangePin,
  isChangePinReady,
  isChangingPin,
  newPin,
  setConfirmNewPin,
  setCurrentPin,
  setNewPin,
  setShowChangePinSheet,
  t,
}: ChangePinSheetProps) {
  return (
    <>
      <div
        className="fixed top-0 h-full z-50"
        style={{
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onClick={() => !isChangingPin && setShowChangePinSheet(false)}
      />
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
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-4 mb-3">
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.goGreen15,
            }}
          />
        </div>

        <p
          className="text-center font-bold"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Change Your PIN")}
        </p>
        <p
          className="text-center mt-1 mb-4 px-4"
          style={{ color: COLORS.darkSilver, fontSize: 14 }}
        >
          {t("Enter your current PIN and choose a new 6-digit PIN.")}
        </p>

        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 mb-2 ml-4"
          style={{ color: COLORS.darkSilver }}
        >
          {t("Current PIN")}
        </p>
        <PinInput
          label={t("Current PIN")}
          value={currentPin}
          onChange={setCurrentPin}
          length={6}
          disabled={isChangingPin}
        />

        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 mb-2 ml-4"
          style={{ color: COLORS.darkSilver }}
        >
          {t("New 6-digit PIN")}
        </p>
        <PinInput
          label={t("New PIN")}
          value={newPin}
          onChange={setNewPin}
          length={6}
          disabled={
            isChangingPin || currentPin.length < LEGACY_PIN_LENGTH || currentPin.length > PIN_LENGTH
          }
        />

        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 mb-2 ml-4"
          style={{ color: COLORS.darkSilver }}
        >
          {t("Confirm New PIN")}
        </p>
        <PinInput
          label={t("Confirm new PIN")}
          value={confirmNewPin}
          onChange={setConfirmNewPin}
          length={6}
          disabled={isChangingPin || newPin.length !== PIN_LENGTH}
        />

        {confirmNewPin.length === PIN_LENGTH && newPin !== confirmNewPin && (
          <p className="text-xs font-bold text-center mt-2" style={{ color: COLORS.carminePink }}>
            {t("New PINs do not match")}
          </p>
        )}

        <div className="px-3 mt-5">
          <button
            onClick={handleChangePin}
            disabled={!isChangePinReady || isChangingPin}
            className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                isChangePinReady && !isChangingPin
                  ? COLORS.darkAquamarineGreen
                  : COLORS.lightGrayNew,
              color: isChangePinReady && !isChangingPin ? COLORS.white : COLORS.spanishGray,
              border: "none",
              cursor: isChangePinReady && !isChangingPin ? "pointer" : "not-allowed",
            }}
          >
            {isChangingPin ? <Spinner size={22} /> : t("Update PIN")}
          </button>
        </div>

        <div className="mt-6">
          <PoweredBy />
        </div>
      </div>
    </>
  );
}
