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

  const colorMap = {
    success: "#05BC6D",
    error: "#E44A4A",
    info: "#1565C0",
  };

  const iconMap = {
    success: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="10" fill="rgba(255,255,255,0.25)" />
        <path d="M5.5 10.5L8.5 13.5L14.5 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    error: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="10" fill="rgba(255,255,255,0.25)" />
        <path d="M7 7L13 13M13 7L7 13" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    info: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="10" fill="rgba(255,255,255,0.25)" />
        <path d="M10 9V14M10 7V6.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <div
      className={exiting ? "snackbar-exit" : "snackbar-enter"}
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        left: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 16,
        backgroundColor: colorMap[snackbar.type],
        color: "white",
        fontFamily: "Nunito, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <div style={{ flexShrink: 0 }}>{iconMap[snackbar.type]}</div>
      <span style={{ flex: 1 }}>{snackbar.message}</span>
      <button
        onClick={() => {
          setExiting(true);
          setTimeout(() => hideSnackbar(), 220);
        }}
        style={{
          background: "none",
          border: "none",
          color: "white",
          cursor: "pointer",
          opacity: 0.75,
          padding: 0,
          display: "flex",
          alignItems: "center",
        }}
        aria-label="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
