"use client";

import { useRef } from "react";

/**
 * A ref that always holds the latest `value`. For effects that should run
 * only when their real inputs change (e.g. fetch on mount / on country
 * change) but still read the current translator, snackbar or callback when
 * they finish — without listing those in the dependency array (useT()
 * returns a new function every render, so listing it would refetch in a
 * loop). Replaces eslint-disable comments (audit B-20).
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
