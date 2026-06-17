# Y3 §1.1.1 — Feed Search: UI ↔ API Specification

**Status:** Draft for backend team review
**Author:** Frontend (RationSmart PWA, testing branch)
**Date:** 2026-06-17
**Branch:** `testing` → https://rationsmart-testing.vercel.app

---

## 1. Background

Feed Selection currently uses a 3-step cascade:

```
Feed Type (radio) → Feed Category (dropdown) → Feed (dropdown)
```

Per Y3 §1.1.1, users should additionally be able to type a free-text
query (e.g. "corn") and pick from a filtered list of feed ingredients.

Both paths must coexist — search does NOT replace the cascade.

---

## 2. Page layout — single search + tap-to-target

There is **one search bar at the top of the Feed Selection screen**,
not one per card. The user taps a FeedRow card to mark it as the
"search target"; the next picked result populates that card. With no
card explicitly tapped, the first row with no feed selected is filled
as a fallback.

```
┌─────────────────────────────────────────────────────────┐
│  Custom Diet Limits        Custom Feed                  │
│  ( ○ Diet Recommendation )    ( ○ Diet Evaluation )     │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │   page-level
│  │ 🔍  Tap a card, then search (e.g. corn, silage)   │ │   search bar
│  └───────────────────────────────────────────────────┘ │   (one only)
│                                                         │
│  ╔═══════════════════════════════════════════════════╗ │   ← active card
│  ║ FEED 1   [Search target]                ✎         ║ │     (dark green
│  ║                                                   ║ │      ring + pill)
│  ║   Feed Type *                                     ║ │
│  ║   ( ● Forage )   ( ○ Concentrate )                ║ │
│  ║   Feed Category *      Feed *                     ║ │
│  ║   [Select   ⌄  ]      [Select   ⌄  ]              ║ │
│  ║   Set inclusion limits                       ⚪   ║ │
│  ║   Price VND/KG *                                  ║ │
│  ║   [                                            ]  ║ │
│  ╚═══════════════════════════════════════════════════╝ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │   ← idle card
│  │ FEED 2                                  ✎   🗑    │ │     (just shadow,
│  │   …                                               │ │      no ring)
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

FeedRow card row order:

1. Feed Type — radio buttons, full width (currently 2 options:
   Forage, Concentrate). Falls back to dropdown if backend ever
   returns 3+ types.
2. Feed Category + Feed — single row, 50/50 dropdowns
3. Set inclusion limits — toggle
4. Min + Max — 50/50, **directly below the toggle**, shown ONLY when
   the toggle is ON
5. Price — full width, last
6. Quantity + Cost — eval mode only, 50/50 below price

Visual cues for the active card:

- 2-px dark-green outer ring + soft drop shadow
- "Search target" pill in the header, next to "FEED N"
- Search bar placeholder switches from "Tap a card, then search…"
  to "Search feeds (target highlighted below)"

---

## 3. UI behavior — 6 scenarios

### A. Cascade-first (existing — must not regress)

1. Tap FEED 1
2. Pick Feed Type radio = "Forage"
3. PWA calls `GET /v1/animal/unique-feed-category?country_id=&feed_type=Forage`
4. Category dropdown populates
5. Pick a category → PWA calls `GET /v1/animal/feed-name?country_id=&feed_type=&category=`
6. Feed dropdown populates
7. Pick a feed → row complete

### B. Search-first (new)

1. Tap FEED 2 — card lights up with a dark-green ring + "Search
   target" pill. `activeRowId` is now `"feed_2_…"`.
2. Type "corn" in the page-level search bar at the top
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
6. PWA writes all four values into the **active** row (FEED 2):
   ```ts
   // target priority:
   //   1. activeRowId if set
   //   2. first row with no feed_uuid (fallback for "no card tapped")
   //   3. row 0 (last resort)
   onUpdate(activeRowId, {
     feed_type_name: "Forage",
     category_name: "MAIZE FORAGE",
     sub_category_name: "Whole corn silage, Dry Season",
     feed_uuid: "abc-...",
   });
   ```
7. Existing cascade effects on that row re-run automatically:
   - Categories effect → fetches full category list for Forage
   - Sub-categories effect → fetches full feed list for (Forage,
     MAIZE FORAGE)
8. `activeRowId` is cleared (search task complete). FEED 2 loses
   the green ring; the search bar's placeholder reverts to "Tap a
   card, then search…".
9. Result: FEED 2's dropdowns + radio reflect the picked feed.
   Opening any dropdown shows ALL valid options — the picked value
   is just one of many.

### C. Mixed — cascade started on one card, refined with search

1. On FEED 2: pick Feed Type = "Concentrate" via radio. Category
   dropdown populates.
2. Without tapping any specific card, type "corn" in the search
   bar.
3. Search returns matches; tap "Whole corn silage" (a Forage).
4. With no `activeRowId` set, the fallback rule kicks in: populate
   the first row whose `feed_uuid` is null. If FEED 1 is still
   empty, the result lands there — leaving FEED 2's manually-picked
   Concentrate type intact.
5. If FEED 1 already has a feed, FEED 2 gets overwritten (its
   manually-picked Concentrate flips to Forage to match the search
   result).

If scoped search is needed later ("only show results in the currently-
picked type"), add a `feed_type` query param to
`/v1/animal/search-feeds`. Default is unscoped.

### G. No card tapped before searching

1. The Generic case — user types in the search bar without first
   tapping any card.
2. Search bar placeholder reads "Tap a card, then search…" as a
   hint that targeting is recommended.
3. Picking a result still works: with no `activeRowId`, the first
   row without a feed_uuid is filled. If every row is already
   populated, row 1 is overwritten.
4. This deliberately avoids "search does nothing" — there's always
   a sensible target.

### D. Clear the search

- Tap X inside the search bar → query empties, results close
- Picked feed (if any) stays in place — clearing search doesn't undo

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
- Search is meant for narrowing — if a user has too many matches,
  they refine the query ("corn silage" instead of "corn")
- Default `limit=20` covers the realistic typeahead use case
- Response includes optional `total_count` so the UI can show
  "Showing 20 of 47 — type more to narrow" if backend provides it

Pagination can be added later if real usage shows users routinely
hit the 20-row cap. Telemetry hint: count `len(results)` per search
query and log when it equals `limit`.

The existing paginated endpoints (admin list-feeds, list-users, etc.)
keep their `page` / `page_size` params — search-feeds is the special
case because it's a UX-driven typeahead, not a list-everything view.

---

## 5. Backend work required

The frontend is shipped on the testing branch and ready to consume
the endpoint. Backend tasks:

1. **Build `GET /v1/animal/search-feeds`** per the schema in §8.1
2. **Index strategy** — feed_name will be hot. Recommend a trigram
   index (PostgreSQL `pg_trgm`) for fast substring match. A simple
   `ILIKE '%query%'` may be acceptable if traffic is low; verify with
   `EXPLAIN`.
3. **Country / user scoping** — return:
   - Standard feeds where `fd_country_id = :country_id` (or
     `fd_country_name`)
   - Plus custom feeds owned by the JWT-resolved user
   Mirror the same scoping `/v1/animal/feed-name` uses today.
4. **Return `feed_type` + `feed_category`** per row. The frontend
   uses these to drive the cascade refresh after the user picks a
   search result.
5. **Empty query** — return `{feeds: [], total_count: 0}`. Do NOT
   return every feed for the country (too heavy for a typeahead).
6. **Match algorithm (recommended)** —
   - Case-insensitive substring on `feed_name` (primary)
   - Also match on `feed_category` ("silage" returns all silage entries)
   - Optional: support quoted phrases ("corn meal" matches only that
     phrase)
7. **Ranking (recommended, optional)** —
   1. User's custom feeds first
   2. Prefix matches before mid-string matches
   3. Alphabetical fallback
8. **Optional fields** — `is_custom` (bool) for the "Custom" pill in
   results; `total_count` for the "Showing N of M" hint.

---

## 6. Open questions for the backend team

1. Endpoint path — `GET /v1/animal/search-feeds` OK?
2. Response wrapper — `{feeds: [...]}` preferred, but the PWA parser
   accepts bare array / `{results: []}` / `{standard_feeds, custom_feeds}`.
3. Match algorithm — case-insensitive substring on `feed_name` only,
   or also on `feed_category`?
4. Empty query behavior — `[]` (recommended) or first N feeds?
5. `is_custom` field per row?
6. `total_count` field for the "Showing 20 of 47" hint?

---

## 7. Frontend status

| Item | Status |
|---|---|
| Single page-level search bar (top of /feed-selection) | Shipped (stub) |
| Tap-card-to-mark-as-target | Shipped |
| `activeRowId` state + visual highlight (ring + pill) | Shipped |
| Search bar placeholder switches with target state | Shipped |
| 250 ms debounce | Shipped |
| Result dropdown with `type · category` subtitle | Shipped |
| Click-result → populate all 4 row fields in one update | Shipped |
| Target priority (activeRowId → first empty → row 0) | Shipped |
| Cascade refreshes dropdowns after search-pick | Shipped |
| Defensive response parser (4 shape variants) | Shipped |
| Race protection for rapid type changes | Shipped |
| New FeedRow layout (radio, 50/50, toggle, min/max under toggle, price last) | Shipped |
| Forage-required gate before Generate | Shipped |
| Real backend call | Blocked on backend |

One-line swap in `src/lib/api.ts` `searchFeeds()` body when the
endpoint is live.

---

## 8. Acceptance criteria

1. Pure cascade — works as before, no regressions
2. Tap a card → it shows a dark-green ring + "Search target" pill;
   `activeRowId` is set
3. Tap a different card → ring + pill move to the new card
4. Search-and-pick **with** a card active → that specific card is
   populated
5. Search-and-pick with **no** card active → first row with empty
   feed is populated (fallback)
6. After search-pick, the active card's ring disappears
   (activeRowId clears)
7. After search-pick, open Category dropdown → shows ALL
   categories for picked type, with picked one highlighted
8. After search-pick, open Feed dropdown → shows ALL feeds in
   (type, category), with picked one highlighted
9. Change Category after search → Feed refreshes, picked feed
   cleared if not in new combo
10. Search across types → picking either type's feed populates
    radio + dropdowns correctly on the targeted card
11. Clear search (X button) → picked feed stays in place
12. No-match query → empty state, no errors
13. Network error → snackbar, dropdowns unaffected
14. Rapid type changes → no stale data in dropdowns (race-protected)

<!-- Legacy numbered list left in place for git-diff readability — the
     authoritative list is the 14 points above. -->
<!--
1. Pure cascade — works as before
2. Search-only — type "corn", pick result, all 4 fields populated
3. After search-pick, open Category dropdown — shows ALL categories
   for picked type, with picked one highlighted
4. After search-pick, open Feed dropdown — shows ALL feeds in
   (type, category), with picked one highlighted
5. Change Category after search — Feed refreshes, picked feed
   cleared if not in new combo
6. Search across types — picking either type's feed populates radio
   + dropdowns correctly
7. Clear search — picked feed stays
8. No-match query — empty state, no errors
9. Network error — snackbar, dropdowns unaffected
10. Rapid type changes — no stale data in dropdowns (race-protected)
-->

---

## 9. API contract — request + response examples

### 9.1 `GET /v1/animal/search-feeds`

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
| `query` | string | yes | Case-insensitive substring; empty returns `[]` |
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

### 9.2 Existing endpoints triggered by the click-result flow

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

---

## 10. Y3 §1.1.2 — Per-feed inclusion limits (Min/Max kg/day)

Each feed card in Feed Selection should include optional minimum and
maximum fields in kg/day, as-fed. A toggle controls whether these
fields are active. When the toggle is off, the ingredient remains
unconstrained and the optimizer runs normally. When it is on, any
entered bounds should be passed to the optimizer.

### 10.1 What's needed

- Add a toggle labeled **"Set inclusion limits"** on each feed card,
  default **off**.
- When the toggle is **off**, hide the Min and Max fields and do not
  pass bounds to the optimizer.
- When the toggle is **on**, show **"Min (kg/day)"** and
  **"Max (kg/day)"** input fields.
- Both fields remain optional even when the toggle is on:
  - blank Min → defaults to NA (no lower bound)
  - blank Max → no upper bound
- Only active bounds are passed to the optimizer.

### 10.2 Reset behavior

The toggle and any stored Min/Max values reset when the feed selected
on the row changes. Specifically:

- Toggle goes back to **off**
- Min and Max are cleared

This fires whenever `feed_uuid` becomes null on the row — which happens
when the user changes Feed Type, Feed Category, or directly clears the
Feed dropdown. Prevents stale bounds from a previous feed leaking into
the next selection on the same card.

The toggle is also disabled (greyed out, non-interactive) until a
feed is actually picked on that row.

### 10.3 Layout (FeedRow card)

```
┌─────────────────────────────────────────┐
│ FEED 1                              ✎  │
│                                         │
│   Feed Type *                           │
│   ( ● Forage )   ( ○ Concentrate )      │
│                                         │
│   Feed Category *                       │
│   [Select   ⌄  ]                        │
│                                         │
│   Feed *                                │
│   [Select   ⌄  ]                        │
│                                         │
│   Set inclusion limits         ⚫━━━━━  │  ← toggle ON
│   ┌──────────────┐  ┌──────────────┐   │
│   │ Min (kg/day) │  │ Max (kg/day) │   │   shown only
│   │ NA           │  │ No upper bnd │   │   when toggle ON
│   └──────────────┘  └──────────────┘   │
│                                         │
│   Price VND/KG *                        │
│   [                                  ]  │
└─────────────────────────────────────────┘
```

Only the switch itself is interactive — tapping the "Set inclusion
limits" label area does NOT flip the toggle.

### 10.4 API change — `POST /v1/animal/diet-recommendation`

The `feed_selection[]` array gains two optional keys per entry.
Backwards compatible: when omitted, behavior is unchanged.

| Field | Type | Required | Notes |
|---|---|---|---|
| `min_kg_per_day` | number | no | Lower bound, as-fed kg/day. Omit when toggle is off OR when the Min field is blank with toggle on. |
| `max_kg_per_day` | number | no | Upper bound, as-fed kg/day. Omit when toggle is off OR when the Max field is blank with toggle on. |

**Field-name confirmation (pending):** these key names follow the
internal Android draft. Maria — please confirm canonical names; the
frontend will swap with a one-line rename if different.

### 10.5 Example request payloads

#### Toggle OFF — bounds omitted entirely

```json
{
  "user_id": "…",
  "country_id": "…",
  "simulation_id": "demo-sim",
  "cattle_info": { "...": "..." },
  "base_thresholds": { "ash_max": 10, "ee_max": 7, "ndf_max": 45, "starch_max": 26 },
  "feed_selection": [
    {
      "feed_id": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "price_per_kg": 8500
    }
  ]
}
```

#### Toggle ON, both bounds filled

```json
{
  "feed_selection": [
    {
      "feed_id": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "price_per_kg": 8500,
      "min_kg_per_day": 2.0,
      "max_kg_per_day": 6.5
    }
  ]
}
```

#### Toggle ON, only Max filled (Min blank → no lower bound)

```json
{
  "feed_selection": [
    {
      "feed_id": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "price_per_kg": 8500,
      "max_kg_per_day": 6.5
    }
  ]
}
```

#### Toggle ON, only Min filled (Max blank → no upper bound)

```json
{
  "feed_selection": [
    {
      "feed_id": "5f1e9a04-1500-4603-8795-633ff80f1b21",
      "price_per_kg": 8500,
      "min_kg_per_day": 2.0
    }
  ]
}
```

### 10.6 Validation expectations

- `min_kg_per_day >= 0` (frontend allows blank or any non-negative number)
- `max_kg_per_day >= 0`
- If both are present, optimizer should treat `min > max` as a
  user-input error (frontend will eventually surface this; for now
  the request is sent as-is and the backend may 422 it)
- Backend should accept floats — typical values 0.1 – 30.0

### 10.7 Frontend status

| Item | Status |
|---|---|
| "Set inclusion limits" toggle on each card, default off | Shipped |
| Min / Max fields shown only when toggle ON | Shipped |
| Blank Min and blank Max both honored as "omit this bound" | Shipped |
| Toggle gated on feed_uuid (greyed out until a feed is picked) | Shipped |
| Toggle + Min/Max reset when feed_uuid clears | Shipped |
| Only the switch element flips the toggle (not the row) | Shipped |
| `min_kg_per_day` / `max_kg_per_day` in request payload | Shipped (pending key-name confirmation) |

---

## 11. feed_id payload rule — fd_code rollout

Maria is migrating feed identification from the internal `feeds.id` UUID
to a human-readable `feeds.fd_code` column. As of writing all `fd_code`
values in the DB are null; backfill is in progress.

### 11.1 Frontend rule

The `feed_id` field on **both** outgoing payloads
(`POST /v1/animal/diet-recommendation` and
`POST /v1/animal/evaluate-diet`) is computed as:

```
feed_id = item.fd_code ?? item.feed_uuid
```

In words: if the feed row carries an `fd_code`, send that. Otherwise
fall back to the UUID. Backend must accept either form on the same
field name (`feed_id`). The UUID fallback is permanent — custom feeds
or any row that never gets an `fd_code` will continue to send UUID.

### 11.2 Frontend parser

The PWA reads `fd_code` (or its `feed_code` alias — both accepted on
input for safety) from these response endpoints:

- `GET /v1/animal/search-feeds` — search results
- `GET /v1/animal/feed-name` — Feed dropdown rows
- `GET /v1/animal/simulations/{report_id}` — restored history rows
- `POST /v1/animal/custom-feeds` — newly-inserted custom feed

The code is stored on each `FeedItem` alongside the UUID; payload
construction picks one at send time per §11.1.

### 11.3 No payload field rename

Maria confirmed via user that the wire field stays named `feed_id`.
Only the *value* changes — frontend swaps which identifier sits in
that slot, backend resolves whichever form it receives.

### 11.4 Edge cases

- **fd_code is a number in the DB** (`fd_code: numeric` per the
  screenshot). Frontend coerces to string via `String(code)` so the
  payload field stays consistently a string regardless of source.
- **fd_code is null** on a row that the user is trying to send →
  fallback to UUID. No user-visible error.
- **Both null** (shouldn't happen) → the row fails the
  `!!item.feed_uuid` gate and never reaches the payload.

