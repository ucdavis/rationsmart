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

// User options order matches Android NavigationDrawerItem.userOptions exactly
const userMenuItems = [
  { label: "Profile", href: "/profile", icon: <IcProfileNav size={20} color="#064E3B" /> },
  { label: "Feed Reports", href: "/reports", icon: <IcReportNav size={20} color="#064E3B" /> },
  { label: "Help & Support", href: "/help", icon: <IcHelpSupport size={20} color="#064E3B" /> },
  { label: "Feedback", href: "/feedback", icon: <IcFeedbackNav size={20} color="#064E3B" /> },
  { label: "Terms & Conditions", href: "/terms", icon: <IcTerms size={20} color="#064E3B" /> },
];

// Admin options: Admin first, then same as userOptions
const adminMenuItems = [
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

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 h-full z-50 flex flex-col bg-white"
        style={{
          width: "82%",
          maxWidth: 340,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.15)" : "none",
        }}
      >
        {/* Close button + Profile */}
        <div className="flex items-start justify-between pt-12 pb-4 px-4">
          {/* Profile section */}
          <div className="flex items-center gap-3 flex-1 min-w-0 mt-1">
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 52, height: 52, backgroundColor: "#F0FDF4" }}
            >
              <IcUser size={30} color="#064E3B" />
            </div>
            <div className="min-w-0">
              <p
                className="text-base font-bold truncate"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
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

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 36, height: 36, backgroundColor: "#F0FDF4", marginLeft: 8 }}
            aria-label="Close drawer"
          >
            <IcClose size={18} color="#064E3B" />
          </button>
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
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div className="flex items-center gap-3">
                  <div style={{ width: 20, flexShrink: 0 }}>{item.icon}</div>
                  <span
                    className="text-base"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  >
                    {item.label}
                  </span>
                </div>
                <IcArrowRight size={16} color="#6D6D6D" />
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h3
              className="text-lg font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              Logout
            </h3>
            <p
              className="text-base mb-6"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            >
              Are you sure you want to logout?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-2xl font-bold"
                style={{
                  border: "2px solid #064E3B",
                  color: "#064E3B",
                  background: "white",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 rounded-2xl font-bold"
                style={{
                  backgroundColor: "#E44A4A",
                  color: "white",
                  border: "none",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
