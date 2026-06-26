# RationSmart Multi-Language — Technical Documentation

## 1. Overview

RationSmart i18n V2 adds first-class multi-language support to the feed data layer. It is
designed around five invariants that preserve data integrity while making the system extensible
without code deployments.

### 1.1 Design Invariants

| # | Invariant | Meaning |
|---|---|---|
| I1 | English source columns are never overwritten | `fd_name`, `fd_type`, `fd_category` on the `feeds` table remain the stable internal keys. |
| I2 | Localization happens at read/render time only | No translated text is frozen into stored records (reports, saved simulations). |
| I3 | `'en'` is the implicit baseline | There are no `'en'` rows in translation tables. COALESCE always returns the English source column as the fallback. |
| I4 | Languages are DB data, not code | Adding a new language is a runtime admin action. No code change or deployment is needed. |
| I5 | Translation work is country-scoped | The translation workbook is filtered by `country_id`. Cross-country writes are rejected. |

---

## 2. Database Schema

### 2.1 New Tables

#### `languages`
```sql
CREATE TABLE languages (
    code        VARCHAR(10) PRIMARY KEY,      -- e.g. 'hi', 'vi'
    name        VARCHAR(100) NOT NULL,        -- e.g. 'Hindi'
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `country_languages`
```sql
CREATE TABLE country_languages (
    country_id      UUID REFERENCES country(id) ON DELETE CASCADE,
    language_code   VARCHAR(10) REFERENCES languages(code) ON DELETE CASCADE,
    PRIMARY KEY (country_id, language_code)
);
```

#### `feed_translations`
```sql
CREATE TABLE feed_translations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id     UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    language    VARCHAR(10) NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (feed_id, language)
);
```

#### `vocabulary_translations`
```sql
CREATE TABLE vocabulary_translations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_id   UUID NOT NULL REFERENCES country(id) ON DELETE CASCADE,
    kind         VARCHAR(20) NOT NULL,          -- 'type' or 'category'
    source_value TEXT NOT NULL,                 -- English string being translated
    language     VARCHAR(10) NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (country_id, kind, source_value, language)
);
```

### 2.2 Modified Tables

#### `user_information`
```sql
ALTER TABLE user_information
    ADD COLUMN preferred_language VARCHAR(10) NOT NULL DEFAULT 'en'
    REFERENCES languages(code);
```

---

## 3. Language Resolution

### 3.1 Priority Order

```
?lang=<code>  →  user.preferred_language  →  'en'
```

Resolution is implemented in `app/lang.py`:

```python
def resolve_language(
    query_param: str | None,
    user_preferred: str | None,
    active: set[str],
) -> str:
    for candidate in (query_param, user_preferred):
        if candidate and candidate in active:
            return candidate
    return "en"
```

The `active` set is the set of language codes from the `languages` table where `is_active=true`.

### 3.2 Active Language Cache

To avoid a DB round-trip on every request, the active language codes are cached in Redis under
the key `lang:active_codes` (TTL 300 seconds).

```
key:   lang:active_codes
value: JSON-serialised list of code strings, e.g. '["en","hi","vi"]'
TTL:   300 seconds
```

The cache is invalidated (via `DEL lang:active_codes`) whenever:
- A new language is created (`POST /v1/admin/languages`)
- A language's `is_active` status is changed (`PATCH /v1/admin/languages/{code}`)

If Redis is unavailable, the cache miss is silently treated as a cache miss — the DB is queried
directly. No error is raised.

Implementation: `app/feed_cache.py` (`get_lang_codes_from_cache`, `set_lang_codes_in_cache`,
`invalidate_lang_cache`).

---

## 4. Read-Path Localization

### 4.1 COALESCE Pattern

The localized select in `repositories/feed_repository.py` uses three LEFT JOINs and COALESCE:

```sql
SELECT
    feeds.id,
    feeds.fd_code,
    feeds.fd_name,
    COALESCE(ft.name,  feeds.fd_name)     AS display_name,
    COALESCE(vt.name,  feeds.fd_type)     AS display_type,
    COALESCE(vc.name,  feeds.fd_category) AS display_category,
    ...
FROM feeds
LEFT JOIN feed_translations ft
    ON ft.feed_id = feeds.id AND ft.language = :lang
LEFT JOIN vocabulary_translations vt
    ON vt.country_id = :country_id
    AND vt.kind = 'type'
    AND vt.source_value = feeds.fd_type
    AND vt.language = :lang
LEFT JOIN vocabulary_translations vc
    ON vc.country_id = :country_id
    AND vc.kind = 'category'
    AND vc.source_value = feeds.fd_category
    AND vc.language = :lang
```

Because `'en'` rows are never inserted in the translation tables (I3), passing `lang='en'` to
this query always yields NULL join results, so COALESCE always returns the English source column.
This means English requests are zero-cost: no join match, no extra data.

### 4.2 Localized Repository Methods

All read methods in `FeedRepository` accept a `lang: str = "en"` parameter:

| Method | Notes |
|---|---|
| `get_by_id_localized(feed_id, lang)` | Single feed detail |
| `get_all_localized(country_id, user_id, lang)` | Full feed list |
| `get_unique_types(country_id, user_id, lang)` | Distinct translated types |
| `get_unique_categories(country_id, user_id, lang)` | Distinct translated categories |
| `search_feeds(query, country_id, user_id, limit, lang)` | Full-text search |
| `get_feed_names(country_id, user_id, feed_type, category, lang)` | Filtered name list |

### 4.3 Dependency Injection

The `lang` value is resolved by two FastAPI dependency functions in `app/dependencies.py`:

```python
async def get_language(
    lang: str | None = Query(None),
    user: UserModel | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> str: ...

async def get_language_authenticated(
    lang: str | None = Query(None),
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str: ...
```

Both call `resolve_language` after fetching the active language set (from cache or DB). All
localized endpoints inject `get_language_authenticated` as a dependency, receiving the resolved
language string directly.

FastAPI's per-request dependency caching ensures `get_current_user` runs only once per request
even when both the endpoint and `get_language_authenticated` declare it.

---

## 5. Translation Workbook

### 5.1 Export (`GET /v1/admin/translations/workbook`)

`services/translation_service.py` → `export_translation_workbook(db, country_id)`:

1. Fetch active language codes for the country (excluding `'en'`).
2. Fetch all feeds linked to the country (`repositories/translation_repository.py`).
3. Fetch existing `feed_translations` map: `{feed_id → {lang → name}}`.
4. Fetch existing `vocabulary_translations` map for types and categories.
5. Build an `openpyxl` workbook with three sheets, pre-filling existing translations.
6. Return `(bytes, filename)`.

### 5.2 Import (`POST /v1/admin/translations/workbook`)

`services/translation_service.py` → `import_translation_workbook(db, country_id, file_bytes)`:

1. Parse the `.xlsx` with `openpyxl`.
2. For each sheet, detect language columns by membership in the country's active language set.
3. **Feeds sheet**: validate each `feed_id` against `get_country_feed_ids(country_id)` — IDs
   not in the country's feed set are skipped and logged (enforces I5).
4. For non-empty cells, call `upsert_feed_translation` or `upsert_vocabulary_translation`.
5. Accumulate inserted/updated/skipped counters and any per-row errors.
6. Return `WorkbookImportSummary`.

### 5.3 Repository Layer

`repositories/translation_repository.py` provides:

| Method | Description |
|---|---|
| `get_country_language_codes(country_id)` | Active non-'en' codes for a country |
| `get_country_feeds(country_id)` | Explicit column select: id, fd_code, fd_name, fd_type, fd_category |
| `get_country_feed_ids(country_id)` | Set of feed UUIDs for I5 guard |
| `get_feed_translations_map(country_id)` | `{feed_id → {lang → name}}` |
| `get_vocabulary_translations_map(country_id, kind)` | `{source → {lang → name}}` |
| `upsert_feed_translation(feed_id, language, name)` | INSERT … ON CONFLICT DO UPDATE |
| `upsert_vocabulary_translation(country_id, kind, source_value, language, name)` | Same |
| `get_coverage(country_id, lang)` | Count translated vs. total |

---

## 6. Language Management

### 6.1 Language CRUD (`LanguageRepository`)

Located at `repositories/language_repository.py`:

| Method | Description |
|---|---|
| `create(code, name)` | Normalises code to lowercase; `is_active=True` by default |
| `get_all()` | All languages ordered by code |
| `get_by_code(code)` | Case-insensitive lookup |
| `update(code, name, is_active)` | Partial update; returns `None` if not found |

### 6.2 Country-Language Assignment

| Method | Description |
|---|---|
| `assign(country_id, code)` | INSERT; returns `True` if new, `False` if already assigned |
| `unassign(country_id, code)` | DELETE; returns `True` if deleted, `False` if not found |
| `get_all_countries_with_languages()` | Returns `list[(CountryModel, [lang_codes])]` |

The `'en'` unassignment guard is enforced at the router layer (HTTP 400), not in the repository,
so the repository method is clean and testable in isolation.

### 6.3 Cache Invalidation on Mutations

Every endpoint that changes `is_active` status calls `await invalidate_lang_cache()` before
committing:

```python
await repo.update(code, ...)
await db.commit()
await invalidate_lang_cache()   # DEL lang:active_codes
```

This ensures the next request re-fetches the updated active set from the DB and repopulates
the Redis cache with the correct 300-second TTL.

---

## 7. Schemas Reference

### Feed-related schemas (`app/schemas/feed.py`)

`FeedDetailsResponse` (and similar list items) gained three optional display fields:
```python
display_name:     Optional[str]    # translated feed name
display_type:     Optional[str]    # translated feed type
display_category: Optional[str]    # translated feed category
```

### Auth schemas (`app/schemas/auth.py`)

- `Country` has `supported_languages: List[str]`
- `UserResponse` has `preferred_language: str = "en"`
- `UserUpdateRequest` has `preferred_language: Optional[str]`

### Translation schemas (`app/schemas/translation.py`)

- `FeedTranslationUpsertRequest` — `{feed_id, language, name}`
- `FeedTranslationRecord` — `{feed_id, language, name, action?, created_at, updated_at}`
- `FeedTranslationListResponse` — `{success, feed_id, translations: [...]}`
- `WorkbookImportSummary` — counts + errors list
- `TranslationCoverageResponse` — count breakdown per kind

### Language schemas (`app/schemas/language.py`)

- `LanguageCreateRequest` — `{code, name}` — code auto-normalised to lowercase
- `LanguageUpdateRequest` — `{name?, is_active?}` — at least one required
- `LanguageResponse` — `{code, name, is_active, created_at?}`
- `LanguageListResponse` — `{success, languages: [...]}`
- `CountryWithLanguagesResponse` — `{id, name, country_code, currency?, is_active, languages: [...]}`
- `CountryLanguageListResponse` — `{success, countries: [...]}`

---

## 8. Router Organization

### Admin router (`routers/admin.py`) — i18n routes

Route ordering in the translation group is significant: `/translations/coverage` and
`/translations/workbook` must be declared **before** `/translations/{feed_id}` to prevent
FastAPI from matching literal path segments as the `feed_id` variable.

```
GET  /translations/workbook       → export workbook
POST /translations/workbook       → import workbook
GET  /translations/coverage       → coverage stats      ← must precede /{feed_id}
POST /translations                → upsert single
GET  /translations/{feed_id}      → list for feed
DEL  /translations/{feed_id}/{language}

POST /languages                   → create language
GET  /languages                   → list languages
PATCH /languages/{code}           → update language
GET  /countries                   → countries with languages
POST /countries/{country_id}/languages/{code}   → assign
DEL  /countries/{country_id}/languages/{code}   → unassign
```

### Auth router (`routers/auth.py`)

- `GET /countries` — batch-loads `CountryLanguage` rows and groups them per country.
- `PUT /user/{email_id}` — validates `preferred_language` against active codes before writing.

### Animal router (`routers/animal.py`)

Seven endpoints inject `Depends(get_language_authenticated)` and thread the resolved `lang`
string to the corresponding service and repository methods.

---

## 9. Test Infrastructure

### Test layout

```
tests/
  unit/
    test_i18n_phase2_lang.py       # Language resolution & Redis cache (mocked)
    test_i18n_phase3_localization.py   # Feed repository & service (mocked)
    test_i18n_phase4_workbook.py   # TranslationRepository & service (mocked)
    test_i18n_phase5_language.py   # LanguageRepository, schemas, guards (mocked)
  integration/
    test_i18n_phase4_integration.py    # Real Postgres, workbook export/import
    test_i18n_phase5_integration.py    # Real Postgres, language CRUD & assignment
```

### Test database

- Engine: PostgreSQL on `localhost:5455` (Docker container `rationsmart-test-pg`).
- Target DB name: `rationsmart_test` (hardcoded guard in integration fixtures).
- Schema: applied via Alembic `upgrade head` from the baseline migration stamp.
- DDL: minimal baseline tables are created by the test fixture before migration runs.
- Teardown: tables are dropped in dependency order; container is not stopped between runs.

### Running tests

```bash
cd /Users/satishchandra/ucdapp/rationsmart
source .venv/bin/activate
pytest tests/unit/test_i18n_phase2_lang.py tests/unit/test_i18n_phase3_localization.py \
       tests/unit/test_i18n_phase4_workbook.py tests/unit/test_i18n_phase5_language.py \
       tests/integration/test_i18n_phase4_integration.py \
       tests/integration/test_i18n_phase5_integration.py -v
```

---

## 10. Adding a New Language — Operator Runbook

1. `POST /v1/admin/languages` with `{"code": "<code>", "name": "<display name>"}`.
2. `POST /v1/admin/countries/{country_id}/languages/<code>` to assign to a country.
3. `GET /v1/admin/translations/workbook?country_id=<uuid>` — download the workbook (new
   language column will appear).
4. Fill translations; `POST /v1/admin/translations/workbook?country_id=<uuid>` to import.
5. Users in the country will see the new language in their profile settings immediately.

No code change, no migration, no restart required.

---

## 11. Known Deferred Items

| Item | Status |
|---|---|
| Diet recommendation / evaluation report feed names (`reporting.py`) | Deferred (Phase 3.5). Currently shown in English regardless of `lang` setting. |
| UI strings, menus, advisory text | Outside scope of i18n V2 (feed data layer only). |
| Per-workbook language column ordering | Currently alphabetical by language code. |
