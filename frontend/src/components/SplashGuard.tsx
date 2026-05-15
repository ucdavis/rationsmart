"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SplashGuard() {
  const router = useRouter();
  const pathname = usePathname();

  // Auth / public pages that should NEVER be redirected to splash —
  // typing /welcome (or any of these) into the URL bar lands the user
  // directly there, no 2s splash detour. Listing the explicit set is
  // simpler than trying to derive it from the auth state because we
  // run before the persist store rehydrates.
  const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register", "/forgot-pin", "/terms", "/help"]);

  useEffect(() => {
    // The inline script in layout.tsx hides the body on every non-"/"
    // path to avoid flashing the previous page. Whenever we decide
    // NOT to redirect we have to unhide it ourselves.
    const restoreBody = () => { document.body.style.visibility = "visible"; };

    if (pathname === "/") {
      // Splash page handles its own visibility / overlay removal.
      return;
    }

    // Auth / public pages bypass the splash redirect entirely.
    if (PUBLIC_PATHS.has(pathname)) { restoreBody(); return; }

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
    // IMPORTANT: deps are [] on purpose. The decision is made once on
    // the very first mount of the root layout. A previous attempt that
    // used [pathname, router] introduced an infinite redirect loop:
    //   1. /welcome → effect redirects to /
    //   2. / mounts → pathname changes → effect re-fires (early return)
    //   3. splash's 2s timer redirects back to /welcome
    //   4. pathname changes to /welcome → effect re-fires → redirects to /
    //   5. … loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
