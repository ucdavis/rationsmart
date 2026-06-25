"use client";

// i18n V2 Phase 2 — Admin > Translations
// Spec source: ~/Desktop/post_impl_multi_language/api_endpoints_for_frontend.md §3.1–3.6
//
// Purpose:
//   - Download a pre-filled translation workbook for a country (xlsx)
//   - Upload a filled-in workbook (multipart, returns import summary)
//   - View translation coverage % per language for a country
//
// Per-feed single-translation editor (§3.4–3.6) is intentionally NOT
// surfaced here yet — the workbook path covers the bulk-translation
// workflow that the user guide describes as the primary admin journey.
// Wiring an inline editor can come later when the team needs it.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import {
  getCountries,
  listLanguages,
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getTranslationCoverage,
  labelForLanguage,
} from "@/lib/api";

interface CountryRow {
  id: string;
  name: string;
  supported_languages?: string[];
}

interface SystemLanguage {
  code: string;
  name: string;
  is_active: boolean;
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

export default function AdminTranslationsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [selectedLang, setSelectedLang] = useState("");

  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [isLoadingCoverage, setIsLoadingCoverage] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  // Load the country list + the system-wide language registry on mount.
  // The system-wide list is used as a fallback in the coverage-language
  // selector when a country's `supported_languages` is not yet provided
  // by the backend response.
  useEffect(() => {
    if (!user?.is_admin) return;
    Promise.all([getCountries(), listLanguages()])
      .then(([cRes, lRes]) => {
        const cs = (cRes.data ?? []) as CountryRow[];
        setCountries(cs);
        if (cs.length > 0 && !selectedCountryId) setSelectedCountryId(String(cs[0].id));
        const ls = ((lRes.data as { languages?: SystemLanguage[] })?.languages ?? []);
        setAllLanguages(ls);
      })
      .catch(() => showSnackbar("Could not load country / language list", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  // Available coverage languages for the selected country.
  // Prefer the country's own supported_languages (post-i18n-V2 backend).
  // Strip "en" since coverage is meaningless for the baseline.
  const selectedCountry = countries.find((c) => String(c.id) === selectedCountryId);
  const coverageLangs = (selectedCountry?.supported_languages
    ?? allLanguages.filter((l) => l.is_active).map((l) => l.code))
    .filter((c) => c !== "en");

  // Default the coverage language to the first available one whenever
  // the country changes.
  useEffect(() => {
    if (coverageLangs.length > 0 && !coverageLangs.includes(selectedLang)) {
      setSelectedLang(coverageLangs[0]);
    }
    setCoverage(null); // reset stale coverage when country changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryId]);

  // ── Download workbook ─────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!selectedCountryId) {
      showSnackbar("Pick a country first", "error");
      return;
    }
    setIsDownloading(true);
    try {
      const res = await downloadTranslationWorkbook(selectedCountryId);
      // Pull filename from Content-Disposition when present; otherwise
      // build a sensible default tagged with the country id.
      const cdRaw = (res.headers["content-disposition"] || res.headers["Content-Disposition"] || "") as string;
      const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)["']?/i.exec(cdRaw);
      const fileName = cdMatch?.[1]
        ? decodeURIComponent(cdMatch[1].trim())
        : `translations_${selectedCountryId}.xlsx`;
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

  // ── Upload workbook ───────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedCountryId) {
      showSnackbar("Pick a country first", "error");
      return;
    }
    if (!uploadFile) {
      showSnackbar("Pick a file to upload", "error");
      return;
    }
    setIsUploading(true);
    setUploadSummary(null);
    try {
      const res = await uploadTranslationWorkbook(selectedCountryId, uploadFile);
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

  // ── Coverage check ────────────────────────────────────────────────────
  const handleLoadCoverage = async () => {
    if (!selectedCountryId || !selectedLang) {
      showSnackbar("Pick a country and language first", "error");
      return;
    }
    setIsLoadingCoverage(true);
    setCoverage(null);
    try {
      const res = await getTranslationCoverage(selectedCountryId, selectedLang);
      setCoverage(res.data as CoverageReport);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load coverage";
      showSnackbar(msg, "error");
    } finally {
      setIsLoadingCoverage(false);
    }
  };

  if (!user?.is_admin) return null;

  const pct = (translated: number | undefined, total: number | undefined) => {
    if (!total || total === 0) return 0;
    return Math.round(((translated ?? 0) / total) * 100);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Translations" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Country picker — shared for all three sections ────────── */}
        <div className="px-4 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            COUNTRY
          </p>
          <select
            value={selectedCountryId}
            onChange={(e) => setSelectedCountryId(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-4"
            style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
          >
            {countries.length === 0 && <option value="">Loading…</option>}
            {countries.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* ── §1 Workbook ─────────────────────────────────────────────── */}
        <div className="mx-3 mt-1 bg-white rounded-2xl px-4 py-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <p className="font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
            Translation Workbook
          </p>
          <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
            Download the pre-filled xlsx, fill in the language columns, then upload it back.
          </p>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={isDownloading || !selectedCountryId}
            className="w-full py-3 rounded-xl font-bold mb-3"
            style={{ backgroundColor: isDownloading || !selectedCountryId ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isDownloading || !selectedCountryId ? "not-allowed" : "pointer" }}
          >
            {isDownloading ? "Downloading…" : "Download Translation Template"}
          </button>

          {/* Upload — file picker + Submit */}
          <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            UPLOAD FILLED WORKBOOK
          </p>
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
            disabled={isUploading || !uploadFile || !selectedCountryId}
            className="w-full py-3 rounded-xl font-bold"
            style={{ backgroundColor: isUploading || !uploadFile || !selectedCountryId ? "#D3D3D3" : "#1CA069", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isUploading || !uploadFile || !selectedCountryId ? "not-allowed" : "pointer" }}
          >
            {isUploading ? "Uploading…" : "Upload Workbook"}
          </button>

          {/* Import-result panel — sticks until next upload */}
          {uploadSummary && (
            <div className="mt-3 rounded-xl px-3 py-3" style={{ backgroundColor: uploadSummary.success === false ? "#FEC5BB" : "#F0FDF4", border: `1px solid ${uploadSummary.success === false ? "rgba(228,74,74,0.25)" : "rgba(5,188,109,0.20)"}` }}>
              <p className="font-bold text-sm mb-1" style={{ color: uploadSummary.success === false ? "#E44A4A" : "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                {uploadSummary.success === false ? "Import Failed" : "Import Summary"}
              </p>
              {uploadSummary.message && (
                <p className="text-xs mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{uploadSummary.message}</p>
              )}
              <div className="text-xs space-y-0.5" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                <p>Feeds — {uploadSummary.feeds_inserted ?? 0} inserted · {uploadSummary.feeds_updated ?? 0} updated · {uploadSummary.feeds_skipped ?? 0} skipped</p>
                <p>Types — {uploadSummary.types_inserted ?? 0} inserted · {uploadSummary.types_updated ?? 0} updated · {uploadSummary.types_skipped ?? 0} skipped</p>
                <p>Categories — {uploadSummary.categories_inserted ?? 0} inserted · {uploadSummary.categories_updated ?? 0} updated · {uploadSummary.categories_skipped ?? 0} skipped</p>
              </div>
              {uploadSummary.errors && uploadSummary.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold mb-1" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>
                    Errors ({uploadSummary.errors.length}):
                  </p>
                  <ul className="text-xs space-y-0.5 list-disc ml-4" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                    {uploadSummary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    {uploadSummary.errors.length > 10 && (
                      <li style={{ color: "#6D6D6D" }}>… and {uploadSummary.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── §2 Coverage ─────────────────────────────────────────────── */}
        <div className="mx-3 mt-3 bg-white rounded-2xl px-4 py-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <p className="font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
            Translation Coverage
          </p>
          <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
            How complete the feed, type, and category translations are for the picked language.
          </p>

          <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            LANGUAGE
          </p>
          {coverageLangs.length === 0 ? (
            <p className="text-xs italic mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              No non-English languages assigned to this country yet. Add one in
              Admin → Country Languages first.
            </p>
          ) : (
            <select
              value={selectedLang}
              onChange={(e) => { setSelectedLang(e.target.value); setCoverage(null); }}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
              style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
            >
              {coverageLangs.map((code) => (
                <option key={code} value={code}>
                  {labelForLanguage(code)} ({code})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleLoadCoverage}
            disabled={isLoadingCoverage || !selectedCountryId || !selectedLang}
            className="w-full py-3 rounded-xl font-bold"
            style={{ backgroundColor: isLoadingCoverage || !selectedCountryId || !selectedLang ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isLoadingCoverage || !selectedCountryId || !selectedLang ? "not-allowed" : "pointer" }}
          >
            {isLoadingCoverage ? "Loading…" : "Check Coverage"}
          </button>

          {coverage && (
            <div className="mt-3 space-y-3">
              {/* Three progress rows: Feeds, Types, Categories */}
              {[
                { label: "Feeds", translated: coverage.translated_feeds, total: coverage.total_feeds, missing: coverage.missing_feeds },
                { label: "Feed Types", translated: coverage.translated_types, total: coverage.total_types },
                { label: "Categories", translated: coverage.translated_categories, total: coverage.total_categories },
              ].map(({ label, translated, total, missing }) => {
                const p = pct(translated, total);
                return (
                  <div key={label}>
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                        {label}
                      </p>
                      <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                        {translated ?? 0} / {total ?? 0}
                        {missing != null && missing > 0 && ` · ${missing} missing`}
                      </p>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 8, backgroundColor: "#F1F5F9" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${p}%`,
                          backgroundColor: p >= 80 ? "#1CA069" : p >= 40 ? "#FF9800" : "#E44A4A",
                          transition: "width 0.25s",
                        }}
                      />
                    </div>
                    <p className="text-xs mt-0.5 text-right" style={{ color: p >= 80 ? "#1CA069" : p >= 40 ? "#FF9800" : "#E44A4A", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                      {p}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
