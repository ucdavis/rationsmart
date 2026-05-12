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
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
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

  const handleLogout = () => {
    setShowLogoutDialog(false);
    logout();
    router.replace("/welcome");
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
          className="mx-3 mt-3 rounded-2xl bg-white px-4 py-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          {/* Avatar */}
          <div className="flex justify-center mb-4">
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{ width: 72, height: 72, backgroundColor: "#F0FDF4" }}
            >
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="14" r="7" stroke="#064E3B" strokeWidth="2.2" />
                <path d="M6 36c0-6.627 6.268-12 14-12s14 5.373 14 12" stroke="#064E3B" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Name (editable) */}
          <p className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-1" style={labelStyle}>Name</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={inputStyle()}
          />

          {/* Email (read-only) */}
          <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1.5 ml-1" style={labelStyle}>Email Address</p>
          <input
            type="email"
            value={user.email}
            readOnly
            className="w-full rounded-2xl px-4 py-3.5 text-base border-none"
            style={inputStyle(true)}
          />

          {/* Country (editable dropdown) */}
          <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1.5 ml-1" style={labelStyle}>Country</p>
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
            ) : "Update Profile"}
          </button>
        </div>

        {/* Reset PIN */}
        <div className="mx-3 mt-3">
          <button
            onClick={handleResetPin}
            disabled={isResettingPin}
            className="w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2"
            style={{
              border: "none",
              color: isResettingPin ? "#999999" : "#296CD3",
              backgroundColor: isResettingPin ? "#F1F5F9" : "rgba(41,108,211,0.25)",
              fontFamily: "Nunito, sans-serif",
              cursor: isResettingPin ? "not-allowed" : "pointer",
            }}
          >
            {isResettingPin ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Sending...
              </>
            ) : "Reset PIN"}
          </button>
        </div>

        {/* Delete Account */}
        <div className="mx-3 mt-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-base"
            style={{
              border: "2px solid #E44A4A",
              color: "#E44A4A",
              backgroundColor: "transparent",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>
        </div>

        {/* Logout */}
        <div className="mx-3 mt-3">
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-base"
            style={{
              border: "2px solid #064E3B",
              color: "#064E3B",
              backgroundColor: "transparent",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Logout dialog */}
      {showLogoutDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-xs"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <h3
              className="text-lg font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              Logout
            </h3>
            <p
              className="text-sm mb-5"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            >
              Are you sure you want to logout?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutDialog(false)}
                className="flex-1 py-3 rounded-2xl font-bold"
                style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 rounded-2xl font-bold"
                style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="bg-white rounded-t-2xl p-6 w-full max-w-[430px] pb-10"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
          >
            <div
              className="flex items-center justify-center rounded-full mx-auto mb-4"
              style={{ width: 56, height: 56, backgroundColor: "rgba(228,74,74,0.2)" }}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M4 7h18M10 7V5h6v2M16 7v13H10V7h6zM7 7l1 13M19 7l-1 13" stroke="#E44A4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3
              className="text-center text-lg font-bold mb-1"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            >
              Delete Account?
            </h3>
            <p
              className="text-center text-sm mb-5"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              This is permanent and cannot be undone. Enter your PIN to confirm.
            </p>

            <PinInput value={deletePin} onChange={setDeletePin} />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowDeleteDialog(false); setDeletePin(""); }}
                className="flex-1 py-3 rounded-2xl font-bold"
                style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePin.length !== 4 || isDeleting}
                className="flex-1 py-3 rounded-2xl font-bold flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: deletePin.length === 4 && !isDeleting ? "#E44A4A" : "#D3D3D3",
                  color: deletePin.length === 4 && !isDeleting ? "white" : "#999999",
                  border: "none",
                  fontFamily: "Nunito, sans-serif",
                  cursor: deletePin.length === 4 && !isDeleting ? "pointer" : "not-allowed",
                }}
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                    </svg>
                    Deleting...
                  </>
                ) : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
