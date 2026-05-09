import type { Metadata, Viewport } from "next";
import "./globals.css";
import Snackbar from "@/components/ui/Snackbar";
import SplashGuard from "@/components/SplashGuard";
import InstallPrompt from "@/components/InstallPrompt";

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
    "msapplication-TileColor": "#1CA069",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1CA069",
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
        <meta name="theme-color" content="#1CA069" />
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
        <div
          style={{
            maxWidth: 430,
            margin: "0 auto",
            minHeight: "100vh",
            position: "relative",
            backgroundColor: "#F8FAF9",
          }}
        >
          <SplashGuard />
          {children}
          <Snackbar />
          <InstallPrompt />
        </div>
      </body>
    </html>
  );
}
