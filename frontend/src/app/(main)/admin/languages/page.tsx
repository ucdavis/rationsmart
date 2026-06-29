"use client";

// i18n V2 Phase 2 (refactored 2026-06-29) — Admin > Language Catalog
//
// Merged screen: country → languages, each with a toggle that
// assigns/unassigns the language for that country. The old separate
// /admin/country-languages route now redirects here for back-compat.
//
// Layout shape (per user decision):
//   - One expandable card per country
//   - Card header shows country name + a "English + N more" badge so
//     the admin can scan the rollout state quickly
//   - Inside each card: rows of (language native label + code + toggle)
//   - English is HIDDEN (implicit baseline, can't be toggled anyway)
//   - Global is_active toggle from /admin/languages PATCH is intentionally
//     NOT exposed here (per user decision — would confuse "deactivate
//     for this country" with "freeze out everywhere")
//
// Backend interactions:
//   listLanguages()                    — global catalog (= which langs the
//                                         system knows about). Used to list
//                                         the toggles inside each country.
//   listCountriesWithLanguages()       — country list + currently-assigned
//                                         languages per country.
//   assignLanguageToCountry(c, l)      — toggle ON  → POST 4.5
//   unassignLanguageFromCountry(c, l)  — toggle OFF → DELETE 4.6
//   createLanguage(body)               — Add Language button (4.1)
//
// English ('en') is NEVER toggleable — backend DELETE returns 400 on en.
// We just don't render its row.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import {
  listLanguages,
  listCountriesWithLanguages,
  createLanguage,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  labelForLanguage,
} from "@/lib/api";

interface SystemLanguage {
  code: string;
  name: string;
  is_active: boolean;
}
interface CountryRow {
  id: string;
  name: string;
  country_code?: string;
  languages: string[];
}

export default function AdminLanguageCatalogPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Per-(country, lang) busy flag so a fast double-tap doesn't fire
  // both ON and OFF requests. Keyed as "<country_id>:<code>".
  const [pendingKey, setPendingKey] = useState<Set<string>>(new Set());

  // Add Language sheet (registers a row in the global catalog).
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = () => {
    setIsLoading(true);
    Promise.allSettled([listLanguages(), listCountriesWithLanguages()])
      .then(([langRes, countriesRes]) => {
        if (langRes.status === "fulfilled") {
          console.log("[admin/languages] /v1/admin/languages response:", {
            status: langRes.value.status,
            data: langRes.value.data,
          });
          const d = langRes.value.data as { languages?: SystemLanguage[] } | SystemLanguage[];
          setAllLanguages(Array.isArray(d) ? d : d?.languages ?? []);
        } else {
          const ax = langRes.reason as { response?: { status?: number; data?: unknown }; message?: string };
          console.error("[admin/languages] catalog load failed:", {
            status: ax?.response?.status, data: ax?.response?.data, message: ax?.message,
          });
          showSnackbar(
            ax?.response?.status ? `Could not load language catalog (HTTP ${ax.response.status})` : "Could not load language catalog",
            "error"
          );
        }
        if (countriesRes.status === "fulfilled") {
          console.log("[admin/languages] /v1/admin/countries response:", {
            status: countriesRes.value.status,
            data: countriesRes.value.data,
          });
          const d = countriesRes.value.data as { countries?: CountryRow[] } | CountryRow[];
          setCountries(Array.isArray(d) ? d : d?.countries ?? []);
        } else {
          const ax = countriesRes.reason as { response?: { status?: number; data?: unknown }; message?: string };
          console.error("[admin/languages] countries load failed:", {
            status: ax?.response?.status, data: ax?.response?.data, message: ax?.message,
          });
          showSnackbar(
            ax?.response?.status ? `Could not load countries (HTTP ${ax.response.status})` : "Could not load countries",
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

  // Show every active non-English language in the toggle list — that's
  // the set of options each country can opt into. We don't filter by
  // already-assigned because the toggle itself reflects the state.
  const assignableLanguages = allLanguages.filter((l) => l.is_active && l.code !== "en");

  const toggleExpand = (countryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(countryId)) next.delete(countryId);
      else next.add(countryId);
      return next;
    });
  };

  // Per-(country, lang) toggle. Optimistic update: flip the in-memory
  // assignment first; on failure, snackbar + reload (server is source
  // of truth, so reload restores correct state without us guessing).
  const handleToggleAssignment = async (countryRow: CountryRow, code: string, currentlyOn: boolean) => {
    const key = `${countryRow.id}:${code}`;
    if (pendingKey.has(key)) return;
    setPendingKey((prev) => new Set(prev).add(key));

    // Optimistic local flip.
    setCountries((prev) =>
      prev.map((c) =>
        c.id !== countryRow.id
          ? c
          : {
              ...c,
              languages: currentlyOn
                ? c.languages.filter((x) => x !== code)
                : [...c.languages, code],
            }
      )
    );

    try {
      if (currentlyOn) {
        await unassignLanguageFromCountry(countryRow.id, code);
        showSnackbar(`'${code}' removed from ${countryRow.name}`, "success");
      } else {
        await assignLanguageToCountry(countryRow.id, code);
        showSnackbar(`'${code}' added to ${countryRow.name}`, "success");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update assignment";
      showSnackbar(msg, "error");
      // Rollback by reloading server state.
      reload();
    } finally {
      setPendingKey((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Add to the global catalog. After insert we reload so the new
  // language shows up under every country's toggle list (unassigned by
  // default).
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
      showSnackbar("Language added to catalog", "success");
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

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Language Catalog" onBack={() => router.back()} />

      {/* Explainer banner — tells the admin what this screen actually
          does, since the old "Languages" name confused users who expected
          a UI-language switcher. */}
      <div className="mx-3 mt-3 px-3.5 py-3 rounded-2xl flex gap-2.5" style={{ backgroundColor: "#E3F2FD", border: "1px solid rgba(41,108,211,0.20)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
          <circle cx="12" cy="12" r="10" fill="#296CD3" />
          <circle cx="12" cy="7.6" r="1.35" fill="#FFFFFF" />
          <rect x="10.95" y="10.5" width="2.1" height="7" rx="1.05" fill="#FFFFFF" />
        </svg>
        <div style={{ fontFamily: "Nunito, sans-serif" }}>
          <p className="font-bold text-sm" style={{ color: "#1E40AF" }}>
            Enable languages per country
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#1E40AF", lineHeight: 1.5 }}>
            Expand a country and switch on the languages its users can pick from
            <span className="font-bold"> Profile → Language</span>. English is always available.
            To register a new language, use <span className="font-bold">+ Add Language</span>.
          </p>
        </div>
      </div>

      {/* Toolbar row — count + Add Language */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          {allLanguages.length} in catalog · {countries.length} countr{countries.length === 1 ? "y" : "ies"}
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

      <div className="flex-1 overflow-y-auto pb-24 px-3 pt-2">
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
            {countries.map((c) => {
              const isOpen = expanded.has(c.id);
              // The non-English languages the country has assigned (for the
              // header summary). English is always-on by definition.
              const extraLangs = c.languages.filter((x) => x !== "en");
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl overflow-hidden"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                >
                  {/* Country header — clickable to expand */}
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5"
                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                        {c.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        English{extraLangs.length > 0 && ` + ${extraLangs.length} more`}
                      </p>
                    </div>
                    {/* Chevron rotates 180° when open */}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s" }}
                    >
                      <path d="M6 9l6 6 6-6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Expandable body — language toggle list. English is
                      hidden entirely; backend treats it as the implicit
                      baseline and refuses to toggle it. */}
                  {isOpen && (
                    <div className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      {assignableLanguages.length === 0 ? (
                        <p className="text-xs italic px-4 py-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                          No additional languages in the catalog yet. Tap “Add Language” above to register one.
                        </p>
                      ) : (
                        assignableLanguages.map((lang) => {
                          const isAssigned = c.languages.includes(lang.code);
                          const key = `${c.id}:${lang.code}`;
                          const isPending = pendingKey.has(key);
                          return (
                            <div
                              key={lang.code}
                              className="flex items-center justify-between px-4 py-3"
                              style={{ borderTop: "1px solid #F8FAF9" }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                                    {lang.name}
                                  </p>
                                  <span className="text-xs uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {lang.code}
                                  </span>
                                </div>
                                {/* Native-script preview when known so the admin
                                    sees exactly what the user will see in their
                                    Profile dropdown. */}
                                {labelForLanguage(lang.code) !== lang.code.toUpperCase() && (
                                  <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {labelForLanguage(lang.code)}
                                  </p>
                                )}
                              </div>
                              <label
                                className="toggle-switch"
                                aria-label={isAssigned ? `Disable ${lang.code} for ${c.name}` : `Enable ${lang.code} for ${c.name}`}
                                style={{ opacity: isPending ? 0.55 : 1, cursor: isPending ? "wait" : "pointer" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  disabled={isPending}
                                  onChange={() => handleToggleAssignment(c, lang.code, isAssigned)}
                                />
                                <span className="toggle-slider" />
                              </label>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Language bottom sheet — registers a row in the global
          catalog. After insert it will appear (unassigned) under every
          country's toggle list. */}
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
