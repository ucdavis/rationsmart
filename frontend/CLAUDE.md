# RationSmart PWA — Claude Code Context

> Placeholders like `<DEV_BACKEND_IP>` / `<TESTING_PROJECT_ID>` are resolved in the
> untracked `CLAUDE.local.md` (kept out of git — audit item C-04).

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
all", "why are you not analzying"). **The rule is: read the Android XML layout
or Kotlin source first, then implement against it. Never guess.**

- GitHub repos (both private, kept in sync):
  - https://github.com/Aiyappa-DigitalGreen/RationSmart — remote `origin`; branches main
    (legacy prod), testing (current work), refinements-y3. Linked to the rationsmart-testing
    Vercel project.
  - https://github.com/Aiyappa-DigitalGreen/RationSmart-PWA — remote `pwa`; **only `main`**,
    which carries the current project (= RationSmart `testing`). Not linked to Vercel.
    Push with `git push pwa testing:main`; never recreate other branches there.
- Backend dev: `<DEV_BACKEND_IP>:8000` (FastAPI)
- Backend prod: `<PROD_BACKEND_IP>:8000` (FastAPI)

---

## 2. Deployment topology — current state (refreshed 2026-06-25)

**Two Vercel projects in play.** Auto-deploy is **disabled** — every
release is manual (`vercel deploy --prod --yes` then `vercel alias set`).

| Branch | URL | Backend | Project ID | API style |
|---|---|---|---|---|
| `testing` (current dev work) | https://rationsmart-testing.vercel.app | `<DEV_BACKEND_IP>:8000` | `<TESTING_PROJECT_ID>` | **v1** (JWT auth, 6-digit PIN, /v1/* paths) |
| `main` (legacy prod) | https://rationsmart.vercel.app | `<PROD_BACKEND_IP>:8000` | `<PROD_PROJECT_ID>` | **legacy** (no /v1 prefix) |

This checkout is linked to `rationsmart-testing`
via `.vercel/project.json`. To deploy `main` → prod, use a worktree on
`main` (pattern in §13 — same approach we used on 2026-06-18 to restore
the prod URL).

### History to NOT re-litigate

- 2026-06-16: the user deleted both legacy projects (`rationsmart-pwa` and
  `rationsmart-prod`); released the URLs back to Vercel's pool.
- 2026-06-18: the user asked to restore prod. A new `rationsmart-prod`
  project was created from a worktree on `main`, env vars set to
  `BACKEND_HOST=<PROD_BACKEND_IP>` / `BACKEND_PORT=8000`, deploy + alias to
  `rationsmart.vercel.app`. SSO disabled via REST API patch.
- 2026-06-17: GitHub Actions workflow `.github/workflows/deploy-testing.yml`
  was disabled (`gh workflow disable`), and deleted on 2026-09-30.
  **Don't add a deploy workflow back without the user asking.** The user wants manual deploys after a string of silent
  deploy failures.

### How to ship a change to testing (the standard cycle)

```bash
git push origin testing                                      # source of truth only
vercel deploy --prod --yes                                   # → rationsmart-testing-<hash>-<VERCEL_TEAM_SLUG>.vercel.app
vercel alias set <new-url> rationsmart-testing.vercel.app    # promote to canonical
```

The CLI session is already authenticated (token at
`~/Library/Application Support/com.vercel.cli/auth.json`). Never include
`--yes` on commands that destroy state; only on `deploy`.

### How to ship a change to prod (rare)

```bash
git worktree add --detach /tmp/rs-main main
cd /tmp/rs-main && npm install
vercel deploy --prod --yes
vercel alias set <new-url> rationsmart.vercel.app
cd - && git worktree remove /tmp/rs-main --force
```

The worktree pattern keeps the testing-branch checkout in this directory
clean. The prod project's `.vercel/project.json` lives only inside the
worktree, so `vercel` commands here never accidentally target prod.

### Status as of 2026-06-16

The backend at `<DEV_BACKEND_IP>:8000` was migrated to **RationSmart v4.0.0**
(API docs at `http://<DEV_BACKEND_IP>:8000/docs`, `/redoc`, `/openapi.json`).
Legacy paths return 404 on that backend now — **the `rationsmart-pwa.vercel.app`
dev URL is therefore non-functional on `main` / `refinements-y3`** because
those branches still send legacy paths. Only `rationsmart.vercel.app`
(prod → `<PROD_BACKEND_IP>:8000`, still legacy) keeps working.

The `testing` branch is the v1-compatible client; it will be deployed to
a **separate Firebase Hosting URL** so we can test the new API without
touching the broken/working Vercel URLs.

### The hard fork (testing branch)

Key v1 backend changes:
- All endpoints moved under `/v1/...`
- Authenticated endpoints require `Authorization: Bearer <JWT>` (HTTPBearer)
- PIN size: **6 digits** (legacy 4-digit accepted at login, with
  `requires_pin_reset: true` triggering the `/set-new-pin` migration screen)
- Many endpoints dropped the `user_id` query/body param — JWT-derived
- `POST /update-custom-feed` → `PUT /v1/animal/custom-feeds?feed_id=`
- `POST /fetch-all-simulations` (body) → `GET /v1/animal/simulations`
- `POST /fetch-simulation-details` (body) → `GET /v1/animal/simulations/{report_id}`
- `POST /check-insert-or-update` (body) → `POST /v1/animal/custom-feeds/check?feed_id=`

The prod backend (`<PROD_BACKEND_IP>:8000`) is **still on the legacy API** —
which means the `testing` branch's API client is **incompatible with
prod** until the prod backend is migrated. Don't merge `testing` →
`main` without coordinating with the backend team.

| Branch | Backend | Frontend URL | Hosting |
|---|---|---|---|
| `main` / `refinements-y3` | legacy (no `/v1`) | rationsmart-pwa.vercel.app **broken**, rationsmart.vercel.app **working** | Vercel |
| `testing` | v1 API at <DEV_BACKEND_IP>:8000 | **rationsmart-testing.vercel.app** (live) | Vercel (separate `rationsmart-testing` project, manual deploys) |

### rationsmart-testing project specifics

- Project ID: `<TESTING_PROJECT_ID>`
- Env vars (Production): `BACKEND_HOST=<DEV_BACKEND_IP>`, `BACKEND_PORT=8000`
- GitHub-linked but **productionBranch is still `main`** — Vercel API
  refused programmatic edits to the production branch. Pushing to
  `testing` triggers a Preview deployment (random URL), not Production.
  To redeploy `testing` to `rationsmart-testing.vercel.app`, use the
  worktree pattern in §13 + `vercel --prod --yes` from the worktree.
  Or change productionBranch via Vercel dashboard → Settings → Git.
- SSO disabled — publicly shareable.
- `x-backend-env: dev` in responses (the proxy maps IP `<DEV_BACKEND_IP>`
  to label `dev` because that's still the testing/dev host). Don't be
  confused — the URL `rationsmart-testing.vercel.app` is the canonical
  signal for which environment this is.

### Testing-branch workflow

- **JWT auth.** `POST /v1/auth/login` returns `{user, token, requires_pin_reset}`.
  Store the token on `User.token`; the axios interceptor in `src/lib/api.ts`
  attaches `Authorization: Bearer <token>` to every subsequent request.
  `src/lib/store.ts` wires this via `setTokenProvider(() => useStore.getState().user?.token ?? null)`
  to avoid a circular import.
- **6-digit PIN.** `PinInput` defaults to 6 boxes; pass `length={4}` only on
  the `/set-new-pin` legacy-old-PIN field. Login PIN validation accepts
  4-6 digits (legacy accounts can still sign in once, then are routed to
  `/set-new-pin`).
- **`requires_pin_reset` migration.** When `POST /v1/auth/login` returns
  `requires_pin_reset: true`, `/login` stores `{email, oldPin}` in the
  memory-only `pendingPinReset` store slice and redirects to `/set-new-pin`
  (**never** put the PIN in the URL — audit A-03, §20). That screen calls
  `POST /v1/auth/set-new-pin` with `{email_id, old_pin (4-digit), new_pin (6-digit)}`.
- **Param renames in api.ts.** `feed_category` → `category` on the
  `feed-name` query; `country_filter` → `country`, `status_filter` →
  `status` on admin/users; `admin_user_id` removed everywhere (JWT-derived).
  The PWA call-site signatures still accept the legacy positional args
  but mark them `_unused` so call sites don't need a rewrite.

### Vercel projects (still in play for main / refinements-y3)


**Two independent Vercel projects, same GitHub repo, same `main` branch.**
Both are GitHub-integrated, so a single `git push origin main` triggers
both projects to redeploy in parallel.

### URLs and projects

| Vercel project | Project ID | Primary URL (auto-generated) | Aliased URL (use this to share) | Backend |
|---|---|---|---|---|
| `rationsmart-pwa` | `<OLD_DEV_PROJECT_ID>` | `rationsmart-pwa.vercel.app` | (same — no alias) | **dev** `<DEV_BACKEND_IP>:8000` |
| `rationsmart-prod` | `<OLD_PROD_PROJECT_ID>` | `rationsmart-prod.vercel.app` | **`rationsmart.vercel.app`** | **prod** `<PROD_BACKEND_IP>:8000` |

This directory is linked to `rationsmart-pwa`
via `.vercel/project.json` — so any plain `vercel ...` command operates on
the **dev** project. To operate on `rationsmart-prod` from CLI, use the
worktree pattern in §13.

### Env-var scoping — read carefully

> **Superseded 2026-09-28 (§20):** the proxy no longer has a hardcoded
> backend fallback — it fails closed with a 500 when `BACKEND_HOST` is
> unset, the `x-backend-host` header is gone, and `x-backend-env` comes
> from the `BACKEND_ENV` env var. The `rationsmart-pwa` project this
> subsection describes was deleted on 2026-06-16. Kept below for history.

The proxy at `src/app/api/proxy/[...path]/route.ts` used to read:
```ts
const BACKEND_HOST = process.env.BACKEND_HOST ?? "<DEV_BACKEND_IP>";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);
```

Current Vercel env-var state (verified 2026-06-04):

| Project | BACKEND_HOST scope | BACKEND_PORT scope | Result |
|---|---|---|---|
| `rationsmart-pwa` (dev) | **Development** only | **Development** only | Production deploys read NO env vars → falls back to the hardcoded `<DEV_BACKEND_IP>:8000` defaults → still hits dev backend by coincidence. |
| `rationsmart-prod` (prod) | **Production** | **Production** | Production deploys hit `<PROD_BACKEND_IP>:8000` from env. |

**This means the hardcoded defaults in `route.ts` are load-bearing for the
dev URL.** Do NOT change those defaults to prod values "for safety" — that
would silently flip `rationsmart-pwa.vercel.app` to hit the prod backend.

**Never add a Production-scoped env var to `rationsmart-pwa`** unless it
matches the dev backend (`<DEV_BACKEND_IP>` / `8000`). Mixing prod values into
the dev project would silently flip the dev URL to prod.

### How to verify which backend a URL is hitting

Every proxied response carries debug headers (emitted on both the
normal-response and the 307-redirect-follow branches):

```bash
$ curl -sI https://rationsmart-testing.vercel.app/api/proxy/v1/auth/countries
x-backend-env: dev

$ curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries
x-backend-env: prod
x-backend-host: <PROD_BACKEND_IP>:8000   # main branch still emits this
```

`x-backend-env` is computed from `BACKEND_HOST` — `dev` for `<DEV_BACKEND_IP>`,
`prod` for `<PROD_BACKEND_IP>`, `custom` for anything else.

### Mental model

- **Code changes:** `git push origin main` → both URLs update.
- **Backend swap on prod:** update env var on `rationsmart-prod`, redeploy.
- **Backend swap on dev:** either update env var on `rationsmart-pwa`
  *and* set the scope to **Production** (or All Environments), OR change
  the hardcoded default in `route.ts`. Updating the env var without
  scoping it to Production won't actually affect the deployed dev URL.
- **Share with external testers:** give them `rationsmart.vercel.app`
  (prod).
- **Internal experimentation / debugging:** use `rationsmart-pwa.vercel.app`
  (dev). Don't tell external users about it — its backend may have
  half-built data.

---

## 3. Standing user instructions (non-negotiable)

1. **Push + deploy on every code change — manual only.** After any
   modification on the `testing` branch:
   ```
   git push origin testing          # RationSmart repo (linked to rationsmart-testing)
   git push pwa testing:main        # RationSmart-PWA repo — its only branch is main
   vercel deploy --prod --yes
   vercel alias set <new-url> rationsmart-testing.vercel.app
   ```
   Auto-deploy is DISABLED on purpose (see §10.16). The user wants to
   see every alias swap explicitly because a string of silent GH-Actions
   "successes" had failed to update the live URL during Y3 work. The new
   deployment's hash URL is printed by `vercel deploy`; pipe through
   `grep -oE 'rationsmart-testing-[a-z0-9]+-<VERCEL_TEAM_SLUG>\.vercel\.app'`
   to capture it for the alias command.

   For prod (rare — `main` branch): use the worktree pattern in §13.
   See §2 for the deployment topology overview.
2. **Android first, then mirror.** Read the corresponding Kotlin / XML before
   writing PWA code for any reported mismatch. Layout / behaviour comments
   throughout the codebase reference specific Android files (e.g.
   "Android FragmentRecommendationReport.kt:218") — use them as anchors.
3. **No `--no-verify`, no force push, no amending published commits.**
4. **Currency is rendered as a raw code suffix**, e.g. `"108,199.8 VND"` —
   not via `Intl.NumberFormat` with currency style. `currencySuffix` comes
   from `user.currency`. `setUser` must propagate currency on every country
   change in cattle-info, register, login, and profile.
5. **Never wipe local state to make an error go away.** Investigate root
   causes; don't `git reset --hard` or delete `.vercel/` without confirming.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14.2.5 App Router | React 18, `reactStrictMode: true` |
| State | Zustand 4.5.2 + `persist` middleware | localStorage, partialized — see §11 |
| HTTP | axios 1.6.8 | One instance with `baseURL: /api/proxy`, 60-s timeout, FastAPI-aware error interceptor |
| Forms | react-hook-form 7.51.4 | Available but most pages use manual `useState` |
| Styling | Tailwind 3.4.1 + inline styles | Inline styles encode Android-exact pixel values; Tailwind for layout |
| PWA | `@ducanh2912/next-pwa` 10.2.9 | Workbox NetworkFirst (200 entries, 24-h, 10-s timeout), skipWaiting, clientsClaim |
| Images | `images: { unoptimized: true }` in next.config | PWA-friendly, no `next/image` loader |
| Font | Nunito (regular 400, bold 700) | `@font-face` in globals.css + Google Fonts link in root layout |

---

## 5. Routes & feature catalog

Every page in the app, what it does, what it reads/writes, what it calls.
Route prefix `/` for public, `/(main)/` is the auth-gated group (URLs don't
include the group name).

### Public routes (outside `(main)`)

#### `/` — Splash (`src/app/page.tsx`)
- 2-second timer, then `router.replace("/cattle-info")` if `user` is set,
  else `/welcome`. SplashOverlay renders the branded splash for the full
  2 s in parallel; both finish simultaneously.
- Reads `user` only.

#### `/welcome` — Onboarding (`src/app/welcome/page.tsx`)
- Static — illustration `/images/ic_welcome_image.png`, tagline "Smart
  feeding. Maximum yield. Minimal cost.", green "Continue" button →
  `/login`. No store reads/writes.

#### `/login` — Login + Forgot-PIN bottom sheet (`src/app/login/page.tsx`)
- Inputs: `email` (validated by `isEmailAddressValid`), `pin` (4-digit
  via `PinInput`).
- API: `login(email, pin)` → on success runs `Promise.allSettled([
  getUserProfile(email), getCountries() ])` to pick up `is_admin` and the
  user's `currency` (looked up from country list).
- Calls `logout()` to wipe prior session, then `setUser(...)`. Pushes
  `/cattle-info`.
- Forgot-PIN bottom sheet (Android `dialog_get_new_pin` parity): asks for
  email, calls `resetPin(email)`, shows backend's success message; same
  fallback error strings as Android. **Sheet backdrop and panel are
  confined to the 480-px column on desktop browser** — see NavDrawer for
  the same pattern.
- "Register here" link → `/register`; the in-line "Forgot PIN? Tap here"
  opens the bottom sheet (not the separate `/forgot-pin` page — that
  exists for direct URL entry).

#### `/register` — Create account (`src/app/register/page.tsx`)
- Inputs: name (cleaned by `cleanNameInput` — strips digits / special
  chars / repeated spaces), email, country (loaded from `getCountries`),
  pin, confirm-pin.
- PIN enabled only when name+email+country are filled & email valid;
  Confirm PIN enabled only when PIN is 4 digits (Android parity).
- API: `register({name, email_id, pin, country_id})`. On success calls
  `logout()` then `setUser(...)` populating `currency` from the selected
  country's `currency` field. Pushes `/cattle-info`.
- **Known parity gap:** the Country dropdown here still uses native
  `<select>` (not `CustomSelect`). Pre-login screens were left on native
  because there were no Android parity complaints; if you touch this
  file, consider migrating to `CustomSelect` for consistency.

#### `/forgot-pin` — Standalone reset page (`src/app/forgot-pin/page.tsx`)
- Same flow as the login sheet but a full page (for direct URL entry).
- Two states: form → success ("Check Your Email" + envelope icon → Back
  to Login button).
- API: `resetPin(email)`.

#### `/terms` — Static T&Cs (`src/app/terms/page.tsx`)
- 9 hardcoded sections (Acceptance, Use of Service, Data Privacy, Accuracy,
  Account, IP, Liability, Changes, Contact). Header: "Last updated:
  January 2025 · Digital Green Foundation".

#### `/help` — Help & Support (`src/app/help/page.tsx`)
- Single white card with 3 rows: **User Manual** (no handler — TODO),
  **FAQs** (no handler — TODO), **Contact Us** → `mailto:admin@digitalgreen.org`.
- The TODO items render as non-clickable rows. When User Manual / FAQs
  get content, wire the `onPress` handlers in `items` array.

### Auth-gated routes (under `src/app/(main)/`)

The group layout (`src/app/(main)/layout.tsx`) enforces auth: redirects to
`/welcome` if `!user` BUT only after `useStore.persist.hasHydrated()` is
true (see §10.1).

#### `/cattle-info` — Cattle form + simulation history (`src/app/(main)/cattle-info/page.tsx`, ~580 lines; sections, restore mapping and field rules in `src/components/cattle-info/`)
- Sections (each in a `SectionCard`):
  - **Simulation Details:** Simulation Name (text), Country (`SelectInput`,
    loaded from `getCountries`).
  - **Animal Characteristics:** Breed (`SelectInput` — values "Local",
    "Cross Bred", "High Yielding"), Body Weight, BW Gain, BCS, DIM.
  - **Reproductive Data:** Days of Pregnancy, Parity (`SelectInput` 1-10).
  - **Milk Production:** Milk Production, Milk Protein %, Milk Fat %.
  - **Environment:** Average Temperature, Grazing toggle (when on:
    Distance Walked input + Topography radio Flat/Hilly).
- Per-field handlers: `handleBodyWeight`, `handleBWGain`, `handleBCS`,
  `handleDaysInMilk`, `handleDaysOfPregnancy`, `handleMilkProduction`,
  `handleAvgTemp`, `handleDistanceWalked` — each ports Android's
  validation: strip leading dot, clip second decimal point via
  `getDecimalPointIndex`, range check via the matching validator.
- Toolbar: `type="home"` with menu + forward (visible only when
  `reportData` is set — lets user re-open report without re-running diet).
- Toolbar's right-corner Simulation History icon opens a modal listing
  prior simulations (`getUserReports(user.id)` → POST `/fetch-all-simulations`).
- `loadSimulation(reportId)` → `getSimulationDetails(reportId, user.id)`:
  populates the form AND `setFeedSelections` from `data.feed_selection`,
  AND `setFeedSelectionType("evaluation" | "recommendation")` based on
  presence of `quantity_as_fed`.
- `handleReset` clears the form, `setFeedSelections([])`,
  `setFeedSelectionType("recommendation")`.
- `handleContinue` — when the user has changed country, calls `setUser`
  to sync `currency / country / country_id / country_code` BEFORE
  pushing to `/feed-selection`. Then `setCattleInfo(...)`, then push.
- `requiredFilled` ports Android `FeedViewModel.enableButton()` exactly.

#### `/feed-selection` — Diet recommend / evaluate (`src/app/(main)/feed-selection/page.tsx`, ~550 lines; row state, custom feed, limit specs, Generate pre-flight and search UI in `src/components/feed-selection/`)
- Toolbar: `type="back"`.
- **Page initializes with 3 default FeedRow instances** (matches Android —
  if the store has fewer than 3 stored selections, the array is padded
  with empty rows up to 3). Restored simulations override this when
  loaded from `/cattle-info`.
- "Custom Diet Limits" + "Custom Feed" pill buttons across the top.
  **Custom Diet Limits is DISABLED in evaluation mode** (`disabled={isEvaluation}`)
  — limits only apply to recommendation.
- Radio toggle Recommendation/Evaluation. In Evaluation mode every row
  also shows Quantity (kg/day) + computed Cost cell.
- `FeedRow` per feed. **No row's feed type is locked** — the FEED 1 lock
  and its Forage auto-default were removed on request (commit `4c7a940`).
  Instead the Feed Type options are Forage-first and the separate
  "Forage required" gate (`showNoForageDialog`) blocks Generate when no
  row is forage. `feedTypeLocked` still exists on FeedRow (default false)
  but the page never passes it. Each row owns its own API state for
  type/category/feed dropdowns (see §6 FeedRow).
- "+ Add More Feed" button has dashed-border styling (Android parity).
- **Custom Feed bottom sheet** (Android `DialogAddCustomFeed`):
  - Two collapsible sections — Feed Details (name + type + category) and
    Nutritional Information (13 fields: DM, Ash, CP, NPN-CP, EE, ST,
    NDF, ADF, LG, NDIN, ADIN, Ca, P). Both expanded by default. Unlike
    the FeedRow edit dialog (which switches layout by category), the
    Custom Feed modal always shows all 13 fields.
  - Loads feed types via `getFeedTypes(user.country_id, user.id)` on
    open. Categories cascade via `getFeedCategories(...)` when type
    changes.
  - On save: `checkInsertOrUpdate(country_id, feed_name, user_id)` —
    note the key is the **feed NAME** here, not feed_uuid. If
    `insert_feed=false` (server says a feed of this name already exists
    for this user), call `updateCustomFeed`; else call `insertCustomFeed`.
- **Custom Diet Limits modal:** edits `Partial<DietLimits>`. Empty input
  deletes the key. Saved values flow into `recommendDiet`'s
  `base_thresholds` **as-is — never merged over any client-side default**
  (see §19).
- `handleGenerateClick` — pre-flight: any row that has partial selection
  (type or category started) but missing required pieces (feed_uuid,
  price_per_kg, quantity when evaluation) is shown in an "Incomplete
  Feeds" dialog with a list of feed names/indices before allowing
  submission. Empty rows are silently ignored. Otherwise
  `generateReport()` fires.
- `generateReport()` calls `evaluateDiet({...})` or `recommendDiet({...})`,
  sets `reportData` (with `mode` discriminator), `setDietLimits(limits)`,
  pushes `/report`. `GeneratingReportDialog` overlays during the request.

#### `/report` — Diet report (`src/app/(main)/report/page.tsx`, ~570 lines; sections in `src/components/report/`, Y3 cards in `Y3Cards.tsx`)
- Reads `reportData` (union of `EvaluationResponse | RecommendationResponse`,
  discriminated by `mode`).
- Sections in order:
  - **Report Details:** Report ID, Simulation ID, Owner Name, Generated On.
  - **Animal Characteristics:** echoes the cattleInfo form values.
  - **Diet Status banner** (Recommendation only) — color/icon/title driven
    by `report_info.diet_rating`:
    - `ADVISORY` → orange (`#FF9800` family).
    - `ERROR_NO_BEST` / `ERROR_PRECHECK` / `ERROR_NO_RESULT` → red.
    - `INFEASIBLE` → green-ish (matches Android — yes, weird).
    - `OPTIMAL` / else → green.
    `showSolutionSections = !isErrorState`. `showNotesCard = !isOptimalOrUnknown`.
  - **Evaluation-only sections** (when `mode === "evaluation"`): Cost
    Analysis, Evaluation Summary, Feed Breakdown table, Intake Evaluation,
    Methane Analysis, Milk Production Analysis, Nutrient Balance.
  - **Recommendation-only sections** (when `showSolutionSections`):
    Solution Summary (Daily Cost + Milk Production + Dry Matter Intake
    with Android drawables ported as inline SVG), Cost-Effective Diet
    table (with Total Diet Cost footer in `#E4F7EF` pill), Environmental
    Impact (4 methane metrics + classification banner).
  - **Notes card** (when `showNotesCard`): two columns — "Recommendations
    & Warnings" (concat of `recommendations + warnings`) and "Violated
    Parameters" (filter empties from `violated_parameters`). Empty arrays
    render `"No recommendation/warnings available!"` placeholder.
- **Bottom action bar (fixed):**
  - **"New Case"** (outline button with `IcNewCase`): just pushes
    `/cattle-info` — cattle info, feed selections, the mode toggle and the
    simulation language all stay, so the user can tweak and re-run. The
    clean-slate action is **Reset** on Cattle Info.
  - **"Save Report"** (filled): POST `/save-report` with `{report_id,
    user_id}`. Response can carry the PDF URL in any of `bucket_url`,
    `report.bucket_url`, or `pdf_url` (defensive parsing because the
    backend has historically varied). On success a **"View PDF"** button
    appears between the action row and the cards — opens the URL in a
    new tab (`window.open(pdfUrl, "_blank", "noopener,noreferrer")`).
- Currency rendering: `currencySymbol` reads first from `cost_analysis.currency`
  (evaluation), then `currency`, then `user.currency`. Always rendered as
  suffix `"108.5 VND"`.
- `MethaneBar` component (Android `LinearProgressIndicator` parity):
  bar height 6 px, fill + dot at progress position, dot at right end.
  Track color is `${color}26` (~15% alpha of the fill).
- `MethaneUiRanges` constants ported from Android: production max
  `1000` g/day, yield max `100` g/kg DMI, intensity max `100` g/kg ECM,
  Ym max `100%`.
- Statuses that the `StatusBadge` understands (used in some banners):
  `Optimized` / `Optimised` / `OPTIMAL` → green; `Not Optimized` /
  `Not Feasible` / `INFEASIBLE` → red; `Evaluation` / `Evaluated` /
  `ADVISORY` → orange.

#### `/profile` — User profile (`src/app/(main)/profile/page.tsx`, ~585 lines; sheets / dialogs in `src/components/profile/`)
- Inputs: Name (`cleanNameInput` again), Country (`SelectInput`).
- API: `updateUserProfile(email, {name, country_id})` on save.
  - On country change, `setUser(...)` propagates the new `currency`,
    `country`, `country_id`, `country_code` from the country list (matches
    cattle-info pattern).
- "Reset PIN" → bottom sheet showing the signed-in user's email,
  **read-only** (2026-09-28, audit A-20 — this deliberately diverges from
  Android, which lets any address be typed). Drag handle in `go_green_15`.
  Forgot-PIN / resend-verification have a 60 s per-address cooldown
  (`src/lib/email-cooldown.ts`).
- "Delete Account" → confirmation dialog (icon `ic_additional_information`,
  Cancel + Delete buttons with `ic_cancel` / `ic_delete_account`) → if
  confirmed opens "Submit PIN" sheet → `deleteAccount(user.id, pin)` →
  `logout()` + redirect to `/welcome`.

#### `/reports` — Saved Feed Reports list (`src/app/(main)/reports/page.tsx`)
- API: `getSavedReports(user.id)` → GET `/get-user-reports?user_id=`
  returning `{reports: FeedReport[]}`.
- Each card: report_id, simulation_id, user_name, formatted date
  (`toFeedReportDisplayDate`), expand toggle, "View Report" button that
  `window.open(bucket_url)` to download the PDF.
- Empty state: "No reports found".

#### `/feedback` — Submit feedback + history (`src/app/(main)/feedback/page.tsx`)
- Category radio: General / Defect / Feature Request.
- Free-text feedback (textarea), star rating 1-5.
- API: `submitFeedback(user.id, {feedback_type, text_feedback, overall_rating})`
  → POST `/user-feedback/submit?user_id=`.
- History list below (last 5): `getMyFeedback(user.id, 5, 0)` → GET
  `/user-feedback/my?user_id=&limit=&offset=`.

### Admin routes (under `src/app/(main)/admin/`)

Admin layout sets sage→mint gradient AND swaps `<meta theme-color>` to
`#C8E6C9` (see §10.6). The landing page also guards `user.is_admin`.

#### `/admin` — Landing (`src/app/(main)/admin/page.tsx`)
- Shows 5 cards: User Management, Feed Management, Feedback Management,
  Bulk Upload & Export Feed, Feed Reports.
- If `user && !user.is_admin`, redirects to `/cattle-info`. While loading,
  renders an "Access Denied" card with `ic_additional_information`-style
  warning UI.

#### `/admin/users` — User list + activate/deactivate (`src/app/(main)/admin/users/page.tsx`)
- API: `getAdminUsers(admin_user_id, page, page_size, country_filter,
  status_filter, search)` — backend paginates at 100; this page fetches
  every page in sequence client-side (Android uses Paging library +
  infinite scroll; we materialize the list).
- Top: total count chip, search box (filters by name/email), status filter
  pills (All / Active / Inactive).
- Each card: name + email + country + active/inactive toggle. Tapping the
  toggle calls `toggleUserStatus(user_id, admin_user_id, is_active)`.

#### `/admin/feeds` — Feed/Category/Type CRUD (`src/app/(main)/admin/feeds/page.tsx`, ~525 lines; tabs, landing and sheets in `src/components/admin/feeds/`)
- **Two-level navigation**:
  - **Landing view** (`section === "landing"`): 3 nav cards — Feed Type,
    Feed Category, Feed. Each has a 4-px green accent bar on the left
    and an arrow chip on the right. Title bar: "Configure Resources"
    subtitle + "Administration" tagline.
  - **Sub-section view** (`section === "feeds" | "types" | "categories"`):
    list view with Add button + per-row edit/delete. Toolbar back button
    returns to the landing view, NOT the prior page.
- `loadAll()` runs `Promise.all([getAdminFeedTypes, getAdminFeedCategories,
  getAdminFeeds, getCountries])` once on mount; every successful CRUD
  call re-runs it.
- **Feed CRUD modal**: 23 fields total (3 metadata: name/type/category,
  Country selector, then 19 nutrient numerics + `fd_code`). openAdd /
  openEdit pre-fills `feedForm`. Save → `addAdminFeed` or
  `updateAdminFeed(feed_id, ...)` with the FULL nutritional payload
  (every numeric is `Number(v) || 0`; metadata fields like `fd_ipb_local_lab`,
  `fd_orginin`, `fd_season`, `fd_code` are always sent as empty string
  because the Android dialog doesn't expose them). Delete via
  `deleteAdminFeed` → confirm dialog.
- **Category CRUD**: dialog form has `category_name`, `description`,
  `feed_type_id` (`SelectInput`). On save sends
  `{category_name, description, feed_type_id, sort_order: 0}` to
  `addAdminFeedCategory`. Delete via `deleteAdminFeedCategory`.
- **Type CRUD**: dialog form has `type_name`, `description`. Sends
  `{type_name, description, sort_order: 0}` to `addAdminFeedType`.
  Delete via `deleteAdminFeedType`.
- All three confirm-delete dialogs share styling (icon
  `ic_additional_information`, carmine_pink delete button).
- Feeds tab has a search box (filters by `fd_name` only, matching
  Android `FragmentFeed`).

#### `/admin/feedback` — Feedback list + stats (`src/app/(main)/admin/feedback/page.tsx`)
- Loads via `Promise.all([getAdminFeedbacks(user.id, 50, 0),
  getAdminFeedbackStats(user.id)])`.
- "Aggregated Insights" stats cards: Total Feedbacks, Overall Rating
  (decimal, e.g. 3.95), Feedback by Type breakdown.
- List entries: category icon pill (color-coded per Defect/FeatureRequest
  /General — see `categoryStyle()`), user name + email, text feedback,
  5-star row (filled `#FFDB58`, empty `#C2C2C2`), formatted date.
- **Star rating is rendered to the exact decimal**, e.g. "3.95" — NOT
  rounded to 4.0. Past mismatches happened here.

#### `/admin/reports` — All saved reports list (`src/app/(main)/admin/reports/page.tsx`)
- API: `getAdminReports(user.id, 1, 50)`.
- Card: report icon, user name (`#1CA069` crayola_green), Simulation ID,
  Report Type chip color-coded (Evaluation = vivid_gamboge, Recommendation
  = celtic_blue, else = bright_gray_new). "View Report" button opens
  `bucket_url` in new tab — there is NO in-app report refetch on the
  admin side (matches Android `FragmentAdminFeedReports.onClickViewReport`
  which calls `FileUtils.sharePdf`).

#### `/admin/bulk-upload` — Import / Export / Template (`src/app/(main)/admin/bulk-upload/page.tsx`)
Four actions on this page:

1. **Upload Feed CSV** (top card): file picker → "Cancel" + "Confirm
   Upload" buttons. On confirm calls
   `bulkUploadFeeds(admin_user_id, file, onProgress)` (multipart/form-data
   POST). `onUploadProgress` drives a linear progress bar (track
   `#E4F7EF`, fill go_green). Upload status enum: `idle | uploading |
   successful | failed`. Backend's `message` is shown in the success banner.
2. **Export Standard Feeds**: calls `exportAdminFeeds(admin_user_id)` →
   GET `/admin/export-feeds`. Status banner colors are GREEN (sage_breeze
   theme).
3. **Export Custom Feeds**: calls `exportCustomFeeds(admin_user_id)` →
   GET `/admin/export-custom-feeds`. Status banner colors are ORANGE
   (vivid_gamboge theme).
4. **Download Template** (fixed-position green-gradient button at the
   bottom of the screen): hits a **static S3 URL**, not the backend:
   ```
   <TEMPLATE_S3_URL>
   ```
   The filename is misspelled "tempate" — this is the actual server-side
   filename and matches Android. Saved client-side as
   `feeds_table_template.xlsx` (corrected spelling). Triggers via a
   synthetic `<a download>` click.

Each panel owns its own status enum + status banner. Banners auto-clear
after a successful or failed operation.

---

## 6. `FeedRow` deep dive — the most complex component

Lives at `src/components/FeedRow.tsx` (~585 lines; logic in `feed-row/useFeedCascade`,
`useFeedEdit`, `useFeedRowSync`; `InclusionLimits` / `FieldBox` / `FeedEditDialog`
are its sub-views). One row per feed in
`/feed-selection`. Owns its own dropdown state per-row.

**Props:** `item: FeedItem`, `index: number`, `showQuantity: boolean`
(true in evaluation mode), `feedTypeLocked?: boolean`, `currencySymbol?: string`,
`onUpdate(id, partial)`, `onDelete(id)`.

**Cascading dropdowns:**
- `feedTypes` ← `getFeedTypes(user.country_id, user.id)`.
- `categories` ← `getFeedCategories(item.feed_type_name, country, user)`,
  triggered when `item.feed_type_name` changes.
- `subCategories` ← `getFeedSubCategories(feed_type, category, country, user)`,
  triggered when both type + category are present.

**Cascade reset rule:** when an upstream value changes, the cascade fetches
the new options FIRST, then only clears downstream fields if the stored
value isn't in the new options. This preserves simulation-history restore
values. Catch blocks silence the "could not load X" toast when the row
has a stored name (the value is still displayed; toast would be a false
alarm).

**Default first row:** no row auto-selects a feed type any more (the
FEED 1 → "Forage" default was removed in commit `4c7a940`); see §5.

**Edit dialog (pencil icon):**
- On open, calls `checkInsertOrUpdate(country, item.feed_uuid, user.id)`
  to determine `isInsert` (true if it's not the user's own feed → save
  creates a new one; false if it's editable → save updates).
- Form has 13 nutrient fields, layout chosen by category:
  - `Additive` → all 13 fields incl. `fd_npn_cp` (NPN).
  - `Mineral` / `Minerals` → 4 fields (DM, Ash, Ca, P).
  - else → 12 fields (no NPN).
- Feed name prefix:
  - If `!isInsert && name contains "-"`: split prefix/value at the first
    `-` (e.g. `"John-MyFeed"` → prefix `"John-"`, name `"MyFeed"`).
  - Else: prefix = `"<userFirstName>-"`.
- On submit:
  - Insert (`editIsInsert=true`): `insertCustomFeed(...)`. CRITICAL —
    after the API call, append the new entry to local `subCategories`
    state **before** calling `onUpdate`, otherwise `CustomSelect` falls
    back to the placeholder (it can't find the new `feed_uuid` in its
    options). See §10.8.
  - Update (`editIsInsert=false`): `updateCustomFeed(...)`. If the feed
    name changed, also patch the local `subCategories` entry's `feed_name`
    so the trigger label updates immediately.

**Three dropdowns inside `FieldBox` chrome:** Feed Type, Feed Category,
Feed (sub-category) — all use `CustomSelect` with `transparentTrigger`.
Native `<select>` was abandoned because it can't do Android's
zebra-striped popup reliably across browsers (see §10.7).

**Per-row UI rules:**
- **Header reads `FEED <index+1>`** ("FEED 1", "FEED 2", ...).
- **Delete button only visible for `index > 0`** — FEED 1 cannot be
  deleted (it's the implicit "main" feed row). Matches Android.
- Edit button is enabled only when `canEdit` (the row has a selected
  feed). Active styling uses go_green_15 bg + dark_aquamarine_green icon;
  disabled uses light_gray_new + dark_silver.
- Cost cell renders `${cost} ${currencySymbol}` (suffix, not prefix).

---

## 7. API surface (`src/lib/api.ts`)

All requests go through `/api/proxy/<path>` (Next.js route → upstream
FastAPI). axios instance has a response error interceptor that extracts
`detail` from FastAPI errors (string, array, or fallback).

### Auth
| Function | Method · Path | Notes |
|---|---|---|
| `login(email_id, pin)` | POST `/auth/login` | Returns user + message |
| `register(data)` | POST `/auth/register` | data = `{name, email_id, pin, country_id}` |
| `resetPin(email_id)` | POST `/auth/forgot-pin` | Email-only forgot flow |
| `getCountries()` | GET `/auth/countries` | `Country[]` with id, name, code, country_code, currency |
| `getUserProfile(email)` | GET `/auth/user/{email}` | Returns `is_admin` |
| `updateUserProfile(email, {name, country_id})` | PUT `/auth/user/{email}` | |
| `deleteAccount(user_id, pin)` | POST `/auth/user-delete-account?user_id=&pin=` | Query params, no body |

### Feed taxonomy
| Function | Method · Path |
|---|---|
| `getFeedTypes(country_id, user_id)` | GET `/unique-feed-type/{country_id}/{user_id}` (`string[]`) |
| `getFeedCategories(feed_type, country_id, user_id)` | GET `/unique-feed-category?...` |
| `getFeedSubCategories(feed_type, feed_category, country_id, user_id)` | GET `/feed-name?...` (returns `{feed_name, feed_uuid, ...}[]`) |
| `getFeedClassification()` | GET `/feed-classification/structure` |

### Diet
| Function | Method · Path | Notes |
|---|---|---|
| `evaluateDiet(EvaluationRequest)` | POST `/diet-evaluation-working` | |
| `recommendDiet(RecommendationRequest)` | POST `/diet-recommendation-working` | **Send `base_thresholds` only when the user set at least one limit**, and send only the keys they set. Omitting the object = "use the engine's per-state defaults". Superseded the old always-send-merged-over-`DEFAULT_BASE_THRESHOLDS` rule on 2026-09-21 — see §19 |

### Reports
| Function | Method · Path |
|---|---|
| `getSavedReports(user_id)` | GET `/get-user-reports?user_id=` |
| `getUserReports(user_id)` | POST `/fetch-all-simulations` body `{user_id}` (simulation history) |
| `saveReport(report_id, user_id)` | POST `/save-report` body `{report_id, user_id}` |
| `getSimulationDetails(report_id, user_id)` | POST `/fetch-simulation-details` body `{report_id, user_id}` |

### Feedback
| Function | Method · Path |
|---|---|
| `submitFeedback(user_id, {feedback_type, text_feedback, overall_rating})` | POST `/user-feedback/submit?user_id=` |
| `getMyFeedback(user_id, limit, offset)` | GET `/user-feedback/my?...` |

### Custom feed (end-user)
| Function | Method · Path |
|---|---|
| `checkInsertOrUpdate(country_id, feed_id, user_id)` | POST `/check-insert-or-update` body |
| `insertCustomFeed({country_id, user_id, feed_insert:true, feed_details})` | POST `/insert-custom-feed` |
| `updateCustomFeed({country_id, user_id, feed_id, feed_insert:false, feed_details})` | POST `/update-custom-feed` |

**`checkInsertOrUpdate` returns `{ insert_feed: boolean, feed_details: { feed_id, ... } }`**.
The PWA uses it in two distinct ways — same endpoint, different semantic
keying:

- **FeedRow edit dialog** (`openEditModal`): pass `item.feed_uuid` as the
  `feed_id` argument. The response tells you whether the upcoming save
  will INSERT (creating a user-owned derivative because the source feed
  is read-only) or UPDATE (because it's already user-owned).
- **Custom Feed bottom sheet** (`handleSaveCustomFeed`): pass the
  TRIMMED feed NAME as the `feed_id` argument. The response tells you
  whether to INSERT a new custom feed by that name or UPDATE an existing
  one. (The endpoint accepts a name string here, not a UUID — server
  resolves both kinds.)

### Admin
| Function | Method · Path |
|---|---|
| `getAdminUsers(admin_user_id, page, page_size, country_filter, status_filter, search)` | GET `/admin/users?...` |
| `toggleUserStatus(user_id, admin_user_id, is_active)` | PUT `/admin/users/{user_id}/toggle-status?admin_user_id=` body `{is_active}` |
| `getAdminFeedTypes(admin_user_id)` | GET `/admin/list-feed-types?admin_user_id=` |
| `getAdminFeedCategories(admin_user_id)` | GET `/admin/list-feed-categories?admin_user_id=` |
| `getAdminFeeds(admin_user_id, page, page_size, feed_type, feed_category, country_name, search)` | GET `/admin/list-feeds?...` |
| `addAdminFeed(admin_user_id, body)` | POST `/admin/add-feed?admin_user_id=` |
| `updateAdminFeed(feed_id, admin_user_id, body)` | PUT `/admin/update-feed/{feed_id}?admin_user_id=` |
| `deleteAdminFeed(feed_id, admin_user_id)` | DELETE `/admin/delete-feed/{feed_id}?admin_user_id=` |
| `addAdminFeedCategory(admin_user_id, body)` | POST `/admin/add-feed-category?admin_user_id=` |
| `deleteAdminFeedCategory(category_id, admin_user_id)` | DELETE `/admin/delete-feed-category/{category_id}?admin_user_id=` |
| `addAdminFeedType(admin_user_id, body)` | POST `/admin/add-feed-type?admin_user_id=` |
| `deleteAdminFeedType(type_id, admin_user_id)` | DELETE `/admin/delete-feed-type/{type_id}?admin_user_id=` |
| `getAdminFeedbacks(admin_user_id, limit, offset)` | GET `/admin/user-feedback/all?...` |
| `getAdminFeedbackStats(admin_user_id)` | GET `/admin/user-feedback/stats?admin_user_id=` |
| `getAdminReports(user_id, page, page_size)` | GET `/admin/get-all-reports?...` |
| `exportAdminFeeds(admin_user_id)` | GET `/admin/export-feeds?admin_user_id=` |
| `exportCustomFeeds(admin_user_id)` | GET `/admin/export-custom-feeds?admin_user_id=` |
| `bulkUploadFeeds(admin_user_id, file, onProgress)` | POST `/admin/bulk-upload-feeds?admin_user_id=` multipart |

### Critical request-shape conversion
`toCattleInfoPayload(ci)` maps the human-readable store shape →
Android's API field names: `bc_score`, `bw_gain`, `tp_milk`, `fat_milk`,
etc. Hardcodes `calving_interval: 370`, `lactating: true`. Forces
`distance: 0` and `topography: "Flat"` when `grazing: false`. **Use this
function — don't construct the payload manually.**

---

## 8. Validators reference (`src/lib/validators.ts`)

### Field validators (Android-ported ranges)
| Function | Range / Rule |
|---|---|
| `isEmailAddressValid(email)` | Standard email regex |
| `daysInMilkIsInRange(n)` | 0–400 |
| `daysOfPregnancyIsInRange(n)` | 0–280 |
| `scoreIsInRange(n)` | 1.0–5.0 (Body Condition Score) |
| `bodyWeightIsInRange(n)` | 350–720 |
| `bodyWeightGainIsInRange(n)` | 0–1.8 |
| `milkProductionIsInRange(n)` | 1–59 |

### Input-cleaning helpers
| Function | Behavior |
|---|---|
| `containsMultipleDecimalPoints(s)` | True if `s` contains more than one `.` |
| `getDecimalPointIndex(s)` | Position of the SECOND `.` (used to clip second-decimal input) |
| `cleanNameInput(s)` | Trim start, collapse multi-spaces, strip non-letters (Android `cleanNameInput` parity) |

### Computation
| Function | Returns |
|---|---|
| `calculateCost(price, qty)` | `String(price * qty)` rounded to 2 decimals, "" if invalid |
| `formatFeedSelectionData(n)` / `formatFeedBreakdownData(n)` | Trim trailing zeros, max 2 decimals |
| `formatPrice(n)` | `Intl.NumberFormat("en-US")` with grouping |
| `formatTotalUsers(n)` | `Intl.NumberFormat("en-US")` grouping |
| `emptyStringOrValue(s)` | `""` when input is empty/null/`"Select"` |

### Date formatters
| Function | Format example |
|---|---|
| `toDisplayDate(iso)` | `04/06/2026` |
| `toFeedReportDisplayDate(iso)` | `4 Jun 2026` |
| `toSimulationHistoryDisplayDate("yyyy-MM-dd HH:mm:ss")` | `4 Jun 2026 at 3:45 PM` |
| `toAdminReportDisplayDate(...)` | `4 Jun 2026` |

All return `"Not available"` for null/invalid input.

---

## 9. Shared components catalog (`src/components/`)

### Trigger / chrome
| Component | Purpose / quirks |
|---|---|
| `Toolbar` | `type="home"` (hamburger) or `type="back"` (chevron). `showForward` + `onForward` for the optional right-side arrow. **`paddingTop: max(12px, env(safe-area-inset-top))`** — required so the toolbar doesn't sit under the iOS notch in standalone mode. Transparent background so page bg/gradient flows through. |
| `NavDrawer` | Slides from the left edge of the centred column (NOT the viewport — uses `containerLeft = "max(0px, calc((100vw - 480px) / 2))"` for desktop alignment). Menu items: Profile, Feed Reports, Help & Support (Ongoing badge), Feedback, Terms & Conditions (Ongoing badge). Admin sees Admin first. Logout shows a confirmation dialog. |
| `SectionCard` | White rounded card with icon pill (`#E4F7EF` bg) + title (`#064E3B`) header. Used for every form section and report section. |
| `SplashOverlay` | Pre-hydration splash, path-aware (2 s on `/`, instant unmount elsewhere). Self-managing lifecycle — don't inline a `<div id="pwa-splash">` in layout JSX. |
| `SplashGuard` | Redirects cold-launch navigations to `/`, except for `PUBLIC_PATHS` (`/welcome, /login, /register, /forgot-pin, /terms, /help`). `useEffect` deps MUST be `[]` (see §10.3). |

### Inputs
| Component | Purpose |
|---|---|
| `CustomSelect` | Custom dropdown with Android `DropDownListAdapter` zebra striping. Pass `transparentTrigger` when wrapping in `FieldBox` / gray-pill chrome. Use this — not `<select>` — for all new dropdowns. |
| `InputField` | Convenience wrapper: label + gray-pill `<input>`. Used by some auth pages. |
| `SelectField` | Convenience wrapper around native `<select>`. **Legacy — prefer `CustomSelect`**. |
| `ui/PinInput` | 4-digit OTP-style PIN entry with auto-focus advance, backspace handling, disabled state. |
| `NumberInputGuard` | Mounted in root layout. `preventDefault`s wheel events on focused number inputs so scrolling never mutates the value. `passive: false` required. |
| `RequiredAsterisk` | 3-line component → ` <span style={{color:"#FC2E20"}}>*</span>`. |

### Dialogs / feedback
| Component | Purpose |
|---|---|
| `GeneratingReportDialog` | Modal during `recommendDiet`/`evaluateDiet`. Centred on the column (NOT the viewport — `left: max(0px, calc((100vw - 480px) / 2)); width: min(100vw, 480px)`). Icon = `ic_generating_report` (Material Symbols "feed" glyph) inside a double-pill. Spinner = dark_aquamarine_green stroke on go_green_15 track. |
| `ui/Snackbar` | Reads from Zustand `snackbar` state. SUCCESS = `#064E3B` bg / white text. ERROR = `#FFDB58` mustard / `#231F20` text. INFO = `#007BFF` / white. Auto-dismiss at 2800 ms with slide-out at 3100 ms. |
| `InstallPrompt` | Bottom banner "Install RationSmart" with green Install button. Appears only when NOT in standalone display-mode. Captures `beforeinstallprompt` event. **Listens for `appinstalled` and clears `localStorage["rationsmart-storage"]`** — ensures a freshly-installed PWA opens to login, not stale auth. |

### Branding / static
| Component | Purpose |
|---|---|
| `AppBranding` | Round 80×80 app logo + "RationSmart" wordmark. |
| `PoweredBy` | "POWERED BY DigitalGreen" footer. |
| `Icons` | One file exporting every Material drawable as an inline SVG React component (`IcBack`, `IcForward`, `IcHamburger`, `IcClose`, `IcUser`, `IcReportNav`, `IcFeedbackNav`, `IcProfileNav`, `IcHelpSupport`, `IcTerms`, `IcAdminNav`, `IcLogoutNav`, `IcArrowRight`, `IcStar`, `IcDelete`, `IcAddFeed`, `IcSimulationDetails`, `IcSimulationHistory`, `IcAnimalCharacteristics`, `IcReproductiveData`, `IcMilkProduction`, `IcEnvironment`, `IcFeedManagement`, `IcUserManagement`, `IcFeedbackManagement`, `IcBulkUpload`). Path data taken directly from Android drawables. |
| `ui/LoadingButton` | Legacy. Prefer inline buttons. |
| `ui/BottomNav` | Stub (5 lines). |

---

## 10. Known landmines — read before changing related code

Each fix has a non-obvious "why". 14 entries. These bugs cost real
session time; don't relearn them.

### 10.1 Persist hydration race → "asks for login after every refresh"
Next.js SSR renders `(main)/layout.tsx` with `user=null` because
`localStorage` doesn't exist on the server. React's first client render
must match the server snapshot for hydration, so the `!user` redirect to
`/welcome` fired before Zustand's persisted value propagated.

**Fix:** `(main)/layout.tsx` gates the redirect behind
`useStore.persist.hasHydrated()` + `onFinishHydration`. Spinner shown
until hydrated. Don't revert — the bug is invisible until you hard-refresh.

**Do NOT enable `skipHydration: true` on the persist config.** It silences
React #418 / #423 warnings but breaks persistence entirely (splash 2 s
timer fires with `user=null`).

### 10.2 Splash overlay must be self-managing
The pre-hydration splash MUST be a self-managing client component
(`SplashOverlay.tsx`) with its own `useState` + `useEffect` lifecycle.
Inlining a `<div id="pwa-splash">` in `layout.tsx` JSX causes React to
re-mount it on every navigation and it covers every screen.

### 10.3 SplashGuard runs once — don't add pathname/router as triggers
`SplashGuard.useEffect` must run only once. Since 2026-09-28 its deps are
`[effectInputs1]` — a stable `useLatestRef` holding pathname/router — which
is equivalent to `[]` without an eslint-disable (audit B-20). A previous attempt with
`[pathname, router]` caused an infinite redirect loop on `/welcome`
because each redirect re-fired the effect. Public paths are explicitly
listed in `PUBLIC_PATHS`. Navigation type is checked via
`performance.getEntriesByType("navigation")[0]?.type` — reloads and
back/forward never redirect.

### 10.4 Mouse-wheel mutating number inputs
Browsers increment / decrement focused `<input type="number">` on every
wheel tick. `NumberInputGuard.tsx` is mounted in the root layout and
`preventDefault`s wheel events when the focused element is a numeric
input (`passive: false` is required for `preventDefault` to work on
wheel). Don't pass `passive: true`.

### 10.5 Installed-PWA full-width vs browser-tab mobile frame
`globals.css` has:
```css
@media (display-mode: standalone) {
  .app-column { max-width: 100% !important; }
}
```
Drops the 480-px cap when the user has installed the PWA, so the column
fills the viewport on all device sizes. Browser tabs keep the mobile-frame
look. The `.app-column` class is applied to the centred div in
`src/app/layout.tsx` — keep both in sync.

### 10.6 Admin gradient must stay inside the column
`(main)/admin/layout.tsx` paints the sage→mint gradient with
`position: absolute; inset: 0`, anchored to the column's `position: relative`
parent in the root layout. NOT `position: fixed`. A previous fixed-inset
version covered the whole viewport on desktop Chrome, making admin look
edge-to-edge while every other screen stayed inside the mobile column.
Theme-color meta swap happens on mount and reverts on unmount.

### 10.7 Native `<select>` can't match Android Spinner
Android `DropDownListAdapter.setTextBackgroundColor:53-69` does position-
based zebra striping (pos 0 white top-rounded, then alternating mint /
white, last row bottom-rounded). Native `<select>` popups can't style
per-row backgrounds reliably (Chrome/Safari/Firefox each differ).
`CustomSelect.tsx` renders its own popup card with the exact algorithm.
**Always use `CustomSelect` for new dropdowns.** Existing native
`<select>` instances on `/register` (Country) and the legacy
`SelectField` component are known parity gaps.

### 10.8 New custom feed auto-select
When `handleEditSubmit` runs with `editIsInsert=true`, append the new
feed to local `subCategories` state BEFORE calling `onUpdate`. Otherwise
`CustomSelect` can't find `feed_uuid` in its options and falls back to
the "Select feed" placeholder. Same pattern for renames on the update
path — patch the entry's `feed_name`.

### 10.9 Currency drift between screens
If the user changes country in cattle-info, register, or profile, `setUser`
MUST be called with the updated `currency`, `country`, `country_id`,
`country_code`. Otherwise feed-selection / report read `user.currency`
from the previous session ("VND") even though the form now shows India.

### 10.10 Feed cascade reset on simulation restore
`FeedRow` cascades fetch new options FIRST, then only clear downstream
fields if the stored value isn't in the new options. Catch blocks
silence the "could not load X" toast when `item.feed_type_name` /
`item.category_name` is already populated (simulation-restore case).

### 10.11 Proxy headers on the redirect-follow path
The proxy follows backend 307/308 redirects server-side and **must emit
`x-backend-env` on BOTH the normal and redirect branches**. Since
2026-09-28 it no longer appends a trailing slash (all but one v1 route is
slash-less, so the 307 round trip is gone), it never returns
`x-backend-host`, and both branches share `buildResponse()` with a
response-header allowlist — see §20.

### 10.12 PWA install bug — stale auth across reinstall
Android only removes the home-screen shortcut on uninstall — it does NOT
clear localStorage. `InstallPrompt` listens for `appinstalled` (Chrome's
post-install event) and `localStorage.removeItem("rationsmart-storage")`
so a freshly installed PWA always opens to login.

### 10.13 Dev URL relies on hardcoded proxy defaults — SUPERSEDED (§20)
The fallback below was removed on 2026-09-28: the proxy now requires
`BACKEND_HOST` (fails closed). `rationsmart-testing` has it set for
Production; local dev reads it from the untracked `.env.development`
(copy `.env.example`). Historical note follows.

The `rationsmart-pwa` (dev) Vercel project only has `BACKEND_HOST` and
`BACKEND_PORT` scoped to the `Development` environment. Production
deploys read NO env vars and rely on the hardcoded fallback in
`src/app/api/proxy/[...path]/route.ts`:
```ts
const BACKEND_HOST = process.env.BACKEND_HOST ?? "<DEV_BACKEND_IP>";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);
```
**Don't change those defaults to prod values "for safety"** — that would
silently flip `rationsmart-pwa.vercel.app` to hit the prod backend. If
you need to move the dev backend, either:
1. Re-scope the env vars to Production (or All Environments) on the
   `rationsmart-pwa` project, OR
2. Update the hardcoded defaults in `route.ts`.
The `x-backend-env` debug header on every response is the canonical
"which backend am I hitting right now" check.

### 10.14 SW cache → "stuck on splash" / "old bundle"
The Workbox NetworkFirst strategy can pin a bad bundle if the user
doesn't bust the cache. Triage: DevTools → Application → Service Workers
→ Unregister → hard refresh. Worst case: Application → Storage → Clear
site data (also logs the user out).

### 10.15 fd_code rollout was reverted — DO NOT reintroduce
On 2026-06-19 the user asked to revert a planned `feed_code` rollout
that would have made the payload prefer `fd_code` over the UUID on
`POST /v1/animal/diet-recommendation` and `/v1/animal/evaluate-diet`.
The revert is in commit `3f15def`. The wire payload now sends
`feed_id: item.feed_uuid` everywhere — no `?? feed_code` fallback,
no `feed_code` field on `FeedItem`. If a future session sees
`fd_code` in the swagger or in admin/feeds and considers "wiring it
through to the diet payload", **stop**. The user's reason: simulation
history records pre-date `fd_code` (legacy backends never populated
it). The admin/feeds page still SENDS `fd_code: ""` because the
backend's `AdminFeedRequest` schema marks it as `required: true` —
that's pre-existing infrastructure unrelated to the simulation flow
and must stay. The doc at `docs/Search_Implmentation.md` had a §11
about this rollout; it was removed in the revert.

### 10.16 Auto-deploy stays OFF
The old GH-Actions deploy workflow (`deploy-testing.yml`) was **deleted on
2026-09-30** (audit §2 / A-23): it was disabled, deploys are manual by
standing instruction, and it was the only CI job that handled the Vercel
token. Don't add a deploy workflow back without the user asking. CI keeps
only `quality-gate.yml` (checks, never deploys). Re-enabling it without the user's
explicit ask will get pushed back. Reason: a string of silent
"successful" deploys that didn't actually update the live alias
during the early Y3 work — manual `vercel deploy --prod --yes` +
`vercel alias set` is the trusted path. Standing instruction:
deploy after every code change, but manually via the two CLI
commands in §15.

---

## 11. State management (`src/lib/store.ts`)

### Store shape
```ts
interface AppState {
  user: User | null;                 // {id, name, email, country, country_id, country_code, currency, pin, is_admin}
  cattleInfo: CattleInfo | null;
  feedSelectionType: "recommendation" | "evaluation";
  feedSelections: FeedItem[];
  reportData: EvaluationResponse | RecommendationResponse | null;
  dietLimits: Partial<DietLimits>;
  snackbar: SnackbarState | null;

  setUser(user): void;               // also writes localStorage["user_id"]
  logout(): void;                    // clears user + cattleInfo + feedSelections + reportData + feedSelectionType + dietLimits, removes localStorage user_id
  setCattleInfo(info): void;
  setFeedSelectionType(type): void;
  setFeedSelections(items): void;
  setReportData(data): void;
  setDietLimits(limits): void;
  showSnackbar(message, type?): void;
  hideSnackbar(): void;
}
```

### Persistence
`persist` middleware, key `"rationsmart-storage"`, default localStorage
storage. `partialize` keeps: `user`, `feedSelectionType`, `cattleInfo`,
`feedSelections`, `dietLimits`. `reportData` and `snackbar` are session-only.

`skipHydration` is DISABLED — see §10.1.

### How `feedSelections` is consumed

`/feed-selection` pads the stored array up to **3 rows minimum** when it
mounts (`while (stored.length < 3) stored.push(createFeedItem())`). So:
- A brand-new session shows 3 empty FeedRow instances.
- A restored simulation with 5 stored items shows 5 rows.
- A restored simulation with 1 stored item shows that 1 + 2 empty rows
  padded to reach 3.

Use `setFeedSelections([...])` directly when you want to override (e.g.
after Reset on cattle-info → empty array; after simulation restore →
the loaded array). The 3-row pad runs only on initial mount.

### How `user.pin` and localStorage `user_id` interact

`setUser(user)` writes the user object via persist AND also writes
`localStorage.setItem("user_id", user.id)` as a side effect. `logout()`
removes `user_id` from localStorage in addition to clearing the store.
The `user_id` localStorage key is not actively read anywhere in the
current PWA — it's vestigial parity with Android (which uses
SharedPreferences for the same purpose). Don't remove it; future
features may rely on it as an independent fast path.

### `User` shape
```ts
interface User {
  id: string;
  name: string;
  email: string;
  country: string;       // human name e.g. "India"
  country_id: string;
  country_code: string;  // e.g. "IN"
  currency: string;      // raw code e.g. "INR" (NEVER Intl-converted)
  pin: string;           // 4 digits — also written to localStorage user_id alongside this
  is_admin: boolean;
}
```

---

## 12. Theme & visual tokens

All colors taken from Android resources. Do not invent new colors. In code use
`COLORS` from `src/lib/colors.ts` (Android names; a few documented web-only greys).

| Token | Hex | Role |
|---|---|---|
| dark_aquamarine_green | `#064E3B` | primary headings, focused outlines, icons |
| go_green | `#1CA069` / `#05BC6D` | brand greens (filled buttons, success) |
| go_green_15 | `rgba(5,188,109,0.15)` | tinted icon pills, indeterminate-progress track |
| bright_gray_new | `#E4F7EF` | dropdown zebra row, selected-row pill |
| raisin_black | `#231F20` | body text |
| dark_silver | `#6D6D6D` | label / placeholder gray |
| spanish_gray | `#999999` | disabled / hint gray |
| light_gray_new | `#D3D3D3` | disabled-button bg |
| sage_breeze → mint | `#C8E6C9 → #E8F5E9` | admin gradient (135 deg) |
| honeydew | `#F0FDF4` | mint tint for icon pills |
| carmine_pink | `#E44A4A` | errors, logout link |
| red_ryb | `#FC2E20` / `#FC2E20` | required-asterisk, urgent red |
| peachy_pink | `#FEC5BB` | error-state banner bg |
| mustard | `#FFDB58` | snackbar error bg, filled stars in feedback lists (the rating *input* uses mustard_yellow `#E3B505`, Android FragmentFeedback) |
| silver_sand | `#C2C2C2` | empty stars |
| vivid_gamboge | `#FF9800` (+ `vivid_gamboge_15` = 15 % alpha) | warning amber, evaluation chip |
| dark_yellow | `#FFB300` | advisory icon |
| fire_orange | `#FF7800` | advisory title |
| celtic_blue | `#296CD3` | recommendation chip |
| azure | `#007BFF` | info snackbar, milk droplet |
| ultramarine | `#1E40AF` | feature-request feedback category |
| dark_green_turquoise | `#10B981` | optimal banner icon |
| crayola_green | `#1CA069` | admin-reports user name |
| authentic_white | `#F8FAF9` | default body background |
| american_diamond | `#F1F5F9` | input pill background, shimmer base |
| sparkling_silver | `#C9CBCC` | scrollbar |

Font: Nunito (regular 400, bold 700). Use `fontFamily: "Nunito, sans-serif"`
everywhere.

**Material Outlined-Box pattern** (cattle-info, FeedRow `FieldBox`):
white background, 1.5 px border (`#DCE0E4` empty / `#064E3B` filled),
16 px radius, label cutout on top border at left 12 px, red asterisk
after label.

---

## 13. Common tasks — playbooks

### Adding a new screen
1. Decide if it's auth-gated (`(main)/`) or public.
2. Mirror the Android XML structurally — padding, section spacing,
   toolbar height, button radii.
3. Use design tokens from §12. Don't introduce new colors.
4. Dropdowns → `CustomSelect`. Numeric fields → safe by default (the
   global `NumberInputGuard` is mounted).
5. Add the route to `NavDrawer` menu if needed.

### Adding a new API endpoint
1. Hit via `/api/proxy/<path>` (never call the backend host directly).
2. Add the typed helper to `src/lib/api.ts` next to its domain group.
3. FastAPI requires trailing slashes — the proxy adds them; no client
   action needed.

### Backend swap (e.g. moving prod IP)

**For prod** (`rationsmart-prod` → `rationsmart.vercel.app`):
1. Operate from a prod-linked worktree (see "Operating on the prod
   project from CLI" below) OR use the Vercel dashboard.
2. `vercel env rm BACKEND_HOST production` then
   `vercel env add BACKEND_HOST production` with the new value. Repeat
   for `BACKEND_PORT` if changed.
3. Trigger a redeploy — env-var changes don't auto-redeploy. Either
   `vercel --prod --yes` from the worktree, or push any code change.
4. Verify: `curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries`
   → `x-backend-env: prod`, `x-backend-host` matches the new IP.

**For dev** (`rationsmart-pwa` → `rationsmart-pwa.vercel.app`):
The dev project's env vars are scoped to `Development` only (§10.13), so
updating them via `vercel env add ... development` will NOT change the
deployed Production URL behavior. To move the dev backend you have two
options:
- **Option A — code change:** edit the hardcoded fallback in
  `src/app/api/proxy/[...path]/route.ts:4-5`. Push to main; both projects
  redeploy (prod is unaffected because its env vars override the fallback).
- **Option B — env-var rescope:** re-add `BACKEND_HOST` and `BACKEND_PORT`
  on the `rationsmart-pwa` project scoped to **Production** (or All
  Environments) with the new value, then trigger a redeploy.
Verify with `x-backend-env: dev` (or `custom` if you pointed at something
other than the two known IPs).

### Operating on the prod project from CLI
This checkout is linked to
`rationsmart-pwa` (dev). For prod-specific CLI operations:
```bash
git worktree add --detach /tmp/rs-prod main
cd /tmp/rs-prod
vercel link --yes --project rationsmart-prod
# ... env operations / direct deploys ...
cd - && git worktree remove /tmp/rs-prod --force
```

### Diagnosing "stuck" or "white screen"
- DevTools → Application → Service Workers → Unregister, then hard
  refresh.
- Application → Storage → Clear site data nukes everything (last
  resort; logs the user out).
- Network → look for `x-backend-env` header on the first proxied
  call to confirm dev vs prod.

### Pushing — `gh` two-account gotcha
If `git push` returns `Permission to ... denied to CodeSquish`, the
machine's `gh` has multiple GitHub accounts and the wrong one is active.
Fix: `gh auth switch -h github.com -u Aiyappa-DigitalGreen`.

---

## 14. What NOT to do

- **Don't add files for the sake of decomposition** — but keep pages and
  components under ~600 lines. On 2026-09-30 the user asked for the large
  files to be split (audit B-17): logic went into hooks / pure modules
  next to the page (`src/components/<screen>/`), sheets and cards into
  components with explicit props; state stays in the page. Pure mapping
  and validation (`cattle-info/restore.ts`, `feed-selection/preflight.ts`)
  is unit-tested. New code joins the right module rather than growing a
  page back past the limit.
- **Don't replace inline styles with Tailwind classes wholesale** — many
  components encode Android-exact pixel values (border-radius 16,
  padding 10/12, line-heights). Mixed is fine.
- **Don't add npm packages without a clear need.** Current stack is lean
  on purpose. New libs cost bundle bytes on a mobile-first PWA.
- **Don't generate `.md` docs unless the user explicitly asks.** This
  file is the exception — it's the project's persistent context. The
  user has said "never write docs without asking" in past sessions.
- **Don't reintroduce `skipHydration`** on the persist store (see §10.1).
- **Don't use `<select>` for new dropdowns** — always `CustomSelect`
  (see §10.7).
- **Don't bypass the proxy** by calling the backend host directly from
  client code — CORS will break it and you lose the env scoping.

---

## 15. Quick reference — Vercel + git commands

```bash
# Standard deploy cycle on the testing branch (current dev URL)
git add <files>
git commit -m "<message>"
git push origin testing                                          # RationSmart repo
git push pwa testing:main                                        # RationSmart-PWA (main only)
vercel deploy --prod --yes                                       # prints the new hash URL
vercel alias set <new-url> rationsmart-testing.vercel.app        # promote to canonical

# Inspect current project (this dir = rationsmart-testing)
vercel env ls
vercel ls

# Check upstream backend on any deployed URL
curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries | grep -i x-backend
curl -sI https://rationsmart-pwa.vercel.app/api/proxy/auth/countries | grep -i x-backend

# Two-account git fix
gh auth status
gh auth switch -h github.com -u Aiyappa-DigitalGreen
```

---

## 16. PWA infrastructure

- `next.config.mjs` wraps the app with `@ducanh2912/next-pwa`:
  - Workbox runtime caching: `NetworkFirst`, cache name `runtime-cache`,
    max 200 entries, 24-hour expiration, 10-s network timeout.
  - `skipWaiting: true`, `clientsClaim: true` — new SW takes over on first
    activation.
  - `disable: process.env.NODE_ENV === "development"` — no SW in dev.
  - `cacheOnFrontEndNav: false`, `aggressiveFrontEndNavCaching: false`,
    `reloadOnOnline: true`.
- Root layout sets `themeColor: "#FFFFFF"`, swapped to admin sage by
  `(main)/admin/layout.tsx` on mount.
- Manifest at `/manifest.json`. Apple touch icon at
  `/apple-touch-icon.png`. Standalone display mode declared via
  `apple-mobile-web-app-capable` + `mobile-web-app-capable` meta tags.

---

## 17. Adding a future feature — checklist

When a new feature requirement arrives:

1. **Is there an Android equivalent?** If yes, find the XML layout +
   Kotlin Fragment/ViewModel and read them before touching the PWA.
2. **What store state does it read/write?** If new state, add to
   `AppState` + `partialize` (if it should survive a refresh).
3. **What APIs does it need?** Add typed helpers to `src/lib/api.ts`
   under the relevant domain group.
4. **What validators?** Reuse existing where possible; add to
   `validators.ts` only if Android has a corresponding one.
5. **Theme:** all colors from §12; no exceptions.
6. **Components:** dropdowns → `CustomSelect`, fields → `FieldBox` (for
   outlined-box look) or `InputField` (for gray-pill look), modals →
   centred on the column not the viewport (see Generating Report
   dialog / NavDrawer for the pattern).
7. **Toolbar:** `Toolbar` with the right `type`. Use `paddingTop:
   max(12px, env(safe-area-inset-top))` if you're building your own
   toolbar (not via the shared component).
8. **Test the SSR/hydration path** — hard-refresh the new route on the
   deployed dev URL. If anything's flickering or redirecting, see §10.1.
9. **Push + deploy.** Per §10.16 — manual only:
   `git push origin testing` then `vercel deploy --prod --yes` then
   `vercel alias set <new-url> rationsmart-testing.vercel.app`.

---

## 18. i18n V2 — backend feed-data translation (Phase 1 shipped 2026-06-25)

Spec source: the backend i18n V2 handoff folder (`post_impl_multi_language/`; local path in CLAUDE.local.md)
  - `api_endpoints_for_frontend.md` — the API contract (load first)
  - `technical_documentation.md` — backend invariants + DB schema
  - `user_functional_guide.md` — end-user flow

### 18.1 What's translated and what isn't

**Translated** (server returns `display_*` fields on a per-language basis):
feed names, feed types, feed categories.

**NOT translated** (English everywhere — by design, per user functional
guide): UI labels, button text, headings, advisory text, report
headings, snackbars, validation messages. The separate xlsx at
`docs/RationSmart_i18n_source.xlsx` is for a future UI-label
translation effort and is unrelated to backend i18n V2.

### 18.2 Five design invariants (from the backend doc)

| # | Invariant | Frontend implication |
|---|---|---|
| I1 | English source columns are never overwritten | `fd_name`, `fd_type`, `fd_category` stay the identity fields the frontend uses for backend lookups + comparisons |
| I2 | Localization happens at read-time only | Never store translated strings in a saved simulation / report — only display them |
| I3 | `'en'` is the implicit baseline | Server's `display_*` always falls back to the English source; frontend can render `display_*` unconditionally |
| I4 | Languages are DB data, not code | Don't hardcode the supported-languages list. Read `country.supported_languages` from `/v1/auth/countries` |
| I5 | Translation work is country-scoped | Admin tooling (Phase 2) always filters by `country_id` |

### 18.3 Phase 1 — frontend wiring (already shipped — commit `2dc7b9c`)

`src/lib/store.ts`:
- `User.preferred_language: string` (defaults to `"en"`)
- `setLangProvider(() => useStore.getState().user?.preferred_language ?? "en")`
  wires the active locale into api.ts at module load.

`src/lib/api.ts`:
- `Country.supported_languages?: string[]` — read from `/v1/auth/countries`
- `LANGUAGE_NATIVE_LABELS` — native-script display names map
  (en/hi/tl/id/th/vi/bn/ne/am/om/sw)
- `labelForLanguage(code)` — falls back to `code.toUpperCase()` for
  unknown codes (so new backend-added languages don't break the UI)
- `langProvider` + `langParam()` — every feed endpoint spreads
  `...langParam()` into its `params` so `?lang=` is always sent
- `getFeedTypes`, `getFeedCategories`, `getFeedSubCategories`,
  `searchFeeds` — all send `?lang=`
- `searchFeeds` parser exposes `display_name` / `display_type` /
  `display_category` on each result (with English-source fallback
  baked in, so renderers can use `display_*` unconditionally)
- `FeedSearchResult`, `FeedSubCategoryItem`, `FeedBreakdown`,
  `CostEffectiveDiet` all carry optional `display_*` fields
- `updateUserProfile()` accepts optional `preferred_language`

`src/app/login/page.tsx`:
- Reads `preferred_language` from `getUserProfile` response → `setUser`

`src/app/(main)/profile/page.tsx`:
- New Language dropdown under Country, visible only when
  `supported_languages.length > 1`
- Native-script labels via `labelForLanguage()`
- Save path sends `preferred_language` only when the selector is
  visible (avoids poking older backends that 400 on the field)
- `canSave` enables when language alone changed

`src/components/FeedRow.tsx`:
- Feed dropdown options use `display_name` (binding stays
  `feed_uuid`)

`src/app/(main)/feed-selection/page.tsx`:
- Search-result rows render `display_name` + `display_type · display_category`

`src/app/(main)/report/page.tsx`:
- Feed Breakdown (eval) + Cost-Effective Diet (rec) prefer `display_name`

### 18.4 Identity vs display invariant — CRITICAL

When picking from search results or dropdowns, use the *English source*
field (`feed_name`, `feed_type`, `feed_category`) for:
- Comparisons (`feed_type === "Forage"`)
- Storage on `cattleInfo.feedSelections[]` (Zustand state)
- API payloads (`feed_selection[].feed_id = item.feed_uuid`)

Use `display_name` / `display_type` / `display_category` ONLY for
rendering. Future sessions: never store a `display_*` value as the
identity field of a row — it will silently break comparisons (e.g. the
Forage-required gate, the rec-mode F:C ratio cross-ref, the cascade
match logic) when the user changes language.

### 18.5 Phase 2 — admin tooling (shipped 2026-06-29)

**Two admin screens, not three** — the original three-screen design was
collapsed into a unified "Language Catalog" page after user feedback.
History:
- commit `798f706` (2026-06-25): shipped 3 separate screens —
  `/admin/translations`, `/admin/languages`, `/admin/country-languages`.
- commit `d3b27da` (2026-06-29): merged `/admin/languages` +
  `/admin/country-languages` into one page. The country-languages
  route now redirects to `/admin/languages`.
- commit `b178e1d` (2026-06-29): switched the merged page to
  show ONLY enabled languages per country (was previously showing
  every catalog language under every country with toggles, which
  confused admins — "why does Vietnam need Hindi"). New flow: tap
  "+ Add Language" inside a country card to enable a NEW one.
- commit `518eba8` (2026-06-29): added a "Seed Defaults" button
  to assign the canonical rollout locales in one tap.
- commit `d451de9` (2026-06-29): verbose `[seed]` console logging
  on the seed action.

Current screens and what they hit on the backend:

**`/admin/translations`** — bulk workbook + coverage
- Country picker shared at the top
- Section 1: Download Template (3.1) + Upload Workbook (3.2) +
  import-result panel (counts of inserted/updated/skipped/errors)
- Section 2: Coverage check (3.3) — three progress bars (Feeds,
  Feed Types, Categories) colour-coded green ≥80, amber ≥40, red <40
- Per-feed editor (3.4-3.6) endpoints exist in api.ts but no UI
  consumes them yet; intentional — the workbook path is primary

**`/admin/languages` — REMOVED 2026-09-28 (now a redirect).** The unified
catalog screen (and its Seed Defaults flow) was unlinked on 2026-07-20 when
`/admin/country-language` replaced it, then deleted in the audit clean-up
(B-18). `/admin/country-language` covers catalog add / activate / deactivate,
per-country assign / unassign and feed-name translations.

**Routes (current)**:
- `/admin/country-language` — the one country / language / translation
  screen. Its Feed Names tab (`?tab=feeds`) has the workbook export/import,
  per-feed names and the coverage check (TranslationCoverageCard).
- `/admin/translations` → redirects to `/admin/country-language?tab=feeds`
  (merged 2026-09-28, audit B-18); `/admin/languages` and
  `/admin/country-languages` → redirect to `/admin/country-language`.
- Admin landing i18n tiles: "Translations" (opens the Feed Names tab) and
  "Country/Language"

**api.ts helpers under "i18n V2 Phase 2":**
- `downloadTranslationWorkbook(country_id)` — blob xlsx (3.1)
- `uploadTranslationWorkbook(country_id, file)` — multipart (3.2)
  · CRITICAL: no explicit Content-Type — same boundary-preservation
    technique as bulkUploadFeeds
- `getTranslationCoverage(country_id, lang)` (3.3)
- `upsertFeedTranslation`, `listFeedTranslations`,
  `deleteFeedTranslation` (3.4-3.6) — exported, unused in UI
- `createLanguage({code, name})` (4.1)
- `listLanguages()` (4.2)
- `patchLanguage(code, {name?, is_active?})` (4.3) — exported, but
  the global is_active toggle was DROPPED from the merged UI per the
  user's "single concept = per-country" decision. The helper stays
  available for future use.
- `listCountriesWithLanguages()` (4.4)
- `assignLanguageToCountry(country_id, code)` (4.5)
- `unassignLanguageFromCountry(country_id, code)` (4.6)

### 18.6 Quality bands for the docs/RationSmart_i18n_source.xlsx

This 554-row spreadsheet contains *frontend UI labels* translated into
9 locales (hi/tl/id/th/vi/bn/ne/am/om). It's a SEPARATE effort from
backend i18n V2 — that document is about *feed data*. UI labels are not
plumbed through any backend; the xlsx is a holding area for when (if)
the frontend ever picks up its own UI translation layer. Don't try to
make backend endpoints consume it.

---

---

## 19. Backend API changes absorbed 2026-09-21 (defect round)

Source: the backend `defects/` folder (local path in CLAUDE.local.md) — four backend reports. All of the
custom-diet-limits and search-feeds work is **deployed** on
`<DEV_BACKEND_IP>:8000`; verify anything here against
`http://<DEV_BACKEND_IP>:8000/openapi.json` rather than from memory.

### 19.1 `base_thresholds` — send only what the user set

**Never merge a client-side default underneath the user's limits.** The
old rule ("always send `base_thresholds`, merged over
`DEFAULT_BASE_THRESHOLDS`") was Android parity and was harmless only
while the backend mis-read percentages as fractions. The backend now:

- divides `pct_dm` keys by 100 (so the client keeps sending percent),
- validates every key against a **per-physiological-state, tighten-only**
  range,
- rejects `0` and anything out of range with a raw FastAPI 422.

`DEFAULT_BASE_THRESHOLDS` (ash 10, ee 7, ndf 45, starch 26) was deleted
and **must not come back** — those values over-constrained lactating
diets and 422'd every Dry Cow / Heifer run. An **omitted key** is the
only way to say "use the engine's default for this animal".

### 19.2 `GET /v1/animal/diet-thresholds?physiological_state=` is the source of truth

The Custom Diet Limits dialog binds its rows to this endpoint for unit,
direction and enforcement. **Superseded 2026-09-30 for range and default:**
at the user's request the per-state `min` / `max` / `default` come from
`src/lib/diet-limit-ranges.ts` (RFT_FD_Lib_Y2test.xlsx, sheet
"Constraints") and **override** the endpoint's values; if the endpoint
fails, the dialog is built from that table instead of being disabled.
Edit the table when the sheet changes. Blank still omits the key (the
engine's own default applies), so the engine must match the sheet.

- Eight keys. Six are `pct_dm`; `nel_balance_max` (Mcal/day) and
  `mp_balance_max` (kg/day) are **absolute and must never be scaled**.
- `direction: "min"` (only `ndf_for_min`) is a floor — tightening raises
  it, so its `min` equals the default, not its `max`.
- `enforcement: "soft"` (`ndf_max` / `starch_max` / `ee_max`) means the
  optimizer only penalises the breach and may exceed it. This is an
  ENGINE detail and is **not surfaced in the UI**. An earlier build
  showed soft rows as a "Target" badge and the rest as "Limit"; on
  2026-09-22 Maria and Satish ruled that all eight are limits and had
  the badges removed. `enforcement` stays on `DietThresholdSpec` (the
  payload contract still carries it) — **don't reintroduce the badge**.
- Returns 422 for `Baby Calf/Heifer`; the dialog isn't rendered for it.
- If the fetch fails the dialog falls back to the sheet table (above);
  it's disabled only for a state the table doesn't cover.
- **Row order is client-side and fixed.** The endpoint returns the
  engine's order; the dialog re-sorts with `DIET_LIMIT_DISPLAY_ORDER` /
  `sortDietThresholds()` in api.ts (Forage NDF Min, NDF Max, Starch Max,
  Concentrate Max, EE Max, Ash Max, Energy Surplus Max, Protein Surplus
  Max — Maria's importance order, 2026-09-22). An unlisted key the
  backend adds later still renders, after the known eight. Covered by
  the "orders the limits as specified" test in
  `src/app/__tests__/feed-selection.test.tsx`.
- **Default-value copy.** "Default value will be applied if left blank"
  sits once under the sheet title; each row's hint reads
  `Range <min> – <max> <unit> (Default <default>)`. The old per-row
  "leave blank for the default N" phrasing was replaced on 2026-09-22.

### 19.3 Per-feed inclusion limits reject a typed `0`

`min_kg_asfed` / `max_kg_asfed` are `exclusiveMinimum: 0`. Omitting the
key means "no bound". A `0` can only be user-typed, so it's flagged in
the field and blocks Generate (`inclusionBoundIsInvalid` in
validators.ts). **Never coerce a typed 0 into an omitted key** —
silently discarding the user's input is the defect, not the fix.

### 19.4 `?lang=` is a QUERY param on the two diet POSTs

`POST /v1/animal/diet-recommendation?lang=` and `/evaluate-diet?lang=`.
A `lang` key in the JSON body is ignored **silently**. The backend
renders and persists `report_html` at creation time in the resolved
language and the PDF reuses it, so omitting it freezes the report in the
profile language permanently.

### 19.5 Feed Category must be filtered client-side

`GET /v1/animal/unique-feed-category` accepts only `country_id` and
`lang` — the `feed_type` the client sends is **dropped**, which is why
Concentrate categories appeared under Forage. `getFeedCategories()`
intersects that country list with
`GET /v1/feed-classification/get-categories/{type_id}` (type id from
`/v1/feed-classification/get-feed-types`, no auth needed). Every failure
path falls back to the unfiltered list — an empty dropdown is a dead
end.

### 19.6 `feed_name_en` on search results

`/v1/animal/search-feeds` searches the English name **unconditionally**
plus the request's language, so a match can display in a script the user
didn't type. `feed_name_en` is rendered in parentheses when it differs
from the display name.

### 19.7 Lactation-only surfaces

- **Days in Milk** renders (and is required) only for `Lactating Cow`.
- **Methane Intensity** (g/kg ECM) is displayed only for
  `Lactating Cow` — the engine still calculates it for other states.

### 19.8 Still blocked

- QA rows 7 / 8 / 9(full map): need the `Fd_Cat&Type` and
  `Input_display` tabs of `RFT_FD_Lib_Y2test.xlsx`, which aren't in the
  copy we have.
- QA row 2 (language switching on Cattle Info): needs Maria's screen
  recording — see the notes in that row.
- Restored `custom_constraints` may be persisted as **fractions**
  (0.06) rather than percent (6); unverified. We deliberately don't
  rescale on a hunch — feed-selection's pre-flight catches an
  out-of-range restored limit and tells the user to adjust it.

---

## 20. Security & quality audit hardening (2026-09-28)

Source: an external CodeRabbit-style audit (kept OUT of the repo — never
commit it; the full per-item response with won't-fix reasons lives in the
untracked `docs/AUDIT_RESPONSE.local.md`). These are now invariants:

- **No infra details in tracked files.** Backend IPs, Vercel IDs, account
  slugs and local paths go in the untracked `CLAUDE.local.md` /
  `.env.development`, never in code, comments, tests or this file.
  `docs/backend-security-brief.html` and `docs/SESSION_HANDOFF.md` are
  gitignored — don't re-add them.
- **Proxy** (`src/app/api/proxy/[...path]/route.ts`): env-only backend
  config (fails closed); request AND response header allowlists; no
  `x-backend-host`; `x-backend-env` from `BACKEND_ENV`; no trailing slash;
  dot segments rejected; 5 MB body cap; 301/302/303 followed only for
  GET/HEAD. The testing project needs `BACKEND_ENV=dev` set.
- **No logging of bodies, tokens or PII.** Tracing is opt-in via
  `NEXT_PUBLIC_DEBUG_API=true` (never `/auth/*` bodies). Console
  stripping is no longer disabled by `DISABLE_PWA`. `no-console` is a
  lint warning. Never `console.*(err)` an axios error — its config holds
  the `Authorization` header.
- **Old PIN never in a URL.** `/login` → `/set-new-pin` uses the
  memory-only `pendingPinReset` slice (not persisted).
- **SW never caches `/api/proxy/*`** (first Workbox rule is NetworkOnly);
  `logout()` deletes the `runtime-cache`. The SW kill-switch script in
  the root layout renders only when `DISABLE_PWA=true`.
- **Backend-supplied URLs go through `safeExternalUrl()` /
  `openExternalUrl()`** (`src/lib/safe-url.ts`) before `window.open` or
  `<a href>`. Filenames from Content-Disposition go through
  `filenameFromContentDisposition()`; uploads through
  `uploadFileProblem()` (`src/lib/download.ts`).
- **Admin guard lives in `admin/layout.tsx`** for every admin route. It's
  UX only; the backend must 403 `/v1/admin/*` for non-admins.
- **Admin feed edit echoes `fd_code` / `fd_orginin` / `fd_season` /
  `fd_ipb_local_lab`** from the loaded record (`""` only on add). This
  refines §10.15: the field is still always SENT, just no longer wiped.
- **Admin users:** deactivating asks for confirmation; an admin can't
  deactivate themselves; the sheet's Save only commits a changed switch.
- **Report currency order** is `cost_analysis.currency` → `currency` →
  `user.currency` (§5 was right; the code had it inverted).
- **Custom Diet Limits:** only keys present in the fetched spec are sent;
  if the spec couldn't load, none are sent and the user is told.
- **`/admin/country-languages` redirects to `/admin/country-language`**
  (the live screen). `/admin/languages` is now also just a redirect there.
- **Shared constants:** `PIN_LENGTH` / `LEGACY_PIN_LENGTH`
  (validators.ts), `API_TIMEOUT_MS` / `UPSTREAM_TIMEOUT_MS` (timeouts.ts).
- **CI:** actions pinned by SHA, `permissions: contents: read`; the deploy
  workflow was deleted (deploys are manual `vercel deploy`).
- **Shared building blocks (pass 2, 2026-09-28)** — reuse these, don't
  re-copy: `authErrorMessage()` (lib/errors.ts), `useEscapeKey()`
  (lib/use-escape.ts — every sheet/dialog gets `role="dialog"`
  `aria-modal` + Escape), `ui/Spinner`, `COLUMN_LEFT`/`COLUMN_WIDTH`
  (lib/column.ts), `collectPages()`/`ADMIN_PAGE_SIZE` (lib/pagination.ts —
  admin lists fetch every page), `allSettledLimited()` (lib/concurrency.ts),
  `SUPPORT_EMAIL` (lib/contact.ts), `inclusionBoundsCrossed()`.
- **CustomSelect is a listbox:** options are `role="option"` (tests pick
  them with `findByRole("option", …)`), arrow keys move focus.
- **Session = httpOnly cookie (A-04, 2026-09-30).** The proxy moves the
  login JWT into `rs_session` (HttpOnly, SameSite=Strict, Secure on https,
  Path=/api), strips it from the JSON, and adds `Authorization` itself. The
  browser never holds the token; `User.token` is legacy-only and migrated
  via `/api/session` (POST). Cookie-carrying non-GET calls must be
  same-origin (CSRF). End a session with `endServerSession()` (NOT inside
  `logout()`, which /login calls right after the cookie is set).
  `BACKEND_PROTOCOL=https` switches the upstream hop to TLS (A-02).
- **Pass 3 (2026-09-28):**
  - `src/lib/api.ts` is a **barrel**; code lives in
    `src/lib/api-client/{models,client,auth,feeds,reports,admin}.ts`. Add
    new endpoints to the right module and re-export them from the barrel —
    callers and `vi.mock("@/lib/api")` must keep importing from the barrel.
  - The proxy forwards **only `/v1/*`** (404 otherwise).
  - Colours come from `COLORS` (`src/lib/colors.ts`, Android names); no new
    hex literals. Don't add inline `fontFamily` — `body` sets Nunito.
  - `DialogFocusTrap` (root layout) traps Tab in the top `aria-modal`.
  - Diet request bodies are built in `src/lib/diet-request.ts`.
  - UI timings in `src/lib/ui-timings.ts`; forgot-PIN via `useResetPin`.
  - CI runs `npm run lint:promises` (type-aware no-floating-promises; mark
    deliberate fire-and-forget with `void`) and `npm run test:coverage`
    (floors in vitest.config.ts — only raise them).
  - `noUncheckedIndexedAccess` is on for app code.
- **Pass 5 (2026-09-30):**
  - Parse responses with `lib/api-client/normalize.ts` (`listFrom`,
    `stringField`, `numberField`, `messageOf`, `asRecord`) — no new
    `as {…}` / `as unknown as` casts. Import it directly, not via the
    `@/lib/api` barrel (tests replace the barrel with `vi.mock`).
  - The api client rejects with `Error & { status }` — **never read
    `err.response`**; use `errorStatus(err)` from `lib/errors`. Test
    fixtures must use the same shape.
  - Saved simulations echo per-feed bounds as `min_kg_asfed` /
    `max_kg_asfed` (wire names); `min_kg_per_day` is the store name.
  - Admin screens use `t()` too. Snackbar translates its message at render.
  - `FieldLabel` is a `<label>`; pass `htmlFor` for inputs only, never for
    a `CustomSelect` trigger (it would replace the value in its name).
  - ESLint runs in `next build` (`ignoreDuringBuilds: false`) with
    `@typescript-eslint/recommended`.
  - Tracked docs write the dev backend as `<DEV_BACKEND_IP>`; local paths
    live in CLAUDE.local.md.
- **Tests are type-checked** (`tsconfig.test.json`, part of
  `npm run typecheck`). `@typescript-eslint/no-unused-vars` is on
  (prefix `_` to opt out).

Deliberately NOT changed (reasons in `docs/AUDIT_RESPONSE.local.md`):
backend-dependent items (TLS to the backend, httpOnly-cookie session,
server-side admin/role enforcement, token revocation, rate limits,
generic auth messages), a full script/style CSP, pinch-zoom and persisted
`reportData`. (The large-page split was done on 2026-09-30 — see §14.)

---

If you (a future Claude session) are about to do something this document
discourages — pause, re-read the relevant section, then either follow the
documented pattern or surface the deviation to the user before proceeding.
