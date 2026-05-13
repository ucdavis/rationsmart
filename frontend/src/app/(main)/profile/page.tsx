"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { updateUserProfile, deleteAccount, getCountries, resetPin } from "@/lib/api";
import Toolbar from "@/components/Toolbar";
import PinInput from "@/components/ui/PinInput";

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
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [countries, setCountries] = useState<Array<{ id: string | number; name: string; country_code?: string }>>([]);
  const [selectedCountryId, setSelectedCountryId] = useState(user?.country_id ?? "");

  useEffect(() => {
    getCountries()
      .then((res) => {
        const list = res.data ?? [];
        setCountries(list.map((c) => ({ id: c.id, name: c.name, country_code: c.country_code ?? c.code })));
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
      setUser({
        ...user,
        name: name.trim(),
        country_id: String(selectedCountryId),
        country: selectedCountry?.name ?? user.country,
        country_code: selectedCountry?.country_code ?? user.country_code,
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

  const handleResetPin = async () => {
    if (!user) return;
    setIsResettingPin(true);
    try {
      await resetPin(user.email);
      showSnackbar("PIN reset email sent. Please check your inbox.", "success");
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Failed to send reset email", "error");
    } finally {
      setIsResettingPin(false);
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

        {/* Reset PIN + Delete Account — side by side */}
        <div className="mx-3 mt-3 flex gap-3">
          <button
            onClick={handleResetPin}
            disabled={isResettingPin}
            className="flex-1 py-3.5 text-base flex items-center justify-center gap-2"
            style={{
              border: "none",
              color: isResettingPin ? "#999999" : "#296CD3",
              backgroundColor: isResettingPin ? "#F1F5F9" : "rgba(41,108,211,0.25)",
              fontFamily: "Nunito, sans-serif",
              cursor: isResettingPin ? "not-allowed" : "pointer",
              borderRadius: 14,
            }}
          >
            {isResettingPin ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 11V7a4 4 0 0 1 7.745-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 15.5v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Reset PIN
              </>
            )}
          </button>

          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex-1 py-3.5 text-base"
            style={{
              border: "none",
              color: "#E44A4A",
              backgroundColor: "rgba(228,74,74,0.20)",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
              borderRadius: 14,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6, flexShrink: 0 }}>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Delete Account
          </button>
        </div>

      </div>

      {/* Delete Account confirmation dialog — confined to centered column */}
      {showDeleteDialog && (
        <div
          className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs pt-7 pb-5 px-4"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <div
              className="flex items-center justify-center mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(228,74,74,0.2)" }}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M4 7h18M10 7V5h6v2M16 7v13H10V7h6zM7 7l1 13M19 7l-1 13" stroke="#FC2E20" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3
              className="text-center font-bold mb-2 mx-3"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              Are you sure you want to delete your account?
            </h3>
            <p
              className="text-center text-sm mb-5 mx-3"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              This action is permanent. Your account and data will be deleted permanently.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5"
                style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}
              >
                No
              </button>
              <button
                onClick={() => { setShowDeleteDialog(false); setShowPinSheet(true); }}
                className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5"
                style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN entry bottom sheet (second step of delete) — confined to centered column */}
      {showPinSheet && (
        <div
          className="fixed top-0 h-full z-50 flex items-end justify-center"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-[430px] pb-10 pt-5 px-4"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-5">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#E2E8F0" }} />
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
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                    </svg>
                    Deleting...
                  </>
                ) : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
