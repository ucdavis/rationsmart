# Feed Search — Implementation Plan
**Feature:** Y3 §1.1.1 — `GET /v1/animal/search-feeds`
**Date:** 2026-06-17
**Status:** Approved, pending implementation

---

## 1. Background

Feed selection currently uses a 3-step cascade:

```
Feed Type (radio) → Feed Category (dropdown) → Feed (dropdown)
```

Y3 §1.1.1 requires users to also be able to type a free-text query (e.g. "corn") and pick from a filtered list. Both paths must coexist — search does **not** replace the cascade.

The frontend (testing branch) has already shipped a stub `searchFeeds()` in `src/lib/api.ts` returning `[]`. A one-line swap in that file activates the real endpoint once it is live.

---

## 2. Endpoint Contract

### Request

```
GET /v1/animal/search-feeds
Authorization: Bearer <jwt>
```

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | yes | Case-insensitive substring; see §3 for short-query behaviour |
| `country_id` | string (UUID) | yes | Same UUID from `GET /v1/auth/countries` |
| `limit` | integer | no | Default 20, max 100 |

### Response 200

```json
{
  "feeds": [
    {
      "feed_uuid": "5f1e9a04-...",
      "feed_name": "Whole corn silage, Dry Season",
      "feed_type": "Forage",
      "feed_category": "MAIZE FORAGE",
      "fd_code": "VN-FOR-001",
      "is_custom": false
    },
    {
      "feed_uuid": "9c2b5d11-...",
      "feed_name": "John-Corn (custom)",
      "feed_type": "Concentrate",
      "feed_category": "CEREAL/CEREAL BY-PRODUCT",
      "fd_code": "CUST-042",
      "is_custom": true
    }
  ],
  "total_count": 2
}
```

### Response — short or empty query

```json
{ "feeds": [], "total_count": 0 }
```

### Response 401

```json
{ "detail": "Invalid token" }
```

### Response 422

FastAPI default — triggered by missing `country_id`, non-UUID value, etc.

---

## 3. Agreed Decisions

| # | Topic | Decision | Reason |
|---|-------|----------|--------|
| 1 | Minimum query length | **2 characters** | Sweet spot for SQL-backed typeahead: avoids overly broad ILIKE scans ("c" → half the library), still gives users fast feedback. 250 ms debounce on the frontend further reduces load. Single-character or empty queries return `{feeds:[], total_count:0}` with no DB hit. |
| 2 | Match fields | **`feed_name` only** | Do not match on `feed_category`. Matching category was listed as optional in the spec; we explicitly exclude it to keep results focused on ingredient names. |
| 3 | `feed_type` scoping param | **Not implemented** | Spec listed it as a future optional param. We skip it entirely for now. |
| 4 | Empty / invalid `country_id` | **422** (FastAPI default) | Consistent with the rest of the API. No special-case empty-results fallback. |
| 5 | Response wrapper | `{feeds: [...], total_count: N}` | Matches spec §9.1; frontend parser also accepts bare array and `{results:[]}` but canonical form is used. |
| 6 | `is_custom` field | **Included** | Required by frontend to show the "Custom" pill on search results. |
| 7 | `total_count` field | **Included** | Enables the "Showing 20 of 47 — type more to narrow" UI hint. |
| 8 | Pagination | **None** | This is a typeahead, not a list view. If too many results, users narrow the query. Pagination can be added later if telemetry shows users routinely hitting the 20-row cap. |
| 9 | Trigram index | **Deferred** | `ILIKE '%query%'` is acceptable for current traffic. Add `pg_trgm` index in a separate migration once load warrants it. Spec §5 item 2 documents the recommendation. |

---

## 4. Scoping Rules

- **Standard feeds:** `feeds.fd_country_id = :country_id`
- **Custom feeds:** `custom_feeds.fd_country_id = :country_id` AND `custom_feeds.user_id = <JWT-resolved user>`

Mirrors the scoping used by the existing `GET /v1/animal/feed-name` endpoint.

---

## 5. Ranking

Applied in Python after DB fetch (both result sets are bounded, so Python sort is negligible cost):

1. **Custom feeds first** (`is_custom=True` before `is_custom=False`)
2. **Prefix matches before mid-string matches** within each group (`feed_name.lower().startswith(query.lower())`)
3. **Alphabetical** fallback within each sub-group

---

## 6. Files to Change

All changes are in `/Users/satishchandra/ucdapp/rationsmart` only.

### 6.1 `repositories/feed_repository.py`

Add method `search_feeds(query, country_id, user_id, limit)`:

- Runs ILIKE `%{query}%` on `Feed.fd_name` for standard feeds scoped to `country_id`
- Runs ILIKE `%{query}%` on `CustomFeed.fd_name` for custom feeds scoped to `country_id` + `user_id`
- Runs two COUNT queries for `total_count` (pre-limit, across both tables)
- Returns `(std_feeds: List[Feed], custom_feeds: List[CustomFeed], total_count: int)`

### 6.2 `services/diet_service.py`

Add function `search_feeds(db, query, country_id, user_id, limit)`:

- Guards: `len(query.strip()) < 2` → return `([], 0)` immediately
- Calls `FeedRepository(db).search_feeds(...)`
- Applies Python ranking (§5)
- Builds and returns the response list (dicts with `feed_uuid`, `feed_name`, `feed_type`, `feed_category`, `fd_code`, `is_custom`) trimmed to `limit`

### 6.3 `routers/animal.py`

Add endpoint `GET /search-feeds`:

```python
@router.get("/search-feeds", summary="Typeahead search across feeds by name")
async def search_feeds(
    query: str,
    country_id: str,
    limit: int = 20,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
```

- Clamps `limit` to max 100
- Calls `diet_service.search_feeds(...)`
- Returns `{"feeds": [...], "total_count": N}`

---

## 7. No Migration Required

The endpoint queries existing `feeds` and `custom_feeds` tables. No schema changes needed.

A future migration to add a trigram index would look like:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_feeds_fd_name_trgm ON feeds USING gin (fd_name gin_trgm_ops);
CREATE INDEX idx_custom_feeds_fd_name_trgm ON custom_feeds USING gin (fd_name gin_trgm_ops);
```

This is **not** part of the current implementation.

---

## 8. Acceptance Criteria (from spec §8)

1. Pure cascade — works as before (no regression)
2. Search-only — type "co" (2+ chars), pick result, all 5 fields populated (`feed_uuid`, `feed_name`, `feed_type`, `feed_category`, `fd_code`)
3. After search-pick, Category dropdown shows ALL categories for picked type with picked one highlighted
4. After search-pick, Feed dropdown shows ALL feeds in (type, category) with picked one highlighted
5. Search across types — picking a result from any type populates the radio + dropdowns correctly
6. Clear search — picked feed stays
7. No-match query — returns `{feeds:[], total_count:0}`, no errors
8. Short query (< 2 chars) — returns `{feeds:[], total_count:0}` immediately, no DB hit
9. Network error — frontend snackbar, dropdowns unaffected
10. Rapid type changes — no stale data (race-protected on frontend)

---

## 9. Out of Scope

- `feed_type` query parameter for scoped search
- Pagination (`page` / `page_size`)
- Matching on `feed_category`
- Trigram index migration
- Quoted-phrase matching (e.g. `"corn meal"`)
