"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { COLORS, ADMIN_BACKGROUND } from "@/lib/colors";

// Admin section layout.
// 1. Paints the sage→mint gradient *inside* the centred 480-px column
//    (position: absolute, anchored to the column's relative parent in
//    the root layout) — so on desktop Chrome it stays inside the mobile
//    frame instead of spilling edge-to-edge like a desktop site. On
//    real phones the column already equals the viewport width so the
//    gradient still fills the entire screen.
// 2. Swaps <meta name="theme-color"> to a sage value while on admin
//    routes. On Android standalone PWAs that meta tag tints the system
//    status bar — without it the bar stays white (themeColor #FFFFFF
//    from the root layout) over green page content, leaving a visible
//    band at the top. Restored on unmount.
// 3. One role guard for EVERY admin route (several sub-pages had none).
//    (main)/layout only renders children after the persisted store has
//    hydrated, so `user` here is the real value, never the SSR `null`.
//    This is a UX gate only — `is_admin` lives in client storage and can be
//    edited, so the backend must (and is expected to) 403 every
//    /v1/admin/* call for non-admins. Audit A-06.
const ADMIN_THEME = COLORS.sageBreeze; // sage_breeze — first stop of bg_admin
const DEFAULT_THEME = COLORS.white;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const denied = !!user && !user.is_admin;

  useEffect(() => {
    if (denied) router.replace("/cattle-info");
  }, [denied, router]);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ADMIN_THEME);
    return () => {
      if (meta) meta.setAttribute("content", DEFAULT_THEME);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: ADMIN_BACKGROUND,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {denied ? null : children}
    </>
  );
}
