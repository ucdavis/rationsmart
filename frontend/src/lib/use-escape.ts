"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `onEscape` when Escape is pressed while `active` is true — the
 * keyboard equivalent of tapping a sheet's scrim (audit B-30). The latest
 * callback is read through a ref so callers can pass an inline arrow.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
