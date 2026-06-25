"use client";

// i18n V2 Phase 2 — Admin > Country Languages
// Spec source: ~/Desktop/post_impl_multi_language/api_endpoints_for_frontend.md §4.4–4.6
//
// Purpose:
//   - List every country with its currently-assigned languages
//   - Per country: assign a language (from system-wide list) or remove one
//   - English cannot be removed (backend returns 400 — we hide its remove button)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import {
  listCountriesWithLanguages,
  listLanguages,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  labelForLanguage,
} from "@/lib/api";

interface CountryRow {
  id: string;
  name: string;
  country_code?: string;
  currency?: string;
  is_active?: boolean;
  languages: string[];
}

interface SystemLanguage {
  code: string;
  name: string;
  is_active: boolean;
}

export default function AdminCountryLanguagesPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [assignSheetCountry, setAssignSheetCountry] = useState<CountryRow | null>(null);
  const [selectedNewCode, setSelectedNewCode] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = () => {
    setIsLoading(true);
    // Run both calls and report which one(s) failed instead of swallowing
    // the error globally. allSettled so a missing endpoint on one side
    // doesn't hide the working one.
    Promise.allSettled([listCountriesWithLanguages(), listLanguages()])
      .then(([countriesRes, langRes]) => {
        if (countriesRes.status === "fulfilled") {
          console.log("[admin/country-languages] /v1/admin/countries response:", {
            status: countriesRes.value.status,
            data: countriesRes.value.data,
          });
          const d = countriesRes.value.data as { countries?: CountryRow[] } | CountryRow[];
          const list = Array.isArray(d) ? d : (d?.countries ?? []);
          setCountries(list);
        } else {
          const ax = countriesRes.reason as { response?: { status?: number; data?: unknown }; message?: string };
          console.error("[admin/country-languages] /v1/admin/countries failed:", {
            status: ax?.response?.status,
            data: ax?.response?.data,
            message: ax?.message,
          });
          showSnackbar(
            ax?.response?.status
              ? `Could not load countries (HTTP ${ax.response.status})`
              : "Could not load countries",
            "error"
          );
        }
        if (langRes.status === "fulfilled") {
          console.log("[admin/country-languages] /v1/admin/languages response:", {
            status: langRes.value.status,
            data: langRes.value.data,
          });
          const d = langRes.value.data as { languages?: SystemLanguage[] } | SystemLanguage[];
          const list = Array.isArray(d) ? d : (d?.languages ?? []);
          setAllLanguages(list);
        } else {
          const ax = langRes.reason as { response?: { status?: number; data?: unknown }; message?: string };
          console.error("[admin/country-languages] /v1/admin/languages failed:", {
            status: ax?.response?.status,
            data: ax?.response?.data,
            message: ax?.message,
          });
          showSnackbar(
            ax?.response?.status
              ? `Could not load languages (HTTP ${ax.response.status})`
              : "Could not load languages",
            "error"
          );
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (user?.is_admin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  const openAssign = (c: CountryRow) => {
    // Pre-pick the first language that is NOT already assigned + IS
    // active (so the admin sees a sensible default in the dropdown).
    const available = allLanguages
      .filter((l) => l.is_active && !c.languages.includes(l.code));
    setSelectedNewCode(available[0]?.code ?? "");
    setAssignSheetCountry(c);
  };

  const handleAssign = async () => {
    if (!assignSheetCountry || !selectedNewCode) return;
    setIsAssigning(true);
    try {
      await assignLanguageToCountry(assignSheetCountry.id, selectedNewCode);
      showSnackbar(`'${selectedNewCode}' assigned to ${assignSheetCountry.name}`, "success");
      setAssignSheetCountry(null);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not assign language";
      showSnackbar(msg, "error");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (country: CountryRow, code: string) => {
    // The backend rejects unassigning 'en' (400). Guard client-side too
    // so the chip just doesn't show the X icon on English (see render).
    if (code === "en") return;
    try {
      await unassignLanguageFromCountry(country.id, code);
      showSnackbar(`'${code}' removed from ${country.name}`, "success");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not remove language";
      showSnackbar(msg, "error");
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Country Languages" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-20 px-3 pt-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl px-4 py-6 text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Loading…
          </div>
        ) : countries.length === 0 ? (
          <div className="bg-white rounded-2xl px-4 py-10 text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            No countries found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {countries.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl px-4 py-3.5"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                    {c.name}
                  </p>
                  <button
                    onClick={() => openAssign(c)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: "#E4F7EF", color: "#064E3B", border: "1.5px solid rgba(5,188,109,0.30)", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                    aria-label={`Add language to ${c.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                    Add
                  </button>
                </div>

                {/* Chips for each assigned language. 'en' chip has no
                    remove button — backend rejects DELETE on it. */}
                <div className="flex flex-wrap gap-1.5">
                  {c.languages.length === 0 ? (
                    <span className="text-xs italic" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                      No languages assigned
                    </span>
                  ) : (
                    c.languages.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                        style={{ backgroundColor: "#F0FDF4", color: "#064E3B", border: "1px solid rgba(5,188,109,0.25)", fontFamily: "Nunito, sans-serif" }}
                      >
                        <span className="font-bold">{labelForLanguage(code)}</span>
                        <span style={{ color: "#6D6D6D" }}>· {code}</span>
                        {code !== "en" && (
                          <button
                            onClick={() => handleUnassign(c, code)}
                            aria-label={`Remove ${code} from ${c.name}`}
                            style={{ background: "none", border: "none", padding: "0 0 0 4px", cursor: "pointer", color: "#6D6D6D" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                              <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign-language bottom sheet */}
      {assignSheetCountry && (() => {
        const available = allLanguages.filter(
          (l) => l.is_active && !assignSheetCountry.languages.includes(l.code)
        );
        return (
          <div
            className="fixed top-0 h-full z-50 flex flex-col justify-end"
            style={{
              left: "max(0px, calc((100vw - 480px) / 2))",
              width: "min(100vw, 480px)",
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setAssignSheetCountry(null); }}
          >
            <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
              <div className="flex justify-center mb-3">
                <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
              </div>
              <h3 className="text-center font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
                Add Language
              </h3>
              <p className="text-center text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                {assignSheetCountry.name}
              </p>

              {available.length === 0 ? (
                <p className="text-center text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  All active languages are already assigned to this country.
                </p>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                    LANGUAGE
                  </p>
                  <select
                    value={selectedNewCode}
                    onChange={(e) => setSelectedNewCode(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
                    style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                  >
                    {available.map((l) => (
                      <option key={l.code} value={l.code}>
                        {labelForLanguage(l.code)} — {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setAssignSheetCountry(null)}
                  className="flex-1 py-3 rounded-xl font-bold"
                  style={{ backgroundColor: "transparent", color: "#064E3B", border: "2px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={available.length === 0 || isAssigning || !selectedNewCode}
                  className="flex-1 py-3 rounded-xl font-bold"
                  style={{ backgroundColor: available.length === 0 || isAssigning ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: available.length === 0 || isAssigning ? "not-allowed" : "pointer" }}
                >
                  {isAssigning ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
