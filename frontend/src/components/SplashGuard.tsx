"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SplashGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (nav?.type === "reload") {
      router.replace("/");
    }
  }, []);

  return null;
}
