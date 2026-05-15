"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SplashGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Make sure the body is visible regardless of what we decide
    // below — the inline script in layout.tsx hides it on every non-"/"
    // path to avoid flashing the previous page, so if we ever NOT
    // redirect, we have to unhide it ourselves.
    const restoreBody = () => { document.body.style.visibility = "visible"; };

    if (pathname === "/") {
      // Splash page handles its own visibility / overlay removal.
      return;
    }

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

    // Never intercept back/forward — that's intentional in-app navigation.
    if (nav?.type === "back_forward") { restoreBody(); return; }

    // Hard refresh / browser reload — the user is intentionally
    // re-loading the current page. Don't kick them to splash + sit on
    // a 2-second branded timer; that's why the app felt "stuck on
    // splash" after a refresh. Just unhide the body and stay put.
    if (nav?.type === "reload") { restoreBody(); return; }

    // In-app navigation: same-origin referrer means a link/router push.
    const fromSameOrigin = document.referrer.startsWith(window.location.origin);
    if (nav?.type === "navigate" && fromSameOrigin) { restoreBody(); return; }

    // Genuine cold launch from outside the app (PWA icon tap, typed
    // URL, share link, etc.) — show the splash, not whatever the
    // service worker last cached. Body is still hidden by the inline
    // script in layout.tsx so the redirect is silent.
    router.replace("/");
  }, [pathname, router]);

  return null;
}
