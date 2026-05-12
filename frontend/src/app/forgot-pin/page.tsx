"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { resetPin } from "@/lib/api";
import { isEmailAddressValid } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcBack } from "@/components/Icons";

export default function ForgotPinPage() {
  const router = useRouter();
  const showSnackbar = useStore((s) => s.showSnackbar);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isReady = isEmailAddressValid(email.trim());

  const handleSend = async () => {
    if (!isReady || isLoading) return;
    setIsLoading(true);
    try {
      await resetPin(email.trim());
      setSent(true);
      showSnackbar("Reset instructions sent to your email", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send reset email";
      showSnackbar(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center px-3 py-3 gap-3"
        style={{
          backgroundColor: "#F8FAF9",
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center rounded-xl bg-white"
          style={{ width: 40, height: 40, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: "none", cursor: "pointer" }}
          aria-label="Back"
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
            letterSpacing: 0,
          }}
        >
          Reset PIN
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
              style={{ width: 80, height: 80, backgroundColor: "#F0FDF4" }}
            >
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                <path
                  d="M5 10L19 22L33 10M5 10h28v20H5V10Z"
                  stroke="#064E3B"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              Check Your Email
            </h2>
            <p
              className="text-sm mb-8"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.6 }}
            >
              We&apos;ve sent PIN reset instructions to your email address. Please check your inbox.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="px-8 py-4 rounded-full font-bold text-base text-white"
              style={{ backgroundColor: "#064E3B", fontFamily: "Nunito, sans-serif", border: "none", cursor: "pointer" }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          /* Form state */
          <div className="px-3">
            <p
              className="text-center font-bold mt-5"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              Reset Your PIN
            </p>
            <p
              className="text-center text-sm mt-1"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Enter your registered email to receive a reset link
            </p>
            <p
              className="text-xs font-bold uppercase tracking-wide mt-5 mb-1.5"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Email Address<RequiredAsterisk />
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

            <button
              onClick={handleSend}
              disabled={!isReady || isLoading}
              className="w-full mt-7 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
              style={{
                backgroundColor: isReady && !isLoading ? "#064E3B" : "#D3D3D3",
                color: isReady && !isLoading ? "#FFFFFF" : "#999999",
                fontFamily: "Nunito, sans-serif",
                border: "none",
                cursor: isReady && !isLoading ? "pointer" : "not-allowed",
                transition: "background-color 0.2s",
              }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                  </svg>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  Proceed
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
