"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Pre-hydration splash overlay. SSR renders it so the user sees
// branded RationSmart content the moment the HTML reaches the browser
// (FCP). After React hydrates we unmount it; never re-renders on
// in-app navigation thereafter.
//
// Path-aware duration:
// - On "/" (the splash route): stay visible for SPLASH_DURATION_MS so
//   the user sees the branded screen for the full splash window even
//   though the React splash page underneath has already painted its
//   own AppBranding. The splash page's 2s redirect timer ticks in
//   parallel — both finish at roughly the same moment, so the user
//   sees a clean cross-fade into /welcome or /cattle-info.
// - Anywhere else: hide immediately after mount. We don't want a 2s
//   splash to interrupt a hard refresh on /cattle-info or an in-app
//   navigation.
const SPLASH_DURATION_MS = 2000;

export default function SplashOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (pathname !== "/") {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!visible) return null;
  return (
    <div
      id="pwa-splash"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "64px 0 24px",
      }}
    >
      <div />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/app_logo.png"
            alt="RationSmart"
            width={80}
            height={80}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <p
          style={{
            color: "#064E3B",
            fontWeight: 700,
            fontSize: 20,
            margin: "12px 0 0",
            fontFamily: "Nunito, sans-serif",
          }}
        >
          RationSmart
        </p>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#6D6D6D", fontSize: 14, margin: 0, fontFamily: "Nunito, sans-serif" }}>
          POWERED BY
        </p>
        <p
          style={{
            color: "#064E3B",
            fontSize: 14,
            margin: "2px 0 0",
            fontFamily: "Nunito, sans-serif",
          }}
        >
          DigitalGreen
        </p>
      </div>
    </div>
  );
}
