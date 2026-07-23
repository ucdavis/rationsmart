# UI Labels Internationalization — Architecture Options

**Status:** Decision document for team review
**Author:** Frontend (RationSmart PWA, testing branch)
**Date:** 2026-06-30
**Branch:** `testing` → https://rationsmart-testing.vercel.app
**Audience:** Backend lead, frontend lead, product, translators

---

## 1. Executive Summary

This document compares three architectural options for translating **UI
labels** (button text, headings, validation messages, snackbars) in the
RationSmart PWA. Feed-data translation (feed names, types, categories)
is already shipped and is **not** the subject of this document.

**Recommendation:** **Option C — Bulk fetch on login + cache in
localStorage with bundled English fallback.** This delivers the best
trade-off between translator autonomy (no engineering involvement for
copy changes), runtime performance (synchronous, sub-millisecond
lookups), and PWA fitness (works offline, survives reloads).

The rest of this document explains the problem, presents three options
with concrete pros and cons, deep-dives into how localStorage actually
works (because that's a common source of confusion for teams coming
from native mobile), and lays out a migration plan.

---

## 2. The Problem

The PWA currently has all UI labels hardcoded in `.tsx` files in
English. Examples:

```tsx
<button>Save Changes</button>
<p>Animal Characteristics</p>
showSnackbar("Profile updated!", "success");
```

To support languages beyond English (Hindi, Filipino, Indonesian,
Thai, Vietnamese, Bengali, Nepali, Amharic, Oromo — the rollout set),
every one of these strings needs to be:

1. **Externalised** — replaced with a key like `t("profile.save")`
2. **Translated** — translators provide the target-language values
3. **Loaded** — the running app gets the right value for the user's
   chosen language
4. **Updatable** — when copy changes, the new value reaches users without
   breaking anything

---

## 3. Two Distinct Concerns — Don't Conflate Them

This is the first thing that gets teams stuck. There are **two
different i18n problems** and they need different solutions:

| | Data i18n | Label i18n |
|---|---|---|
| **What it is** | Feed names, types, categories — values stored in the database that vary per feed row | UI text — button labels, headings, validation messages, error strings |
| **Where it lives today** | DB tables (`fd_name`, `fd_type`, `fd_category`) | Source code (`.tsx`/`.ts` files) |
| **Who edits it** | Admins via `/admin/translations` workbook upload | Engineers (currently); translators (after this change) |
| **How many strings** | ~hundreds (one per feed × N languages) | ~thousands (every visible string × N languages) |
| **Status** | ✅ **Shipped** — `?lang=` on every animal/* call, server returns `display_*` fields | ❌ **Not done** — this document is about this half |

For the **data** half, the question is settled — the backend translates
DB rows server-side and the frontend renders `display_*` fields. No
client-side work beyond what's already done.

The **label** half is what we're choosing an architecture for. The
three options below all assume the data side is fixed.

---

## 4. Option A — Bundled at Build Time

### What it is

Every language's label set lives inside the app bundle as a JSON file.
The PWA reads them locally. Libraries: `next-intl`, `react-i18next`,
`@formatjs/intl`.

### File layout

```
src/locales/
  en.json     ← source of truth, edited by engineers
  hi.json     ← translator copy
  vi.json
  th.json
  ...
```

```json
// hi.json
{
  "profile.save": "सहेजें",
  "profile.cancel": "रद्द करें",
  "feed.add": "फ़ीड जोड़ें",
  ...
}
```

### How the app uses them

```tsx
import { useTranslations } from "next-intl";

function ProfilePage() {
  const t = useTranslations();
  return <button>{t("profile.save")}</button>;
}
```

The bundler ships every locale's JSON inside the build artifact. When
the user picks a language, the app reads from the in-memory JSON for
that language. Zero network calls.

### Trade-offs

**Pros**
- Fastest possible (in-memory lookup, microseconds)
- Works offline by default — no API to call
- Predictable — no race conditions, no stale-cache invalidation
- Type-safe — keys can be codegen'd from the English JSON
- Battle-tested ecosystem (`next-intl` is the canonical Next.js choice)

**Cons**
- **Every copy change requires a code commit + Vercel deploy**
- Translators must hand JSON files to engineers, who then commit them
- A typo fix takes 30 minutes (PR + review + deploy) instead of 30
  seconds
- Bundle size grows linearly with languages (~50KB per language —
  manageable but not free on slow networks)
- A/B testing copy is impossible without a deploy

### When this is the right choice

Pick Option A if:
- Your translations are static (e.g. set once before launch, rarely
  changed)
- You have few languages (≤3)
- Engineering owns copy decisions and translators submit changes via
  PR, not a CMS
- You want the absolute minimum complexity

For RationSmart this is a poor fit because:
- 9+ languages planned, more likely later
- Translators (regional partners) are not engineers and don't use Git
- Copy changes will be frequent during early rollout (regional pilots
  reveal weird phrasings)
- We already built `/admin/translations` for backend-managed feed
  translations — UI labels following the same model is a consistent
  team story

---

## 5. Option B — Per-Screen Backend API

### What it is

Each screen fetches its own labels from the backend on mount.

```
GET /v1/i18n/labels?screen=login&lang=hi
→ { "login.title": "लॉग इन करें", "login.email": "ईमेल", ... }
```

The screen waits for the response before rendering — or renders a
skeleton until labels arrive.

### Trade-offs

**Pros**
- Translators push changes without redeploy (good!)
- Each screen's label payload is small

**Cons**
- **N network calls per session** (one per screen visited)
- Visible flicker / skeleton on every screen transition while labels
  load
- Useless on bad networks — users on 2G/3G see the labels loader on
  every screen
- Adds latency to every screen-change interaction
- Needs per-screen caching anyway to avoid refetching (which is
  basically Option C, but worse)
- Increases backend load — N requests instead of 1 per session
- Hard to keep label keys consistent if they're partitioned by screen
  (the same "Save" button might exist on 4 screens)

### When this is the right choice

**Rarely.** The only case is a giant app with hundreds of screens
where loading all labels at once would be a megabyte download. The
RationSmart label set is on the order of 50KB per language — far too
small to need this kind of partitioning.

For RationSmart: **don't pick this**. It's the worst of three because
it loses the offline guarantee of Option A AND the single-fetch
efficiency of Option C, while inheriting the translator-autonomy of
Option C.

---

## 6. Option C — Bulk Fetch + Cache in localStorage (Recommended)

### What it is

One API call after login. Cache the entire label dictionary in
localStorage. From that point onward, every read is local and
synchronous. Bundled English keys provide a fallback if the cache is
empty or stale.

### Endpoint

```
GET /v1/i18n/labels?lang=hi
→ {
    version: 47,
    labels: {
      "profile.save": "सहेजें",
      "profile.cancel": "रद्द करें",
      "feed.add": "फ़ीड जोड़ें",
      ...
    }
  }
```

### Flow diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User logs in / changes language in Profile                  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend fires GET /v1/i18n/labels?lang=<code>              │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend returns { version: 47, labels: {...} }              │
│ — Workbox SW caches the HTTP response for offline           │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend writes JSON.stringify(payload) to                  │
│ localStorage["rationsmart-labels-hi"]                       │
│ — Zustand store also holds an in-memory mirror              │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Every t("profile.save") call reads from the in-memory       │
│ map — sub-microsecond, zero network                         │
└─────────────────────────────────────────────────────────────┘

On subsequent app launches:
┌─────────────────────────────────────────────────────────────┐
│ App boot                                                     │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Read localStorage["rationsmart-labels-hi"] synchronously    │
│ — Hot path; no skeleton, no flicker                         │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Background fetch /v1/i18n/labels?lang=hi                    │
│ — Compare server.version to cached.version                  │
│ — If server is newer, overwrite cache; reload labels        │
│ — UI updates without page reload                            │
└─────────────────────────────────────────────────────────────┘
```

### Bundled English fallback

The English label set lives inside the app bundle. Every `t(key)` call
falls through to it if the runtime cache doesn't have the key:

```ts
// src/lib/i18n.ts
import enBundle from "@/locales/en";

let runtimeLabels: Record<string, string> = {};

export function t(key: string): string {
  return runtimeLabels[key] ?? enBundle[key] ?? key;
}
```

This guarantees:
- The app **never** shows raw `profile.save` keys to users
- If the cache is empty (first run, cleared, evicted), English appears
- If the backend is down on first launch, English appears
- New keys added in code work immediately (they show English until
  translators provide values)

### Trade-offs

**Pros**
- **Translators push changes without engineering** — admin UI updates
  the DB; users see new labels on next launch
- **One network call per language per session** — minimal backend load
- **Synchronous lookup at runtime** — no flicker, no Promises, just
  string returns
- **Works offline** — localStorage reads work without network; Workbox
  caches the API response too
- **Survives reloads, browser closes, PWA reinstalls**
- **English fallback** — the app degrades gracefully under every
  failure mode
- **Cache size is tiny** (~30–60 KB per language vs. ~5 MB localStorage
  limit)
- **Same operational model as feed-data translation** — translators
  use the same `/admin/translations` workflow

**Cons**
- **First login adds ~200–500 ms** for the initial label fetch (one
  time per language per device)
- **Slightly more code than Option A** — needs cache invalidation
  logic, fallback wiring, store integration
- **Cache invalidation is a real problem** — see §8 for the strategy

### Cost vs. benefit

This is the right pick for RationSmart because:
- We've already chosen backend-managed translations for data
- We've already built `/admin/translations` for translator workflows
- 9+ languages, frequent copy iteration during regional pilots
- The PWA already uses localStorage everywhere (Zustand persist) so
  the team is on familiar ground

---

## 7. Side-by-Side Comparison

| Capability | A: Bundled | B: Per-screen | C: Bulk + cache (recommended) |
|---|:---:|:---:|:---:|
| Translators edit without redeploy | ❌ | ✅ | ✅ |
| Synchronous lookup at runtime | ✅ | ❌ | ✅ |
| Works offline | ✅ | ❌ | ✅ |
| Network calls per session | 0 | N (screens) | 1 |
| First-load latency | None | Per-screen | Once on login |
| Bundle size impact | +50 KB per language | None | None (bundled English only) |
| Failure mode (server down) | Works | Broken UI | Falls back to English |
| Cache invalidation complexity | None | Medium | Medium (version field) |
| Type-safe keys | Yes (codegen) | Yes | Yes |
| Suits flaky-network users | ✅ | ❌ | ✅ |
| Backend changes needed | None | 1 endpoint + per-screen partitioning | 1 endpoint |

---

## 8. Deep Dive — How localStorage Actually Works

This section exists because teams coming from native mobile (Android
SharedPreferences, iOS UserDefaults) often have a slightly wrong mental
model of localStorage. Get this right and the cache design is obvious.

### What it is at the JS level

A synchronous string-only key-value store provided by every browser.

```js
localStorage.setItem("foo", "bar");        // write
const v = localStorage.getItem("foo");     // read → "bar"
localStorage.removeItem("foo");            // delete one key
localStorage.clear();                      // wipe everything for this origin
```

Both reads and writes are **synchronous** — no callback, no Promise. A
read of a small value (<10 KB) takes microseconds.

### Where the data physically lives

The browser stores it on disk in its own user-data directory:

| Browser | Path |
|---|---|
| Chrome (Mac) | `~/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb/` |
| Chrome (Linux) | `~/.config/google-chrome/Default/Local Storage/leveldb/` |
| Chrome (Windows) | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Storage\leveldb\` |
| Safari (Mac) | inside Safari's WebKit storage container |
| iOS (PWA) | inside the WKWebView storage container for that origin |

Internally it's a LevelDB database (Chrome) or SQLite (Safari),
organized by **origin** = scheme + host + port. So
`https://rationsmart.vercel.app` and `https://rationsmart-testing.vercel.app`
have **completely separate** stores. Same browser, different stores.

### How it differs from Android SharedPreferences

This is where native-mobile intuition breaks:

| Property | SharedPreferences (Android) | localStorage (Browser/PWA) |
|---|---|---|
| Tied to | App's UID (package name) | Origin (URL) |
| Lives in | `/data/data/<package>/shared_prefs/` | Browser's user-data dir |
| Survives app/PWA uninstall | ❌ Wiped on uninstall | ✅ Survives — data lives in the browser, not the PWA shortcut |
| Survives "Clear browsing data" | n/a | ❌ Wiped |
| Survives incognito tab close | n/a | ❌ Incognito starts empty, lost on tab close |
| Per-user device account | Yes | Yes (per browser profile) |
| Encrypted at rest | No (unless EncryptedSharedPreferences) | No |
| Size limit | ~unlimited | ~5–10 MB per origin (browser-dependent) |
| Cross-origin access | Same app only | Same origin only — `rationsmart.vercel.app` cannot read `bank.com` |
| API style | Async (`apply()`) or sync (`commit()`) | Always synchronous |

**Big gotcha for PWAs:** when a user installs the PWA via Add to Home
Screen, the home-screen icon is just a shortcut that opens the same
URL. The localStorage for that URL is shared with the regular browser
tab. **Uninstalling the PWA shortcut does NOT clear localStorage.**

In the RationSmart codebase there's already a workaround for this in
`src/components/InstallPrompt.tsx`:

```ts
// listens for `appinstalled` (Chrome's post-install event) and
// localStorage.removeItem("rationsmart-storage") so a freshly-installed
// PWA always opens to login.
```

That code exists specifically because installing a PWA doesn't grant
a fresh storage area — the data lives in the browser, not the
shortcut.

### Storage layers in a browser (for context)

localStorage isn't the only client-side storage. The browser offers:

| Storage | Sync? | Size limit | Persistence | Use case |
|---|---|---|---|---|
| **localStorage** | Sync | 5–10 MB | Until cleared | Small string KV (this proposal uses it) |
| **sessionStorage** | Sync | 5–10 MB | Per tab, lost on close | Per-tab state |
| **IndexedDB** | Async | GBs | Until cleared | Large structured data, blobs |
| **Cache Storage** | Async | Variable | Until cleared | Service-worker HTTP cache (Workbox uses this) |
| **Cookies** | Sync | ~4 KB | Configurable | Server-readable, auth tokens (when needed by the server) |

For UI labels (~30–60 KB per language, JSON-serializable, non-secret,
infrequent writes): **localStorage is the right fit.** It's small
enough to fit comfortably, the synchronous API means no flicker on
first paint, and the dataset is too small to need IndexedDB's
complexity.

### What's already in localStorage in RationSmart today

Open the deployed app, then DevTools → Application → Storage → Local
Storage → your origin. You'll see:

```
rationsmart-storage  →  { user, cattleInfo, feedSelections, ... }   (Zustand persist)
user_id              →  "abc-123..."                                 (Android-parity vestige)
```

The Zustand `persist` middleware is already using localStorage for the
entire app state (see `src/lib/store.ts`). The labels cache is a small,
additive sibling — same mechanism, separate key.

### When does the cache get wiped

Plan for these because they happen:

| Trigger | Frequency |
|---|---|
| User: "Clear browsing data" in browser settings | Rare but real |
| User uninstalls and reinstalls Chrome | Rare |
| iOS Safari aggressive cache eviction under storage pressure | Occasional, can't be predicted |
| Your own JS calls `localStorage.clear()` (e.g. logout flow) | Whenever logout runs |
| A bug in your code | Avoid by writing tests |
| Cross-device — user logs in on a new phone | Every new device |

The bundled English fallback (§6) handles all of these gracefully —
the app still renders, just in English, until the next backend fetch
populates the cache.

### Security considerations

localStorage is **plain-text on disk** and readable by any JavaScript
on the same origin (so XSS = full read). This matters for:
- **PINs, passwords, full PII** → don't put them in localStorage
- **JWT tokens** → currently stored there (standard practice but is an
  XSS attack surface; same trade-off as SharedPreferences without
  `EncryptedSharedPreferences`)
- **UI labels** → not sensitive, safe to cache

For labels specifically: there is no security issue. They're public
strings that any unauthenticated viewer could read anyway.

### Quotas — what happens when full

If your origin hits the ~5 MB limit, `setItem()` throws
`QuotaExceededError`. The label cache is at most ~60 KB per language
× ~10 languages = ~600 KB, well under the limit. The existing Zustand
persist blob is ~5–20 KB. There's no realistic risk of hitting the
quota for this use case.

If we ever did need more, we'd move to **IndexedDB** (which supports
gigabytes), but the API is async and more complex — not worth the
complexity for our label payload size.

---

## 9. Recommendation — Option C

**Ship Option C: bulk fetch on login + localStorage cache + bundled
English fallback.**

Justification:
1. Translators get autonomy without engineering involvement
2. Performance is the same as Option A after the first fetch
3. Offline works due to localStorage + Workbox
4. Operational model matches feed-data translation (already shipped)
5. Failure modes degrade gracefully to English
6. Implementation is incremental — labels can be migrated screen by
   screen without breaking the rest of the app

---

## 10. Implementation Plan

### 10.1 Backend deliverables

| Item | Owner | Notes |
|---|---|---|
| DB table `ui_labels(id, key, lang_code, value, updated_at)` | Backend | Add `version` integer at the table level OR compute `MAX(updated_at)` as version |
| `GET /v1/i18n/labels?lang=<code>` | Backend | Returns `{ version, labels: { key: value, ... } }`; English (`lang=en`) returns an empty object or the source set |
| Admin extension: add UI labels sheet to `/admin/translations` workbook | Backend + Frontend | Same upload/download pattern as feed translations |
| Optional: `PATCH /v1/admin/i18n/labels/{key}` per-row editor | Backend | Nice-to-have for typo fixes without re-uploading the whole workbook |

### 10.2 Frontend deliverables

| Item | Effort | Notes |
|---|---|---|
| `src/lib/i18n.ts` — `t(key)` function, runtime map, English fallback | 0.5 day | Sync lookup |
| `src/locales/en.ts` — bundled English source-of-truth | 1 day (initial) | Grows as keys are added |
| Zustand slice: `labels`, `labelsVersion`, `loadLabels(lang)` action | 0.5 day | Reads from localStorage on init, fires backend fetch, updates on success |
| `useEffect` in `(main)/layout.tsx` calling `loadLabels` on mount + on `preferred_language` change | 0.25 day | |
| `(main)/layout.tsx` cache-rehydration on app start | 0.25 day | Read localStorage synchronously before first paint |
| Replace hardcoded strings with `t("...")` — screen by screen | 3–5 days | Incremental; one screen per PR |

**Total: ~6–8 days frontend, ~2–3 days backend.**

### 10.3 Migration strategy

Do **not** big-bang. Migrate screen by screen:

1. Land the `t()` plumbing and the empty English bundle (no UI
   changes; all hardcoded strings still work)
2. Pick one low-risk screen (e.g. `/welcome`, `/login`)
3. Extract every hardcoded string in that screen into the English
   bundle and switch to `t("welcome.title")` etc.
4. Add translations for that screen's keys to the rollout languages
5. Smoke-test the screen in 2–3 languages
6. Repeat for the next screen

This keeps PRs small, reviewable, and reversible. If a screen breaks,
revert just that screen — the rest of the app is unaffected.

### 10.4 Cache invalidation strategy

Two-tier:

1. **Version-based:** server returns a `version` integer. Client
   compares to cached version on every background refresh. If newer,
   replace cache.
2. **TTL-based fallback:** if `fetchedAt` is older than 24 hours,
   await the fetch on next screen mount instead of using stale cache.

The 24h TTL is a backstop — version comparison should normally
trigger updates within seconds.

### 10.5 What NOT to do

- ❌ Don't translate validation messages from the backend. They run
  before the API call — they need to be in the synchronous label cache
  or the English fallback. Always.
- ❌ Don't put label keys in URLs. Keys are stable English identifiers
  (`profile.save`); user-visible URLs should not contain them.
- ❌ Don't try to translate the keys themselves. Translators only
  edit `value` columns. `key` is an engineering contract.
- ❌ Don't store labels in IndexedDB. localStorage is simpler, faster,
  and the dataset is small enough.
- ❌ Don't fetch labels on every screen. One bulk fetch per
  language per session is the model.

---

## 11. Open Questions for the Team

These need decisions before implementation starts:

1. **Source-of-truth language for keys** — English (`profile.save`)?
   Or domain-meaningful keys (`save_profile`)? Either works; consistent
   naming matters more than the choice.
2. **Plural / interpolation handling** — does the label set need
   ICU MessageFormat (`{count, plural, one {1 feed} other {{count} feeds}}`)?
   Or simple `{placeholder}` substitution? Most i18n libraries support
   both. Start with simple substitution; upgrade if needed.
3. **Right-to-left languages** — none in the current rollout (Amharic
   is LTR). If Arabic/Urdu enter the roadmap, we'll need a separate
   RTL story (CSS `dir="rtl"`, mirrored icons). Out of scope for this
   doc.
4. **Date / number formatting** — currently currency is rendered as a
   raw code suffix (e.g. `108.5 VND`), per the established convention
   (CLAUDE.md §3.4). Should dates/numbers be locale-aware? Probably
   not in v1 — keep that orthogonal to the label work.
5. **Translation workflow ownership** — who owns the source English
   strings? Frontend engineering? Product? Whoever owns the bundle
   determines who can add new keys.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **i18n** | Internationalization (the "i" + 18 letters + "n"). The engineering work of making an app translatable. |
| **l10n** | Localization. The translation work itself, done by translators. |
| **Locale** | A specific language + region, e.g. `en-US`, `hi-IN`. We use language codes only (no region) for now. |
| **BCP 47** | The IETF standard for language tags (`hi`, `vi`, `am`, `zh-Hant`). What the `?lang=` query param uses. |
| **Fallback chain** | What happens when a translation is missing: try the cache → try English bundle → return the key. |
| **localStorage** | A browser-provided synchronous key-value store on disk, scoped to the origin (URL). |
| **IndexedDB** | A browser-provided async structured database. We do NOT use it for labels — see §8. |
| **Service Worker / Workbox** | The PWA's background script. Caches HTTP responses (including the labels API response) for offline use. |
| **PWA** | Progressive Web App. A website that can be installed to the home screen and runs offline. |

---

## 13. Appendix — Reference Endpoint Shape

```http
GET /v1/i18n/labels?lang=hi
Authorization: Bearer <JWT>

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=300

{
  "version": 47,
  "lang": "hi",
  "fetched_at": "2026-06-30T08:00:00Z",
  "labels": {
    "common.save": "सहेजें",
    "common.cancel": "रद्द करें",
    "common.delete": "हटाएं",
    "profile.title": "आपकी प्रोफाइल",
    "profile.update": "प्रोफाइल अपडेट करें",
    "feed.add": "फ़ीड जोड़ें",
    "feed.delete_confirm": "क्या आप वाकई इस फ़ीड को हटाना चाहते हैं?",
    "validation.body_weight_range": "बॉडी वेट 350 से 720 के बीच होना चाहिए",
    ...
  }
}
```

When `lang=en` (or unsupported language), return either an empty
`labels: {}` (frontend uses bundled English) or the full English set
(useful if backend wants to be source-of-truth for English too).

Error response if `lang` is invalid:
```json
HTTP/1.1 400 Bad Request
{ "detail": "Unsupported language code: zz" }
```

---

**End of document.** Direct questions or feedback to the frontend lead.
