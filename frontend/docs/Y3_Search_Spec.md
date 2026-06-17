# Y3 §1.1.1 — Feed Search: UI ↔ API Specification

**Status:** Draft for backend team review (Maria)
**Author:** Frontend (RationSmart PWA, testing branch)
**Date:** 2026-06-17
**Branch:** `testing` → https://rationsmart-testing.vercel.app

---

## 1. Background

Feed Selection currently uses a 3-step cascade:

```
Feed Type (radio) → Feed Category (dropdown) → Feed (dropdown)
```

Per Y3 §1.1.1, users should additionally be able to **type a free-text
query** (e.g. "corn") and pick from a filtered list of feed ingredients.

Both paths must coexist — search does NOT replace the cascade.

---

## 2. New FeedRow layout

```
┌─────────────────────────────────────────────────────┐
│ FEED 1                                   ✎   🗑     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🔍  Search feeds (e.g. corn, silage)            │ │   ← row 1: search
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│  Feed Type *                                        │   ← row 2: type as radio
│  ( ● Forage )   ( ○ Concentrate )                   │     (full width, 2 options)
│                                                     │
│  Feed Category *           Feed *                   │   ← row 3: category + feed
│  ┌──────────────┐         ┌──────────────┐         │     (50 / 50)
│  │ Select   ⌄  │         │ Select  ⌄   │         │
│  └──────────────┘         └──────────────┘         │
│                                                     │
│  Set inclusion limits                       ⚪     │   ← row 4: toggle
│                                                     │
│  Price VND/KG *                                     │   ← row 5: price (full width)
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ── only when "Set inclusion limits" is ON ──       │
│  Min (kg/day)              Max (kg/day)             │
│  ┌──────────────┐         ┌──────────────┐         │
│  │ NA           │         │ No upper bnd │         │
│  └──────────────┘         └──────────────┘         │
└─────────────────────────────────────────────────────┘
```

Row order (top → bottom):

1. Search bar
2. Feed Type — radio (full width, currently 2 options: Forage,
   Concentrate)
3. Feed Category + Feed — single row, 50/50
4. Set inclusion limits — toggle
5. Min + Max — 50/50 (only when toggle is ON)
6. Price — full width

If backend ever adds a 3rd feed type, the layout will need to flip
back to a dropdown.

---

## 3. UI behavior — 6 scenarios

### A. Cascade-first (existing — must not regress)

1. Tap FEED 1 → row visible
2. Pick Feed Type radio = "Forage"
3. PWA calls `GET /v1/animal/unique-feed-category?country_id=&feed_type=Forage`
4. Category dropdown populates
5. Pick a category → PWA calls `GET /v1/animal/feed-name?country_id=&feed_type=&category=`
6. Feed dropdown populates
7. Pick a feed → row complete

### B. Search-first (new)

1. Tap FEED 1 → row visible
2. Type "corn" in search bar
3. After 250 ms debounce: PWA calls
   `GET /v1/animal/search-feeds?query=corn&country_id=&limit=20`
4. Results appear below the search bar:
   ```
   Whole corn silage, Dry Season
   Forage · MAIZE FORAGE
   ───────────────────────────
   Corn meal
   Concentrate · CEREAL/CEREAL BY-PRODUCT
   ```
5. Tap "Whole corn silage, Dry Season"
6. PWA writes **all four values in one state update**:
   ```ts
   onUpdate(item.id, {
     feed_type_name: "Forage",
     category_name: "MAIZE FORAGE",
     sub_category_name: "Whole corn silage, Dry Season",
     feed_uuid: "abc-...",
   });
   ```
7. Existing cascade `useEffect`s re-run automatically:
   - Categories effect fires → fetches full category list for Forage
   - Sub-categories effect fires → fetches full feed list for (Forage, MAIZE FORAGE)
8. Result: all dropdowns + radio reflect the picked feed. Opening
   any dropdown still shows ALL valid options — the picked value is
   just one of many.

### C. Mixed — cascade started, refined with search

1. Pick Feed Type = "Concentrate" via radio
2. Type "corn" in search bar — search is **unscoped** by default,
   returns matches from any type
3. If picked feed belongs to a different type, the radio + dropdowns
   switch to match the picked feed (overwriting the earlier choice)

If we ever need scoped search ("only show results in the currently-
picked type"), add a `feed_type` query param to `/v1/animal/search-feeds`.
Default is unscoped.

### D. Clear the search

- Tap X inside the search bar → query empties, results close
- **Picked feed (if any) stays in place** — clearing search doesn't undo

### E. No matches

- Search returns `[]` → "No matches" hint shown
- Existing row state untouched

### F. Search backend not live yet

- Frontend `searchFeeds()` is a stub returning `[]`
- UI behaves like Scenario E
- One-line swap when endpoint is live

---

## 4. Pagination decision

**No pagination on search-feeds.** Reasoning:

- Mobile UX: infinite scroll inside a small popover anchored to the
  search bar is awkward; "Page 2 / 3 / 4" buttons even worse
- Search is meant for narrowing — if the user has too many matches,
  they refine the query ("corn silage" instead of "corn")
- Default `limit=20` covers the realistic "show me what matches"
  use case
- Response includes optional `total_count` so the UI can show
  "Showing 20 of 47 — type more to narrow" if Maria provides it

**Pagination is added later if real usage shows users routinely hit
the 20-row cap.** Telemetry hint for Maria: count `len(results)` per
search query and log when it equals `limit`.

The existing paginated endpoints (admin list-feeds, list-users, etc.)
keep their `page` / `page_size` params — search-feeds is the special
case because it's a UX-driven typeahead, not a list-everything view.

---

## 5. Open questions for Maria

1. Endpoint path — `GET /v1/animal/search-feeds` OK?
2. Response wrapper — `{feeds: [...]}` preferred, but PWA parser
   accepts bare array / `{results: []}` / `{standard_feeds, custom_feeds}`.
3. Match algorithm — case-insensitive substring on `feed_name` only,
   or also on `feed_category`? Recommended: both.
4. Empty query behavior — `[]` (recommended) or first N feeds?
5. `is_custom` field per row — useful for a "Custom" pill in the
   results list. Nice-to-have.
6. Optional `total_count` field for the "Showing 20 of 47" hint.

---

## 6. Frontend status

| Item | Status |
|---|---|
| Search bar UI on FeedRow | Shipped (stub) |
| 250 ms debounce | Shipped |
| Result dropdown with type+category subtitle | Shipped |
| Click-result → populate all 4 row fields in one update | Shipped |
| Cascade refreshes dropdowns after search-pick | Shipped |
| Defensive response parser (4 shape variants) | Shipped |
| Race protection for rapid type changes | Shipped |
| New FeedRow layout (radio, 50/50, toggle, price last) | **Pending — this commit** |
| Real backend call | **Blocked on Maria** |

One-line swap in `src/lib/api.ts` `searchFeeds()` body when endpoint is live.

---

## 7. Acceptance criteria

1. ☐ Pure cascade — works as before
2. ☐ Search-only — type "corn", pick result, all 4 fields populated
3. ☐ After search-pick, open Category dropdown — shows ALL categories
   for picked type, with picked one highlighted
4. ☐ After search-pick, open Feed dropdown — shows ALL feeds in
   (type, category), with picked one highlighted
5. ☐ Change Category after search — Feed refreshes, picked feed
   cleared if not in new combo
6. ☐ Search across types — picking either type's feed populates
   radio + dropdowns correctly
7. ☐ Clear search — picked feed stays
8. ☐ No-match query — empty state, no errors
9. ☐ Network error — snackbar, dropdowns unaffected
10. ☐ Rapid type changes — no stale data in dropdowns (race-protected)

---

## 8. API contract — request + response examples

### 8.1 `GET /v1/animal/search-feeds`

**Headers**

```
Authorization: Bearer <jwt>
Accept: application/json
```

**Request**

```http
GET /v1/animal/search-feeds?query=corn&country_id=6c2a0573-1500-4603-8795-633ff80f1b00&limit=20
```

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | yes | Case-insensitive substring; empty → `[]` |
| `country_id` | string (UUID) | yes | Same UUID as `/v1/auth/countries` |
| `limit` | integer | no | Default 20, max 100 |

**Response 200**

```json
{
  "feeds": [
    {
      "feed_uuid": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "feed_name": "Whole corn silage, Dry Season",
      "feed_type": "Forage",
      "feed_category": "MAIZE FORAGE",
      "is_custom": false
    },
    {
      "feed_uuid": "7d3a4b88-1500-4603-8795-633ff80f1b22",
      "feed_name": "Corn meal",
      "feed_type": "Concentrate",
      "feed_category": "CEREAL/CEREAL BY-PRODUCT",
      "is_custom": false
    },
    {
      "feed_uuid": "9c2b5d11-1500-4603-8795-633ff80f1b23",
      "feed_name": "John-Corn (custom)",
      "feed_type": "Concentrate",
      "feed_category": "CEREAL/CEREAL BY-PRODUCT",
      "is_custom": true
    }
  ],
  "total_count": 3
}
```

**Response 200 — empty query**

```json
{
  "feeds": [],
  "total_count": 0
}
```

**Response 401 — missing or invalid JWT**

```json
{
  "detail": "Invalid token"
}
```

**Response 422 — missing required param**

```json
{
  "detail": [
    {
      "loc": ["query", "country_id"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### 8.2 Existing endpoints used by the click-result flow

After the user picks a search result, the existing cascade endpoints
are called automatically to refresh dropdown options. Frontend already
talks to these; no changes needed — included here for completeness.

#### `GET /v1/animal/unique-feed-category`

**Request**

```http
GET /v1/animal/unique-feed-category?country_id=6c2a0573-1500-4603-8795-633ff80f1b00&feed_type=Forage
```

**Response 200**

```json
{
  "feed_categories": [
    "GRASS/LEGUME FORAGE",
    "MAIZE FORAGE",
    "OTHER FORAGE"
  ]
}
```

#### `GET /v1/animal/feed-name`

**Request**

```http
GET /v1/animal/feed-name?country_id=6c2a0573-1500-4603-8795-633ff80f1b00&feed_type=Forage&category=MAIZE FORAGE
```

**Response 200**

```json
{
  "standard_feeds": [
    {
      "feed_uuid": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "feed_name": "Whole corn silage, Dry Season"
    },
    {
      "feed_uuid": "5f1e9a04-1500-4603-8795-633ff80f1b29",
      "feed_name": "Whole corn silage, Wet Season"
    }
  ],
  "custom_feeds": []
}
```
