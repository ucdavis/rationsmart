"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";

export default function SplashScreen() {
  const router = useRouter();
  const user = useStore((s) => s.user);

  // The pre-hydration splash overlay is now a self-managing
  // <SplashOverlay /> component in the root layout — no manual
  // overlay.remove() needed here.

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
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div />
      <AppBranding />
      <PoweredBy />
    </div>
  );
}
