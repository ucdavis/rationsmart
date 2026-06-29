"use client";

// i18n V2 Phase 2 — Admin > Languages
// Spec source: ~/Desktop/post_impl_multi_language/api_endpoints_for_frontend.md §4.1–4.3
//
// Purpose:
//   - List every language registered system-wide
//   - Register a new language (code + display name)
//   - Toggle is_active to deactivate without losing the row + its translations

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { listLanguages, createLanguage, patchLanguage, labelForLanguage } from "@/lib/api";

interface LanguageRow {
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export default function AdminLanguagesPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Access gate — non-admins shouldn't be on this page anyway, but defend.
  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = () => {
    setIsLoading(true);
    listLanguages()
      .then((res) => {
        // Verbose logger so DevTools shows the exact backend shape.
        // Backend may return either { languages: [...] } per the spec
        // or a bare array — we accept both. Sample shape printed below.
        console.log("[admin/languages] /v1/admin/languages response:", {
          status: res.status,
          data: res.data,
          headers: res.headers,
        });
        const d = res.data as { languages?: LanguageRow[] } | LanguageRow[];
        const list = Array.isArray(d) ? d : (d?.languages ?? []);
        setLanguages(list);
      })
      .catch((err: unknown) => {
        // Surface the real failure cause — DevTools + snackbar.
        const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
        const status = ax?.response?.status;
        console.error("[admin/languages] /v1/admin/languages failed:", {
          status,
          data: ax?.response?.data,
          message: ax?.message,
        });
        showSnackbar(
          status
            ? `Could not load languages (HTTP ${status})`
            : "Could not load languages",
          "error"
        );
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (user?.is_admin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  const handleAdd = async () => {
    const code = newCode.trim().toLowerCase();
    if (!code || !newName.trim()) {
      showSnackbar("Code and name are required", "error");
      return;
    }
    if (code.length > 10) {
      showSnackbar("Code must be 10 characters or fewer", "error");
      return;
    }
    setIsCreating(true);
    try {
      await createLanguage({ code, name: newName.trim() });
      showSnackbar("Language registered", "success");
      setShowAdd(false);
      setNewCode("");
      setNewName("");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not add language";
      showSnackbar(msg, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (row: LanguageRow) => {
    try {
      await patchLanguage(row.code, { is_active: !row.is_active });
      showSnackbar(`Language ${!row.is_active ? "activated" : "deactivated"}`, "success");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update language";
      showSnackbar(msg, "error");
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Language Catalog" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Explainer banner — clarifies what this screen does vs Profile.
            Multiple admins reported expecting the toggles to switch their
            OWN app language; that's actually the Profile screen. This is
            the system-wide registry only. */}
        <div className="mx-3 mt-3 px-3.5 py-3 rounded-2xl flex gap-2.5" style={{ backgroundColor: "#E3F2FD", border: "1px solid rgba(41,108,211,0.20)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10" fill="#296CD3" />
            <circle cx="12" cy="7.6" r="1.35" fill="#FFFFFF" />
            <rect x="10.95" y="10.5" width="2.1" height="7" rx="1.05" fill="#FFFFFF" />
          </svg>
          <div style={{ fontFamily: "Nunito, sans-serif" }}>
            <p className="font-bold text-sm" style={{ color: "#1E40AF" }}>
              System-wide language catalog
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#1E40AF", lineHeight: 1.5 }}>
              This is the master list of languages the platform knows about.
              The toggle activates / deactivates a language across the whole
              system. To switch <span className="font-bold">YOUR</span> app to a different language,
              open <span className="font-bold">Profile → Language</span> instead.
            </p>
          </div>
        </div>

        {/* Header — count + Add button */}
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            {languages.length} language{languages.length === 1 ? "" : "s"} registered
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm"
            style={{ backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Add Language
          </button>
        </div>

        {/* List */}
        <div className="px-3 pt-3">
          {isLoading ? (
            <div className="bg-white rounded-2xl px-4 py-6 text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Loading…
            </div>
          ) : languages.length === 0 ? (
            <div className="bg-white rounded-2xl px-4 py-10 text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              No languages yet. Tap “Add Language” to register one.
            </div>
          ) : (
            <div className="space-y-2.5">
              {languages.map((row) => (
                <div
                  key={row.code}
                  className="flex items-center justify-between bg-white px-4 py-3.5 rounded-2xl"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                        {row.name}
                      </p>
                      <span className="text-xs uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        {row.code}
                      </span>
                    </div>
                    {/* Native-script preview when known — helps admins spot
                        confusion (e.g. registered 'hi' but typed 'Hindee'). */}
                    {labelForLanguage(row.code) !== row.code.toUpperCase() && (
                      <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        Native: {labelForLanguage(row.code)}
                      </p>
                    )}
                  </div>
                  {/* English (en) cannot be deactivated server-side (backend
                      returns 400 on PATCH and 400 on DELETE for "en"). To
                      keep the row visually consistent with the others, we
                      render a LOCKED toggle in the ON position — same
                      track/knob graphic, but the input is disabled and a
                      tiny lock icon overlays the knob so the locked state
                      is unambiguous. */}
                  {row.code === "en" ? (
                    <span
                      className="toggle-switch"
                      title="English cannot be deactivated"
                      aria-label="English language is always active"
                      style={{ position: "relative", opacity: 0.65, cursor: "not-allowed" }}
                    >
                      <input
                        type="checkbox"
                        checked
                        disabled
                        readOnly
                      />
                      <span className="toggle-slider" />
                      {/* Padlock overlay on the knob — Material-style outline. */}
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                        aria-hidden
                      >
                        <rect x="5" y="11" width="14" height="9" rx="2" fill="#FFFFFF" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#FFFFFF" strokeWidth="2" />
                      </svg>
                    </span>
                  ) : (
                    <label className="toggle-switch" aria-label={row.is_active ? "Deactivate language" : "Activate language"}>
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={() => handleToggle(row)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Language bottom sheet */}
      {showAdd && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>
            <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
              Add Language
            </h3>

            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              CODE <span style={{ color: "#FC2E20" }}>*</span>
            </p>
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toLowerCase())}
              placeholder="e.g. hi, vi, sw"
              maxLength={10}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark mb-3"
              style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            />

            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              NAME <span style={{ color: "#FC2E20" }}>*</span>
            </p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Hindi, Vietnamese, Kiswahili"
              maxLength={100}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark mb-5"
              style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-3 rounded-xl font-bold"
                style={{ backgroundColor: "transparent", color: "#064E3B", border: "2px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isCreating}
                className="flex-1 py-3 rounded-xl font-bold"
                style={{ backgroundColor: isCreating ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isCreating ? "not-allowed" : "pointer" }}
              >
                {isCreating ? "Adding…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
