"use client";

import { useEffect } from "react";

// Browsers increment / decrement a focused <input type="number"> on
// every mouse-wheel tick, so scrolling the page after tapping into a
// field — Days In Milk, Body Weight, Quantity, etc — silently mutates
// the value. The user explicitly wants the value to change only via
// keyboard input or the spinner buttons. Capture wheel at the document
// level, and when the focused element is a numeric input, suppress the
// default. `passive: false` is required because preventDefault on wheel
// is otherwise a no-op in recent Chrome.
export default function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement &&
        t.type === "number" &&
        document.activeElement === t
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
