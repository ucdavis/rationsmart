"use client";

// Profile — Delete Account confirmation (Android dialog_delete_account).
// Split out of profile/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface DeleteAccountDialogProps {
  setShowDeleteDialog: Dispatch<SetStateAction<boolean>>;
  setShowPinSheet: Dispatch<SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function DeleteAccountDialog({
  setShowDeleteDialog,
  setShowPinSheet,
  t,
}: DeleteAccountDialogProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowDeleteDialog(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl w-full max-w-xs pt-7 pb-5 px-4"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ic_additional_information — alert "!" inside an outlined
            circle, tinted red_ryb, inside a carmine_pink_20 pill. */}
        <div
          className="flex items-center justify-center mx-auto mb-4"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: "rgba(228,74,74,0.20)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 960 960" fill={COLORS.redRyb}>
            <path d="M480,680q17,0 28.5,-11.5T520,640v-160q0,-17 -11.5,-28.5T480,440q-17,0 -28.5,11.5T440,480v160q0,17 11.5,28.5T480,680ZM480,360q17,0 28.5,-11.5T520,320q0,-17 -11.5,-28.5T480,280q-17,0 -28.5,11.5T440,320q0,17 11.5,28.5T480,360ZM480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM480,800q134,0 227,-93t93,-227q0,-134 -93,-227t-227,-93q-134,0 -227,93t-93,227q0,134 93,227t227,93Z" />
          </svg>
        </div>

        {/* Title — Android string @delete_account: "Are you sure you
            want\nto delete your account?" */}
        <h3
          className="text-center font-bold mb-2 mx-3"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 20,
            whiteSpace: "pre-line",
          }}
        >
          {t("Are you sure you want\nto delete your account?")}
        </h3>

        {/* Description — Android string @delete_account_message */}
        <p
          className="text-center text-sm mb-5 mx-3"
          style={{ color: COLORS.darkSilver, whiteSpace: "pre-line" }}
        >
          {t("This action is permanent. Your account\nand data will be deleted\npermanently.")}
        </p>

        <div className="flex gap-3">
          {/* NO — outlined dark green button with ic_cancel (X-in-circle) */}
          <button
            onClick={() => setShowDeleteDialog(false)}
            className="flex-1 py-3 font-bold flex items-center justify-center gap-2"
            style={{
              border: `2px solid ${COLORS.darkAquamarineGreen}`,
              color: COLORS.darkAquamarineGreen,
              background: COLORS.white,
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 960 960" fill={COLORS.darkAquamarineGreen}>
              <path d="m480,536 l116,116q11,11 28,11t28,-11q11,-11 11,-28t-11,-28L536,480l116,-116q11,-11 11,-28t-11,-28q-11,-11 -28,-11t-28,11L480,424 364,308q-11,-11 -28,-11t-28,11q-11,11 -11,28t11,28l116,116 -116,116q-11,11 -11,28t11,28q11,11 28,11t28,-11l116,-116ZM480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM480,800q134,0 227,-93t93,-227q0,-134 -93,-227t-227,-93q-134,0 -227,93t-93,227q0,134 93,227t227,93Z" />
            </svg>
            {t("No")}
          </button>

          {/* YES — filled carmine_pink button with ic_delete_account
              (filled trash, same icon as the Profile Delete button) */}
          <button
            onClick={() => {
              setShowDeleteDialog(false);
              setShowPinSheet(true);
            }}
            className="flex-1 py-3 font-bold flex items-center justify-center gap-2"
            style={{
              backgroundColor: COLORS.carminePink,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={COLORS.white}>
              <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V9c0,-1.1 -0.9,-2 -2,-2H8c-1.1,0 -2,0.9 -2,2v10zM18,4h-2.5l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29H9.91c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4H6c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1z" />
            </svg>
            {t("Yes")}
          </button>
        </div>
      </div>
    </div>
  );
}
