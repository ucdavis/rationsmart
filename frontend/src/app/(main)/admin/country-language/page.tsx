"use client";

// Admin > Country/Language
// Spec source: ~/Downloads/RationSmartAdmin.html (interactive prototype) +
// ~/Downloads/Admin_Country_Language.xlsx (UI action -> endpoint mapping).
// Built as an ADDITION alongside the existing Admin > Languages /
// Admin > Translations screens — not a replacement; nothing there changed.
//
// Two screens, matching the prototype's "1/2"/"2/2":
//   Countries & Languages — enable/disable countries (NEW capability, not
//     in the older admin screens — PUT /v1/admin/countries/{id}/toggle-status),
//     associate/dis-associate languages per country, register a language,
//     activate/deactivate a language globally.
//   Local Feed Names — pick a country, pick one of ITS associated local
//     (non-English) languages, then browse every feed for that country and
//     set/edit/delete its name in that language, plus bulk workbook
//     export/import scoped to the country.
//
// Two deliberate deviations from the prototype, both verified against the
// live v1 swagger rather than guessed:
//   1. The prototype's "Register a new language" sheet has a "Native name"
//      field, but POST /v1/admin/languages only accepts {code, name} — no
//      slot to store it. Dropped the field entirely rather than collect
//      something that silently goes nowhere; native-script display already
//      comes from the app's own labelForLanguage() lookup for known codes.
//   2. "Activate a country" needs to see INACTIVE countries, but
//      GET /v1/admin/countries (used for the main list) only ever returns
//      ACTIVE ones. Added listAllCountries() (GET /v1/admin/list-all-countries)
//      for that picker specifically — the prototype's mock data didn't
//      surface this distinction since it was all client-side state.
//
// No per-feed "translation status for a whole country in one language" list
// endpoint exists (same gap noted in earlier i18n admin work) — the feed
// list here is fetched in full (list-feeds, all pages) and every feed's
// translation status is hydrated in parallel afterward (listFeedTranslations
// per feed), not sequentially and not lazily.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import {
  listLanguages,
  createLanguage,
  patchLanguage,
  listCountriesWithLanguages,
  listAllCountries,
  toggleCountryStatus,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
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
  is_active: boolean;
  languages: string[];
}
interface InactiveCountryRow {
  id: string;
  name: string;
  country_code: string;
  is_active: boolean;
}
interface FeedTranslation {
  feed_id: string;
  language: string;
  name: string;
  action?: "inserted" | "updated" | null;
}
interface AdminFeedLite {
  feed_id: string;
  fd_name: string;
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

type Tab = "countries" | "feeds";
type ConfirmState = { title: string; body: string; label: string; danger?: boolean; onConfirm: () => void } | null;

const inputStyle = { backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" };
const cardStyle = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };
const sheetOverlayStyle = { left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.65)" };

// ── Skeleton loading states (shimmer pattern from admin/users, admin/feeds,
// admin/reports — same `.shimmer` CSS keyframe, shaped to each real row). ──

function SkeletonCardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
      <div className="px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", opacity: 0.5 }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function SkeletonCountryRow() {
  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid #F8FAF9" }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-28 rounded-full shimmer" />
          <div className="h-3 w-20 rounded-full shimmer" />
        </div>
        <div className="h-7 w-12 rounded-full shimmer flex-shrink-0" />
      </div>
      <div className="flex gap-1.5 mt-3">
        <div className="h-6 w-16 rounded-full shimmer" />
        <div className="h-6 w-20 rounded-full shimmer" />
      </div>
    </div>
  );
}

function SkeletonLanguageRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #F8FAF9" }}>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-24 rounded-full shimmer" />
        <div className="h-3 w-32 rounded-full shimmer" />
      </div>
      <div className="h-7 w-12 rounded-full shimmer flex-shrink-0" />
    </div>
  );
}

function SkeletonPickerRow() {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ border: "1px solid #DCE0E4" }}>
      <div className="h-4 w-28 rounded-full shimmer" />
      <div className="h-3 w-14 rounded-full shimmer" />
    </div>
  );
}

function SkeletonFeedRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #F8FAF9" }}>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-32 rounded-full shimmer" />
        <div className="h-3 w-20 rounded-full shimmer" />
      </div>
      <div className="h-5 w-16 rounded-full shimmer flex-shrink-0" />
    </div>
  );
}

export default function AdminCountryLanguagePage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [tab, setTab] = useState<Tab>("countries");
  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Shared confirm dialog — both screens funnel through this one piece of
  // state (matching the prototype's confirm1/confirm2, unified here since
  // only one can ever be open at a time).
  const [confirm, setConfirm] = useState<ConfirmState>(null);

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
          showSnackbar("Could not load language registry", "error");
        }
        if (countriesRes.status === "fulfilled") {
          const d = countriesRes.value.data as { countries?: CountryRow[] } | CountryRow[];
          setCountries((Array.isArray(d) ? d : d?.countries ?? []) as CountryRow[]);
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

  const askConfirm = (title: string, body: string, label: string, danger: boolean, onConfirm: () => void) => {
    setConfirm({ title, body, label, danger, onConfirm: () => { onConfirm(); setConfirm(null); } });
  };

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Country / Language" onBack={() => router.back()} />

      <div className="px-3 pt-3">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: "#E4F7EF" }}>
          {([
            { key: "countries", label: "Countries & Languages" },
            { key: "feeds", label: "Local Feed Names" },
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
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
          <SkeletonCardShell title="Enabled Countries / Languages">
            {[0, 1, 2].map((i) => <SkeletonCountryRow key={i} />)}
          </SkeletonCardShell>
          <SkeletonCardShell title="Registered Languages">
            {[0, 1, 2, 3].map((i) => <SkeletonLanguageRow key={i} />)}
          </SkeletonCardShell>
        </div>
      ) : tab === "countries" ? (
        <CountriesLanguagesTab
          countries={countries}
          allLanguages={allLanguages}
          reload={reload}
          showSnackbar={showSnackbar}
          askConfirm={askConfirm}
        />
      ) : (
        <FeedNamesTab countries={countries} showSnackbar={showSnackbar} />
      )}

      {confirm && (
        <div
          className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
          style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl w-full px-5 py-5" style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
            <p className="font-bold mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 15 }}>{confirm.title}</p>
            <p className="text-sm mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>{confirm.body}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{ backgroundColor: "transparent", color: "#064E3B", border: "1.5px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirm.onConfirm}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{ backgroundColor: confirm.danger ? "#E44A4A" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                {confirm.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 1 — Countries & Languages
// ══════════════════════════════════════════════════════════════════════

function CountriesLanguagesTab({
  countries,
  allLanguages,
  reload,
  showSnackbar,
  askConfirm,
}: {
  countries: CountryRow[];
  allLanguages: SystemLanguage[];
  reload: () => void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  askConfirm: (title: string, body: string, label: string, danger: boolean, onConfirm: () => void) => void;
}) {
  const [showActivate, setShowActivate] = useState(false);
  const [inactiveCountries, setInactiveCountries] = useState<InactiveCountryRow[]>([]);
  const [isLoadingInactive, setIsLoadingInactive] = useState(false);

  const [assocFor, setAssocFor] = useState<CountryRow | null>(null);
  const [isAssociating, setIsAssociating] = useState(false);

  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regCode, setRegCode] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const [pendingKey, setPendingKey] = useState<Set<string>>(new Set());

  const openActivateSheet = () => {
    setShowActivate(true);
    setIsLoadingInactive(true);
    listAllCountries()
      .then((res) => {
        const d = res.data as { countries?: InactiveCountryRow[] } | InactiveCountryRow[];
        const all = (Array.isArray(d) ? d : d?.countries ?? []) as InactiveCountryRow[];
        setInactiveCountries(all.filter((c) => !c.is_active));
      })
      .catch(() => showSnackbar("Could not load countries", "error"))
      .finally(() => setIsLoadingInactive(false));
  };

  const handleActivateCountry = async (c: InactiveCountryRow) => {
    try {
      await toggleCountryStatus(c.id, "enable");
      showSnackbar(`${c.name} activated`, "success");
      setShowActivate(false);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not activate country";
      showSnackbar(msg, "error");
    }
  };

  const handleDeactivateCountry = (c: CountryRow) => {
    const key = `country:${c.id}`;
    if (pendingKey.has(key)) return;
    askConfirm(
      `Deactivate ${c.name}?`,
      `${c.name} will be hidden from registration and profile screens. Existing users, feeds, and reports are unaffected.`,
      "Deactivate",
      true,
      async () => {
        setPendingKey((prev) => new Set(prev).add(key));
        try {
          await toggleCountryStatus(c.id, "disable");
          showSnackbar(`${c.name} deactivated`, "success");
          reload();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Could not deactivate country";
          showSnackbar(msg, "error");
        } finally {
          setPendingKey((prev) => { const next = new Set(prev); next.delete(key); return next; });
        }
      }
    );
  };

  const handleDisassociate = (c: CountryRow, code: string) => {
    const key = `${c.id}:${code}`;
    if (pendingKey.has(key)) return;
    const langName = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
    askConfirm(
      `Dis-associate ${langName} from ${c.name}?`,
      "This Country/Language combination will no longer appear in the Cattle Info screen for farmers.",
      "Dis-associate",
      true,
      async () => {
        setPendingKey((prev) => new Set(prev).add(key));
        try {
          await unassignLanguageFromCountry(c.id, code);
          showSnackbar(`${langName} removed from ${c.name}`, "success");
          reload();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Could not remove language";
          showSnackbar(msg, "error");
        } finally {
          setPendingKey((prev) => { const next = new Set(prev); next.delete(key); return next; });
        }
      }
    );
  };

  const handleAssociate = async (code: string) => {
    if (!assocFor) return;
    setIsAssociating(true);
    const langName = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
    try {
      await assignLanguageToCountry(assocFor.id, code);
      showSnackbar(`${langName} associated with ${assocFor.name}`, "success");
      setAssocFor(null);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not associate language";
      showSnackbar(msg, "error");
    } finally {
      setIsAssociating(false);
    }
  };

  const handleToggleLanguage = (l: SystemLanguage) => {
    const key = `lang:${l.code}`;
    if (pendingKey.has(key)) return;
    const flip = async () => {
      setPendingKey((prev) => new Set(prev).add(key));
      try {
        await patchLanguage(l.code, { is_active: !l.is_active });
        showSnackbar(`${l.name} ${l.is_active ? "deactivated" : "activated"}`, "success");
        reload();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not update language";
        showSnackbar(msg, "error");
      } finally {
        setPendingKey((prev) => { const next = new Set(prev); next.delete(key); return next; });
      }
    };
    if (l.is_active) {
      askConfirm(`Deactivate ${l.name}?`, `${l.name} stops resolving for every user in every country. Translations are kept.`, "Deactivate", true, flip);
    } else {
      flip();
    }
  };

  const handleRegister = async () => {
    const code = regCode.trim().toLowerCase();
    if (!regName.trim() || !code) {
      showSnackbar("Name and code are required", "error");
      return;
    }
    setIsRegistering(true);
    try {
      await createLanguage({ code, name: regName.trim() });
      showSnackbar(`${regName.trim()} registered`, "success");
      setShowRegister(false);
      setRegName("");
      setRegCode("");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not register language";
      showSnackbar(msg, "error");
    } finally {
      setIsRegistering(false);
    }
  };

  const activeLangCount = allLanguages.filter((l) => l.is_active).length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* Enabled Countries / Languages */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
          <p className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Enabled Countries / Languages
          </p>
          <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{countries.length} enabled</p>
          <button
            onClick={openActivateSheet}
            aria-label="Activate a country"
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 24, height: 24, backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", cursor: "pointer", fontSize: 14 }}
          >
            ＋
          </button>
        </div>
        {countries.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>No countries enabled yet.</p>
        ) : (
          countries.map((c) => {
            const extraLangs = c.languages.filter((x) => x !== "en");
            const isPending = pendingKey.has(`country:${c.id}`);
            return (
              <div key={c.id} className="px-4 py-3" style={{ borderTop: "1px solid #F8FAF9" }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{c.name}</p>
                    <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                      {extraLangs.length} local language{extraLangs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <label
                    className="toggle-switch flex-shrink-0"
                    aria-label={`Deactivate ${c.name}`}
                    style={{ opacity: isPending ? 0.55 : 1, cursor: isPending ? "wait" : "pointer" }}
                  >
                    <input type="checkbox" checked disabled={isPending} onChange={() => handleDeactivateCountry(c)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {extraLangs.map((code) => {
                    const langName = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
                    const key = `${c.id}:${code}`;
                    return (
                      <span
                        key={code}
                        className="flex items-center gap-1.5 text-xs font-bold pl-2.5 pr-1 py-1 rounded-full"
                        style={{ backgroundColor: "#F1F5F9", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                      >
                        {langName}
                        <button
                          onClick={() => handleDisassociate(c, code)}
                          disabled={pendingKey.has(key)}
                          aria-label={`Dis-associate ${langName} from ${c.name}`}
                          className="flex items-center justify-center rounded-full"
                          style={{ width: 16, height: 16, background: "rgba(6,78,59,0.13)", border: "none", cursor: pendingKey.has(key) ? "wait" : "pointer", fontSize: 9, color: "#064E3B" }}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                  <button
                    onClick={() => setAssocFor(c)}
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "transparent", color: "#064E3B", border: "1.5px dashed rgba(5,188,109,0.5)", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
                  >
                    + Add language
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Registered Languages */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
          <p className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Registered Languages
          </p>
          <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{activeLangCount} active</p>
          <button
            onClick={() => setShowRegister(true)}
            aria-label="Register a new language"
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 24, height: 24, backgroundColor: "#064E3B", color: "#FFFFFF", border: "none", cursor: "pointer", fontSize: 14 }}
          >
            ＋
          </button>
        </div>
        {allLanguages.map((l) => {
          const isEnglish = l.code === "en";
          const key = `lang:${l.code}`;
          const isPending = pendingKey.has(key);
          return (
            <div key={l.code} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #F8FAF9", opacity: l.is_active ? 1 : 0.6 }}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{labelForLanguage(l.code)}</p>
                <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {l.name} · {l.code}{!l.is_active && " · inactive"}
                </p>
              </div>
              {isEnglish ? (
                <span className="text-xs font-bold px-2 py-1 rounded flex-shrink-0" style={{ backgroundColor: "#E4F7EF", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                  locked 🔒
                </span>
              ) : (
                <label className="toggle-switch flex-shrink-0" aria-label={`${l.is_active ? "Deactivate" : "Activate"} ${l.name}`} style={{ opacity: isPending ? 0.55 : 1, cursor: isPending ? "wait" : "pointer" }}>
                  <input type="checkbox" checked={l.is_active} disabled={isPending} onChange={() => handleToggleLanguage(l)} />
                  <span className="toggle-slider" />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {/* Activate-a-country sheet */}
      {showActivate && (
        <div className="fixed top-0 h-full z-50 flex flex-col justify-end" style={sheetOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setShowActivate(false); }}>
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3"><div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} /></div>
            <h3 className="text-center font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>Activate a country</h3>
            <p className="text-center text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>RationSmart becomes available to farmers in the activated country.</p>
            {isLoadingInactive ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => <SkeletonPickerRow key={i} />)}
              </div>
            ) : inactiveCountries.length === 0 ? (
              <p className="text-sm text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>All registered countries are already enabled.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {inactiveCountries.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleActivateCountry(c)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                    style={{ border: "1px solid #DCE0E4", background: "#FFFFFF", cursor: "pointer" }}
                  >
                    <span className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{c.name}</span>
                    <span className="text-xs font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Activate →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Associate-a-language sheet (per country) */}
      {assocFor && (() => {
        const available = allLanguages.filter((l) => l.is_active && !assocFor.languages.includes(l.code));
        return (
          <div className="fixed top-0 h-full z-50 flex flex-col justify-end" style={sheetOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setAssocFor(null); }}>
            <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
              <div className="flex justify-center mb-3"><div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} /></div>
              <h3 className="text-center font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>Associate a language — {assocFor.name}</h3>
              <p className="text-center text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                The combination will appear in the Cattle Info screen for farmers in {assocFor.name}.
              </p>
              {available.length === 0 ? (
                <p className="text-sm text-center" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  All active languages are already associated. Register or activate a language first.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {available.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleAssociate(l.code)}
                      disabled={isAssociating}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                      style={{ border: "1px solid #DCE0E4", background: "#FFFFFF", cursor: isAssociating ? "wait" : "pointer" }}
                    >
                      <span className="font-bold text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                        {labelForLanguage(l.code)} <span style={{ color: "#6D6D6D", fontWeight: 400 }}>· {l.name}</span>
                      </span>
                      <span className="text-xs font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Associate →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Register-a-language sheet — Name + Code only (see file-header note:
          the prototype's "Native name" field has nowhere to persist to on
          the real API, so it's not collected here). */}
      {showRegister && (
        <div className="fixed top-0 h-full z-50 flex flex-col justify-end" style={sheetOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setShowRegister(false); }}>
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3"><div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} /></div>
            <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18 }}>Register a new language</h3>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Language name (English)</p>
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Swahili"
              maxLength={100}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
              style={inputStyle}
            />
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>ISO code</p>
            <input
              type="text"
              value={regCode}
              onChange={(e) => setRegCode(e.target.value.toLowerCase())}
              placeholder="e.g. sw"
              maxLength={10}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
              style={inputStyle}
            />
            <button
              onClick={handleRegister}
              disabled={isRegistering}
              className="w-full py-3 rounded-xl font-bold"
              style={{ backgroundColor: isRegistering ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isRegistering ? "not-allowed" : "pointer" }}
            >
              {isRegistering ? "Registering…" : "Register language"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 2 — Local Feed Names
// ══════════════════════════════════════════════════════════════════════

function FeedNamesTab({
  countries,
  showSnackbar,
}: {
  countries: CountryRow[];
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [selCountry, setSelCountry] = useState<CountryRow | null>(null);
  const [selLang, setSelLang] = useState<string | null>(null);

  // Default to the first country (and its first local language) as soon as
  // the list loads, so the feed list is visible without an extra tap —
  // only when nothing has been picked yet, so it doesn't clobber the
  // admin's own selection on a later reload.
  useEffect(() => {
    if (selCountry || countries.length === 0) return;
    const first = countries[0];
    setSelCountry(first);
    setSelLang(first.languages.find((g) => g !== "en") ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  const [feeds, setFeeds] = useState<Array<AdminFeedLite & { translation?: FeedTranslation | null }>>([]);
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);

  const [editingFeed, setEditingFeed] = useState<(AdminFeedLite & { translation?: FeedTranslation | null }) | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const localLangs = selCountry ? selCountry.languages.filter((c) => c !== "en") : [];
  const showFeeds = !!selCountry && !!selLang && localLangs.includes(selLang);

  // Fetch every feed for the selected country (list-feeds is paginated,
  // capped at 100/page — walk every page), then hydrate each feed's
  // translation status for the selected language IN PARALLEL. No backend
  // endpoint returns "every feed + translation status" in one call.
  useEffect(() => {
    if (!showFeeds || !selCountry || !selLang) {
      setFeeds([]);
      return;
    }
    let cancelled = false;
    setIsLoadingFeeds(true);
    (async () => {
      const all: AdminFeedLite[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await getAdminFeeds("", page, 100, "", "", selCountry.name, "");
        const data = res.data as { feeds?: AdminFeedLite[]; total_pages?: number };
        all.push(...(data?.feeds ?? []));
        totalPages = data?.total_pages ?? 1;
        page += 1;
      } while (page <= totalPages);
      if (cancelled) return;
      setFeeds(all.map((f) => ({ ...f })));
      const results = await Promise.allSettled(
        all.map((f) => listFeedTranslations(f.feed_id).then((r) => ({
          feed_id: f.feed_id,
          translation: ((r.data as { translations?: FeedTranslation[] })?.translations ?? []).find((t) => t.language === selLang) ?? null,
        })))
      );
      if (cancelled) return;
      const byId = new Map(results.filter((r) => r.status === "fulfilled").map((r) => {
        const v = (r as PromiseFulfilledResult<{ feed_id: string; translation: FeedTranslation | null }>).value;
        return [v.feed_id, v.translation];
      }));
      setFeeds((prev) => prev.map((f) => ({ ...f, translation: byId.get(f.feed_id) ?? null })));
    })()
      .catch(() => { if (!cancelled) showSnackbar("Could not load feeds", "error"); })
      .finally(() => { if (!cancelled) setIsLoadingFeeds(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCountry?.id, selLang, showFeeds]);

  const openFeedEdit = (f: AdminFeedLite & { translation?: FeedTranslation | null }) => {
    setEditingFeed(f);
    setEditValue(f.translation?.name ?? "");
  };

  const handleSaveFeed = async () => {
    if (!editingFeed || !selLang || !editValue.trim()) {
      showSnackbar("Enter a name first", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await upsertFeedTranslation({ feed_id: editingFeed.feed_id, language: selLang, name: editValue.trim() });
      const saved = res.data as FeedTranslation;
      setFeeds((prev) => prev.map((f) => (f.feed_id === editingFeed.feed_id ? { ...f, translation: saved } : f)));
      showSnackbar(`Saved ${editingFeed.fd_name}`, "success");
      setEditingFeed(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save name";
      showSnackbar(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFeed = async () => {
    if (!editingFeed || !selLang) return;
    setIsDeleting(true);
    try {
      await deleteFeedTranslation(editingFeed.feed_id, selLang);
      setFeeds((prev) => prev.map((f) => (f.feed_id === editingFeed.feed_id ? { ...f, translation: null } : f)));
      showSnackbar("Name deleted", "success");
      setEditingFeed(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete name";
      showSnackbar(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!selCountry) return;
    setIsDownloading(true);
    try {
      const res = await downloadTranslationWorkbook(selCountry.id);
      const cdRaw = (res.headers["content-disposition"] || res.headers["Content-Disposition"] || "") as string;
      const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)["']?/i.exec(cdRaw);
      const fileName = cdMatch?.[1] ? decodeURIComponent(cdMatch[1].trim()) : `translations_${selCountry.id}.xlsx`;
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
    if (!selCountry || !uploadFile) {
      showSnackbar("Pick a file to upload", "error");
      return;
    }
    setIsUploading(true);
    setUploadSummary(null);
    try {
      const res = await uploadTranslationWorkbook(selCountry.id, uploadFile);
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

  const doneCount = feeds.filter((f) => f.translation).length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* 1 — Pick a country */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>1 · Pick a country</p>
        </div>
        <div className="flex gap-2 px-4 py-3 overflow-x-auto">
          {countries.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelCountry(c);
                const first = c.languages.find((g) => g !== "en");
                setSelLang(first ?? null);
              }}
              className="flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap"
              style={{
                border: selCountry?.id === c.id ? "1.5px solid #064E3B" : "1.5px solid #DCE0E4",
                backgroundColor: selCountry?.id === c.id ? "#064E3B" : "#FFFFFF",
                color: selCountry?.id === c.id ? "#FFFFFF" : "#231F20",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
              }}
            >
              {c.name}
            </button>
          ))}
          {countries.length === 0 && (
            <p className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>No countries enabled.</p>
          )}
        </div>
      </div>

      {/* 2 — Pick a language */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>2 · Pick a language</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {localLangs.map((code) => (
              <button
                key={code}
                onClick={() => setSelLang(code)}
                className="flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap"
                style={{
                  border: selLang === code ? "1.5px solid #064E3B" : "1.5px solid #DCE0E4",
                  backgroundColor: selLang === code ? "#064E3B" : "#FFFFFF",
                  color: selLang === code ? "#FFFFFF" : "#231F20",
                  fontFamily: "Nunito, sans-serif",
                  cursor: "pointer",
                }}
              >
                {labelForLanguage(code)}
              </button>
            ))}
          </div>
          {selCountry && localLangs.length === 0 && (
            <p className="text-sm mt-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
              No local language is associated with this country yet — associate one on the Countries &amp; Languages screen.
            </p>
          )}
        </div>
      </div>

      {/* 3 — Feed names */}
      {showFeeds && (
        <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
            <p className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              3 · Feed names in {selLang ? labelForLanguage(selLang).toUpperCase() : ""}
            </p>
            {!isLoadingFeeds && <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{doneCount} of {feeds.length} named</p>}
          </div>
          {isLoadingFeeds ? (
            <div>
              {[0, 1, 2, 3, 4].map((i) => <SkeletonFeedRow key={i} />)}
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {feeds.map((f) => (
                <button
                  key={f.feed_id}
                  onClick={() => openFeedEdit(f)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ borderTop: "1px solid #F8FAF9", background: "none", border: "none", cursor: "pointer" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{f.fd_name}</p>
                    {f.translation && (
                      <p className="text-xs truncate" style={{ color: "#1CA069", fontFamily: "Nunito, sans-serif" }}>{f.translation.name}</p>
                    )}
                  </div>
                  {!f.translation && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(255,152,0,0.12)", color: "#B4690E", fontFamily: "Nunito, sans-serif" }}>
                      + Add name
                    </span>
                  )}
                  <span style={{ color: "#6D6D6D" }}>›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk upsert via workbook */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="px-4 py-3" style={{ backgroundColor: "#E4F7EF", borderBottom: "1px solid #F1F5F9" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Bulk upsert via workbook</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
            Export all feed names across languages for {selCountry?.name ?? "the selected country"} as a workbook, edit offline, then import to upsert in bulk.
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleDownload}
              disabled={isDownloading || !selCountry}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ backgroundColor: "transparent", color: "#064E3B", border: "1.5px solid #064E3B", fontFamily: "Nunito, sans-serif", cursor: isDownloading || !selCountry ? "not-allowed" : "pointer", opacity: !selCountry ? 0.5 : 1 }}
            >
              {isDownloading ? "Downloading…" : "↓ Export"}
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || !uploadFile || !selCountry}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ backgroundColor: isUploading || !uploadFile || !selCountry ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isUploading || !uploadFile || !selCountry ? "not-allowed" : "pointer" }}
            >
              {isUploading ? "Uploading…" : "↑ Import"}
            </button>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
            style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          />
          {uploadSummary && (
            <div className="mt-3 rounded-xl px-3 py-3" style={{ backgroundColor: uploadSummary.success === false ? "#FEC5BB" : "#F0FDF4", border: `1px solid ${uploadSummary.success === false ? "rgba(228,74,74,0.25)" : "rgba(5,188,109,0.20)"}` }}>
              <p className="font-bold text-sm mb-1" style={{ color: uploadSummary.success === false ? "#E44A4A" : "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                {uploadSummary.success === false ? "Import failed" : "Import summary"}
              </p>
              <div className="text-xs space-y-0.5" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                <p>Feeds — {uploadSummary.feeds_inserted ?? 0} added · {uploadSummary.feeds_updated ?? 0} updated · {uploadSummary.feeds_skipped ?? 0} unchanged</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feed edit sheet */}
      {editingFeed && selLang && (
        <div className="fixed top-0 h-full z-50 flex flex-col justify-end" style={sheetOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setEditingFeed(null); }}>
          <div className="bg-white rounded-t-2xl px-5 pt-5 pb-8" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex justify-center mb-3"><div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} /></div>
            <p className="text-xs font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{selCountry?.name} · {labelForLanguage(selLang)}</p>
            <h3 className="font-bold mb-4" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 17 }}>{editingFeed.fd_name}</h3>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Name in {labelForLanguage(selLang)}</p>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={`Type the ${labelForLanguage(selLang)} name…`}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-4"
              style={inputStyle}
              autoFocus
            />
            <button
              onClick={handleSaveFeed}
              disabled={isSaving}
              className="w-full py-3 rounded-xl font-bold mb-2"
              style={{ backgroundColor: isSaving ? "#D3D3D3" : "#064E3B", color: "#FFFFFF", border: "none", fontFamily: "Nunito, sans-serif", cursor: isSaving ? "not-allowed" : "pointer" }}
            >
              {isSaving ? "Saving…" : editingFeed.translation ? "Update name" : "Save name"}
            </button>
            {editingFeed.translation && (
              <button
                onClick={handleDeleteFeed}
                disabled={isDeleting}
                className="w-full py-2.5 rounded-xl font-bold"
                style={{ backgroundColor: "transparent", color: "#E44A4A", border: "1.5px solid rgba(228,74,74,0.4)", fontFamily: "Nunito, sans-serif", cursor: isDeleting ? "not-allowed" : "pointer" }}
              >
                {isDeleting ? "Deleting…" : "Delete this name"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
