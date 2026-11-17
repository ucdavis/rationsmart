"use client";

// N11: ❓ → help → Back must leave a screen's form as the user left it. Most
// screens keep their state in the store already (Feed Selection); a form that
// only saves on Continue (Cattle Info) hands its unsaved values here when the
// user opens help, and takes them back when it mounts again. Memory only —
// a reload starts from the saved state as before.
import { useEffect } from "react";
import { useLatestRef } from "./use-latest";

const drafts = new Map<string, unknown>();
let openingHelpFrom: string | null = null;

/** HelpButton calls this just before it navigates to help. */
export function markHelpOpened(screen: string) {
  openingHelpFrom = screen;
}

/** The values `screen` had when help was opened from it, if any. */
export function peekHelpDraft<T>(screen: string): T | undefined {
  return drafts.get(screen) as T | undefined;
}

// Called from the unmount cleanup: it wants the form as it is at that moment
// (the latest render), which is exactly what the ref holds.
function keepIfOpeningHelp(screen: string, latest: { current: unknown }) {
  if (openingHelpFrom !== screen) return;
  drafts.set(screen, latest.current);
  openingHelpFrom = null;
}

/** Keep `value` across a trip to help; the draft is used once, on the next mount. */
export function useKeepOnHelp<T>(screen: string, value: T) {
  const latest = useLatestRef(value);
  useEffect(() => {
    // Read in the initial state by now (peekHelpDraft) — don't restore it twice.
    drafts.delete(screen);
    return () => keepIfOpeningHelp(screen, latest);
  }, [screen, latest]);
}
