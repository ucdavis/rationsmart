"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export default function Snackbar() {
  const snackbar = useStore((s) => s.snackbar);
  const hideSnackbar = useStore((s) => s.hideSnackbar);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!snackbar?.visible) return;
    setExiting(false);

    const dismissTimer = setTimeout(() => {
      setExiting(true);
    }, 2800);

    const removeTimer = setTimeout(() => {
      hideSnackbar();
      setExiting(false);
    }, 3100);

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(removeTimer);
    };
  }, [snackbar?.visible, hideSnackbar]);

  if (!snackbar || !snackbar.visible) return null;

  // Matches Android showCustomSnackBar (Ext.kt):
  // SUCCESS = dark_aquamarine_green #064E3B / white text
  // ERROR   = mustard #FFDB58 / raisin_black #231F20 text
  // INFO    = azure #007BFF / white text
  const styleMap = {
    success: { bg: "#064E3B", text: "#FFFFFF" },
    error:   { bg: "#FFDB58", text: "#231F20" },
    info:    { bg: "#007BFF", text: "#FFFFFF" },
  };
  const s = styleMap[snackbar.type];

  const iconMap = {
    success: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 12l5 5L20 7" stroke={s.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    error: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={s.text} strokeWidth="2" />
        <path d="M12 7v6M12 16v1" stroke={s.text} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    info: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={s.text} strokeWidth="2" />
        <path d="M12 8v6M12 16v1" stroke={s.text} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <div
      className={exiting ? "snackbar-exit" : "snackbar-enter"}
      style={{
        // Android: gravity = TOP | CENTER_HORIZONTAL (snackbar shows at top)
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        right: 12,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 12px 12px 14px",
        borderRadius: 16,
        backgroundColor: s.bg,
        color: s.text,
        fontFamily: "Nunito, sans-serif",
        fontWeight: 700,
        fontSize: 16,
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <div style={{ flexShrink: 0 }}>{iconMap[snackbar.type]}</div>
      <span style={{ flex: 1 }}>{snackbar.message}</span>
      {/* Close button — white circle with the snackbar's bg color as the X tint (matches Android cv_close) */}
      <button
        onClick={() => {
          setExiting(true);
          setTimeout(() => hideSnackbar(), 220);
        }}
        style={{
          background: "#FFFFFF",
          border: "none",
          cursor: "pointer",
          padding: 6,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 2L12 12M12 2L2 12" stroke={s.bg} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
