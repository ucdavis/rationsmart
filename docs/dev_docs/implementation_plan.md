# Implementation Plan: Stable Feed UUIDs via Deterministic ID Generation

## Problem Statement

`feeds.id` is currently generated using `uuid4()` (random) at import time. Whenever the
feed library is refreshed by re-importing from the 3rd party API, every feed gets a new
random UUID. This breaks all stored references — `Report.feed_selection` (JSONB),
`Report.json_result` (JSONB), and any other persisted feed identifiers — making historical
reports and simulations unusable.

## Root Cause

```
3rd Party API → Excel Sheet → RationSmart bulk import → feeds table
                                                          fd_code  = from 3rd party (stable)
                                                          feeds.id = uuid4()         (random, breaks on refresh)
```

RationSmart discards the stable identity it receives (`fd_code`) and replaces it with an
unstable one it generates itself (`uuid4()`). The fix is to derive `feeds.id`
deterministically from `fd_code` so that the same feed always gets the same UUID.

## Key Assumptions (Confirmed)

| Assumption | Status |
|---|---|
| `feeds.fd_code` is globally unique across the full 3rd party feed library | Confirmed |
| Old reports/simulations can be discarded (no backfill migration needed) | Confirmed |
| `feeds.fd_code` is an opaque alphanumeric code (not human-readable) | Confirmed |
| Custom feeds are user-created and not sourced from the 3rd party | Confirmed |

## Solution: Deterministic UUID (uuid5) from fd_code

Use `uuid.uuid5(NAMESPACE, fd_code)` instead of `uuid.uuid4()` when inserting standard
feeds during bulk import. `uuid5` is a deterministic hash — the same `fd_code` always
produces the same UUID. DB refreshes now produce identical `feeds.id` values, so all
stored references remain valid forever.

## Scope

### In scope
- Standard feeds imported from the 3rd party via the bulk upload endpoint

### Out of scope
- Custom feeds (user-created, not from 3rd party — their UUID strategy is a separate concern)
- Any changes to API contracts, frontend, or other services

---

## Implementation Steps

### Step 1 — Define the feed namespace UUID

Pick a fixed, hardcoded UUID to use as the `uuid5` namespace. Generate it once and never
change it. Changing it would alter all derived UUIDs and break stored references.

```python
# In services/feed_service.py (or a shared constants module)
import uuid

# Fixed namespace for RationSmart standard feeds. Never change this value.
STANDARD_FEED_NAMESPACE = uuid.UUID("________-____-____-____-____________")
# Replace the placeholder above with the output of: python3 -c "import uuid; print(uuid.uuid4())"
```

Generate the actual value once:
```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

Paste the output into the constant and commit it.

### Step 2 — Add a stable UUID helper function

```python
def stable_feed_uuid(fd_code: str) -> uuid.UUID:
    """Derives a deterministic UUID from a 3rd party fd_code.
    Same fd_code always produces the same UUID across DB refreshes."""
    return uuid.uuid5(STANDARD_FEED_NAMESPACE, fd_code)
```

Place this alongside `STANDARD_FEED_NAMESPACE` in `services/feed_service.py`.

### Step 3 — Update the bulk import to use the stable UUID

**File:** `services/feed_service.py` — `bulk_upload_feeds()` function

Locate the code path where a new feed row is created during Excel import. Change:

```python
# Before — random UUID, breaks on DB refresh
new_feed = Feed(**feed_data)  # id defaults to uuid4()
```

To:

```python
# After — deterministic UUID, stable across DB refreshes
feed_data["id"] = stable_feed_uuid(feed_data["fd_code"])
new_feed = Feed(**feed_data)
```

Also handle the update path (existing feed found by name): the UUID is already set on the
existing row, so no change needed there. But verify that `repo.update()` does not
regenerate the `id`.

### Step 4 — Enforce `fd_code` NOT NULL on standard feeds

Since `stable_feed_uuid()` requires `fd_code`, any feed row without one will fail at
import time. Add a guard in the import function:

```python
if not feed_data.get("fd_code"):
    log_error(f"Skipping feed '{feed_data.get('fd_code_name')}': fd_code is missing.")
    continue
```

Optionally, add a DB-level constraint via an Alembic migration:

```python
# In a new Alembic migration
op.alter_column('feeds', 'fd_code', nullable=False)
op.create_unique_constraint('uq_feeds_fd_code', 'feeds', ['fd_code'])
```

> Note: Run the uniqueness audit below before adding this constraint.

### Step 5 — Audit current data before re-import

Before wiping and re-importing, confirm the 3rd party data has no duplicate `fd_code`
values (a duplicate would cause a UUID collision):

```sql
SELECT fd_code, COUNT(*)
FROM feeds
GROUP BY fd_code
HAVING COUNT(*) > 1;

SELECT COUNT(*) FROM feeds WHERE fd_code IS NULL OR fd_code = '';
```

If duplicates are found, resolve with the 3rd party before proceeding.

### Step 6 — Discard old data and re-import

Since old reports are being discarded:

1. Truncate the existing feeds and reports tables (or drop and recreate)
2. Re-run the bulk import from the 3rd party API
3. Verify the imported feeds have deterministic UUIDs:

```sql
-- Run twice with a fresh import each time; UUIDs should be identical both times
SELECT id, fd_code FROM feeds ORDER BY fd_code LIMIT 20;
```

---

## Verification Checklist

- [ ] `STANDARD_FEED_NAMESPACE` constant is committed and will never be changed
- [ ] Two consecutive imports of the same 3rd party Excel produce identical `feeds.id` values
- [ ] No feed row has a NULL or empty `fd_code` after import
- [ ] No duplicate `fd_code` values exist in the imported data
- [ ] `stable_feed_uuid()` is only called for standard feeds (not custom feeds)
- [ ] `repo.update()` does not overwrite the `id` on an existing feed row

---

## Files to Change

| File | Change |
|---|---|
| `services/feed_service.py` | Add `STANDARD_FEED_NAMESPACE` constant, `stable_feed_uuid()` helper, update `bulk_upload_feeds()` to use it |
| `alembic/versions/<new>.py` | Add NOT NULL + unique constraint on `feeds.fd_code` (optional but recommended) |

No other files need to change. API contracts, frontend, optimization core, and report
schemas are all unaffected.

---

## What This Does NOT Fix

- **Custom feeds**: Custom feeds are user-created and not sourced from the 3rd party. If
  the DB is refreshed in a way that wipes custom feeds, those reports will still break.
  This is a separate problem and should be addressed independently.

- **Future schema changes**: If the 3rd party ever changes a feed's `fd_code`, the UUID
  will change on the next import. Treat `fd_code` changes by the 3rd party as a breaking
  event (same as a feed being retired and replaced).
