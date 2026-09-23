"""Per-physiological-state defaults, ranges and visibility for the Cattle Info form.

Transcribed from `animal_cat_defaults.xlsx` (15 fields x 4 states), the specification the
nutritionists supplied on 2026-09-23. The workbook is deliberately **not** read at request
time: a spreadsheet has no schema, so a retyped cell or a reordered column would surface as
a 422 on every request for a state rather than as a review comment. The plan document
(`docs/defects/state-driven-field-defaults-implementation-plan.md`, section 2) holds the same
table in human-readable form, and `tests/unit/test_animal_field_spec.py` asserts this module
matches it -- so a transcription slip fails a test instead of reaching production.

Three things vary per state, not one: whether a field is shown at all, its prefilled value,
and its accepted range. `routers/animal.py` projects this table to the frontend through
GET /v1/animal/cattle-info-fields, and `CattleInfo` enforces the same table on the request
path, so the form and the API can never disagree about what is acceptable.

Placement note: this is a sibling of `constraints_config.UI_THRESHOLD_SPEC`, which does the
same job for diet limits but lives in `core/`. The difference is deliberate -- those numbers
ARE engine constraint values, while these are form/display rules the engine never reads.
Keeping them in `app/` avoids importing UI concerns into the pure-compute layer.
"""

from typing import Any, Dict, List, Optional, Tuple

# Canonical states, in the order the UI lists them.
PHYSIOLOGICAL_STATES: Tuple[str, ...] = (
    "Lactating Cow",
    "Dry Cow",
    "Heifer",
    "Baby Calf/Heifer",
)

BREED_OPTIONS: Tuple[str, ...] = ("Holstein", "Crossbred", "Indigenous")
# The engine has always scored Mountainous (Env_Topo 200m vs 50m for Hilly, roughly 4x the
# activity allowance); the form simply never offered it. See the plan, D7.
TOPOGRAPHY_OPTIONS: Tuple[str, ...] = ("Flat", "Hilly", "Mountainous")


# State-independent presentation metadata. `label` and `unit` are transcribed verbatim from
# the sheet and are **reference only** -- the frontend owns rendering, because the form is
# localized and these strings are English (plan, D5). `engine_key` is the NASEM name the
# value reaches the engine under, via ANIMAL_INPUT_MAPPING in animal_requirements.py; it is
# recorded for traceability and is not part of the API response.
FIELD_META: Dict[str, Dict[str, Any]] = {
    "breed":             {"label": "Breed Selection",          "unit": None,          "type": "enum",    "options": list(BREED_OPTIONS),      "engine_key": "An_Breed"},
    "body_weight":       {"label": "Body weight",              "unit": "kg",          "type": "number",  "options": None,                     "engine_key": "An_BW"},
    "bw_gain":           {"label": "BW gain",                  "unit": "kg/day",      "type": "number",  "options": None,                     "engine_key": "Trg_FrmGain"},
    "bc_score":          {"label": "Body condition score",     "unit": "1-5 score",   "type": "number",  "options": None,                     "engine_key": "An_BCS"},
    "days_in_milk":      {"label": "Days in milk",             "unit": "days",        "type": "number",  "options": None,                     "engine_key": "An_LactDay"},
    "milk_production":   {"label": "Target milk production",   "unit": "L/day",       "type": "number",  "options": None,                     "engine_key": "Trg_MilkProd_L"},
    "tp_milk":           {"label": "Target milk protein",      "unit": "%",           "type": "number",  "options": None,                     "engine_key": "Trg_MilkTPp"},
    "fat_milk":          {"label": "Target milk fat",          "unit": "%",           "type": "number",  "options": None,                     "engine_key": "Trg_MilkFatp"},
    "parity":            {"label": "Parity",                   "unit": "count",       "type": "number",  "options": None,                     "engine_key": "An_Parity"},
    "days_of_pregnancy": {"label": "Gestation day",            "unit": "days",        "type": "number",  "options": None,                     "engine_key": "An_GestDay"},
    "temperature":       {"label": "Current temperature",      "unit": "°C",     "type": "number",  "options": None,                     "engine_key": "Env_TempCurr"},
    "grazing":           {"label": "Active Grazing",           "unit": None,          "type": "boolean", "options": None,                     "engine_key": "Env_Grazing"},
    "distance":          {"label": "Distance to grazing area", "unit": "km",          "type": "number",  "options": None,                     "engine_key": "Env_Dist_km"},
    "topography":        {"label": "Topography",               "unit": None,          "type": "enum",    "options": list(TOPOGRAPHY_OPTIONS), "engine_key": "Env_Topog"},
    "milk_price":        {"label": "Milk price",               "unit": "Currency from country selection", "type": "number", "options": None,  "engine_key": None},
}

# Sheet order, which is the order the form lays the fields out.
FIELD_ORDER: Tuple[str, ...] = tuple(FIELD_META.keys())


# Per-state specification. **A field absent from a state's dict is hidden for that state**
# -- that is the single source of the `visible` flag, so there is no way for a field to be
# listed twice with conflicting answers. Every visible entry carries an explicit `default`;
# `min`/`max` appear only where the sheet gives a range.
STATE_FIELD_SPEC: Dict[str, Dict[str, Dict[str, Any]]] = {
    "Lactating Cow": {
        "breed":             {"default": "Crossbred"},
        "body_weight":       {"default": 400,   "min": 250,  "max": 720},
        "bw_gain":           {"default": 0.2,   "min": 0,    "max": 1},
        "bc_score":          {"default": 3,     "min": 1,    "max": 5},
        "days_in_milk":      {"default": 100,   "min": 0,    "max": 400},
        "milk_production":   {"default": 15,    "min": 1,    "max": 35},
        "tp_milk":           {"default": 3,     "min": 2.6,  "max": 4.2},
        "fat_milk":          {"default": 3.5,   "min": 2.5,  "max": 6.5},
        "parity":            {"default": 1,     "min": 1,    "max": 11},
        "days_of_pregnancy": {"default": 40,    "min": 0,    "max": 280},
        "temperature":       {"default": 25,    "min": 5,    "max": 45},
        "grazing":           {"default": False},
        "distance":          {"default": 0,     "min": 0,    "max": 15},
        "topography":        {"default": "Flat"},
        "milk_price":        {"default": None},
    },
    "Dry Cow": {
        "breed":             {"default": "Crossbred"},
        "body_weight":       {"default": 400,   "min": 250,  "max": 720},
        "bw_gain":           {"default": 0.2,   "min": 0,    "max": 2},
        "bc_score":          {"default": 3,     "min": 1,    "max": 5},
        "parity":            {"default": 1,     "min": 1,    "max": 11},
        "days_of_pregnancy": {"default": 0,     "min": 0,    "max": 280},
        "temperature":       {"default": 25,    "min": 5,    "max": 45},
        "grazing":           {"default": False},
        "distance":          {"default": 0,     "min": 0,    "max": 15},
        "topography":        {"default": "Flat"},
    },
    "Heifer": {
        "breed":             {"default": "Crossbred"},
        "body_weight":       {"default": 160,   "min": 100,  "max": 500},
        "bw_gain":           {"default": 0.5,   "min": 0,    "max": 2},
        "days_of_pregnancy": {"default": 0,     "min": 0,    "max": 280},
        "temperature":       {"default": 25,    "min": 5,    "max": 45},
        "grazing":           {"default": False},
        "distance":          {"default": 0,     "min": 0,    "max": 15},
        "topography":        {"default": "Flat"},
    },
    "Baby Calf/Heifer": {
        "body_weight":       {"default": 40,    "min": 30,   "max": 100},
    },
}


# What the client submits for a field the form does NOT show. The sheet leaves these cells
# blank -- it says "do not display", not "do not send" -- so the values are chosen here
# rather than invented by each client, because they are persisted into the report's
# `animal_inputs` JSON. None of them changes a result: the lactation drivers are zeroed
# server-side anyway by `_neutralize_lactation_fields`, distance/topography are hard-zeroed
# by the engine when grazing is off, and a calf's intake is `0.10 * An_BW`, body weight
# alone. See the plan, D4.
HIDDEN_FIELD_VALUES: Dict[str, Any] = {
    "breed": "Crossbred",       # unused in calf math; matches the sheet's default elsewhere
    "body_weight": None,        # never hidden; present for completeness
    "bw_gain": 0,
    "bc_score": 3,              # mid-scale, so a 0 cannot reach a ratio
    "days_in_milk": 0,
    "milk_production": 0,
    "tp_milk": 0,
    "fat_milk": 0,
    "parity": 0,
    "days_of_pregnancy": 0,
    "temperature": 25,          # inert for a calf, the only state that hides it
    "grazing": False,
    "distance": 0,
    "topography": "Flat",
    "milk_price": None,
}


# `distance` is the one field whose default AND minimum move at runtime. The live rule is a
# floor, not just a default: CattleInfo rejects `grazing and distance < 1`. Advertising
# `min: 0` while the server rejects 0 would put the form and the API back out of step, so
# the conditional travels with the field. See the plan, D3.
GRAZING_DISTANCE_OVERRIDE: Dict[str, Any] = {"default": 1, "min": 1}

# The distance below which a grazing animal is rejected. Kept next to the override above so
# the two cannot drift.
GRAZING_MIN_DISTANCE_KM = 1


# Purpose: Report whether a field is rendered for a given physiological state.
# Notes: Absence from the state's spec is what "hidden" means; unknown states raise KeyError.
def field_visible(key: str, state: str) -> bool:
    return key in STATE_FIELD_SPEC[state]


# Purpose: Return the (min, max) accepted range for a field in a given state.
# Notes: Either element is None when the sheet gives no bound (enums, booleans, milk price).
def field_bounds(key: str, state: str) -> Tuple[Optional[float], Optional[float]]:
    spec = STATE_FIELD_SPEC[state].get(key) or {}
    return spec.get("min"), spec.get("max")


# Purpose: Return the value a client should submit for a field in a given state.
# Notes: The state default when the field is shown, otherwise the agreed hidden-field value.
def field_default(key: str, state: str) -> Any:
    if field_visible(key, state):
        return STATE_FIELD_SPEC[state][key].get("default")
    return HIDDEN_FIELD_VALUES.get(key)


# Purpose: Describe every Cattle Info field for one physiological state.
# Notes: Always returns all 15 fields in sheet order -- `visible` carries the hide/show
#        decision, because the client submits hidden fields too (plan, D4). `distance`
#        additionally carries `when_grazing_on`.
def field_spec_for_state(state: str) -> List[Dict[str, Any]]:
    if state not in STATE_FIELD_SPEC:
        raise KeyError(state)

    fields = []
    for key in FIELD_ORDER:
        meta = FIELD_META[key]
        visible = field_visible(key, state)
        low, high = field_bounds(key, state)
        entry = {
            "key": key,
            "label": meta["label"],
            "unit": meta["unit"],
            "visible": visible,
            "type": meta["type"],
            "default": field_default(key, state),
            "min": low,
            "max": high,
            "options": meta["options"] if visible else None,
        }
        if key == "distance" and visible:
            entry["when_grazing_on"] = dict(GRAZING_DISTANCE_OVERRIDE)
        fields.append(entry)
    return fields
