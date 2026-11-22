"use client";

import { useCallback, useEffect, useState } from "react";
import { getHelpIndex, type HelpIndex } from "@/lib/api";
import { useUiLang } from "@/lib/i18n-ui";
import { helpErrorMessage } from "./HelpParts";

/**
 * The language help is asked for and shown in: always the user's profile
 * language (before sign-in, the device's last-used one), whichever screen
 * opened it — never a simulation's language or a stale `?lang=` in the URL.
 */
export function useHelpLang(): string {
  return useUiLang();
}

/** The help index for `lang`; `error` is the English message to show via t(). */
export function useHelpIndex(lang: string) {
  return useManualIndex(useCallback(() => getHelpIndex(lang), [lang]));
}

/**
 * An index from any loader (User Manual or Admin Manual, N19); it is fetched
 * again whenever `load` changes, so pass a stable (memoized) function.
 */
export function useManualIndex(load: () => Promise<HelpIndex>) {
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load()
      .then((next) => {
        if (!cancelled) setIndex(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(helpErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  return { index, error, retry: () => setAttempt((n) => n + 1) };
}
