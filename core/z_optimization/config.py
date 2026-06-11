"""
Configuration of optimization constants for diet optimization.

Flags previously hardcoded to True are now read from environment variables
so production can stay conservative without a code change (Task 1.7).
"""
import os
from typing import Any, Dict, Optional, Tuple

# Allow full reports even when the optimizer cannot find a fully feasible diet.
# Default False (production-safe). Set ALLOW_INFEASIBLE_REPORTS=true for dev/testing.
ALLOW_INFEASIBLE_REPORTS: bool = os.getenv("ALLOW_INFEASIBLE_REPORTS", "false").lower() == "true"

# Enable human-readable advice text when results are marginal/infeasible.
ENABLE_ADVICE_ENGINE: bool = True

# ===================================================================
# NSGA3 CONFIGURATIONS
# ===================================================================

# Purpose: Provide default NSGA3 parameters with optional overrides.
# Notes: Returns merged config without mutating the input dictionary.
def nsga3_config(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    verbose = os.getenv("NSGA3_VERBOSE", "false").lower() == "true"
    defaults = {
        "pop_size": 60,
        "generations": 100,
        "decision_mode": "proportion",
        "crossover_prob": 0.9,
        "crossover_eta": 15,
        "mutation_prob": 0.1,
        "mutation_eta": 20,
        "seed": 42,
        "verbose": verbose,
        "report_file": "nsga3_cost_only_report.html",
        "hard_switch_gen": 50,
        "eps": 1e-6,
        "constraint_history_level": "none",
        "debug_validate_constraints": False,
    }
    return {**defaults, **(config or {})}
