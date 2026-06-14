"""
Typed return value for z_optimization_main().

Replaces the untyped Dict[str, Any] so callers use attribute access
(result.status, result.total_cost) instead of dict subscript.
Stdlib only — no app or middleware imports.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class OptimizationResult:
    status: str                        # "SUCCESS" | "MARGINAL" | "INFEASIBLE" | "FAILED" | "ERROR"
    total_cost: float
    water_intake: float
    diet_table: Any                    # DataFrame or list of dicts
    nutrient_comparison: Dict[str, Any]
    methane_report: Dict[str, Any]
    ration_evaluation: Dict[str, Any]
    animal_requirements: Dict[str, Any]
    messages: List[str]
    allow_report: bool
    error_message: Optional[str] = None
    simulation_id: Optional[str] = None
    report_id: Optional[str] = None
    quantities: Optional[Any] = None   # raw optimizer quantities, for debugging
    diet_supply: Optional[Any] = None  # full diet supply results
    # Internal fields carried for reporting pipeline
    post_results: Dict[str, Any] = field(default_factory=dict)
