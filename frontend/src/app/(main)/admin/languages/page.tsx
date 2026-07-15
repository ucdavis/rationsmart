"use client";

// Admin > Languages — "control room" (Option 3 from
// ~/Downloads/admin_language_api_and_ui_design.md), tried per explicit
// request with the understanding it may get reverted after review.
//
// Three tabs, one screen, no separate /admin/translations route anymore
// (it redirects here — see that file):
//   COUNTRIES — rollout funnel: pick a country, offer/withdraw languages,
//               export/import that country's translation workbook.
//               Tapping an offered language opens the shared Workspace.
//   LANGUAGES — the global registry: register, rename, activate/deactivate.
//               Inline on this tab (no gear icon, per Option 3's spec —
//               "registry inline, no ⚙️").
//   FEEDS     — feed-centric editor (the doc's star feature for #5): search
//               any feed, see EVERY language's translation on one card,
//               edit/add/delete without going through a workbook at all.
//
// Shared "Translation Workspace" (opened from Countries → a language row):
// coverage bars (#4), plus a feed-name search that hydrates translations
// on demand. The design doc calls out a real backend gap here — there's no
// single endpoint returning "every feed + its translation + missing flag"
// for a country+language pair, only per-feed lookups (#5) or counts (#4).
// We take the doc's stated no-backend-change option: search narrows the
// admin feed list, then each result's translation is hydrated individually
// — deliberately NOT eagerly fetching hundreds of feeds up front.
//
// All 12 endpoints are already wired in src/lib/api.ts (i18n V2 Phase 2) —
// this file only rearranges how they're reached, not what they call.

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
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getTranslationCoverage,
  getAdminFeeds,
  listFeedTranslations,
  upsertFeedTranslation,
  deleteFeedTranslation,
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
  _isPlaceholder?: boolean;
}
interface FeedTranslation {
  feed_id: string;
  language: string;
  name: string;
  action?: "inserted" | "updated" | null;
  created_at?: string;
  updated_at?: string;
}
interface AdminFeedLite {
  feed_id: string;
  fd_name: string;
  fd_country_name?: string;
}
interface CoverageReport {
  language?: string;
  total_feeds?: number;
  translated_feeds?: number;
  missing_feeds?: number;
  total_types?: number;
  translated_types?: number;
  total_categories?: number;
  translated_categories?: number;
}
interface UploadSummary {
  success?: boolean;
  message?: string;
  feeds_inserted?: number;
  feeds_updated?: number;
  feeds_skipped?: number;
  types_inserted?: number;
  types_updated?: number;
  types_skipped?: number;
  categories_inserted?: number;
  categories_updated?: number;
  categories_skipped?: number;
  errors?: string[];
}

// Rollout countries we expect on the backend. Missing ones get a
// placeholder card so the admin can SEE the gap instead of wondering why,
// e.g., Ethiopia isn't listed. Carried over from the previous Language
// Catalog screen.
const ROLLOUT_PLACEHOLDERS: Array<{ name: string; country_code: string }> = [
  { name: "Ethiopia", country_code: "ETH" },
];

// Regional whitelist so "+ Offer language" doesn't show Vietnamese to an
// India admin. Name-based substring match; countries not listed here fall
// through to "show every active catalog language".
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

function regionalCodesForCountry(countryName: string): string[] | null {
  const needle = countryName.toLowerCase();
  for (const [hint, codes] of Object.entries(REGIONAL_LANGUAGES)) {
    if (needle.includes(hint)) return codes;
  }
  return null;
}

function pct(translated: number | undefined, total: number | undefined): number {
  if (!total || total === 0) return 0;
  return Math.round(((translated ?? 0) / total) * 100);
}

type Tab = "countries" | "languages" | "feeds";

const inputStyle = { backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" };
const cardStyle = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };

export default function AdminLanguagesPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [tab, setTab] = useState<Tab>("countries");
  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = () => {
    setIsLoading(true);
    Promise.allSettled([listLanguages(), listCountriesWithLanguages()])
      .then(([langRes, countriesRes]) => {
        if (langRes.status === "fulfilled") {
          const d = langRes.value.data as { languages?: SystemLanguage[] } | SystemLanguage[];
          setAllLanguages(Array.isArray(d) ? d : d?.languages ?? []);
        } else {
          showSnackbar("Could not load language catalog", "error");
        }
        if (countriesRes.status === "fulfilled") {
          const d = countriesRes.value.data as { countries?: CountryRow[] } | CountryRow[];
          const fromApi = (Array.isArray(d) ? d : d?.countries ?? []) as CountryRow[];
          const placeholders: CountryRow[] = ROLLOUT_PLACEHOLDERS
            .filter((p) => !fromApi.some((c) => c.name.toLowerCase().includes(p.name.toLowerCase())))
            .map((p) => ({ id: `__placeholder_${p.country_code}__`, name: p.name, country_code: p.country_code, languages: [], _isPlaceholder: true }));
          setCountries([...fromApi, ...placeholders]);
        } else {
          showSnackbar("Could not load countries", "error");
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (user?.is_admin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Languages" onBack={() => router.back()} />

      {/* Segmented tab bar — the doc's "3 tabs, one thumb-reach apart". */}
      <div className="px-3 pt-3">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: "#E4F7EF" }}>
          {([
            { key: "countries", label: "Countries" },
            { key: "languages", label: "Languages" },
            { key: "feeds", label: "Feeds" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{
                backgroundColor: tab === t.key ? "#064E3B" : "transparent",
                color: tab === t.key ? "#FFFFFF" : "#064E3B",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
                transition: "background-color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && countries.length === 0 && allLanguages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Loading…</p>
        </div>
      ) : (
        <>
          {tab === "countries" && (
            <CountriesTab
              countries={countries}
              allLanguages={allLanguages}
              reload={reload}
              showSnackbar={showSnackbar}
            />
          )}
          {tab === "languages" && (
            <LanguagesTab
              allLanguages={allLanguages}
              countries={countries}
              reload={reload}
              showSnackbar={showSnackbar}
            />
          )}
          {tab === "feeds" && (
            <FeedsTab allLanguages={allLanguages} showSnackbar={showSnackbar} />
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 1 — COUNTRIES (C1 list → C2 detail → shared Workspace)
// ══════════════════════════════════════════════════════════════════════

function CountriesTab({
  countries,
  allLanguages,
  reload,
  showSnackbar,
}: {
  countries: CountryRow[];
  allLanguages: SystemLanguage[];
  reload: () => void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CountryRow | null>(null);
  const [workspace, setWorkspace] = useState<{ country: CountryRow; lang: string } | null>(null);

  // Keep `selected` fresh across reloads (assign/unassign refetches the
  // whole country list) so C2 doesn't show stale chips after an action.
  useEffect(() => {
    if (selected) {
      const fresh = countries.find((c) => c.id === selected.id);
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  if (workspace) {
    return (
      <TranslationWorkspace
        country={workspace.country}
        lang={workspace.lang}
        onBack={() => setWorkspace(null)}
      />
    );
  }

  if (selected) {
    return (
      <CountryDetail
        country={selected}
        allLanguages={allLanguages}
        onBack={() => setSelected(null)}
        onOpenWorkspace={(lang) => setWorkspace({ country: selected, lang })}
        reload={reload}
        showSnackbar={showSnackbar}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = countries.filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search countries…"
        className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none mb-3"
        style={inputStyle}
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          No countries found.
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => {
            const extraLangs = c.languages.filter((x) => x !== "en");
            const isPlaceholder = !!c._isPlaceholder;
            return (
              <button
                key={c.id}
                onClick={() => !isPlaceholder && setSelected(c)}
                className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 text-left"
                style={{
                  ...cardStyle,
                  border: isPlaceholder ? "1.5px dashed #FF9800" : "none",
                  cursor: isPlaceholder ? "default" : "pointer",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                      {c.name}
                    </p>
                    {isPlaceholder && (
                      <span className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FFF3E0", color: "#FF7800", fontFamily: "Nunito, sans-serif" }}>
                        Backend pending
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#E4F7EF", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                      EN
                    </span>
                    {extraLangs.map((code) => (
                      <span key={code} className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F1F5F9", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                        {code.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                {!isPlaceholder && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M9 6l6 6-6 6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CountryDetail({
  country,
  allLanguages,
  onBack,
  onOpenWorkspace,
  reload,
  showSnackbar,
}: {
  country: CountryRow;
  allLanguages: SystemLanguage[];
  onBack: () => void;
  onOpenWorkspace: (lang: string) => void;
  reload: () => void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [pendingKey, setPendingKey] = useState<Set<string>>(new Set());
  const [showAssign, setShowAssign] = useState(false);
  const [selectedNewCode, setSelectedNewCode] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const computeAvailable = (): SystemLanguage[] => {
    const regional = regionalCodesForCountry(country.name);
    return allLanguages.filter((l) => {
      if (!l.is_active) return false;
      if (l.code === "en") return false;
      if (country.languages.includes(l.code)) return false;
      if (regional && !regional.includes(l.code)) return false;
      return true;
    });
  };

  const openAssign = () => {
    const available = computeAvailable();
    setSelectedNewCode(available[0]?.code ?? "");
    setShowAssign(true);
  };

  const handleAssign = async () => {
    const available = computeAvailable();
    const code = available.some((l) => l.code === selectedNewCode) ? selectedNewCode : available[0]?.code;
    if (!code) return;
    setIsAssigning(true);
    try {
      await assignLanguageToCountry(country.id, code);
      const name = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
      showSnackbar(`${name} offered in ${country.name}`, "success");
      setShowAssign(false);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not offer language";
      showSnackbar(msg, "error");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (code: string) => {
    const key = `${country.id}:${code}`;
    if (pendingKey.has(key)) return;
    setPendingKey((prev) => new Set(prev).add(key));
    try {
      await unassignLanguageFromCountry(country.id, code);
      const name = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
      showSnackbar(`${name} withdrawn from ${country.name}`, "success");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not withdraw language";
      showSnackbar(msg, "error");
    } finally {
      setPendingKey((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await downloadTranslationWorkbook(country.id);
      const cdRaw = (res.headers["content-disposition"] || res.headers["Content-Disposition"] || "") as string;
      const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)["']?/i.exec(cdRaw);
      const fileName = cdMatch?.[1] ? decodeURIComponent(cdMatch[1].trim()) : `translations_${country.id}.xlsx`;
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSnackbar(`Downloaded ${fileName}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not download workbook";
      showSnackbar(msg, "error");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      showSnackbar("Pick a file to upload", "error");
      return;
    }
    setIsUploading(true);
    setUploadSummary(null);
    try {
      const res = await uploadTranslationWorkbook(country.id, uploadFile);
      setUploadSummary(res.data as UploadSummary);
      showSnackbar((res.data as UploadSummary)?.message ?? "Workbook imported", "success");
      setUploadFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showSnackbar(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const extraLangs = country.languages.filter((x) => x !== "en");
  const available = computeAvailable();
  const regional = regionalCodesForCountry(country.name);

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-3 text-sm font-bold"
        style={{ background: "none", border: "none", color: "#064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer", padding: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Countries
      </button>

      <div className="bg-white rounded-2xl px-4 py-4 mb-3" style={cardStyle}>
        <p className="font-bold mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
          {country.name}
        </p>
        <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          Languages offered
        </p>
        <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid #F8FAF9" }}>
          <p className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
            EN &nbsp;English
          </p>
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#E4F7EF", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            baseline 🔒
          </span>
        </div>
        {extraLangs.map((code) => {
          const meta = allLanguages.find((l) => l.code === code);
          const displayName = meta?.name ?? code.toUpperCase();
          const key = `${country.id}:${code}`;
          const isPending = pendingKey.has(key);
          return (
            <div key={code} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid #F8FAF9" }}>
              <button
                onClick={() => onOpenWorkspace(code)}
                className="flex-1 min-w-0 text-left flex items-baseline gap-2"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <p className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                  {displayName}
                </p>
                <span className="text-xs uppercase" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {code}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => handleUnassign(code)}
                disabled={isPending}
                aria-label={`Withdraw ${code} from ${country.name}`}
                className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: "rgba(228,74,74,0.15)", color: "#E44A4A", border: "none", fontFamily: "Nunito, sans-serif", cursor: isPending ? "wait" : "pointer", opacity: isPending ? 0.6 : 1 }}
              >
                Withdraw
              </button>
            </div>
          );
        })}
        <button
          onClick={openAssign}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: "#E4F7EF", color: "#064E3B", border: "1.5px solid rgba(5,188,109,0.30)", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Offer another language
        </button>
      </div>

      {/* Bulk workbook — country-wide (ALL its languages in one file), so
          this is the one place the Export/Import buttons are truthful. */}
      <div className="bg-white rounded-2xl px-4 py-4" style={cardStyle}>
        <p className="font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
          Bulk translation workbook
        </p>
        <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
          One file covering every language offered in {country.name}. Download, fill the blank cells, upload back.
        </p>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full py-3 rounded-xl font-bold mb-3"
          style={{ backgroundColor: isDownloading ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isDownloading ? "not-allowed" : "pointer" }}
        >
          {isDownloading ? "Downloading…" : "⬇ Export workbook"}
        </button>
        <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: "#F1F5F9" }}>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
            style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          />
          {uploadFile && (
            <p className="text-xs mt-1.5 ml-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Selected: <span className="font-bold" style={{ color: "#064E3B" }}>{uploadFile.name}</span>
            </p>
          )}
        </div>
        <button
          onClick={handleUpload}
          disabled={isUploading || !uploadFile}
          className="w-full py-3 rounded-xl font-bold"
          style={{ backgroundColor: isUploading || !uploadFile ? "#D3D3D3" : "#1CA069", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isUploading || !uploadFile ? "not-allowed" : "pointer" }}
        >
          {isUploading ? "Uploading…" : "⬆ Import workbook"}
        </button>

        {uploadSummary && (
          <div className="mt-3 rounded-xl px-3 py-3" style={{ backgroundColor: uploadSummary.success === false ? "#FEC5BB" : "#F0FDF4", border: `1px solid ${uploadSummary.success === false ? "rgba(228,74,74,0.25)" : "rgba(5,188,109,0.20)"}` }}>
            <p className="font-bold text-sm mb-1" style={{ color: uploadSummary.success === false ? "#E44A4A" : "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              {uploadSummary.success === false ? "Import failed" : "Import summary"}
            </p>
            {uploadSummary.message && (
              <p className="text-xs mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{uploadSummary.message}</p>
            )}
            <div className="text-xs space-y-0.5" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
              <p>Feeds — {uploadSummary.feeds_inserted ?? 0} added · {uploadSummary.feeds_updated ?? 0} updated · {uploadSummary.feeds_skipped ?? 0} unchanged</p>
              <p>Types — {uploadSummary.types_inserted ?? 0} added · {uploadSummary.types_updated ?? 0} updated · {uploadSummary.types_skipped ?? 0} unchanged</p>
              <p>Categories — {uploadSummary.categories_inserted ?? 0} added · {uploadSummary.categories_updated ?? 0} updated · {uploadSummary.categories_skipped ?? 0} unchanged</p>
            </div>
            {uploadSummary.errors && uploadSummary.errors.length > 0 && (
              <ul className="text-xs mt-2 space-y-0.5 list-disc ml-4" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>
                {uploadSummary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Offer-another-language sheet */}
      {showAssign && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAssign(false); }}
        >
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>
            <h3 className="text-center font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
              Offer a language
            </h3>
            <p className="text-center text-sm mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{country.name}</p>
            {regional && (
              <p className="text-center text-xs mb-5" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif", fontStyle: "italic" }}>
                Showing regional languages only
              </p>
            )}
            {!regional && <div className="mb-5" />}
            {available.length === 0 ? (
              <p className="text-sm text-center mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                All available catalog languages are already offered here. Register a new one on the Languages tab.
              </p>
            ) : (
              <select
                value={available.some((l) => l.code === selectedNewCode) ? selectedNewCode : available[0]?.code}
                onChange={(e) => setSelectedNewCode(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {available.map((l) => (
                  <option key={l.code} value={l.code}>
                    {labelForLanguage(l.code) !== l.code.toUpperCase() ? `${labelForLanguage(l.code)} — ${l.name} (${l.code})` : `${l.name} (${l.code})`}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAssign(false)}
                className="flex-1 py-3 rounded-xl font-bold"
                style={{ backgroundColor: "transparent", color: "#064E3B", border: "2px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={available.length === 0 || isAssigning}
                className="flex-1 py-3 rounded-xl font-bold"
                style={{ backgroundColor: available.length === 0 || isAssigning ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: available.length === 0 || isAssigning ? "not-allowed" : "pointer" }}
              >
                {isAssigning ? "Adding…" : "Offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Shared Translation Workspace (country + language pair)
// ══════════════════════════════════════════════════════════════════════

function TranslationWorkspace({
  country,
  lang,
  onBack,
}: {
  country: CountryRow;
  lang: string;
  onBack: () => void;
}) {
  const { showSnackbar } = useStore((s) => ({ showSnackbar: s.showSnackbar }));
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [isLoadingCoverage, setIsLoadingCoverage] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<AdminFeedLite & { translation?: FeedTranslation | null; hydrating?: boolean }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingFeed, setEditingFeed] = useState<AdminFeedLite | null>(null);

  const loadCoverage = () => {
    setIsLoadingCoverage(true);
    getTranslationCoverage(country.id, lang)
      .then((res) => setCoverage(res.data as CoverageReport))
      .catch(() => showSnackbar("Could not load coverage", "error"))
      .finally(() => setIsLoadingCoverage(false));
  };

  useEffect(() => {
    loadCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country.id, lang]);

  // Search narrows the admin feed list to this country; each visible
  // result's translation is then hydrated individually (per-feed GET #5).
  // See this file's top comment for why we don't eagerly fetch everything.
  const runSearch = () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    getAdminFeeds("", 1, 20, "", "", country.name, query.trim())
      .then((res) => {
        const data = res.data as { feeds?: AdminFeedLite[] } | AdminFeedLite[];
        const feeds = Array.isArray(data) ? data : data?.feeds ?? [];
        setResults(feeds.map((f) => ({ ...f, hydrating: true })));
        feeds.forEach((f) => {
          if (!f.feed_id) return;
          listFeedTranslations(f.feed_id)
            .then((tRes) => {
              const list = (tRes.data as { translations?: FeedTranslation[] })?.translations ?? [];
              const match = list.find((t) => t.language === lang) ?? null;
              setResults((prev) => prev.map((r) => (r.feed_id === f.feed_id ? { ...r, translation: match, hydrating: false } : r)));
            })
            .catch(() => setResults((prev) => prev.map((r) => (r.feed_id === f.feed_id ? { ...r, hydrating: false } : r))));
        });
      })
      .catch(() => showSnackbar("Could not search feeds", "error"))
      .finally(() => setIsSearching(false));
  };

  const afterEditSaved = (feed_id: string, translation: FeedTranslation | null) => {
    setResults((prev) => prev.map((r) => (r.feed_id === feed_id ? { ...r, translation } : r)));
    loadCoverage();
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-3 text-sm font-bold"
        style={{ background: "none", border: "none", color: "#064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer", padding: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {country.name}
      </button>
      <p className="font-bold mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
        {country.name} · {labelForLanguage(lang)} ({lang})
      </p>

      <div className="bg-white rounded-2xl px-4 py-4 mb-3" style={cardStyle}>
        <p className="font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
          Coverage
        </p>
        {isLoadingCoverage ? (
          <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Loading…</p>
        ) : coverage ? (
          <div className="space-y-3">
            {[
              { label: "Feeds", translated: coverage.translated_feeds, total: coverage.total_feeds, missing: coverage.missing_feeds },
              { label: "Feed types", translated: coverage.translated_types, total: coverage.total_types },
              { label: "Categories", translated: coverage.translated_categories, total: coverage.total_categories },
            ].map(({ label, translated, total, missing }) => {
              const p = pct(translated, total);
              return (
                <div key={label}>
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{label}</p>
                    <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                      {translated ?? 0} / {total ?? 0}{missing != null && missing > 0 && ` · ${missing} missing`}
                    </p>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 8, backgroundColor: "#F1F5F9" }}>
                    <div style={{ height: "100%", width: `${p}%`, backgroundColor: p >= 80 ? "#1CA069" : p >= 40 ? "#FF9800" : "#E44A4A", transition: "width 0.25s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl px-4 py-4" style={cardStyle}>
        <p className="font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
          Feed names
        </p>
        <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
          Search a feed to see and fix its {labelForLanguage(lang)} name directly, without a workbook round-trip.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search feeds…"
            className="flex-1 rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
            style={inputStyle}
          />
          <button
            onClick={runSearch}
            disabled={isSearching || !query.trim()}
            className="px-4 rounded-xl font-bold text-sm"
            style={{ backgroundColor: isSearching || !query.trim() ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isSearching || !query.trim() ? "not-allowed" : "pointer" }}
          >
            {isSearching ? "…" : "Search"}
          </button>
        </div>
        {results.length === 0 ? (
          <p className="text-xs italic text-center py-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            {query.trim() ? "No matches." : "Search above to find a feed."}
          </p>
        ) : (
          <div className="space-y-0">
            {results.map((r) => (
              <div key={r.feed_id} className="flex items-center justify-between gap-2 py-2.5" style={{ borderTop: "1px solid #F8FAF9" }}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{r.fd_name}</p>
                  {r.hydrating ? (
                    <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>…</p>
                  ) : r.translation ? (
                    <p className="text-xs truncate" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif" }}>{r.translation.name}</p>
                  ) : (
                    <p className="text-xs" style={{ color: "#FF9800", fontFamily: "Nunito, sans-serif" }}>⚠ not translated</p>
                  )}
                </div>
                <button
                  onClick={() => setEditingFeed(r)}
                  aria-label={`${r.translation ? "Edit" : "Add"} ${r.fd_name} translation`}
                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: "#E4F7EF", color: "#064E3B", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                >
                  {r.translation ? "Edit" : "Add"}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs italic mt-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          ⓘ Feed types &amp; categories are translated via the workbook only.
        </p>
      </div>

      {editingFeed && (
        <FeedTranslationSheet
          feed={editingFeed}
          focusLang={lang}
          onClose={() => setEditingFeed(null)}
          onSaved={(translation) => afterEditSaved(editingFeed.feed_id, translation)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Shared edit sheet — one feed, focused on one language, showing every
// OTHER language it already has too (endpoint #5). Used by both the
// Workspace (Countries tab) and the Feeds tab.
// ══════════════════════════════════════════════════════════════════════

function FeedTranslationSheet({
  feed,
  focusLang,
  onClose,
  onSaved,
}: {
  feed: AdminFeedLite;
  focusLang: string;
  onClose: () => void;
  onSaved: (translation: FeedTranslation | null) => void;
}) {
  const { showSnackbar } = useStore((s) => ({ showSnackbar: s.showSnackbar }));
  const [allTranslations, setAllTranslations] = useState<FeedTranslation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    listFeedTranslations(feed.feed_id)
      .then((res) => {
        const list = (res.data as { translations?: FeedTranslation[] })?.translations ?? [];
        setAllTranslations(list);
        setValue(list.find((t) => t.language === focusLang)?.name ?? "");
      })
      .catch(() => showSnackbar("Could not load translations", "error"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.feed_id, focusLang]);

  const handleSave = async () => {
    if (!value.trim()) {
      showSnackbar("Enter a translated name", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await upsertFeedTranslation({ feed_id: feed.feed_id, language: focusLang, name: value.trim() });
      const saved = res.data as FeedTranslation;
      showSnackbar(saved.action === "inserted" ? "Translation added" : "Translation updated", "success");
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save translation";
      showSnackbar(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFeedTranslation(feed.feed_id, focusLang);
      showSnackbar("Translation deleted", "success");
      onSaved(null);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete translation";
      showSnackbar(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const others = allTranslations.filter((t) => t.language !== focusLang);
  const hasExisting = allTranslations.some((t) => t.language === focusLang);

  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
        <div className="flex justify-center mb-3">
          <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
        </div>
        <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
          {feed.fd_name}
        </h3>

        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          English (read-only)
        </p>
        <div className="w-full rounded-xl px-4 py-3 mb-4 flex items-center justify-between" style={{ backgroundColor: "#F1F5F9" }}>
          <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{feed.fd_name}</span>
          <span>🔒</span>
        </div>

        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          {labelForLanguage(focusLang)} ({focusLang})
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
          style={inputStyle}
        />

        {others.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Other languages for this feed
            </p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((t) => (
                <span key={t.language} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                  {t.language} · {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold"
            style={{ backgroundColor: "transparent", color: "#064E3B", border: "2px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
          >
            Cancel
          </button>
          {hasExisting && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl font-bold"
              style={{ backgroundColor: "rgba(228,74,74,0.15)", color: "#E44A4A", border: "none", fontFamily: "Nunito, sans-serif", cursor: isDeleting ? "not-allowed" : "pointer" }}
            >
              {isDeleting ? "…" : "Delete"}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="flex-1 py-3 rounded-xl font-bold"
            style={{ backgroundColor: isSaving || isLoading ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isSaving || isLoading ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "Saving…" : "Save ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 2 — LANGUAGES (global registry, inline — no gear icon)
// ══════════════════════════════════════════════════════════════════════

function LanguagesTab({
  allLanguages,
  countries,
  reload,
  showSnackbar,
}: {
  allLanguages: SystemLanguage[];
  countries: CountryRow[];
  reload: () => void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [renamingCode, setRenamingCode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSavingRename, setIsSavingRename] = useState(false);

  const [togglingCode, setTogglingCode] = useState<string | null>(null);

  const handleAdd = async () => {
    const code = newCode.trim().toLowerCase();
    if (!code || !newName.trim()) {
      showSnackbar("Code and name are required", "error");
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
      const msg = err instanceof Error ? err.message : "Could not register language";
      showSnackbar(msg, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const startRename = (l: SystemLanguage) => {
    setRenamingCode(l.code);
    setRenameValue(l.name);
  };

  const saveRename = async () => {
    if (!renamingCode || !renameValue.trim()) return;
    setIsSavingRename(true);
    try {
      await patchLanguage(renamingCode, { name: renameValue.trim() });
      showSnackbar("Renamed", "success");
      setRenamingCode(null);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not rename";
      showSnackbar(msg, "error");
    } finally {
      setIsSavingRename(false);
    }
  };

  const handleToggleActive = async (l: SystemLanguage) => {
    if (togglingCode) return;
    const turningOff = l.is_active;
    if (turningOff && !window.confirm(`This hides ${l.name} for ALL users in ALL countries. Translations are kept. Continue?`)) {
      return;
    }
    setTogglingCode(l.code);
    try {
      await patchLanguage(l.code, { is_active: !l.is_active });
      showSnackbar(turningOff ? `${l.name} deactivated` : `${l.name} reactivated`, "success");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update language";
      showSnackbar(msg, "error");
    } finally {
      setTogglingCode(null);
    }
  };

  const sorted = [...allLanguages].sort((a, b) => {
    if (a.code === "en") return -1;
    if (b.code === "en") return 1;
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
          {allLanguages.length} registered
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm"
          style={{ backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Add language
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        {sorted.map((l) => {
          const isEnglish = l.code === "en";
          const offeredIn = countries.filter((c) => c.languages.includes(l.code)).length;
          return (
            <div key={l.code} className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderTop: "1px solid #F8FAF9", opacity: l.is_active ? 1 : 0.6 }}>
              <div className="min-w-0 flex-1">
                {renamingCode === l.code ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-sm border-none focus:outline-none"
                      style={inputStyle}
                      autoFocus
                    />
                    <button
                      onClick={saveRename}
                      disabled={isSavingRename}
                      className="text-xs font-bold px-2 py-1.5 rounded-lg"
                      style={{ backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setRenamingCode(null)}
                      className="text-xs font-bold px-2 py-1.5 rounded-lg"
                      style={{ backgroundColor: "transparent", color: "#6D6D6D", border: "1px solid #C2C2C2", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs uppercase font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{l.code}</span>
                    <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{l.name}</p>
                    {!isEnglish && (
                      <button
                        onClick={() => startRename(l)}
                        aria-label={`Rename ${l.name}`}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#6D6D6D" }}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {isEnglish ? "🌍 all countries" : offeredIn > 0 ? `Offered in ${offeredIn} countr${offeredIn === 1 ? "y" : "ies"}` : "Not offered anywhere"}
                </p>
              </div>
              {isEnglish ? (
                <span className="text-xs font-bold px-2 py-1 rounded flex-shrink-0" style={{ backgroundColor: "#E4F7EF", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                  locked 🔒
                </span>
              ) : (
                <label className="toggle-switch flex-shrink-0" aria-label={`${l.is_active ? "Deactivate" : "Activate"} ${l.name}`} style={{ opacity: togglingCode === l.code ? 0.55 : 1, cursor: togglingCode === l.code ? "wait" : "pointer" }}>
                  <input type="checkbox" checked={l.is_active} disabled={togglingCode === l.code} onChange={() => handleToggleActive(l)} />
                  <span className="toggle-slider" />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>
            <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>
              Add language
            </h3>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Code <span style={{ color: "#FC2E20" }}>*</span>
            </p>
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toLowerCase())}
              placeholder="e.g. hi, vi, sw"
              maxLength={10}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
              style={inputStyle}
            />
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Name <span style={{ color: "#FC2E20" }}>*</span>
            </p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Hindi, Vietnamese, Kiswahili"
              maxLength={100}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
              style={inputStyle}
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

// ══════════════════════════════════════════════════════════════════════
// TAB 3 — FEEDS (feed-centric editor; the doc's star for endpoint #5)
// ══════════════════════════════════════════════════════════════════════

function FeedsTab({
  allLanguages,
  showSnackbar,
}: {
  allLanguages: SystemLanguage[];
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminFeedLite[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<AdminFeedLite | null>(null);
  const [translations, setTranslations] = useState<FeedTranslation[]>([]);
  const [isLoadingTranslations, setIsLoadingTranslations] = useState(false);
  const [addingLang, setAddingLang] = useState("");
  const [addingValue, setAddingValue] = useState("");
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [editingLang, setEditingLang] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const runSearch = () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    getAdminFeeds("", 1, 20, "", "", "", query.trim())
      .then((res) => {
        const data = res.data as { feeds?: AdminFeedLite[] } | AdminFeedLite[];
        setResults(Array.isArray(data) ? data : data?.feeds ?? []);
      })
      .catch(() => showSnackbar("Could not search feeds", "error"))
      .finally(() => setIsSearching(false));
  };

  const openFeed = (f: AdminFeedLite) => {
    setSelectedFeed(f);
    setIsLoadingTranslations(true);
    listFeedTranslations(f.feed_id)
      .then((res) => setTranslations((res.data as { translations?: FeedTranslation[] })?.translations ?? []))
      .catch(() => showSnackbar("Could not load translations", "error"))
      .finally(() => setIsLoadingTranslations(false));
  };

  const catalogCodesNotYetTranslated = allLanguages.filter(
    (l) => l.is_active && l.code !== "en" && !translations.some((t) => t.language === l.code)
  );

  const handleAddTranslation = async () => {
    if (!selectedFeed || !addingLang || !addingValue.trim()) return;
    setIsSavingNew(true);
    try {
      const res = await upsertFeedTranslation({ feed_id: selectedFeed.feed_id, language: addingLang, name: addingValue.trim() });
      setTranslations((prev) => [...prev, res.data as FeedTranslation]);
      showSnackbar("Translation added", "success");
      setAddingLang("");
      setAddingValue("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not add translation";
      showSnackbar(msg, "error");
    } finally {
      setIsSavingNew(false);
    }
  };

  const startEdit = (t: FeedTranslation) => {
    setEditingLang(t.language);
    setEditValue(t.name);
  };

  const saveEdit = async () => {
    if (!selectedFeed || !editingLang) return;
    setIsSavingEdit(true);
    try {
      const res = await upsertFeedTranslation({ feed_id: selectedFeed.feed_id, language: editingLang, name: editValue.trim() });
      setTranslations((prev) => prev.map((t) => (t.language === editingLang ? (res.data as FeedTranslation) : t)));
      showSnackbar("Translation updated", "success");
      setEditingLang(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update translation";
      showSnackbar(msg, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (language: string) => {
    if (!selectedFeed) return;
    try {
      await deleteFeedTranslation(selectedFeed.feed_id, language);
      setTranslations((prev) => prev.filter((t) => t.language !== language));
      showSnackbar("Translation deleted", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete translation";
      showSnackbar(msg, "error");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search any feed…"
          className="flex-1 rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
          style={inputStyle}
        />
        <button
          onClick={runSearch}
          disabled={isSearching || !query.trim()}
          className="px-4 rounded-xl font-bold text-sm"
          style={{ backgroundColor: isSearching || !query.trim() ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isSearching || !query.trim() ? "not-allowed" : "pointer" }}
        >
          {isSearching ? "…" : "Search"}
        </button>
      </div>

      {results.length > 0 && !selectedFeed && (
        <div className="bg-white rounded-2xl overflow-hidden mb-3" style={cardStyle}>
          {results.map((f) => (
            <button
              key={f.feed_id}
              onClick={() => openFeed(f)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ borderTop: "1px solid #F8FAF9", background: "none", border: "none", cursor: "pointer" }}
            >
              <p className="font-bold text-sm truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{f.fd_name}</p>
              {f.fd_country_name && (
                <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{f.fd_country_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && !isSearching && !selectedFeed && (
        <p className="text-sm text-center py-6" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>No matches.</p>
      )}

      {selectedFeed && (
        <div className="bg-white rounded-2xl px-4 py-4" style={cardStyle}>
          <button
            onClick={() => setSelectedFeed(null)}
            className="flex items-center gap-1.5 mb-3 text-sm font-bold"
            style={{ background: "none", border: "none", color: "#064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer", padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Results
          </button>
          <p className="font-bold mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>{selectedFeed.fd_name}</p>

          <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid #F8FAF9" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>EN</span>
              <p style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{selectedFeed.fd_name}</p>
            </div>
            <span>🔒</span>
          </div>

          {isLoadingTranslations ? (
            <p className="text-sm py-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Loading…</p>
          ) : (
            translations.map((t) => (
              <div key={t.language} className="flex items-center justify-between gap-2 py-2.5" style={{ borderTop: "1px solid #F8FAF9" }}>
                {editingLang === t.language ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-sm border-none focus:outline-none"
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={saveEdit} disabled={isSavingEdit} className="text-xs font-bold px-2 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs uppercase font-bold flex-shrink-0" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{t.language}</span>
                      <p className="truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{t.name}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(t)} aria-label={`Edit ${t.language}`} style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", color: "#064E3B" }}>✎</button>
                      <button onClick={() => handleDelete(t.language)} aria-label={`Delete ${t.language}`} style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", color: "#E44A4A" }}>✕</button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}

          {/* Add translation */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F8FAF9" }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>+ Add translation</p>
            <div className="flex gap-2">
              <select
                value={addingLang}
                onChange={(e) => setAddingLang(e.target.value)}
                className="rounded-lg px-2 py-2 text-sm border-none focus:outline-none"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Language…</option>
                {catalogCodesNotYetTranslated.map((l) => (
                  <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                ))}
              </select>
              <input
                type="text"
                value={addingValue}
                onChange={(e) => setAddingValue(e.target.value)}
                placeholder="Translated name"
                className="flex-1 rounded-lg px-3 py-2 text-sm border-none focus:outline-none"
                style={inputStyle}
              />
              <button
                onClick={handleAddTranslation}
                disabled={isSavingNew || !addingLang || !addingValue.trim()}
                className="px-3 rounded-lg font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: isSavingNew || !addingLang || !addingValue.trim() ? "#D3D3D3" : "#1CA069", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
