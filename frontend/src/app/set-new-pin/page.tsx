"use client";

// /set-new-pin — legacy 4-digit PIN → new 6-digit PIN migration.
//
// Reached automatically from /login when the v1 backend returns
// `requires_pin_reset: true`. Query params:
//   ?email=<email>&old_pin=<4-digit>
//
// Flow:
//   1. User confirms email + sees their 4-digit PIN echoed in the
//      first field (so they understand which account they're upgrading).
//   2. User enters a new 6-digit PIN twice.
//   3. POST /v1/auth/set-new-pin → on success route to /login with the
//      new PIN pre-filled? No — too sensitive in URLs. Just route to
//      /login and let the user re-enter.

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { setNewPin } from "@/lib/api";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";
import PinInput from "@/components/ui/PinInput";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcBack } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";

function SetNewPinInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSnackbar = useStore((s) => s.showSnackbar);
  const t = useT();

  const initialEmail = searchParams.get("email") ?? "";
  const initialOldPin = searchParams.get("old_pin") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [oldPin, setOldPin] = useState(initialOldPin);
  const [newPin, setNewPin_] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Strip the ?old_pin= query string from the URL after we've consumed it,
  // so the legacy PIN isn't sitting in the browser history bar.
  useEffect(() => {
    if (initialOldPin && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("old_pin");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReady =
    email.trim().length > 0 &&
    oldPin.length === 4 &&
    newPin.length === 6 &&
    confirmPin.length === 6;

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    if (newPin !== confirmPin) {
      showSnackbar(t("New PINs do not match"), "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await setNewPin(email.trim(), oldPin, newPin);
      const msg = (res.data as { message?: string })?.message;
      if (msg) showSnackbar(msg, "success");
      setDone(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message && err.message !== "Network Error"
          ? err.message
          : err instanceof Error && err.message === "Network Error"
            ? t("Please make sure you're device has internet connectivity.")
            : t("Unexpected error: failed to update PIN. Please try again.");
      showSnackbar(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      {/* Toolbar */}
      <div
        className="flex items-center px-3 py-3 gap-3"
        style={{ backgroundColor: "transparent", position: "sticky", top: 0, zIndex: 40 }}
      >
        <button
          onClick={() => router.replace("/login")}
          className="flex items-center justify-center rounded-xl bg-white"
          style={{
            width: 40,
            height: 40,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            border: "none",
            cursor: "pointer",
          }}
          aria-label={t("Back")}
        >
          <IcBack size={20} color="#064E3B" />
        </button>
        <h1
          className="flex-1 text-center"
          style={{
            color: "#042F23",
            fontFamily: "Nunito, sans-serif",
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {t("Upgrade Your PIN")}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex justify-center pt-8 pb-2">
          <AppBranding />
        </div>

        {done ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
            <div
              className="flex items-center justify-center rounded-full mb-6"
              style={{ width: 80, height: 80, backgroundColor: "#F0FDF4" }}
            >
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                <path
                  d="M9 19l7 7L29 13"
                  stroke="#064E3B"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              {t("PIN Updated")}
            </h2>
            <p
              className="text-sm mb-8"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.6 }}
            >
              {t("Your account now uses a 6-digit PIN. Please sign in with your new PIN.")}
            </p>
            <button
              onClick={() => router.replace("/login")}
              className="px-8 py-4 rounded-full font-bold text-base text-white"
              style={{
                backgroundColor: "#064E3B",
                fontFamily: "Nunito, sans-serif",
                border: "none",
                cursor: "pointer",
              }}
            >
              {t("Sign In")}
            </button>
          </div>
        ) : (
          <div className="px-3">
            <p
              className="text-center font-bold mt-5"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              {t("Time to upgrade your PIN")}
            </p>
            <p
              className="text-center text-sm mt-1 mb-5 px-2"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}
            >
              {t(
                "RationSmart now uses a 6-digit PIN for stronger security. Confirm your existing\n              4-digit PIN and pick a new 6-digit one."
              )}
            </p>

            <p
              className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              {t("Email Address")}
              <RequiredAsterisk />
            </p>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={{
                backgroundColor: "#F1F5F9",
                color: "#231F20",
                fontFamily: "Nunito, sans-serif",
              }}
            />

            <p
              className="text-xs font-bold uppercase tracking-wide mt-3 mb-3 ml-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              {t("Current 4-digit PIN")}
            </p>
            <PinInput value={oldPin} onChange={setOldPin} length={4} />

            <p
              className="text-xs font-bold uppercase tracking-wide mt-3 mb-3 ml-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              {t("New 6-digit PIN")}
            </p>
            <PinInput
              value={newPin}
              onChange={setNewPin_}
              length={6}
              disabled={oldPin.length !== 4}
            />

            <p
              className="text-xs font-bold uppercase tracking-wide mt-3 mb-3 ml-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              {t("Confirm New PIN")}
            </p>
            <PinInput
              value={confirmPin}
              onChange={setConfirmPin}
              length={6}
              disabled={newPin.length !== 6}
            />

            {confirmPin.length === 6 && newPin !== confirmPin && (
              <p
                className="text-xs font-bold text-center mt-2"
                style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
              >
                {t("New PINs do not match")}
              </p>
            )}

            <div className="mt-5">
              <button
                onClick={handleSubmit}
                disabled={!isReady || isSubmitting}
                className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
                style={{
                  backgroundColor: isReady && !isSubmitting ? "#064E3B" : "#D3D3D3",
                  color: isReady && !isSubmitting ? "#FFFFFF" : "#999999",
                  fontFamily: "Nunito, sans-serif",
                  border: "none",
                  cursor: isReady && !isSubmitting ? "pointer" : "not-allowed",
                }}
              >
                {isSubmitting ? (
                  <svg
                    className="animate-spin"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray="40"
                      strokeDashoffset="10"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  t("Update PIN")
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <PoweredBy />
    </div>
  );
}

export default function SetNewPinPage() {
  // useSearchParams must be inside Suspense in App Router. Wrap accordingly.
  return (
    <Suspense fallback={null}>
      <SetNewPinInner />
    </Suspense>
  );
}
