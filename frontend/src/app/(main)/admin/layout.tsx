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
const ADMIN_THEME = "#C8E6C9";  // sage_breeze — first stop of bg_admin
const DEFAULT_THEME = "#FFFFFF";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ADMIN_THEME);

    // On phones the 480-px column equals the viewport, but if the
    // device has curved edges / non-zero safe-area-inset-left|right
    // (or the viewport is just slightly wider than 480), the body
    // background — #F8FAF9 off-white from globals.css — peeks through
    // on both sides as white padding. Mirror the gradient onto <body>
    // only at mobile widths so it fills the entire screen on phones,
    // while leaving the mobile-frame look intact on desktop.
    const GRADIENT = "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)";
    const mq = window.matchMedia("(max-width: 480px)");
    const apply = () => {
      if (mq.matches) {
        document.body.style.background = GRADIENT;
        document.body.style.backgroundAttachment = "fixed";
      } else {
        document.body.style.background = "";
        document.body.style.backgroundAttachment = "";
      }
    };
    apply();
    mq.addEventListener("change", apply);

    return () => {
      if (meta) meta.setAttribute("content", DEFAULT_THEME);
      mq.removeEventListener("change", apply);
      document.body.style.background = "";
      document.body.style.backgroundAttachment = "";
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
