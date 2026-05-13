"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { updateUserProfile, deleteAccount, getCountries, resetPin } from "@/lib/api";
import { isEmailAddressValid } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";
import PinInput from "@/components/ui/PinInput";
import PoweredBy from "@/components/PoweredBy";

const inputStyle = (readOnly?: boolean) => ({
  backgroundColor: readOnly ? "#F8FAF9" : "#F1F5F9",
  color: readOnly ? "#999999" : "#231F20",
  fontFamily: "Nunito, sans-serif",
});

const labelStyle = {
  color: "#6D6D6D",
  fontFamily: "Nunito, sans-serif",
};

export default function ProfilePage() {
  const router = useRouter();
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
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [countries, setCountries] = useState<Array<{ id: string | number; name: string; country_code?: string; currency?: string }>>([]);
  const [selectedCountryId, setSelectedCountryId] = useState(user?.country_id ?? "");

  useEffect(() => {
    getCountries()
      .then((res) => {
        const list = res.data ?? [];
        setCountries(list.map((c) => ({ id: c.id, name: c.name, country_code: c.country_code ?? c.code, currency: c.currency ?? undefined })));
      })
      .catch(() => {
        // silently ignore — dropdown will just be empty
      });
  }, []);

  if (!user) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      showSnackbar("Name cannot be empty", "error");
      return;
    }
    setIsSaving(true);
    try {
      await updateUserProfile(user.email, { name: name.trim(), country_id: String(selectedCountryId) });
      const selectedCountry = countries.find((c) => String(c.id) === String(selectedCountryId));
      // Carry the selected country's currency through to the user too,
      // otherwise feed-selection / report keep showing the previous
      // country's code after a profile-side country change.
      setUser({
        ...user,
        name: name.trim(),
        country_id: String(selectedCountryId),
        country: selectedCountry?.name ?? user.country,
        country_code: selectedCountry?.country_code ?? user.country_code,
        currency: selectedCountry?.currency ?? user.currency,
      });
      showSnackbar("Profile updated!", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      showSnackbar(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deletePin.length !== 4) {
      showSnackbar("Enter your 4-digit PIN to confirm", "error");
      return;
    }
    setIsDeleting(true);
    try {
      await deleteAccount(user.id, deletePin);
      setShowPinSheet(false);
      setDeletePin("");
      logout();
      router.replace("/welcome");
      showSnackbar("Account deleted. Sorry to see you go.", "info");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Account deletion failed";
      showSnackbar(message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Open the email-confirmation sheet instead of firing the API
  // immediately. Pre-fill with the signed-in user's email — they can
  // tweak it if they registered with a different address.
  const handleResetPin = () => {
    if (!user) return;
    setResetEmail(user.email ?? "");
    setShowResetSheet(true);
  };

  const isResetReady = isEmailAddressValid(resetEmail.trim());

  const handleResetSend = async () => {
    if (!isResetReady || isSendingReset) return;
    setIsSendingReset(true);
    try {
      const res = await resetPin(resetEmail.trim());
      const successMsg = (res.data as { message?: string })?.message;
      showSnackbar(successMsg ?? "PIN reset email sent. Please check your inbox.", "success");
      setShowResetSheet(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message && err.message !== "Network Error"
          ? err.message
          : err instanceof Error && err.message === "Network Error"
            ? "Please make sure your device has internet connectivity."
            : "Failed to send reset email. Please try again.";
      showSnackbar(message, "error");
    } finally {
      setIsSendingReset(false);
    }
  };

  const canSave =
    name.trim() !== "" &&
    (name.trim() !== user.name || String(selectedCountryId) !== String(user.country_id));

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Your Profile" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Profile card */}
        <div
          className="mx-3 mt-3 bg-white px-4 py-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)", borderRadius: 18 }}
        >
          {/* Avatar + Name + Email — horizontal row */}
          <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 52, height: 52, backgroundColor: "#F0FDF4", borderRadius: 16, border: "1px solid rgba(5,188,109,0.15)" }}
            >
              <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="14" r="7" stroke="#064E3B" strokeWidth="2.2" />
                <path d="M6 36c0-6.627 6.268-12 14-12s14 5.373 14 12" stroke="#064E3B" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className="font-bold truncate"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 18 }}
              >
                {user.name}
              </span>
              <span
                className="text-sm truncate"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                {user.email}
              </span>
            </div>
          </div>

          {/* Name (editable) */}
          <p className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-1" style={labelStyle}>Name *</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={inputStyle()}
          />

          {/* Country (editable dropdown) */}
          <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1.5 ml-1" style={labelStyle}>Country *</p>
          <select
            value={selectedCountryId}
            onChange={(e) => setSelectedCountryId(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none"
            style={{ ...inputStyle(), cursor: "pointer" }}
          >
            {countries.length === 0 && (
              <option value={user.country_id}>{user.country}</option>
            )}
            {countries.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Save Changes */}
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="w-full mt-5 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: canSave && !isSaving ? "#064E3B" : "#D3D3D3",
              color: canSave && !isSaving ? "#FFFFFF" : "#999999",
              border: "none",
              fontFamily: "Nunito, sans-serif",
              cursor: canSave && !isSaving ? "pointer" : "not-allowed",
              transition: "background-color 0.2s",
            }}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                Update Profile
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12a8 8 0 0 1 13.659-5.667" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M20 12a8 8 0 0 1-13.659 5.667" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <polyline points="16 7 17.659 6.333 21 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="8 17 6.341 17.667 3 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </div>

        {/* Delete (left) + Reset PIN (right) — order and styling exactly
            match fragment_profile.xml:209-247.
              left  : btn_delete_profile  carmine_pink_20 bg / carmine_pink fg / ic_delete_account / text "Delete"
              right : btn_forgot_pin      celtic_blue_25  bg / celtic_blue fg / ic_reset_pin       / text "Reset PIN" */}
        <div className="mx-3 mt-3 flex gap-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex-1 py-3.5 text-base flex items-center justify-center gap-2"
            style={{
              border: "none",
              color: "#E44A4A",                          // carmine_pink
              backgroundColor: "rgba(228,74,74,0.20)",   // carmine_pink_20
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
              borderRadius: 14,
            }}
          >
            {/* ic_delete_account — Material Symbols filled trash with
                rounded lid (single filled path, viewport 24x24) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#E44A4A">
              <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V9c0,-1.1 -0.9,-2 -2,-2H8c-1.1,0 -2,0.9 -2,2v10zM18,4h-2.5l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29H9.91c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4H6c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1z" />
            </svg>
            Delete
          </button>

          <button
            onClick={handleResetPin}
            className="flex-1 py-3.5 text-base flex items-center justify-center gap-2"
            style={{
              border: "none",
              color: "#296CD3",                              // celtic_blue
              backgroundColor: "rgba(41,108,211,0.25)",      // celtic_blue_25
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
              borderRadius: 14,
            }}
          >
            {/* ic_reset_pin — Material Symbols refresh arrow with
                inset padlock (filled path, viewport 24x24) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#296CD3">
              <path d="M13.26,3C8.17,2.86 4,6.94 4,12H2.21c-0.45,0 -0.67,0.54 -0.35,0.85l2.79,2.79c0.2,0.2 0.51,0.2 0.71,0l2.8,-2.79C8.46,12.54 8.24,12 7.79,12H6c0,-3.89 3.2,-7.06 7.1,-7c3.71,0.05 6.84,3.18 6.9,6.9c0.06,3.91 -3.1,7.1 -7,7.1c-1.59,0 -3.05,-0.53 -4.23,-1.43c-0.4,-0.3 -0.96,-0.27 -1.31,0.09l0,0c-0.43,0.43 -0.39,1.14 0.09,1.5C9.06,20.31 10.95,21 13,21c5.06,0 9.14,-4.17 9,-9.25C21.87,7.05 17.95,3.13 13.26,3zM15,11v-1c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2v1c-0.55,0 -1,0.45 -1,1v3c0,0.55 0.45,1 1,1h4c0.55,0 1,-0.45 1,-1v-3C16,11.45 15.55,11 15,11zM14,11h-2v-1c0,-0.55 0.45,-1 1,-1s1,0.45 1,1V11z" />
            </svg>
            Reset PIN
          </button>
        </div>

      </div>

      {/* Reset-PIN bottom sheet — mirrors Login's Forgot PIN flow. The
          email field is pre-filled with the signed-in user's email but
          editable; nothing is sent until the user taps Proceed. */}
      {showResetSheet && (
        <>
          {/* Backdrop — confined to centered column. Tap to dismiss. */}
          <div
            className="fixed top-0 h-full z-50"
            style={{
              left: "max(0px, calc((100vw - 480px) / 2))",
              width: "min(100vw, 480px)",
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
            onClick={() => !isSendingReset && setShowResetSheet(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 mx-auto bg-white pb-5"
            style={{
              maxWidth: "min(100vw, 480px)",
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
            <p
              className="text-center mt-1 px-3"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
            >
              Enter your registered email to receive a reset link
            </p>

            {/* Email label + input */}
            <p
              className="text-xs font-bold uppercase tracking-wide mt-5 ml-3 mb-1.5"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              Email Address <span style={{ color: "#FC2E20" }}>*</span>
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

            {/* Proceed */}
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
                  <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                  </svg>
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

            <div className="mt-8">
              <PoweredBy />
            </div>
          </div>
        </>
      )}

      {/* Delete Account confirmation dialog — mirrors Android
          dialog_confirm_delete_account.xml. Scrim dismiss matches the
          MaterialAlertDialog default (setCanceledOnTouchOutside=true). */}
      {showDeleteDialog && (
        <div
          className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteDialog(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs pt-7 pb-5 px-4"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ic_additional_information — alert "!" inside an outlined
                circle, tinted red_ryb, inside a carmine_pink_20 pill. */}
            <div
              className="flex items-center justify-center mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(228,74,74,0.20)" }}
            >
              <svg width="28" height="28" viewBox="0 0 960 960" fill="#FC2E20">
                <path d="M480,680q17,0 28.5,-11.5T520,640v-160q0,-17 -11.5,-28.5T480,440q-17,0 -28.5,11.5T440,480v160q0,17 11.5,28.5T480,680ZM480,360q17,0 28.5,-11.5T520,320q0,-17 -11.5,-28.5T480,280q-17,0 -28.5,11.5T440,320q0,17 11.5,28.5T480,360ZM480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM480,800q134,0 227,-93t93,-227q0,-134 -93,-227t-227,-93q-134,0 -227,93t-93,227q0,134 93,227t227,93Z" />
              </svg>
            </div>

            {/* Title — Android string @delete_account: "Are you sure you
                want\nto delete your account?" */}
            <h3
              className="text-center font-bold mb-2 mx-3"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20, whiteSpace: "pre-line" }}
            >
              {"Are you sure you want\nto delete your account?"}
            </h3>

            {/* Description — Android string @delete_account_message */}
            <p
              className="text-center text-sm mb-5 mx-3"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-line" }}
            >
              {"This action is permanent. Your account\nand data will be deleted\npermanently."}
            </p>

            <div className="flex gap-3">
              {/* NO — outlined dark green button with ic_cancel (X-in-circle) */}
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-3 font-bold flex items-center justify-center gap-2"
                style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}
              >
                <svg width="18" height="18" viewBox="0 0 960 960" fill="#064E3B">
                  <path d="m480,536 l116,116q11,11 28,11t28,-11q11,-11 11,-28t-11,-28L536,480l116,-116q11,-11 11,-28t-11,-28q-11,-11 -28,-11t-28,11L480,424 364,308q-11,-11 -28,-11t-28,11q-11,11 -11,28t11,28l116,116 -116,116q-11,11 -11,28t11,28q11,11 28,11t28,-11l116,-116ZM480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM480,800q134,0 227,-93t93,-227q0,-134 -93,-227t-227,-93q-134,0 -227,93t-93,227q0,134 93,227t227,93Z" />
                </svg>
                No
              </button>

              {/* YES — filled carmine_pink button with ic_delete_account
                  (filled trash, same icon as the Profile Delete button) */}
              <button
                onClick={() => { setShowDeleteDialog(false); setShowPinSheet(true); }}
                className="flex-1 py-3 font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
                  <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V9c0,-1.1 -0.9,-2 -2,-2H8c-1.1,0 -2,0.9 -2,2v10zM18,4h-2.5l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29H9.91c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4H6c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1z" />
                </svg>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit PIN bottom sheet — mirrors Android dialog_submit_pin.xml:
          mint drag handle (bg_bottom_sheet_pin = go_green_15), bold
          dark_aquamarine_green title, 4-digit PIN input, full-pill submit
          (light_gray_new disabled, dark_aquamarine_green enabled), then
          PoweredBy at the bottom. Tap-outside-to-dismiss. */}
      {showPinSheet && (
        <div
          className="fixed top-0 h-full z-50 flex items-end justify-center"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) { setShowPinSheet(false); setDeletePin(""); } }}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-[430px] pb-5 pt-5 px-4"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — bg_bottom_sheet_pin = go_green_15 (mint) */}
            <div className="flex justify-center mb-5">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "rgba(5,188,109,0.15)" }} />
            </div>
            <h3
              className="text-center font-bold mb-5"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              Submit PIN
            </h3>
            <PinInput value={deletePin} onChange={setDeletePin} />
            <div className="mt-5">
              <button
                onClick={handleDelete}
                disabled={deletePin.length !== 4 || isDeleting}
                className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
                style={{
                  backgroundColor: deletePin.length === 4 && !isDeleting ? "#064E3B" : "#D3D3D3",
                  color: deletePin.length === 4 && !isDeleting ? "white" : "#999999",
                  border: "none",
                  fontFamily: "Nunito, sans-serif",
                  cursor: deletePin.length === 4 && !isDeleting ? "pointer" : "not-allowed",
                  transition: "background-color 0.2s",
                }}
              >
                {isDeleting ? (
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                  </svg>
                ) : "Submit"}
              </button>
            </div>

            <div className="mt-8">
              <PoweredBy />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
