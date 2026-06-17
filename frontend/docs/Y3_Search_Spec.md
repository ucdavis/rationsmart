# Y3 §1.1.1 — Feed Search: UI ↔ API Specification

**Status:** Draft for backend team review (Maria)
**Author:** Frontend (RationSmart PWA, testing branch)
**Date:** 2026-06-17
**Branch:** `testing` → https://rationsmart-testing.vercel.app

---

## 1. Background

The Feed Selection screen currently exposes a **3-step cascade**:

```
Feed Type (dropdown) → Feed Category (dropdown) → Feed Name (dropdown)
```

Per Y3 §1.1.1, users should additionally be able to **type a free-text
query** (e.g. "corn") and pick from a filtered list of feed ingredients.
Both paths must coexist — search does NOT replace the cascade, it
augments it.

**Hard requirement from the user:** *"the flow which is present should
NOT be disabled, it should work as it is. We are implementing a search
functionality along with it."*

---

## 2. UI surface

One search bar per `FeedRow` card (i.e. on every FEED 1 / FEED 2 / …
card in feed-selection). Placement: between the card header (`FEED N`
+ pencil + trash) and the existing Feed Type dropdown.

```
┌──────────────────────────────────────────────┐
│ FEED 1                              ✎  🗑    │
│ ┌──────────────────────────────────────────┐ │
│ │ 🔍 Search feeds (e.g. corn, silage)      │ │  ← NEW
│ └──────────────────────────────────────────┘ │
│   Feed Type *           Feed Category *     │
│  ┌──────────────┐      ┌──────────────┐    │
│  │ Forage     ⌄ │      │ Select       │    │
│  └──────────────┘      └──────────────┘    │
│   Feed *                 Price VND/KG *     │
│  ┌──────────────┐      ┌──────────────┐    │
│  │ Select feed⌄ │      │              │    │
│  └──────────────┘      └──────────────┘    │
│   Set inclusion limits                  ⚪ │
└──────────────────────────────────────────────┘
```

(Decision: per-row, not a single global search at the top — because the
user tapping into a specific card is what triggers the search context.
Stub already exists at the top of the page from an earlier commit; if
that's preferred we keep it, but the per-row version is the active one.)

---

## 3. API contract — what we need from the backend

### 3.1 New endpoint: `GET /v1/animal/search-feeds`

**Authentication:** `Authorization: Bearer <JWT>` (same as every other
`/v1/animal/*` endpoint).

**Query parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The user's search text. Case-insensitive substring match. |
| `country_id` | string (UUID) | yes | Filter to feeds available for this country. JWT-derived user is also factored in (custom feeds owned by the user should appear). |
| `limit` | integer | no (default 20) | Cap on result rows. |

**Example request:**

```
GET /v1/animal/search-feeds?query=corn&country_id=6c2a0573-1500-4603-8795-633ff80f1b00&limit=20
Authorization: Bearer eyJhbGc...
```

**Response (200):**

```json
{
  "feeds": [
    {
      "feed_uuid": "abc-...",
      "feed_name": "Whole corn silage, Dry Season",
      "feed_type": "Forage",
      "feed_category": "MAIZE FORAGE"
    },
    {
      "feed_uuid": "def-...",
      "feed_name": "Corn meal",
      "feed_type": "Concentrate",
      "feed_category": "CEREAL/CEREAL BY-PRODUCT"
    }
  ]
}
```

The frontend parser is already defensive — it accepts these alternate
shapes too (in priority order):

- `{ "feeds": [...] }` (preferred)
- `{ "standard_feeds": [...], "custom_feeds": [...] }` (merged)
- Bare array `[ ... ]`
- `{ "results": [...] }`

So Maria can pick whichever shape fits her backend; PWA handles them all.

**Per-item required fields:**

- `feed_uuid` (also accepts `feed_id` / `id`)
- `feed_name` (also accepts `fd_name` / `name`)
- `feed_type` (string — must match what `/v1/animal/unique-feed-type/...`
  returns, e.g. "Forage", "Concentrate")
- `feed_category` (string — must match what
  `/v1/animal/unique-feed-category` returns)

**Per-item optional fields (nice-to-have):**

- `is_custom` (bool) — render a small "Custom" pill in the search
  result for user-owned feeds
- `price_per_kg` (number) — if the backend has the user's last-used
  price for this feed, return it so we can pre-fill

**Empty-query behavior:**

- If `query` is empty or only whitespace, return `[]` (don't return
  every feed for the country — too heavy).

**Match algorithm (suggested):**

- Case-insensitive substring match on `feed_name`. So "corn" matches
  "Whole corn silage, Dry Season" and "Corn meal".
- Bonus: also match on `feed_category` so "silage" returns all silage
  entries.
- Bonus: support quoted phrases ("corn meal" matches that phrase only).

**Error response (4xx/5xx):**

Standard FastAPI `{detail: string | array}` shape. PWA already extracts
this into a snackbar via the axios interceptor.

---

## 4. UI behavior — full scenario walkthrough

### 4.1 Scenario A: Cascade-first (existing behavior, must keep working)

1. User taps FEED 1 card
2. User opens Feed Type dropdown → picks "Forage"
3. PWA fires `GET /v1/animal/unique-feed-category?country_id=&feed_type=Forage`
4. Category dropdown populates with Forage's categories
5. User opens Feed Category → picks "MAIZE FORAGE"
6. PWA fires `GET /v1/animal/feed-name?country_id=&feed_type=Forage&category=MAIZE FORAGE`
7. Feed dropdown populates with feeds in that combo
8. User picks "Whole corn silage, Dry Season"
9. Row is complete

**Spec impact:** zero. This is the current cascade.

### 4.2 Scenario B: Search-first (new)

1. User taps FEED 1 card
2. User types "corn" in search bar
3. After a 250 ms debounce, PWA fires
   `GET /v1/animal/search-feeds?query=corn&country_id=…`
4. Results dropdown anchored below the search bar shows the matching
   feeds with their type+category subtitle:
   ```
   Whole corn silage, Dry Season
   Forage · MAIZE FORAGE
   ────────────────────────────
   Corn meal
   Concentrate · CEREAL/CEREAL BY-PRODUCT
   ```
5. User taps "Whole corn silage, Dry Season"
6. **PWA writes ALL THREE values into the row's state in a single update:**
   ```ts
   onUpdate(item.id, {
     feed_type_name: "Forage",
     category_name: "MAIZE FORAGE",
     sub_category_name: "Whole corn silage, Dry Season",
     feed_uuid: "abc-...",
   });
   ```
7. The existing cascade `useEffect`s re-run automatically:
   - Categories effect fires (because `feed_type_name` changed):
     fetches `/v1/animal/unique-feed-category?...feed_type=Forage`.
     Result: dropdown OPTIONS list refreshes to all Forage categories.
     The currently-selected `MAIZE FORAGE` survives the cascade-reset
     check because it's in the new list (the keep-or-reset rule we
     ship today already covers this).
   - Sub-categories effect fires (because `category_name` changed):
     fetches `/v1/animal/feed-name?country_id=&feed_type=Forage&category=MAIZE FORAGE`.
     Result: feed dropdown OPTIONS list refreshes to all feeds in
     that combination. Selected `Whole corn silage, Dry Season`
     survives.
8. Row is complete. **User can now open the Category dropdown and pick
   a different category (still seeing all Forage categories), or open
   the Feed dropdown and pick a different feed (still seeing all feeds
   in the current combination).**

**Critical guarantee:** the search-first path leaves the row in
exactly the same state as if the user had walked the cascade manually
— so subsequent edits work identically.

### 4.3 Scenario C: Mixed (start cascade, refine with search)

1. User picks Feed Type = "Concentrate" via the dropdown
2. Category dropdown populates with Concentrate categories
3. User types "corn" in search bar
4. Search returns feeds matching "corn" — `Corn meal` (Concentrate /
   CEREAL/CEREAL BY-PRODUCT), `Whole corn silage` (Forage / MAIZE
   FORAGE), etc.

**Decision:** the search bar is **NOT** scoped to the current type
filter. It searches across the entire country's feed list. Picking a
result that belongs to a different type will silently switch the type
+ category dropdowns to match the picked feed. The earlier-picked
type is overwritten. This matches the user's stated intent: search is
a "shortcut to a feed" regardless of where the user is in the cascade.

If we wanted the scoped variant ("only show results in the currently-
picked type"), we'd add a `feed_type` query param to `search-feeds`.
Default is unscoped — Maria can add scoping later if requested.

### 4.4 Scenario D: User clears the search

- Clear (X) button inside the search bar empties the query
- Results dropdown closes
- **The picked feed (if any) stays in place** — clearing the search
  text doesn't undo the row's filled values

### 4.5 Scenario E: No matches

- Search returns `[]`
- Dropdown shows a "No matches" empty state
- Existing row state untouched

### 4.6 Scenario F: Search backend not yet live

- `searchFeeds()` function is a stub returning `[]`
- UI behaves as Scenario E (no matches)
- Once Maria ships the endpoint, swap the stub for the real call
- One-line change in `src/lib/api.ts` (function body):
  ```ts
  return api.get("/v1/animal/search-feeds", { params: { query, country_id, limit } });
  ```

---

## 5. Backend implementation notes for Maria

### 5.1 Indexing

The search query will be hot — typed by every user during feed
selection. Suggest:

- A trigram index on `feed_name` (PostgreSQL `pg_trgm` extension)
  for fast substring match
- OR a simple `ILIKE '%query%'` if traffic is low — `EXPLAIN` should
  confirm acceptable latency before adding the index

### 5.2 Country / user scoping

The search must return:
- Standard feeds where `fd_country_id = :country_id` (or
  `fd_country_name = :country_name` — whatever the canonical column is)
- Plus custom feeds owned by the JWT-resolved user

Mirror exactly what `/v1/animal/feed-name` already returns when filtered
by country only.

### 5.3 Ranking

Stable order across queries matters for UX. Suggested ordering:

1. Custom feeds owned by the user (top)
2. Standard feeds with `feed_name` matching at start of string ("Corn
   meal" before "Whole corn silage" for query "corn")
3. Standard feeds with substring match elsewhere

Ranking is a nice-to-have — alphabetical is fine for v1.

### 5.4 Returning `feed_type` + `feed_category`

The frontend needs the picked feed's type and category to populate the
dropdowns. The feeds table likely has `fd_type` (string) and
`fd_category` (string) columns already — return those as `feed_type`
and `feed_category` per result row.

---

## 6. Open questions for Maria

1. **Endpoint path** — `GET /v1/animal/search-feeds` OK, or should it
   live elsewhere? The frontend can wire to whatever you ship.
2. **Result wrapper** — `{feeds: []}` preferred, but PWA accepts bare
   array, `{results: []}`, `{standard_feeds, custom_feeds}` too. Pick
   whichever fits your existing pattern.
3. **Scoping by type / category** — should search-feeds accept an
   optional `feed_type` filter? Currently the PWA passes only `query`
   + `country_id`. If you add `feed_type`, frontend can opt-in.
4. **Match algorithm** — case-insensitive substring on `feed_name`
   only, or also on `feed_category`? Recommended: both.
5. **Empty query behavior** — return `[]` or the first 20 feeds for
   the country? Frontend assumes `[]` (no-op).

---

## 7. Frontend status

| Item | Status |
|---|---|
| Search bar UI on FeedRow | Shipped as a stub on testing branch |
| Debounced search (250 ms) | Shipped |
| Result dropdown with type+category subtitle | Shipped |
| Click-result → populate row state | Shipped — writes `feed_type_name`, `category_name`, `sub_category_name`, `feed_uuid` in one call; cascade effects refresh dropdowns automatically |
| Defensive response parsing | Shipped — handles 4 shape variants per §3.1 |
| Cascade race protection | Shipped — fast type-changes don't leave stale data in dropdowns |
| Real backend call | **Blocked on Maria** — currently `searchFeeds()` returns `[]` |

When the backend endpoint is live, the one-line change is in
`src/lib/api.ts`, function `searchFeeds`.

---

## 8. Acceptance criteria

A test pass would walk all six scenarios in §4 against the live backend:

1. ☐ Pure cascade (no search) — works as before, no regression
2. ☐ Search-only path — type "corn", pick a result, all three dropdowns
   populated, row complete
3. ☐ After search-pick, open the Category dropdown — shows ALL
   categories of the picked feed type, with the picked one highlighted
4. ☐ After search-pick, open the Feed dropdown — shows ALL feeds in
   the (type, category) combination, with the picked one highlighted
5. ☐ User changes Category dropdown after search — Feed dropdown
   refreshes, picked feed cleared if not in new combo
6. ☐ Search across different types (e.g. "corn" returns both Forage
   and Concentrate feeds) — picking either populates correctly
7. ☐ Empty / clear search — picked feed stays in place
8. ☐ No-match query — empty-state shown, no errors
9. ☐ Network error on search — snackbar shown, dropdowns unaffected
10. ☐ Slow search (>500ms) — request cancellation if user keeps typing
    (frontend already debounces 250ms; backend timeout up to 5s OK)
