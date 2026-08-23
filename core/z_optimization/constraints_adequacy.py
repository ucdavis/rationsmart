"""
Centralized constraint adequacy evaluator.

This module exposes:
- violation_ratio: compute raw violation (positive = bad).
- classify_deviation: map deviation_pct to a severity band.
- evaluate_single_constraint: score one constraint (ratio, severity, slack, g).
- compute_adequacy: score all constraints and return both per-constraint data
  and aggregated outputs (hard_g, soft_penalty, details).

"""

from __future__ import annotations
from typing import Any, Dict, Iterable, Optional, Sequence, Tuple
import numpy as np
from .constraints_config import (
    CONSTRAINT_ORDER,
    CONSTRAINT_PROFILES,
    DEFAULT_SEVERITY_LABELS,
    EPS_DIV,
    EPS_TOL,
    HARD_CONSTRAINTS,
    get_constraint_profile,
)
from .utilities import classify_feed_categories

# Purpose: Compute positive violation ratio relative to target/limit.
# Notes: Returns -1.0 when values are missing or compliant.
#Raw violation ratio (fraction of target/limit); positive = violation, <=0 = ok/missing.
def violation_ratio(basis: str, tolerance_type: str, supply: float, target: float) -> float:

    if target is None or target <= 0 or supply is None:
        return -1.0

    if basis == "target":
        if tolerance_type == "minimum":
            violation = (target - supply) / max(target, EPS_DIV)
        else:  # both/symmetric
            violation = abs(supply - target) / max(target, EPS_DIV)
    else:  # basis == "limit"
        violation = (supply - target) / max(target, EPS_DIV)

    return violation if violation > 0 else -1.0


# Purpose: Map a deviation percentage to a severity band using configured ranges.
# Notes: Falls back to the last label or 'infeasible' when ranges are missing.
def classify_deviation(config: dict, deviation_pct: float, *, severity_labels: Optional[Iterable[str]] = None) -> str:

    order = tuple(severity_labels or DEFAULT_SEVERITY_LABELS)
    severity = order[-1] if order else "infeasible"
    for level in order:
        if level in config:
            lo, hi = config[level]
            if level == order[0]:  # treat first label as tightest band
                if (deviation_pct + EPS_TOL) >= lo and (deviation_pct - EPS_TOL) <= hi:
                    severity = level
                    break
            else:
                if lo <= deviation_pct + EPS_TOL < hi + EPS_TOL:
                    severity = level
                    break
    return severity


# Purpose: Score a single constraint and compute violation, severity, slack, and ratios.
# Notes: Returns a dict with raw and weighted metrics; treats missing as infeasible per treat_missing_as.
def evaluate_single_constraint(
    *,
    supply: Optional[float],
    target: Optional[float],
    basis: str = "target",
    tolerance_type: str = "both",
    weight: float = 1.0,
    cfg: Optional[Dict[str, Any]] = None,
    severity_labels: Optional[Iterable[str]] = None,
    margins: Optional[Dict[str, float]] = None,
    treat_missing_as: float = -1.0,
) -> Dict[str, Any]:

    basis = str(basis or "target").lower()
    tolerance_type = str(tolerance_type or "both").lower()
    severity_order = tuple(severity_labels or DEFAULT_SEVERITY_LABELS)
    severity_rank_map = {label: idx for idx, label in enumerate(severity_order)}

    result: Dict[str, Any] = {
        "supply": supply,
        "target": target,
        "basis": basis,
        "type": "min" if tolerance_type == "minimum" or basis == "target" else "max",
        "weight": float(weight if weight is not None else 1.0),
        "violation_raw": treat_missing_as,
        "weighted_violation": treat_missing_as,
        "deviation_pct": 0.0,
        "severity": None,
        "severity_rank": severity_rank_map.get("infeasible", len(severity_order)),
        "slack_raw": None,
        "g_value": None,
        "ratio": None,
        "margin_flag": None,
    }

    if target is None or target <= 0 or supply is None:
        return result

    violation_raw = violation_ratio(basis, tolerance_type, supply, target)
    deviation_pct = max(violation_raw, 0.0) * 100.0
    severity = classify_deviation(cfg or {}, deviation_pct, severity_labels=severity_order) if cfg is not None else "infeasible"
    severity_rank = severity_rank_map.get(severity, severity_rank_map.get("infeasible", len(severity_order)))

    slack_raw = (target - supply) / max(target, EPS_DIV)
    if result["type"] == "min":
        g_raw = slack_raw
    else:
        g_raw = (supply - target) / max(target, EPS_DIV)

    weighted_violation = violation_raw * result["weight"] if violation_raw > 0 else violation_raw

    ratio = supply / max(target, EPS_DIV)
    margin_flag = None
    if margins is not None:
        if result["type"] == "min":
            block = margins.get("block_below")
            warn = margins.get("warn_below")
            if block is not None and ratio < block:
                margin_flag = "error"
            elif warn is not None and ratio < warn:
                margin_flag = "warning"
            else:
                margin_flag = "ok"
        else:
            block = margins.get("block_above")
            warn = margins.get("warn_above")
            if block is not None and ratio > block:
                margin_flag = "error"
            elif warn is not None and ratio > warn:
                margin_flag = "warning"
            else:
                margin_flag = "ok"

    result.update(
        {
            "violation_raw": violation_raw,
            "weighted_violation": weighted_violation,
            "deviation_pct": deviation_pct,
            "severity": severity,
            "severity_rank": severity_rank,
            "slack_raw": slack_raw,
            "g_value": g_raw * result["weight"] if g_raw is not None else None,
            "ratio": ratio,
            "margin_flag": margin_flag,
        }
    )

    return result


# Purpose: Provide a boolean mask from categories with a fallback default.
# Notes: Ensures masks are numpy boolean arrays when categories are absent.
def _mask_or(categories: Optional[Dict[str, Any]], categories_key: str, fallback: np.ndarray) -> np.ndarray:
    if categories is None:
        return np.asarray(fallback, dtype=bool)
    mask = categories.get(categories_key)
    if mask is None:
        return np.asarray(fallback, dtype=bool)
    return np.asarray(mask, dtype=bool)


# Purpose: Evaluate all constraints for a diet and aggregate hard/soft metrics.
# Notes: Raises when required config is missing; returns per-constraint details and aggregates.
def compute_adequacy(
    state_phys: str,
    diet_supply: Sequence[float],
    animal_requirements: Dict[str, Any],
    quantities: Sequence[float],
    f_nd: Dict[str, Any],
    *,
    categories: Optional[Dict[str, Any]] = None,
    thresholds: Optional[Dict[str, float]] = None,
    weights: Optional[Dict[str, float]] = None,
    constraint_info: Optional[Dict[str, Any]] = None,
    constraint_order: Optional[Iterable[str]] = None,
    include: Optional[Iterable[str]] = None,
    exclude: Optional[Iterable[str]] = None,
    severity_labels: Optional[Iterable[str]] = None,
    detail: str = "full",  # "fast" | "summary" | "full"
    margins: Optional[Dict[str, float]] = None,
    supplies_override: Optional[Dict[str, Tuple[float, float]]] = None,
    use_hard_balance: bool = False,
    penalize_hard_as_soft: bool = False,
    penalty_cfg: Optional[Dict[str, Any]] = None,
    hard_constraints: Optional[Iterable[str]] = None,
    soft_constraints: Optional[Iterable[str]] = None,
    is_heifer: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Compute adequacy for selected constraints, and also
    produce aggregate outputs (hard_g, soft_penalty, details).

    Args:
        state_phys: Physiological state (used to select profiles when thresholds/info are not provided).
        diet_supply: Nutrient supply vector returned by rsm_diet_supply.
        animal_requirements: Requirement dictionary.
        quantities: Ingredient quantities (kg DM).
        f_nd: Feed nutrient dictionary.
        categories: Optional precomputed category masks; auto-classified when absent.
        thresholds: Optional explicit thresholds; falls back to profile.
        weights: Optional weight map; falls back to profile.
        constraint_info: Optional constraint metadata; falls back to profile.
        constraint_order: Evaluation order; defaults to CONSTRAINT_ORDER.
        include: Optional iterable of constraint names to include.
        exclude: Optional iterable of constraint names to exclude.
        severity_labels: Optional severity ordering override.
        detail: "fast" | "summary" | "full"; controls payload richness and aggregation.
        margins: Optional margin config (block/warn) forwarded to evaluate_constraint.
        supplies_override: Optional map {name: (supply, target)} to bypass automatic supply building.
        use_hard_balance: When True, treat balance constraints as hard.
        penalize_hard_as_soft: Apply soft penalty on hard constraints when True.
        penalty_cfg: Penalty configuration; defaults to profile penalties.
        hard_constraints: Optional explicit hard-constraint list override.
        soft_constraints: Optional explicit soft-constraint list override.
        is_heifer: Optional pre-calculated heifer flag.

    Returns:
        {
            "order": [...],
            "constraints": {
                name: {
                    "supply": ...,
                    "target": ...,
                    "violation_raw": ...,
                    "weighted_violation": ...,
                    "severity": ...,
                    "severity_rank": ...,
                    "ratio": ...,
                    "slack_raw": ...,
                    "g_value": ...,
                    "basis": ...,
                    "type": ...,
                    "unit": ...,
                    "weight": ...,
                    "margin_flag": ...,
                },
                ...
            },
            "hard_g": np.ndarray,
            "soft_penalty": float,
            "details": {},
            "total_violation": float,
            "hard_violation_count": int,
            "hard_violation_sum": float,
            "max_severity_rank": int,
            "hard_slack_raw": np.ndarray (only in full detail),
        }
    """
    detail_mode = str(detail or "full").lower()
    if detail_mode not in {"fast", "summary", "full"}:
        detail_mode = "full"

    categories = categories or classify_feed_categories(f_nd)

    profile = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
    thr = thresholds if thresholds is not None else profile.get("thresholds", {})
    wt = weights if weights is not None else profile.get("weights", {})
    info = constraint_info if constraint_info is not None else profile.get("info", {})
    penalty_cfg = penalty_cfg if penalty_cfg is not None else profile.get("penalties", {})
    profile_hard = profile.get("hard_constraints", None)
    profile_soft = profile.get("soft_constraints", None)

    if not thr:
        raise ValueError(f"Missing constraint thresholds for state '{state_phys}'")
    if not wt:
        raise ValueError(f"Missing constraint weights for state '{state_phys}'")
    if not info:
        raise ValueError(f"Missing constraint info for state '{state_phys}'")

    constraint_order = CONSTRAINT_ORDER if constraint_order is None else list(constraint_order)
    inc_set = set(name.strip() for name in include) if include else None
    exc_set = set(name.strip() for name in exclude) if exclude else set()

    if supplies_override is not None:
        supplies = supplies_override
    else:
        dmi_supply = float(diet_supply[0])
        if is_heifer is None:
            state_lower = str(state_phys).lower()
            is_heifer = "heifer" in state_lower and "lact" not in state_lower
        
        energy_supply = float(diet_supply[11]) if is_heifer else float(diet_supply[1])
        protein_supply = float(diet_supply[2])
        ca_supply = float(diet_supply[3])
        p_supply = float(diet_supply[4])
        ndf_supply = float(diet_supply[5])
        ndf_for_supply = float(diet_supply[6])
        starch_supply = float(diet_supply[7])
        ee_supply = float(diet_supply[8])
        ash_supply = float(diet_supply[9])
        nel_balance = float(diet_supply[12])
        mp_req_dyn = float(diet_supply[13])
        mp_balance = float(diet_supply[14])

        energy_req = animal_requirements.get("An_ME") if is_heifer else animal_requirements.get("An_NEL")
        protein_req = mp_req_dyn
        ca_req = animal_requirements.get("An_Ca_req")
        p_req = animal_requirements.get("An_P_req")

        quantities_arr = np.asarray(quantities, dtype=float)

        # Optimization: Only calculate clean text if masks are missing from categories
        fd_type_lower = None
        fd_name_lower = None

        if "mask_conc_all" in categories:
            mask_conc = categories["mask_conc_all"]
        else:
            fd_type_lower = np.char.strip(np.char.lower(np.array(f_nd.get("Fd_Type", [""] * len(quantities_arr)), dtype=str)))
            mask_conc = fd_type_lower == "concentrate"

        if "mask_molasses" in categories:
            mask_molasses = categories["mask_molasses"]
        else:
            fd_name_lower = np.char.strip(np.char.lower(np.array(f_nd.get("Fd_Name", [""] * len(quantities_arr)), dtype=str)))
            mask_molasses = np.char.find(fd_name_lower, "molasses") >= 0

        mask_byprod = _mask_or(categories, "mask_wet_byprod", np.zeros_like(quantities_arr, dtype=bool))
        mask_wet_other = _mask_or(categories, "mask_wet_other", np.zeros_like(quantities_arr, dtype=bool))
        mask_lqf = _mask_or(categories, "mask_lqf", np.zeros_like(quantities_arr, dtype=bool))
        mask_tree_legume = _mask_or(categories, "mask_tree_legume", np.zeros_like(quantities_arr, dtype=bool))

        conc_kg = float(np.sum(quantities_arr[mask_conc])) if np.any(mask_conc) else 0.0
        molasses_kg = float(np.sum(quantities_arr[mask_molasses])) if np.any(mask_molasses) else 0.0
        byprod_kg = float(np.sum(quantities_arr[mask_byprod])) if np.any(mask_byprod) else 0.0
        wet_other_kg = float(np.sum(quantities_arr[mask_wet_other])) if np.any(mask_wet_other) else 0.0
        lqf_kg = float(np.sum(quantities_arr[mask_lqf])) if np.any(mask_lqf) else 0.0
        tree_legume_kg = float(np.sum(quantities_arr[mask_tree_legume])) if np.any(mask_tree_legume) else 0.0

        try:
            ndf_for_target = thr["ndf_for_min"] * dmi_supply
            ash_limit = thr["ash_max"] * dmi_supply
            ndf_limit = thr["ndf_max"] * dmi_supply
            starch_limit = thr["starch_max"] * dmi_supply
            ee_limit = thr["ee_max"] * dmi_supply
            conc_limit = thr["conc_max"] * dmi_supply
            conc_byprod_limit = thr["conc_byprod_max"] * dmi_supply
            other_wet_limit = thr["other_wet_ingr_max"] * dmi_supply
            fibrous_limit = thr["forage_fibrous_max"] * dmi_supply
            tree_legume_limit = thr["tree_legume_max"] * dmi_supply
            molasses_limit = thr["molasses_max"] * dmi_supply
            nel_balance_limit = thr["nel_balance_max"]
            mp_balance_limit = thr["mp_balance_max"]
        except KeyError as exc:
            raise KeyError(f"Missing constraint threshold '{exc.args[0]}' for state '{state_phys}'") from exc

        supplies = {
            "energy_req": (energy_supply, energy_req),
            "mp_req": (protein_supply, protein_req),
            "ca": (ca_supply, ca_req),
            "p": (p_supply, p_req),
            "ndf_for_min": (ndf_for_supply, ndf_for_target),
            "ash_max": (ash_supply, ash_limit),
            "ndf_max": (ndf_supply, ndf_limit),
            "starch_max": (starch_supply, starch_limit),
            "ee_max": (ee_supply, ee_limit),
            "conc_max": (conc_kg, conc_limit),
            "conc_byprod_max": (byprod_kg, conc_byprod_limit),
            "other_wet_ingr_max": (wet_other_kg, other_wet_limit),
            "forage_fibrous_max": (lqf_kg, fibrous_limit),
            "nel_balance_max": (nel_balance, nel_balance_limit),
            "mp_balance_max": (mp_balance, mp_balance_limit),
            "molasses_max": (molasses_kg, molasses_limit),
            "tree_legume_max": (tree_legume_kg, tree_legume_limit),
        }

    if hard_constraints is not None:
        hard_keys = set(hard_constraints)
    elif profile_hard is not None:
        hard_keys = set(profile_hard)
    else:
        hard_keys = set(HARD_CONSTRAINTS)
    balance_keys = {"nel_balance_max", "mp_balance_max"}
    if use_hard_balance:
        hard_keys = hard_keys | balance_keys

    if soft_constraints is not None:
        soft_keys = set(soft_constraints)
    elif profile_soft is not None:
        soft_keys = set(profile_soft)
    else:
        soft_keys = set(penalty_cfg.keys())
    if use_hard_balance:
        soft_keys = soft_keys - balance_keys
    if not penalize_hard_as_soft:
        # Ensure hard constraints are excluded from soft penalties unless explicitly requested
        soft_keys = soft_keys - hard_keys

    severity_labels = tuple(severity_labels or ("perfect", "good", "marginal", "infeasible"))

    results: Dict[str, Any] = {}
    hard_g = []
    hard_slack_raw = []
    details = {} if detail_mode != "fast" else None
    soft_penalty = 0.0
    hard_violation_count = 0
    hard_violation_sum = 0.0
    max_severity_rank = 0

    for name in constraint_order:
        if inc_set is not None and name not in inc_set:
            continue
        if name in exc_set:
            continue
        cfg = info.get(name, {})
        if not cfg:
            raise ValueError(f"Missing constraint config for '{name}' in state '{state_phys}'")
        supply, target = supplies.get(name, (None, None))
        basis = cfg.get("basis", "target")
        tolerance_type = cfg.get("tolerance_type", cfg.get("tolerance", "both"))
        if name in {"energy_req", "mp_req"}:
            tolerance_type = "minimum"

        eval_res = evaluate_single_constraint(
            supply=supply,
            target=target,
            basis=basis,
            tolerance_type=tolerance_type,
            weight=wt.get(name, 1.0),
            cfg=cfg,
            severity_labels=severity_labels,
            margins=margins,
        )

        if eval_res["ratio"] is None:
            raise ValueError(
                f"Missing or invalid target/supply for constraint '{name}' (supply={supply}, target={target})"
            )

        if detail_mode == "summary":
            results[name] = {
                "supply": eval_res["supply"],
                "target": eval_res["target"],
                "violation_raw": eval_res["violation_raw"],
                "weighted_violation": eval_res["weighted_violation"],
                "severity": eval_res["severity"],
                "severity_rank": eval_res["severity_rank"],
                "ratio": eval_res["ratio"],
                "margin_flag": eval_res.get("margin_flag"),
            }
        else:
            results[name] = {
                "supply": eval_res["supply"],
                "target": eval_res["target"],
                "violation_raw": eval_res["violation_raw"],
                "weighted_violation": eval_res["weighted_violation"],
                "severity": eval_res["severity"],
                "severity_rank": eval_res["severity_rank"],
                "ratio": eval_res["ratio"],
                "slack_raw": eval_res["slack_raw"],
                "g_value": eval_res["g_value"],
                "basis": basis,
                "type": eval_res["type"],
                "unit": cfg.get("unit", ""),
                "weight": wt.get(name, 1.0),
                "margin_flag": eval_res.get("margin_flag"),
            }

        violation_raw = results[name]["violation_raw"]
        weighted_violation = results[name]["weighted_violation"]
        severity_rank = results[name]["severity_rank"]
        max_severity_rank = max(max_severity_rank, severity_rank)

        if detail_mode == "fast":
            severity_value = 0
            unit = ""
        else:
            severity_value = severity_rank
            unit = cfg.get("unit", "")

        if detail_mode != "fast":
            if detail_mode == "summary":
                details[name] = {
                    "supply": results[name]["supply"],
                    "target": results[name]["target"],
                    "violation_raw": max(violation_raw, 0.0),
                    "weighted_violation": max(weighted_violation, 0.0),
                }
            else:
                details[name] = {
                    "supply": results[name]["supply"],
                    "target": results[name]["target"],
                    "violation_raw": max(violation_raw, 0.0),
                    "weighted_violation": max(weighted_violation, 0.0),
                    "severity": results[name]["severity"],
                    "basis": basis,
                    "type": results[name]["type"],
                    "unit": unit,
                }

        if name in hard_keys:
            if weighted_violation > 0:
                hard_violation_count += 1
                hard_violation_sum += weighted_violation
            g_value = results[name]["g_value"]
            if g_value is None:
                hard_g.append(-1.0)
            else:
                hard_g.append(g_value if g_value > 0 else min(g_value, 0.0))
            if detail_mode == "full":
                hard_slack_raw.append(results[name]["slack_raw"])
        else:
            hard_g.append(-1.0)
            if detail_mode == "full":
                hard_slack_raw.append(results[name]["slack_raw"])

        apply_soft = name in soft_keys or (penalize_hard_as_soft and name in hard_keys)
        if apply_soft and violation_raw > 0:
            cfg_pen = penalty_cfg.get(name)
            if cfg_pen is None and penalize_hard_as_soft and name in hard_keys:
                # Fallback penalty when opting to penalize hard constraints without explicit config
                cfg_pen = {"weight": 1.0, "exp": 2}
            if cfg_pen is None:
                raise ValueError(f"Missing penalty config for soft constraint '{name}'")
            if name not in wt:
                raise ValueError(f"Missing weight for constraint '{name}' in weights for state '{state_phys}'")
            soft_penalty += (
                cfg_pen.get("weight", 1.0) * wt.get(name, 1.0) * (violation_raw ** cfg_pen.get("exp", 2))
            )

    hard_g_arr = np.asarray(hard_g, dtype=float)
    total_violation = float(np.sum(np.clip(hard_g_arr, 0.0, None)))

    aggregate = {
        "hard_g": hard_g_arr,
        "soft_penalty": float(soft_penalty),
        "details": details if details is not None else {},
        "total_violation": total_violation,
        "hard_violation_count": int(hard_violation_count),
        "hard_violation_sum": float(hard_violation_sum),
        "max_severity_rank": int(max(max_severity_rank, severity_value)),
    }
    if detail_mode == "full":
        aggregate["hard_slack_raw"] = np.asarray(hard_slack_raw, dtype=float)

    return {"order": constraint_order, "constraints": results, **aggregate}

# Purpose: Extract high-level violation counts and costs from a constraint result.
# Notes: Returns empty defaults when input is not a dict.
def summarize_constraint_result(cr: Dict[str, Any]) -> Dict[str, Any]:
    """
    Lightweight constraint summary: counts/sums/severity and cost fields only.
    """
    if not isinstance(cr, dict):
        return {}
    return {
        "hard_violation_count": cr["hard_violation_count"],
        "hard_violation_sum": cr["hard_violation_sum"],
        "max_severity_rank": cr["max_severity_rank"],
        "total_violation": cr["total_violation"],
        "soft_penalty": cr["soft_penalty"],
        "raw_cost": cr["raw_cost"],
        "penalized_cost": cr["penalized_cost"],
    }
