"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { expireSession, isSessionExpired, migrateLegacySession, useStore } from "@/lib/store";
import NavDrawer from "@/components/NavDrawer";
import { DrawerContext } from "@/lib/DrawerContext";
import { COLORS } from "@/lib/colors";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Zustand persist hydrates from localStorage on the client, but Next.js
  // SSR renders this layout with user=null (no localStorage on the server).
  // React's first client render must match the server snapshot for
  // hydration, so we initialise `hydrated` to false here, then flip it
  // true in a client-only effect — at which point the store's persisted
  // user value is reliably available. Redirecting before hydration would
  // bounce every authenticated refresh to /welcome, which is the bug the
  // user was hitting on every hard reload.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace("/welcome");
    }
  }, [hydrated, user, router]);

  // Reopening the app with a token that expired while it was closed ends the
  // session straight away instead of rendering screens whose calls will 401.
  useEffect(() => {
    if (hydrated && user && isSessionExpired(user)) expireSession();
  }, [hydrated, user]);

  // Move a pre-cookie session's localStorage token into the httpOnly cookie.
  const hasLegacyToken = !!user?.token;
  useEffect(() => {
    if (hydrated && hasLegacyToken) void migrateLegacySession();
  }, [hydrated, hasLegacyToken]);

  if (!hydrated || !user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: COLORS.authenticWhite }}
      >
        <div
          className="w-9 h-9 rounded-full animate-spin"
          style={{
            border: `3px solid ${COLORS.honeydew}`,
            borderTopColor: COLORS.darkAquamarineGreen,
          }}
        />
      </div>
    );
  }

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: COLORS.authenticWhite }}
      >
        <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </DrawerContext.Provider>
  );
}
