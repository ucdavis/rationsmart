"""
Pre and Post optimization feasibility check.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Set, Tuple

from config import ALLOW_INFEASIBLE_REPORTS
from constraints_config import CONSTRAINT_PROFILES, DEFAULT_SEVERITY_LABELS, get_constraint_profile
from constraints_adequacy import classify_deviation

########################################################
# PRE-OPTIMIZATION FEASIBILITY CHECK
########################################################

# Purpose: Run feasibility checks before optimization to catch blocking issues.
# Notes: Validates thresholds and target DMI; returns status with errors/warnings.
# FUTURE VERSIONS MAY INDENTIFY/INTRODUCE MORE PRECHECKS TO AVOID UNNECESSARY OPTIMIZATION RUNS.

def feasibility_precheck(
    f_nd: Dict[str, Any],
    animal_requirements: Dict[str, Any],
    *,
    categories=None,  # kept for interface compatibility
    thr=None,
    margins=None,
):
    """
    Pre-optimization feasibility gate.

    Blocks on:
    - Missing constraint thresholds for the animal state
    - Non-positive target DMI

    """
    # Select animal state
    if "An_StatePhys" not in animal_requirements:
        raise KeyError("Missing required key: 'An_StatePhys' in animal_requirements")
    state_phys = animal_requirements["An_StatePhys"]

    if thr is None:
        try:
            thr = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES).get("thresholds", {})
        except KeyError:
            thr = {}
    
    # BLOCKS ON MISSING CONSTRAINT THRESHOLDS FOR THE ANIMAL STATE
    if not thr:
        return {
            "status": "error",
            "errors": [
                {
                    "constraint": "config",
                    "severity": "error",
                    "kind": "config",
                    "supply": None,
                    "target": None,
                    "ratio": None,
                    "hint": f"No constraint thresholds found for state '{state_phys}'",
                }
            ],
            "warnings": [],
        }

    # BLOCKS ON NON-POSITIVE TARGET DMI
    target_dmi = float(animal_requirements.get("Trg_Dt_DMIn", 0.0) or 0.0)
    if target_dmi <= 0:
        return {
            "status": "error",
            "errors": [
                {
                    "constraint": "dmi",
                    "severity": "error",
                    "kind": "config",
                    "supply": target_dmi,
                    "target": None,
                    "ratio": None,
                    "hint": "Target DMI must be positive for optimization to start.",
                }
            ],
            "warnings": [],
        }

    return {
        "status": "ok",
        "errors": [],
        "warnings": [],
        "context": {
            "state_phys": state_phys,
            "target_dmi": target_dmi,
        },
    }

########################################################
# POST-OPTIMIZATION FEASIBILITY CHECK
########################################################

def _is_finite_number(value: Any) -> bool:
    return value is not None and isinstance(value, (int, float)) and math.isfinite(value)


def _normalize_severity_label(raw: Any) -> str:
    allowed = tuple(DEFAULT_SEVERITY_LABELS)
    label = str(raw or "").lower()
    if label in allowed:
        return label
    # Missing/unknown severities are treated as worst for conservative ordering.
    return allowed[-1] if allowed else "infeasible"


def _select_magnitude(info: Dict[str, Any]) -> Tuple[float, str]:
    wv = info.get("weighted_violation")
    if _is_finite_number(wv):
        return float(wv), "weighted_violation"
    vr = info.get("violation_raw")
    if _is_finite_number(vr):
        return float(vr), "violation_raw"
    dp = info.get("deviation_pct")
    if _is_finite_number(dp):
        return float(dp), "deviation_pct"
    return 0.0, "violation_raw"


def _rank_top2_constraints(
    constraint_result: Dict[str, Any], hard_constraints: Set[str]
) -> List[Dict[str, Any]]:
    constraints = constraint_result.get("constraints", {}) if isinstance(constraint_result, dict) else {}
    if not isinstance(constraints, dict) or not constraints:
        return []

    severity_order = tuple(DEFAULT_SEVERITY_LABELS)
    sev_index = {label: i for i, label in enumerate(severity_order)}
    worst_rank = len(severity_order) - 1 if severity_order else 0

    candidates: List[Tuple[int, float, str, str, bool]] = []
    raw_info: Dict[str, Dict[str, Any]] = {}
    for name, info in constraints.items():
        if not isinstance(info, dict):
            info = {}
        sev = _normalize_severity_label(info.get("severity"))
        # Keep "top2" focused on degraded constraints only.
        if sev == "perfect":
            continue
        sev_rank = sev_index.get(sev, worst_rank)
        magnitude, magnitude_source = _select_magnitude(info)
        is_hard = name in hard_constraints
        candidates.append((sev_rank, magnitude, str(name), magnitude_source, is_hard))
        raw_info[str(name)] = {"severity": sev}

    candidates_sorted = sorted(candidates, key=lambda t: (-t[0], -t[1], t[2]))
    top2 = candidates_sorted[:2]

    out: List[Dict[str, Any]] = []
    for sev_rank, magnitude, name, magnitude_source, is_hard in top2:
        out.append(
            {
                "name": name,
                "severity": raw_info.get(name, {}).get("severity", severity_order[-1] if severity_order else "infeasible"),
                "magnitude": float(magnitude),
                "magnitude_source": magnitude_source,
                "is_hard": bool(is_hard),
            }
        )
    return out


def _safe_float(value: Any) -> Optional[float]:
    try:
        v = float(value)
    except Exception:
        return None
    return v if math.isfinite(v) else None


def _constraint_severity_from_info(
    name: str,
    info: Dict[str, Any],
    *,
    state_phys: str,
    profile_info: Dict[str, Any],
) -> Tuple[str, Optional[float]]:
    if not isinstance(info, dict):
        info = {}

    severity_raw = info.get("severity")
    deviation_pct = _safe_float(info.get("deviation_pct"))

    if severity_raw is None or str(severity_raw).strip() == "":
        if deviation_pct is not None:
            cfg = profile_info.get(name, {}) if isinstance(profile_info, dict) else {}
            try:
                severity_raw = classify_deviation(cfg or {}, float(deviation_pct))
            except Exception:
                severity_raw = None

    severity = _normalize_severity_label(severity_raw)
    return severity, deviation_pct


def is_violated(sev: str, violated_rule: str = "A") -> bool:
    sev = _normalize_severity_label(sev)
    if sev == "perfect":
        return False
    if violated_rule == "A":
        return True
    return sev in {"marginal", "infeasible"}


def _population_summary_no_best(
    state_phys: str,
    constraint_results_population: List[Dict[str, Any]],
    *,
    constraint_order: Optional[List[str]] = None,
    violated_rule: str = "A",
) -> Tuple[List[str], List[Dict[str, Any]]]:
    if not constraint_results_population:
        return (["No feasible solution found."], [])

    try:
        profile = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
    except Exception:
        profile = {}
    hard_constraints = list(profile.get("hard_constraints") or [])
    profile_info = profile.get("info", {}) if isinstance(profile.get("info"), dict) else {}

    order = list(constraint_order or []) or hard_constraints
    if not order:
        return (["No solution found."], [])

    violated_rule = str(violated_rule or "A").upper()
    if violated_rule not in {"A", "B"}:
        violated_rule = "A"

    n_pop = len(constraint_results_population)
    violated_candidates = 0
    worst_dev_per_violated_candidate: List[float] = []
    per_constraint = {name: {"viol_count": 0, "dev_sum": 0.0, "dev_n": 0} for name in order}

    for cr in constraint_results_population:
        constraints = cr.get("constraints", {}) if isinstance(cr, dict) else {}
        candidate_any = False
        candidate_worst_dev = None

        for name in order:
            info = constraints.get(name, {})
            sev, dev_pct = _constraint_severity_from_info(
                str(name),
                info if isinstance(info, dict) else {},
                state_phys=state_phys,
                profile_info=profile_info,
            )
            if not is_violated(sev, violated_rule):
                continue

            candidate_any = True
            if dev_pct is not None:
                candidate_worst_dev = dev_pct if candidate_worst_dev is None else max(candidate_worst_dev, dev_pct)

            agg = per_constraint.get(name)
            if agg is not None:
                agg["viol_count"] += 1
                if dev_pct is not None:
                    agg["dev_sum"] += float(dev_pct)
                    agg["dev_n"] += 1

        if candidate_any:
            violated_candidates += 1
            if candidate_worst_dev is not None:
                worst_dev_per_violated_candidate.append(float(candidate_worst_dev))

    freq_nonperfect = (violated_candidates / max(n_pop, 1)) * 100.0
    avg_dev = (sum(worst_dev_per_violated_candidate) / len(worst_dev_per_violated_candidate)) if worst_dev_per_violated_candidate else None

    ranked = []
    for name, agg in per_constraint.items():
        vc = int(agg["viol_count"])
        if vc <= 0:
            continue
        freq = (vc / max(n_pop, 1)) * 100.0
        avg_dev_c = (agg["dev_sum"] / agg["dev_n"]) if agg["dev_n"] else None
        ranked.append((freq, avg_dev_c if avg_dev_c is not None else -1.0, str(name), agg))
    ranked.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)

    worst_constraints = []
    for freq, avg_dev_c, name, agg in ranked[:2]:
        worst_constraints.append(
            {
                "name": name,
                "severity": "infeasible" if violated_rule == "B" else "marginal",
                "magnitude": float(avg_dev_c) if avg_dev_c is not None and avg_dev_c >= 0 else float(freq),
                "magnitude_source": "avg_deviation_pct" if avg_dev_c is not None and avg_dev_c >= 0 else "frequency_nonperfect",
                "is_hard": bool(name in set(hard_constraints)),
            }
        )

    msgs: List[str] = ["No solution found."]
    msgs.append(
        f"Population summary (rule {violated_rule}): {freq_nonperfect:.0f}% candidates had ≥1 violated hard constraint"
        + (f"; avg worst deviation among violated candidates: {avg_dev:.1f}%" if avg_dev is not None else "")
        + "."
    )
    if ranked:
        parts = []
        for freq, avg_dev_c, name, agg in ranked[:3]:
            disp = name
            try:
                prof = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
                info_map = prof.get("info", {}) if isinstance(prof.get("info"), dict) else {}
                meta = info_map.get(name, {})
                disp = meta.get("display_name") or meta.get("short_name") or name
            except Exception:
                disp = name
            if avg_dev_c is not None and avg_dev_c >= 0:
                parts.append(f"{disp} ({freq:.0f}% | avg dev {avg_dev_c:.1f}%)")
            else:
                parts.append(f"{disp} ({freq:.0f}%)")
        msgs.append("Most violations: " + "; ".join(parts) + ".")

    return msgs, worst_constraints


def feasibility_postcheck(
    state_phys: str,
    constraint_result: Optional[Dict[str, Any]],
    *,
    cfg: Optional[Dict[str, Any]] = None,
    has_result: bool = True,
    has_problem: bool = True,
    has_best: bool = True,
    constraint_results_population: Optional[List[Dict[str, Any]]] = None,
    constraint_order: Optional[List[str]] = None,
    violated_rule: str = "A",
) -> Dict[str, Any]:
    """
    Authoritative post-optimization feasibility contract.

    Returns exactly:
      - allow_report: bool
      - status: str (SUCCESS | MARGINAL | INFEASIBLE | ERROR_PRECHECK | ERROR_NO_RESULT | ERROR_NO_BEST)
      - messages: list[str]
      - worst_constraints: list[dict] (0-2 entries, stable keys)
    """
    cfg = cfg or {}
    precheck = cfg.get("precheck") if isinstance(cfg, dict) else None

    # Precheck errors block report generation.
    if isinstance(precheck, dict) and precheck.get("status") == "error":
        messages = list(precheck.get("messages") or [])
        if not messages:
            messages = ["Precheck found blocking issues."]
        return {
            "allow_report": False,
            "status": "ERROR_PRECHECK",
            "messages": messages,
            "worst_constraints": [],
        }

    # Missing results/problem block report generation.
    if not has_result or not has_problem:
        return {
            "allow_report": False,
            "status": "ERROR_NO_RESULT",
            "messages": ["Optimization did not return a solution."],
            "worst_constraints": [],
        }

    # Missing best blocks report generation (summarize blockers when available).
    if not has_best:
        messages: List[str] = []
        top2: List[Dict[str, Any]] = []
        if isinstance(constraint_results_population, list) and constraint_results_population:
            messages, top2 = _population_summary_no_best(
                state_phys,
                constraint_results_population,
                constraint_order=constraint_order,
                violated_rule=violated_rule,
            )
        else:
            hard_constraints_list = []
            try:
                profile = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
                hard_constraints_list = list(profile.get("hard_constraints") or [])
            except Exception:
                hard_constraints_list = []
            hard_set = set(hard_constraints_list)
            top2 = _rank_top2_constraints(constraint_result or {}, hard_set) if constraint_result else []
            messages = ["No solution found."]
        
        try:
            prof = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
        except Exception:
            prof = {}
        info_map = prof.get("info", {}) if isinstance(prof.get("info"), dict) else {}
        
        b_msgs: List[str] = [
            "Diet status: No diet found within selected limits",
            "Key issues:",
        ]
        if top2:
            for i, w in enumerate(list(top2)[:2], start=1):
                name = str(w.get("name", "") or "")
                meta = info_map.get(name, {}) if isinstance(info_map.get(name), dict) else {}
                label = meta.get("display_name") or meta.get("short_name") or name
                basis = str(meta.get("basis") or "").lower()
                tol = str(meta.get("tolerance_type") or meta.get("tolerance") or "").lower()
                direction = "below minimum" if (tol == "minimum" or basis == "target") else ("above maximum" if basis == "limit" else "not meeting target")
                b_msgs.append(f"{label}: {direction}")

        return {
            "allow_report": False,
            "status": "ERROR_NO_BEST",
            "messages": b_msgs,
            "worst_constraints": top2,
        }

    try:
        profile = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
        hard_constraints = set(profile.get("hard_constraints") or [])
    except Exception:
        hard_constraints = set()

    dev = bool(cfg.get("allow_infeasible_reports", ALLOW_INFEASIBLE_REPORTS))

    constraints = (constraint_result or {}).get("constraints", {}) if isinstance(constraint_result, dict) else {}
    hard_severities: List[str] = []
    for name in hard_constraints:
        info = constraints.get(name, {})
        hard_severities.append(_normalize_severity_label(info.get("severity") if isinstance(info, dict) else None))

    hard_has_infeasible = any(sev == "infeasible" for sev in hard_severities)
    hard_marginal_count = sum(1 for sev in hard_severities if sev == "marginal")
    top2_all = _rank_top2_constraints(constraint_result or {}, hard_constraints)

    if hard_has_infeasible or (hard_marginal_count > 2):
        allow_report = bool(dev)
        messages: List[str] = [
            "Diet status: Below requirements / selected limits",
            "Key issues:",
        ]
        if top2_all:
            try:
                prof = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
                info_map = prof.get("info", {}) if isinstance(prof.get("info"), dict) else {}
                for w in top2_all:
                    name = str(w.get("name", "") or "")
                    meta = info_map.get(name, {})
                    label = meta.get("display_name") or meta.get("short_name") or name
                    basis = str(meta.get("basis") or "").lower()
                    tol = str(meta.get("tolerance_type") or meta.get("tolerance") or "").lower()
                    direction = "below minimum" if (tol == "minimum" or basis == "target") else ("above maximum" if basis == "limit" else "not meeting target")
                    messages.append(f"{label}: {direction} ({w.get('magnitude_source')}={float(w.get('magnitude') or 0.0):.4g})")
            except Exception:
                pass
        if allow_report and dev:
            messages.append("Dev mode report allowed.")
        return {
            "allow_report": allow_report,
            "status": "INFEASIBLE",
            "messages": messages,
            "worst_constraints": top2_all,
        }
    elif any(sev == "marginal" for sev in hard_severities):
        messages: List[str] = [
            "Diet status: Outside limits",
            "Key issues:",
        ]
        if top2_all:
            try:
                prof = get_constraint_profile(state_phys, profiles=CONSTRAINT_PROFILES)
                info_map = prof.get("info", {}) if isinstance(prof.get("info"), dict) else {}
                for w in top2_all:
                    name = str(w.get("name", "") or "")
                    meta = info_map.get(name, {})
                    label = meta.get("display_name") or meta.get("short_name") or name
                    basis = str(meta.get("basis") or "").lower()
                    tol = str(meta.get("tolerance_type") or meta.get("tolerance") or "").lower()
                    direction = "below minimum" if (tol == "minimum" or basis == "target") else ("above maximum" if basis == "limit" else "not meeting target")
                    messages.append(f"{label}: {direction} ({w.get('magnitude_source')}={float(w.get('magnitude') or 0.0):.4g})")
            except Exception:
                pass
        return {
            "allow_report": True,
            "status": "MARGINAL",
            "messages": messages,
            "worst_constraints": top2_all,
        }
    else:
        return {
            "allow_report": True,
            "status": "SUCCESS",
            "messages": [],
            "worst_constraints": [],
        }
