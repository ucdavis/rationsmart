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
  patchLanguage,
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
  // i18n V2: placeholder marker. When the backend's /v1/admin/countries
  // doesn't include a country we know is in the rollout (e.g. Ethiopia
  // before the backend team has seeded it), we render a placeholder
  // card so the admin's mental model is complete. Placeholders cannot
  // have languages assigned via the API — backend has no country_id
  // for them — so all controls inside the card are disabled with an
  // explanatory tooltip.
  _isPlaceholder?: boolean;
}

// Rollout countries we expect to exist on the backend. If any of these
// is missing from /v1/admin/countries we synthesize a placeholder so
// the admin can SEE the gap (rather than wondering why Ethiopia isn't
// listed). Backend team needs to seed these into the country table for
// the toggles to actually work.
const ROLLOUT_PLACEHOLDERS: Array<{ name: string; country_code: string }> = [
  { name: "Ethiopia", country_code: "ETH" },
];

// 2026-06-29 — Regional language whitelist per rollout country. When the
// admin taps "+ Add Language" inside a country card, we narrow the
// dropdown to languages plausibly spoken in that region — so an India
// admin sees Hindi/Bengali/Kannada/etc but NOT Vietnamese or Thai.
//
// Matching is name-based (case-insensitive substring on the country
// name) — same approach as DEFAULT_SEEDS. Countries NOT in this map
// fall through and show every active catalog language (graceful
// fallback for any country the rollout adds later that we haven't
// mapped yet).
//
// Source for region mappings: standard ISO 639-1 + Ethnologue. Kept
// intentionally broad so admin can pick the right one for content, not
// a strict "is this the official language" check.
const REGIONAL_LANGUAGES: Record<string, string[]> = {
  india: ["hi", "bn", "te", "ta", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur"],
  philippines: ["tl", "fil", "ceb", "ilo"],
  indonesia: ["id", "jv", "su"],
  thailand: ["th"],
  vietnam: ["vi"],
  bangladesh: ["bn"],
  nepal: ["ne"],
  ethiopia: ["am", "om", "ti", "so"],
};

// Look up the regional whitelist for a given country name (case-
// insensitive substring match). Returns null when no entry matches —
// callers should treat that as "no filter, show all".
function regionalCodesForCountry(countryName: string): string[] | null {
  const needle = countryName.toLowerCase();
  for (const [hint, codes] of Object.entries(REGIONAL_LANGUAGES)) {
    if (needle.includes(hint)) return codes;
  }
  return null;
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

  // Per-code busy flag for the Reactivate button so a fast double-tap
  // doesn't fire two PATCH requests. Keyed by language code.
  const [reactivatingCode, setReactivatingCode] = useState<string | null>(null);

  // Catalog collapse + filters. Catalog is collapsed by default so the
  // country cards (the primary action area) stay reachable even with
  // hundreds of catalog rows. When expanded, the inner list scrolls
  // inside its own fixed-height container — never pushes the countries
  // off the screen.
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "inactive" | "orphan">("all");

  // Reactivate a globally-deactivated catalog language. Backend keeps
  // the row + its translations + existing per-country assignments
  // intact while is_active=false (per spec); flipping it back to true
  // restores the language to the ?lang= resolution pool and makes it
  // pickable in per-country Add Language dropdowns.
  const handleReactivate = async (code: string) => {
    if (reactivatingCode) return;
    setReactivatingCode(code);
    try {
      await patchLanguage(code, { is_active: true });
      showSnackbar(`'${code}' reactivated`, "success");
      reload();
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      const reason = ax?.response?.data?.detail ?? ax?.message ?? "Could not reactivate language";
      showSnackbar(reason, "error");
    } finally {
      setReactivatingCode(null);
    }
  };

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
          const fromApi = (Array.isArray(d) ? d : d?.countries ?? []) as CountryRow[];
          // Merge in rollout placeholders for any country the backend
          // hasn't seeded yet (e.g. Ethiopia). The placeholder is
          // rendered as a card with disabled controls so the admin can
          // SEE the country is expected but not yet set up.
          const placeholders: CountryRow[] = ROLLOUT_PLACEHOLDERS
            .filter((p) =>
              !fromApi.some((c) => c.name.toLowerCase().includes(p.name.toLowerCase()))
            )
            .map((p) => ({
              id: `__placeholder_${p.country_code}__`,
              name: p.name,
              country_code: p.country_code,
              languages: [],
              _isPlaceholder: true,
            }));
          setCountries([...fromApi, ...placeholders]);
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

  // Compute the languages available to add for a given country. Applies
  // the SAME filter chain that the assign sheet uses below — active +
  // not English + not already assigned + (if region map matches) only
  // regional codes. CRITICAL: keep this in lockstep with the sheet
  // body. A previous bug had openAssign skip the regional filter while
  // the rendered <select> applied it, which left selectedNewCode set
  // to a hidden option (Amharic) while the dropdown visually showed
  // Hindi — pressing Enable then enabled Amharic in India. Don't
  // re-introduce that divergence.
  const computeAvailableForCountry = (c: CountryRow): SystemLanguage[] => {
    const regional = regionalCodesForCountry(c.name);
    return allLanguages.filter((l) => {
      if (!l.is_active) return false;
      if (l.code === "en") return false;
      if (c.languages.includes(l.code)) return false;
      if (regional && !regional.includes(l.code)) return false;
      return true;
    });
  };

  // Open the per-country assign sheet. Defaults to the first language
  // that's actually visible in the rendered dropdown — see helper
  // above for why this MUST match the sheet's filter.
  const openAssign = (c: CountryRow) => {
    const available = computeAvailableForCountry(c);
    setSelectedNewCode(available[0]?.code ?? "");
    setAssignSheetCountry(c);
  };

  const handleAssign = async () => {
    if (!assignSheetCountry) return;
    // Always resolve the code from the CURRENTLY VISIBLE options, never
    // from raw selectedNewCode. Defends against a stale selection (e.g.
    // catalog reloaded behind us; user opened the sheet before a region
    // filter applied) where the bound <select> value doesn't match
    // what the user actually sees. The same fallback used by the render
    // path ensures both stay in sync.
    const available = computeAvailableForCountry(assignSheetCountry);
    const code = available.some((l) => l.code === selectedNewCode)
      ? selectedNewCode
      : available[0]?.code;
    if (!code) return;

    setIsAssigning(true);
    const countryId = assignSheetCountry.id;
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

    // Verbose run banner — easy to find the start of a seed batch in the
    // console when there are dozens of other [api ←] lines around it.
    console.group("%c[seed] Seed Defaults — start", "color:#064E3B;font-weight:700;background:#E4F7EF;padding:2px 6px;border-radius:4px;");
    console.log("[seed] catalog active codes:", Array.from(catalogActive));
    console.log("[seed] countries known to UI:", countries.map((c) => ({ id: c.id, name: c.name, languages: c.languages })));
    console.log("[seed] mapping plan:", DEFAULT_SEEDS);

    for (const seed of DEFAULT_SEEDS) {
      const tag = `${seed.countryHint}${seed.regionalCue ? ` (${seed.regionalCue})` : ""} → ${seed.langCode}`;

      // Step 1: is the language even in the catalog?
      if (!catalogActive.has(seed.langCode)) {
        console.warn(`[seed] ${tag}  SKIP — language '${seed.langCode}' not in catalog`);
        skippedNoLanguage.push(`${seed.langDisplay} (${seed.langCode})`);
        continue;
      }

      // Step 2: pick the country row(s) that match. Prefer a regional
      // match when a cue is set AND there's a country whose name
      // contains both the hint and the cue. Otherwise fall back to all
      // rows whose name contains the hint. Placeholder countries are
      // excluded — backend has no real country_id for them, so any
      // POST would 404. The seed summary reports them under
      // skippedNoCountry so the admin sees the gap.
      let candidates = countries.filter((c) =>
        !c._isPlaceholder && c.name.toLowerCase().includes(seed.countryHint)
      );
      if (seed.regionalCue) {
        const regional = candidates.filter((c) => c.name.toLowerCase().includes(seed.regionalCue!));
        if (regional.length > 0) candidates = regional;
        // If no regional match, fall through: the country list has a
        // single 'Ethiopia' row → both languages will land on it.
      }

      if (candidates.length === 0) {
        console.warn(`[seed] ${tag}  SKIP — country '${seed.countryHint}' not found in API response`);
        skippedNoCountry.push(`${seed.countryHint}${seed.regionalCue ? ` (${seed.regionalCue})` : ""}`);
        continue;
      }

      console.log(`[seed] ${tag}  candidates:`, candidates.map((c) => c.name));

      // Step 3: POST the assignment for each matched country. Skip if
      // already assigned.
      for (const country of candidates) {
        if (country.languages.includes(seed.langCode)) {
          console.log(`[seed] ${country.name} → ${seed.langCode}  SKIP — already assigned`);
          skippedExisting.push(`${country.name} → ${seed.langCode}`);
          continue;
        }
        const url = `/v1/admin/countries/${country.id}/languages/${seed.langCode}`;
        console.log(`[seed] ${country.name} → ${seed.langCode}  POST ${url}`);
        try {
          const res = await assignLanguageToCountry(country.id, seed.langCode);
          console.log(`[seed] ${country.name} → ${seed.langCode}  ✓ ${res.status}`, {
            status: res.status,
            data: res.data,
            headers: res.headers,
          });
          assigned.push(`${country.name} → ${seed.langCode}`);
        } catch (err: unknown) {
          const ax = err as { response?: { status?: number; data?: { detail?: string } | unknown }; message?: string };
          const reason = (ax?.response?.data as { detail?: string })?.detail ?? ax?.message ?? "unknown error";
          console.error(`[seed] ${country.name} → ${seed.langCode}  ✗ ${ax?.response?.status ?? "ERR"}`, {
            status: ax?.response?.status,
            data: ax?.response?.data,
            message: ax?.message,
          });
          failed.push({ key: `${country.name} → ${seed.langCode}`, reason });
        }
      }
    }

    // End-of-batch summary in the console — same numbers shown in the
    // on-screen result panel, but compact and copy-pasteable.
    console.log("[seed] summary:", {
      assigned,
      skippedExisting,
      skippedNoLanguage,
      skippedNoCountry,
      failed,
    });
    console.groupEnd();

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

      {/* Toolbar row — count + Add Language. The "Seed Defaults" button
          was hidden 2026-06-29 per user request — the handler + state
          stay in place for potential future use, but no UI surfaces it. */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            {allLanguages.length} in catalog · {countries.length} countr{countries.length === 1 ? "y" : "ies"}
          </p>
          {isLoading && (countries.length > 0 || allLanguages.length > 0) && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 30" />
              </svg>
              Refreshing…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
        {/* ── CATALOG section ────────────────────────────────────────────
            Lists every language returned by /v1/admin/languages, including
            inactive ones (rendered greyed-out). Each row shows which
            countries currently have it enabled, so admins can see the
            full state at a glance without expanding every country card.
            User feedback: "why Amharic is missing" — previously a
            registered language with no country assignments was invisible
            in the UI. This section fixes that. */}
        {allLanguages.length > 0 && (() => {
          // Pre-compute counts for the header pills + filtered list.
          const inactiveCount = allLanguages.filter((l) => !l.is_active).length;
          const orphanCount = allLanguages.filter(
            (l) => l.is_active && l.code !== "en" && !countries.some((c) => c.languages.includes(l.code))
          ).length;
          const q = catalogQuery.trim().toLowerCase();
          const sorted = [...allLanguages].sort((a, b) => {
            if (a.code === "en") return -1;
            if (b.code === "en") return 1;
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          const filtered = sorted.filter((lang) => {
            if (catalogFilter === "inactive" && lang.is_active) return false;
            if (catalogFilter === "orphan") {
              if (!lang.is_active) return false;
              if (lang.code === "en") return false;
              if (countries.some((c) => c.languages.includes(lang.code))) return false;
            }
            if (q) {
              const native = labelForLanguage(lang.code);
              if (
                !lang.name.toLowerCase().includes(q) &&
                !lang.code.toLowerCase().includes(q) &&
                !native.toLowerCase().includes(q)
              ) return false;
            }
            return true;
          });
          return (
          <div className="bg-white rounded-2xl mb-2.5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {/* Catalog header strip — always visible. Acts as the click
                target for expand/collapse. Shows compact counts so the
                admin sees the catalog state without expanding. */}
            <button
              onClick={() => setCatalogExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
              style={{ backgroundColor: "transparent", border: "none", cursor: "pointer", borderRadius: 16 }}
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", letterSpacing: 0.4 }}>
                  Catalog · {allLanguages.length}
                </span>
                {inactiveCount > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FEC5BB", color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>
                    {inactiveCount} inactive
                  </span>
                )}
                {orphanCount > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FFF8E1", color: "#B26A00", fontFamily: "Nunito, sans-serif" }}>
                    {orphanCount} unused
                  </span>
                )}
              </div>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                style={{
                  flexShrink: 0,
                  transform: catalogExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                  color: "#6D6D6D",
                }}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Expanded body — filter pills, search, then a scrolling
                list capped at 320px so the country cards always stay in
                view. The padding mirrors the country-card body. */}
            {catalogExpanded && (
              <div className="px-4 pb-3">
                {/* Filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {(["all", "inactive", "orphan"] as const).map((f) => {
                    const active = catalogFilter === f;
                    const label = f === "all" ? "All" : f === "inactive" ? "Inactive" : "Unused";
                    return (
                      <button
                        key={f}
                        onClick={() => setCatalogFilter(f)}
                        className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: active ? "#064E3B" : "transparent",
                          color: active ? "#FFFFFF" : "#064E3B",
                          border: active ? "1.5px solid #064E3B" : "1.5px solid #C2C2C2",
                          fontFamily: "Nunito, sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {/* Search input */}
                <input
                  type="text"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Search by name, code, or native script"
                  className="w-full rounded-xl px-3 py-2 text-sm border-none focus:outline-none mb-2"
                  style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                />
                {/* Scrolling list — capped height so it never pushes the
                    countries section off the screen. */}
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                    No matches.
                  </p>
                ) : filtered.map((lang) => {
                // English is the implicit baseline — every country has
                // it, so we say "All countries" instead of listing them.
                // For other languages, compute the assigned-to list from
                // countries[]; show "Not enabled anywhere" when empty.
                const enabledIn = lang.code === "en"
                  ? "All countries"
                  : countries
                      .filter((c) => c.languages.includes(lang.code))
                      .map((c) => c.name);
                const isEmpty = Array.isArray(enabledIn) && enabledIn.length === 0;
                const inactive = !lang.is_active;
                return (
                  <div
                    key={lang.code}
                    className="flex items-start justify-between gap-2 py-2"
                    style={{ borderTop: "1px solid #F8FAF9", opacity: inactive ? 0.6 : 1 }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                          {lang.name}
                        </p>
                        <span className="text-xs uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                          {lang.code}
                        </span>
                        {labelForLanguage(lang.code) !== lang.code.toUpperCase() && (
                          <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                            · {labelForLanguage(lang.code)}
                          </span>
                        )}
                        {inactive && (
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                            style={{ backgroundColor: "#FEC5BB", color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
                          >
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        {typeof enabledIn === "string"
                          ? <>Enabled in: <span style={{ color: "#231F20" }}>{enabledIn}</span></>
                          : isEmpty
                            ? <span style={{ color: "#FF9800", fontStyle: "italic" }}>Not enabled in any country</span>
                            : <>Enabled in: <span style={{ color: "#231F20" }}>{enabledIn.join(", ")}</span></>
                        }
                      </p>
                      {inactive && (
                        <p className="text-xs mt-1" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif", fontStyle: "italic" }}>
                          Hidden from Add Language dropdown until reactivated.
                        </p>
                      )}
                    </div>
                    {inactive && (
                      <button
                        onClick={() => handleReactivate(lang.code)}
                        disabled={reactivatingCode === lang.code}
                        className="flex-shrink-0 font-bold text-xs"
                        style={{
                          backgroundColor: reactivatingCode === lang.code ? "#D3D3D3" : "#064E3B",
                          color: "#FFFFFF",
                          borderRadius: 999,
                          border: "none",
                          padding: "6px 12px",
                          cursor: reactivatingCode === lang.code ? "not-allowed" : "pointer",
                          fontFamily: "Nunito, sans-serif",
                          whiteSpace: "nowrap",
                          opacity: reactivatingCode === lang.code ? 0.7 : 1,
                        }}
                      >
                        {reactivatingCode === lang.code ? "..." : "Reactivate"}
                      </button>
                    )}
                  </div>
                );
              })}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Countries section header — small label so the catalog/countries
            split is visually obvious. */}
        {countries.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-2 mt-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", letterSpacing: 0.4 }}>
            Countries · {countries.length}
          </p>
        )}

        {/* Show the "Loading…" card ONLY when there's no data yet (true
            initial mount). Subsequent reloads after a toggle/reactivate
            keep the existing list visible — the "Refreshing…" pill near
            the header is the only indicator. Previously the list was
            replaced with "Loading…" on every reload which felt like the
            page had gone blank. */}
        {isLoading && countries.length === 0 ? (
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
              const isPlaceholder = !!c._isPlaceholder;
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl overflow-hidden"
                  style={{
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    // Placeholder cards get a dashed amber outline so the
                    // "pending backend setup" state is obvious at a glance.
                    border: isPlaceholder ? "1.5px dashed #FF9800" : "none",
                  }}
                >
                  {/* Country header — clickable to expand */}
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5"
                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                          {c.name}
                        </p>
                        {isPlaceholder && (
                          // Visible-from-collapsed marker so the admin sees
                          // it without expanding.
                          <span
                            className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "#FFF3E0", color: "#FF7800", fontFamily: "Nunito, sans-serif" }}
                          >
                            Backend pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        {isPlaceholder
                          ? "Backend has not registered this country yet"
                          : <>English{extraLangs.length > 0 && ` + ${extraLangs.length} more`}</>}
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
                      "+ Add Language" pill at the bottom of the body.
                      Placeholder countries (Ethiopia before backend setup)
                      render an explanatory empty state instead of the
                      assign/toggle controls — backend has no country_id,
                      so any POST would fail. */}
                  {isOpen && (isPlaceholder ? (
                    <div className="border-t px-4 py-4" style={{ borderColor: "#F1F5F9" }}>
                      <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
                        <span className="font-bold" style={{ color: "#FF7800" }}>{c.name}</span> is in
                        the rollout plan but has not been seeded into the backend
                        country table yet. Ask the backend team to add it; this
                        card will switch to live controls automatically once the
                        country shows up in <span className="font-mono">/v1/admin/countries</span>.
                      </p>
                    </div>
                  ) : (
                    <div className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      {extraLangs.length === 0 ? (
                        <p className="text-xs italic px-4 py-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                          Only English is enabled. Tap “+ Add Language” to enable another for this country.
                        </p>
                      ) : (
                        extraLangs.map((code) => {
                          // Resolve catalog metadata for the row's display
                          // name AND active state. If the catalog row exists
                          // but is_active=false, this is a STALE assignment —
                          // the language was assigned to this country at
                          // some point, then later deactivated globally. The
                          // assignment still exists in the DB (per spec:
                          // "Existing translations are preserved.") but the
                          // language is no longer offered to users.
                          //
                          // We render stale rows with an INACTIVE chip and
                          // amber border so the admin can see the
                          // inconsistency and clean it up (toggle OFF to
                          // unassign). Without this, a deactivated language
                          // could silently linger in country.languages forever.
                          const catalog = allLanguages.find((l) => l.code === code);
                          const displayName = catalog?.name ?? code.toUpperCase();
                          const isCatalogInactive = catalog ? !catalog.is_active : false;
                          const key = `${c.id}:${code}`;
                          const isPending = pendingKey.has(key);
                          return (
                            <div
                              key={code}
                              className="flex items-center justify-between px-4 py-3"
                              style={{
                                borderTop: "1px solid #F8FAF9",
                                backgroundColor: isCatalogInactive ? "#FFF8E1" : "transparent",
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <p
                                    className="font-bold"
                                    style={{
                                      color: isCatalogInactive ? "#6D6D6D" : "#231F20",
                                      fontFamily: "Nunito, sans-serif",
                                      fontSize: 14,
                                      textDecoration: isCatalogInactive ? "line-through" : "none",
                                    }}
                                  >
                                    {displayName}
                                  </p>
                                  <span className="text-xs uppercase tracking-wide" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {code}
                                  </span>
                                  {isCatalogInactive && (
                                    <span
                                      className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: "#FEC5BB", color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
                                      title="Language is deactivated globally — not shown to users despite this assignment. Toggle off to clean up."
                                    >
                                      Inactive
                                    </span>
                                  )}
                                </div>
                                {/* Native-script preview when known — same
                                    string the user will see in their Profile
                                    dropdown. Skipped for inactive rows to
                                    reduce visual noise. */}
                                {!isCatalogInactive && labelForLanguage(code) !== code.toUpperCase() && (
                                  <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    {labelForLanguage(code)}
                                  </p>
                                )}
                                {isCatalogInactive && (
                                  <p className="text-xs italic mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                                    Deactivated globally — not offered to users. Toggle off to remove this stale assignment.
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
                  ))}
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
        const regional = regionalCodesForCountry(assignSheetCountry.name);
        const available = computeAvailableForCountry(assignSheetCountry);
        // If selectedNewCode is somehow not in the rendered options
        // (e.g. catalog reloaded behind us and the language got
        // deactivated, or another tab assigned it), fall back to the
        // first visible option so Enable never sends a hidden code.
        const effectiveCode =
          available.some((l) => l.code === selectedNewCode)
            ? selectedNewCode
            : (available[0]?.code ?? "");
        return (
          <div
            className="fixed top-0 h-full z-50 flex flex-col justify-end"
            style={{
              left: "max(0px, calc((100vw - 480px) / 2))",
              width: "min(100vw, 480px)",
              backgroundColor: "rgba(0,0,0,0.65)",
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
              <p className="text-center text-sm mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                {assignSheetCountry.name}
              </p>
              {regional && (
                <p className="text-center text-xs mb-5" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif", fontStyle: "italic" }}>
                  Showing regional languages only
                </p>
              )}
              {!regional && <div className="mb-5" />}

              {available.length === 0 ? (
                <p className="text-sm text-center mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {regional
                    ? <>No regional language available to add. Either all are already enabled, or the missing ones are inactive in the catalog. Use <span className="font-bold">+ Add Language</span> at the top to register a new one.</>
                    : <>All catalog languages are already enabled for this country. To register a new one, use <span className="font-bold">+ Add Language</span> at the top of the screen.</>
                  }
                </p>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1.5 ml-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                    LANGUAGE
                  </p>
                  <select
                    value={effectiveCode}
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
            backgroundColor: "rgba(0,0,0,0.65)",
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
