"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import NavDrawer from "@/components/NavDrawer";
import { DrawerContext } from "@/lib/DrawerContext";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/welcome");
    }
  }, [user, router]);

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: "#F8FAF9" }}
      >
        <div
          className="w-9 h-9 rounded-full animate-spin"
          style={{
            border: "3px solid #F0FDF4",
            borderTopColor: "#064E3B",
          }}
        />
      </div>
    );
  }

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: "#F8FAF9" }}
      >
        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </DrawerContext.Provider>
  );
}
