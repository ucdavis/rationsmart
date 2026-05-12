"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    // Don't show on splash screen or if already running as installed PWA
    if (pathname === "/") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Always show the banner after 1.5s
    const t = setTimeout(() => setVisible(true), 1500);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(t);
    };
  }, []);

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") setVisible(false);
    } else {
      setShowSteps(true);
    }
  };

  if (!visible) return null;

  if (showSteps) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
        onClick={() => setShowSteps(false)}
      >
        <div
          style={{
            backgroundColor: "#fff", borderRadius: "16px 16px 0 0",
            padding: "24px 24px 40px", width: "100%", maxWidth: 430,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ fontSize: 18, fontWeight: 700, color: "#064E3B", fontFamily: "Nunito, sans-serif", textAlign: "center", marginBottom: 20 }}>
            Install RationSmart
          </p>
          {[
            { n: 1, title: 'Tap the ⋮ menu', desc: 'Tap the three-dot menu button at the top-right of Chrome' },
            { n: 2, title: '"Add to Home screen"', desc: 'Scroll and tap "Add to Home screen" in the menu' },
            { n: 3, title: 'Tap "Add"', desc: 'Confirm by tapping "Add" — the app icon appears on your home screen' },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#064E3B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "Nunito, sans-serif" }}>{n}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#231F20", fontFamily: "Nunito, sans-serif", margin: 0 }}>{title}</p>
                <p style={{ fontSize: 12, color: "#6D6D6D", fontFamily: "Nunito, sans-serif", margin: "2px 0 0" }}>{desc}</p>
              </div>
            </div>
          ))}
          <button
            onClick={() => setVisible(false)}
            style={{ width: "100%", marginTop: 8, padding: "14px", borderRadius: 999, backgroundColor: "#064E3B", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 430, padding: "0 12px 16px",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            backgroundColor: "#064E3B", borderRadius: 16,
            padding: "12px 12px 12px 12px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <img src="/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "Nunito, sans-serif", margin: 0 }}>Install RationSmart</p>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, fontFamily: "Nunito, sans-serif", margin: "2px 0 0" }}>Add to home screen for app experience</p>
          </div>
          <button
            onClick={() => setVisible(false)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={handleInstall}
            style={{ backgroundColor: "#1CA069", color: "#fff", border: "none", borderRadius: 999, padding: "8px 16px", fontWeight: 700, fontSize: 13, fontFamily: "Nunito, sans-serif", cursor: "pointer", flexShrink: 0 }}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
