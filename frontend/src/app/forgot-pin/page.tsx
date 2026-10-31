"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isEmailAddressValid } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcBack } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";
import Spinner from "@/components/ui/Spinner";
import { useResetPin } from "@/lib/use-reset-pin";
import { COLORS } from "@/lib/colors";

export default function ForgotPinPage() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { isSending: isLoading, send } = useResetPin({
    translate: t,
    fallbackError: "Unexpected error: failed to generate PIN. Please, try again!",
    onSuccess: () => setSent(true),
  });

  const isReady = isEmailAddressValid(email.trim());

  const handleSend = async () => {
    if (!isReady) return;
    await send(email);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      {/* Toolbar — transparent so page bg extends up through it */}
      <div
        className="flex items-center px-3 py-3 gap-3"
        style={{
          backgroundColor: "transparent",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button
          onClick={() => router.back()}
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
          <IcBack size={20} color={COLORS.darkAquamarineGreen} />
        </button>
        <h1
          className="flex-1 text-center"
          style={{
            color: COLORS.darkAquamarineGreen,
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            letterSpacing: 0,
          }}
        >
          {t("Reset PIN")}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="flex-1 flex flex-col">
        {/* App branding */}
        <div className="flex justify-center pt-8 pb-2">
          <AppBranding />
        </div>

        {sent ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
            <div
              className="flex items-center justify-center rounded-full mb-6"
              style={{ width: 80, height: 80, backgroundColor: COLORS.honeydew }}
            >
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                <path
                  d="M5 10L19 22L33 10M5 10h28v20H5V10Z"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: COLORS.darkAquamarineGreen }}>
              {t("Check Your Email")}
            </h2>
            <p className="text-sm mb-8" style={{ color: COLORS.darkSilver, lineHeight: 1.6 }}>
              {t(
                "We've sent PIN reset instructions to your email address. Please check your inbox."
              )}
            </p>
            <button
              onClick={() => router.push("/login")}
              className="px-8 py-4 rounded-full font-bold text-base text-white"
              style={{
                backgroundColor: COLORS.darkAquamarineGreen,
                border: "none",
                cursor: "pointer",
              }}
            >
              {t("Back to Login")}
            </button>
          </div>
        ) : (
          /* Form state */
          <div className="px-3">
            <p
              className="text-center font-bold mt-5"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
            >
              {t("Reset Your PIN")}
            </p>
            <p className="text-center text-sm mt-1" style={{ color: COLORS.darkSilver }}>
              {t("Enter your registered email to receive a reset link")}
            </p>
            <label
              htmlFor="forgot-pin-email"
              className="block text-xs font-bold uppercase tracking-wide mt-5 mb-1.5"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Email Address")}
              <RequiredAsterisk />
            </label>
            <input
              id="forgot-pin-email"
              aria-label={t("Email Address")}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={{
                backgroundColor: COLORS.americanDiamond,
                color: COLORS.raisinBlack,
              }}
            />

            <button
              onClick={handleSend}
              disabled={!isReady || isLoading}
              className="w-full mt-7 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
              style={{
                backgroundColor:
                  isReady && !isLoading ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
                color: isReady && !isLoading ? COLORS.white : COLORS.spanishGray,
                border: "none",
                cursor: isReady && !isLoading ? "pointer" : "not-allowed",
                transition: "background-color 0.2s",
              }}
            >
              {isLoading ? (
                <>
                  <Spinner size={18} />
                  <span>{t("Sending...")}</span>
                </>
              ) : (
                <>
                  {t("Proceed")}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <PoweredBy />
    </div>
  );
}
