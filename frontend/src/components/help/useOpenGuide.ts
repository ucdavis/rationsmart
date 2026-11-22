"use client";

// N16 / N20: opens a printable guide (PDF) in a new tab. The tab is opened on
// the tap itself (a tab opened after the wait is blocked as a pop-up), and
// only sent to the PDF once `check` has loaded it — a 503 or no internet shows
// the help message on this screen instead of raw JSON in the tab. The guides
// are cached for 5 minutes, so the tab is then served from the browser cache.
import { useState } from "react";
import { helpErrorMessage } from "./HelpParts";

export function useOpenGuide<K extends string>() {
  const [opening, setOpening] = useState<K | null>(null);
  /** English message to show via t(), or null. */
  const [error, setError] = useState<string | null>(null);

  const openGuide = async (key: K, check: () => Promise<void>, href: string) => {
    if (opening) return;
    setError(null);
    setOpening(key);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      await check();
      if (tab) tab.location.href = href;
      else window.location.assign(href);
    } catch (err) {
      tab?.close();
      setError(helpErrorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  return { opening, error, openGuide };
}
