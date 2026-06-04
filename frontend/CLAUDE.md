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

## 2. Two-URL deployment topology — do not confuse

**Two independent Vercel projects, same GitHub repo.** Every push to `main`
deploys BOTH in parallel.

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

1. **Push + deploy on every code change.** After any modification:
   ```
   git push origin main      # auto-deploys both projects
   vercel --prod --yes       # belt-and-braces for the dev project
   ```
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

#### `/terms` and `/help` — Static text pages
- Plain layout with `<Toolbar type="back">`. No state, no API calls.

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
- Radio toggle Recommendation/Evaluation. In Evaluation mode every row
  also shows Quantity (kg/day) + computed Cost cell.
- "Custom Diet Limits" and "Custom Feed" pill buttons across the top
  of the form area (matching Android two-button row).
- `FeedRow` per feed (initially 1, "+ Add Feed" button up to N). Each
  row has its own internal API state for type/category/feed dropdowns
  (see §6 FeedRow).
- Custom Feed bottom sheet (Android `DialogAddCustomFeed`):
  - Loads feed types via `getFeedTypes(user.country_id, user.id)`,
    categories via `getFeedCategories(feed_type, country, user)`.
  - Nutritional fields collapsible. On submit: `checkInsertOrUpdate`
    (only when editing an existing user-owned feed name), then
    `insertCustomFeed(...)`.
- Custom Diet Limits modal: edits `dietLimits` Partial<DietLimits> (ash,
  ee, ndf, starch maxes). Saved values flow into `recommendDiet`'s
  `base_thresholds` merged over `DEFAULT_BASE_THRESHOLDS`.
- `handleGenerateClick` — pre-flight: any row that has partial selection
  but missing required pieces (feed_uuid, price_per_kg, quantity when
  evaluation) is shown in an "Incomplete Feeds" dialog before allowing
  submission. Otherwise `generateReport()` fires.
- `generateReport()` calls either `evaluateDiet({...})` or
  `recommendDiet({...})`, sets `reportData` (with `mode` discriminator),
  sets `dietLimits`, pushes `/report`. `GeneratingReportDialog` overlays
  during the request.

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
- `saveReport` button: POST `/save-report` with `{report_id, user_id}`,
  flips an `isSaving` state, shows backend's `message`.
- Currency rendering: `currencySymbol` reads first from `cost_analysis.currency`
  (evaluation), then `currency`, then `user.currency`. Always rendered as
  suffix `"108.5 VND"`.

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
- Three-tab navigation (`tab` state = "feeds" | "types" | "categories"),
  driven by a `section` state ("landing" | tab name) that toggles between
  card landing view and the sub-section list.
- `loadAll()` runs `Promise.all([getAdminFeedTypes, getAdminFeedCategories,
  getAdminFeeds, getCountries])`.
- Feed CRUD: openAdd / openEdit pre-fills `feedForm`. Save → `addAdminFeed`
  or `updateAdminFeed(feed_id, ...)` with the FULL nutritional payload
  (every field is a `Number(v) || 0`). Delete via `deleteAdminFeed`.
- Category CRUD: `addAdminFeedCategory({category_name, description,
  feed_type_id, sort_order})` / `deleteAdminFeedCategory`.
- Type CRUD: `addAdminFeedType({type_name, description, sort_order})` /
  `deleteAdminFeedType`.
- Confirm-delete dialog reused across all three (icon `ic_additional_information`,
  carmine_pink delete button).

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

#### `/admin/bulk-upload` — Import / Export (`src/app/(main)/admin/bulk-upload/page.tsx`)
- Three cards: Upload Feed CSV (drag-drop / browse), Export Standard
  Feeds, Export Custom Feeds.
- Upload: `bulkUploadFeeds(admin_user_id, file, onProgress)` →
  `multipart/form-data` POST, `onUploadProgress` drives a progress bar.
- Export: `exportAdminFeeds(admin_user_id)` or `exportCustomFeeds(...)`,
  result becomes a CSV download.
- Each panel has its own status enum (idle | uploading | success | error)
  and message strings; both reset to idle after a few seconds.

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

Each fix has a non-obvious "why". These bugs cost real session time.

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

### 10.13 SW cache → "stuck on splash" / "old bundle"
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
1. Update the env var on the right project. Prod = `rationsmart-prod`,
   dev = `rationsmart-pwa`.
2. `vercel env rm BACKEND_HOST production` then `vercel env add` — env
   changes don't auto-redeploy; trigger a fresh deploy.
3. Verify: `curl -sI https://rationsmart.vercel.app/api/proxy/auth/countries`
   → look for `x-backend-host` / `x-backend-env` in the response.

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
