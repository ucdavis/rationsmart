"use client";

import { useEffect, useState } from "react";

// Pre-hydration splash overlay. SSR renders it so the user sees
// branded content the moment the HTML reaches the browser (FCP). On
// the client we unmount it as soon as React has mounted — the page
// underneath is now hydrated and ready to take over.
//
// Why a component instead of a static <div> in layout.tsx?
// The static-div approach caused the overlay to reappear on every
// in-app navigation: the layout JSX always contained the div, the
// pre-hydration inline script removed it from the DOM, then React
// reconciled (saw the JSX still expected it) and put it right back.
// Result: the white splash flashed on top of every page.
//
// A stateful component instead: SSR + first client render both have
// visible=true (no hydration mismatch). useEffect flips it to false
// the moment React has finished hydrating. After that point the
// component renders null on every subsequent render, including the
// next-page render after a router push.
export default function SplashOverlay() {
  const [visible, setVisible] = useState(true);
  useEffect(() => { setVisible(false); }, []);
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
