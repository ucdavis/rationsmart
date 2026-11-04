"use client";

import { useState } from "react";
import type { CattleInfo } from "@/lib/api";
import { useStore } from "@/lib/store";
import { filledFeedCount } from "@/lib/feed-selection-rules";
import CountryChangeDialog from "./CountryChangeDialog";

/**
 * N8: Cattle Info → Continue. The filled feed cards belong to the SAVED
 * country, so switching to another one asks first and then clears them.
 * Compared with the saved cattleInfo, not the form's last pick, so
 * Kenya → India → Kenya asks nothing; a restore saves its own country, so
 * it never trips this either. `proceed` is what Continue does today.
 */
export function useCountryChange(proceed: (info: CattleInfo) => void, t: (s: string) => string) {
  const [pending, setPending] = useState<{ info: CattleInfo; count: number } | null>(null);

  const continueWith = (info: CattleInfo) => {
    const { cattleInfo, feedSelections } = useStore.getState();
    const saved = cattleInfo?.country_id ? String(cattleInfo.country_id) : "";
    const filled = filledFeedCount(feedSelections);
    if (saved && saved !== String(info.country_id) && filled > 0) {
      setPending({ info, count: filled });
      return;
    }
    proceed(info);
  };

  const dialog = pending && (
    <CountryChangeDialog
      count={pending.count}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null);
        // Every card goes: feed, price, quantity, inclusion limits.
        useStore.getState().setFeedSelections([]);
        proceed(pending.info);
      }}
      t={t}
    />
  );

  return { continueWith, dialog };
}
