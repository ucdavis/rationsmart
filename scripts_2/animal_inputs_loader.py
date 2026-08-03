"""
Read animal inputs (and per-ingredient as-fed amounts) from an xlsx workbook
for the standalone recommendation / evaluation runners.

Local dev tooling only. Lives under the ``scripts_2/`` tree and is never
imported by the FastAPI app.

Workbook layout (see scripts_2/manual_run/RFT_FD_Lib_Y2test.xlsx):
  - "Fd_selected"  : feed library (read by the runners, not here).
  - "Animal"       : single animal. Column A = key, column B = value.
  - "BulkAnimals"  : many animals. Column A = key; columns B, C, ... hold one
                     animal each, with row 0 carrying the animal IDs.

Both animal sheets may end with an "Ingredient (kg AF)" section: one row per
feed (in Fd_selected order) giving that ingredient's as-fed kg. The section is
located by column-A label, not by fixed row numbers.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# The engine-native keys rsm_calculate_an_requirements() consumes.
REQUIRED_ANIMAL_KEYS = [
    "An_StatePhys",
    "An_Breed",
    "An_BW",
    "Trg_FrmGain",
    "An_BCS",
    "An_LactDay",
    "Trg_MilkProd_L",
    "Trg_MilkTPp",
    "Trg_MilkFatp",
    "An_Parity",
    "An_GestDay",
    "Env_TempCurr",
    "Env_Grazing",
    "Env_Dist_km",
    "Env_Topog",
]

INGREDIENT_PREFIX = "ingredient"


def safe_animal_id(animal_id: Any) -> str:
    """Filesystem-safe token for report filenames."""
    s = str(animal_id).strip().replace(" ", "_")
    return "".join(c for c in s if c.isalnum() or c in ("_", "-")) or "animal"


def _clean(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if pd.isna(value):
        return None
    return value


def _is_ingredient_label(label: Any) -> bool:
    return isinstance(label, str) and label.strip().lower().startswith(INGREDIENT_PREFIX)


def _ingredient_amounts(
    df: pd.DataFrame, value_col: int, n_feeds: int, sheet: str, animal_id: str
) -> np.ndarray:
    rows = [i for i in range(len(df)) if _is_ingredient_label(df.iat[i, 0])]
    if len(rows) < n_feeds:
        raise ValueError(
            f"Sheet '{sheet}', animal '{animal_id}': found {len(rows)} "
            f"'Ingredient (kg AF)' row(s) but the feed library has {n_feeds} feed(s). "
            f"Add one ingredient row per feed, in Fd_selected order."
        )
    amounts: List[float] = []
    for i in rows[:n_feeds]:
        raw = _clean(df.iat[i, value_col])
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise ValueError(
                f"Sheet '{sheet}', animal '{animal_id}': ingredient row {i + 1} "
                f"(column {value_col + 1}) is not a number: {df.iat[i, value_col]!r}."
            )
        amounts.append(float(raw))
    return np.asarray(amounts, dtype=float)


def _build_record(
    df: pd.DataFrame,
    value_col: int,
    animal_id: str,
    sheet: str,
    n_feeds: Optional[int],
) -> Optional[Dict[str, Any]]:
    raw: Dict[str, Any] = {}
    for i in range(len(df)):
        key = df.iat[i, 0]
        if pd.isna(key):
            continue
        key = str(key).strip()
        if not key or _is_ingredient_label(key):
            continue
        if key in REQUIRED_ANIMAL_KEYS or key == "milk_price_per_liter":
            raw[key] = _clean(df.iat[i, value_col])

    # Empty column → not an animal (e.g. a spacer column in BulkAnimals).
    if all(raw.get(k) is None for k in REQUIRED_ANIMAL_KEYS):
        return None

    missing = [k for k in REQUIRED_ANIMAL_KEYS if raw.get(k) is None]
    if missing:
        raise KeyError(
            f"Sheet '{sheet}', animal '{animal_id}': missing required inputs {missing}."
        )

    milk_price = raw.get("milk_price_per_liter")
    if isinstance(milk_price, bool) or not isinstance(milk_price, (int, float)) or float(milk_price) < 0:
        raise ValueError(
            f"Sheet '{sheet}', animal '{animal_id}': 'milk_price_per_liter' must be a "
            f"non-negative number (0 allowed); got {milk_price!r}."
        )

    animal_inputs = {k: raw[k] for k in REQUIRED_ANIMAL_KEYS}

    ingredient_amounts_af: Optional[np.ndarray] = None
    if n_feeds is not None:
        ingredient_amounts_af = _ingredient_amounts(df, value_col, n_feeds, sheet, animal_id)

    return {
        "animal_id": animal_id,
        "animal_inputs": animal_inputs,
        "milk_price_per_liter": float(milk_price),
        "ingredient_amounts_af": ingredient_amounts_af,
    }


def load_single_animal(
    path: str, sheet: str = "Animal", n_feeds: Optional[int] = None
) -> Dict[str, Any]:
    """Read one animal from a key→value sheet (column A = key, column B = value)."""
    try:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
    except Exception as exc:  # noqa: BLE001 - surface a clear runner-level message
        raise RuntimeError(f"Could not read sheet '{sheet}' from '{path}': {exc}") from exc

    record = _build_record(df, value_col=1, animal_id="animal", sheet=sheet, n_feeds=n_feeds)
    if record is None:
        raise ValueError(f"Sheet '{sheet}' has no animal inputs in column B.")
    return record


def load_bulk_animals(
    path: str, sheet: str = "BulkAnimals", n_feeds: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Read many animals; each column B, C, ... is one animal, row 0 holds IDs."""
    try:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Could not read sheet '{sheet}' from '{path}': {exc}") from exc

    if df.empty or df.shape[1] < 2:
        return []

    header = df.iloc[0]
    animals: List[Dict[str, Any]] = []
    for col in range(1, df.shape[1]):
        id_raw = header.iat[col]
        if pd.isna(id_raw) or not str(id_raw).strip():
            continue
        record = _build_record(
            df, value_col=col, animal_id=str(id_raw).strip(), sheet=sheet, n_feeds=n_feeds
        )
        if record is not None:
            animals.append(record)
    return animals
