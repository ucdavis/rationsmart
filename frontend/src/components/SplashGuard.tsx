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
    if (pathname === "/") return;
    if (PUBLIC_PATHS.has(pathname)) return;

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

    // In-app navigation we should never interrupt.
    if (nav?.type === "back_forward") return;
    if (nav?.type === "reload") return;
    const fromSameOrigin = document.referrer.startsWith(window.location.origin);
    if (nav?.type === "navigate" && fromSameOrigin) return;

    // Cold launch from outside the app (PWA icon tap, typed URL,
    // share link) — show the splash so service-worker cached content
    // doesn't surface stale data.
    router.replace("/");
    // Deps are [] on purpose — see commit history. A prior attempt
    // with [pathname, router] caused an infinite redirect loop on
    // /welcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
