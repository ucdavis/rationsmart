"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { register as registerApi, getCountries } from "@/lib/api";
import { isEmailAddressValid, cleanNameInput } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";

interface Country {
  id: string | number;
  name: string;
  code?: string;
  country_code?: string;
  currency?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, logout } = useStore((s) => ({ setUser: s.setUser, logout: s.logout }));
  const showSnackbar = useStore((s) => s.showSnackbar);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const confirmPinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCountries()
      .then((res) => {
        const data = res.data;
        const list: Country[] = Array.isArray(data) ? data : [];
        setCountries(list);
        if (list.length > 0) setCountryId(String(list[0].id));
      })
      .catch(() => showSnackbar("Could not load countries", "error"))
      .finally(() => setLoadingCountries(false));
  }, [showSnackbar]);

  // Android: PIN enabled only when country + email + name are all filled and email is valid
  const pinEnabled =
    countryId !== "" &&
    name.trim().length > 0 &&
    isEmailAddressValid(email.trim());

  // Android: confirm PIN enabled only when all 4 PIN digits are filled
  const confirmPinEnabled = pin.length === 4;

  // Android: button enabled when all fields valid + PINs match
  const isReady =
    pinEnabled &&
    pin.length === 4 &&
    confirmPin.length === 4;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = cleanNameInput(e.target.value);
    setName(cleaned);
  };

  const handleProceed = async () => {
    if (!isReady || isLoading) return;
    if (pin !== confirmPin) {
      showSnackbar("Please make sure you have entered correct PINS.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const res = await registerApi({
        name: name.trim(),
        email_id: email.trim(),
        pin,
        country_id: countryId,
      });
      const u = res.data?.user ?? res.data;
      const selectedCountry = countries.find((c) => String(c.id) === String(countryId));
      logout();
      setUser({
        id: String(u.id ?? ""),
        name: u.name ?? name.trim(),
        email: u.email_id ?? email.trim(),
        country: u.country?.name ?? selectedCountry?.name ?? "",
        country_id: String(u.country_id ?? u.country?.id ?? countryId),
        country_code: u.country?.country_code ?? selectedCountry?.country_code ?? selectedCountry?.code ?? "",
        currency: selectedCountry?.currency ?? "",
        pin,
        is_admin: false,
      });
      showSnackbar(res.data?.message ?? "Account created!", "success");
      router.replace("/cattle-info");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      showSnackbar(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "#F1F5F9",
    color: "#231F20",
    fontFamily: "Nunito, sans-serif",
  };

  const labelStyle = {
    color: "#6D6D6D",
    fontFamily: "Nunito, sans-serif",
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
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 5L7.5 10L12.5 15" stroke="#064E3B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className="flex-1 text-center text-base font-bold"
          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
        >
          Create Account
        </h1>
        <div style={{ width: 40 }} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-6">
        {/* App branding */}
        <div className="flex justify-center pt-6 pb-2">
          <AppBranding />
        </div>

        {/* Name */}
        <p className="text-xs font-bold uppercase tracking-wide mt-6 ml-6 mb-1.5" style={labelStyle}>
          Name *
        </p>
        <div className="px-4">
          <input
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={handleNameChange}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={inputStyle}
          />
        </div>

        {/* Email */}
        <p className="text-xs font-bold uppercase tracking-wide mt-4 ml-6 mb-1.5" style={labelStyle}>
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
            style={inputStyle}
          />
        </div>

        {/* Country */}
        <p className="text-xs font-bold uppercase tracking-wide mt-4 ml-6 mb-1.5" style={labelStyle}>
          Country *
        </p>
        <div className="px-4 relative">
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            disabled={loadingCountries}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none pr-10"
            style={{
              ...inputStyle,
              color: countryId ? "#231F20" : "#999999",
              opacity: loadingCountries ? 0.6 : 1,
            }}
          >
            {loadingCountries && <option value="">Loading countries...</option>}
            {countries.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="absolute right-7 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="#6D6D6D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* PIN — disabled until country + email + name are valid */}
        <p className="text-xs font-bold uppercase tracking-wide mt-5 ml-6 mb-3" style={labelStyle}>
          Enter PIN
        </p>
        <PinInput
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 4 && confirmPinRef.current) {
              const first = confirmPinRef.current.querySelector("input");
              if (first) (first as HTMLInputElement).focus();
            }
          }}
          disabled={!pinEnabled}
        />

        {/* Confirm PIN — disabled until PIN is complete */}
        <div ref={confirmPinRef}>
          <p className="text-xs font-bold uppercase tracking-wide mt-5 ml-6 mb-3" style={labelStyle}>
            Confirm PIN
          </p>
          <PinInput
            value={confirmPin}
            onChange={setConfirmPin}
            disabled={!confirmPinEnabled}
          />
        </div>

        {confirmPin.length === 4 && pin !== confirmPin && (
          <p
            className="text-xs font-bold text-center mt-2"
            style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
          >
            PINs do not match
          </p>
        )}

        {/* Proceed button */}
        <div className="px-4 mt-8 mb-4">
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
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                <span>Creating account...</span>
              </>
            ) : (
              "Proceed"
            )}
          </button>
        </div>

        <PoweredBy />
      </div>
    </div>
  );
}
