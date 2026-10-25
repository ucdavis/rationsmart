"use client";

import { useEffect } from "react";

// Keeps keyboard focus inside the top-most open dialog (audit B-30). Every
// sheet / confirm in the app is marked role="dialog" aria-modal="true", so a
// single document-level Tab handler covers all of them without per-dialog
// refs. It deliberately does NOT move focus when a dialog opens: auto-focusing
// the first field would pop the on-screen keyboard over the sheet on phones.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function topDialog(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(
    (el) =>
      el.getAttribute("aria-hidden") !== "true" && getComputedStyle(el).visibility !== "hidden"
  );
  return open[open.length - 1] ?? null;
}

export default function DialogFocusTrap() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const dialog = topDialog();
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && dialog.contains(active);
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
