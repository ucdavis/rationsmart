# RationSmart PWA — Claude Code Context

Auto-loaded by every Claude Code session that starts in this directory. Read top
to bottom before editing — this file exists specifically to prevent regression,
theme drift, and Android-parity slips between sessions.

---

## 1. What this project is

A Next.js 14 App Router PWA that mirrors the existing Android **RationSmart**
cattle-feed formulation app pixel-for-pixel and behaviour-for-behaviour. The
Android source lives at:

```
~/AndroidStudioProjects/feed-formulation-frontend
```

The user has explicitly flagged sessions where the assistant guessed at Android
behaviour instead of reading the source ("you did not check Android code at
all", "why are you not analzying"). The rule is: **read the Android XML layout
or Kotlin source first, then implement against it.** Never guess.

- GitHub repo: https://github.com/Aiyappa-DigitalGreen/RationSmart
- Backend dev: `<DEV_BACKEND_IP>:8000` (FastAPI)
- Backend prod: `<PROD_BACKEND_IP>:8000` (FastAPI)

---

## 2. Two-URL deployment topology — do not confuse

There are **two independent Vercel projects** pointing at the same GitHub
repo. Every push to `main` deploys BOTH in parallel.

| Vercel project | Public URL | Backend env vars | Purpose |
|---|---|---|---|
| `rationsmart-pwa` | https://rationsmart-pwa.vercel.app | `BACKEND_HOST=<DEV_BACKEND_IP>`, `BACKEND_PORT=8000` | Dev / internal testing |
| `rationsmart-prod` | https://rationsmart.vercel.app | `BACKEND_HOST=<PROD_BACKEND_IP>`, `BACKEND_PORT=8000` | Prod / share-with-others |

The active backend is debug-visible on every proxied response via
`x-backend-env: dev|prod|custom` and `x-backend-host: <ip>:<port>` headers,
emitted from `src/app/api/proxy/[...path]/route.ts` on both the
normal-response and 307-redirect-follow paths.

**Never add a Production-scoped env var to `rationsmart-pwa`** — it would
silently flip the dev URL to prod. Env scoping is the only thing keeping the
two URLs apart.

---

## 3. Standing user instructions (non-negotiable)

These come from durable conversation history; treat them as if they were
written into this file by the user directly.

1. **Push + deploy on every code change.** After any modification, run:
   ```
   git push origin main
   vercel --prod --yes
   ```
   The push auto-deploys both projects via GitHub integration; the explicit
   `vercel --prod --yes` is a belt-and-braces for the dev project specifically
   (the prod project is connected to GitHub, so a push is sufficient).
2. **Android first, then mirror.** Read the corresponding Kotlin / XML
   before writing PWA code for any reported mismatch.
3. **No `--no-verify`, no force push, no amending published commits.**
4. **Currency is rendered as a raw code suffix**, e.g. `"108,199.8 VND"` —
   not via `Intl.NumberFormat`. `currencySuffix` comes from `user.currency`,
   which must be kept in sync with the selected country (`setUser` propagates
   currency on every country change in cattle-info and profile).
5. **Never wipe local state to make an error go away.** Investigate root
   causes; don't `git reset --hard` or delete `.vercel/` without confirming.

---

## 4. Architecture cheat sheet

```
src/
├── app/
│   ├── layout.tsx              ← root: centred .app-column (480 px on browser
│   │                             tab, 100 % on installed PWA), splash overlay,
│   │                             snackbar, install prompt mounts
│   ├── globals.css             ← Nunito @font-face, design tokens, .app-column
│   │                             media-query rule, native <select> stripe CSS
│   ├── page.tsx                ← splash screen (2 s, then routes by user)
│   ├── login/, register/, welcome/, forgot-pin/, terms/, help/
│   │                           ← PUBLIC routes (gated out of SplashGuard)
│   ├── (main)/
│   │   ├── layout.tsx          ← auth gate — hydration-aware (see §6)
│   │   ├── cattle-info/        ← form, simulation history, currency sync
│   │   ├── feed-selection/    ← FeedRow per row, custom-feed bottom sheet,
│   │   │                        recommend / evaluate report dispatch
│   │   ├── report/             ← Solution Summary, diet rating banner, notes
│   │   ├── profile/            ← Reset PIN sheet (email flow), delete dialog
│   │   ├── reports/, feedback/
│   │   └── admin/
│   │       ├── layout.tsx      ← sage→mint gradient (column-anchored, see §6)
│   │       ├── page.tsx        ← admin landing
│   │       ├── users/, feeds/, feedback/, reports/, bulk-upload/
│   └── api/proxy/[...path]/route.ts
│                               ← server-side proxy → BACKEND_HOST:BACKEND_PORT.
│                                  Adds trailing slash (FastAPI 307s otherwise),
│                                  emits x-backend-host / x-backend-env headers
│                                  on BOTH normal and redirect-follow paths.
├── components/
│   ├── CustomSelect.tsx        ← zebra-striped dropdown (mandatory, see §5)
│   ├── FeedRow.tsx             ← one feed row in feed-selection
│   ├── GeneratingReportDialog.tsx
│   ├── SplashOverlay.tsx       ← path-aware: 2 s on /, instant unmount elsewhere
│   ├── SplashGuard.tsx         ← redirects cold launches → /, with PUBLIC_PATHS
│   ├── NumberInputGuard.tsx    ← global wheel-event preventDefault for number
│   │                             inputs (see §6)
│   ├── NavDrawer.tsx, Toolbar.tsx, SectionCard.tsx, ui/Snackbar.tsx,
│   ├── InstallPrompt.tsx, Icons.tsx (Material drawables ported as React)
└── lib/
    ├── store.ts                ← Zustand + persist (localStorage). partialize:
    │                             user, cattleInfo, feedSelections,
    │                             feedSelectionType, dietLimits. skipHydration
    │                             is DISABLED — do not re-enable (see §6).
    ├── api.ts, validators.ts, DrawerContext.tsx
```

---

## 5. Theme & visual tokens

All colors are taken from Android resources. Do not invent new colors.

| Token | Hex | Role |
|---|---|---|
| dark_aquamarine_green | `#064E3B` | primary headings, focused outlines, icons |
| go_green | `#1CA069` / `#05BC6D` | brand greens (filled buttons, success) |
| go_green_15 | `rgba(5,188,109,0.15)` | tinted icon pills, indeterminate-progress track |
| bright_gray_new | `#E4F7EF` | dropdown zebra row, selected-row pill |
| raisin_black | `#231F20` | body text |
| dark_silver | `#6D6D6D` | label / placeholder gray |
| spanish_gray | `#999999` | disabled / hint gray |
| sage_breeze → mint | `#C8E6C9 → #E8F5E9` | admin gradient (135 deg) |
| carmine_pink | `#E44A4A` / `#FC2E20` | required-field asterisk, errors |
| authentic_white | `#F8FAF9` | default body background |
| american_diamond | `#F1F5F9` | input pill background, shimmer base |

Font: Nunito (regular 400, bold 700) loaded both as `@font-face` in
`globals.css` and from Google Fonts in the root layout. Everywhere else use
`fontFamily: "Nunito, sans-serif"`.

**Material Outlined-Box pattern** for form fields (cattle-info, FeedRow):
white background, 1.5 px border (`#DCE0E4` empty / `#064E3B` filled), 16 px
radius, label sits ON the top border at left 12 px with a white-bg cutout
that interrupts the border. The red asterisk follows the label. See
`FieldBox` in `FeedRow.tsx` — copy that pattern, don't reinvent.

**Dropdowns must use `CustomSelect`, never `<select>`.** Android's
`DropDownListAdapter.setTextBackgroundColor:53-69` does index-based zebra
striping (position 0 white top-rounded, odd → `#E4F7EF` mint, even → white,
last row bottom-rounded). Native `<select>` popups can't style per-row
backgrounds reliably across browsers, so `CustomSelect` renders its own
popup card. The component supports `transparentTrigger` for use inside
existing chrome (FieldBox, the gray-pill `SelectInput` in cattle-info).

---

## 6. Known landmines — read before changing related code

These bugs cost real session time. Each fix has a non-obvious "why".

### 6.1 Persist hydration race → "asks for login after every refresh"

Next.js SSR renders `(main)/layout.tsx` with `user=null` because
`localStorage` doesn't exist on the server. React's first client render
must match the server snapshot for hydration, so the `!user` redirect to
`/welcome` fired before Zustand's persisted value propagated.

**Fix in `src/app/(main)/layout.tsx`:** gate the redirect behind
`useStore.persist.hasHydrated()` / `onFinishHydration`. Only redirect once
hydration has finished. Do not revert this — the bug is invisible until
you hard-refresh.

Do NOT enable `skipHydration: true` on the persist config. It silences
React #418 / #423 warnings but breaks persistence entirely (splash 2 s
timer fires with `user=null`).

### 6.2 Splash overlay overlap on every screen

The pre-hydration splash MUST be a self-managing client component
(`SplashOverlay.tsx`) with its own `useState` + `useEffect` lifecycle.
Do not inline a `<div id="pwa-splash">` in `layout.tsx` JSX — React
re-mounts it on every navigation and it covers every screen.

### 6.3 SplashGuard redirect loop

`SplashGuard` redirects cold launches to `/`. The `useEffect` deps MUST be
`[]` (run once on mount). A previous attempt with `[pathname, router]`
caused an infinite redirect loop on `/welcome` because each redirect
re-fired the effect. Public paths are explicitly listed in the
`PUBLIC_PATHS` set; navigation type is checked via
`performance.getEntriesByType("navigation")[0]?.type` — reloads and
back/forward never redirect.

### 6.4 Mouse-wheel mutating number inputs

Browsers increment / decrement focused `<input type="number">` on every
wheel tick. `NumberInputGuard.tsx` is mounted in the root layout and
`preventDefault`s wheel events when the focused element is a numeric
input (passive: false is required for preventDefault to work on wheel
in current Chrome). Keep this mounted; do not pass `passive: true`.

### 6.5 Installed-PWA full-width vs browser-tab mobile frame

`globals.css` has:
```css
@media (display-mode: standalone) {
  .app-column { max-width: 100% !important; }
}
```
This drops the 480-px cap when the user has installed the PWA (Android
home-screen launch, iOS Add to Home Screen, desktop PWA window), so the
column fills the viewport on all device sizes. Browser tabs keep the
mobile-frame look. The `.app-column` class is applied to the centred div
in `src/app/layout.tsx` — keep both in sync.

### 6.6 Admin gradient must stay inside the column

`(main)/admin/layout.tsx` paints the sage→mint gradient with
`position: absolute; inset: 0`, anchored to the column's
`position: relative` parent in the root layout. NOT `position: fixed`.
A previous fixed-inset version covered the whole viewport on desktop
Chrome, making admin look edge-to-edge while every other screen stayed
inside the mobile column. The combination of (a) absolute-in-column
gradient plus (b) `display-mode: standalone` full-width column handles
both phone (gradient fills screen) and desktop (gradient stays in mobile
frame) correctly.

### 6.7 Feed cascade reset on simulation-history restore

`FeedRow` cascades (feed_type → category → sub-category) defer the reset
until AFTER the fresh options arrive, and only clear downstream values
if the stored value is NOT in the new options. This preserves
simulation-restore values while still wiping selections on a real
user-driven type change. Catch blocks silence the "could not load X"
toast when a stored name is present (the row still displays correctly;
the toast would be a false alarm).

### 6.8 New custom feed auto-select

When `handleEditSubmit` runs with `editIsInsert=true`, the new feed must
be **appended to local `subCategories` state BEFORE calling `onUpdate`**.
Otherwise `CustomSelect` can't find `feed_uuid` in its options and falls
back to the "Select feed" placeholder. Same pattern for renames on the
update path — update the entry's `feed_name` in `subCategories` so the
trigger reflects the new label without waiting for a cascade refetch.

### 6.9 Currency drift between screens

If the user changes country in cattle-info or profile and the new country
has a different currency, `setUser` MUST be called with the updated
`currency`, `country`, `country_id`, `country_code`. Otherwise the
feed-selection / report screens read `user.currency = "VND"` while the
form shows "India" → labels read "Price VND/KG" on an Indian session.
See the `handleContinue` and country-dropdown change handlers in
cattle-info and profile.

---

## 7. Common tasks — how to do them safely

### Adding a new screen
1. Decide if it's in `(main)/` (auth-gated) or outside.
2. Mirror the Android XML structurally — column padding, section card
   spacing, toolbar height, button radii.
3. Use design tokens from §5. Don't introduce new colors.
4. If it has dropdowns, use `CustomSelect`. Number fields are safe — the
   global `NumberInputGuard` already covers them.

### Adding a new API call
1. Hit it via `/api/proxy/<path>`. Never call the backend host directly.
2. Add the typed helper to `src/lib/api.ts`.
3. FastAPI requires trailing slashes — the proxy adds them for you.

### Backend swap (e.g. moving prod IP)
1. Update the env var on the **right** Vercel project. The prod project
   is `rationsmart-prod`; the dev project is `rationsmart-pwa`.
2. `vercel env rm BACKEND_HOST production` then `vercel env add` — env
   var changes don't auto-redeploy; trigger a fresh deploy.
3. Verify with `curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries`
   and look for `x-backend-host` in the response.

### Diagnosing "stuck" or "white screen"
- DevTools → Application → Service Workers → Unregister, then hard
  refresh. The PWA uses Workbox NetworkFirst — a bad bundle can pin if
  the user doesn't bust the SW cache.
- Application → Storage → Clear site data nukes everything (use as a
  last resort; logs the user out).

---

## 8. What NOT to do

- Don't add files for the sake of decomposition. The current component
  granularity is intentional (FeedRow is large because the edit dialog
  is co-located; splitting it would require lifting state and lose the
  Android-DialogFeedDetails pattern).
- Don't replace inline styles with Tailwind classes wholesale —
  several components use inline styles to encode Android-exact values
  (border-radius 16, padding 10/12, line-heights). Mixed is fine.
- Don't add npm packages without a clear need. The current stack is
  lean on purpose (Next.js, Zustand, axios, react-hook-form,
  @ducanh2912/next-pwa, tailwindcss). New libs equal new bundle bytes
  on a mobile-first PWA.
- Don't generate `.md` docs unless the user explicitly asks. This file
  is the exception — it's the project's persistent context.

---

## 9. Quick reference — Vercel + Git commands

```bash
# Standard deploy cycle (after editing)
git add <files>
git commit -m "<message>"
git push origin main          # triggers BOTH Vercel projects
vercel --prod --yes           # belt-and-braces for the dev project

# Inspect either project
cd ~/Desktop/RationSmart-PWA   # linked to rationsmart-pwa
vercel env ls
vercel ls

# To operate on the prod project specifically, link a worktree:
git worktree add --detach /tmp/rs-prod main
cd /tmp/rs-prod
vercel link --yes --project rationsmart-prod
# ... operate ...
cd - && git worktree remove /tmp/rs-prod --force
```

---

If you (a future Claude session) are about to do something this document
discourages — pause, re-read the relevant section, then either follow the
documented pattern or surface the deviation to the user before proceeding.
