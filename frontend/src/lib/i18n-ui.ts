// UI-label translation (screen text — buttons, headings, static copy).
// Separate from i18n V2 (api.ts) which only translates feed-data
// (feed names/types/categories) via the backend. There is no backend
// endpoint for UI-label translation — checked the live swagger
// (<DEV_BACKEND_IP>:8000/openapi.json) on 2026-07-13; every /v1/admin/translations/*
// route is scoped to a feed_id. The only source for these strings is
// docs/RationSmart_i18n_source.xlsx (554 rows, 9 locales). The ACTIVE
// language is whatever is already persisted at user.preferred_language
// (same field store.ts already documents as "used for label lookup"),
// carried over by Zustand's existing persist middleware.
//
// Bundle-size note: the xlsx converts to ~270KB combined across all 9
// languages. Bundling that statically added ~74KB to a single page's
// First Load JS in testing (see git history around 2026-07-13) — most
// users only ever need ONE language, so it's split into 9 per-language
// flat JSON files (src/lib/data/ui-labels/<code>.json, ~30-50KB each)
// and lazy-loaded via dynamic import() only when preferred_language
// isn't "en". English users never download any of it.
//
// Regenerating the dictionary: re-run the conversion script (see the
// commit that introduced this file) against an updated
// docs/RationSmart_i18n_source.xlsx and overwrite the 9 files under
// src/lib/data/ui-labels/. Keys are the exact English source string
// (there is no separate key column in the sheet), so a changed English
// string needs its row's key updated too or the lookup silently misses
// and falls back to English.

import { useEffect, useState } from "react";
import { useStore } from "./store";

// Matches the rollout locale set already used for feed-data i18n
// (see LANGUAGE_NATIVE_LABELS in api.ts) minus "en" and "sw" — neither
// appears as a translated column in the source sheet.
export type UiLangCode = "hi" | "tl" | "id" | "th" | "vi" | "bn" | "ne" | "am" | "om";

const UI_LANG_CODES: readonly UiLangCode[] = ["hi", "tl", "id", "th", "vi", "bn", "ne", "am", "om"];

function isUiLangCode(lang: string): lang is UiLangCode {
  return (UI_LANG_CODES as readonly string[]).includes(lang);
}

type LangDict = Record<string, string>;

// Per-language loaders — one dynamic import() per code so webpack emits
// a separate chunk per language instead of one combined bundle.
const LANG_LOADERS: Record<UiLangCode, () => Promise<{ default: LangDict }>> = {
  hi: () => import("./data/ui-labels/hi.json"),
  tl: () => import("./data/ui-labels/tl.json"),
  id: () => import("./data/ui-labels/id.json"),
  th: () => import("./data/ui-labels/th.json"),
  vi: () => import("./data/ui-labels/vi.json"),
  bn: () => import("./data/ui-labels/bn.json"),
  ne: () => import("./data/ui-labels/ne.json"),
  am: () => import("./data/ui-labels/am.json"),
  om: () => import("./data/ui-labels/om.json"),
};

// Module-level cache — once a language is loaded during a session,
// every component reuses the same dictionary + in-flight promise
// instead of re-importing it per component.
const dictCache = new Map<UiLangCode, LangDict>();
const loadingPromises = new Map<UiLangCode, Promise<LangDict>>();

function loadDict(lang: UiLangCode): Promise<LangDict> {
  const cached = dictCache.get(lang);
  if (cached) return Promise.resolve(cached);
  let promise = loadingPromises.get(lang);
  if (!promise) {
    promise = LANG_LOADERS[lang]().then((mod) => {
      dictCache.set(lang, mod.default);
      return mod.default;
    });
    loadingPromises.set(lang, promise);
  }
  return promise;
}

/**
 * Synchronous lookup — translates `source` (the exact English string as
 * it appears in the sheet) into `lang`, using ONLY whatever is already
 * loaded in the in-memory cache. Falls back to `source` itself when the
 * language is "en", isn't a known rollout code, hasn't finished loading
 * yet, or the string isn't in the dictionary — so an untranslated,
 * unknown, or not-yet-loaded string never renders blank. Components
 * should use `useT()` instead, which also triggers the load.
 */
export function getUiLabel(source: string, lang: string): string {
  if (!source || lang === "en" || !isUiLangCode(lang)) return source;
  const dict = dictCache.get(lang);
  if (!dict) return source;
  return dict[source] ?? source;
}

/**
 * Component hook — returns a `t(source)` function bound to the user's
 * current preferred_language by default. Triggers the lazy per-language
 * import on first use of a non-English language (cached for the rest of
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
  const userLang = useStore((s) => (s.user ? (s.user.preferred_language || "en") : (s.lastUiLanguage ?? "en")));
  const lang = langOverride ?? userLang;
  const [, setLoadedTick] = useState(0);

  useEffect(() => {
    if (lang === "en" || !isUiLangCode(lang) || dictCache.has(lang)) return;
    let cancelled = false;
    loadDict(lang).then(() => {
      if (!cancelled) setLoadedTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (source: string) => getUiLabel(source, lang);
}
