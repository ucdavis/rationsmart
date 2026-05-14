"use client";

import { useEffect } from "react";

// Admin section layout.
// 1. Paints the sage→mint gradient at the body level via a fixed-inset
//    div so it extends into any left/right safe-area-inset zone on
//    curved-display phones (the centred column above is transparent).
// 2. Swaps the document <meta name="theme-color"> to a sage value while
//    the user is on an admin route. On Android standalone PWAs, that
//    meta tag is what tints the system status bar — without this swap
//    the status bar stayed white (themeColor:#FFFFFF from the root
//    layout) even though the page content below it was green, leaving
//    an obvious white band at the top. Restored to "#FFFFFF" on unmount
//    so other screens get the normal white status bar back.
const ADMIN_THEME = "#C8E6C9";  // sage_breeze — first stop of bg_admin
const DEFAULT_THEME = "#FFFFFF";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 1. Sync the status-bar tint with the admin gradient.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ADMIN_THEME);
    // 2. Paint the gradient on the <body> itself — covers safe-area
    //    left/right zones, scrollbar gutters, and any pixel-level gap
    //    that the centred column can't reach because it stops at the
    //    column boundary.
    const prevBg = document.body.style.background;
    document.body.style.background = "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)";
    document.body.style.backgroundAttachment = "fixed";
    return () => {
      if (meta) meta.setAttribute("content", DEFAULT_THEME);
      document.body.style.background = prevBg;
      document.body.style.backgroundAttachment = "";
    };
  }, []);

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
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
