"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n-ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Detect iOS / iPadOS. iPadOS reports as Mac on UA — also check touch +
// platform so iPad in desktop-Safari mode still triggers. We treat any
// iOS browser the same way (Chrome/Firefox on iOS use WebKit and follow
// the same Share → Add to Home Screen path).
function detectIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

// iOS standalone uses a non-standard `navigator.standalone` flag, not the
// `display-mode: standalone` media query that Chromium PWAs use.
function isStandaloneAnyPlatform(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const t = useT();

  // Always capture the install event — Chrome fires it early at load time,
  // before any navigation happens, so this must run unconditionally on mount.
  // For iOS, beforeinstallprompt never fires — we capture isIOS once and
  // drive the prompt via the manual Share → Add to Home Screen flow.
  useEffect(() => {
    if (isStandaloneAnyPlatform()) return;

    setIsIOS(detectIOS());

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Android only removes the home-screen shortcut when the user "uninstalls"
    // the PWA — it does NOT clear localStorage. So stale auth data from a
    // previous session survives a reinstall and sends the user straight to the
    // home screen instead of login. Clearing storage on every install/reinstall
    // guarantees a fresh start. (iOS does not fire appinstalled.)
    const onInstalled = () => {
      localStorage.removeItem("rationsmart-storage");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Show the banner only after leaving the splash screen.
  // On iOS we don't need the beforeinstallprompt event to show the banner —
  // the banner is informational (tells the user to tap Share → Add).
  useEffect(() => {
    if (pathname === "/") return;
    if (isStandaloneAnyPlatform()) return;
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [pathname]);

  const handleInstall = async () => {
    // iOS path: show manual Share → Add to Home Screen instructions.
    // No programmatic install API exists on iOS Safari.
    if (isIOS || !installEvent) {
      setShowSteps(true);
      return;
    }
    // Chromium path: use the native install prompt.
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      localStorage.removeItem("rationsmart-storage");
      setVisible(false);
    }
  };

  if (!visible) return null;

  if (showSteps) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
        onClick={() => setShowSteps(false)}
      >
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "16px 16px 0 0",
            padding: "24px 24px 40px",
            width: "100%",
            maxWidth: "min(100vw, 480px)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#064E3B",
              fontFamily: "Nunito, sans-serif",
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {t("Install RationSmart")}
          </p>
          <p
            style={{
              fontSize: 12,
              color: "#6D6D6D",
              fontFamily: "Nunito, sans-serif",
              textAlign: "center",
              margin: "0 0 20px",
            }}
          >
            {isIOS
              ? t("Add to your iPhone home screen in 3 quick steps")
              : t("Add to your Android home screen in 3 quick steps")}
          </p>
          {(isIOS
            ? [
                {
                  n: 1,
                  title: t("Tap the Share button"),
                  desc: t(
                    "In Safari's bottom toolbar, tap the Share icon (square with an upward arrow)."
                  ),
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 3v12M8 7l4-4 4 4"
                        stroke="#1CA069"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
                        stroke="#1CA069"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ),
                },
                {
                  n: 2,
                  title: t('"Add to Home Screen"'),
                  desc: t('Scroll the share sheet and tap "Add to Home Screen".'),
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="3"
                        stroke="#1CA069"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 8v8M8 12h8"
                        stroke="#1CA069"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ),
                },
                {
                  n: 3,
                  title: t('Tap "Add"'),
                  desc: t(
                    "Confirm at the top-right — the RationSmart icon appears on your home screen."
                  ),
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12l5 5L20 7"
                        stroke="#1CA069"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ),
                },
              ]
            : [
                {
                  n: 1,
                  title: t("Tap the ⋮ menu"),
                  desc: t("Tap the three-dot menu button at the top-right of Chrome"),
                  icon: null,
                },
                {
                  n: 2,
                  title: t('"Add to Home screen"'),
                  desc: t('Scroll and tap "Add to Home screen" in the menu'),
                  icon: null,
                },
                {
                  n: 3,
                  title: t('Tap "Add"'),
                  desc: t('Confirm by tapping "Add" — the app icon appears on your home screen'),
                  icon: null,
                },
              ]
          ).map(({ n, title, desc, icon }) => (
            <div
              key={n}
              style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: "#064E3B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "Nunito, sans-serif",
                  }}
                >
                  {n}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#231F20",
                      fontFamily: "Nunito, sans-serif",
                      margin: 0,
                    }}
                  >
                    {title}
                  </p>
                  {icon}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#6D6D6D",
                    fontFamily: "Nunito, sans-serif",
                    margin: "2px 0 0",
                  }}
                >
                  {desc}
                </p>
              </div>
            </div>
          ))}
          <button
            onClick={() => setVisible(false)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "14px",
              borderRadius: 999,
              backgroundColor: "#064E3B",
              color: "#fff",
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            {t("Got it")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "min(100vw, 480px)",
          padding: "0 12px 16px",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            backgroundColor: "#064E3B",
            borderRadius: 16,
            padding: "12px 12px 12px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <img
            src="/icon-192.png"
            alt=""
            style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                fontFamily: "Nunito, sans-serif",
                margin: 0,
              }}
            >
              {t("Install RationSmart")}
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: 11,
                fontFamily: "Nunito, sans-serif",
                margin: "2px 0 0",
              }}
            >
              {t("Add to home screen for app experience")}
            </p>
          </div>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
              flexShrink: 0,
            }}
            aria-label={t("Dismiss")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            onClick={handleInstall}
            style={{
              backgroundColor: "#1CA069",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {t("Install")}
          </button>
        </div>
      </div>
    </div>
  );
}
