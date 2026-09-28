"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { login, getUserProfile, getCountries } from "@/lib/api";
import { isEmailAddressValid, PIN_LENGTH, LEGACY_PIN_LENGTH } from "@/lib/validators";
import AppBranding from "@/components/AppBranding";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";
import RequiredAsterisk from "@/components/RequiredAsterisk";
import { IcEye, IcEyeOff } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";
import { loginErrorMessage } from "@/lib/errors";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import Spinner from "@/components/ui/Spinner";
import { useResetPin } from "@/lib/use-reset-pin";
import { COLORS } from "@/lib/colors";

export default function LoginPage() {
  const router = useRouter();
  const { setUser, logout } = useStore((s) => ({ setUser: s.setUser, logout: s.logout }));
  const showSnackbar = useStore((s) => s.showSnackbar);
  const t = useT();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Reset-PIN bottom sheet state
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const { isSending: isSendingReset, send: sendReset } = useResetPin({
    translate: t,
    fallbackError: "Unexpected error: failed to generate PIN. Please, try again!",
    onSuccess: () => {
      setShowResetSheet(false);
      setResetEmail("");
    },
  });
  useEscapeKey(!!(showResetSheet && !isSendingReset), () => setShowResetSheet(false));

  // v1 backend accepts both legacy 4-digit and new 6-digit PINs at login —
  // if the user has a legacy 4-digit PIN, the response will carry
  // `requires_pin_reset: true` and we route them to /set-new-pin to upgrade.
  const isReady =
    isEmailAddressValid(email.trim()) &&
    pin.length >= LEGACY_PIN_LENGTH &&
    pin.length <= PIN_LENGTH;
  const isResetReady = isEmailAddressValid(resetEmail.trim());

  const handleResetSend = async () => {
    if (!isResetReady) return;
    await sendReset(resetEmail);
  };

  const handleProceed = async () => {
    if (!isReady || isLoading) return;
    setIsLoading(true);
    try {
      const res = await login(email.trim(), pin);
      // v1 LoginResponse:
      //   { success, message, requires_pin_reset, user?: UserResponse, token?: TokenResponse }
      // Where TokenResponse = { access_token, token_type, expires_in }.
      // The earlier draft of this page stored the whole token object on
      // `user.token` and the Bearer interceptor then sent
      // "Authorization: Bearer [object Object]" — every authenticated call
      // 401'd. We now extract `.access_token` (a plain JWT string).
      // UserResponse.country is anyType (server may return a Country
      // object OR a plain string OR null) so we defensively probe both.
      const body = res.data as {
        user?: Record<string, unknown> & {
          id?: string;
          name?: string;
          email_id?: string;
          country?: string | { name?: string; id?: string; country_code?: string } | null;
          country_id?: string;
          country_code?: string;
          is_admin?: boolean;
          preferred_language?: string;
        };
        token?: { access_token?: string; token_type?: string; expires_in?: number } | string | null;
        requires_pin_reset?: boolean;
        message?: string;
      };

      // v1 §requires_pin_reset: server tells us when the user just authenticated
      // with a legacy 4-digit PIN and must upgrade to a 6-digit one before
      // accessing the rest of the app. Hand the email + old PIN to
      // /set-new-pin through a memory-only store slice — never the URL, which
      // would put the PIN in edge logs, browser history and the SW cache.
      if (body.requires_pin_reset) {
        useStore.getState().setPendingPinReset({ email: email.trim(), oldPin: pin });
        router.replace("/set-new-pin");
        return;
      }

      const u = body.user ?? {};
      const emailId: string = (u.email_id as string | undefined) ?? email.trim();

      // The login response's UserResponse carries is_admin + preferred_language
      // (audit A-08): use them directly. The public GET /auth/user/{email}
      // lookup is only a fallback for older backends that omit them.
      const loginHasRole = typeof u.is_admin === "boolean";
      let is_admin = u.is_admin ?? false;
      let currency = "";
      // i18n V2 — read whatever the backend has as the user's current
      // language. Profile-side changes persist to the backend, so this
      // is the user's LATEST chosen language, not a registration-time
      // baseline. Falls back to registered_language (for backends that
      // still expose it) then "en" for older API versions.
      let preferred_language = u.preferred_language ?? "en";
      try {
        const country = u.country;
        const countryId = String(
          u.country_id ?? (typeof country === "object" ? country?.id : "") ?? ""
        );
        const [profileRes, countriesRes] = await Promise.allSettled([
          loginHasRole ? Promise.resolve(null) : getUserProfile(emailId),
          getCountries(),
        ]);
        if (profileRes.status === "fulfilled" && profileRes.value) {
          const d = profileRes.value.data as {
            is_admin?: boolean;
            preferred_language?: string;
            registered_language?: string;
          };
          is_admin = d?.is_admin ?? false;
          preferred_language = d?.preferred_language ?? d?.registered_language ?? "en";
        }
        if (countriesRes.status === "fulfilled") {
          const found = (countriesRes.value.data as Array<{ id: string; currency?: string }>).find(
            (c) => String(c.id) === countryId
          );
          currency = found?.currency ?? "";
        }
      } catch {
        // non-critical
      }

      // Wipe any persisted simulation data from a previous session before setting the new user
      logout();
      const country = u.country;
      setUser({
        id: String(u.id ?? ""),
        name: (u.name as string | undefined) ?? "",
        email: emailId,
        country: (typeof country === "object" ? country?.name : country) ?? "",
        country_id: String(u.country_id ?? (typeof country === "object" ? country?.id : "") ?? ""),
        country_code:
          (typeof country === "object" ? country?.country_code : undefined) ?? u.country_code ?? "",
        currency,
        // SECURITY: never persist the account PIN. The store is written to
        // localStorage (partialized `user`), so storing the real PIN here
        // would leave the user's credential in cleartext. Nothing in the app
        // reads `user.pin` after login (auth is the JWT below), so keep it
        // empty. Re-auth flows (delete-account, reset) collect the PIN fresh.
        pin: "",
        is_admin,
        // v1: store the JWT so every subsequent animal/* + admin/* call
        // can attach `Authorization: Bearer <token>` via the axios interceptor.
        // The login response's `token` field is a TokenResponse object —
        // the JWT itself is in `access_token`. (We also handle the case
        // where the backend ever returns a bare string, defensively.)
        token: typeof body.token === "string" ? body.token : (body.token?.access_token ?? null),
        // Absolute expiry so the client can end the session itself (audit
        // A-14) instead of discovering it from a 401 mid-flow.
        token_expires_at:
          typeof body.token === "object" && body.token?.expires_in
            ? Date.now() + body.token.expires_in * 1000
            : undefined,
        // Single source of truth: preferred_language read from the
        // backend. registered_language is kept on the model as an
        // optional legacy field, populated to the same value for
        // backwards compatibility with any code that still reads it.
        registered_language: preferred_language,
        preferred_language,
      });
      const successMsg = body.message;
      if (successMsg) showSnackbar(successMsg, "success");
      router.replace("/cattle-info");
    } catch (err: unknown) {
      // Android fallback when not a 401/detail error
      const message = loginErrorMessage(
        err,
        "Unexpected error: failed to login. Please, try again!",
        t
      );
      showSnackbar(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-6">
        {/* App branding */}
        <div className="flex justify-center pt-10 pb-2">
          <AppBranding />
        </div>

        {/* Email label + input */}
        <p
          className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
          style={{ color: COLORS.darkSilver }}
        >
          {t("Email Address")}
          <RequiredAsterisk />
        </p>
        <div className="px-3">
          <input
            type="email"
            name="login-email"
            id="login-email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={{
              backgroundColor: COLORS.americanDiamond,
              color: COLORS.raisinBlack,
            }}
          />
        </div>

        {/* PIN label + reveal toggle */}
        <div className="flex items-center justify-between mt-3 ml-3 mr-3 mb-3">
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: COLORS.darkSilver }}
          >
            {t("Enter PIN")}
          </p>
          <button
            type="button"
            onClick={() => setShowPin((s) => !s)}
            aria-label={showPin ? t("Hide PIN") : t("Show PIN")}
            aria-pressed={showPin}
            className="flex items-center justify-center"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            {showPin ? <IcEyeOff size={20} /> : <IcEye size={20} />}
          </button>
        </div>
        <PinInput value={pin} onChange={setPin} reveal={showPin} />

        {/* Proceed button */}
        <div className="px-3 mt-5">
          <button
            onClick={handleProceed}
            disabled={!isReady || isLoading}
            className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                isReady && !isLoading ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
              color: isReady && !isLoading ? COLORS.white : COLORS.spanishGray,
              border: "none",
              cursor: isReady && !isLoading ? "pointer" : "not-allowed",
              transition: "background-color 0.2s, color 0.2s",
            }}
          >
            {isLoading ? <Spinner size={22} /> : t("Proceed")}
          </button>
        </div>

        {/* OR divider */}
        <div className="flex items-center mt-5 px-3 gap-3">
          <div style={{ flex: 1, height: 2, backgroundColor: COLORS.webDivider }} />
          <span className="font-bold" style={{ fontSize: 20, color: COLORS.raisinBlack }}>
            {t("OR")}
          </span>
          <div style={{ flex: 1, height: 2, backgroundColor: COLORS.webDivider }} />
        </div>

        {/* Register link */}
        <div className="flex justify-center mt-2.5">
          <button
            onClick={() => router.push("/register")}
            className="text-base"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "12px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: COLORS.raisinBlack }}>{t("New User? ")}</span>
            <span style={{ color: COLORS.darkAquamarineGreen, fontWeight: 700 }}>
              {t("Register here")}
            </span>
          </button>
        </div>

        {/* Forgot PIN */}
        <div className="flex justify-center mt-2.5 mb-6">
          <button
            onClick={() => setShowResetSheet(true)}
            className="text-base"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "12px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: COLORS.raisinBlack }}>{t("Forgot PIN? ")}</span>
            <span style={{ color: COLORS.darkAquamarineGreen, fontWeight: 700 }}>
              {t("Tap here")}
            </span>
          </button>
        </div>
      </div>

      {/* Powered by footer */}
      <PoweredBy />

      {/* Reset-PIN bottom sheet — Android dialog_get_new_pin parity */}
      {showResetSheet && (
        <>
          {/* Backdrop dims login behind — confined to centered column */}
          <div
            className="fixed top-0 h-full z-50"
            style={{
              left: COLUMN_LEFT,
              width: COLUMN_WIDTH,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
            onClick={() => !isSendingReset && setShowResetSheet(false)}
          />
          {/* Sheet — left/right:0 + mx-auto so animation transform doesn't fight the centering */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 left-0 right-0 mx-auto bg-white pb-5"
            style={{
              maxWidth: COLUMN_WIDTH,
              width: "100%",
              zIndex: 51,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              animation: "slideUp 0.28s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-4 mb-4">
              <div
                style={{
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: COLORS.sageBreeze,
                }}
              />
            </div>

            {/* Title */}
            <p
              className="text-center font-bold"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
            >
              {t("Reset Your PIN")}
            </p>
            {/* Subtitle */}
            <p className="text-center mt-1 px-3" style={{ color: COLORS.darkSilver, fontSize: 14 }}>
              {t("Enter your registered email to receive a reset link")}
            </p>

            {/* Email label */}
            <p
              className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Email Address")}
              <RequiredAsterisk />
            </p>
            <div className="px-3">
              <input
                type="email"
                name="reset-pin-email"
                id="reset-pin-email"
                inputMode="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                style={{
                  backgroundColor: COLORS.americanDiamond,
                  color: COLORS.raisinBlack,
                }}
                aria-label={t("Email Address")}
              />
            </div>

            {/* Proceed button */}
            <div className="px-3 mt-5">
              <button
                onClick={handleResetSend}
                disabled={!isResetReady || isSendingReset}
                className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
                style={{
                  backgroundColor:
                    isResetReady && !isSendingReset
                      ? COLORS.darkAquamarineGreen
                      : COLORS.lightGrayNew,
                  color: isResetReady && !isSendingReset ? COLORS.white : COLORS.spanishGray,
                  border: "none",
                  cursor: isResetReady && !isSendingReset ? "pointer" : "not-allowed",
                  transition: "background-color 0.2s, color 0.2s",
                }}
              >
                {isSendingReset ? (
                  <Spinner size={22} />
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
