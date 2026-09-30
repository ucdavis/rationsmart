"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { endServerSession, useStore } from "@/lib/store";
import {
  updateUserProfile,
  deleteAccount,
  getCountries,
  changePin,
  labelForLanguage,
} from "@/lib/api";
import { isEmailAddressValid, PIN_LENGTH, LEGACY_PIN_LENGTH } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";
import ResetPinSheet from "@/components/profile/ResetPinSheet";
import DeleteAccountDialog from "@/components/profile/DeleteAccountDialog";
import SubmitPinSheet from "@/components/profile/SubmitPinSheet";
import ChangePinSheet from "@/components/profile/ChangePinSheet";
import ProfileActions from "@/components/profile/ProfileActions";
import { useT } from "@/lib/i18n-ui";
import { useEscapeKey } from "@/lib/use-escape";
import Spinner from "@/components/ui/Spinner";
import { useResetPin } from "@/lib/use-reset-pin";
import { COLORS } from "@/lib/colors";
import { authErrorMessage } from "@/lib/errors";
import { messageOf } from "@/lib/api-client/normalize";

const inputStyle = (readOnly?: boolean) => ({
  backgroundColor: readOnly ? COLORS.authenticWhite : COLORS.americanDiamond,
  color: readOnly ? COLORS.spanishGray : COLORS.raisinBlack,
});

const labelStyle = {
  color: COLORS.darkSilver,
};

// UX: shimmer the REAL form fields in place while getCountries is in
// flight, rather than swapping in a separately-built skeleton/placeholder
// tree. Matches cattle-info's loadingFieldProps() exactly — reusing the
// real elements guarantees byte-identical layout before/after; only the
// appearance (shimmer background, hidden value, disabled) changes.
// Spread onto a native <input>/<select> alongside its normal
// className/style: `{...loadingFieldProps(countriesLoading, className, style)}`.
function loadingFieldProps(
  loading: boolean,
  className: string,
  style: React.CSSProperties
): { className: string; style: React.CSSProperties; disabled: boolean; tabIndex?: number } {
  if (!loading) return { className, style, disabled: false };
  return {
    className: `${className} shimmer`,
    style: { ...style, color: "transparent", caretColor: "transparent" },
    disabled: true,
    tabIndex: -1,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const t = useT();
  const { user, setUser, logout, showSnackbar } = useStore((s) => ({
    user: s.user,
    setUser: s.setUser,
    logout: s.logout,
    showSnackbar: s.showSnackbar,
  }));

  const [name, setName] = useState(user?.name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  // Reset-PIN sheet — opens on the Reset PIN button click and asks the
  // user to confirm/edit the email before firing the API (matches the
  // Login screen's Forgot PIN flow / Android dialog_get_new_pin).
  // Previously the button hit /auth/forgot-pin with user.email directly,
  // which surprised users who registered with a different address.
  const [showResetSheet, setShowResetSheet] = useState(false);
  const { isSending: isSendingReset, send: sendReset } = useResetPin({
    translate: t,
    fallbackError: "Failed to send reset email. Please try again.",
    defaultSuccess: "PIN reset email sent. Please check your inbox.",
    onSuccess: () => setShowResetSheet(false),
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPinSheet, setShowPinSheet] = useState(false);
  // Change-PIN bottom sheet — user-initiated PIN change. Distinct from
  // Reset PIN (which is the forgot-pin email flow). Hits
  // POST /v1/auth/change-pin {email_id, current_pin, new_pin}.
  const [showChangePinSheet, setShowChangePinSheet] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  useEscapeKey(!!(showChangePinSheet && !isChangingPin), () => setShowChangePinSheet(false));
  useEscapeKey(!!(showResetSheet && !isSendingReset), () => setShowResetSheet(false));
  useEscapeKey(!!(showPinSheet && !isDeleting), () => {
    setShowPinSheet(false);
    setDeletePin("");
  });
  useEscapeKey(!!showDeleteDialog, () => setShowDeleteDialog(false));
  const [countries, setCountries] = useState<
    Array<{
      id: string | number;
      name: string;
      country_code?: string;
      currency?: string;
      supported_languages?: string[];
    }>
  >([]);
  // Countries are fetched on mount. Until they arrive we can't decide
  // whether to render the Language selector (we don't know the user's
  // country's supported_languages). Previously the selector silently
  // popped in 1-2s after page load — bad UX. Now we render a skeleton
  // placeholder while loading IF we have a hint the user is on a
  // multi-language country (preferred_language != en); when the
  // countries call resolves we either replace with the real selector
  // or remove the block.
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [selectedCountryId, setSelectedCountryId] = useState(user?.country_id ?? "");
  // i18n V2: locally edited language preference. Saved on Update Profile.
  // Falls back to "en" until the backend has populated the user's record.
  const [selectedLang, setSelectedLang] = useState(user?.preferred_language ?? "en");

  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    getCountries()
      .then((res) => {
        const list = res.data ?? [];
        setCountries(
          list.map((c) => ({
            id: c.id,
            name: c.name,
            country_code: c.country_code ?? c.code,
            currency: c.currency ?? undefined,
            supported_languages: c.supported_languages,
          }))
        );
      })
      .catch(() => {
        // Say why the Country dropdown is empty instead of failing silently.
        // `t` via a ref: this is a mount-only effect and useT() returns a
        // new function every render.
        useStore.getState().showSnackbar(tRef.current("Could not load countries"), "error");
      })
      .finally(() => setCountriesLoading(false));
  }, []);

  // Compute the language options visible to this user based on the
  // currently-selected country's supported_languages. If the country only
  // supports English, the selector is hidden entirely (per i18n V2 spec).
  const selectedCountry = countries.find((c) => String(c.id) === String(selectedCountryId));
  // Language picker — English is ALWAYS in the list (never disabled,
  // never removed) regardless of what the country supports. Additional
  // entries come from the country's supported_languages. The dropdown
  // is therefore ALWAYS visible — even for English-only countries the
  // user sees "English" as the single, locked-but-selectable option,
  // confirming what language they're on.
  const countrySupported = selectedCountry?.supported_languages ?? [];
  const supportedLangs = ["en", ...countrySupported.filter((c) => c !== "en")];
  const showLangSelector = true;

  if (!user) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      showSnackbar(t("Name cannot be empty"), "error");
      return;
    }
    setIsSaving(true);
    try {
      // i18n V2 — language IS included in the API payload. When the user
      // picks a new language from the Profile dropdown we PATCH it on the
      // backend so the change persists across logout/login. Older backends
      // that don't yet know the field will silently ignore it; the local
      // store update below still reflects the choice for the current
      // session either way.
      await updateUserProfile(user.email, {
        name: name.trim(),
        country_id: String(selectedCountryId),
        preferred_language: selectedLang,
      });
      const sel = countries.find((c) => String(c.id) === String(selectedCountryId));
      // Carry the selected country's currency through to the user too,
      // otherwise feed-selection / report keep showing the previous
      // country's code after a profile-side country change.
      setUser({
        ...user,
        name: name.trim(),
        country_id: String(selectedCountryId),
        country: sel?.name ?? user.country,
        country_code: sel?.country_code ?? user.country_code,
        currency: sel?.currency ?? user.currency,
        preferred_language: selectedLang,
      });
      showSnackbar(t("Profile updated!"), "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      showSnackbar(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deletePin.length !== PIN_LENGTH) {
      showSnackbar(t("Enter your 6-digit PIN to confirm"), "error");
      return;
    }
    setIsDeleting(true);
    try {
      // v1 backend: POST /v1/auth/user-delete-account body { pin }.
      // user_id no longer passed — derived from the JWT.
      await deleteAccount(deletePin);
      setShowPinSheet(false);
      setDeletePin("");
      logout();
      endServerSession();
      router.replace("/welcome");
      showSnackbar(t("Account deleted. Sorry to see you go."), "info");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Account deletion failed";
      showSnackbar(message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Open the confirmation sheet instead of firing the API immediately. The
  // sheet shows the signed-in user's own email, read-only (audit A-20).
  const handleResetPin = () => {
    if (!user) return;
    setShowResetSheet(true);
  };

  const openChangePinSheet = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setShowChangePinSheet(true);
  };

  const isChangePinReady =
    currentPin.length >= LEGACY_PIN_LENGTH &&
    currentPin.length <= PIN_LENGTH &&
    newPin.length === PIN_LENGTH &&
    confirmNewPin.length === PIN_LENGTH &&
    newPin === confirmNewPin;

  const handleChangePin = async () => {
    if (!user || !isChangePinReady || isChangingPin) return;
    setIsChangingPin(true);
    try {
      const res = await changePin(user.email, currentPin, newPin);
      const msg = messageOf(res.data);
      showSnackbar(msg ?? t("PIN changed successfully"), "success");
      setShowChangePinSheet(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmNewPin("");
    } catch (err: unknown) {
      showSnackbar(authErrorMessage(err, "Could not change PIN. Please try again.", t), "error");
    } finally {
      setIsChangingPin(false);
    }
  };

  const isResetReady = isEmailAddressValid((user.email ?? "").trim());

  const handleResetSend = async () => {
    if (!isResetReady) return;
    await sendReset(user.email ?? "");
  };

  // Enable Save whenever a field has CHANGED — including a cleared/whitespace
  // name. We intentionally do NOT gate on `name.trim() !== ""` here: doing so
  // left the empty-name case with a permanently-disabled button, so the
  // "Name cannot be empty" guard in handleSave() was unreachable dead code.
  // Enabling on change lets that guard fire (error snackbar, no request sent),
  // matching the documented behaviour.
  const canSave =
    name.trim() !== user.name ||
    String(selectedCountryId) !== String(user.country_id) ||
    // i18n V2 — Save enables when language changed too.
    (showLangSelector && selectedLang !== (user.preferred_language ?? "en"));

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Your Profile")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Profile card */}
        <div
          className="mx-3 mt-3 bg-white px-4 py-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)", borderRadius: 18 }}
        >
          {/* Avatar + Name + Email — horizontal row */}
          <div
            className="flex items-center gap-3 mb-4 pb-4"
            style={{ borderBottom: `1px solid ${COLORS.americanDiamond}` }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 52,
                height: 52,
                backgroundColor: COLORS.honeydew,
                borderRadius: 16,
                border: "1px solid rgba(5,188,109,0.15)",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                <circle
                  cx="20"
                  cy="14"
                  r="7"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="2.2"
                />
                <path
                  d="M6 36c0-6.627 6.268-12 14-12s14 5.373 14 12"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className="font-bold truncate"
                style={{ color: COLORS.raisinBlack, fontSize: 18 }}
              >
                {user.name}
              </span>
              <span className="text-sm truncate" style={{ color: COLORS.darkSilver }}>
                {user.email}
              </span>
            </div>
          </div>

          {/* Uniform loading: while countries are being fetched, every
              editable field (Name, Country, Language) shimmers in place —
              same real markup rendered either way (see loadingFieldProps
              above, matching cattle-info's pattern), so there's no layout
              jump when data arrives, just the shimmer/disabled/hidden-text
              treatment lifting off all three fields at once. */}
          {/* Name (editable) */}
          <label
            htmlFor="profile-name"
            className="block text-xs font-bold uppercase tracking-wide mb-1.5 ml-1"
            style={labelStyle}
          >
            {t("Name *")}
          </label>
          <input
            id="profile-name"
            aria-label={t("Name")}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...loadingFieldProps(
              countriesLoading,
              "w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
              inputStyle()
            )}
          />

          {/* Country (editable dropdown) — appearance-none strips the
              native chevron, so we overlay an Android-style ic_text_drop_down
              caret on the right. */}
          <p
            className="text-xs font-bold uppercase tracking-wide mt-4 mb-1.5 ml-1"
            style={labelStyle}
          >
            {t("Country *")}
          </p>
          <div className="relative">
            <select
              aria-label={t("Country")}
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              {...loadingFieldProps(
                countriesLoading,
                "w-full rounded-2xl px-4 py-3.5 pr-10 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none",
                { ...inputStyle(), cursor: "pointer" }
              )}
            >
              {countries.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <div
              className="absolute pointer-events-none"
              style={{ right: 16, top: "50%", transform: "translateY(-50%)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 6l5 5 5-5"
                  stroke={COLORS.raisinBlack}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Language (editable dropdown) — always rendered, shimmered
              in place like Name/Country while countries are loading
              (rather than being skipped/replaced) since showLangSelector
              is always true. English is forced into the list even when
              the country technically supports only English, so the user
              can always see + reconfirm their language. */}
          {showLangSelector && (
            <>
              <p
                className="text-xs font-bold uppercase tracking-wide mt-4 mb-1.5 ml-1"
                style={labelStyle}
              >
                {t("Language")}
              </p>
              <div className="relative">
                <select
                  aria-label={t("Language")}
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  {...loadingFieldProps(
                    countriesLoading,
                    "w-full rounded-2xl px-4 py-3.5 pr-10 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none",
                    { ...inputStyle(), cursor: "pointer" }
                  )}
                >
                  {supportedLangs.map((code) => (
                    <option key={code} value={code}>
                      {labelForLanguage(code)}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute pointer-events-none"
                  style={{ right: 16, top: "50%", transform: "translateY(-50%)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 6l5 5 5-5"
                      stroke={COLORS.raisinBlack}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </>
          )}

          {/* Save Changes */}
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="w-full mt-5 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                canSave && !isSaving ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
              color: canSave && !isSaving ? COLORS.white : COLORS.spanishGray,
              border: "none",
              cursor: canSave && !isSaving ? "pointer" : "not-allowed",
              transition: "background-color 0.2s",
            }}
          >
            {isSaving ? (
              <>
                <Spinner size={18} />
                {t("Saving...")}
              </>
            ) : (
              <>
                {t("Update Profile")}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12a8 8 0 0 1 13.659-5.667"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20 12a8 8 0 0 1-13.659 5.667"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="16 7 17.659 6.333 21 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="8 17 6.341 17.667 3 19"
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

        <ProfileActions
          onDelete={() => setShowDeleteDialog(true)}
          onResetPin={handleResetPin}
          onChangePin={openChangePinSheet}
          t={t}
        />
      </div>

      {/* Reset-PIN bottom sheet — mirrors Login's Forgot PIN flow. The
          email field is pre-filled with the signed-in user's email but
          editable; nothing is sent until the user taps Proceed. */}
      {showResetSheet && (
        <ResetPinSheet
          handleResetSend={handleResetSend}
          isResetReady={isResetReady}
          isSendingReset={isSendingReset}
          setShowResetSheet={setShowResetSheet}
          t={t}
          user={user}
        />
      )}

      {/* Delete Account confirmation dialog — mirrors Android
          dialog_confirm_delete_account.xml. Scrim dismiss matches the
          MaterialAlertDialog default (setCanceledOnTouchOutside=true). */}
      {showDeleteDialog && (
        <DeleteAccountDialog
          setShowDeleteDialog={setShowDeleteDialog}
          setShowPinSheet={setShowPinSheet}
          t={t}
        />
      )}

      {/* Submit PIN bottom sheet — mirrors Android dialog_submit_pin.xml:
          mint drag handle (bg_bottom_sheet_pin = go_green_15), bold
          dark_aquamarine_green title, PIN_LENGTH-digit PIN input, full-pill submit
          (light_gray_new disabled, dark_aquamarine_green enabled), then
          PoweredBy at the bottom. Tap-outside-to-dismiss. */}
      {showPinSheet && (
        <SubmitPinSheet
          deletePin={deletePin}
          handleDelete={handleDelete}
          isDeleting={isDeleting}
          setDeletePin={setDeletePin}
          setShowPinSheet={setShowPinSheet}
          t={t}
        />
      )}

      {/* Change-PIN bottom sheet — confined to centered column.
          Three PinInputs: current (4-6 digit accepting legacy),
          new (6), confirm-new (6). Disabled cascade so user fills
          top-to-bottom. */}
      {showChangePinSheet && (
        <ChangePinSheet
          confirmNewPin={confirmNewPin}
          currentPin={currentPin}
          handleChangePin={handleChangePin}
          isChangePinReady={isChangePinReady}
          isChangingPin={isChangingPin}
          newPin={newPin}
          setConfirmNewPin={setConfirmNewPin}
          setCurrentPin={setCurrentPin}
          setNewPin={setNewPin}
          setShowChangePinSheet={setShowChangePinSheet}
          t={t}
        />
      )}
    </div>
  );
}
