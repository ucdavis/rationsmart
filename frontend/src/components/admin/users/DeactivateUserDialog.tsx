"use client";

// Admin Users — Deactivate-user confirmation (audit A-13).
// Split out of admin/users/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import type { AdminUser } from "./types";
import { fillTemplate } from "@/lib/i18n-ui";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface DeactivateUserDialogProps {
  confirmDeactivate: AdminUser;
  handleToggle: (u: AdminUser) => Promise<void>;
  setConfirmDeactivate: Dispatch<SetStateAction<AdminUser | null>>;
  t: (source: string) => string;
}

export default function DeactivateUserDialog({
  confirmDeactivate,
  handleToggle,
  setConfirmDeactivate,
  t,
}: DeactivateUserDialogProps) {
  return (
    <div
      className="fixed top-0 h-full flex items-center justify-center px-6"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 60,
      }}
      onClick={() => setConfirmDeactivate(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl w-full"
        style={{ padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 18 }}>
          {t("Deactivate this user?")}
        </p>
        <p
          style={{
            color: COLORS.darkSilver,
            fontSize: 14,
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {fillTemplate(t("${name} will no longer be able to sign in until reactivated."), {
            name: (
              <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                {confirmDeactivate.name}
              </span>
            ),
          })}
        </p>
        <div className="flex gap-3" style={{ marginTop: 20 }}>
          <button
            onClick={() => setConfirmDeactivate(null)}
            className="font-bold"
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: `2px solid ${COLORS.darkAquamarineGreen}`,
              backgroundColor: COLORS.white,
              color: COLORS.darkAquamarineGreen,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            {t("Cancel")}
          </button>
          <button
            onClick={() => {
              const target = confirmDeactivate;
              setConfirmDeactivate(null);
              void handleToggle(target);
            }}
            className="font-bold"
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: "none",
              backgroundColor: COLORS.carminePink,
              color: COLORS.white,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            {t("Deactivate")}
          </button>
        </div>
      </div>
    </div>
  );
}
