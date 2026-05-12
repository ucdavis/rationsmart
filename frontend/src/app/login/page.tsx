"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { login, getUserProfile, getCountries, resetPin } from "@/lib/api";
import { isEmailAddressValid } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";

export default function LoginPage() {
  const router = useRouter();
  const { setUser, logout } = useStore((s) => ({ setUser: s.setUser, logout: s.logout }));
  const showSnackbar = useStore((s) => s.showSnackbar);

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Reset-PIN bottom sheet state
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);

  const isReady = isEmailAddressValid(email.trim()) && pin.length === 4;
  const isResetReady = isEmailAddressValid(resetEmail.trim());

  const handleResetSend = async () => {
    if (!isResetReady || isSendingReset) return;
    setIsSendingReset(true);
    try {
      const res = await resetPin(resetEmail.trim());
      // Android shows backend's message via uiData.data.message.toStringOrNA()
      const successMsg = (res.data as { message?: string })?.message;
      if (successMsg) showSnackbar(successMsg, "success");
      setShowResetSheet(false);
      setResetEmail("");
    } catch (err: unknown) {
      // Android fallback for non-404, non-network errors
      const message = err instanceof Error && err.message && err.message !== "Network Error"
        ? err.message
        : err instanceof Error && err.message === "Network Error"
          ? "Please make sure you're device has internet connectivity."
          : "Unexpected error: failed to generate PIN. Please, try again!";
      showSnackbar(message, "error");
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleProceed = async () => {
    if (!isReady || isLoading) return;
    setIsLoading(true);
    try {
      const res = await login(email.trim(), pin);
      const u = res.data?.user ?? res.data;
      const emailId: string = u.email_id ?? email.trim();

      // fetch profile + countries in parallel (non-critical)
      let is_admin = false;
      let currency = "";
      try {
        const countryId = String(u.country_id ?? u.country?.id ?? "");
        const [profileRes, countriesRes] = await Promise.allSettled([
          getUserProfile(emailId),
          getCountries(),
        ]);
        if (profileRes.status === "fulfilled") is_admin = profileRes.value.data?.is_admin ?? false;
        if (countriesRes.status === "fulfilled") {
          const found = (countriesRes.value.data as Array<{id: string; currency?: string}>).find((c) => String(c.id) === countryId);
          currency = found?.currency ?? "";
        }
      } catch {
        // non-critical
      }

      // Wipe any persisted simulation data from a previous session before setting the new user
      logout();
      setUser({
        id: String(u.id ?? ""),
        name: u.name ?? "",
        email: emailId,
        country: u.country?.name ?? u.country ?? "",
        country_id: String(u.country_id ?? u.country?.id ?? ""),
        country_code: u.country?.country_code ?? u.country_code ?? "",
        currency,
        pin: pin,
        is_admin,
      });
      // Android shows backend's message via `uiData.data.message.toStringOrNA()`
      const successMsg = (res.data as { message?: string })?.message;
      if (successMsg) showSnackbar(successMsg, "success");
      router.replace("/cattle-info");
    } catch (err: unknown) {
      // Android fallback when not a 401/detail error
      const message = err instanceof Error && err.message && err.message !== "Network Error"
        ? err.message
        : err instanceof Error && err.message === "Network Error"
          ? "Please make sure you're device has internet connectivity."
          : "Unexpected error: failed to login. Please, try again!";
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
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-6">
        {/* App branding */}
        <div className="flex justify-center pt-10 pb-2">
          <AppBranding />
        </div>

        {/* Email label + input */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          Email Address<RequiredAsterisk />
        </p>
        <div className="px-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={{
              backgroundColor: "#F1F5F9",
              color: "#231F20",
              fontFamily: "Nunito, sans-serif",
            }}
          />
        </div>

        {/* PIN label */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 ml-3 mb-3"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          Enter PIN
        </p>
        <PinInput value={pin} onChange={setPin} />

        {/* Proceed button */}
        <div className="px-3 mt-5">
          <button
            onClick={handleProceed}
            disabled={!isReady || isLoading}
            className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: isReady && !isLoading ? "#064E3B" : "#D3D3D3",
              color: isReady && !isLoading ? "#FFFFFF" : "#999999",
              fontFamily: "Nunito, sans-serif",
              border: "none",
              cursor: isReady && !isLoading ? "pointer" : "not-allowed",
              transition: "background-color 0.2s, color 0.2s",
            }}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                <span>Signing in...</span>
              </>
            ) : (
              "Proceed"
            )}
          </button>
        </div>

        {/* OR divider */}
        <div className="flex items-center mt-5 px-3 gap-3">
          <div style={{ flex: 1, height: 2, backgroundColor: "#E2E8F0" }} />
          <span
            className="font-bold"
            style={{ fontSize: 20, color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          >
            OR
          </span>
          <div style={{ flex: 1, height: 2, backgroundColor: "#E2E8F0" }} />
        </div>

        {/* Register link */}
        <div className="flex justify-center mt-2.5">
          <button
            onClick={() => router.push("/register")}
            className="text-base"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "12px", lineHeight: 1 }}
          >
            <span style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>New User? </span>
            <span style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Register here</span>
          </button>
        </div>

        {/* Forgot PIN */}
        <div className="flex justify-center mt-2.5 mb-6">
          <button
            onClick={() => setShowResetSheet(true)}
            className="text-base"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "12px", lineHeight: 1 }}
          >
            <span style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Forgot PIN? </span>
            <span style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Tap here</span>
          </button>
        </div>
      </div>

      {/* Powered by footer */}
      <PoweredBy />

      {/* Reset-PIN bottom sheet — Android dialog_get_new_pin parity */}
      {showResetSheet && (
        <>
          {/* Backdrop dims login behind */}
          <div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => !isSendingReset && setShowResetSheet(false)}
          />
          {/* Sheet — left/right:0 + mx-auto so animation transform doesn't fight the centering */}
          <div
            className="fixed bottom-0 left-0 right-0 mx-auto bg-white pb-5"
            style={{
              maxWidth: 430,
              width: "100%",
              zIndex: 51,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              animation: "slideUp 0.28s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-4 mb-4">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>

            {/* Title */}
            <p
              className="text-center font-bold"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              Reset Your PIN
            </p>
            {/* Subtitle */}
            <p
              className="text-center mt-1 px-3"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
            >
              Enter your registered email to receive a reset link
            </p>

            {/* Email label */}
            <p
              className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Email Address<RequiredAsterisk />
            </p>
            <div className="px-3">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                style={{
                  backgroundColor: "#F1F5F9",
                  color: "#231F20",
                  fontFamily: "Nunito, sans-serif",
                }}
                aria-label="Email address"
              />
            </div>

            {/* Proceed button */}
            <div className="px-3 mt-5">
              <button
                onClick={handleResetSend}
                disabled={!isResetReady || isSendingReset}
                className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
                style={{
                  backgroundColor: isResetReady && !isSendingReset ? "#064E3B" : "#D3D3D3",
                  color: isResetReady && !isSendingReset ? "#FFFFFF" : "#999999",
                  fontFamily: "Nunito, sans-serif",
                  border: "none",
                  cursor: isResetReady && !isSendingReset ? "pointer" : "not-allowed",
                  transition: "background-color 0.2s, color 0.2s",
                }}
              >
                {isSendingReset ? (
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

            {/* PoweredBy inside sheet */}
            <div className="mt-8">
              <PoweredBy />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
