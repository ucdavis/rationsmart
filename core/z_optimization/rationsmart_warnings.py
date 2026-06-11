"""
User messaging helpers for the pre-optimization feasibility check.

"""

from __future__ import annotations
from typing import Any, Dict, List, Tuple

import numpy as np
from constraints_config import DEFAULT_SEVERITY_LABELS, get_constraint_profile

########################################################
# HELPER FUNCTIONS
########################################################

# Purpose: Resolve a human-friendly display name for a constraint.
# Notes: Falls back to the raw constraint name when metadata is missing.
def _get_display_name(constraint_name: str, state_phys: str) -> str:
    profile = get_constraint_profile(state_phys)
    info = profile.get("info", {}).get(constraint_name, {}) if isinstance(profile.get("info"), dict) else {}
    # Prefer long display name; fall back to short name only if needed.
    return info.get("display_name") or info.get("short_name") or constraint_name

########################################################
# MAIN FUNCTIONS
########################################################

# Purpose: Summarize precheck issues into concise status/messages payload.
# Notes: Formats errors/warnings directly from the feasibility precheck result.
def pre_feasibility_warnings(precheck_result: Dict[str, Any], state_phys: str) -> Dict[str, Any]:

    if not isinstance(precheck_result, dict):
        return {"status": "unknown", "messages": [], "issues": []}

    status = precheck_result.get("status", "ok")
    errors_raw = precheck_result.get("errors", []) or []
    warnings_raw = precheck_result.get("warnings", []) or []

    messages: List[str] = []
    if errors_raw:
        messages = [
            f"{err.get('constraint', 'config')}: {err.get('hint') or 'Precheck issue detected.'}"
            for err in errors_raw
        ]
    elif warnings_raw:
        messages = [
            f"{warn.get('constraint', 'config')}: {warn.get('hint') or 'Precheck issue detected.'}"
            for warn in warnings_raw
        ]

    return {
        "status": status,
        "messages": messages,
        "issues": list(errors_raw) + list(warnings_raw),
    }


# Purpose: Summarize post-optimization constraint outcomes into user-facing status/messages payload.
# Notes: Picks worst severities and returns status plus message list.
def post_feasibility_warnings(
    constraint_result: Dict[str, Any],
    constraint_details: Dict[str, Any],
    state_phys: str,
    thresholds: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:

    if not isinstance(constraint_result, dict):
        return {"status": "unknown", "messages": []}

    details = constraint_result.get("details") or constraint_details or {}
    if not isinstance(details, dict) or not details:
        return {"status": "unknown", "messages": []}

    profile = get_constraint_profile(state_phys)
    hard_set = set(profile.get("hard_constraints") or [])
    info_map = profile.get("info", {}) if isinstance(profile.get("info"), dict) else {}
    thr = thresholds if thresholds is not None else (profile.get("thresholds", {}) if isinstance(profile.get("thresholds"), dict) else {})
    # Constraints whose threshold is a fraction of DMI (targets/limits computed as thr[name] * DMI in compute_adequacy).
    dmi_scaled = {
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
        "moist_forage_min",
        "molasses_max",
    }

    # entries: (severity_rank, magnitude, name, info, is_hard)
    entries: List[Tuple[int, float, str, Dict[str, Any], bool]] = []
    severity_order = tuple(DEFAULT_SEVERITY_LABELS)
    severity_index = {label: idx for idx, label in enumerate(severity_order)}

    for name, info in details.items():
        if not isinstance(info, dict):
            continue
        severity = str(info.get("severity", "perfect")).lower()
        # Only message when deviation is meaningfully outside range:
        # ignore "perfect" even if there is a tiny numeric violation.
        if severity not in {"good", "marginal", "infeasible"}:
            continue
        # Only consider actual violations for messaging (avoid "degraded" but compliant entries).
        try:
            violation_raw = float(info.get("violation_raw", 0.0) or 0.0)
        except Exception:
            violation_raw = 0.0
        if violation_raw <= 0:
            continue
        sev_rank = severity_index.get(severity, len(severity_order) - 1)
        weighted_v = float(info.get("weighted_violation", info.get("violation_raw", 0.0)) or 0.0)
        is_hard = str(name) in hard_set
        entries.append((sev_rank, weighted_v, str(name), info, bool(is_hard)))

    if not entries:
        # Requirement: if diet is feasible, no messages.
        return {"status": "perfect", "messages": []}

    # Split violations into Critical (hard) vs Advisory (soft) for user messaging.
    has_critical = any(is_hard for _, _, _, _, is_hard in entries)
    headline = (
        "Below requirements / outside selected limits"
        if has_critical
        else "Outside limits"
    )
    status_out = "critical" if has_critical else "advisory"

    # Rank by worst severity, then by magnitude.
    ranked = sorted(entries, key=lambda e: (-e[0], -e[1], e[2]))
    top4 = ranked[:4]


    messages: List[str] = [f"Diet status: {headline}"]
    messages.append("Critical issues:" if has_critical else "Violated parameters:")

    for i, (_, _, name, info, is_hard) in enumerate(top4, start=1):
        disp = _get_display_name(name, state_phys)
        bound_type = info.get("type")
        if bound_type not in {"min", "max"}:
            basis = str(info.get("basis") or (info_map.get(name, {}) if isinstance(info_map.get(name), dict) else {}).get("basis") or "").lower()
            if basis == "limit":
                bound_type = "max"
            else:
                bound_type = "min"
        direction = "below minimum" if bound_type == "min" else "above maximum"

        # units in % of DM for DMI-scaled constraints.
        supply = info.get("supply")
        target = info.get("target")
        thr_val = thr.get(name) if isinstance(thr, dict) else None

        supply_f = None
        target_f = None
        try:
            supply_f = float(supply)
        except Exception:
            supply_f = None
        try:
            target_f = float(target)
        except Exception:
            target_f = None

        # if  no violation, do not print a misleading direction.
        if supply_f is not None and target_f is not None:
            if bound_type == "min" and supply_f >= target_f:
                continue
            if bound_type == "max" and supply_f <= target_f:
                continue

        detail_txt = None
        if name in dmi_scaled and supply_f is not None and target_f is not None:
            try:
                thr_f = float(thr_val)
            except Exception:
                thr_f = None
            # If target = thr * DMI, recover DMI and compute % of DM.
            if thr_f is not None and thr_f > 0 and np.isfinite(thr_f) and np.isfinite(target_f) and target_f > 0:
                dmi = target_f / thr_f
                if dmi > 0 and np.isfinite(dmi) and np.isfinite(supply_f):
                    supply_pct = (supply_f / dmi) * 100.0
                    limit_pct = thr_f * 100.0
                    if bound_type == "min":
                        detail_txt = f"result = {supply_pct:.2f}% of DM; target = {limit_pct:.2f}% of DM"
                    else:
                        detail_txt = f"result = {supply_pct:.2f}% of DM; target = {limit_pct:.2f}% of DM"

        # show raw values in the stored unit when present, typically kg/day.
        if detail_txt is None and supply_f is not None and target_f is not None:
            unit = str(info.get("unit") or "").strip()
            if unit:
                if bound_type == "min":
                    detail_txt = f"result = {supply_f:.3g} {unit}; target = {target_f:.3g} {unit}"
                else:
                    detail_txt = f"result = {supply_f:.3g} {unit}; target = {target_f:.3g} {unit}"

        if detail_txt:
            prefix = "Critical - " if is_hard else ""
            messages.append(f"{prefix}{disp}: {direction} ({detail_txt})")
        else:
            prefix = "Critical - " if is_hard else ""
            messages.append(f"{prefix}{disp}: {direction}")

    return {"status": status_out, "messages": messages}
