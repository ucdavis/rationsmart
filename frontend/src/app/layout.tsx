import type { Metadata, Viewport } from "next";
import "./globals.css";
import Snackbar from "@/components/ui/Snackbar";
import SplashGuard from "@/components/SplashGuard";
import InstallPrompt from "@/components/InstallPrompt";
import StoreHydrator from "@/components/StoreHydrator";

export const metadata: Metadata = {
  title: "RationSmart",
  description: "Smart cattle feed ration formulation",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RationSmart",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#FFFFFF",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // White status bar / Android system bar to match the Android app
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RationSmart" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FFFFFF" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body
        style={{
          fontFamily: "Nunito, sans-serif",
          backgroundColor: "#F8FAF9",
          margin: 0,
          padding: 0,
        }}
      >
        {/*
          HTML-level splash overlay — painted in the same frame as the HTML parse,
          so Chrome's auto-generated PWA splash is dismissed immediately (FCP fires).
          On "/" the React splash page removes this div once it mounts.
          On any other path the inline script removes it right away and hides the body
          so SplashGuard can redirect without any flash.
        */}
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.getElementById('pwa-splash');if(location.pathname!=='/'){s&&s.remove();document.body.style.visibility='hidden';}})();`,
          }}
        />
        <div
          style={{
            width: "100%",
            maxWidth: "min(100vw, 480px)",
            margin: "0 auto",
            // 100dvh (dynamic viewport height) includes the system gesture
            // / nav bar area on Android, so a page's min-h-screen background
            // extends all the way to the bottom edge instead of stopping at
            // 100vh and exposing a white strip below the home indicator.
            minHeight: "100dvh",
            position: "relative",
            // The centered column itself should NOT impose a colour. Each
            // page owns its background (white for the regular screens,
            // sage→mint gradient for admin). Leaving this opaque white
            // showed thin white strips around admin pages whenever the
            // page content didn't fill 100% of the column (status-bar
            // / gesture-bar / screen-edge curvature in standalone mode).
            backgroundColor: "transparent",
          }}
        >
          <StoreHydrator />
          <SplashGuard />
          {children}
          <Snackbar />
          <InstallPrompt />
        </div>
      </body>
    </html>
  );
}
