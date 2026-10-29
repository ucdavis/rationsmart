import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Snackbar from "@/components/ui/Snackbar";
import SplashGuard from "@/components/SplashGuard";
import InstallPrompt from "@/components/InstallPrompt";
import SplashOverlay from "@/components/SplashOverlay";
import NumberInputGuard from "@/components/NumberInputGuard";
import DialogFocusTrap from "@/components/DialogFocusTrap";
import { COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

// Nunito is self-hosted by next/font (downloaded at build time, served from
// /_next/static): no runtime request to Google, so the CSP can stay 'self'
// for fonts and styles. Exposed as --font-nunito for globals.css.
const nunito = Nunito({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-nunito",
});

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
    "msapplication-TileColor": COLORS.white,
  },
};

// The service worker is skipped on the testing deployment (DISABLE_PWA=true,
// see next.config.js). Only there do we also unregister SWs left behind by
// older visits; on a PWA-enabled build the kill-switch would undo the SW that
// next-pwa just registered.
const SW_DISABLED = process.env.DISABLE_PWA === "true";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is allowed (audit B-35 / WCAG 1.4.4). iOS Safari would
  // auto-zoom into any focused field under 16 px, so globals.css bumps input
  // text to 16 px on iOS only; Android keeps its 14 px exactly.
  // White status bar / Android system bar to match the Android app
  themeColor: COLORS.white,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <head>
        {/* manifest, theme-color, viewport and the apple-/mobile-web-app-*
            tags are emitted by the `metadata` / `viewport` exports above. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body
        style={{
          backgroundColor: COLORS.authenticWhite,
          margin: 0,
          padding: 0,
        }}
      >
        {/* SW kill-switch — testing deployment only (SW_DISABLED).
            Old visits installed a Workbox SW (via @ducanh2912/next-pwa).
            With NetworkFirst + 24h cache it served stale JS chunks for
            up to a day across rapid iteration. Inline <script> tags in
            <head> get stripped by Next.js App Router, so we use the
            `next/script` component with strategy="beforeInteractive"
            instead, which guarantees the unregister runs before any
            page-level JS. The testing project no longer registers a
            new SW (DISABLE_PWA=true in next.config.js); this script
            cleans up old SWs already installed on visitors' browsers. */}
        {SW_DISABLED && (
          <Script id="sw-kill" strategy="beforeInteractive">
            {`if(typeof navigator!=="undefined"&&navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});if(typeof caches!=="undefined"){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}}`}
          </Script>
        )}
        {/* Chromium can fire beforeinstallprompt before React hydrates, so
            InstallPrompt's own listener would miss it and the banner would
            never show. Capture it here, before any page JS; InstallPrompt
            picks it up from window.__rsInstallEvent on mount. */}
        <Script id="install-capture" strategy="beforeInteractive">
          {`window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__rsInstallEvent=e;});`}
        </Script>
        {/* SplashOverlay handles its own lifecycle: visible on SSR + first
            client render (no hydration mismatch), unmounts itself via
            useEffect once React has hydrated, and never re-renders on
            subsequent navigations. */}
        <SplashOverlay />
        <div
          className="app-column"
          style={{
            width: "100%",
            maxWidth: COLUMN_WIDTH,
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
          <SplashGuard />
          <NumberInputGuard />
          <DialogFocusTrap />
          {children}
          <Snackbar />
          <InstallPrompt />
        </div>
      </body>
    </html>
  );
}
