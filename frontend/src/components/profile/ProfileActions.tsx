"use client";

// Profile — the account actions under the profile card: Delete, Reset PIN
// (fragment_profile.xml:209-247) and Change PIN. Split out of
// profile/page.tsx (audit B-17).

import { COLORS } from "@/lib/colors";

export interface ProfileActionsProps {
  onDelete: () => void;
  onResetPin: () => void;
  onChangePin: () => void;
  t: (source: string) => string;
}

export default function ProfileActions({
  onDelete,
  onResetPin,
  onChangePin,
  t,
}: ProfileActionsProps) {
  return (
    <>
      {/* Delete (left) + Reset PIN (right) — order and styling exactly
      match fragment_profile.xml:209-247.
        left  : btn_delete_profile  carmine_pink_20 bg / carmine_pink fg / ic_delete_account / text "Delete"
        right : btn_forgot_pin      celtic_blue_25  bg / celtic_blue fg / ic_reset_pin       / text "Reset PIN" */}
      <div className="mx-3 mt-3 flex gap-3">
        <button
          onClick={onDelete}
          className="flex-1 py-3.5 text-base flex items-center justify-center gap-2"
          style={{
            border: "none",
            color: COLORS.carminePink, // carmine_pink
            backgroundColor: "rgba(228,74,74,0.20)", // carmine_pink_20
            cursor: "pointer",
            borderRadius: 14,
          }}
        >
          {/* ic_delete_account — Material Symbols filled trash with
          rounded lid (single filled path, viewport 24x24) */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill={COLORS.carminePink}>
            <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V9c0,-1.1 -0.9,-2 -2,-2H8c-1.1,0 -2,0.9 -2,2v10zM18,4h-2.5l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29H9.91c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4H6c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1z" />
          </svg>
          {t("Delete")}
        </button>

        <button
          onClick={onResetPin}
          className="flex-1 py-3.5 text-base flex items-center justify-center gap-2"
          style={{
            border: "none",
            color: COLORS.celticBlue, // celtic_blue
            backgroundColor: "rgba(41,108,211,0.25)", // celtic_blue_25
            cursor: "pointer",
            borderRadius: 14,
          }}
        >
          {/* ic_reset_pin — Material Symbols refresh arrow with
          inset padlock (filled path, viewport 24x24) */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill={COLORS.celticBlue}>
            <path d="M13.26,3C8.17,2.86 4,6.94 4,12H2.21c-0.45,0 -0.67,0.54 -0.35,0.85l2.79,2.79c0.2,0.2 0.51,0.2 0.71,0l2.8,-2.79C8.46,12.54 8.24,12 7.79,12H6c0,-3.89 3.2,-7.06 7.1,-7c3.71,0.05 6.84,3.18 6.9,6.9c0.06,3.91 -3.1,7.1 -7,7.1c-1.59,0 -3.05,-0.53 -4.23,-1.43c-0.4,-0.3 -0.96,-0.27 -1.31,0.09l0,0c-0.43,0.43 -0.39,1.14 0.09,1.5C9.06,20.31 10.95,21 13,21c5.06,0 9.14,-4.17 9,-9.25C21.87,7.05 17.95,3.13 13.26,3zM15,11v-1c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2v1c-0.55,0 -1,0.45 -1,1v3c0,0.55 0.45,1 1,1h4c0.55,0 1,-0.45 1,-1v-3C16,11.45 15.55,11 15,11zM14,11h-2v-1c0,-0.55 0.45,-1 1,-1s1,0.45 1,1V11z" />
          </svg>
          {t("Reset PIN")}
        </button>
      </div>

      {/* Change PIN — user-initiated PIN change. Distinct from Reset
      PIN (which is the email-based forgot-pin flow). Full-width
      below the Delete/Reset row so it doesn't crowd the buttons. */}
      <div className="mx-3 mt-3">
        <button
          onClick={onChangePin}
          className="w-full py-3.5 text-base flex items-center justify-center gap-2"
          style={{
            border: `2px solid ${COLORS.darkAquamarineGreen}`,
            color: COLORS.darkAquamarineGreen,
            backgroundColor: COLORS.white,
            cursor: "pointer",
            borderRadius: 14,
            fontWeight: 700,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect
              x="5"
              y="11"
              width="14"
              height="9"
              rx="2"
              stroke={COLORS.darkAquamarineGreen}
              strokeWidth="2"
            />
            <path
              d="M8 11V8a4 4 0 0 1 8 0v3"
              stroke={COLORS.darkAquamarineGreen}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {t("Change PIN")}
        </button>
      </div>
    </>
  );
}
