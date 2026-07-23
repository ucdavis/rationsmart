"use client";

// /verify-email — post-registration screen for the v1 email-verification flow.
//
// The v1 register response carries no JWT. The user must click the
// verification link in the email they receive (which hits
// /v1/auth/verify-email-link?token=...), then return to the app and log
// in normally to obtain a Bearer token. This screen guides them.
//
// Query params:
//   ?email=<email>   pre-fills the resend address
//
// Actions:
//   - "Resend verification email" → POST /v1/auth/resend-verification
//   - "Continue to Login" → /login
//   - "Back to Register" → /register (for typo fixes)

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { resendVerification } from "@/lib/api";
import { isEmailAddressValid } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcBack } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSnackbar = useStore((s) => s.showSnackbar);
  const t = useT();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [isResending, setIsResending] = useState(false);

  const isResendReady = isEmailAddressValid(email.trim());

  const handleResend = async () => {
    if (!isResendReady || isResending) return;
    setIsResending(true);
    try {
      const res = await resendVerification(email.trim());
      const msg = (res.data as { message?: string })?.message;
      showSnackbar(msg ?? t("Verification email resent — check your inbox"), "success");
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t("Could not resend the verification email. Please try again.");
      showSnackbar(message, "error");
    } finally {
      setIsResending(false);
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
          onClick={() => router.replace("/register")}
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
          {t("Verify Email")}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="flex-1 flex flex-col px-3">
        <div className="flex justify-center pt-6 pb-2">
          <AppBranding />
        </div>

        {/* Big mail icon */}
        <div className="flex justify-center mt-6">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 90, height: 90, backgroundColor: "#F0FDF4" }}
          >
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path
                d="M6 12l16 12L38 12M6 12h32v22H6V12Z"
                stroke="#064E3B"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h2
          className="text-center font-bold mt-5"
          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 22 }}
        >
          {t("Check Your Email")}
        </h2>
        <p
          className="text-center text-sm mt-2 px-4"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.6 }}
        >
          {t(
            "We've sent a verification link to your email address. Tap the link to activate your\n          account, then sign in."
          )}
        </p>

        {/* Email field — pre-filled, editable so user can correct typos */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-6 mb-1.5 ml-1"
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
          style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
        />

        {/* Resend button */}
        <button
          onClick={handleResend}
          disabled={!isResendReady || isResending}
          className="w-full mt-5 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
          style={{
            backgroundColor: "transparent",
            color: isResendReady && !isResending ? "#064E3B" : "#999999",
            border: `2px solid ${isResendReady && !isResending ? "#064E3B" : "#D3D3D3"}`,
            fontFamily: "Nunito, sans-serif",
            cursor: isResendReady && !isResending ? "pointer" : "not-allowed",
          }}
        >
          {isResending ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
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
              {t("Resending...")}
            </>
          ) : (
            t("Resend Verification Email")
          )}
        </button>

        {/* Continue to login — primary CTA */}
        <button
          onClick={() => router.replace("/login")}
          className="w-full mt-3 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2 text-white"
          style={{
            backgroundColor: "#064E3B",
            border: "none",
            fontFamily: "Nunito, sans-serif",
            cursor: "pointer",
          }}
        >
          {t("Continue to Login")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <PoweredBy />
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
