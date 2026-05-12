"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SplashGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    // Never intercept back/forward — that's intentional in-app navigation
    if (nav?.type === "back_forward") return;
    // In-app navigation has same-origin referrer; skip those too
    const fromSameOrigin = document.referrer.startsWith(window.location.origin);
    if (nav?.type === "navigate" && fromSameOrigin) return;
    // Fresh start (reload or cold launch from outside) — show splash, not the last page
    document.body.style.visibility = "hidden";
    router.replace("/");
  }, []);

  return null;
}
