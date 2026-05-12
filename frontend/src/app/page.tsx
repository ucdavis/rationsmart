"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";

export default function SplashScreen() {
  const router = useRouter();
  const user = useStore((s) => s.user);

  useEffect(() => {
    // Remove the HTML-level splash overlay — React has taken over, the content below is ready.
    // Also restore body visibility in case SplashGuard hid it on a redirect from another path.
    const overlay = document.getElementById("pwa-splash");
    if (overlay) overlay.remove();
    document.body.style.visibility = "visible";
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        router.replace("/cattle-info");
      } else {
        router.replace("/welcome");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, router]);

  return (
    <div
      className="flex flex-col items-center justify-between min-h-screen py-16"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <div />
      <AppBranding />
      <PoweredBy />
    </div>
  );
}
