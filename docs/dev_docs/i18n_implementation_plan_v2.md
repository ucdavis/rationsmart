# Implementation Plan V2: Internationalisation (i18n) — Multi-Language Support

> **Supersedes** `i18n_implementation_plan.md` (V1). This V2 incorporates the refinements
> agreed during design discussion: DB-driven languages (no code change to add one), a
> single unified vocabulary-translation table, a country-scoped round-trip translation
> workbook, and read-time-only localization. Where this document and V1 disagree, **V2
> wins**.

---

## 1. Overview

The application currently operates exclusively in English — UI labels, feed names, feed
types, feed categories, and all API text. This plan adds support for ~7 languages
(final list TBD; e.g. Hindi, Kannada, Vietnamese, Swahili, Amharic, …).

The feature splits into two independent sub-problems:

| Sub-problem | Scope | Owner |
|---|---|---|
| **Data translation** — feed names, types, categories (DB content) | Database + Backend API | Backend team |
| **UI translation** — labels, buttons, messages (static text) | Frontend only | PWA + Android teams |

These do not block each other. Backend (Phases 1–5) can ship and be tested before
frontend integration begins.

---

## 2. Core Invariants (read this before any code)

These five principles hold across the whole feature. Every later step obeys them.

### I1 — English source columns are never translated in place
`feeds.fd_name`, `feeds.fd_type`, `feeds.fd_category` (and the taxonomy
`type_name`/`category_name`) remain English forever. They are the **stable internal
keys** used by the optimizer, `reporting.py` (which matches engine output on `fd_name`
via `.index()`), report persistence, logs, and exports. Translations live in separate
tables. This guarantees zero regression risk in existing logic.

### I2 — Localization is applied at READ/RENDER time, never frozen into stored data
Reports, `json_result`, and `feed_selection` persist English/stable keys
(`feed_id`, `fd_name`). API responses and PDFs join to translation tables **at the moment
of serving**, for the requested language. Consequence: adding or fixing a translation
later **retroactively improves** old reports and PDFs — nothing is stale.

### I3 — `'en'` is the implicit baseline, never a stored translation row
English text already lives in the source columns. There are **no `'en'` rows** in the
translation tables. Every localized lookup is `COALESCE(translation, source)` — a missing
translation silently falls back to English, never blank.

### I4 — Languages are data, not code
The set of supported languages lives in a `languages` table. Adding a language is an
**admin action at runtime** — no code change, no deploy. (This was the explicit design
goal: maximise robustness, minimise code changes.)

### I5 — Translation work is country-scoped
Both export and import of the translation workbook are filtered by `country_id`. A
workbook contains one country's feeds and that country's languages only. This keeps
workbooks small and prevents an admin working the wrong file from making cross-country
writes.
> **Not in scope now:** binding `country_id` to the admin's identity. Today a single
> `Admin` role exists and any admin may select any country. When `country_admin` /
> `super_admin` roles are activated (the `admin_level` column already exists), bind import
> `country_id` to a country_admin's own country. Left as a one-line future hook.

---

## 3. Why a Dedicated Translation Table (not JSONB)

(Unchanged from V1 — retained here so V2 is self-contained.)

Both approaches store localized names; the choice affects maintainability, query
performance, and integrity.

| Criterion | Dedicated Translation Table | JSONB column on `feeds` |
|---|---|---|
| **Schema change per new language** | None — insert rows | None — add a JSON key |
| **Referential integrity** | Full — FK + NOT NULL | None — any key/value valid |
| **Index support** | Standard B-tree on `(feed_id, language)` | GIN index, less precise, higher overhead |
| **Partial-text search** (typeahead) | `ilike` on TEXT — fast, standard | JSONB path extraction then ilike — slower |
| **Coverage queries** | Simple `NOT EXISTS` join | Awkward JSON key-existence checks |
| **Bulk upload** | Simple INSERT/UPSERT | JSON merge per row — error-prone |
| **ORM support** | Native SQLAlchemy join | Manual JSONB operators |
| **NULL safety** | NOT NULL constraint | JSON key may be null/empty silently |
| **Rollback a language** | `DELETE WHERE language='hi'` — instant | UPDATE every row — O(n) |
| **Reuse across tables** | Same pattern everywhere | Separate JSONB column per table |

**Why JSONB is tempting but wrong here:** feed translations are *not* schema-less — every
record is exactly `(key, language, name)`. Storing a fixed structure in JSONB forfeits FK
integrity, indexing clarity, and ORM support for no benefit. The table is more code
upfront and pays for itself immediately.

---

## 4. Data Model

### 4.1 Existing tables (confirmed by code review)

- `feeds` — `fd_name`, `fd_type`, `fd_category` stored as **denormalized TEXT**; `fd_country_id` FK; UUID derived deterministically from `fd_code` via `uuid5()`.
  - **Synergy:** because `feeds.id` is deterministic (`uuid5(fd_code)`) and bulk upload upserts in place, `feed_translations` (keyed on `feed_id`) **survive feed re-imports** — a library refresh does not orphan translations. This is a direct benefit of building on the stable-UUID work.
- `feed_types.type_name`, `feed_categories.category_name` — canonical English vocabulary (taxonomy). Low cardinality (sample DB: **2 types, 9 categories** vs **82 distinct names** across 90 feeds).
- `country` — `id`, `name`, `country_code`, `currency`, `is_active`.
- `user_information` — has `admin_level` (`super_admin`/`country_admin`, currently unused); **no language column yet**.

### 4.2 New tables

```sql
-- (I4) System-wide set of languages. Admin-managed at runtime.
CREATE TABLE languages (
    code       VARCHAR(10) PRIMARY KEY,        -- BCP 47: 'en','hi','vi','sw','am','kn'
    name       VARCHAR(100) NOT NULL,          -- 'English','Hindi','Vietnamese'
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Which languages are offered to a country's users. Replaces the V1
-- `country.supported_languages TEXT[]` idea — a real junction with FK integrity.
CREATE TABLE country_languages (
    country_id    UUID        NOT NULL REFERENCES country(id)  ON DELETE CASCADE,
    language_code VARCHAR(10) NOT NULL REFERENCES languages(code) ON DELETE RESTRICT,
    PRIMARY KEY (country_id, language_code)
);

-- Feed NAME translations. High-cardinality. Keyed by feed_id (country implied by feed).
CREATE TABLE feed_translations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id    UUID        NOT NULL REFERENCES feeds(id)        ON DELETE CASCADE,
    language   VARCHAR(10) NOT NULL REFERENCES languages(code)  ON DELETE RESTRICT,
    name       TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (feed_id, language)
);
CREATE INDEX idx_feed_translations_feed_lang ON feed_translations(feed_id, language);

-- Feed TYPE + CATEGORY translations, unified into ONE table (low-cardinality controlled
-- vocabulary). Country-scoped key (I5) so two countries sharing a language never clobber
-- each other's vocabulary translations.
CREATE TABLE vocabulary_translations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_id   UUID        NOT NULL REFERENCES country(id)       ON DELETE CASCADE,
    kind         VARCHAR(20) NOT NULL,            -- 'feed_type' | 'feed_category'
    source_value TEXT        NOT NULL,            -- English text, e.g. 'Forage'
    language     VARCHAR(10) NOT NULL REFERENCES languages(code) ON DELETE RESTRICT,
    name         TEXT        NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (country_id, kind, source_value, language)
);
```

### 4.3 Column added to existing table

```sql
ALTER TABLE user_information
ADD COLUMN preferred_language VARCHAR(10) NOT NULL DEFAULT 'en'
    REFERENCES languages(code) ON DELETE RESTRICT;
```

### 4.4 Why these key choices (recap of the discussion)

| Table | Key | Country handling | Reason |
|---|---|---|---|
| `feed_translations` | `(feed_id, language)` | **Implied** by `feed_id` | A feed belongs to exactly one country. `country_id` in the row would be redundant and risk disagreement. |
| `vocabulary_translations` | `(country_id, kind, source_value, language)` | **In the key** | Nothing else ties a universal term ("Forage") to a country. Without `country_id`, two countries sharing a language (e.g. Kenya & Tanzania, Swahili) would overwrite each other. |

`vocabulary_translations` keys on the **English `source_value` text**, not a taxonomy
`id`, because `feeds.fd_type`/`fd_category` are stored as text — so localizing a feed's
type is a direct text lookup with the string already in hand, no text→id→translation hop.
Known trade-off: pre-existing casing dupes in feed text (e.g. `Grain Crop Forage` vs
`Grain Crop forage`) appear as two distinct vocab rows — surfaced, not introduced, by this
design; clean at source if desired.

---

## 5. Scope

### In scope
- `languages`, `country_languages`, `feed_translations`, `vocabulary_translations` tables; `user_information.preferred_language`
- Localized feed name + type + category in all feed-returning API responses (read-time)
- Country-scoped translation workbook: export + import (3 sheets)
- Single-feed translation CRUD (corrections)
- Admin language management + country↔language assignment
- PWA i18next + Android `strings.xml` (static UI text)
- PDF localization (fonts + read-time localized names)

### Out of scope
- `custom_feeds` — entirely out of translation scope. Names are user-authored in their own language; there are no custom feed types/categories to translate.
- Optimization engine internals — operate on English `fd_name` only (I1)
- Error-message localization — handled by frontend i18n keys
- RTL layout — not needed for target languages
- Identity-bound country enforcement — future, when roles are activated (I5 note)

---

## 6. Implementation Phases

---

### Phase 1 — Database Foundation

**Step 1.1 — Alembic migration.** Create `languages`, `country_languages`,
`feed_translations`, `vocabulary_translations`; add `user_information.preferred_language`;
add the `feed_translations` index. Fully reversible `downgrade()`.

**Step 1.2 — ORM models** in `app/db/models.py`: `Language`, `CountryLanguage`,
`FeedTranslation`, `VocabularyTranslation`; add `preferred_language` to
`UserInformationModel`.

**Step 1.3 — Seed data** (idempotent script in `scripts/`):
- Insert `'en'` (+ the agreed ~7 languages) into `languages`.
- Insert `('<country>', 'en')` into `country_languages` for every existing country, plus each country's local languages per the deployment map (e.g. Vietnam→`vi`, India→`hi`,`kn`).
- No translation rows are seeded (I3 — English is the baseline).

---

### Phase 2 — Language Resolution (DB-driven, cached)

**Step 2.1 — `app/lang.py`.** Replace the V1 hardcoded `SUPPORTED_LANGUAGES` constant
with a DB-backed, Redis-cached active-language set (reuse `app/feed_cache.py`). Cache is
invalidated whenever an admin mutates `languages` (Phase 5).

```python
async def get_active_languages(db) -> set[str]:   # cached
    ...
async def resolve_language(query_param, user_preferred, active: set[str]) -> str:
    for c in (query_param, user_preferred):
        if c and c in active:
            return c
    return "en"   # I3
```

**Step 2.2 — FastAPI dependency** `get_language` in `app/dependencies.py`: reads `?lang=`,
combines with the authenticated user's `preferred_language`, validates against the cached
active set, returns the resolved code (default `'en'`).

---

### Phase 3 — Backend Read-Path Localization

> All of this is read-time only (I2). Persistence is untouched.

**Step 3.1 — Localized feed query helper** in `feed_repository.py`. Every feed-returning
query gains `lang: str = "en"` and LEFT JOINs both translation tables:

```python
ft = aliased(FeedTranslation)          # name
vt = aliased(VocabularyTranslation)    # type
vc = aliased(VocabularyTranslation)    # category
stmt = (
    select(
        Feed,
        func.coalesce(ft.name, Feed.fd_name).label("display_name"),
        func.coalesce(vt.name, Feed.fd_type).label("display_type"),
        func.coalesce(vc.name, Feed.fd_category).label("display_category"),
    )
    .outerjoin(ft, (ft.feed_id == Feed.id) & (ft.language == lang))
    .outerjoin(vt, (vt.country_id == Feed.fd_country_id) & (vt.kind == "feed_type")
                 & (vt.source_value == Feed.fd_type) & (vt.language == lang))
    .outerjoin(vc, (vc.country_id == Feed.fd_country_id) & (vc.kind == "feed_category")
                 & (vc.source_value == Feed.fd_category) & (vc.language == lang))
)
```

**Step 3.2 — Localized search.** In `search_feeds`, also match on the local name:
`WHERE Feed.fd_name ILIKE :q OR ft.name ILIKE :q` — so typeahead works in the user's
language, not just English. (Leading-wildcard `ILIKE` won't use a B-tree index, but this
matches the *existing* `fd_name` search — no regression. A `pg_trgm` GIN index is a
possible future optimization, not needed now.)

**Step 3.3 — Response shapes.** Add `display_name`, `display_type`, `display_category` to
feed response shapes — both the Pydantic schemas in `app/schemas/feed.py` **and the
inline response dicts** built directly in routers (e.g. `/search-feeds`, `/feeds`), so no
localized endpoint is missed. Keep `fd_name`/`fd_type`/`fd_category` for the stable English
keys. Frontend renders the `display_*` fields.

**Step 3.4 — Routers.** Inject `get_language` into and thread `lang` through:
`/search-feeds`, `/feed-name`, `/feeds`, `/feeds/{id}`, `/feed-details/{id}`,
`/unique-feed-type/{country_id}`, `/unique-feed-category`. The unique-type/category
endpoints return distinct values **with their localized labels** (vocab lookup).

**Step 3.5 — Diet recommendation & evaluation responses.** `diet_service` already loads
the selected feeds; fetch `feed_translations` (for the requested `lang`) for those
`feed_id`s and the relevant vocab rows, and attach `display_name`/`display_type`/
`display_category` when `reporting.py` assembles `feed_breakdown`. **The engine still
matches on English `fd_name`** (I1) — `display_*` are extra fields only.

**Step 3.6 — User & country endpoints** (`routers/auth.py`):
- `GET`/`PUT /user/{email_id}` — read/write `preferred_language`.
- `GET /countries` — include each country's assigned languages (from `country_languages`) so the frontend can build its language selector.

---

### Phase 4 — Translation Workbook (Country-Scoped Round-Trip)

The primary translation mechanism. Reuses the existing Excel export/parse infrastructure
in `services/feed_service.py`. One `.xlsx`, **three sheets**.

**Workbook shape** (language columns generated dynamically from the country's
`country_languages` — I4; English columns are read-only reference; `country_name` is
display-only, never keyed — see I5 / §4.4):

```
Sheet "Feeds"            fd_code | country_name | fd_name (En, ref) | <Lang1> | <Lang2> | …
Sheet "Feed Types"       country_name | source (En, ref) | <Lang1> | <Lang2> | …
Sheet "Feed Categories"  country_name | source (En, ref) | <Lang1> | <Lang2> | …
```

- "Feeds" rows = that country's feeds (high cardinality), pre-filled with existing `feed_translations`.
- "Feed Types"/"Feed Categories" rows = `SELECT DISTINCT fd_type/fd_category FROM feeds WHERE fd_country_id = :country` (low cardinality), pre-filled with existing `vocabulary_translations`.
- **Blank cells = the coverage report** — no separate coverage endpoint needed (an optional summary count may be added, §4 below).

**Step 4.1 — Export** `GET /v1/admin/translations/workbook?country_id=<uuid>` →
builds the 3-sheet workbook for that country. `country_id` required.

**Step 4.2 — Import** `POST /v1/admin/translations/workbook?country_id=<uuid>` (file
upload):
1. `country_id` comes from the **request parameter**, never from the sheet (so a hand-edited `country_name` cell can't mis-scope a write).
2. **Feeds sheet:** resolve each `fd_code` → `feed_id`; **validate `fd_country_id == country_id`**, flag/skip mismatches; UPSERT non-empty language cells into `feed_translations` on `(feed_id, language)`. Empty cell = no change (never writes blank).
3. **Vocab sheets:** UPSERT non-empty cells into `vocabulary_translations` on `(country_id, kind, source_value, language)`.
4. Validate every language column header against active `languages`; reject unknown.
5. Return a summary: rows processed / inserted / updated / skipped (with reasons).

**Step 4.3 — Single-feed CRUD** (one-off corrections):
```
POST   /v1/admin/translations                       -- upsert one feed-name translation
GET    /v1/admin/translations/{feed_id}             -- all translations for a feed
DELETE /v1/admin/translations/{feed_id}/{language}  -- remove one
```

**Step 4.4 — (Optional) Coverage summary**
`GET /v1/admin/translations/coverage?country_id=&lang=` → counts only
(`total / translated / missing`). The workbook's blank cells remain the detailed view.

---

### Phase 5 — Admin: Language & Country-Language Management

**Step 5.1 — Languages CRUD** (`routers/admin.py`):
```
POST  /v1/admin/languages            -- add a language (code, name)  → invalidates lang cache
GET   /v1/admin/languages            -- list (active + inactive)
PATCH /v1/admin/languages/{code}     -- rename / toggle is_active     → invalidates lang cache
```
This is the realization of I4 — adding a language needs **no code change**.

**Step 5.2 — Country↔language assignment** (`routers/admin.py`):
```
GET    /v1/admin/countries                           -- countries with their languages
POST   /v1/admin/countries/{country_id}/languages/{code}    -- assign
DELETE /v1/admin/countries/{country_id}/languages/{code}    -- unassign
```
`{code}` must exist in `languages` (FK enforces it).
**`'en'` is non-removable:** the unassign endpoint must reject `code == 'en'` (English is
the universal baseline per I3 and must always remain selectable for every country). Seed
also guarantees every country starts with `'en'` (Step 1.3).

**End-to-end "add a new language" flow (no deploy):**
`POST /languages` (am) → `POST /countries/{ethiopia}/languages/am` → next workbook export
auto-grows an "Amharic" column → translators fill → import → Ethiopian users select Amharic.

---

### Phase 6 — PWA Frontend (static UI text)

> Owned by PWA team. Requires Phase 3.

- **6.1** Install `i18next` + `react-i18next`; `public/locales/{code}/translation.json` per language.
- **6.2** Replace hardcoded strings with `t('key')`, highest-traffic screens first.
- **6.3** Language selector populated from `GET /v1/auth/countries` (the user's country's languages). On change: store locally, `PUT /user/{email}` `preferred_language`, set i18next `lng`.
- **6.4** API client adds `?lang=<current>` to all feed-fetching requests (axios interceptor).

---

### Phase 7 — Android App (static UI text)

> Owned by Android team. Independent of Phase 6.

- **7.1** `res/values-<code>/strings.xml` per language; `getString(...)` everywhere.
- **7.2** User-selected language via `AppCompatDelegate.setApplicationLocales(...)` (API 33+) or a `ContextWrapper` override below that; persist in `SharedPreferences`.
- **7.3** OkHttp interceptor appends `?lang=<selected>` to API calls.

---

### Phase 8 — PDF Report Localization

> Read-time (I2): reports persist English/stable keys; the PDF localizes on render.

- **8.1** Embed Noto fonts per script via `@font-face` in the WeasyPrint CSS: Devanagari (Hindi), Kannada, Ethiopic (Amharic); Latin-extended (Vietnamese, Swahili) covered by base fonts.
- **8.2** Thread `lang` into `pdf_service.generate_pdf(...)`; at render, localize feed names/types/categories from the translation tables keyed by the report's stored `feed_id`/text — so historical PDFs honor translations added after the report was created.
- **8.3** Template renders `display_*` values; English `fd_name` may remain as internal reference.

> **Partial until Phase 9:** Phase 8 localizes feed *data* in the PDF (names, types,
> categories). The PDF's static **chrome** — section headings, table labels, and generated
> advice/warnings — stays English until Phase 9. Expect a data-localized / chrome-English
> PDF in the interim; this is intended, not a bug.

---

### Phase 9 — Backend-generated text localization *(future — brief only, not specced here)*

> **Status: deferred.** Captured so the gap isn't forgotten; full design to follow in a
> later revision.

V2 localizes **feed data** (names, types, categories) and the **frontend UI labels**. It
does **not** localize the third category of text: **English prose generated on the
backend** and embedded in API responses and server-rendered PDFs. Examples:
- Advisory messages — `advice_engine.py` (e.g. *"The energy requirement is not being met…"*)
- Status / warning / methane-efficiency descriptions — `reporting.py`
- Inline labels (*"Grazing"/"Non-grazing"*) and PDF section headings / table labels

These can't be reached by the DB translation tables (not feed data) or the frontend
bundles (the backend already emits finished English). With V2 alone, a user on a local
language sees localized UI + feed names but **English advice/warnings in reports**.

**Intended approach (to be detailed later):** a **server-side string catalog** — a closed,
developer-authored set (~30–50 strings) versioned with the code (static JSON/dict keyed by
language), used by both API responses and the PDF templates, rendered in the resolved
`lang`. This is a *different effort* from V2's data translation: a fixed string set
shipped with code, not open-ended admin-managed DB content.

**Two caveats that apply regardless of phasing:**
- *Completeness ≠ mechanism* — any individual string or feed not yet translated falls back to English; "fully local" depends on translations actually being filled in.
- *Cross-country languages are not offered* — a user sees English + **their country's** languages only (matches the "country-specific local language" intent).

---

## 7. Holistic Consistency Review (end-to-end confirmation)

Tracing the full operation against the invariants:

| # | Concern | Resolution | Invariant |
|---|---|---|---|
| 1 | Does adding a language need a deploy? | No — `languages` table + admin endpoint; workbook columns generated from `country_languages`. | I4 |
| 2 | Feed name, type, AND category all localized? | Yes — `feed_translations` (name) + `vocabulary_translations` (type/category), joined in §3.1; workbook has 3 sheets. | — |
| 3 | Two countries sharing a language clobbering vocab? | No — `country_id` is in the vocab key. | I5 |
| 4 | Missing translation → blank UI? | No — `COALESCE(translation, source)`; no `'en'` rows. | I3 |
| 5 | Does any of this disturb the optimizer / reporting match-on-`fd_name`? | No — `fd_name`/`fd_type`/`fd_category` stay English; `display_*` are additive. | I1 |
| 6 | Do old reports/PDFs get new translations? | Yes — localization is read-time, not frozen. | I2 |
| 7 | Can an admin mis-scope a write via the file? | No — import `country_id` is the request param; sheet `country_name` is display-only; feed rows validated against `fd_country_id`. | I5 |
| 8 | Search in local language? | Yes — `search_feeds` also matches `feed_translations.name`. | — |
| 9 | Custom feeds? | Entirely out of scope — names user-authored; no custom types/categories exist. | §5 |
| 10 | Coverage tracking without a heavy endpoint? | Workbook blank cells; optional summary count. | §4.4 |
| 11 | UUIDs leaking to translators? | No — workbook shows `country_name`/`fd_name`/`fd_code` only; `country_id` rides the request. | §6/§4.4 |
| 12 | Language list hammering the DB per request? | No — Redis-cached active set, invalidated on admin language change. | §2.1 |

**Confirmation:** the design is internally consistent end-to-end. Persistence stays
English-keyed; all localization is additive and applied on read; languages and
country↔language mappings are runtime admin data; translation work is a country-scoped
spreadsheet round-trip with English fallback throughout. No step contradicts another, and
no existing optimizer/report/persistence behavior changes.

---

## 8. Rollout Order

```
Phase 1  DB migration + ORM + seed (languages, country_languages, 'en' baseline)
Phase 2  Language resolution (cached, DB-driven)
Phase 3  Read-path localization (queries, schemas, routers, diet responses)
Phase 4  Translation workbook (export/import) + single-feed CRUD
Phase 5  Admin language & country-language management
            ↓  (translators fill workbooks)
Phase 6  PWA            ┐
Phase 7  Android        ├─ independent, parallel
Phase 8  PDF            ┘  (may defer to a follow-up)
Phase 9  Backend-generated text localization — DEFERRED (brief only, §6 above)
```

Phases 1–5 are the shared backend prerequisite. 6/7/8 are independent of each other.
Phase 9 is deferred to a later revision; without it, report advice/warnings remain English.

---

## 9. Testing Checklist

**Backend**
- [ ] Migration applies + rolls back cleanly on a fresh DB
- [ ] `lang='en'` → `display_* == source` (no regression)
- [ ] Valid `lang` → correct translated name/type/category
- [ ] Missing translation → falls back to English (never null/blank)
- [ ] Typeahead finds feeds searched in the local language
- [ ] `?lang=` overrides user `preferred_language`; absent → user pref → `'en'`
- [ ] Diet recommendation `feed_breakdown` carries `display_*`; engine still matches on `fd_name`
- [ ] Workbook export: correct 3 sheets, dynamic language columns = country's languages, blanks where untranslated
- [ ] Workbook import: feeds validated against `country_id`; cross-country `fd_code` skipped+reported; vocab UPSERTs scoped to country; unknown language header rejected; blank cells never overwrite
- [ ] Add language end-to-end with no deploy; new column appears on next export
- [ ] Language cache invalidates on admin language change

**Frontend (PWA + Android)**
- [ ] Language selector shows only the user's country's languages
- [ ] Selection persists locally + syncs to `preferred_language`
- [ ] All feed-fetching calls include `?lang=`
- [ ] English fallback renders when a translation is absent

**PDF**
- [ ] Correct script renders (Devanagari/Kannada/Ethiopic) with embedded fonts
- [ ] A report created before a translation existed renders localized after it's added (I2)

---

## 10. Open Questions (confirm before starting)

| # | Question | Impacts |
|---|---|---|
| 1 | Final 7 languages + BCP 47 codes? | Phase 1 seed, Phase 8 fonts |
| 2 | Who supplies translations (agronomists / agency / existing data)? | Phase 4 timing |
| 3 | Does `master_feeds` / `FeedCountryAvailability.local_name` already hold usable names to seed `feed_translations`? | Could pre-fill Phase 4 |
| 4 | Are type/category labels shown in the Android app today? | Priority of vocab localization |
| 5 | PDF always in user language, or per-PDF toggle? | Phase 8 scope |
```
