"use client";

import { useEffect } from "react";

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
const ADMIN_THEME = "#C8E6C9"; // sage_breeze — first stop of bg_admin
const DEFAULT_THEME = "#FFFFFF";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
          background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {children}
    </>
  );
}
