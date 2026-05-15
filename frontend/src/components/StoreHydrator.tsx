"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

// One-shot client component that re-hydrates the Zustand persist
// middleware after React has finished hydrating the SSR HTML. Paired
// with `skipHydration: true` in store.ts, this is the canonical fix for
// the React hydration mismatch warnings (#418 / #423) that come from
// the persist middleware reading localStorage synchronously on first
// access — which causes server render (initial state) and client first
// render (rehydrated state) to diverge.
export default function StoreHydrator() {
  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);
  return null;
}
