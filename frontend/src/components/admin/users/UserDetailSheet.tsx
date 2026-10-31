"use client";

// Admin Users — User detail sheet (Android dialog_user_details.xml): status, activation switch, admin access and Save.
// Split out of admin/users/page.tsx (audit B-17); the page owns the state.

import type { Dispatch, SetStateAction } from "react";
import type { AdminUser } from "./types";
import type { User } from "@/lib/store";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface UserDetailSheetProps {
  adminTogglingId: string | null;
  getCountryName: (country: AdminUser["country"]) => string;
  handleToggle: (u: AdminUser) => Promise<void>;
  selectedUser: AdminUser;
  setConfirmAdmin: Dispatch<SetStateAction<AdminUser | null>>;
  setSelectedUser: Dispatch<SetStateAction<AdminUser | null>>;
  setSheetActive: Dispatch<SetStateAction<boolean | null>>;
  sheetActive: boolean | null;
  t: (source: string) => string;
  togglingId: string | null;
  user: User | null;
}

export default function UserDetailSheet({
  adminTogglingId,
  getCountryName,
  handleToggle,
  selectedUser,
  setConfirmAdmin,
  setSelectedUser,
  setSheetActive,
  sheetActive,
  t,
  togglingId,
  user,
}: UserDetailSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex items-end justify-center"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
      onClick={() => setSelectedUser(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full rounded-t-3xl bg-white"
        style={{
          maxWidth: COLUMN_WIDTH,
          maxHeight: "92vh",
          overflowY: "auto",
          paddingBottom: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (Android view_drag_handle: 40dp × 6dp mint pin) */}
        <div className="flex justify-center" style={{ paddingTop: 16, marginBottom: 14 }}>
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.goGreen15,
            }}
          />
        </div>

        {/* Role icon — circular pill (size_60 = circular) with mint_whisper
            bg + go_green_15 stroke. Uses ic_admin_42 / ic_user_42 (40dp). */}
        <div className="flex justify-center mb-5">
          <div
            className="flex items-center justify-center"
            style={{
              backgroundColor: COLORS.mintWhisper,
              border: "1px solid rgba(5,188,109,0.15)",
              borderRadius: 60,
              padding: 10,
            }}
          >
            {selectedUser.is_admin ? (
              /* ic_admin_42 — 40dp shield-with-face (viewport 20×20) */
              <svg width="40" height="40" viewBox="0 0 20 20" fill={COLORS.darkAquamarineGreen}>
                <path d="M10.14,10.45c1.57,-1.58 2.77,-1.59 3.86,-1.31v-2.3c0,-0.4 -0.24,-0.76 -0.6,-0.92l-4,-1.75c-0.26,-0.11 -0.54,-0.11 -0.8,0l-4,1.75C4.24,6.08 4,6.44 4,6.84v2.62c0,3.03 2.13,5.86 5,6.55c0.35,-0.08 0.7,-0.2 1.02,-0.35C9.42,14.98 9.04,14.1 9,13.14C8.97,12.12 9.43,11.17 10.14,10.45z" />
                <path d="M13,10c-1.66,0 -3,1.34 -3,3c0,1.66 1.34,3 3,3s3,-1.34 3,-3C16,11.34 14.66,10 13,10zM13,11.03c0.47,0 0.84,0.38 0.84,0.84c0,0.46 -0.38,0.84 -0.84,0.84s-0.84,-0.38 -0.84,-0.84C12.16,11.41 12.53,11.03 13,11.03zM13,15.06c-0.7,0 -1.31,-0.35 -1.68,-0.87c0.04,-0.54 1.13,-0.81 1.68,-0.81s1.64,0.27 1.68,0.81C14.31,14.72 13.7,15.06 13,15.06z" />
              </svg>
            ) : (
              /* ic_user_42 — 40dp Material person silhouette (viewport 960×960) */
              <svg width="40" height="40" viewBox="0 0 960 960" fill={COLORS.darkAquamarineGreen}>
                <path d="M480,479.33q-66,0 -109.67,-43.66Q326.67,392 326.67,326t43.66,-109.67Q414,172.67 480,172.67t109.67,43.66Q633.33,260 633.33,326t-43.66,109.67Q546,479.33 480,479.33ZM160,733.33L160,700q0,-36.67 18.5,-64.17T226.67,594q65.33,-30.33 127.66,-45.5 62.34,-15.17 125.67,-15.17t125.33,15.5q62,15.5 127.28,45.3 30.54,14.42 48.96,41.81Q800,663.33 800,700v33.33q0,27.5 -19.58,47.09Q760.83,800 733.33,800L226.67,800q-27.5,0 -47.09,-19.58Q160,760.83 160,733.33ZM226.67,733.33h506.66L733.33,700q0,-14.33 -8.16,-27 -8.17,-12.67 -20.5,-19 -60.67,-29.67 -114.34,-41.83Q536.67,600 480,600t-111,12.17Q314.67,624.33 254.67,654q-12.34,6.33 -20.17,19 -7.83,12.67 -7.83,27v33.33ZM480,412.67q37,0 61.83,-24.84Q566.67,363 566.67,326t-24.84,-61.83Q517,239.33 480,239.33t-61.83,24.84Q393.33,289 393.33,326t24.84,61.83Q443,412.67 480,412.67Z" />
              </svg>
            )}
          </div>
        </div>

        {/* Name — centered, bold, raisin_black, font_20 */}
        <p
          className="text-center font-bold"
          style={{
            color: COLORS.raisinBlack,
            fontSize: 20,
            marginInline: 12,
          }}
        >
          {selectedUser.name}
        </p>

        {/* Status badge — centered below name (matches tv_status in
            dialog_user_details.xml: same bg_active_gradient /
            bg_inactive_gradient as the list cards). Text reads
            "ACTIVE ACCOUNT" / "INACTIVE ACCOUNT". */}
        <div className="flex justify-center" style={{ marginTop: 4 }}>
          <span
            className="font-bold"
            style={{
              backgroundColor: selectedUser.is_active ? COLORS.honeydew : COLORS.peachyPink,
              color: selectedUser.is_active ? COLORS.darkAquamarineGreen : COLORS.carminePink,
              border: `1px solid ${selectedUser.is_active ? COLORS.goGreen15 : "rgba(228,74,74,0.20)"}`,
              borderRadius: 10,
              padding: "2px 10px",
              fontSize: 12,
            }}
          >
            {selectedUser.is_active ? t("ACTIVE ACCOUNT") : t("INACTIVE ACCOUNT")}
          </span>
        </div>

        {/* Email + Country card (Android cv_user_details: white card,
            30dp corner, with american_diamond icon boxes + dark_silver
            title labels + raisin_black bold values, separator between). */}
        <div
          className="bg-white"
          style={{
            margin: "20px 12px 0",
            borderRadius: 30,
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
            padding: 20,
          }}
        >
          {/* Email row */}
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: COLORS.americanDiamond, borderRadius: 10, padding: 10 }}
            >
              {/* ic_alternate_email — filled envelope, dark_silver tint */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill={COLORS.darkSilver}>
                <path d="M20,4L4,4c-1.1,0 -1.99,0.9 -1.99,2L2,18c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2L22,6c0,-1.1 -0.9,-2 -2,-2zM19.6,8.25l-7.07,4.42c-0.32,0.2 -0.74,0.2 -1.06,0L4.4,8.25c-0.25,-0.16 -0.4,-0.43 -0.4,-0.72 0,-0.67 0.73,-1.07 1.3,-0.72L12,11l6.7,-4.19c0.57,-0.35 1.3,0.05 1.3,0.72 0,0.29 -0.15,0.56 -0.4,0.72z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ color: COLORS.darkSilver, fontSize: 12 }}>{t("Email Address")}</p>
              <p className="font-bold truncate" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                {selectedUser.email_id}
              </p>
            </div>
          </div>

          {/* Separator (Android view_separator: 1dp sparkling_silver,
              starts from end of icon box) */}
          <div style={{ height: 1, backgroundColor: COLORS.webDivider, margin: "20px 0 0 56px" }} />

          {/* Country row */}
          <div className="flex items-center" style={{ gap: 12, marginTop: 20 }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: COLORS.americanDiamond, borderRadius: 10, padding: 10 }}
            >
              {/* ic_globe — dark_silver tint */}
              <svg width="24" height="24" viewBox="0 0 960 960" fill={COLORS.darkSilver}>
                <path d="M480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM440,798v-78q-33,0 -56.5,-23.5T360,640v-40L168,408q-3,18 -5.5,36t-2.5,36q0,121 79.5,212T440,798ZM716,696q41,-45 62.5,-100.5T800,480q0,-98 -54.5,-179T600,184v16q0,33 -23.5,56.5T520,280h-80v80q0,17 -11.5,28.5T400,400h-80v80h240q17,0 28.5,11.5T600,520v120h40q26,0 47,15.5t29,40.5Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ color: COLORS.darkSilver, fontSize: 12 }}>{t("Country")}</p>
              <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                {getCountryName(selectedUser.country) || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Account Activation card with toggle switch
            (Android cv_toggle_status: white card, 20dp corner,
            go_green_15 stroke 1dp). */}
        <div
          className="bg-white flex items-center justify-between"
          style={{
            margin: "20px 12px 0",
            borderRadius: 20,
            border: "1px solid rgba(5,188,109,0.15)",
            padding: 12,
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
              {t("Account Activation")}
            </p>
            <p
              style={{
                color: COLORS.raisinBlack,
                fontSize: 14,
                marginTop: 2,
              }}
            >
              {t("Set user status")}
            </p>
          </div>
          {/* Material-style switch */}
          <button
            onClick={() => setSheetActive(!(sheetActive ?? selectedUser.is_active))}
            disabled={togglingId === selectedUser.id}
            role="switch"
            aria-checked={sheetActive ?? selectedUser.is_active}
            aria-label={
              (sheetActive ?? selectedUser.is_active) ? t("Deactivate user") : t("Activate user")
            }
            style={{
              width: 52,
              height: 32,
              borderRadius: 16,
              backgroundColor:
                (sheetActive ?? selectedUser.is_active)
                  ? COLORS.darkAquamarineGreen
                  : COLORS.lightGrayNew,
              border: "none",
              position: "relative",
              cursor: togglingId === selectedUser.id ? "not-allowed" : "pointer",
              transition: "background-color 0.18s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 4,
                left: (sheetActive ?? selectedUser.is_active) ? 24 : 4,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: COLORS.white,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                transition: "left 0.18s",
              }}
            />
          </button>
        </div>

        {/* Administrator Access card — grant/revoke the admin role.
            Hidden entirely for inactive accounts (an inactive user has no
            sign-in access, so promoting them to admin is meaningless).
            Also gated on the current user being an admin — only an admin
            can grant/revoke another user's admin role. */}
        {selectedUser.is_active && user?.is_admin && (
          <div
            className="bg-white flex items-center justify-between"
            style={{
              margin: "16px 12px 0",
              borderRadius: 20,
              border: "1px solid rgba(5,188,109,0.15)",
              padding: 12,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
                {t("Administrator Access")}
              </p>
              <p
                style={{
                  color: COLORS.raisinBlack,
                  fontSize: 14,
                  marginTop: 2,
                }}
              >
                {selectedUser.id === user?.id
                  ? t("You can't change your own role")
                  : t("Grant or revoke admin rights")}
              </p>
            </div>
            <button
              onClick={() => setConfirmAdmin(selectedUser)}
              disabled={adminTogglingId === selectedUser.id || selectedUser.id === user?.id}
              aria-label={
                selectedUser.is_admin ? t("Revoke admin access") : t("Grant admin access")
              }
              style={{
                width: 52,
                height: 32,
                borderRadius: 16,
                backgroundColor: selectedUser.is_admin
                  ? COLORS.darkAquamarineGreen
                  : COLORS.lightGrayNew,
                border: "none",
                position: "relative",
                cursor:
                  adminTogglingId === selectedUser.id || selectedUser.id === user?.id
                    ? "not-allowed"
                    : "pointer",
                transition: "background-color 0.18s",
                flexShrink: 0,
                opacity: selectedUser.id === user?.id ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  left: selectedUser.is_admin ? 24 : 4,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: COLORS.white,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.18s",
                }}
              />
            </button>
          </div>
        )}

        {/* Save + Cancel buttons (Android btn_save filled green,
            btn_cancel outlined). Save commits the switch only if it was
            actually changed — it used to flip the status unconditionally. */}
        <button
          onClick={() => {
            if (sheetActive !== null && sheetActive !== selectedUser.is_active) {
              void handleToggle(selectedUser);
            }
            setSelectedUser(null);
          }}
          disabled={togglingId === selectedUser.id}
          className="font-bold"
          style={{
            display: "block",
            width: "calc(100% - 24px)",
            margin: "20px 12px 0",
            padding: "12px 0",
            backgroundColor: COLORS.darkAquamarineGreen,
            color: COLORS.white,
            border: "none",
            borderRadius: 12,
            cursor: togglingId === selectedUser.id ? "not-allowed" : "pointer",
            opacity: togglingId === selectedUser.id ? 0.7 : 1,
            fontSize: 16,
          }}
        >
          {t("Save")}
        </button>
        <button
          onClick={() => setSelectedUser(null)}
          className="font-bold"
          style={{
            display: "block",
            width: "calc(100% - 24px)",
            margin: "20px 12px 0",
            padding: "12px 0",
            backgroundColor: COLORS.white,
            color: COLORS.darkAquamarineGreen,
            border: `2px solid ${COLORS.darkAquamarineGreen}`,
            borderRadius: 12,
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
