"use client";

// Profile — Submit-PIN sheet that confirms account deletion (Android dialog_submit_pin).
// Split out of profile/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import { PIN_LENGTH } from "@/lib/validators";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";
import Spinner from "@/components/ui/Spinner";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface SubmitPinSheetProps {
  deletePin: string;
  handleDelete: () => void | Promise<void>;
  isDeleting: boolean;
  setDeletePin: Dispatch<SetStateAction<string>>;
  setShowPinSheet: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function SubmitPinSheet({
  deletePin,
  handleDelete,
  isDeleting,
  setDeletePin,
  setShowPinSheet,
  t,
}: SubmitPinSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex items-end justify-center"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          setShowPinSheet(false);
          setDeletePin("");
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl w-full max-w-[430px] pb-5 pt-5 px-4"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — bg_bottom_sheet_pin = go_green_15 (mint) */}
        <div className="flex justify-center mb-5">
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
          className="text-center font-bold mb-5"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Submit PIN")}
        </h3>
        <PinInput value={deletePin} onChange={setDeletePin} />
        <div className="mt-5">
          <button
            onClick={handleDelete}
            disabled={deletePin.length !== PIN_LENGTH || isDeleting}
            className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                deletePin.length === PIN_LENGTH && !isDeleting
                  ? COLORS.darkAquamarineGreen
                  : COLORS.lightGrayNew,
              color:
                deletePin.length === PIN_LENGTH && !isDeleting ? COLORS.white : COLORS.spanishGray,
              border: "none",
              cursor: deletePin.length === PIN_LENGTH && !isDeleting ? "pointer" : "not-allowed",
              transition: "background-color 0.2s",
            }}
          >
            {isDeleting ? <Spinner size={20} /> : t("Submit")}
          </button>
        </div>

        <div className="mt-8">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}
