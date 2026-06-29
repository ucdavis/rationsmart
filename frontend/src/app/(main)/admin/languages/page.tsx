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

  // Add-language-to-country sheet (per-country picker). Distinct from
  // the catalog-level "Add Language" sheet below.
  const [assignSheetCountry, setAssignSheetCountry] = useState<CountryRow | null>(null);
  const [selectedNewCode, setSelectedNewCode] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Add Language sheet (registers a row in the global catalog).
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Seed Defaults — one-tap assignment of the canonical country→language
  // mapping for the rollout locales. Idempotent: skips assignments that
  // already exist; skips silently if the language isn't yet in the
  // catalog. The result panel reports counts.
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSummary, setSeedSummary] = useState<{
    assigned: string[];
    skippedExisting: string[];
    skippedNoLanguage: string[];
    skippedNoCountry: string[];
    failed: { key: string; reason: string }[];
  } | null>(null);

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

  // Open the per-country assign sheet. Defaults to the first catalog
  // language that's NOT already enabled for this country.
  const openAssign = (c: CountryRow) => {
    const available = allLanguages.filter(
      (l) => l.is_active && l.code !== "en" && !c.languages.includes(l.code)
    );
    setSelectedNewCode(available[0]?.code ?? "");
    setAssignSheetCountry(c);
  };

  const handleAssign = async () => {
    if (!assignSheetCountry || !selectedNewCode) return;
    setIsAssigning(true);
    // Optimistic local add so the chip appears immediately.
    const countryId = assignSheetCountry.id;
    const code = selectedNewCode;
    setCountries((prev) =>
      prev.map((c) =>
        c.id !== countryId ? c : { ...c, languages: [...c.languages, code] }
      )
    );
    try {
      await assignLanguageToCountry(countryId, code);
      showSnackbar(`'${code}' enabled for ${assignSheetCountry.name}`, "success");
      setAssignSheetCountry(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not enable language";
      showSnackbar(msg, "error");
      reload();
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleExpand = (countryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(countryId)) next.delete(countryId);
      else next.add(countryId);
      return next;
    });
  };

  // Toggle a language off for a country (removes the assignment). The
  // new layout only renders rows for already-enabled languages, so the
  // ONLY direction this handler ever goes is ON → OFF. Adding is handled
  // by the per-country "+ Add Language" sheet (handleAssign above).
  const handleUnassign = async (countryRow: CountryRow, code: string) => {
    const key = `${countryRow.id}:${code}`;
    if (pendingKey.has(key)) return;
    setPendingKey((prev) => new Set(prev).add(key));

    // Optimistic local remove so the chip disappears immediately.
    setCountries((prev) =>
      prev.map((c) =>
        c.id !== countryRow.id ? c : { ...c, languages: c.languages.filter((x) => x !== code) }
      )
    );

    try {
      await unassignLanguageFromCountry(countryRow.id, code);
      showSnackbar(`'${code}' disabled for ${countryRow.name}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not disable language";
      showSnackbar(msg, "error");
      // Server is source of truth — reload to restore correct state.
      reload();
    } finally {
      setPendingKey((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Seed Default Mappings ─────────────────────────────────────────────
  // Canonical country → language assignments for the rollout locales.
  // Each entry can have multiple language codes (e.g. Ethiopia gets both
  // Amharic and Oromo when represented as a single country row).
  //
  // Country matching is name-based, case-insensitive substring — handles
  // small variants like "Ethiopia" vs "Ethiopia (FDRE)" without us
  // hard-coding country IDs. Multiple country rows for one logical
  // country (e.g. "Ethiopia (Amharic region)" + "Ethiopia (Oromia
  // region)") are matched on the regional cue when present so each
  // gets the right single language; otherwise both langs go to all
  // matching country rows.
  //
  // The function POSTs assignments in sequence and accumulates a result
  // breakdown (assigned / skipped-existing / skipped-no-language /
  // skipped-no-country / failed). It does NOT auto-create catalog rows
  // — admin must add via the "+ Add Language" button first. The summary
  // tells them which catalog entries are missing.
  const DEFAULT_SEEDS: Array<{ countryHint: string; regionalCue?: string; langCode: string; langDisplay: string }> = [
    { countryHint: "india",       langCode: "hi", langDisplay: "Hindi" },
    { countryHint: "philippines", langCode: "tl", langDisplay: "Filipino (Tagalog)" },
    { countryHint: "indonesia",   langCode: "id", langDisplay: "Indonesian (Bahasa Indonesia)" },
    { countryHint: "thailand",    langCode: "th", langDisplay: "Thai" },
    { countryHint: "vietnam",     langCode: "vi", langDisplay: "Vietnamese" },
    { countryHint: "bangladesh",  langCode: "bn", langDisplay: "Bengali (Bangla)" },
    { countryHint: "nepal",       langCode: "ne", langDisplay: "Nepali" },
    // Ethiopia — two languages. If backend has a single Ethiopia row,
    // both go on it. If backend has two regional rows, the regionalCue
    // routes each language to its own row.
    { countryHint: "ethiopia",    regionalCue: "amhar", langCode: "am", langDisplay: "Amharic" },
    { countryHint: "ethiopia",    regionalCue: "oromia", langCode: "om", langDisplay: "Oromo (Afaan Oromo)" },
  ];

  const handleSeed = async () => {
    setIsSeeding(true);
    setSeedSummary(null);
    const assigned: string[] = [];
    const skippedExisting: string[] = [];
    const skippedNoLanguage: string[] = [];
    const skippedNoCountry: string[] = [];
    const failed: { key: string; reason: string }[] = [];

    // Snapshot active language codes from the catalog so a missing code
    // surfaces in skippedNoLanguage instead of failing on POST.
    const catalogActive = new Set(allLanguages.filter((l) => l.is_active).map((l) => l.code));

    for (const seed of DEFAULT_SEEDS) {
      const tag = `${seed.countryHint}${seed.regionalCue ? ` (${seed.regionalCue})` : ""} → ${seed.langCode}`;

      // Step 1: is the language even in the catalog?
      if (!catalogActive.has(seed.langCode)) {
        skippedNoLanguage.push(`${seed.langDisplay} (${seed.langCode})`);
        continue;
      }

      // Step 2: pick the country row(s) that match. Prefer a regional
      // match when a cue is set AND there's a country whose name
      // contains both the hint and the cue. Otherwise fall back to all
      // rows whose name contains the hint.
      let candidates = countries.filter((c) => c.name.toLowerCase().includes(seed.countryHint));
      if (seed.regionalCue) {
        const regional = candidates.filter((c) => c.name.toLowerCase().includes(seed.regionalCue!));
        if (regional.length > 0) candidates = regional;
        // If no regional match, fall through: the country list has a
        // single 'Ethiopia' row → both languages will land on it.
      }

      if (candidates.length === 0) {
        skippedNoCountry.push(`${seed.countryHint}${seed.regionalCue ? ` (${seed.regionalCue})` : ""}`);
        continue;
      }

      // Step 3: POST the assignment for each matched country. Skip if
      // already assigned.
      for (const country of candidates) {
        if (country.languages.includes(seed.langCode)) {
          skippedExisting.push(`${country.name} → ${seed.langCode}`);
          continue;
        }
        try {
          await assignLanguageToCountry(country.id, seed.langCode);
          assigned.push(`${country.name} → ${seed.langCode}`);
        } catch (err: unknown) {
          const ax = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
          const reason = ax?.response?.data?.detail ?? ax?.message ?? "unknown error";
          failed.push({ key: `${country.name} → ${seed.langCode}`, reason });
          console.error(`[admin/languages] seed ${tag} failed:`, ax?.response?.data ?? ax?.message);
        }
      }
    }

    setSeedSummary({ assigned, skippedExisting, skippedNoLanguage, skippedNoCountry, failed });
    setIsSeeding(false);

    // Snackbar gives a one-line gist; detail is in the summary panel.
    const total = assigned.length;
    if (total > 0) {
      showSnackbar(`Seeded ${total} assignment${total === 1 ? "" : "s"}`, "success");
    } else if (skippedExisting.length > 0 && failed.length === 0 && skippedNoLanguage.length === 0 && skippedNoCountry.length === 0) {
      showSnackbar("All default mappings already in place", "info");
    } else if (failed.length > 0) {
      showSnackbar(`${failed.length} assignment${failed.length === 1 ? "" : "s"} failed — see panel`, "error");
    } else {
      showSnackbar("No assignments made — see panel for reasons", "info");
    }

    // Reload from the server so the country cards reflect the new state.
    reload();
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

      {/* Toolbar row — count + Seed Defaults + Add Language */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 gap-2">
        <p className="text-sm flex-shrink-0" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          {allLanguages.length} in catalog · {countries.length} countr{countries.length === 1 ? "y" : "ies"}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSeed}
            disabled={isSeeding || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm"
            style={{ backgroundColor: "transparent", color: "#064E3B", border: "1.5px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: isSeeding || isLoading ? "not-allowed" : "pointer", opacity: isSeeding || isLoading ? 0.55 : 1 }}
            title="One-tap assign the rollout locales to their countries"
          >
            {isSeeding ? (
              "Seeding…"
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2v6M9 5l3-3 3 3M5 12l-2 9 9-3M19 12l2 9-9-3M12 8v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Seed Defaults
              </>
            )}
          </button>
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
      </div>

      {/* Seed result panel — sticks until next Seed run. Surfaces what
          happened so the admin can see exactly which assignments went
          through, which were already there, and which couldn't proceed. */}
      {seedSummary && (
        <div className="mx-3 mt-3 rounded-2xl px-3.5 py-3" style={{ backgroundColor: "#F0FDF4", border: "1px solid rgba(5,188,109,0.20)" }}>
          <div className="flex items-start justify-between mb-1.5">
            <p className="font-bold text-sm" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              Seed Defaults Result
            </p>
            <button
              onClick={() => setSeedSummary(null)}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#6D6D6D" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="space-y-1 text-xs" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
            <p>
              <span className="font-bold" style={{ color: "#064E3B" }}>Assigned ({seedSummary.assigned.length}):</span>{" "}
              {seedSummary.assigned.length === 0 ? <span style={{ color: "#6D6D6D" }}>none</span> : seedSummary.assigned.join(", ")}
            </p>
            {seedSummary.skippedExisting.length > 0 && (
              <p>
                <span className="font-bold" style={{ color: "#6D6D6D" }}>Already in place ({seedSummary.skippedExisting.length}):</span>{" "}
                {seedSummary.skippedExisting.join(", ")}
              </p>
            )}
            {seedSummary.skippedNoLanguage.length > 0 && (
              <p>
                <span className="font-bold" style={{ color: "#FF9800" }}>Skipped — not in catalog ({seedSummary.skippedNoLanguage.length}):</span>{" "}
                {seedSummary.skippedNoLanguage.join(", ")}
              </p>
            )}
            {seedSummary.skippedNoCountry.length > 0 && (
              <p>
                <span className="font-bold" style={{ color: "#FF9800" }}>Skipped — country not found ({seedSummary.skippedNoCountry.length}):</span>{" "}
                {seedSummary.skippedNoCountry.join(", ")}
              </p>
            )}
            {seedSummary.failed.length > 0 && (
              <div>
                <p className="font-bold" style={{ color: "#E44A4A" }}>Failed ({seedSummary.failed.length}):</p>
                <ul className="ml-3 list-disc">
                  {seedSummary.failed.map((f, i) => (
                    <li key={i}>{f.key} — {f.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {seedSummary.skippedNoLanguage.length > 0 && (
              <p className="mt-2 italic" style={{ color: "#6D6D6D" }}>
                Tip: add the missing catalog entries via <span className="font-bold">+ Add Language</span>, then tap <span className="font-bold">Seed Defaults</span> again.
              </p>
            )}
          </div>
        </div>
      )}

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

                  {/* Expandable body — only ENABLED non-English languages
                      render here. English is hidden (always-on baseline).
                      To enable a NEW language for this country, tap the
                      "+ Add Language" pill at the bottom of the body. */}
                  {isOpen && (
                    <div className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      {extraLangs.length === 0 ? (
                        <p className="text-xs italic px-4 py-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                          Only English is enabled. Tap “+ Add Language” to enable another for this country.
                        </p>
                      ) : (
                        extraLangs.map((code) => {
                          // Resolve catalog metadata for the row's display
                          // name. If the catalog has no entry (race or
                          // backend mismatch), the code itself is the
                          // fallback label.
                          const catalog = allLanguages.find((l) => l.code === code);
                          const displayName = catalog?.name ?? code.toUpperCase();
                          const key = `${c.id}:${code}`;
                          const isPending = pendingKey.has(key);
                          return (
                            <div
                              key={code}
                              className="flex items-center justify-between px-4 py-3"
                              style={{ borderTop: "1px solid #F8FAF9" }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                                    {displayName}
                                  </p>
                                  <span className="text-xs uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {code}
                                  </span>
                                </div>
                                {/* Native-script preview when known — same
                                    string the user will see in their Profile
                                    dropdown. */}
                                {labelForLanguage(code) !== code.toUpperCase() && (
                                  <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {labelForLanguage(code)}
                                  </p>
                                )}
                              </div>
                              <label
                                className="toggle-switch"
                                aria-label={`Disable ${code} for ${c.name}`}
                                style={{ opacity: isPending ? 0.55 : 1, cursor: isPending ? "wait" : "pointer" }}
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  disabled={isPending}
                                  onChange={() => handleUnassign(c, code)}
                                />
                                <span className="toggle-slider" />
                              </label>
                            </div>
                          );
                        })
                      )}

                      {/* "+ Add Language" pill — opens the per-country sheet
                          listing catalog entries this country hasn't enabled
                          yet. */}
                      <div className="px-4 py-3" style={{ borderTop: "1px solid #F8FAF9" }}>
                        <button
                          onClick={() => openAssign(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: "#E4F7EF", color: "#064E3B", border: "1.5px solid rgba(5,188,109,0.30)", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                          aria-label={`Add a language to ${c.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                          Add Language
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-country assign sheet — pick a catalog language not yet
          enabled for this country and POST the assignment. Distinct
          from the global-catalog Add Language sheet below. */}
      {assignSheetCountry && (() => {
        const available = allLanguages.filter(
          (l) => l.is_active && l.code !== "en" && !assignSheetCountry.languages.includes(l.code)
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
                <p className="text-sm text-center mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  All catalog languages are already enabled for this country.
                  To register a new one, use <span className="font-bold">+ Add Language</span> at the top of the screen.
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
                        {labelForLanguage(l.code) !== l.code.toUpperCase()
                          ? `${labelForLanguage(l.code)} — ${l.name} (${l.code})`
                          : `${l.name} (${l.code})`}
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
                  {isAssigning ? "Adding…" : "Enable"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
