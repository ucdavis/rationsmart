"use client";

// Admin Users — Grant / revoke admin confirmation.
// Split out of admin/users/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import type { AdminUser } from "./types";
import { fillTemplate } from "@/lib/i18n-ui";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface AdminRoleDialogProps {
  confirmAdmin: AdminUser;
  handleToggleAdmin: (u: AdminUser) => Promise<void>;
  setConfirmAdmin: Dispatch<SetStateAction<AdminUser | null>>;
  t: (source: string) => string;
}

export default function AdminRoleDialog({
  confirmAdmin,
  handleToggleAdmin,
  setConfirmAdmin,
  t,
}: AdminRoleDialogProps) {
  return (
    <div
      className="fixed top-0 h-full flex items-center justify-center px-6"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 60,
      }}
      onClick={() => setConfirmAdmin(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl w-full"
        style={{ padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 18 }}>
          {confirmAdmin.is_admin ? t("Revoke admin access?") : t("Make this user an admin?")}
        </p>
        <p
          style={{
            color: COLORS.darkSilver,
            fontSize: 14,
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {fillTemplate(
            confirmAdmin.is_admin
              ? t("${name} will lose administrator access and become a regular user.")
              : t(
                  "${name} will be granted full administrator access to manage users, feeds and settings."
                ),
            {
              name: (
                <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                  {confirmAdmin.name}
                </span>
              ),
            }
          )}
        </p>
        <div className="flex gap-3" style={{ marginTop: 20 }}>
          <button
            onClick={() => setConfirmAdmin(null)}
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
              const target = confirmAdmin;
              setConfirmAdmin(null);
              void handleToggleAdmin(target);
            }}
            className="font-bold"
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: "none",
              backgroundColor: confirmAdmin.is_admin
                ? COLORS.carminePink
                : COLORS.darkAquamarineGreen,
              color: COLORS.white,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            {confirmAdmin.is_admin ? t("Revoke") : t("Make Admin")}
          </button>
        </div>
      </div>
    </div>
  );
}
