"use client";

// Admin > Country/Language
// Spec source: RationSmartAdmin.html (interactive prototype) +
// Admin_Country_Language.xlsx (UI action -> endpoint mapping).
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
import { listLanguages, listCountriesWithLanguages } from "@/lib/api";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import { CountriesLanguagesTab } from "@/components/admin/country-language/CountriesLanguagesTab";
import { FeedNamesTab } from "@/components/admin/country-language/FeedNamesTab";
import {
  ConfirmState,
  CountryRow,
  SkeletonCardShell,
  SkeletonCountryRow,
  SkeletonLanguageRow,
  SystemLanguage,
  Tab,
} from "@/components/admin/country-language/shared";
import { useT } from "@/lib/i18n-ui";
import { listFrom } from "@/lib/api-client/normalize";

export default function AdminCountryLanguagePage() {
  const t = useT();
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  // `?tab=feeds` opens the Feed Names tab directly (the retired
  // /admin/translations route redirects there).
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "feeds"
      ? "feeds"
      : "countries"
  );
  const [allLanguages, setAllLanguages] = useState<SystemLanguage[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Shared confirm dialog — both screens funnel through this one piece of
  // state (matching the prototype's confirm1/confirm2, unified here since
  // only one can ever be open at a time).
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  useEscapeKey(!!confirm, () => setConfirm(null));

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/cattle-info");
  }, [user, router]);

  const reload = () => {
    setIsLoading(true);
    void Promise.allSettled([listLanguages(), listCountriesWithLanguages()])
      .then(([langRes, countriesRes]) => {
        if (langRes.status === "fulfilled") {
          setAllLanguages(listFrom<SystemLanguage>(langRes.value.data, "languages"));
        } else {
          showSnackbar(t("Could not load language registry"), "error");
        }
        if (countriesRes.status === "fulfilled") {
          setCountries(listFrom<CountryRow>(countriesRes.value.data, "countries"));
        } else {
          showSnackbar(t("Could not load countries"), "error");
        }
      })
      .finally(() => setIsLoading(false));
  };

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs1 = useLatestRef({ reload });
  useEffect(() => {
    const { reload } = effectInputs1.current;
    if (user?.is_admin) reload();
  }, [user?.is_admin, effectInputs1]);

  const askConfirm = (
    title: string,
    body: string,
    label: string,
    danger: boolean,
    onConfirm: () => void | Promise<void>
  ) => {
    setConfirm({
      title,
      body,
      label,
      danger,
      onConfirm: () => {
        void onConfirm();
        setConfirm(null);
      },
    });
  };

  if (!user?.is_admin) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Country / Language")} onBack={() => router.back()} />

      <div className="px-3 pt-3">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: COLORS.brightGrayNew }}>
          {(
            [
              { key: "countries", label: t("Countries & Languages") },
              { key: "feeds", label: t("Local Feed Names") },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{
                backgroundColor: tab === t.key ? COLORS.darkAquamarineGreen : "transparent",
                color: tab === t.key ? COLORS.white : COLORS.darkAquamarineGreen,
                border: "none",
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
          <SkeletonCardShell title={t("Enabled Countries / Languages")}>
            {[0, 1, 2].map((i) => (
              <SkeletonCountryRow key={i} />
            ))}
          </SkeletonCardShell>
          <SkeletonCardShell title={t("Registered Languages")}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonLanguageRow key={i} />
            ))}
          </SkeletonCardShell>
        </div>
      ) : tab === "countries" ? (
        <CountriesLanguagesTab
          countries={countries}
          allLanguages={allLanguages}
          setCountries={setCountries}
          setAllLanguages={setAllLanguages}
          showSnackbar={showSnackbar}
          askConfirm={askConfirm}
        />
      ) : (
        <FeedNamesTab countries={countries} showSnackbar={showSnackbar} />
      )}

      {confirm && (
        <div
          className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
          style={{
            left: COLUMN_LEFT,
            width: COLUMN_WIDTH,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl w-full px-5 py-5"
            style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
          >
            <p className="font-bold mb-2" style={{ color: COLORS.raisinBlack, fontSize: 15 }}>
              {confirm.title}
            </p>
            <p className="text-sm mb-4" style={{ color: COLORS.darkSilver, lineHeight: 1.5 }}>
              {confirm.body}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: "transparent",
                  color: COLORS.darkAquamarineGreen,
                  border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
                  cursor: "pointer",
                }}
              >
                {t("Cancel")}
              </button>
              <button
                onClick={confirm.onConfirm}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{
                  backgroundColor: confirm.danger ? COLORS.carminePink : COLORS.darkAquamarineGreen,
                  color: COLORS.white,
                  border: "none",
                  cursor: "pointer",
                }}
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
