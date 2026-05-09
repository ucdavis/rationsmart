"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed as standalone PWA — hide everything
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if user permanently dismissed
    if (sessionStorage.getItem("install_dismissed") === "1") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Show banner after 3 seconds regardless of whether event fired
    const timer = setTimeout(() => setShow(true), 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") {
        setShow(false);
        return;
      }
    } else {
      // No event available — show manual instructions
      setShowInstructions(true);
      return;
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem("install_dismissed", "1");
    setDismissed(true);
    setShow(false);
    setShowInstructions(false);
  };

  if (dismissed || !show) return null;

  // Manual instructions sheet
  if (showInstructions) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={() => setShowInstructions(false)}
      >
        <div
          className="bg-white rounded-t-2xl p-6 w-full pb-10"
          style={{ maxWidth: 430, boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-lg font-bold mb-4 text-center" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Install RationSmart
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#064E3B" }}>
                <span className="text-white text-sm font-bold" style={{ fontFamily: "Nunito, sans-serif" }}>1</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Tap the menu icon</p>
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Tap the <strong>⋮</strong> (three dots) button in the top-right corner of Chrome</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#064E3B" }}>
                <span className="text-white text-sm font-bold" style={{ fontFamily: "Nunito, sans-serif" }}>2</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Tap "Add to Home screen"</p>
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Scroll down in the menu and tap "Add to Home screen"</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#064E3B" }}>
                <span className="text-white text-sm font-bold" style={{ fontFamily: "Nunito, sans-serif" }}>3</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Tap "Add"</p>
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Confirm by tapping "Add" — the app icon will appear on your home screen</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-full mt-6 py-3.5 rounded-full font-bold text-sm"
            style={{ backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // Install banner
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50" style={{ maxWidth: 430, margin: "0 auto", left: "50%", transform: "translateX(-50%)" }}>
      <div
        className="mx-3 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: "#064E3B", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      >
        <img src="/icon-192.png" alt="RationSmart" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: "#FFFFFF", fontFamily: "Nunito, sans-serif" }}>
            Install RationSmart
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Nunito, sans-serif" }}>
            Add to home screen for app experience
          </p>
        </div>

        <button
          onClick={handleDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <button
          onClick={handleInstall}
          className="rounded-full px-4 py-1.5 text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: "#1CA069", color: "#FFFFFF", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
