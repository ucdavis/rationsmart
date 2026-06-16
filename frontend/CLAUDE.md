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
all", "why are you not analzying"). **The rule is: read the Android XML layout
or Kotlin source first, then implement against it. Never guess.**

- GitHub repo: https://github.com/Aiyappa-DigitalGreen/RationSmart
- Backend dev: `<DEV_BACKEND_IP>:8000` (FastAPI)
- Backend prod: `<PROD_BACKEND_IP>:8000` (FastAPI)

---

## 2. Deployment topology — DEV vs PROD vs TESTING

Three environments now. The first two are Vercel-hosted; the third is a
hard fork on the `testing` branch with a different API contract.

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
| `testing` | v1 API at <DEV_BACKEND_IP>:8000 | TBD — Firebase Hosting target | Firebase (planned) |

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
  `requires_pin_reset: true`, `/login` redirects to
  `/set-new-pin?email=&old_pin=` and that screen calls
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

This directory (`~/Desktop/RationSmart-PWA`) is linked to `rationsmart-pwa`
via `.vercel/project.json` — so any plain `vercel ...` command operates on
the **dev** project. To operate on `rationsmart-prod` from CLI, use the
worktree pattern in §13.

### Env-var scoping — read carefully

The proxy at `src/app/api/proxy/[...path]/route.ts` reads:
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
$ curl -sI https://rationsmart-pwa.vercel.app/api/proxy/auth/countries
x-backend-env: dev
x-backend-host: <DEV_BACKEND_IP>:8000

$ curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries
x-backend-env: prod
x-backend-host: <PROD_BACKEND_IP>:8000
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

1. **Push + deploy on every code change.** After any modification:
   ```
   git push origin main      # auto-deploys BOTH projects via GitHub integration
   vercel --prod --yes       # belt-and-braces for the dev project (this dir's link)
   ```
   The `git push` is what actually deploys both projects. The `vercel --prod`
   is a habit from the user's standing instruction "push code to github &
   deploy on every change" and acts as an extra explicit Production deploy
   on the dev project specifically (this repo's `.vercel/project.json`
   points to `rationsmart-pwa`). If GitHub integration ever silently
   detaches, the explicit deploy keeps the dev URL fresh.
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

#### `/cattle-info` — Cattle form + simulation history (`src/app/(main)/cattle-info/page.tsx`, 1020 lines)
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

#### `/feed-selection` — Diet recommend / evaluate (`src/app/(main)/feed-selection/page.tsx`, 996 lines)
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
- `FeedRow` per feed. **The first row's feed_type is LOCKED in
  recommendation mode** (`feedTypeLocked={index === 0 && !isEvaluation}`)
  — defaults to "Forage" and cannot be changed. Each row owns its own
  API state for type/category/feed dropdowns (see §6 FeedRow).
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
- **Custom Diet Limits modal:** edits `Partial<DietLimits>` (ash, ee,
  ndf, starch maxes). Empty input deletes the key. Saved values flow
  into `recommendDiet`'s `base_thresholds`, merged over
  `DEFAULT_BASE_THRESHOLDS`.
- `handleGenerateClick` — pre-flight: any row that has partial selection
  (type or category started) but missing required pieces (feed_uuid,
  price_per_kg, quantity when evaluation) is shown in an "Incomplete
  Feeds" dialog with a list of feed names/indices before allowing
  submission. Empty rows are silently ignored. Otherwise
  `generateReport()` fires.
- `generateReport()` calls `evaluateDiet({...})` or `recommendDiet({...})`,
  sets `reportData` (with `mode` discriminator), `setDietLimits(limits)`,
  pushes `/report`. `GeneratingReportDialog` overlays during the request.

#### `/report` — Diet report (`src/app/(main)/report/page.tsx`, 1101 lines)
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
  - **"New Case"** (outline button with `IcNewCase`): clears
    `feedSelections`, sets `feedSelectionType: "recommendation"`, pushes
    `/cattle-info`. Matches Android `btnNewCase`.
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

#### `/profile` — User profile (`src/app/(main)/profile/page.tsx`, 555 lines)
- Inputs: Name (`cleanNameInput` again), Country (`SelectInput`).
- API: `updateUserProfile(email, {name, country_id})` on save.
  - On country change, `setUser(...)` propagates the new `currency`,
    `country`, `country_id`, `country_code` from the country list (matches
    cattle-info pattern).
- "Reset PIN" → bottom sheet asking for email (NOT the user's own email
  — they can request reset for any email; matches Android — and there's a
  drag handle in `go_green_15` mint).
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

#### `/admin/feeds` — Feed/Category/Type CRUD (`src/app/(main)/admin/feeds/page.tsx`, 1355 lines)
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
   https://ucd-reports.s3.ap-southeast-2.amazonaws.com/feed_exports/template_upload/feeds_table_tempate.xlsx
   ```
   The filename is misspelled "tempate" — this is the actual server-side
   filename and matches Android. Saved client-side as
   `feeds_table_template.xlsx` (corrected spelling). Triggers via a
   synthetic `<a download>` click.

Each panel owns its own status enum + status banner. Banners auto-clear
after a successful or failed operation.

---

## 6. `FeedRow` deep dive — the most complex component

Lives at `src/components/FeedRow.tsx` (803 lines). One row per feed in
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

**Default first row:** if `index === 0 && !item.feed_type_name`, the
default feed type is "Forage" (matches Android `FragmentFeedSelection`).

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
| `recommendDiet(RecommendationRequest)` | POST `/diet-recommendation-working` | **Always send `base_thresholds`** (Android does this unconditionally) — merge user limits over `DEFAULT_BASE_THRESHOLDS` (ash=10, ee=7, ndf=45, starch=26) |

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

### 10.3 SplashGuard `[]` deps — don't change them
`SplashGuard.useEffect` deps MUST be `[]`. A previous attempt with
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
FastAPI 307-redirects any path without a trailing slash. The proxy at
`src/app/api/proxy/[...path]/route.ts` follows the redirect server-side
and **must emit `x-backend-host` / `x-backend-env` on BOTH the normal
and redirect branches** — otherwise most calls (auth/countries,
fetch-simulation-details, etc.) never expose the upstream host to the
browser.

### 10.12 PWA install bug — stale auth across reinstall
Android only removes the home-screen shortcut on uninstall — it does NOT
clear localStorage. `InstallPrompt` listens for `appinstalled` (Chrome's
post-install event) and `localStorage.removeItem("rationsmart-storage")`
so a freshly installed PWA always opens to login.

### 10.13 Dev URL relies on hardcoded proxy defaults
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

All colors taken from Android resources. Do not invent new colors.

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
| mustard | `#FFDB58` | snackbar error bg, filled stars |
| silver_sand | `#C2C2C2` | empty stars |
| vivid_gamboge | `#FF9800` / `#FF9F1C` | warning amber, evaluation chip |
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
The repo at `~/Desktop/RationSmart-PWA` is linked to
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

- **Don't add files for the sake of decomposition.** Current component
  granularity is intentional (FeedRow is large because the edit dialog
  is co-located; splitting it would require lifting state and lose
  the Android-`DialogFeedDetails` pattern).
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
# Standard deploy cycle
git add <files>
git commit -m "<message>"
git push origin main          # auto-deploys both projects
vercel --prod --yes           # belt-and-braces for the dev project

# Inspect current project (this dir = rationsmart-pwa = dev)
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
9. **Push + deploy.** `git push origin main && vercel --prod --yes`.

---

If you (a future Claude session) are about to do something this document
discourages — pause, re-read the relevant section, then either follow the
documented pattern or surface the deviation to the user before proceeding.
