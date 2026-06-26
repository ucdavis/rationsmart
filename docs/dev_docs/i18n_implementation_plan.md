# Implementation Plan: Internationalisation (i18n) — Multi-Language Support

## Overview

The application currently operates exclusively in English — UI labels, feed names, feed
categories, and all API text. This plan adds support for approximately 7 languages
(e.g., Hindi, Kannada, Vietnamese, Swahili, Amharic, and others determined by the
countries in deployment).

The feature has two independent sub-problems:

| Sub-problem | Scope | Who owns it |
|---|---|---|
| **Feed names** (and category/type names) | Database + Backend API | Backend team |
| **UI text** (labels, buttons, messages) | Frontend only | Frontend teams (PWA + Android) |

These are implemented independently and do not block each other. The backend work
(Phases 1–3) can be done first and tested before frontend integration begins.

---

## Key Design Decisions

### 1. `fd_name` stays English forever

`fd_name` on the `feeds` table is the internal stable key. It is used in:
- Optimization engine internals and debug logs
- PDF generation templates
- Report JSON persistence
- Admin tooling and CSV exports

Only the new `display_name` field in API responses is localized. This ensures zero
regression risk on all existing functionality when a language changes or a translation
is missing.

### 2. Graceful fallback — English if translation is missing

Every query LEFT JOINs the translation table and uses `COALESCE(translation, fd_name)`.
A missing translation never surfaces as a blank name — it silently falls back to English.
This means the app can be deployed with partial translation coverage.

### 3. User preference overrides country default

A country may have multiple supported languages (e.g., India: Hindi, Kannada, Telugu).
The user sets their preferred language in their profile. The API resolves the language in
this priority order:

```
?lang= query param  →  user.preferred_language  →  'en'
```

---

## Why a Dedicated Translation Table (not JSONB)

Both approaches store localized names. The choice matters for long-term maintainability,
query performance, and data integrity.

### Comparison

| Criterion                                                    | Dedicated Translation Table                                                                                     | JSONB column on `feeds`                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Schema change per new language**                           | None — just insert new rows                                                                                     | None — just add a key to the JSON                                                         |
| **Referential integrity**                                    | Full — FK to `feeds.id`, NOT NULL on `name`                                                                     | None — any key/value is valid                                                             |
| **Index support**                                            | Standard B-tree index on `(feed_id, language)`                                                                  | GIN index (less precise, higher overhead)                                                 |
| **Partial-text search** (typeahead)                          | `ilike` on a TEXT column — fast, standard                                                                       | Requires JSONB path extraction first, then ilike — slower, non-trivial                    |
| **Coverage queries** (which feeds lack a Hindi translation?) | `SELECT feed_id FROM feeds WHERE NOT EXISTS (SELECT 1 FROM feed_translations WHERE language='hi' ...)` — simple | `SELECT id FROM feeds WHERE NOT (fd_name_i18n ? 'hi')` — works but less readable at scale |
| **Bulk translation upload** (CSV/Excel from translators)     | Simple INSERT/UPSERT into one table                                                                             | Requires JSON merge on existing JSONB per row — more error-prone                          |
| **ORM support**                                              | Native SQLAlchemy relationship, query-time join                                                                 | Manual JSONB operators, no first-class ORM support                                        |
| **NULL safety**                                              | Impossible to store a null name (NOT NULL constraint)                                                           | JSON key can hold null or empty string silently                                           |
| **Rollback a language**                                      | `DELETE FROM feed_translations WHERE language='hi'` — atomic, instant                                           | Must UPDATE every row removing the JSON key — O(n) writes                                 |
| **Multi-table reuse**                                        | Same pattern for `feed_type_translations`, `feed_category_translations`                                         | Separate JSONB column on each table — no shared query pattern                             |
| **Database storage**                                         | Normalized — no duplication                                                                                     | Slightly more compact per row, but JSONB has per-row overhead                             |

### Why JSONB is tempting but wrong here

JSONB is excellent for genuinely dynamic, schema-less attributes (e.g., arbitrary
metadata that varies per record). Feed name translations are not schema-less — every
translation has exactly the same structure: `(feed_id, language, name)`. Storing a
known, fixed structure in JSONB gives up FK constraints, indexing clarity, and ORM
support for no real benefit. The translation table is more code upfront but pays for
itself immediately in query simplicity and data integrity.

---

## Scope

### In scope
- `feeds` table — feed name translations
- `feed_types` table — feed type name translations
- `feed_categories` table — feed category name translations
- `user_information` table — user language preference
- `country` table — supported languages per country
- All feed-fetching API endpoints — return `display_name` alongside `fd_name`
- Admin bulk translation upload endpoint
- Admin translation coverage report endpoint
- PWA frontend — i18next integration, all UI strings, language selector
- Android app — `strings.xml` per language, language selector

### Out of scope
- `custom_feeds` — user-created feeds are typed by the user in their own language; no translation needed
- Optimization engine internals — uses `fd_name` (English) only
- Error message localization — handled at frontend level via i18n keys
- Right-to-left (RTL) layout support — not required for the target languages

---

## Database Schema Changes

### New tables

```sql
-- Feed name translations
CREATE TABLE feed_translations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id      UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    language     VARCHAR(10) NOT NULL,   -- BCP 47 tag: 'hi', 'vi', 'sw', 'am', 'kn', etc.
    name         TEXT NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (feed_id, language)
);
CREATE INDEX idx_feed_translations_feed_lang ON feed_translations(feed_id, language);

-- Feed type name translations
CREATE TABLE feed_type_translations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id      UUID NOT NULL REFERENCES feed_types(id) ON DELETE CASCADE,
    language     VARCHAR(10) NOT NULL,
    name         TEXT NOT NULL,
    UNIQUE (type_id, language)
);

-- Feed category name translations
CREATE TABLE feed_category_translations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  UUID NOT NULL REFERENCES feed_categories(id) ON DELETE CASCADE,
    language     VARCHAR(10) NOT NULL,
    name         TEXT NOT NULL,
    UNIQUE (category_id, language)
);
```

### Columns added to existing tables

```sql
-- User language preference
ALTER TABLE user_information
ADD COLUMN preferred_language VARCHAR(10) NOT NULL DEFAULT 'en';

-- Languages supported by each country (for frontend language selectors)
ALTER TABLE country
ADD COLUMN supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en'];
```

---

## Implementation Steps

---

### Phase 1 — Database Foundation

#### Step 1.1 — Write Alembic migration

Create a new migration file in `alembic/versions/` that:
- Creates `feed_translations`, `feed_type_translations`, `feed_category_translations` tables
  (schema as shown above)
- Adds `preferred_language VARCHAR(10) NOT NULL DEFAULT 'en'` to `user_information`
- Adds `supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en']` to `country`
- Adds indexes on all three translation tables

The migration must be fully reversible (include `downgrade()` that drops the tables and
columns cleanly).

#### Step 1.2 — Add ORM models

In `app/db/models.py`, add three new model classes:

```python
class FeedTranslation(Base):
    __tablename__ = "feed_translations"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feed_id     = Column(UUID(as_uuid=True), ForeignKey("feeds.id", ondelete="CASCADE"), nullable=False)
    language    = Column(String(10), nullable=False)
    name        = Column(Text, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("feed_id", "language"),)

class FeedTypeTranslation(Base):
    __tablename__ = "feed_type_translations"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_id     = Column(UUID(as_uuid=True), ForeignKey("feed_types.id", ondelete="CASCADE"), nullable=False)
    language    = Column(String(10), nullable=False)
    name        = Column(Text, nullable=False)
    __table_args__ = (UniqueConstraint("type_id", "language"),)

class FeedCategoryTranslation(Base):
    __tablename__ = "feed_category_translations"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(UUID(as_uuid=True), ForeignKey("feed_categories.id", ondelete="CASCADE"), nullable=False)
    language    = Column(String(10), nullable=False)
    name        = Column(Text, nullable=False)
    __table_args__ = (UniqueConstraint("category_id", "language"),)
```

Also add `preferred_language: str = "en"` and update `UserInformationModel` accordingly.
Add `supported_languages: list[str] = ["en"]` to `CountryModel`.

#### Step 1.3 — Populate `country.supported_languages`

Run a one-off data migration (can be a script in `scripts/`) that sets the
`supported_languages` array for each existing country row based on the deployment map
(e.g., Vietnam → `['en', 'vi']`, India → `['en', 'hi', 'kn']`). This is a manual step
confirmed with the product team.

---

### Phase 2 — Language Resolution Utility

#### Step 2.1 — Add a language resolver helper

Create `app/lang.py` (a small utility, no FastAPI dependency):

```python
SUPPORTED_LANGUAGES = {"en", "hi", "vi", "sw", "am", "kn"}  # expand as needed
FALLBACK = "en"

def resolve_language(
    query_param: str | None,
    user_preferred: str | None,
) -> str:
    """Priority: explicit query param > user preference > 'en'."""
    for candidate in (query_param, user_preferred):
        if candidate and candidate in SUPPORTED_LANGUAGES:
            return candidate
    return FALLBACK
```

Add a FastAPI dependency in `app/dependencies.py` that extracts `?lang=` from the
request query string and combines it with the authenticated user's `preferred_language`:

```python
async def get_language(
    lang: str | None = Query(default=None),
    current_user: UserInformationModel | None = Depends(get_optional_current_user),
) -> str:
    user_pref = current_user.preferred_language if current_user else None
    return resolve_language(lang, user_pref)
```

---

### Phase 3 — Backend: Feed Repository + API Updates

	#### Step 3.1 — Update `feed_repository.py`

Every feed-fetching query that returns `fd_name` must be updated to LEFT JOIN
`feed_translations` and use `COALESCE` for the display name.

Add a helper that builds the join expression given a language code. All existing query
functions (`get_feeds`, `search_feeds`, `get_feed_names`, `get_unique_types`,
`get_unique_categories`) receive an additional `lang: str = "en"` parameter.

Example for `search_feeds`:

```python
async def search_feeds(
    db: AsyncSession,
    query: str,
    country_id: str,
    lang: str = "en",
    limit: int = 20,
) -> list[dict]:
    translation_alias = aliased(FeedTranslation)
    stmt = (
        select(
            Feed,
            func.coalesce(translation_alias.name, Feed.fd_name).label("display_name"),
        )
        .outerjoin(
            translation_alias,
            (translation_alias.feed_id == Feed.id) & (translation_alias.language == lang),
        )
        .where(
            Feed.fd_country_id == country_id,
            or_(
                Feed.fd_name.ilike(f"%{query}%"),
                translation_alias.name.ilike(f"%{query}%"),  # search in local language too
            ),
        )
        .limit(limit)
    )
    ...
```

Note the `OR` condition in the WHERE clause: searching by local name (typeahead in Hindi,
for example) must also work, not just English name matching.

#### Step 3.2 — Update feed response Pydantic schemas

In `app/schemas/feed.py` (and any schema that includes `fd_name` in a response), add
`display_name: str` as a field. Keep `fd_name: str` for backward compatibility.

The rule: `display_name` is the localized name to show in the UI. `fd_name` is the
stable English key. Frontend should display `display_name`.

#### Step 3.3 — Update routers to pass language

In `routers/animal.py`, inject the `get_language` dependency into every feed-related
endpoint and thread it through to the repository calls:

```python
@router.get("/search-feeds")
async def search_feeds(
    query: str,
    country_id: str,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    results = await feed_repository.search_feeds(db, query, country_id, lang=lang)
    ...
```

Endpoints that need updating:
- `GET /search-feeds`
- `GET /feed-name`
- `GET /feeds`
- `GET /feeds/{feed_id}`
- `GET /feed-details/{feed_id}`
- `GET /unique-feed-type/{country_id}`
- `GET /unique-feed-category`
- `POST /diet-recommendation` (feed names in the result `feed_breakdown`)
- `POST /evaluate-diet` (feed names in result)

For diet recommendation and evaluate-diet, the `display_name` only needs to appear in
the JSON response, not inside the optimizer. The `FeedRecord` dataclass keeps
`fd_name` (English) internally; add a separate `display_name` field to the optimizer
result assembly step in `reporting.py`.

#### Step 3.4 — Update user profile endpoints

In `routers/auth.py`:
- `PUT /user/{email_id}` — accept and persist `preferred_language` in the request body
- `GET /user/{email_id}` — include `preferred_language` in the response
- `GET /countries` — include `supported_languages` array in each country object (lets the
  frontend know which language options to show per country)

---

### Phase 4 — Admin: Translation Management

#### Step 4.1 — Bulk translation upload endpoint

Add to `routers/admin.py`:

```
POST /v1/admin/translations/bulk-upload
```

Accepts a CSV or Excel file with columns: `fd_code, language, translated_name`.

The handler:
1. Looks up `feeds.id` by `fd_code`
2. UPSERTs into `feed_translations` (INSERT … ON CONFLICT DO UPDATE)
3. Returns a summary: rows processed, inserted, updated, skipped (bad fd_code or
   unsupported language), errors

This mirrors the existing `POST /v1/admin/bulk-upload-feeds` pattern and reuses the
same Excel parsing infrastructure in `services/feed_service.py`.

#### Step 4.2 — Translation coverage report endpoint

Add to `routers/admin.py`:

```
GET /v1/admin/translations/coverage?lang=hi&country_id=<uuid>
```

Returns, for each feed available in the given country, whether a translation exists for
the requested language. Response shape:

```json
{
  "language": "hi",
  "total_feeds": 120,
  "translated": 87,
  "missing": 33,
  "missing_feeds": [
    { "feed_id": "...", "fd_code": "...", "fd_name": "Wheat Straw" },
    ...
  ]
}
```

This is the primary tool for the translation team to know what work remains.

#### Step 4.3 — Single-feed translation CRUD

Add to `routers/admin.py`:

```
POST   /v1/admin/translations            -- add or update one translation
GET    /v1/admin/translations/{feed_id}  -- get all translations for a feed
DELETE /v1/admin/translations/{feed_id}/{language}  -- remove one translation
```

These are low-frequency manual corrections. Keep them simple.

---

### Phase 5 — PWA Frontend

> This phase is owned by the PWA frontend team. Backend must complete Phase 3 before
> this phase begins.

#### Step 5.1 — Install and configure i18next

```bash
npm install i18next react-i18next i18next-http-backend
```

Create `public/locales/{en,hi,vi,...}/translation.json` for each language. Initialize
i18next in `src/i18n.ts` with `lng` defaulting to the user's stored preference.

#### Step 5.2 — Extract all hardcoded strings

Go through every component and replace hardcoded English strings with `t()` calls:

```tsx
// Before
<label>Animal Body Weight (kg)</label>

// After
<label>{t('animal.body_weight_label')}</label>
```

Recommended approach: do this component-by-component rather than all at once. Start
with the highest-traffic screens (feed selection, diet recommendation results, login).

#### Step 5.3 — Language selector in user settings

Add a language dropdown populated from `country.supported_languages` (returned by
`GET /v1/auth/countries`). On change:
1. Store in `localStorage` immediately (affects the i18next `lng` setting)
2. Persist to backend via `PUT /v1/auth/user/{email_id}` with `preferred_language`
3. All subsequent API calls include `?lang=<selected>` as a query parameter

#### Step 5.4 — Pass `lang` to all API calls

Add the current language as a default query parameter in the API client layer (e.g.,
axios interceptor). This ensures every feed-fetching request automatically includes
the user's language without changing individual call sites.

---

### Phase 6 — Android App

> This phase is owned by the Android team and is independent of Phase 5.

#### Step 6.1 — Add `strings.xml` per language

```
res/values/strings.xml          (English — default)
res/values-hi/strings.xml       (Hindi)
res/values-vi/strings.xml       (Vietnamese)
res/values-sw/strings.xml       (Swahili)
res/values-am/strings.xml       (Amharic)
res/values-kn/strings.xml       (Kannada)
```

Use `getString(R.string.animal_body_weight_label)` everywhere in place of hardcoded
strings. Android resolves the right file automatically based on the locale context.

#### Step 6.2 — User-selected language (ignoring device locale)

Use `AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("hi"))`
(API 33+). For older API levels, use a `ContextWrapper` locale override utility.

Store the user's language selection in `SharedPreferences` and apply it at app startup
before `setContentView`.

#### Step 6.3 — Pass `lang` to API calls

Add the selected language as a default query parameter in the Retrofit client
(OkHttp interceptor):

```kotlin
.addInterceptor { chain ->
    val request = chain.request().newBuilder()
        .url(chain.request().url.newBuilder().addQueryParameter("lang", userLang).build())
        .build()
    chain.proceed(request)
}
```

---

### Phase 7 — PDF Report Localisation

#### Step 7.1 — Embed language-specific fonts

WeasyPrint uses CSS `@font-face` to embed fonts. Add the following Noto font files to
the PDF assets directory (all open-source, available from Google Fonts):

| Language | Script | Font file |
|---|---|---|
| Hindi | Devanagari | `NotoSansDevanagari-Regular.ttf` |
| Kannada | Kannada | `NotoSansKannada-Regular.ttf` |
| Amharic | Ethiopic | `NotoSansEthiopic-Regular.ttf` |
| Vietnamese | Latin extended | System fonts sufficient |
| Swahili | Latin extended | System fonts sufficient |

In the PDF CSS template, declare `@font-face` blocks and apply via
`font-family: 'NotoSans', sans-serif` on the `body`.

#### Step 7.2 — Pass language into `pdf_service.py`

`pdf_service.py` currently calls `reporting.py` to build the diet data structure, then
renders an HTML template via WeasyPrint. Thread the `lang` parameter through:
- `generate_pdf(report_data, lang="en")`
- The Jinja2 (or equivalent) HTML template receives `lang` and uses it to select the
  correct font and to render localized feed names (which are already in `report_data`
  by the time the report is built, since `display_name` comes from the API layer)

#### Step 7.3 — Feed names in PDF

By Phase 3, `report_data` already contains `display_name` for each feed in
`feed_breakdown`. The PDF template should use `display_name` everywhere it currently
uses `fd_name` for user-facing output. `fd_name` (English) can remain in the internal
data structure for reference.

---

## Testing Checklist

### Backend (per phase)

- [ ] Migration applies cleanly on a fresh DB and rolls back without errors
- [ ] Feed query with `lang='en'` returns `display_name == fd_name` (no regression)
- [ ] Feed query with a valid `lang` returns the correct translated name
- [ ] Feed query with `lang` that has no translations falls back to `fd_name` (not null)
- [ ] Typeahead search finds feeds when the search string is in the local language
- [ ] `?lang=` query param overrides user `preferred_language`
- [ ] Diet recommendation response includes `display_name` per feed in `feed_breakdown`
- [ ] Admin bulk upload: valid CSV processes cleanly, bad `fd_code` rows are reported
- [ ] Coverage endpoint returns correct missing/translated counts

### Frontend (PWA + Android)

- [ ] Language selector appears in user settings
- [ ] Changing language updates feed names and UI text immediately (no reload required
  for UI text; feed list refreshes on next navigation)
- [ ] Language preference persists across sessions (localStorage / SharedPreferences)
- [ ] Language preference syncs to backend profile
- [ ] API calls include `?lang=` on all feed-fetching requests
- [ ] English fallback renders correctly when local translation is absent

---

## Rollout Order

```
Step 1.1 – 1.3   DB migration + ORM models + seed country languages
Step 2.1          Language resolver utility + FastAPI dependency
Step 3.1 – 3.4   Repository updates + schema updates + router updates
Step 4.1 – 4.3   Admin translation upload + coverage + CRUD
                  ↓
             (Translation team uploads initial translations via admin endpoints)
                  ↓
Step 5.1 – 5.4   PWA frontend
Step 6.1 – 6.3   Android app     (parallel with Phase 5, independent)
Step 7.1 – 7.3   PDF localisation (can be deferred to a follow-up sprint)
```

Phases 5, 6, and 7 are independent of each other and can run in parallel. The backend
work (Phases 1–4) is the shared prerequisite.

---

## Open Questions (Confirm Before Starting)

| # | Question | Why it matters |
|---|---|---|
| 1 | Final list of 7 languages and their BCP 47 codes? | Drives `SUPPORTED_LANGUAGES` constant and font selection |
| 2 | Who supplies translations — in-country agronomists, translation agency, or existing dataset? | Determines admin upload format and timing |
| 3 | Does `master_feeds` / `FeedCountryAvailability.local_name` already contain usable translations that can be seeded into `feed_translations`? | Could eliminate a large chunk of translation work for Phase 4 |
| 4 | Should the PDF always be in the user's language, or offer a language toggle per PDF? | Affects Phase 7 complexity |
| 5 | Are feed category and type names displayed in the mobile app? | Determines priority of `feed_type_translations` and `feed_category_translations` |
