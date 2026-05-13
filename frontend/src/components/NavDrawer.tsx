"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import PoweredBy from "./PoweredBy";
import {
  IcClose,
  IcUser,
  IcReportNav,
  IcFeedbackNav,
  IcProfileNav,
  IcHelpSupport,
  IcTerms,
  IcAdminNav,
  IcLogoutNav,
  IcArrowRight,
} from "@/components/Icons";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
}

// User options order matches Android NavigationDrawerItem.userOptions exactly.
// `badge: "Ongoing"` shows a light-green pill next to the label (matches Android
// where Help & Support and Terms & Conditions display an "Ongoing" status chip).
type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
};

const userMenuItems: MenuItem[] = [
  { label: "Profile", href: "/profile", icon: <IcProfileNav size={20} color="#064E3B" /> },
  { label: "Feed Reports", href: "/reports", icon: <IcReportNav size={20} color="#064E3B" /> },
  { label: "Help & Support", href: "/help", icon: <IcHelpSupport size={20} color="#064E3B" />, badge: "Ongoing" },
  { label: "Feedback", href: "/feedback", icon: <IcFeedbackNav size={20} color="#064E3B" /> },
  { label: "Terms & Conditions", href: "/terms", icon: <IcTerms size={20} color="#064E3B" />, badge: "Ongoing" },
];

// Admin options: Admin first, then same as userOptions
const adminMenuItems: MenuItem[] = [
  { label: "Admin", href: "/admin", icon: <IcAdminNav size={20} color="#064E3B" /> },
  ...userMenuItems,
];

export default function NavDrawer({ open, onClose }: NavDrawerProps) {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleNavigate = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onClose();
    logout();
    router.replace("/welcome");
  };

  // The app's centered container is capped at 480px via min(100vw, 480px)
  // in layout.tsx. Both the overlay and drawer must align with that column,
  // not the full viewport — otherwise on desktop the drawer slides out from
  // the far left of the browser window while the content sits in a centered
  // 480px column, creating a big visual disconnect.
  const containerLeft = "max(0px, calc((100vw - 480px) / 2))";
  const containerWidth = "min(100vw, 480px)";

  return (
    <>
      {/* Overlay — confined to the centered content column */}
      {open && (
        <div
          className="fixed top-0 h-full z-40"
          style={{
            left: containerLeft,
            width: containerWidth,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onClick={onClose}
        />
      )}

      {/* Drawer — slides from the left edge of the centered content column */}
      <div
        className="fixed top-0 h-full z-50 flex flex-col bg-white"
        style={{
          left: containerLeft,
          width: "min(82vw, 340px)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.15)" : "none",
        }}
      >
        {/* Close button — top-right corner of the drawer (matches Android
            cv_close which is layout_gravity="end" at the top of the
            NavigationView, NOT inline with the profile row). */}
        <div className="flex justify-end pt-8 pb-2 px-4">
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 36, height: 36, backgroundColor: "#F0FDF4" }}
            aria-label="Close drawer"
          >
            <IcClose size={18} color="#064E3B" />
          </button>
        </div>

        {/* Profile section — avatar + name + email on its own row */}
        <div className="flex items-center gap-3 px-4 pb-4">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 52, height: 52, backgroundColor: "#F0FDF4", borderRadius: 20 }}
          >
            <IcUser size={30} color="#064E3B" />
          </div>
          <div className="min-w-0">
            <p
              className="font-bold truncate"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 18 }}
            >
              {user?.name || "User"}
            </p>
            <p
              className="text-sm truncate"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            >
              {user?.email || ""}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#E2E8F0", marginBottom: 4 }} />

        {/* Menu items — order matches Android NavigationDrawerItem exactly */}
        <div className="flex-1 overflow-y-auto">
          {(user?.is_admin ? adminMenuItems : userMenuItems).map((item, idx, arr) => (
            <div key={item.href}>
              <button
                onClick={() => handleNavigate(item.href)}
                className="w-full flex items-center justify-between px-4 py-4"
                style={{
                  background: "none",
                  border: "none",
                  outline: "none",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div style={{ width: 20, flexShrink: 0 }}>{item.icon}</div>
                  <span
                    className="text-base truncate"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className="font-bold"
                      style={{
                        backgroundColor: "#E4F7EF",
                        color: "#064E3B",
                        fontFamily: "Nunito, sans-serif",
                        fontSize: 12,
                        padding: "2px 10px",
                        borderRadius: 60,
                        flexShrink: 0,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <IcArrowRight size={16} color="#064E3B" />
              </button>
              {idx < arr.length - 1 && (
                <div style={{ height: 1, backgroundColor: "#E2E8F0", marginLeft: 52 }} />
              )}
            </div>
          ))}

          {/* Logout — red, no arrow */}
          <div style={{ height: 1, backgroundColor: "#E2E8F0", marginLeft: 52 }} />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-4 py-4"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <IcLogoutNav size={20} color="#E44A4A" />
            <span
              className="text-base font-bold"
              style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
            >
              Logout
            </span>
          </button>
        </div>

        {/* Footer */}
        <PoweredBy />
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl w-full max-w-xs pt-7 pb-5 px-4" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(5,188,109,0.15)" }}>
                <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#FFFFFF" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="16 17 21 12 16 7" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="21" y1="12" x2="9" y2="12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
            <h3
              className="text-center font-bold mb-2 mx-4"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              Are you sure you want to logout?
            </h3>
            <p
              className="text-center text-sm mb-5 mx-4"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              You can always log back in to access you feed simulations.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-full font-bold"
                style={{ backgroundColor: "#064E3B", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Yes, Logout
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-3 rounded-full font-bold"
                style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
