// UI-label translation (screen text — buttons, headings, static copy).
// Separate from i18n V2 (api.ts) which only translates feed-data
// (feed names/types/categories) via the backend. There is no backend
// endpoint for UI-label translation — checked the live swagger
// (dev backend /openapi.json) on 2026-07-13; every /v1/admin/translations/*
// route is scoped to a feed_id. The ACTIVE language is whatever is already
// persisted at user.preferred_language (same field store.ts already documents
// as "used for label lookup"), carried over by Zustand's persist middleware.
//
// Where the strings live: src/lib/data/ui-labels.xlsx — column A is the
// English text, then one column per language whose header ends in its code,
// "Hindi (hi)" (CLAUDE.md §21). The frontend server turns each column into
// /api/ui-labels/<code> at build time (src/app/api/ui-labels/[lang]/route.ts),
// so a new column is a new language with no code change here.
//
// Bundle-size note: most users only ever need ONE language, so each one is
// fetched on demand (~30-50KB) only when the language isn't "en" — English
// users never download any of it, and nobody downloads the spreadsheet.
//
// Editing translations: keys are the exact English source string, so a
// changed English string in the code needs column A of its row changed in
// the spreadsheet too — otherwise the lookup silently misses and falls back
// to English.

import { createElement, Fragment, useEffect, useState, type ReactNode } from "react";
import { useStore } from "./store";

type LangDict = Record<string, string>;

// Same shape the route serves; anything else is never requested.
const isLabelLangCode = (lang: string) => /^[a-z]{2,3}$/.test(lang);

function fetchDict(lang: string): Promise<LangDict> {
  return fetch(`/api/ui-labels/${lang}`, { credentials: "same-origin" }).then((res) => {
    // No column for this language in the sheet: English, and don't ask again.
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`UI labels for ${lang}: HTTP ${res.status}`);
    return res.json() as Promise<LangDict>;
  });
}

// Module-level cache — once a language is loaded during a session,
// every component reuses the same dictionary + in-flight promise
// instead of re-fetching it per component.
const dictCache = new Map<string, LangDict>();
const loadingPromises = new Map<string, Promise<LangDict>>();

function loadDict(lang: string): Promise<LangDict> {
  const cached = dictCache.get(lang);
  if (cached) return Promise.resolve(cached);
  let promise = loadingPromises.get(lang);
  if (!promise) {
    promise = fetchDict(lang).then(
      (dict) => {
        dictCache.set(lang, dict);
        return dict;
      },
      (err) => {
        // A failed load (flaky network) must not be cached as a
        // rejected promise forever — drop it so the next render retries.
        loadingPromises.delete(lang);
        throw err;
      }
    );
    loadingPromises.set(lang, promise);
  }
  return promise;
}

/**
 * Synchronous lookup — translates `source` (the exact English string as
 * it appears in the sheet) into `lang`, using ONLY whatever is already
 * loaded in the in-memory cache. Falls back to `source` itself when the
 * language is "en", isn't a language code, hasn't finished loading
 * yet, or the string isn't in the dictionary — so an untranslated,
 * unknown, or not-yet-loaded string never renders blank. Components
 * should use `useT()` instead, which also triggers the load.
 */
export function getUiLabel(source: string, lang: string): string {
  if (!source || lang === "en" || !isLabelLangCode(lang)) return source;
  const dict = dictCache.get(lang);
  if (!dict) return source;
  return dict[source] ?? source;
}

/**
 * Component hook — returns a `t(source)` function bound to the user's
 * current preferred_language by default. Triggers the lazy per-language
 * fetch on first use of a non-English language (cached for the rest of
 * the session) and re-renders the caller once it resolves. Falls back
 * to "en" (English source unchanged) when there's no signed-in user yet
 * (pre-login screens), matching every other i18n V2 fallback chain.
 *
 * `langOverride` — pass an explicit language code to resolve against
 * INSTEAD of user.preferred_language. This exists for the
 * cattle-info → feed-selection → report flow, which — per explicit
 * product decision — uses its OWN per-simulation language selection
 * (cattleInfo.simulation_language), not the profile-wide preference,
 * mirroring the exact priority chain store.ts's langProvider already
 * uses for feed-data i18n (simulation_language ?? preferred_language ??
 * "en"). cattle-info's own screen additionally needs this to react
 * LIVE to the language dropdown before the user clicks Continue — pass
 * the form's local pending selection there instead of the committed
 * store value. Every other screen calls `useT()` with no argument.
 */
export function useT(langOverride?: string): (source: string) => string {
  // Bug fixed 2026-07-13: this used to be a single chain —
  // `s.user?.preferred_language ?? s.lastUiLanguage ?? "en"` — which
  // ALSO fell through to lastUiLanguage whenever a SIGNED-IN user's
  // preferred_language was falsy (empty/null/undefined), not just when
  // user itself was null. lastUiLanguage is a device-level value that
  // persists independently across sessions/accounts, so a user who once
  // used Hindi on this device would see every other screen render in
  // Hindi even with an English (or unset) profile language — while the
  // Profile page's own local `user?.preferred_language ?? "en"` fallback
  // masked the same falsy value as "English", making it look correct
  // there. lastUiLanguage must ONLY apply post-logout (user === null);
  // a signed-in user's own falsy preference should resolve straight to
  // "en", never borrow the device's last-used language.
  const userLang = useStore((s) =>
    s.user ? s.user.preferred_language || "en" : (s.lastUiLanguage ?? "en")
  );
  const lang = langOverride ?? userLang;
  const [, setLoadedTick] = useState(0);

  useEffect(() => {
    if (lang === "en" || !isLabelLangCode(lang) || dictCache.has(lang)) return;
    let cancelled = false;
    loadDict(lang)
      .then(() => {
        if (!cancelled) setLoadedTick((n) => n + 1);
      })
      .catch(() => {
        // Labels stay in English until a later render retries the load.
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (source: string) => getUiLabel(source, lang);
}

// Fill a translated template's `${name}` slots. Whole sentences are translated
// with their slots in place — never glue translated fragments around a value,
// because word order differs between languages ("Export … for ${country} as a
// workbook" reads backwards in Hindi if split). Unknown slots are left as-is.
const SLOT = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function fillText(template: string, values: Record<string, string | number>): string {
  return template.replace(SLOT, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  );
}

// Same, but a slot may be a React node (e.g. a bold user name inside a
// confirmation sentence).
export function fillTemplate(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\$\{[A-Za-z_][A-Za-z0-9_]*\})/).map((part, i) => {
    const name = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(part)?.[1];
    return name !== undefined && name in values
      ? createElement(Fragment, { key: i }, values[name])
      : part;
  });
}
