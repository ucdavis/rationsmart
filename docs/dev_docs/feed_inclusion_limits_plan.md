# Implementation Plan: Per-Ingredient Inclusion Limits

## Feature Summary

Add an optional "Set inclusion limits" toggle to each feed card in Feed Selection.
When toggled on, the user can enter a **Min (kg/day)** and/or **Max (kg/day)** in
as-fed units for that ingredient. Active bounds are passed to the NSGA-III optimizer,
which respects them when selecting ingredient proportions.

- Toggle off (default): ingredient is unconstrained — optimizer runs as today.
- Toggle on, Min blank: no lower bound (treated as 0).
- Toggle on, Max blank: no upper bound.

---

## Reference Implementation

All optimizer-side logic is already proven in `/Users/satishchandra/ucdapp/june_optimization/`.
That module uses `RFT_FD_Lib_Y2test.xlsx` (with `fd_min` / `fd_max` columns) as its
input — the Excel sheet is the user interface there, run via `standalone_call.py`.

This plan ports it into `rationsmart` and wires in **both** entry paths:
- **Frontend path** — Android app → REST API
- **Standalone path** — Excel sheet → `scripts/run_optimization.py`

---

## Conversion Chain (Why / How)

The NSGA-III optimizer works in **proportion mode**: each decision variable is an
ingredient's share of total Dry Matter Intake (DMI), and all proportions must sum to 1.
User-entered kg/day values are on an **as-fed** basis (wet weight). Two conversions
are required before the values reach the optimizer:

```
Step 1  As-fed kg/day  →  DM kg/day
        Fd_MinDM = Fd_Min × (Fd_DM / 100)

Step 2  DM kg/day  →  DM proportion
        xl[i] = Fd_MinDM[i] / Trg_Dt_DMIn
```

`Fd_DM` is the feed's dry matter percentage (already in the DB).
`Trg_Dt_DMIn` is the animal's target DMI in kg/day (already in `animal_requirements`).

Step 1 happens during feed processing; Step 2 happens inside `rsm_bounds_xlxu`.

---

## Scope of Changes

| # | Layer | File | Path |
|---|---|---|---|
| 1 | API schema | `app/schemas/animal.py` | Frontend path only |
| 2 | Service / feed assembly | `services/diet_service.py` | Frontend path only |
| 3 | Feed processing | `core/z_optimization/feed_processing.py` | **Both paths** |
| 4 | Optimizer bounds | `core/z_optimization/optimization_core.py` | **Both paths** |
| 5 | Frontend | Feed card component | Frontend path only |
| 6 | Standalone entry point | `scripts/run_optimization.py` | Standalone path only |

---

## Step-by-step Changes

---

### Step 1 — API Schema (`app/schemas/animal.py`)

**What:** Add two optional fields to `FeedWithPrice` (line 60).

**Current `FeedWithPrice`:**
```python
class FeedWithPrice(BaseModel):
    feed_id: str
    price_per_kg: float
```

**Add:**
```python
class FeedWithPrice(BaseModel):
    feed_id: str
    price_per_kg: float
    min_kg_asfed: Optional[float] = Field(None, ge=0, description="Min inclusion kg/day as-fed")
    max_kg_asfed: Optional[float] = Field(None, ge=0, description="Max inclusion kg/day as-fed")
```

**Validation rules to add:**
- Both fields are optional; `None` means no bound.
- If both are provided, `min_kg_asfed` must be ≤ `max_kg_asfed` — add a `model_validator` to enforce this.

---

### Step 2 — Service / Feed Assembly (`services/diet_service.py`)

Two sub-changes:

**2a. `FeedRecord` dataclass (line 31):** add two new fields:
```python
fd_min: Optional[float] = None   # as-fed min kg/day (None = no bound)
fd_max: Optional[float] = None   # as-fed max kg/day (None = no bound)
```

**2b. `_build_feed_data_list` (line 205):** when constructing the `FeedRecord`,
pass bounds from the request item:
```python
rec = FeedRecord.from_orm(
    feed, fid, country_name,
    price_per_kg=item.price_per_kg,
    fd_min=getattr(item, 'min_kg_asfed', None),
    fd_max=getattr(item, 'max_kg_asfed', None),
)
```

`FeedRecord.from_orm` (line 59) must accept and store `fd_min`/`fd_max`.

The resulting `feed_data_list` (list of dicts from `dataclasses.asdict`) will now
carry `fd_min` / `fd_max` per ingredient into the optimizer pipeline.

---

### Step 3 — Feed Processing (`core/z_optimization/feed_processing.py`)

**What:** Port `_prepare_excel_bound_columns` from
`june_optimization/feed_processing.py` (lines 24–37) as a shared helper used by
**both** processing functions.

**3a. Define the shared helper (add once, near the top of the file):**

```python
def _prepare_feed_bound_columns(f: pd.DataFrame) -> pd.DataFrame:
    # Ensure Fd_Min / Fd_Max columns exist (as-fed kg/day — from API dict or Excel).
    if "Fd_Min" not in f.columns:
        f["Fd_Min"] = np.nan
    if "Fd_Max" not in f.columns:
        f["Fd_Max"] = np.nan

    f["Fd_Min"] = pd.to_numeric(f["Fd_Min"], errors="coerce")
    f["Fd_Max"] = pd.to_numeric(f["Fd_Max"], errors="coerce")

    dm_fraction = pd.to_numeric(f["Fd_DM"], errors="coerce").fillna(0.0) / 100.0
    # Step 1: as-fed kg/day → DM kg/day
    f["Fd_MinDM"] = f["Fd_Min"].fillna(0.0) * dm_fraction
    f["Fd_MaxDM"] = f["Fd_Max"].fillna(0.0) * dm_fraction
    return f
```

**3b. Call it in `rsm_process_feed_dataframe` (API / frontend path):**

After column renaming and before the nutritional calculations (roughly line 60):
```python
f = _prepare_feed_bound_columns(f)
```

**3c. Call it in `rsm_process_feed_library` (standalone / Excel path):**

After the same column renaming step in `rsm_process_feed_library`:
```python
f = _prepare_feed_bound_columns(f)
```

For the standalone path to work, the Excel file must have `fd_min` and `fd_max`
columns (matching `RFT_FD_Lib_Y2test.xlsx` in `june_optimization`). When both
columns are blank/NaN the function produces `Fd_MinDM = Fd_MaxDM = 0`, which means
no bounds — identical to the current unconstrained behaviour.

**3d. Add to `FEED_COLUMN_MAPPING` (line 19):**

```python
"fd_min": "Fd_Min",
"fd_max": "Fd_Max",
```

This normalises lowercase keys that arrive from `dataclasses.asdict(FeedRecord)`
(the API dict path) to the CamelCase names the rest of the pipeline expects.

---

### Step 4 — Optimizer Bounds (`core/z_optimization/optimization_core.py`)

This is the largest change and has three sub-parts, all ported from
`june_optimization/optimization_core.py`.

---

#### 4a. Add `_get_explicit_dm_bounds` helper

Port from `june_optimization/optimization_core.py` lines 44–53. Place it directly
above `rsm_bounds_xlxu` (before line 46 in the rationsmart file):

```python
def _get_explicit_dm_bounds(f_nd, n):
    min_dm = np.asarray(f_nd.get("Fd_MinDM", np.zeros(n)), dtype=float)
    max_dm = np.asarray(f_nd.get("Fd_MaxDM", np.zeros(n)), dtype=float)
    if min_dm.shape[0] != n:
        min_dm = np.resize(min_dm, n)
    if max_dm.shape[0] != n:
        max_dm = np.resize(max_dm, n)
    min_dm = np.nan_to_num(min_dm, nan=0.0)
    max_dm = np.nan_to_num(max_dm, nan=0.0)
    return min_dm, max_dm
```

---

#### 4b. Add per-ingredient bounds block in `rsm_bounds_xlxu`

In `rsm_bounds_xlxu` (rationsmart line 46), after initializing `xl` / `xu` and
pinning DMI (lines 51–56), and **before** the mineral/urea blocks, add:

```python
# Per-ingredient user bounds (from feed card toggle)
explicit_min_dm, explicit_max_dm = _get_explicit_dm_bounds(f_nd, n)
explicit_min_mask = explicit_min_dm > 0
explicit_max_mask = explicit_max_dm > 0
if np.any(explicit_min_mask):
    xl[:n] = np.maximum(xl[:n], explicit_min_dm / trg)   # Step 2: DM kg → proportion
if np.any(explicit_max_mask):
    xu[:n][explicit_max_mask] = np.minimum(
        xu[:n][explicit_max_mask],
        explicit_max_dm[explicit_max_mask] / trg,
    )
```

Also update the infeasibility guard at the end of the function (currently line 118):
replace the silent `scale_factor` path with a `ValueError` when user-set minimums
are the cause — matching `june_optimization` lines 265–268:

```python
if total_xl > 1.0:
    if np.any(explicit_min_mask):
        raise ValueError(
            "Ingredient minimum bounds exceed target DMI; "
            "reduce min_kg_asfed entries before optimizing."
        )
    # Category-level minimums: scale down silently
    scale_factor = 0.95 / total_xl
    xl[:n] *= scale_factor
```

---

#### 4c. Replace `_project_to_simplex` with `_project_to_bounded_simplex`

The current `_project_to_simplex` (rationsmart line 133) applies bounds then
renormalizes, which can re-violate bounds when ingredients are tightly constrained.
The bounded version uses bisection on the Lagrange multiplier and is mathematically
correct.

**Action:** Port `_project_to_bounded_simplex` from `june_optimization/optimization_core.py`
lines 281–318. Place it at the same location (replacing `_project_to_simplex`).

Update `SimplexPlusDmiRepair._do` (rationsmart line 162): replace the three-line
`_project_to_simplex` → bounds clamp → renormalize sequence with a single call:
```python
for i in range(P.shape[0]):
    P[i, :] = _project_to_bounded_simplex(P[i, :], self.xl[:n], self.xu[:n])
```

Update `SimplexPlusDmiSampling._do` (rationsmart line 194): replace the
`_project_to_simplex` call with:
```python
sample = _project_to_bounded_simplex(sample, self.xl[:n], self.xu[:n])
```

---

### Step 5 — Standalone Entry Point (`scripts/run_optimization.py`)

**What:** Ensure the standalone script loads the Excel sheet in a way that
`fd_min` / `fd_max` columns flow through to the optimizer.

No logic change is needed here — `rsm_process_feed_library` already reads all
columns from the Excel sheet. The only requirement is that:

1. The Excel file used for standalone runs has `fd_min` and `fd_max` columns
   (modelled on `june_optimization/RFT_FD_Lib_Y2test.xlsx`).
2. The call inside the script routes through `rsm_process_feed_library`
   (not `rsm_process_feed_dataframe`), so Step 3c above is the active path.

When both columns are left blank the behaviour is identical to today (no bounds).
A nutritionist sets bounds by typing values into those cells before running.

---

### Step 6 — Frontend (Feed Card Component)

**Toggle behavior:**
- Default: off. No Min/Max fields shown. Nothing sent to API for this feed.
- On: show "Min (kg/day)" and "Max (kg/day)" text inputs.
- Both fields remain optional when toggle is on.

**Payload when toggle is on:**
```json
{
  "feed_id": "<uuid>",
  "price_per_kg": 12.5,
  "min_kg_asfed": 0.5,
  "max_kg_asfed": 3.0
}
```

**Payload when toggle is off (or fields blank):**
```json
{
  "feed_id": "<uuid>",
  "price_per_kg": 12.5
}
```
(Omit `min_kg_asfed` / `max_kg_asfed` entirely — the API treats absent fields as `None`.)

**Validation (inline, before Run):**
- Accept numeric input only; reject negatives.
- If both entered: Min must be ≤ Max. Show inline error; block Run until resolved.
- Do not silently clamp — show the error explicitly.

---

## Data Flow Summary (End-to-End)

Both paths converge at `_prepare_feed_bound_columns` and are identical from that
point onward.

### Frontend path (Android app → API)

```
Feed card toggle ON  →  Min = 0.5, Max = 3.0 kg/day as-fed  (Maize Silage, DM = 35%)

POST /recommend
  └─ FeedWithPrice.min_kg_asfed = 0.5,  .max_kg_asfed = 3.0

diet_service._build_feed_data_list
  └─ FeedRecord.fd_min = 0.5,  .fd_max = 3.0  (as dict: "fd_min": 0.5, "fd_max": 3.0)

rsm_process_feed_dataframe  →  _prepare_feed_bound_columns        ← Step 1
  └─ Fd_MinDM = 0.5 × 0.35 = 0.175 kg DM/day
     Fd_MaxDM = 3.0 × 0.35 = 1.050 kg DM/day

rsm_bounds_xlxu  →  _get_explicit_dm_bounds  →  inject into xl/xu  ← Step 2
  └─ xl[i] = 0.175 / 14 = 0.0125   (1.25% of diet DM, minimum)
     xu[i] = 1.050 / 14 = 0.075    (7.5%  of diet DM, maximum)

NSGA-III  →  _project_to_bounded_simplex enforces bounds each generation
  └─ Maize Silage is always 1.25% – 7.5% of diet DM in every candidate solution
```

### Standalone path (Excel → `scripts/run_optimization.py`)

```
Excel sheet  fd_min = 0.5,  fd_max = 3.0  in the Maize Silage row

scripts/run_optimization.py  loads Excel → DataFrame

rsm_process_feed_library  →  _prepare_feed_bound_columns           ← Step 1
  └─ Fd_MinDM = 0.175,  Fd_MaxDM = 1.050  (same as above)

rsm_bounds_xlxu  →  inject into xl/xu                              ← Step 2
  └─ xl[i] = 0.0125,  xu[i] = 0.075  (identical result)

NSGA-III  →  same bounded simplex behaviour
```

---

## What Does NOT Change

- `DietProblemCostOnly._evaluate` — no change needed; ingredient quantities are
  decoded from the solution vector which already respects `xl`/`xu`.
- `compute_adequacy` / constraint logic — no change.
- Diet evaluation endpoint — bounds are a recommendation-only concept.
- Database schema — bounds are per-run inputs, not stored as feed library properties.

---

## Testing Checklist

### Frontend path (API)
- [ ] Toggle off → `min_kg_asfed` / `max_kg_asfed` absent from request → `Fd_MinDM` / `Fd_MaxDM` = 0 → `xl`/`xu` unchanged → optimizer runs as before.
- [ ] Toggle on, Min = 0.5, Max = 3.0 → `xl[i]` / `xu[i]` set correctly for that ingredient.
- [ ] All other ingredients unconstrained — their `xl`/`xu` values unchanged.
- [ ] Min > Max in request → rejected by Pydantic `model_validator` before reaching the optimizer.
- [ ] Sum of user minimums > target DMI → `ValueError` from `rsm_bounds_xlxu` surfaces as a 400 API error.
- [ ] Blank Min, Max = 2.0 → only upper bound set; `xl[i]` stays 0.
- [ ] Blank Max, Min = 0.5 → only lower bound set; `xu[i]` stays 1.

### Standalone path (Excel)
- [ ] Excel `fd_min` / `fd_max` both blank → `Fd_MinDM` / `Fd_MaxDM` = 0 → no bounds → same result as today.
- [ ] Excel `fd_min` = 0.5 for one ingredient → `xl[i]` set; all others unchanged.
- [ ] Excel `fd_max` only → only upper bound set; `xl[i]` stays 0.
- [ ] Both paths with identical inputs produce identical `xl`/`xu` arrays and the same optimized diet.
