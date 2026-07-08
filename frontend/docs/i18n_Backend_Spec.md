# i18n V2 — Backend follow-up needed for Feed Type + Feed Category labels

**Author:** RationSmart PWA team
**Date:** 2026-07-08
**Backend base:** `<DEV_BACKEND_IP>:8000`

---

## What we want to ship

Localized dropdown labels for **Feed Type** (Forage / Concentrate / …)
and **Feed Category** (By-Product, Grass/Legume Forage, …) on the Feed
Selection screen, in the user's active language. Feed name itself is
already localized (via `display_name` on `/v1/animal/feed-name`).

## Why the frontend can't finish this alone (verified with a live JWT
against <DEV_BACKEND_IP>:8000 on 2026-07-08)

### 1. `/v1/animal/unique-feed-type/{country_id}?lang=hi`

Returns **bare translated strings** — no English identity alongside:

```json
{"feed_types": ["चारा", "सांद्र आहार (दाना)"]}
```

Without `?lang=`, returns English:

```json
{"feed_types": ["Concentrate", "Forage"]}
```

### 2. `/v1/animal/unique-feed-category?country_id=…&lang=hi`

Same shape — bare translated strings:

```json
{"feed_categories": ["उपोत्पाद/अन्य", "वनस्पति प्रोटीन", …]}
```

### 3. `/v1/animal/feed-name?…&lang=hi`

**Only accepts English** as `feed_type` / `category` filter values.
Passing the Hindi identity that the two endpoints above returned:

```
GET /v1/animal/feed-name?feed_type=चारा&category=उपोत्पाद/अन्य-चारा&lang=hi
→ {"standard_feeds": [], "custom_feeds": []}
```

Passing English works — and notice the response already gives us
`display_type` / `display_category` on each item:

```
GET /v1/animal/feed-name?feed_type=Forage&category=By-Product/Other-Forage&lang=hi
→ {"standard_feeds": [{
     "fd_type":         "Forage",
     "display_type":    "चारा",
     "fd_category":     "By-Product/Other-Forage",
     "display_category":"उपोत्पाद/अन्य-चारा",
     "fd_name":         "Sugarcane tops, Wet season",
     "display_name":    "गन्ने का अगोला, वर्षा ऋतु",
     …
   }], …}
```

So backend already has both identity + display in the DB — it just
doesn't expose them on the two upstream endpoints.

## The impasse

- If frontend sends `?lang=hi` → gets Hindi identity → stores it →
  downstream `/feed-name` filter fails (returns empty). Feed dropdown
  blank. **BROKEN.**
- If frontend does NOT send `?lang=` → gets English identity → downstream
  works fine. But Feed Type + Feed Category labels stay English regardless
  of active language. **CURRENT SHIPPED STATE.**

There is no frontend-only workaround (position-based zipping between an
English and a Hindi fetch is unsafe — verified that sort order differs
per locale, so we can't align items reliably).

## What we need on the backend

Please add `display_type` and `display_category` to the two endpoints so
they mirror the pattern `/v1/animal/feed-name` already uses. Concretely,
when `?lang=` is passed:

### `/v1/animal/unique-feed-type/{country_id}?lang=hi`

Change response from
```json
{"feed_types": ["चारा", "सांद्र आहार (दाना)"]}
```
to
```json
{"feed_types": [
  {"type_name": "Forage",      "display_type": "चारा"},
  {"type_name": "Concentrate", "display_type": "सांद्र आहार (दाना)"}
]}
```

### `/v1/animal/unique-feed-category?country_id=…&lang=hi`

Change response from
```json
{"feed_categories": ["उपोत्पाद/अन्य", "वनस्पति प्रोटीन", …]}
```
to
```json
{"feed_categories": [
  {"category_name": "By-Product/Other",      "display_category": "उपोत्पाद/अन्य"},
  {"category_name": "Plant Protein",         "display_category": "वनस्पति प्रोटीन"},
  {"category_name": "Grass/Legume Forage",   "display_category": "घास/फलीदार (दलहनी) चारा"},
  ...
]}
```

When `?lang=` is absent (or `?lang=en`), `display_*` can be a copy of
the identity field or omitted — the frontend already falls back to
the English name.

### Backwards compatibility

The frontend parser already handles both the current bare-string shape
AND the proposed object shape (see `src/components/FeedRow.tsx`
`extractOptions` / `extractCatOptions`). Rolling out the new shape will
NOT break the deployed PWA — labels simply stay English until the
frontend also flips its call to send `?lang=`, which is a one-line
change once the backend ships.

## Rollout plan (once backend ships the change)

1. Verify both endpoints return the object shape when `?lang=hi` is
   sent, with the English identity in `type_name` / `category_name`.
2. Frontend re-adds `?lang=` on both `getFeedTypes` and
   `getFeedCategories` in `src/lib/api.ts` (one-line each).
3. Regression-test: pick a Hindi feed type + category → Feed dropdown
   still loads (`/feed-name` still gets English identity). Generate
   still enabled by the Forage-required gate. Simulation restore in
   Hindi still shows the correct row selected.

Estimated total FE change once backend is done: ~5 minutes.
