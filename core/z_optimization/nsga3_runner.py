"""
RationSmart NSGA-III runner.
"""

from __future__ import annotations

import sys
import os
# Add the current directory to sys.path to support both standalone and package imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from typing import Any, Dict
from pathlib import Path
from datetime import datetime

from animal_requirements import (
    rsm_calculate_an_requirements,
    rsm_create_animal_inputs_dataframe,
)
from feed_processing import rsm_process_feed_library, rsm_process_feed_dataframe
from optimization_core import nsga3_optimization, _select_best_cost_solution
from diet_supply import rsm_diet_supply
from diet_tables import (
    rsm_create_diet_table,
    rsm_generate_nutrient_comparison,
    rsm_create_final_diet_dataframe,
    rsm_calculate_water_intake,
    rsm_create_ration_evaluation,
    rsm_create_proportions_dataframe,
    rsm_calculate_methane_emissions,
)
from report_generation import generate_report_from_runner_results
from rationsmart_warnings import post_feasibility_warnings
from constraints_adequacy import compute_adequacy
from feasibility import feasibility_postcheck



def z_optimization_main(animal_inputs, feed_data_list, simulation_id=None, user_id=None, report_id=None, custom_thresholds=None):
    # Calculate animal requirements
    animal_requirements = rsm_calculate_an_requirements(animal_inputs)
    
    # Convert raw feed data list to DataFrame
    import pandas as pd
    f = pd.DataFrame(feed_data_list)
    
    # Process feed data (calculates derived nutrients and converts to dict of arrays)
    f_nd, Dt = rsm_process_feed_dataframe(f)

    # Run optimization (returns result, problem, cfg)
    result, problem, cfg = nsga3_optimization(animal_requirements, f_nd, custom_thresholds=custom_thresholds)

    precheck = cfg.get("precheck") if isinstance(cfg, dict) else None
    if precheck:
        status = precheck.get("status")
        if status == "error":
            print("❌ Optimization skipped: pre-check found blocking issues.")
            return {
                "status": "ERROR",
                "error_message": "Pre-check found blocking issues",
                "precheck": precheck
            }
        if status == "warning":
            print("⚠️ Pre-check warnings detected; continuing optimization.")

    if result is None or problem is None:
        print("❌ Optimization did not return a solution.")
        return {
            "status": "ERROR",
            "error_message": "Optimization did not return a solution"
        }

    # Select best feasible-first solution
    best = _select_best_cost_solution(result, problem, cfg)
    
    # Pre-calculate animal inputs dataframe for reporting (needed for both success and failure)
    animal_inputs_df = rsm_create_animal_inputs_dataframe(problem.animal_requirements)

    if best is None:
        cr = getattr(result, "constraint_results", None) if result is not None else None
        fallback_cr = getattr(problem, "constraint_results", None)
        constraint_results = cr if cr else fallback_cr
        postcheck = feasibility_postcheck(
            problem.An_StatePhys,
            None,
            cfg=cfg,
            has_result=(result is not None),
            has_problem=(problem is not None),
            has_best=False,
            constraint_results_population=list(constraint_results or []),
            constraint_order=list(getattr(problem, "constraint_order", []) or []),
            violated_rule="A",
        )
        if postcheck.get("messages"):
            for line in postcheck["messages"]:
                print(f"⚠️ {line}")
        
        return {
            "status": "FAILED",
            "error_message": "No acceptable solution found",
            "post_results": {
                "status": postcheck["status"],
                "messages": postcheck.get("messages", []),
                "worst_constraints": postcheck.get("worst_constraints", []),
                "animal_inputs": animal_inputs_df,
                "diet_supply_results": {},  # Add empty dict for safety
                "water_intake": 0.0,
                "total_cost": 0.0
            },
            "animal_requirements": problem.animal_requirements
        }

    # Compute diet supply for the best quantities and re-run full constraint check for reporting
    q = best["q"]
    try:
        # If the selector already attached a full constraint_result, reuse it; otherwise compute once here.
        if not best.get("constraint_result"):
            diet_results_best = rsm_diet_supply(q, problem.f_nd, problem.animal_requirements)
            best_full_cr = compute_adequacy(
                problem.An_StatePhys,
                diet_results_best,
                problem.animal_requirements,
                q,
                problem.f_nd,
                categories=getattr(problem, "categories", None),
                use_hard_balance=getattr(problem, "use_hard_balance", False),
                constraint_order=getattr(problem, "constraint_order", None),
                penalty_cfg=getattr(problem, "soft_penalty_config", None),
                thresholds=problem.thr,
                detail="full",
            )
            best["constraint_result"] = best_full_cr
            best["constraint_details"] = best_full_cr.get("details", {})
    except Exception as exc:
        print(f"⚠️ Final constraint check for reporting failed: {exc}")

    diet_supply = rsm_diet_supply(q, problem.f_nd, problem.animal_requirements)

    # Build post-analysis tables to feed the HTML report generator
    diet_table, total_cost_real = rsm_create_diet_table(q, problem.f_nd)
    nutrient_comparison = rsm_generate_nutrient_comparison(diet_supply, problem.animal_requirements, problem.f_nd, thresholds=problem.thr)
    Dt, final_diet_df, Dt_DMInSum, Dt_AFIn = rsm_create_final_diet_dataframe(diet_table, problem.f_nd)
    water_intake = rsm_calculate_water_intake(Dt_DMInSum, Dt_AFIn, problem.f_nd, problem.animal_requirements, q)
    ration_evaluation = rsm_create_ration_evaluation(diet_supply, problem.animal_requirements, diet_table, problem.f_nd, q)
    dt_proportions, dt_forages, dt_concentrates, dt_results = rsm_create_proportions_dataframe(Dt, Dt_DMInSum)
    methane_report = rsm_calculate_methane_emissions(Dt, Dt_DMInSum, problem.f_nd, problem.animal_requirements, q)
    animal_inputs_df = rsm_create_animal_inputs_dataframe(problem.animal_requirements)

    postcheck = feasibility_postcheck(
        problem.An_StatePhys,
        best.get("constraint_result", {}),
        cfg=cfg,
        has_result=(result is not None),
        has_problem=(problem is not None),
        has_best=(best is not None),
    )
    constraint_messages = post_feasibility_warnings(
        best.get("constraint_result", {}),
        best.get("constraint_details", {}),
        problem.An_StatePhys,
        thresholds=getattr(problem, 'thr', None)
    )
    if constraint_messages.get("messages"):
        print("ℹ️ Constraint summary:")
        for line in constraint_messages["messages"]:
            print(f"   - {line}")
    if postcheck.get("messages"):
        print("ℹ️ Postcheck:")
        for line in postcheck["messages"]:
            print(f"   - {line}")

    summary = {
        "status": postcheck["status"],
        # Use AF-based realized cost for reporting; keep optimizer DM cost separately
        "cost": total_cost_real,
        "opt_cost_dm": best["cost"],
        "violation": best["violation"],
        "quantities": q,
        "diet_supply": diet_supply,
        "config": cfg,
        "animal_requirements": problem.animal_requirements,
    }

    print("✅ NSGA3 run complete.")
    print(f"Cost (AF): {summary['cost']:.2f} | Violation: {summary['violation']:.4f} | Status: {summary['status']}")

    report_ready = {
        "allow_report": bool(postcheck["allow_report"]),
        "post_optimization": {
            "status": postcheck["status"],
            "messages": list(postcheck.get("messages") or []),
            "worst_constraints": list(postcheck.get("worst_constraints") or []),
            "total_cost": total_cost_real,
            "water_intake": water_intake,
            "diet_supply_results": diet_supply,
            "animal_inputs": animal_inputs_df,
            "ration_evaluation": ration_evaluation,
            "diet_table": diet_table,
            "Dt": Dt,
            "Dt_kg": final_diet_df,
            "dt_proportions": dt_proportions,
            "dt_forages": dt_forages,
            "dt_concentrates": dt_concentrates,
            "dt_results": dt_results,
            "nutrient_comparison": nutrient_comparison,
            "methane_report": methane_report,
            "best_solution_result": q,
            "constraint_messages": constraint_messages,
        },
        "animal_requirements": problem.animal_requirements,
    }

    # NSGA3 runner now returns raw results. 
    # Official HTML/PDF reports are handled by core/z_optimization/reporting.py 
    # in a background task for better API performance.
    
    return {
        "status": "SUCCESS",
        "post_results": report_ready["post_optimization"],
        "animal_requirements": problem.animal_requirements,
        "simulation_id": simulation_id,
        "report_id": report_id,
        "report_ready": report_ready
    }


