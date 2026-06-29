# Implementation Plan: Milk Price & Profit Margin (Recommendation)

## Feature Summary

Capture a **Milk Price** (selling price per litre, in local currency) as an input on
the Diet Recommendation request, and surface a **profit margin** in the report.

- The optimization runs exactly as today — milk price is a **post-calculation overlay**,
  not an optimizer input.
- The report shows **diet cost per litre of milk** (already computed today) and compares
  it against the entered milk price.
- A **Margin / Litre** card appears in the report summary, styled **positive** (green,
  margin ≥ 0) or **negative** (red, margin < 0).

**Scope:** Recommendation flow **only**. Evaluation flow is untouched.

**Margin definition (confirmed):** per-litre only.

```
margin_per_litre = milk_price − cost_per_liter
cost_per_liter   = daily_diet_cost / milk_production   (already exists)
```

No daily-margin card. No optimizer changes. No DB migration.

**Codebase scope:** backend only (`/Users/satishchandra/ucdapp/rationsmart`).
The home-page input field and the visual card are a **separate frontend codebase**
and are out of scope for this plan.

---

## What Already Exists

`cost_per_liter` is **already computed** in both consumers — the new work is the
**milk_price input** and the **margin** derived from it.

| Where | What exists today | File:Line |
|-------|-------------------|-----------|
| API response builder | `cost_per_liter` computed + emitted in `solution_summary` | [reporting.py:141-143, 224-225](../../core/z_optimization/reporting.py#L141-L143) |
| PDF/HTML report (v2) | `cost_per_liter` recomputed + "Cost / Liter" summary-card | [report_generation.py:1092, 1364](../../core/z_optimization/report_generation.py#L1092) |

There is **no** `milk_price` field anywhere (request schema, `CattleInfo`, DB models)
and **no** margin calculation anywhere.

---

## ⚠️ Critical Finding: The PDF/Report Path Is Orphaned on `main`

A full trace (branch `main`, this repo) shows the recommendation **PDF/report-generation
chain is fully built but NOT wired to any live endpoint**:

- `run_diet_recommendation` persists `Report.json_result` and returns the API response.
  It does **not** trigger any PDF/report generation. The docstrings reference
  "Task 2.8 … triggered separately as a background task" but **no such trigger exists in code**.
  ([diet_service.py:278](../../services/diet_service.py#L278))
- `report_service.generate_background_reports` — **defined, never called.**
  ([report_service.py:231](../../services/report_service.py#L231))
- `report_service.trigger_pdf_generation` (Celery `send_task("generate_pdf_report")`)
  — **defined, never called.** No worker task named `generate_pdf_report` is registered
  in this repo. ([report_service.py:202](../../services/report_service.py#L202))
- `core/.../reporting.py::generate_background_reports` → `rsm_generate_report_v2` →
  `rec_pdf_report_generator_v2` — a complete chain, but its only entry point is the
  orphaned `report_service` function above. ([reporting.py:516](../../core/z_optimization/reporting.py#L516))
- `POST /v1/animal/reports/pdf` — returns **501 Not Implemented** (stub).
  ([routers/animal.py:537-553](../../routers/animal.py#L537-L553))

**Implication for this feature:** The API-response margin (Steps 1–3 below) is fully
deliverable today and will appear in `solution_summary` and the persisted `json_result`.
The **PDF/HTML margin card (Step 4)** can be implemented so the data flows correctly,
**but it will not render in a live PDF until the PDF trigger itself is wired up** —
which is separate, pre-existing work outside this feature.

**Decision required from product/eng before Step 4 ships:** see
[Open Question 1](#open-questions).

---

## Data Flow (Target)

```
DietRecommendationRequest.milk_price  (NEW, top-level, optional)
        │
        ├──► run_diet_recommendation (diet_service.py)
        │         │
        │         ├──► build_diet_response(..., milk_price)        [Step 2]
        │         │         └─ solution_summary += {milk_price, margin}
        │         │
        │         └──► Report.json_result = response  ──► margin PERSISTED  [Step 3]
        │
        └──► (when PDF trigger is wired) generate_background_reports(..., milk_price)
                  └──► rsm_generate_report_v2(..., milk_price)     [Step 4]
                            └─ "Margin / Liter" summary-card (green/red)
```

`milk_price` has **two independent consumers** (the API builder and the PDF builder
each compute `cost_per_liter` separately), so it is threaded to both. No shared calc.

---

## Implementation Steps

### Step 1 — Schema: accept `milk_price`
**File:** [app/schemas/animal.py](../../app/schemas/animal.py)

Add a top-level optional field to `DietRecommendationRequest` (NOT inside `CattleInfo` —
milk price is an economic input, not an animal characteristic):

```python
class DietRecommendationRequest(BaseModel):
    simulation_id: str
    user_id: str
    country_id: str
    milk_price: Optional[float] = Field(
        None, ge=0, description="Milk selling price per litre in local currency"
    )
    cattle_info: CattleInfo
    feed_selection: List[FeedWithPrice] = Field(..., description="Feeds with prices")
    base_thresholds: Optional[BaseThresholds] = None
```

- Add a `round_floats`-style `field_validator` to round to 2 dp (mirrors existing patterns).
- `Optional` + `None` default → backward compatible with existing clients.
- `solution_summary` is a free-form `Dict[str, Any]` in `DietRecommendationResponse`
  ([animal.py:181](../../app/schemas/animal.py#L181)), so the new `milk_price`/`margin`
  keys need **no** response-model change. Document the keys in this plan (below).

### Step 2 — Compute margin in the API response
**File:** [core/z_optimization/reporting.py](../../core/z_optimization/reporting.py) · `build_diet_response`

- Add parameter `milk_price: Optional[float] = None` to the signature.
- After the existing `cost_per_liter` calc ([line 143](../../core/z_optimization/reporting.py#L143)):

```python
margin_per_liter = (
    round(float(milk_price) - cost_per_liter, 2) if milk_price is not None else None
)
```

- Extend `solution_summary` ([line 223](../../core/z_optimization/reporting.py#L223)):

```python
'solution_summary': {
    'daily_cost': round(daily_cost, 2),
    'cost_per_liter': round(cost_per_liter, 2),
    'milk_price': round(float(milk_price), 2) if milk_price is not None else None,
    'margin_per_liter': margin_per_liter,
    'currency': currency,
    ...
}
```

### Step 3 — Thread + persist via the service
**File:** [services/diet_service.py](../../services/diet_service.py) · `run_diet_recommendation`

- Pass `milk_price=request.milk_price` into `build_diet_response(...)`
  ([call at line 357](../../services/diet_service.py#L357)).
- **Persistence is automatic:** `Report.json_result = response`
  ([line 383](../../services/diet_service.py#L383)) already persists the whole response,
  so `milk_price` + `margin_per_liter` are stored inside `solution_summary`.
  **No DB migration, no model change.**

### Step 4 — Margin card in PDF/HTML report
**File:** [core/z_optimization/report_generation.py](../../core/z_optimization/report_generation.py) · `rsm_generate_report_v2`

> Gated on the PDF trigger being wired (see Critical Finding). The code below makes
> `milk_price` flow correctly **when** that trigger exists; it is harmless until then.

1. Add `milk_price: Optional[float] = None` kwarg to `rsm_generate_report_v2`.
2. Thread it through the chain:
   - [reporting.py `generate_background_reports`](../../core/z_optimization/reporting.py#L516)
     → add `milk_price` param → pass to `rsm_generate_report_v2`.
   - [report_service.py `generate_background_reports`](../../services/report_service.py#L231)
     → add `milk_price` param → pass to `_core_gen`.
3. After the existing `cost_per_liter` calc ([line 1092](../../core/z_optimization/report_generation.py#L1092)):

```python
margin_per_liter = (
    (float(milk_price) - cost_per_liter)
    if (milk_price is not None and cost_per_liter is not None) else None
)
```

4. Add a 5th summary-card after the "Cost / Liter" card ([line 1364](../../core/z_optimization/report_generation.py#L1364)):

```python
f"<div class='summary-card {('margin-pos' if (margin_per_liter or 0) >= 0 else 'margin-neg') if margin_per_liter is not None else ''}'>"
f"<img src='{icon_margin}' class='summary-icon'>"
f"<span class='summary-lab'>Margin / Liter</span>"
f"<span class='summary-val'>{f'{currency_display}{margin_per_liter:.2f}' if margin_per_liter is not None else '—'}</span></div>",
```

5. Add CSS classes `.summary-card.margin-pos { color/border: green }` and
   `.margin-neg { red }` in the v2 `style` block.
6. Optional asset `assets/margin.png` (reuse `cost_per_liter.png` if no new icon).
7. `milk_price` absent → render `—` (mirrors existing null handling; old requests safe).

### Step 5 — Tests
- **Unit** on `build_diet_response`:
  - positive margin (`milk_price > cost_per_liter`)
  - negative margin (`milk_price < cost_per_liter`)
  - `milk_price=None` → `margin_per_liter` is `None`, no KeyError
- Update existing recommendation fixtures/golden tests for the new `solution_summary` keys.
- If Step 4 ships: a render smoke test that the margin card HTML appears with correct
  pos/neg class.

---

## New `solution_summary` Keys (API Contract)

| Key | Type | Notes |
|-----|------|-------|
| `milk_price` | `float \| null` | Echo of input; `null` when not supplied |
| `margin_per_liter` | `float \| null` | `milk_price − cost_per_liter`; `null` when no milk_price |
| `cost_per_liter` | `float` | Unchanged (already present) |

Frontend renders the margin card from `solution_summary.margin_per_liter` (sign → color).

---

## Out of Scope
- Optimizer logic (unchanged — pure post-calc overlay).
- DB schema / migration (persisted via existing `json_result`).
- Evaluation flow.
- Frontend input field + visual card (separate codebase).
- **Wiring the PDF trigger** (pre-existing orphaned path — separate task; Step 4 only
  makes margin data flow once that wiring exists).

---

## Open Questions

1. **PDF trigger (blocks Step 4 visible output).** The recommendation PDF/report path is
   orphaned on `main` (no live caller; `/reports/pdf` is a 501 stub). Options:
   - **(a)** Implement Steps 1–3 now (API margin live + persisted); implement Step 4's
     plumbing now so it's ready, but accept the card won't render until the PDF trigger
     is wired separately. *(Recommended — unblocks the API/frontend immediately.)*
   - **(b)** Wire the PDF trigger as part of this feature (larger scope; pulls in the
     whole Task 2.8 background/Celery decision).

   **Recommendation: (a).**

---

## Effort Estimate

- Steps 1–3 (API margin + persistence + tests): ~½ day.
- Step 4 (PDF card plumbing + CSS): ~2–3 hrs, deliverable independently once Q1 is decided.
