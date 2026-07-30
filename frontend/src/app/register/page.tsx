"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { register as registerApi, getCountries, labelForLanguage } from "@/lib/api";
import { isEmailAddressValid, cleanNameInput } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcBack, IcEye, IcEyeOff } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";

interface Country {
  id: string | number;
  name: string;
  code?: string;
  country_code?: string;
  currency?: string;
  // i18n V2 — backend ships the BCP 47 codes the country has labels for.
  supported_languages?: string[];
}

export default function RegisterPage() {
  const router = useRouter();
  // setUser/logout removed in v1 — register no longer auto-signs-in.
  const showSnackbar = useStore((s) => s.showSnackbar);
  const t = useT();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState("");
  // i18n V2 — language chosen at registration. Defaults to "en". Becomes
  // the user's registered_language on the backend; the baseline restored
  // on every subsequent login. Selecting another language is optional.
  const [language, setLanguage] = useState("en");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  // Single reveal toggle for BOTH PIN + Confirm PIN so the user can verify
  // what they typed. Defaults to hidden.
  const [showPin, setShowPin] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const confirmPinRef = useRef<HTMLDivElement>(null);

  // Resolve the language options for the currently-picked country.
  // English is ALWAYS in the list (default, can't be removed). Other
  // entries come from the country's supported_languages — minus "en" so
  // we don't render it twice.
  const selectedCountry = countries.find((c) => String(c.id) === countryId);
  const countryLangs = selectedCountry?.supported_languages ?? [];
  const languageOptions = ["en", ...countryLangs.filter((c) => c !== "en")];

  // If the user picked a country that no longer supports the previously-
  // selected language, snap back to English so we never submit an option
  // that isn't visible in the dropdown.
  useEffect(() => {
    if (!languageOptions.includes(language)) setLanguage("en");
  }, [countryId, language, languageOptions]);

  useEffect(() => {
    getCountries()
      .then((res) => {
        const data = res.data;
        const list: Country[] = Array.isArray(data) ? data : [];
        setCountries(list);
      })
      .catch(() => showSnackbar(t("Could not load countries"), "error"))
      .finally(() => setLoadingCountries(false));
  }, [showSnackbar]);

  // Android: PIN enabled only when country + email + name are all filled and email is valid
  const pinEnabled =
    countryId !== "" && name.trim().length > 0 && isEmailAddressValid(email.trim());

  // Android: confirm PIN enabled only when all 4 PIN digits are filled
  const confirmPinEnabled = pin.length === 6;

  // Android: button enabled when all fields valid + PINs match
  const isReady = pinEnabled && pin.length === 6 && confirmPin.length === 6;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = cleanNameInput(e.target.value);
    setName(cleaned);
  };

  const handleProceed = async () => {
    if (!isReady || isLoading) return;
    if (pin !== confirmPin) {
      showSnackbar(t("Please make sure you have entered correct PINS."), "error");
      return;
    }
    setIsLoading(true);
    try {
      const res = await registerApi({
        name: name.trim(),
        email_id: email.trim(),
        pin,
        country_id: countryId,
        // Send the chosen language so the backend can store it as
        // registered_language. Older backends that don't know this
        // field will ignore it; the field is optional in the schema.
        language,
      });
      // v1 register response has NO token (POST /v1/auth/register returns
      // AuthenticationResponse with user but no JWT). If we set the user
      // and push to /cattle-info, every API call there will 401 because
      // the axios interceptor has no Bearer header to send.
      //
      // The v1 backend likely requires email verification — there's a
      // /v1/auth/verify-email + /v1/auth/resend-verification flow. So:
      // - DO NOT setUser yet (avoid a half-authenticated session)
      // - DO NOT clear logout (no prior session to wipe)
      // - Push to /verify-email with the email pre-filled so the user
      //   can resend the verification link if needed, then return to
      //   /login to obtain a real JWT.
      const successMsg = (res.data as { message?: string })?.message;
      if (successMsg) showSnackbar(successMsg, "success");
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err: unknown) {
      // Android fallback for non-400, non-network errors
      const message =
        err instanceof Error && err.message && err.message !== "Network Error"
          ? err.message
          : err instanceof Error && err.message === "Network Error"
            ? t("Please make sure you're device has internet connectivity.")
            : t("Unexpected error: failed to register. Please, try again!");
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
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
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
          {t("Create Account")}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-3">
        {/* App branding */}
        <div className="flex justify-center pt-6 pb-2">
          <AppBranding />
        </div>

        {/* Name */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
          style={labelStyle}
        >
          {t("Name")}
          <RequiredAsterisk />
        </p>
        <div className="px-3">
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={inputStyle}
          />
        </div>

        {/* Email */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 ml-3 mb-1.5"
          style={labelStyle}
        >
          {t("Email Address")}
          <RequiredAsterisk />
        </p>
        <div className="px-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={inputStyle}
          />
        </div>

        {/* Country */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 ml-3 mb-1.5"
          style={labelStyle}
        >
          {t("Country")}
          <RequiredAsterisk />
        </p>
        <div className="px-3 relative">
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            disabled={loadingCountries}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none pr-10"
            style={{
              ...inputStyle,
              color: countryId ? "#231F20" : "#6D6D6D",
              opacity: loadingCountries ? 0.6 : 1,
            }}
          >
            <option value="">{loadingCountries ? t("Loading countries...") : t("Select")}</option>
            {countries.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 6L8 10L12 6"
                stroke="#6D6D6D"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Language — optional. English is the default and is ALWAYS in
            the list (the user can never remove or disable it). Other
            choices come from the selected country's supported_languages.
            The chosen value becomes the user's registered_language on
            the backend and is the baseline restored at every login. */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 ml-3 mb-1.5"
          style={labelStyle}
        >
          {t("Language")}
        </p>
        <div className="px-3 relative">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={loadingCountries}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none pr-10"
            style={{
              ...inputStyle,
              color: "#231F20",
              opacity: loadingCountries ? 0.6 : 1,
            }}
          >
            {languageOptions.map((code) => (
              <option key={code} value={code}>
                {labelForLanguage(code)}
              </option>
            ))}
          </select>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 6L8 10L12 6"
                stroke="#6D6D6D"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* PIN — disabled until country + email + name are valid */}
        <div className="flex items-center justify-between mt-3 ml-3 mr-3 mb-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={labelStyle}>
            {t("Enter PIN")}
          </p>
          <button
            type="button"
            onClick={() => setShowPin((s) => !s)}
            disabled={!pinEnabled}
            aria-label={showPin ? t("Hide PIN") : t("Show PIN")}
            aria-pressed={showPin}
            className="flex items-center justify-center"
            style={{
              background: "none",
              border: "none",
              cursor: pinEnabled ? "pointer" : "not-allowed",
              padding: 4,
              opacity: pinEnabled ? 1 : 0.4,
            }}
          >
            {showPin ? <IcEyeOff size={20} /> : <IcEye size={20} />}
          </button>
        </div>
        <PinInput
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 6 && confirmPinRef.current) {
              const first = confirmPinRef.current.querySelector("input");
              if (first) (first as HTMLInputElement).focus();
            }
          }}
          disabled={!pinEnabled}
          reveal={showPin}
        />

        {/* Confirm PIN — disabled until PIN is complete */}
        <div ref={confirmPinRef}>
          <p className="text-xs uppercase tracking-wide mt-3 ml-3 mb-3" style={labelStyle}>
            {t("Confirm PIN")}
          </p>
          <PinInput
            value={confirmPin}
            onChange={setConfirmPin}
            disabled={!confirmPinEnabled}
            reveal={showPin}
          />
        </div>

        {confirmPin.length === 6 && pin !== confirmPin && (
          <p
            className="text-xs font-bold text-center mt-2"
            style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
          >
            {t("PINs do not match")}
          </p>
        )}
      </div>

      {/* Proceed button — fixed outside scroll area */}
      <div className="px-3 mt-4">
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
            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
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
            t("Proceed")
          )}
        </button>
      </div>

      <PoweredBy />
    </div>
  );
}
