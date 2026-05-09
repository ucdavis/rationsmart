"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setInstallEvent(null);
  };

  if (isInstalled || dismissed || !installEvent) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{ maxWidth: 430, margin: "0 auto", left: "50%", transform: "translateX(-50%)" }}
    >
      <div
        className="w-full mx-3 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: "#064E3B", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      >
        {/* App icon */}
        <img src="/icon-192.png" alt="RationSmart" style={{ width: 40, height: 40, borderRadius: 10 }} />

        {/* Text */}
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: "#FFFFFF", fontFamily: "Nunito, sans-serif" }}>
            Install RationSmart
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Nunito, sans-serif" }}>
            Add to home screen for the best experience
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          aria-label="Dismiss"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4l10 10M14 4L4 14" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Install button */}
        <button
          onClick={handleInstall}
          className="rounded-full px-4 py-1.5 text-sm font-bold"
          style={{ backgroundColor: "#1CA069", color: "#FFFFFF", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", whiteSpace: "nowrap" }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
