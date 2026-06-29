# Implementation Plan: Milk Price & Profit Margin (Recommendation + Evaluation)

## Feature Summary

Capture a **Milk Price** (selling price per litre, in local currency) as an input on
the diet request, and surface a **profit margin** in the report (on-screen + PDF).

- The optimization runs exactly as today — milk price is a **post-calculation overlay**,
  not an optimizer input.
- The report shows **diet cost per litre of milk** (already computed today) and compares
  it against the entered milk price.
- A **margin card / banner** appears in the report, styled **positive** (green,
  margin ≥ 0) or **negative** (red, margin < 0).

### Confirmed decisions (this session)

| Decision | Choice |
|----------|--------|
| Codebase scope | **Backend only** (`/Users/satishchandra/ucdapp/rationsmart`). The home-page input field and the visual card are a **separate frontend codebase**, out of scope. |
| Field requirement | **Optional** — card renders only when milk price is supplied; existing callers unaffected. |
| Margin metric | **Per-litre + daily IOFC** (both). |
| Flows | **Both** — recommendation *and* evaluation. |

### Margin definitions

```
cost_per_liter   = daily_diet_cost / milk_yield        (already exists)
margin_per_litre = milk_price − cost_per_liter
daily_iofc       = (milk_price × milk_yield) − daily_diet_cost
```

- **Recommendation:** `milk_yield` = `milk_production` (target, liters/day).
- **Evaluation:** `milk_yield` = milk *actually supported by the diet* (consistent with the
  existing `Feed_Cost_Per_L_Milk` denominator). Flag if target yield is preferred instead.

**No optimizer changes. No DB migration.**

---

## Architecture Recap (how data flows today)

- **Input:** `DietRecommendationRequest` / `DietEvaluationRequest` — both embed `CattleInfo`
  ([animal.py:34](../../app/schemas/animal.py#L34)).
- **Persistence:** `diet_service` flattens `cattle_info` into an `animal_inputs` dict, stored
  in `reports.animal_inputs` (JSONB) and fed to NSGA-III
  ([diet_service.py:294](../../services/diet_service.py#L294)).
- **Screen JSON:** `build_diet_response` / `build_evaluation_response`
  ([reporting.py:15](../../core/z_optimization/reporting.py#L15),
  [:247](../../core/z_optimization/reporting.py#L247)) — *already computes `cost_per_liter`*.
- **PDF:** background task → `rsm_generate_report_v2` writes HTML
  ([report_generation.py:1022](../../core/z_optimization/report_generation.py#L1022)) →
  WeasyPrint renders that same HTML to PDF. **Screen + PDF share one HTML generator**, so the
  card markup is touched in a single place.

### Key safety finding

`rsm_calculate_an_requirements` copies its input dict and only reads **mapped** keys
([animal_requirements.py:55-60](../../core/z_optimization/animal_requirements.py#L55-L60)).
Adding `milk_price` to `animal_inputs` is therefore **harmless to the optimizer** and
persists for free in the `animal_inputs` JSONB column — **no migration required**.

---

## What Already Exists

`cost_per_liter` is **already computed** in every consumer — the new work is the
**milk_price input** and the **margin** derived from it.

| Where | What exists today | File:Line |
|-------|-------------------|-----------|
| Recommendation response | `cost_per_liter` in `solution_summary` | [reporting.py:141-143, 224-225](../../core/z_optimization/reporting.py#L141-L143) |
| Evaluation response | `feed_cost_per_kg_milk` in `cost_analysis` | [reporting.py:313-320](../../core/z_optimization/reporting.py#L313-L320) |
| PDF/HTML report (v2) | `cost_per_liter` recomputed + "Cost / Liter" summary-card | [report_generation.py:1092, 1364](../../core/z_optimization/report_generation.py#L1092) |

---

## Phase 1 — Capture the input (schema)

**File:** [app/schemas/animal.py](../../app/schemas/animal.py)

- Add to `CattleInfo`:
  ```python
  milk_price: Optional[float] = Field(None, ge=0, description="Milk sale price per litre, local currency")
  ```
  Round to 2 dp in the existing float validator.
- Placing it on `CattleInfo` covers **both** request models in one change (both embed
  `CattleInfo`) and rides the existing `animal_inputs` persistence path.
- *Trade-off:* `CattleInfo` is otherwise animal biology; milk_price is economic. But
  `milk_production` already lives here, the field is optional, and this avoids touching two
  request models + two persistence sites. **Recommended** over a top-level field.

**Pause for sign-off after this phase.**

---

## Phase 2 — Thread it through (persistence + report input)

**File:** [services/diet_service.py](../../services/diet_service.py)

- Add `"milk_price": cattle.milk_price` to the `animal_inputs` dict in **both**
  `run_diet_recommendation` (~L298) and `run_diet_evaluation` (~L425). Persists in JSONB,
  ignored by the optimizer.
- Inject `milk_price` into the optimizer `post_results` (or pass as an explicit arg) so the
  background HTML generator — which reads `post_results` / `animal_requirements`, not
  `cattle_info` — can access it without widely re-plumbing its signature.

---

## Phase 3 — Compute margin in the screen JSON

**File:** [core/z_optimization/reporting.py](../../core/z_optimization/reporting.py)

- `build_diet_response`: when `milk_price` is present, add a `margin_summary` block to
  `solution_summary`:
  ```json
  {
    "milk_price": 0.00,
    "margin_per_liter": 0.00,
    "daily_iofc": 0.00,
    "is_positive": true
  }
  ```
  Omitted / null when no milk_price → existing callers unaffected.
- `build_evaluation_response` `cost_analysis`: add the same three fields, using
  milk-actually-supported as the revenue denominator.

---

## Phase 4 — Render the margin card (screen HTML + PDF, one place)

**File:** [core/z_optimization/report_generation.py](../../core/z_optimization/report_generation.py) (`rsm_generate_report_v2`)

- Compute margin near the existing `cost_per_liter` calc (~L1092).
- Add a **dedicated margin card / banner** below the summary row, color-coded
  **green (positive) / red (negative)**, showing: **Milk Price /L**, **Margin /L**, and
  **Daily IOFC**. A standalone banner reads better than cramming extra chips into the
  existing 4-card flex row — this is the headline economic result.
- Render only when `milk_price` is set.

**File:** [core/z_optimization/pdf_service.py](../../core/z_optimization/pdf_service.py)

- Add the margin card's CSS to the PDF-optimization pass with
  `-webkit-print-color-adjust: exact` so the green/red prints in WeasyPrint (the existing
  summary cards already do this, [report_generation.py:1309](../../core/z_optimization/report_generation.py#L1309)).

---

## Phase 5 — Tests & verification

- Extend tests under [tests/](../../tests/) for:
  - schema accepts / omits `milk_price`;
  - recommendation `margin_summary` present/absent and sign correct;
  - evaluation `cost_analysis` margin fields present and sign correct.
- Run the targeted recommendation + evaluation tests.
- Generate one sample PDF for each flow to eyeball the card (positive **and** negative case).

---

## Cross-cutting Notes

- **No migration**, **no breaking changes** (field optional; card conditional).
- **Currency:** margin uses the same country currency already resolved for the report.
- **Frontend hand-off (out of scope here):**
  - New request field: `cattle_info.milk_price` — number, per litre, local currency, optional.
  - New response keys: `solution_summary.margin_summary` (recommendation),
    `cost_analysis.{milk_price, margin_per_liter, daily_iofc, ...}` (evaluation).
