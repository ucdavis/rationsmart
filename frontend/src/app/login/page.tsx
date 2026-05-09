"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { login, getUserProfile, getCountries } from "@/lib/api";
import { isEmailAddressValid } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";

export default function LoginPage() {
  const router = useRouter();
  const { setUser, logout } = useStore((s) => ({ setUser: s.setUser, logout: s.logout }));
  const showSnackbar = useStore((s) => s.showSnackbar);

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isReady = isEmailAddressValid(email.trim()) && pin.length === 4;

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
      showSnackbar("Welcome back!", "success");
      router.replace("/cattle-info");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
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
          className="text-xs font-bold uppercase tracking-wide mt-6 ml-6 mb-1.5"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          Email Address *
        </p>
        <div className="px-4">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="your@email.com"
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
          className="text-xs font-bold uppercase tracking-wide mt-5 ml-6 mb-3"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          Enter PIN
        </p>
        <PinInput value={pin} onChange={setPin} />

        {/* Proceed button */}
        <div className="px-4 mt-7">
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
        <div className="flex items-center gap-3 px-6 mt-7">
          <div className="flex-1 h-px" style={{ backgroundColor: "#E2E8F0" }} />
          <span
            className="text-sm"
            style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
          >
            OR
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: "#E2E8F0" }} />
        </div>

        {/* Register link */}
        <div className="flex justify-center mt-5">
          <button
            onClick={() => router.push("/register")}
            className="text-base"
            style={{
              color: "#231F20",
              fontFamily: "Nunito, sans-serif",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            New User? Register Here
          </button>
        </div>

        {/* Forgot PIN */}
        <div className="flex justify-center mt-3">
          <button
            onClick={() => router.push("/forgot-pin")}
            className="text-base"
            style={{
              color: "#231F20",
              fontFamily: "Nunito, sans-serif",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Forgot PIN?
          </button>
        </div>
      </div>

      {/* Powered by footer */}
      <PoweredBy />
    </div>
  );
}
