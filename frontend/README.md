# RationSmart PWA

A Progressive Web App for **RationSmart**, the cattle-feed ration formulation
tool. It is the web version of the RationSmart Android app: farmers and
extension workers enter cattle details, pick available feeds, and get a
least-cost, nutritionally balanced diet with a downloadable report.

Built with **Next.js 14 (App Router)**, React 18, TypeScript, Tailwind CSS and
Zustand. Installable on phones and desktops, with an offline fallback page.

---

## Features

**For users**
- Registration and login with email + 6-digit PIN, email verification,
  forgot-PIN / reset-PIN flows
- Cattle information (lactating, dry, calf), feed selection and custom feeds
- Diet recommendation and evaluation, calf feeding plan
- Saved diet reports with PDF download
- Profile, feedback, help and terms screens
- Multi-language UI (English plus Amharic, Bengali, Hindi, Indonesian,
  Nepali, Afaan Oromo, and more from the backend)

**For admins**
- User management
- Feed library: browse/edit feeds, bulk upload from spreadsheet, scheduled
  feed-library sync
- Countries, languages and translations
- Feedback and report review, Excel exports

---

## Getting started

### Prerequisites
- Node.js **20** (see `.nvmrc`)
- Access to a RationSmart backend (FastAPI, v1 API)

### Setup

The PWA lives in the `frontend/` folder of the RationSmart monorepo (the API
is in `backend/`). Run every command below from `frontend/`.

```bash
git clone https://github.com/ucdavis/rationsmart.git
cd rationsmart/frontend
npm install
cp .env.example .env.development   # then fill in the backend values
npm run dev                        # http://localhost:3000
```

### Environment variables

Set these in `.env.development` locally, or on the hosting project for
deploys. See `.env.example` for the full annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `BACKEND_HOST` | yes | Backend host name or IP |
| `BACKEND_PORT` | yes | Backend port (usually `8000`) |
| `BACKEND_PROTOCOL` | yes | `http` or `https` |
| `BACKEND_ENV` | no | Label shown in the `x-backend-env` response header (`dev` / `prod` / `custom`) |
| `DISABLE_PWA` | no | `true` skips the service worker (useful on test deployments) |
| `NEXT_PUBLIC_DEBUG_API` | no | `true` logs API traffic in the browser console. **Never enable for real users.** |

If the backend variables are missing, the proxy returns a 500 rather than
guessing a backend.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite (Vitest) |
| `npm run test:coverage` | Tests with coverage thresholds |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm run lint:promises` | Checks for unhandled promises |
| `npm run typecheck` | TypeScript check for app and tests |
| `npm run format:check` | Prettier check |
| `npm run i18n:check` | Every UI label is translated in all 9 languages (CI runs this) |
| `npm run i18n:sheet -- <csv>` | Compare the translation sheet with the app (`--apply`, `--missing <out.csv>`) |

---

## Translations (UI labels)

Screen text is translated in the app, not by the backend. Translations live in
`src/lib/data/ui-labels/<code>.json` (Hindi, Filipino, Indonesian, Thai,
Vietnamese, Bengali, Nepali, Amharic, Oromo), keyed by the exact English text.
The reviewed wording comes from the shared sheet
`RationSmart_Multilingual_Labels.xlsx` (tab "All Strings"), which also holds
Tigrigna, French and Arabic.

When you add or change text on screen:

1. Wrap it in `t()`. If it contains a value, translate the whole sentence as a
   template and fill it afterwards: `fillText(t("Deleted ${n} feeds."), { n })`.
   Don't build the string first (`` t(`Deleted ${n} feeds.`) `` never matches),
   and don't glue translated pieces together.
2. Add the English text and its translation to all 9 JSON files. Keep every
   `${placeholder}` exactly as in English.
3. Add a row for it to the sheet, with all 12 languages.
4. Run `npm run i18n:check`. CI fails if a label is missing from any language,
   a translation breaks a placeholder, or text skips `t()`.

To pull in reviewers' edits, download the sheet's "All Strings" tab as CSV and
run `npm run i18n:sheet -- all-strings.csv --apply`. Use
`--missing new-rows.csv` to export the labels the sheet doesn't have yet.

---

## How it works

```
Browser ──► Next.js app ──► /api/proxy/* ──► RationSmart backend (/v1/*)
                 │
                 └── /api/session   (httpOnly session cookie)
```

- **API proxy** (`src/app/api/proxy/[...path]`): every backend call goes
  through this server-side route. The browser never talks to the backend
  directly, so the backend address stays out of the client. Only an
  allow-list of headers is forwarded each way, and request/response sizes are
  capped.
- **Session**: the login token (JWT) is kept in an httpOnly cookie, not in
  `localStorage`, and the proxy attaches it as `Authorization: Bearer …`.
- **PWA**: service worker and offline page via `@ducanh2912/next-pwa`.
  Disabled in development and when `DISABLE_PWA=true`.

### Project structure

```
src/
  app/
    (main)/          signed-in screens: cattle-info, feed-selection, report,
                     reports, calf-plan, profile, feedback, admin/*
    login/ register/ verify-email/ forgot-pin/ set-new-pin/ welcome/ help/ terms/
    api/             proxy, session routes
  components/        UI components grouped by screen (admin, report, feed-row, ui …)
  lib/
    api-client/      typed backend calls (auth, diet, feeds, reports, admin)
    data/ui-labels/  bundled UI translations
    store.ts         Zustand app state
public/              icons, fonts, manifest, offline page
```

---

## Quality checks (CI)

`.github/workflows/frontend-quality-gate.yml` (at the repo root) runs on every
push and pull request to `main` that changes `frontend/`: locked install
(`npm ci`), lint, promise lint, typecheck, format check, UI-label check and
tests with coverage. `npm audit` also runs, but for information only.
**CI never deploys.**

Run the same checks locally before pushing:

```bash
npm run lint && npm run lint:promises && npm run typecheck && npm run format:check && npm run test:coverage
```

---

## Deployment

Deploys are **manual on purpose**; pushing to GitHub does not release
anything. The app is moving from **Vercel** to **Azure**; the new setup is not
decided yet. Until it is live, the current Vercel site keeps serving users and
urgent fixes are deployed from this folder:

```bash
vercel deploy --prod --yes          # build and deploy
vercel alias set <deploy-url> <your-domain>
```

The app needs a Node server (`npm run build` + `npm start`), not static
hosting: the `/api/proxy` and `/api/session` routes run server-side.

---

## Branches and pull requests

`main` holds the current code. Work on a feature branch and open a pull
request to `main`; direct pushes are not allowed. Code owners are listed in
`.github/CODEOWNERS` at the repo root.
