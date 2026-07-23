"""
Contraints configurationfor diet optimization.

This module contains all global configuration constants used throughout
the optimization system, including:
- Constraint limits and thresholds
- Tolerance ranges for constraint evaluation
- Animal type-specific parameters
"""

import copy
from typing import Dict, Iterable

# ===================================================================
# Helper functions
# ===================================================================

# Purpose: Merge base config with without mutating inputs.
# Notes: Recurses into nested dicts so override sections fully replace or merge.
def merge(base: Dict, override: Dict) -> Dict:
    result = copy.deepcopy(base) if base is not None else {}
    for key, val in (override or {}).items():
        if isinstance(val, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], val)
        else:
            result[key] = copy.deepcopy(val)
    return result


# Purpose: Apply section-wise overrides to a base constraint profile copy.
# Notes: Uses merge to combine nested maps for thresholds, weights, and penalties.
def _build_profile(base_profile: Dict, override_sections: Dict) -> Dict:
    profile = copy.deepcopy(base_profile)
    for section_name, overrides in (override_sections or {}).items():
        base_section = base_profile.get(section_name, {})
        profile[section_name] = merge(base_section, overrides or {})
    return profile


# ===================================================================
# Constraints configuration
# ===================================================================

# Base thresholds (Lactating Cow) and per-state overrides
BASE_THRESHOLDS = {
    "nel_balance_max":        2.0,
    "mp_balance_max":         0.5,

    "ndf_for_min":            0.20,
    "ndf_max":                0.45, #Changed on 15/01/2026(from 0.40)
    "starch_max":             0.26,
    "ee_max":                 0.07,
    "ash_max":                0.15,

    "conc_max":               0.60,
    "conc_byprod_max":        0.30,
    "other_wet_ingr_max":     0.12, #Changed on 15/01/2026(from 0.30)
    "moist_forage_min":       0.20,
    "forage_straw_max":       0.15, #Changed on 15/01/2026(from 0.25)
    "forage_fibrous_max":     0.80,
    "molasses_max":           0.035,
    # Used for bound calculation in optimization_core.py
    "urea_max":               0.01,   # proportion of total DMI (e.g., 1% of DM)
    "mineral_min":            0.050,  # kg/day absolute lower bound (premixes often fixed)
    "mineral_max":            0.800,  # kg/day absolute upper bound
}

DRY_THRESHOLDS_OVERRIDE = {
    "nel_balance_max":        1.5,
    "ndf_for_min":            0.27,
    "ndf_max":                0.90,
    "starch_max":             0.18,
    "ee_max":                 0.05,
    "ash_max":                0.13,
    "conc_byprod_max":        0.25,
    "other_wet_ingr_max":     0.20,
    "moist_forage_min":       0.18,
    "forage_straw_max":       0.30,
    "forage_fibrous_max":     0.85,
    "urea_max":               0.007,
}

HEIFER_THRESHOLDS_OVERRIDE = {
    "ndf_for_min":            0.19,
    "ndf_max":                0.90,
    "starch_max":             0.20,
    "ee_max":                 0.05,
    "ash_max":                0.13,
    "conc_max":               0.50,
    "conc_byprod_max":        0.25,
    "other_wet_ingr_max":     0.20,
    "moist_forage_min":       0.18,
    "forage_straw_max":       0.30,
    "forage_fibrous_max":     0.85,
    "molasses_max":           0.03,
    "urea_max":               0.007,
}

CONSTRAINT_ORDER = [
    "energy_req",
    "mp_req",
    "ca",
    "p",
    "ndf_for_min",
    "ash_max",
    "ndf_max",
    "starch_max",
    "ee_max",
    "conc_max",
    "conc_byprod_max",
    "other_wet_ingr_max",
    "forage_straw_max",
    "forage_fibrous_max",
    "molasses_max",
    "moist_forage_min",
    "nel_balance_max",
    "mp_balance_max",
]

EPS_DIV = 1e-12  # Safe divisor to avoid zero division in ratio math
EPS_TOL = 1e-9   # Tolerance for boundary comparisons

# Default ordering for severity labels (best -> worst)
DEFAULT_SEVERITY_LABELS: Iterable[str] = ("perfect", "good", "marginal", "infeasible")

# Higher weights = more severe penalties for violations
# Lower weights = more tolerance for violations

BASE_WEIGHTS = {
    "ca": 2.0,
    "p": 2.0,
    "energy_req": 1.5,
    "mp_req": 1.5,
    "nel_balance_max": 1.5,
    "mp_balance_max": 1.5,
    "ndf_max": 1.0,
    "ndf_for_min": 1.0,
    "starch_max": 1.0,
    "ee_max": 1.0,
    "ash_max": 0.5,
    "conc_max": 1.0,
    "conc_byprod_max": 1.0,
    "other_wet_ingr_max": 1.0,
    "forage_straw_max": 1.0,
    "forage_fibrous_max": 1.0,
    "moist_forage_min": 0.8,
    "molasses_max": 1.0,
}

DRY_WEIGHTS_OVERRIDE = {
    # Same as base; overrides kept for future tuning
}

HEIFER_WEIGHTS_OVERRIDE = {
    # Same as base; overrides kept for future tuning
}

SOFT_CONSTRAINT_PENALTIES_BASE = {
    # Soft/monitored constraints (default contributors to soft_penalty)
    "ca": {"weight": 2.5, "exp": 2},
    "p": {"weight": 2.5, "exp": 2},
    "ndf_max": {"weight": 1.0, "exp": 2},
    "starch_max": {"weight": 1.0, "exp": 2},
    "ee_max": {"weight": 1.0, "exp": 2},
    "conc_max": {"weight": 0.5, "exp": 2},  
    "moist_forage_min": {"weight": 1.5, "exp": 2},
    "nel_balance_max": {"weight": 1.0, "exp": 2},
    "mp_balance_max": {"weight": 1.0, "exp": 2},
}

# Explicitly define which constraints are hard vs soft by default.
# These lists can be overridden per profile if needed.
HARD_CONSTRAINTS = [
    "energy_req",
    "mp_req",
    "ndf_for_min",
    "ash_max",
    "conc_max",
    "conc_byprod_max",
    "other_wet_ingr_max",
    "forage_straw_max",
    "forage_fibrous_max",
    "molasses_max",
]

SOFT_CONSTRAINTS = list(SOFT_CONSTRAINT_PENALTIES_BASE.keys())

# Explicit hard/soft per physiological state (override-ready)
HARD_CONSTRAINTS_LACTATING = list(HARD_CONSTRAINTS)
SOFT_CONSTRAINTS_LACTATING = list(SOFT_CONSTRAINTS)

HARD_CONSTRAINTS_DRY = list(HARD_CONSTRAINTS)
SOFT_CONSTRAINTS_DRY = list(SOFT_CONSTRAINTS)

HARD_CONSTRAINTS_HEIFER = list(HARD_CONSTRAINTS)
SOFT_CONSTRAINTS_HEIFER = list(SOFT_CONSTRAINTS)

CONSTRAINT_INFO_BASE = {
    # CORE NUTRITIONAL CONSTRAINTS (min-type vs TARGET)
    "energy_req": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Energy Requirement",
        "short_name": "Energy",
        "unit": "Mcal/day",
        "perfect": (0, 5),        # 0-5% deviation = PERFECT (95-105% of target)
        "good": (5, 10),          # 5-10% deviation = GOOD (90-95% or 105-110% of target)
        "marginal": (10, 20),     # 10-20% deviation = MARGINAL (80-90% or 110-120% of target)
        "infeasible": (20, 100)   # >20% deviation = INFEASIBLE (<80% or >120% of target)
    },
    "mp_req": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Metabolizable Protein",
        "short_name": "Protein",
        "unit": "kg/day",
        "perfect": (0, 5),        # 0-5% deviation = PERFECT (95-105% of target)
        "good": (5, 10),          # 5-10% deviation = GOOD (90-95% or 105-110% of target)
        "marginal": (10, 20),     # 10-20% deviation = MARGINAL (80-90% or 110-120% of target)
        "infeasible": (20, 100)   # >20% deviation = INFEASIBLE (<80% or >120% of target)
    },
    "nel_balance_max": {
        "basis": "limit",
        "display_name": "Energy Balance (NEL)",
        "short_name": "NEL Balance",
        "unit": "Mcal/day",
        "perfect": (0, 5),
        "good": (5, 10),
        "marginal": (10, 20),
        "infeasible": (20, 100)
    },
    "mp_balance_max": {
        "basis": "limit",
        "display_name": "Metabolizable Protein Balance",
        "short_name": "MP Balance",
        "unit": "kg/day",
        "perfect": (0, 5),
        "good": (5, 10),
        "marginal": (10, 20),
        "infeasible": (20, 100)
    },
    "ca": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Calcium Requirement",
        "short_name": "Calcium",
        "unit": "kg/day",
        "perfect": (0, 6),        # Minerals more tolerant
        "good": (6, 12),
        "marginal": (12, 25),
        "infeasible": (25, 100)
    },
    "p": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Phosphorus Requirement",
        "short_name": "Phosphorus",
        "unit": "kg/day",
        "perfect": (0, 6),
        "good": (6, 12),
        "marginal": (12, 25),
        "infeasible": (25, 100)
    },
    "ndf_for_min": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Forage Fibre (NDF)",
        "short_name": "Forage NDF",
        "unit": "kg/day",
        "perfect": (0, 5),        # Fiber structure critical
        "good": (5, 10),
        "marginal": (10, 25),
        "infeasible": (25, 100)
    },

    # NUTRITIONAL LIMITS (max-type vs LIMIT) - handle excesses
    "ndf_max": {
        "basis": "limit",
        "display_name": "Total Fibre (NDF)",
        "short_name": "Total NDF",
        "unit": "kg/day",
        "perfect": (0, 2.5),      # Generally tolerable
        "good": (2.5, 5),
        "marginal": (5, 15),
        "infeasible": (15, 1e9)   # Add energy filler for dilution
    },
    "starch_max": {
        "basis": "limit",
        "display_name": "Starch Content",
        "short_name": "Starch",
        "unit": "kg/day",
        "perfect": (0, 2.5),
        "good": (2.5, 5),
        "marginal": (5, 10),      # Risk of acidosis
        "infeasible": (10, 1e9)
    },
    "ee_max": {  # ether extract (EE)
        "basis": "limit",
        "display_name": "Fat Content",
        "short_name": "Fat",
        "unit": "kg/day",
        "perfect": (0, 2.5),
        "good": (2.5, 5),
        "marginal": (5, 10),      # Fat tolerance higher
        "infeasible": (10, 1e9)
    },
    "ash_max": {
        "basis": "limit",
        "display_name": "Ash Content",
        "short_name": "Ash",
        "unit": "kg/day",
        "perfect": (0, 2.5),
        "good": (2.5, 5),
        "marginal": (5, 10),
        "infeasible": (10, 1e9)
    },

    # INGREDIENT CATEGORY CAPS (max-type vs LIMIT)
    "conc_max": {
        "basis": "limit",
        "display_name": "Total Concentrates",
        "short_name": "Concentrates",
        "unit": "kg/day",
        "perfect": (0, 5),        # Concentrate maximum
        "good": (5, 7),
        "marginal": (7, 10),
        "infeasible": (10, 1e9)
    },
    "conc_byprod_max": {
        "basis": "limit",
        "display_name": "By-Product Concentrates",
        "short_name": "By-Products",
        "unit": "kg/day",
        "perfect": (0, 2),        # Concentrate by-products
        "good": (2, 5),
        "marginal": (5, 10),
        "infeasible": (10, 1e9)
    },
    "other_wet_ingr_max": {
        "basis": "limit",
        "display_name": "Wet Ingredients",
        "short_name": "Wet Ingredients",
        "unit": "kg/day",
        "perfect": (0, 2),        # Other wet ingredients
        "good": (2, 5),
        "marginal": (5, 10),
        "infeasible": (10, 1e9)
    },
    "forage_straw_max": {
        "basis": "limit",
        "display_name": "Straw/Stover Content",
        "short_name": "Straw",
        "unit": "kg/day",
        "perfect": (0, 1e-9),        # Straw: no slack for perfect
        "good": (1e-9, 2),
        "marginal": (2, 5),
        "infeasible": (5, 1e9)
    },
    "forage_fibrous_max": {
        "basis": "limit",
        "display_name": "Low-Quality Forage",
        "short_name": "Low-Quality Forage",
        "unit": "kg/day",
        "perfect": (0, 1e-9),        # Low-quality forage: no slack for perfect
        "good": (1e-9, 2),
        "marginal": (2, 5),
        "infeasible": (5, 1e9)
    },

    # FORAGE MINIMUMS & SPECIAL CAPS (min-type vs TARGET)
    "moist_forage_min": {
        "basis": "target",
        "tolerance_type": "minimum",
        "display_name": "Fresh Forage",
        "short_name": "Fresh Forage",
        "unit": "kg/day",
        "perfect": (0, 5),        # Allow minor shortfall for perfect
        "good": (5, 10),
        "marginal": (10, 20),
        "infeasible": (20, 100)
    },
    "molasses_max": {
        "basis": "limit",
        "display_name": "Molasses",
        "short_name": "Molasses",
        "unit": "kg/day",
        "perfect": (0, 1),
        "good": (1, 3),
        "marginal": (3, 5),
        "infeasible": (5, 1e9),
    },
}

# Unified profile construction
BASE_PROFILE = {
    "thresholds": BASE_THRESHOLDS,
    "weights": BASE_WEIGHTS,
    "penalties": SOFT_CONSTRAINT_PENALTIES_BASE,
    "hard_constraints": HARD_CONSTRAINTS_LACTATING,
    "soft_constraints": SOFT_CONSTRAINTS_LACTATING,
    "info": CONSTRAINT_INFO_BASE,
}

CONSTRAINT_PROFILES: Dict[str, Dict] = {
    "Lactating Cow": {
        **_build_profile(BASE_PROFILE, {}),
        "hard_constraints": HARD_CONSTRAINTS_LACTATING,
        "soft_constraints": SOFT_CONSTRAINTS_LACTATING,
    },
    "Dry Cow": {
        **_build_profile(
            BASE_PROFILE,
            {
                "thresholds": DRY_THRESHOLDS_OVERRIDE,
                "weights": DRY_WEIGHTS_OVERRIDE,
            },
        ),
        "hard_constraints": HARD_CONSTRAINTS_DRY,
        "soft_constraints": SOFT_CONSTRAINTS_DRY,
    },
    "Heifer": {
        **_build_profile(
            BASE_PROFILE,
            {
                "thresholds": HEIFER_THRESHOLDS_OVERRIDE,
                "weights": HEIFER_WEIGHTS_OVERRIDE,
            },
        ),
        "hard_constraints": HARD_CONSTRAINTS_HEIFER,
        "soft_constraints": SOFT_CONSTRAINTS_HEIFER,
    },
}

# Purpose: Retrieve the constraint profile for a physiological state.
# Notes: Raises KeyError when the state is unknown to avoid silent fallbacks.
# The exception type is deliberately KeyError — several callers (optimization_core,
# feasibility, constraints_adequacy) catch KeyError to fall back or re-raise; do not
# change it to another type. "Baby Calf/Heifer" has no profile by design: it is
# short-circuited to a milk-feeding schedule before the optimizer (see
# services/diet_service.run_diet_recommendation), so reaching here for a calf is a
# routing bug and the clearer message helps diagnose it.
def get_constraint_profile(state: str, *, profiles: Dict[str, Dict] = None) -> Dict:
    profiles = profiles or CONSTRAINT_PROFILES
    if state not in profiles:
        raise KeyError(
            f"No optimizer constraint profile for physiological state '{state}'. "
            f"Supported: {', '.join(profiles)}. "
            f"(Baby Calf/Heifer is handled by the milk-feeding short-circuit, not the optimizer.)"
        )
    return profiles[state]
