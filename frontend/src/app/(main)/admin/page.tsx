"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import {
  IcFeedManagement,
  IcUserManagement,
  IcFeedbackManagement,
  IcReportNav,
  IcBulkUpload,
} from "@/components/Icons";

interface AdminCard {
  title: string;
  href: string;
  icon: React.ReactNode;
}

const adminCards: AdminCard[] = [
  { title: "User Management", href: "/admin/users", icon: <IcUserManagement size={28} color="#064E3B" /> },
  { title: "Feed Management", href: "/admin/feeds", icon: <IcFeedManagement size={28} color="#064E3B" /> },
  { title: "Feedback Management", href: "/admin/feedback", icon: <IcFeedbackManagement size={28} color="#064E3B" /> },
  { title: "Bulk Upload", href: "/admin/bulk-upload", icon: <IcBulkUpload size={28} color="#064E3B" /> },
  { title: "Feed Reports", href: "/admin/reports", icon: <IcReportNav size={28} color="#064E3B" /> },
];

export default function AdminPage() {
  const router = useRouter();
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (user && !user.is_admin) {
      router.replace("/cattle-info");
    }
  }, [user, router]);

  if (!user?.is_admin) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <Toolbar type="back" title="Admin" onBack={() => router.back()} />
        <div
          className="flex items-center justify-center rounded-full mb-5 mt-10"
          style={{ width: 80, height: 80, backgroundColor: "rgba(228,74,74,0.2)" }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="15" stroke="#E44A4A" strokeWidth="2" />
            <path d="M18 12v8M18 23v1" stroke="#E44A4A" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-xl font-bold mb-2" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>
          Access Denied
        </p>
        <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          You do not have admin permissions to view this page.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}
    >
      <Toolbar type="back" title="Admin" onBack={() => router.back()} />

      <div className="px-3 mt-5 pb-8">
        {/* Grid of admin cards — 2 per row */}
        <div className="grid grid-cols-2 gap-3">
          {adminCards.map((card) => (
            <button
              key={card.title}
              onClick={() => router.push(card.href)}
              className="flex flex-col items-start bg-white py-8 px-5"
              style={{
                borderRadius: 30,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                border: "none",
                cursor: "pointer",
                transition: "transform 0.12s",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div
                className="flex items-center justify-center mb-5"
                style={{ width: 48, height: 48, backgroundColor: "#E8F5E9", borderRadius: 16 }}
              >
                {card.icon}
              </div>
              <p
                className="text-base font-bold text-left"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
              >
                {card.title}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
