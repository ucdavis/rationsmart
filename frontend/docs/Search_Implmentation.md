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

## 12. Y3 §1.3 — Milk Price input + cost-per-litre

Add a "Milk Price" input on the Animal Inputs (Milk Production)
section. The value drives a cost-per-litre figure on the report.
Per-card UI change is shipped; the request schema and the report
response both need backend work.

### 12.1 Frontend status

| Item | Status | Reference |
|---|---|---|
| "Milk Price ({currency}/L)" input under Milk Protein / Milk Fat | Shipped | `src/app/(main)/cattle-info/page.tsx:801-814` |
| Hidden when animal category is non-lactating (whole section hides) | Shipped | `showMilkSection` derived from `animal_category` |
| Optional — blank converts to null | Shipped | `cattle-info/page.tsx:585` |
| Currency suffix label from `user.currency` (no Intl) | Shipped | line 803 |
| Hydrates on edit + simulation history restore | Shipped | lines 220, 294 |
| Sent in `toCattleInfoPayload()` as `cattle_info.milk_price` (number \| null) | Shipped | `api.ts:107, 145` |

### 12.2 Backend — what the swagger shows today

`CattleInfo` schema at the live `<DEV_BACKEND_IP>:8000/openapi.json` has:

```
body_weight, breed, lactating, milk_production, days_in_milk,
parity, days_of_pregnancy, tp_milk, fat_milk, temperature,
topography, distance, grazing, calving_interval, bw_gain, bc_score
```

**No `milk_price` field present.** Also no `animal_category`
(separate Y3 §1.4 ask). The frontend is already sending the field
on every payload, but it gets dropped by FastAPI's `model_extra =
ignore` (or rejected if `extra = forbid`).

### 12.3 Backend changes needed

#### 12.3.1 `CattleInfo` schema — add `milk_price`

```python
class CattleInfo(BaseModel):
    # ... existing fields ...
    milk_price: float | None = Field(
        default=None,
        ge=0,
        description="Price per litre of milk in local currency. "
                    "Optional — null when farmer hasn't set one. "
                    "Used by /v1/animal/diet-recommendation and "
                    "/v1/animal/evaluate-diet to compute the "
                    "milk-cost margin on the report."
    )
```

Notes for Maria:
- **Optional + nullable.** Blank input on the frontend → `null` in
  the JSON. Backend should not 422 when the field is missing.
- **Unit:** per **litre**, not per kg. The frontend label is
  `"Milk Price (VND/L)"` etc. Confirm before the rename — if you
  prefer per-kg, frontend can change the label in one edit.
- **No persistence migration needed** if you don't want to store it
  on the simulation. But see §12.3.3 — restore should round-trip
  the value when present.

#### 12.3.2 Final field name — please confirm

Frontend currently uses `milk_price` (matches Android convention).
If you prefer:

| Candidate | Note |
|---|---|
| `milk_price` (recommended) | Matches Android, snake_case, plain |
| `price_per_litre` | More descriptive but verbose |
| `milk_unit_price` | Generic — leaves unit unstated |

Whichever you pick, the frontend swap is a one-line rename in
`src/lib/api.ts`. Until then we keep `milk_price`.

#### 12.3.3 `SimulationFeedDetail` / `FetchSimulationDetailsResponse`

When `milk_price` is persisted with the simulation, the history
restore endpoint should echo it back. Currently
`FetchSimulationDetailsResponse.cattle_info` is the same `CattleInfo`
schema — adding the field there transparently fixes restore too.
No extra schema work needed beyond §12.3.1.

### 12.4 Example request payload (post-change)

#### Lactating, milk price set

```json
{
  "simulation_id": "demo-sim",
  "user_id": "...",
  "country_id": "...",
  "cattle_info": {
    "body_weight": 450,
    "breed": "Cross Bred",
    "lactating": true,
    "milk_production": 18.5,
    "days_in_milk": 120,
    "parity": 2,
    "days_of_pregnancy": 0,
    "tp_milk": 3.2,
    "fat_milk": 3.8,
    "temperature": 26,
    "topography": "Flat",
    "distance": 0,
    "grazing": false,
    "calving_interval": 370,
    "bw_gain": 0.3,
    "bc_score": 3.0,
    "milk_price": 12500
  },
  "feed_selection": [ "..." ],
  "base_thresholds": { "..." }
}
```

#### Lactating, milk price blank (omit OR send null)

```json
{
  "cattle_info": {
    "...": "...",
    "milk_price": null
  }
}
```

#### Non-lactating animal (frontend hides the field)

```json
{
  "cattle_info": {
    "lactating": false,
    "milk_production": 0,
    "milk_price": null
  }
}
```

### 12.5 Y3 §2.1 follow-up — cost-per-litre on the report

This is the consumer of `milk_price`. Currently blocked: the
recommendation response doesn't carry a margin / cost-per-litre
field. Two ways to ship it:

**Option A — backend computes (preferred):**
Add a `milk_cost_margin` block to the recommendation/evaluation
response:

```python
class MilkCostMargin(BaseModel):
    milk_price_per_litre: float | None
    total_diet_cost_as_fed: float
    daily_milk_production_l: float
    cost_per_litre: float | None      # daily_diet_cost / daily_milk_l
    margin_per_litre: float | None    # milk_price - cost_per_litre
    currency: str
```

Send `null` for the derived fields when `milk_price` is missing.

**Option B — frontend computes:**
Frontend reads `report.solution_summary.total_diet_cost_as_fed` and
`cattle_info.milk_production` from the recommendation response and
divides client-side. No backend change. Less precise (doesn't see
DMI conversions) but unblocks the UI immediately.

Recommendation: ship **Option A** when you can; frontend will use
Option B as a fallback if the new field is absent.

### 12.6 Acceptance criteria (when both ends ship)

1. Lactating animal + milk_price entered → payload carries
   `cattle_info.milk_price` as a number; no 422 from backend.
2. Lactating + milk_price blank → payload sends `null`; backend
   accepts; response's milk-cost margin section shows `cost_per_litre`
   but `margin_per_litre` = null.
3. Non-lactating → frontend hides the field; payload sends
   `milk_price: null`; response's milk-cost margin section is
   suppressed entirely on the UI.
4. Restoring an older simulation that pre-dates this field → frontend
   hydrates `milk_price` from null without error.
5. Restoring a simulation with milk_price = 12500 → form pre-fills,
   margin card renders correctly.

---

## 13. Y3 §2.2 — Forage : Concentrate ratio (as-fed)

The report summary shows a Forage:Concentrate ratio tile on a fresh
matter (as-fed) basis, just under the Milk Cost Margin card.

### 13.1 Frontend status — shipped (client-side compute)

The tile is implemented entirely client-side from existing response
fields. No backend change required to ship the card.

| Mode | Data source | Per-row fields used |
|---|---|---|
| Evaluation | `evalReport.feed_breakdown[]` | `feed_type`, `quantity_as_fed_kg_per_day` |
| Recommendation | `recReport.least_cost_diet[]` | `feed_name`, `quantity_kg_per_day` + cross-ref against the store's `feedSelections` by name to recover `feed_type` |

Classification rule:
- `feed_type ∈ {"Forage", "Roughage"}` (case-insensitive) → Forage bucket
- Everything else with a known `feed_type` → Concentrate
- Unclassified (recommendation rows where cross-ref failed) → Other

Hidden when total as-fed = 0 or no diet rows parse.

### 13.2 Optional backend improvement — `least_cost_diet[].feed_type`

The cross-reference in recommendation mode is fragile — if a feed
name returned in `least_cost_diet[]` doesn't match exactly what the
user saw in the Feed dropdown, the line falls into the "Other"
bucket and the percentages drift.

**Ask:** add `feed_type` (string) to each item in `least_cost_diet[]`
on the diet-recommendation response. Same string the search /
unique-feed-type endpoints already use (`"Forage"` /
`"Concentrate"` / etc.).

```python
class LeastCostDietItem(BaseModel):
    feed_name: str
    quantity_kg_per_day: float
    price_per_kg: float
    daily_cost: float
    currency: str
    feed_type: str | None = None    # <- add this
```

When this lands, the frontend cross-ref is dead code (kept as a
fallback for older response shapes). Card numbers become precise.

### 13.3 Optional backend improvement — pre-computed ratio block

Even cleaner: bundle the F:C math into the response so the frontend
doesn't have to sum across feed lines at all. Lets backend tweak
the rounding / fresh-vs-dry-matter basis without a frontend release.

```python
class ForageConcentrateRatio(BaseModel):
    forage_kg_as_fed: float
    concentrate_kg_as_fed: float
    other_kg_as_fed: float       # rows the optimizer couldn't classify
    forage_pct: float            # 0–100
    concentrate_pct: float
    other_pct: float
    basis: Literal["as_fed", "dry_matter"]   # always "as_fed" for now
```

Add as an optional top-level field on the recommendation /
evaluation response:

```python
forage_concentrate_ratio: ForageConcentrateRatio | None = None
```

Frontend prefers this when present; falls back to client-side
compute when absent. Same UI either way.

### 13.4 Acceptance

1. Recommendation diet with 60% Forage + 40% Concentrate by as-fed
   weight → tile reads "60 : 40", legend shows both kg/day values.
2. All-concentrate diet (no forage actually selected; should not
   happen post-Forage-gate but defensive) → "0 : 100".
3. Empty `least_cost_diet[]` or `feed_breakdown[]` → tile hidden.
4. Once the backend ships §13.3, frontend swaps to those numbers
   without UI change.

---

## 14. Y3 §2.3 — State-aware report sections + `build_report_context`

Different animal categories make different report sections relevant.
Per the spec: add a helper that reads `An_StatePhys` and returns a
context object listing which sections to render.

### 14.1 The four states

| `An_StatePhys` (display string) | Lactating? | Pregnancy-relevant? | Calf-feeding section? |
|---|---|---|---|
| `Lactating Cow` | yes | yes | no |
| `Dry Cow` | no | yes | no |
| `Heifer` | no | sometimes | no |
| `Baby Calf/Heifer` | no | no | **yes** |

### 14.2 `build_report_context` — backend helper (recommended)

Compute the context once on the backend so the frontend doesn't need
the rules duplicated. Add this on the recommendation /
evaluation response:

```python
class ReportContext(BaseModel):
    show_milk_production_section: bool       # eval Milk Production card
    show_milk_cost_margin_card: bool         # /report §2.1 tile
    show_solution_summary_milk: bool         # rec Solution Summary milk row
    show_calf_milk_feeding_section: bool     # NEW — only for Baby Calf/Heifer
    notes: list[str]                         # state-specific copy

def build_report_context(an_state_phys: str) -> ReportContext:
    s = an_state_phys.strip()
    is_lactating = s == "Lactating Cow"
    is_calf = s == "Baby Calf/Heifer"
    return ReportContext(
        show_milk_production_section=is_lactating,
        show_milk_cost_margin_card=is_lactating,
        show_solution_summary_milk=is_lactating,
        show_calf_milk_feeding_section=is_calf,
        notes=_notes_for(s),    # implementation choice
    )
```

Then on the diet-recommendation + evaluate-diet responses:

```python
report_context: ReportContext | None = None
```

### 14.3 Calf milk-feeding section — content

Only renders when `show_calf_milk_feeding_section = True`. Contains
the milk / milk-replacer schedule for the calf, derived from age +
body weight. Recommended schema:

```python
class CalfMilkFeedingPlan(BaseModel):
    daily_milk_volume_l: float        # whole milk or replacer equiv
    feedings_per_day: int             # typically 2
    estimated_weaning_age_days: int   # typically 56–63
    milk_solids_pct: float | None     # for replacer
    notes: list[str]                  # warnings / vet recommendations

calf_milk_feeding_plan: CalfMilkFeedingPlan | None = None
```

Default rule (when no other data available):
- daily volume = 10% of body_weight (kg) → in litres (whole milk)
- feedings_per_day = 2
- weaning_age_days = 56

Backend can refine this with breed / season / health context later.

### 14.4 Frontend status — partial, client-side now

Until `report_context` ships on the response, the frontend computes
the same booleans locally from `cattleInfo.animal_category`:

```ts
function buildReportContext(category?: AnimalCategory) {
  const isLactating = category === "Lactating Cow";
  const isCalf = category === "Baby Calf/Heifer";
  return {
    showMilkProductionSection: isLactating,
    showMilkCostMarginCard: isLactating,
    showSolutionSummaryMilk: isLactating,
    showCalfMilkFeedingSection: isCalf,
  };
}
```

When the backend ships §14.2, the helper switches to:

```ts
const ctx = reportData.report_context ?? buildReportContext(cattleInfo.animal_category);
```

### 14.5 Sections gated by the helper

| Section | Gate | Currently |
|---|---|---|
| Milk Cost Margin (§2.1 card) | `showMilkCostMarginCard` | Already implicit — hidden when `milk_price == null` |
| Eval-mode Milk Production Analysis | `showMilkProductionSection` | NEEDS gating |
| Rec-mode Solution Summary "Milk Production" + "Daily Cost / litre milk" rows | `showSolutionSummaryMilk` | NEEDS gating |
| Cattle Info: "Milk Production" label-value row | `showMilkProductionSection` | NEEDS gating |
| Forage:Concentrate Ratio | none | Always shown |
| Cost-Effective Diet table | none | Always shown |
| Environmental Impact | none | Always shown |
| **Calf Milk Feeding section** | `showCalfMilkFeedingSection` | NEW — placeholder until backend ships content |

### 14.6 Acceptance

1. `Lactating Cow` → milk sections + margin card visible; calf
   section hidden.
2. `Dry Cow` → milk sections + margin card hidden; calf section
   hidden.
3. `Heifer` → milk sections + margin card hidden; calf section
   hidden.
4. `Baby Calf/Heifer` → milk sections + margin card hidden; calf
   milk-feeding section visible.
5. Backend swaps to `report_context` on the response → frontend
   picks it up automatically with no code change (helper has the
   fallback wired).

---

## 15. Y3 §1.4 — Animal Category selector

Exposes the animal's physiological state as a selectable field with
four options. Drives §2.3 report gating and the milk-fields
visibility on the Animal Inputs screen.

### 15.1 The four options

The Y3 spec uses plural display strings; the wire values stay
singular so existing simulations don't break. Frontend renders the
plural in the dropdown; the singular is what gets sent to / stored
by the backend.

| Display label (UI) | Wire value (payload / DB) |
|---|---|
| Lactating cows | `Lactating Cow` |
| Dry cows | `Dry Cow` |
| Heifers | `Heifer` |
| Baby calves/heifers | `Baby Calf/Heifer` |

If Maria prefers the plural form on the wire, the only change is the
`ANIMAL_CATEGORIES` constant in `src/lib/api.ts` — display labels
and wire values would re-align. Until she confirms, singular is the
canonical wire form.

### 15.2 Frontend status — shipped

| Item | Status | Reference |
|---|---|---|
| Selector under Simulation Details (top of /cattle-info form) | Shipped | `cattle-info/page.tsx:652-662` |
| Default selection on a new form | `Lactating Cow` | `cattle-info/page.tsx:113` |
| Plural display labels (per spec wording) | Shipped | `api.ts` `ANIMAL_CATEGORY_LABELS` |
| Hydration on edit + simulation restore | Shipped | lines 221, 295 |
| Stored on `cattleInfo.animal_category` | Shipped | line 587 |
| Sent in `toCattleInfoPayload()` as `cattle_info.animal_category` | Shipped | `api.ts:146` |
| Drives `showMilkSection` form gate | Shipped | `cattle-info/page.tsx:498` |
| Drives `buildReportContext` → `/report` sections | Shipped | `report/page.tsx` §2.3 |
| Drives Calf Milk Feeding section on /report | Shipped | `report/page.tsx` §2.3 |

### 15.3 Form gating — what hides when non-lactating

When `animal_category !== "Lactating Cow"`:

- Whole **Milk Production** section card hidden:
  - Milk Production (L) input
  - Milk Protein % / Milk Fat % dropdowns
  - Milk Price input
- Form validation no longer requires those three fields.

When the user flips between categories, **field values persist in the
form state** so accidental switches don't lose data. The wire-level
sanitisation happens at payload-build time (§15.4) — what gets sent
always matches the CURRENT category.

### 15.4 Payload sanitisation — what `toCattleInfoPayload` zeros out for non-lactating

Even if the user previously typed milk values, the payload helper
zeroes them out when the current category isn't Lactating Cow:

| Wire field | Non-lactating value |
|---|---|
| `lactating` | `false` |
| `milk_production` | `0` |
| `tp_milk` (protein) | `0` |
| `fat_milk` | `0` |
| `days_in_milk` | `0` |
| `milk_price` | `null` |

`animal_category` always carries the chosen value regardless of
state. `days_of_pregnancy`, `parity`, `body_weight`, `bc_score`,
`bw_gain`, grazing fields and temperature are all NOT category-gated
— they apply to all animals.

### 15.5 Backend — what the swagger shows today

Swagger pull (same one referenced in §12.2): `CattleInfo` schema at
`<DEV_BACKEND_IP>:8000/openapi.json` does **NOT** include
`animal_category`. FastAPI silently drops the field unless Maria
adds it.

### 15.6 Backend ask — add `animal_category` to `CattleInfo`

```python
from typing import Literal

AnimalCategory = Literal[
    "Lactating Cow",
    "Dry Cow",
    "Heifer",
    "Baby Calf/Heifer",
]

class CattleInfo(BaseModel):
    # ... existing fields ...
    animal_category: AnimalCategory | None = Field(
        default=None,
        description=(
            "Physiological state of the animal. Drives lactating flag, "
            "milk-related field requirements, and report section "
            "visibility (see build_report_context in §14). Null treated "
            "as 'Lactating Cow' for backward compatibility with older "
            "simulations that pre-date this field."
        ),
    )
```

Notes:
- **Nullable + default null.** Older saved simulations don't have
  this field; backend should treat null as Lactating Cow (the only
  state the pre-Y3 app supported).
- **Wire values stay singular** unless Maria explicitly wants the
  plural — see §15.1.
- **No DB migration required for legacy rows.** Backfill with
  `"Lactating Cow"` for any historical record where the field is
  null and persistence is needed.

### 15.7 Example payloads (post backend change)

#### Lactating Cow

```json
{
  "cattle_info": {
    "body_weight": 450,
    "breed": "Cross Bred",
    "lactating": true,
    "milk_production": 18.5,
    "tp_milk": 3.2,
    "fat_milk": 3.8,
    "days_in_milk": 120,
    "days_of_pregnancy": 0,
    "parity": 2,
    "temperature": 26,
    "topography": "Flat",
    "distance": 0,
    "grazing": false,
    "calving_interval": 370,
    "bw_gain": 0.3,
    "bc_score": 3.0,
    "milk_price": 12500,
    "animal_category": "Lactating Cow"
  }
}
```

#### Dry Cow (milk fields zeroed)

```json
{
  "cattle_info": {
    "body_weight": 480,
    "breed": "Cross Bred",
    "lactating": false,
    "milk_production": 0,
    "tp_milk": 0,
    "fat_milk": 0,
    "days_in_milk": 0,
    "days_of_pregnancy": 200,
    "parity": 3,
    "temperature": 26,
    "topography": "Flat",
    "distance": 0,
    "grazing": false,
    "calving_interval": 370,
    "bw_gain": 0.5,
    "bc_score": 3.5,
    "milk_price": null,
    "animal_category": "Dry Cow"
  }
}
```

#### Baby Calf/Heifer

```json
{
  "cattle_info": {
    "body_weight": 80,
    "breed": "Cross Bred",
    "lactating": false,
    "milk_production": 0,
    "tp_milk": 0,
    "fat_milk": 0,
    "days_in_milk": 0,
    "days_of_pregnancy": 0,
    "parity": 0,
    "temperature": 26,
    "topography": "Flat",
    "distance": 0,
    "grazing": false,
    "calving_interval": 370,
    "bw_gain": 0.7,
    "bc_score": 2.5,
    "milk_price": null,
    "animal_category": "Baby Calf/Heifer"
  }
}
```

### 15.8 Test scenarios — all paths covered

| # | Action | Expected wire (`cattle_info`) | Expected /report |
|---|---|---|---|
| 1 | User picks Lactating cows, fills milk_production=20, milk_price=12000 → Generate | `animal_category="Lactating Cow"`, `lactating=true`, `milk_production=20`, `milk_price=12000` | Milk Cost Margin card visible, milk rows visible, no calf section |
| 2 | User picks Dry cows on a fresh form → Generate | `animal_category="Dry Cow"`, `lactating=false`, all milk fields = 0/null | Milk Cost Margin hidden, milk rows hidden, no calf section |
| 3 | User entered milk_production=20 as Lactating, switches to Heifers → Generate | `animal_category="Heifer"`, `lactating=false`, **milk_production=0 (stale value scrubbed)**, milk_price=null | Same as Dry Cow |
| 4 | User picks Baby calves/heifers → Generate | `animal_category="Baby Calf/Heifer"`, `lactating=false` | Calf Milk Feeding card visible with 10%×body_weight default plan; no milk margin |
| 5 | Reopen a saved Lactating Cow simulation that pre-dates this field (`animal_category` absent in response) | Form defaults to `Lactating Cow`; no error | Standard lactating layout |
| 6 | Reopen a saved Dry Cow simulation | Form selector reads `Dry Cow`; milk section auto-hides | Non-lactating layout |
| 7 | Backend ships `animal_category` validation → invalid value sent | Backend 422; frontend logs error; user sees snackbar | n/a |

### 15.9 Acceptance criteria

1. All four options visible in the selector with plural labels.
2. Wire payload carries singular value for each selection.
3. Non-lactating selections zero out milk fields on the wire even
   if the form has stale entries.
4. `lactating: true/false` flag derived from `animal_category`.
5. Restoring an older simulation without `animal_category` does not
   error — frontend defaults to "Lactating Cow".
6. /report sections honour the helper (see §14.5).

