"""
Optimization core module.

This module contains the core optimization engine for diet formulation:
- Optimization problem definition (DietOptimizationProblem)
- Custom sampling and repair operators for constrained optimization
- NSGA-II multi-objective optimization implementation
- Diet supply calculations and nutritional evaluation
- Bounds calculation and feasibility checking
"""

import numpy as np
import logging
import time
from typing import Any, Dict, List, Optional
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga3 import NSGA3
from pymoo.core.callback import Callback
from pymoo.optimize import minimize
from pymoo.termination import get_termination
from pymoo.operators.crossover.sbx import SimulatedBinaryCrossover
from pymoo.operators.mutation.pm import PolynomialMutation
from pymoo.core.sampling import Sampling
from pymoo.operators.sampling.rnd import FloatRandomSampling
from pymoo.core.repair import Repair
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing

logger = logging.getLogger(__name__)

# Imports
from .config import nsga3_config, ALLOW_INFEASIBLE_REPORTS
from .constraints_config import CONSTRAINT_PROFILES, CONSTRAINT_ORDER, get_constraint_profile
from .utilities import safe_divide, safe_sum, calculate_discount, calculate_MEact, classify_feed_categories
from .constraints_adequacy import compute_adequacy, summarize_constraint_result
from .feasibility import feasibility_precheck
from .diet_supply import rsm_diet_supply
from .rationsmart_warnings import pre_feasibility_warnings

########################################################
# Optimization BOUNDS
########################################################

# Purpose: Compute decision variable bounds (xl/xu) including DMI and ingredient constraints.
# Notes: Applies mineral/urea caps and category-based adjustments with safety checks.
def rsm_bounds_xlxu(f_nd, animal_requirements, categories=None, custom_thresholds=None):
    # Attribute lower (xl) and upper (xu) bounds for the decision variables
    # Initialize bounds
    n = len(f_nd["Fd_Name"])
    trg = float(animal_requirements["Trg_Dt_DMIn"])
    xl = np.zeros(n + 1, dtype=float)  # +1 for DMI
    xu = np.ones(n + 1, dtype=float)   # +1 for DMI
    
    # DMI bounds (last variable) in the array) fixed to target
    xl[-1] = trg
    xu[-1] = trg
    
    # Get constraint thresholds
    animal_state = animal_requirements.get("An_StatePhys", "Lactating Cow")
    try:
        profile = get_constraint_profile(animal_state, profiles=CONSTRAINT_PROFILES)
        thr = profile.get("thresholds", {}).copy()
        
        # Apply custom thresholds only for Lactating Cow
        if custom_thresholds and animal_state == "Lactating Cow":
            for key, val in custom_thresholds.items():
                if key in thr:
                    thr[key] = val
    except KeyError:
        thr = {}

    feed_names = np.asarray(f_nd.get("Fd_Name", []), dtype=str)
    if feed_names.size != n:
        feed_names = np.resize(feed_names, n)

    if categories is None:
        categories = classify_feed_categories(f_nd)

    mask_minerals = np.asarray(categories.get("mask_minerals", np.zeros(n, dtype=bool)))
    mask_urea = np.asarray(categories.get("mask_urea", np.zeros(n, dtype=bool)))
    mineral_indices = np.where(mask_minerals)[0]
    urea_indices = np.where(mask_urea)[0]
    
    # Mineral bounds: thresholds are stored in kg/day (absolute), convert to DM proportion here
    if mineral_indices.size:
        if "mineral_min" not in thr or "mineral_max" not in thr:
            raise KeyError("Mineral bounds requested but 'mineral_min'/'mineral_max' missing in thresholds.")
        mineral_min_kg = thr["mineral_min"]
        mineral_max_kg = thr["mineral_max"]
        mineral_min_proportion = mineral_min_kg / trg
        mineral_max_proportion = mineral_max_kg / trg
        for idx in mineral_indices:
            xu[idx] = min(xu[idx], mineral_max_proportion)
            xl[idx] = max(xl[idx], mineral_min_proportion)
            # Fix inconsistent mineral bounds
            if xl[idx] > xu[idx]:
                logger.warning("Mineral bound conflict for %s, adjusting min to max", feed_names[idx])
                xl[idx] = xu[idx]
            logger.debug("Mineral bounds: %s %.1f%% - %.1f%%", feed_names[idx], xl[idx]*100, xu[idx]*100)
    
    # Urea cap
    if urea_indices.size:
        if "urea_max" not in thr:
            raise KeyError("Urea bounds requested but 'urea_max' missing in thresholds.")
        # urea_max is stored as a proportion of total DMI (e.g., 0.01 = 1% of DM)
        urea_limit = thr["urea_max"]
        for idx in urea_indices:
            xu[idx] = min(xu[idx], urea_limit)
            logger.debug("Urea cap: %s <= %.1f%%", feed_names[idx], urea_limit*100)
    
    # Fix inconsistent bounds
    inconsistent = xl > xu
    if np.any(inconsistent[:n]):
        xl[inconsistent] = xu[inconsistent]
    
    # Check total requirements
    total_xl = np.sum(xl[:n])
    if total_xl > 1.0:
        scale_factor = 0.95 / total_xl
        xl[:n] *= scale_factor
        logger.debug("Scaled bounds by %.3f", scale_factor)
    
    final_total = np.sum(xl[:n])

    return xl, xu

########################################################
# NSGA Helpers
########################################################

# Purpose: Project a vector onto the simplex while enforcing non-negativity.
# Notes: Returns a normalized vector with graceful fallback when sums collapse.
def _project_to_simplex(v):
    # Project to simplex to ensure the sum of the values is 1
    v = np.maximum(v, 0.0)
    if v.sum() == 0.0:
        return np.full_like(v, 1.0 / len(v))
    u = np.sort(v)[::-1]
    cssv = np.cumsum(u)
    rho = np.nonzero(u * (np.arange(1, len(v) + 1)) > (cssv - 1))[0][-1]
    theta = (cssv[rho] - 1) / (rho + 1)
    w = np.maximum(v - theta, 0.0)

    s = w.sum()
    if s <= 0:
        w = np.full_like(v, 1.0 / len(v))
    else:
        w = w / s
    return w


class SimplexPlusDmiRepair(Repair):
    # Purpose: Repair operator to clamp DMI and project proportions within bounds.
    # Notes: Ensures each individual respects simplex constraints and bound limits.
    def __init__(self, xl, xu):
        super().__init__()
        self.xl = np.asarray(xl, dtype=float)
        self.xu = np.asarray(xu, dtype=float)

    # Purpose: Fix candidate solutions by clipping DMI and re-normalizing proportions.
    # Notes: Applies lower/upper bounds then renormalizes to keep sums consistent.
    def _do(self, problem, X, **kwargs):
        Y = np.asarray(X, dtype=float).copy()
        n_var = Y.shape[1]
        n = n_var - 1

        # clamp t (DMI)
        Y[:, -1] = np.clip(Y[:, -1], self.xl[-1], self.xu[-1])

        # Project to simplex and enforce bounds
        P = Y[:, :n]
        P[P < 0.0] = 0.0
        
        for i in range(P.shape[0]):
            P[i, :] = _project_to_simplex(P[i, :])     # Standard projection
            P[i, :] = np.maximum(P[i, :], self.xl[:n]) # Lower bounds
            P[i, :] = np.minimum(P[i, :], self.xu[:n]) # Upper bounds
            P[i, :] = P[i, :] / P[i, :].sum()          # Renormalize to simplex
        Y[:, :n] = P
        return Y


class SimplexPlusDmiSampling(Sampling):
    # Sampling in simplex
    # Purpose: Generate initial samples respecting simplex bounds and DMI limits.
    # Notes: Draws Dirichlet samples, enforces bounds, and appends uniform DMI values.
    def __init__(self, xl, xu):
        super().__init__()
        self.xl = np.asarray(xl, dtype=float)
        self.xu = np.asarray(xu, dtype=float)

    # Purpose: Produce a population of bounded proportion vectors with paired DMI values.
    # Notes: Clamps to bounds, renormalizes proportions, and stacks DMI draws.
    def _do(self, problem, n_samples, **kwargs):
        n_var = problem.n_var
        n = n_var - 1  # Last pos is t

        # Generate samples that respect bounds
        P = np.zeros((n_samples, n))
        
        for i in range(n_samples):
            # Start with Dirichlet sampling
            sample = np.random.dirichlet(np.ones(n))
            
            # Enforce bounds and renormalize
            sample = np.maximum(sample, self.xl[:n])  # Lower bounds
            sample = np.minimum(sample, self.xu[:n])  # Upper bounds
            sample = sample / sample.sum()           # Renormalize to simplex
            P[i, :] = sample

        # t uniform in interval
        t_lo, t_hi = self.xl[-1], self.xu[-1]
        T = np.random.uniform(t_lo, t_hi, size=(n_samples, 1))

        X = np.hstack([P, T])
        return X
    

def rsm_decode_solution_to_q(
    best_x,
    decision_mode,
    trg_dmi,
    n_ing=None,
    *,
    t_bounds=None,          # (t_lo, t_hi) in kg/d; pass your optimizer DMI bounds here
    strict_shape=True,      # if True, error on shape/length mismatches (recommended)
    allow_uniform_fallback=True  # if False, error instead of uniform when sums==0
):
    # Purpose: Decode optimizer decision vector into quantities, proportions, and DMI with safeguards.
    # Notes: Handles proportion and kg modes, applies fallbacks, and captures warning info.
    info = {"fallbacks": [], "warnings": []}
    x = np.asarray(best_x, dtype=float)

    # Basic NaN/inf check
    if not np.isfinite(x).all():
        raise ValueError("decode_solution_to_q: non-finite values in x")

    # Infer n_ing conservatively
    if n_ing is None:
        if str(decision_mode).lower() == "proportion":
            # Assume last entry is t only if vector length >= 2
            n_ing = x.size - 1 if x.size >= 2 else x.size
        else:
            n_ing = x.size
    n_ing = int(n_ing)

    if str(decision_mode).lower() == "proportion":
        # Expect exactly n_ing + 1
        if x.size == n_ing + 1:
            p_raw = np.clip(x[:n_ing], 0.0, None)
            s = p_raw.sum()
            if s <= 0:
                if not allow_uniform_fallback:
                    raise ValueError("decode_solution_to_q: sum(p_raw)==0")
                p = np.full(n_ing, 1.0 / n_ing)
                info["fallbacks"].append("uniform_p_due_to_zero_sum")
            else:
                p = p_raw / s
            t = float(x[-1])
        else:
            if strict_shape:
                raise ValueError(f"decode_solution_to_q: expected length {n_ing+1} for proportion mode, got {x.size}")
            # Defensive fallback (legacy): treat x as p only, use trg_dmi as t
            p_raw = np.clip(x[:n_ing], 0.0, None)
            s = p_raw.sum()
            if s <= 0:
                if not allow_uniform_fallback:
                    raise ValueError("decode_solution_to_q: sum(p_raw)==0 under fallback")
                p = np.full(n_ing, 1.0 / n_ing)
                info["fallbacks"].append("uniform_p_due_to_zero_sum_fallback")
            else:
                p = p_raw / s
            t = float(trg_dmi)
            info["fallbacks"].append("used_trg_dmi_due_to_missing_t")

        # Validate/repair t
        if not np.isfinite(t) or t <= 0:
            t = float(trg_dmi)
            info["fallbacks"].append("used_trg_dmi_due_to_bad_t")
        if t_bounds is not None:
            t_lo, t_hi = map(float, t_bounds)
            if (t < t_lo) or (t > t_hi):
                info["warnings"].append(f"t_clamped_from_{t:.3f}_to_bounds")
                t = float(np.clip(t, t_lo, t_hi))

        q = p * t
        return q, p, t, info

    # kg mode
    if x.size != n_ing:
        if strict_shape:
            raise ValueError(f"decode_solution_to_q: expected length {n_ing} for kg mode, got {x.size}")
        # Defensive: take first n_ing
        info["warnings"].append("kg_mode_trimmed_or_padded")
    q = np.clip(x[:n_ing], 0.0, None)
    s = q.sum()
    if s > 0:
        t = float(s)
        p = q / s
    else:
        if not allow_uniform_fallback:
            raise ValueError("decode_solution_to_q: sum(q)==0 in kg mode")
        t = float(trg_dmi)
        p = np.full(n_ing, 1.0 / n_ing)
        q = p * t
        info["fallbacks"].append("uniform_q_due_to_zero_sum")

    if t_bounds is not None:
        t_lo, t_hi = map(float, t_bounds)
        if (t < t_lo) or (t > t_hi):
            info["warnings"].append(f"t_clamped_from_{t:.3f}_to_bounds")
            # In kg mode we don't rescale q to the clamped t automatically—warn instead:
            t = float(np.clip(t, t_lo, t_hi))

    return q, p, t, info

class EpsilonUpdateCallback:
    # Purpose: Track and update epsilon over generations for adaptive constraint handling.
    # Notes: Stores epsilon history and current value inside the optimization problem.
    def __init__(self, problem):
        self.problem = problem  # Store a reference to the optimization problem

    # Purpose: Compute generation-based epsilon and persist it on the problem instance.
    # Notes: Called by optimizer each generation to decay epsilon toward final target.
    def __call__(self, algorithm):
        """ This makes the class callable, updating the generation count dynamically """
        self.problem.advance_generation(algorithm.n_gen)
        if self.problem.max_generations > 1:
            eps = self.problem.initial_epsilon - \
                  (self.problem.initial_epsilon - self.problem.final_epsilon) * \
                  (self.problem.current_gen / (self.problem.max_generations - 1))
        else:
            eps = self.problem.final_epsilon
        # Save
        if not hasattr(self.problem, "epsilon_history") or self.problem.epsilon_history is None:
            self.problem.epsilon_history = []
        self.problem.epsilon_history.append(eps)
        self.problem.current_epsilon = eps

########################################################
# NSGA3 - Least cost algorithm core
########################################################

class DietProblemCostOnly(Problem):
    """Single-objective (cost) NSGA-III diet formulation problem."""

    # Purpose: Initialize the cost-only problem with bounds, weights, and constraint config.
    # Notes: Validates required thresholds/weights and prepares category masks and cost vectors.
    def __init__(
        self,
        f_nd,
        animal_requirements,
        decision_mode,
        eps,
        hard_switch_gen: Optional[int] = None,
        constraint_history_level: str = "summary",
        custom_thresholds: Optional[dict] = None,
    ):
        self.f_nd = f_nd
        self.animal_requirements = animal_requirements
        self.decision_mode = decision_mode
        if hard_switch_gen is None:
            raise ValueError("hard_switch_gen must be explicitly specified in the configuration, got None")
        self.hard_switch_gen = int(hard_switch_gen)
        self.use_hard_balance = False

        self.Trg_Dt_DMIn = float(animal_requirements["Trg_Dt_DMIn"])
        self.An_StatePhys = animal_requirements["An_StatePhys"]
        self.An_NEL = animal_requirements["An_NEL"]
        self.An_ME = animal_requirements["An_ME"]
        self.is_heifer = "heifer" in self.An_StatePhys.lower() and "lact" not in self.An_StatePhys.lower()
        
        ## Add an utility that checks all constraint to have a clean optimization problem ?????

        try:
            self.profile = get_constraint_profile(self.An_StatePhys, profiles=CONSTRAINT_PROFILES)
            # Create a shallow copy of thresholds to avoid modifying the global profile
            self.thr = self.profile.get("thresholds", {}).copy()
            
            # Apply custom thresholds only for Lactating Cow if provided
            if custom_thresholds and self.An_StatePhys == "Lactating Cow":
                for key, val in custom_thresholds.items():
                    if key in self.thr:
                        self.thr[key] = val
        except KeyError as exc:
            raise KeyError(f"Missing constraint thresholds for '{self.An_StatePhys}' in constraint profiles") from exc

        try:
            self.constraint_weights = self.profile.get("weights", {})
        except KeyError as exc:
            raise KeyError(f"Missing constraint weights for '{self.An_StatePhys}' in constraint profiles") from exc

        required_thr = [
            "ndf_max",
            "ndf_for_min",
            "starch_max",
            "ee_max",
            "ash_max",
            "conc_max",
            "conc_byprod_max",
            "other_wet_ingr_max",
            "forage_straw_max",
            "forage_fibrous_max",
            "moist_forage_min",
        ]
        missing_thr = [k for k in required_thr if k not in self.thr]
        if missing_thr:
            raise KeyError(f"Missing constraint thresholds for {missing_thr} in constraint profile for '{self.An_StatePhys}'")

        required_weight_keys = [
            "energy_req",
            "mp_req",
            "ca",
            "p",
            "ndf_for_min",
            "ash_max",
            "ndf_max",
            "starch_max",
            "ee_max",
            "nel_balance_max",
            "mp_balance_max",
            "conc_max",
            "conc_byprod_max",
            "other_wet_ingr_max",
            "forage_straw_max",
            "forage_fibrous_max",
            "moist_forage_min",
        ]
        missing_weights = [k for k in required_weight_keys if k not in self.constraint_weights]
        if missing_weights:
            raise KeyError(
                f"Missing constraint weights for {missing_weights} in constraint profile for '{self.An_StatePhys}'"
            )

        required_soft_keys = [
            "ndf_max",
            "starch_max",
            "ee_max",
            "conc_max",
            "moist_forage_min",
            "nel_balance_max",
            "mp_balance_max",
        ]
        penalties = self.profile.get("penalties", {})
        missing_soft = [k for k in required_soft_keys if k not in penalties]
        if missing_soft:
            raise KeyError(f"Missing soft constraint penalties for {missing_soft} in constraint penalties for '{self.An_StatePhys}'")

        self.soft_penalty_config = penalties
        self.penalty_scale = 200.0

        self.feed_count = len(f_nd["Fd_Name"])
        self.fd_types = np.array(f_nd.get("Fd_Type", [""] * self.feed_count))
        self.fd_dm = np.array(f_nd.get("Fd_DM", np.zeros(self.feed_count)))
        self.conc_mask = self.fd_types != "Forage"
        self.moist_mask = (self.fd_types == "Forage") & (self.fd_dm < 80)
        self.categories = classify_feed_categories(self.f_nd)
        self.eps = float(eps)
        if self.eps <= 0.0:
            raise ValueError("eps must be > 0")
        # Use DM-based cost for optimization objective
        self.feed_cost = np.nan_to_num(f_nd.get("Fd_CostDM", np.zeros(self.feed_count)), nan=0.0)
        
        # Pre-calculate cost scale
        mean_cost_dm = float(np.mean(self.feed_cost))
        self.cost_scale = max(mean_cost_dm * self.Trg_Dt_DMIn, self.eps)

        if decision_mode.lower() == "proportion":
            n_var = self.feed_count + 1
            xl, xu = rsm_bounds_xlxu(f_nd, animal_requirements, categories=self.categories)
        else:
            n_var = self.feed_count
            xl = np.zeros(n_var)
            xu = np.full(n_var, self.Trg_Dt_DMIn * 1.05)

        self.constraint_order = CONSTRAINT_ORDER

        super().__init__(n_var=n_var, n_obj=1, n_constr=len(self.constraint_order), xl=xl, xu=xu)
        self.constraint_history_level = str(constraint_history_level or "summary").lower()
        if self.constraint_history_level not in {"full", "summary", "none"}:
            self.constraint_history_level = "summary"
        self.constraint_results_history: List[Any] = []

    # Purpose: Decode optimizer decision vector into quantities/proportions plus metadata.
    # Notes: Supports proportion and kg modes, enforcing bounds and capturing fallbacks.
    def decode_solution_vector(self, x):
        x_arr = np.asarray(x)
        is_batch = x_arr.ndim > 1

        if self.decision_mode.lower() == "proportion":
            if is_batch:
                # Optimized vectorized decoding for the entire population
                n_ing = self.feed_count
                dmi_vals = x_arr[:, -1] # Last column is DMI in this mode
                props_raw = np.clip(x_arr[:, :n_ing], 0.0, None)
                row_sums = np.sum(props_raw, axis=1)
                
                # Normalize proportions
                mask = row_sums > 1e-9
                p = np.zeros_like(props_raw)
                p[mask] = props_raw[mask] / row_sums[mask][:, np.newaxis]
                p[~mask] = 1.0 / n_ing # uniform fallback
                
                q = p * dmi_vals[:, np.newaxis]
                return q, p, dmi_vals, {}
            else:
                # Single solution path
                q, p, t, info = rsm_decode_solution_to_q(
                    x,
                    "proportion",
                    self.Trg_Dt_DMIn,
                    n_ing=self.feed_count,
                    t_bounds=(self.Trg_Dt_DMIn, self.Trg_Dt_DMIn),
                )
                return q, p, t, info
        else:
            # KG mode (simpler)
            if is_batch:
                q = np.maximum(x_arr, 0.0)
                t = np.sum(q, axis=1)
                return q, None, t, {"mode": "kg"}
            else:
                q = np.maximum(np.asarray(x, dtype=float), 0.0)
                return q, None, np.sum(q), {"mode": "kg"}

    # Purpose: Evaluate population members for cost and constraint violations.
    # Notes: Uses batch vectorization for supply and cost; loops only for adequacy.
    def _evaluate(self, X, out, *args, **kwargs):
        n_pop = len(X)
        F = np.zeros((n_pop, 1))
        G = np.zeros((n_pop, len(self.constraint_order)))
        constraint_results = [None] * n_pop
        
        # 1. Batch decoding and supply calculation (High Speed)
        all_quantities, _, _, _ = self.decode_solution_vector(X)
        all_diet_results = rsm_diet_supply(all_quantities, self.f_nd, self.animal_requirements, is_heifer=self.is_heifer)
        
        # 2. Batch cost calculation
        # all_quantities is [Pop, Feeds], self.feed_cost is [Feeds]
        all_total_costs = all_quantities @ self.feed_cost
        all_raw_costs = all_total_costs / self.cost_scale

        # 3. Targeted loop for complex adequacy dictionary
        for i in range(n_pop):
            try:
                diet_results = all_diet_results[i]
                quantities = all_quantities[i]
                raw_cost = all_raw_costs[i]

                constraint_result = compute_adequacy(
                    self.An_StatePhys,
                    diet_results,
                    self.animal_requirements,
                    quantities,
                    self.f_nd,
                    categories=self.categories,
                    use_hard_balance=self.use_hard_balance,
                    constraint_order=self.constraint_order,
                    penalty_cfg=self.soft_penalty_config,
                    thresholds=self.thr,
                    detail="fast",
                    is_heifer=self.is_heifer,
                )
                
                penalized_cost = raw_cost + self.penalty_scale * constraint_result["soft_penalty"]
                F[i, 0] = penalized_cost
                G[i, :] = constraint_result["hard_g"]
                
                constraint_result["raw_cost"] = raw_cost
                constraint_result["penalized_cost"] = penalized_cost
                constraint_results[i] = constraint_result

            except Exception as exc:
                logger.warning("Cost-only evaluation failed for solution %d: %s", i, exc)
                F[i, 0] = 1e6
                G[i, :] = 1e6
                constraint_results[i] = {"raw_cost": 1e6, "penalized_cost": 1e6}

        self.constraint_results = constraint_results
        self.constraint_details = [cr.get("details", {}) if isinstance(cr, dict) else {} for cr in constraint_results]
        
        if self.constraint_history_level == "full":
            self.constraint_results_history.append(constraint_results)
        elif self.constraint_history_level == "summary":
            self.constraint_results_history.append([summarize_constraint_result(cr) for cr in constraint_results])
            
        out["F"] = F
        out["G"] = G


class HardBalanceSwitch(Callback):
    def __init__(self, prob, switch_gen: int):
        super().__init__()
        self.prob = prob
        self.switch_gen = switch_gen

    def notify(self, algorithm):
        if algorithm.n_gen >= self.switch_gen:
            self.prob.use_hard_balance = True

class MultiCallback(Callback):
    def __init__(self, callbacks):
        super().__init__()
        self.callbacks = callbacks

    def notify(self, algorithm):
        for cb in self.callbacks:
            cb.notify(algorithm)

# Purpose: Run NSGA-III cost-only optimization and return result, problem, and config.
# Notes: Performs precheck, configures bounds/sampling, and executes pymoo minimize.
def nsga3_optimization(animal_requirements, f_nd, config=None, custom_thresholds=None):
    cfg = nsga3_config(config)
    # Flow dev toggle through config so callers can gate on a single authoritative postcheck.
    cfg.setdefault("allow_infeasible_reports", ALLOW_INFEASIBLE_REPORTS)
    categories = classify_feed_categories(f_nd)
    if "hard_switch_gen" not in cfg:
        raise KeyError("Missing required 'hard_switch_gen' in NSGA-3 config")
    hard_switch_gen = int(cfg["hard_switch_gen"])

    # Prepare custom thresholds if provided and animal is Lactating Cow for precheck
    effective_thr = None
    if custom_thresholds and animal_requirements.get("An_StatePhys") == "Lactating Cow":
        from core.z_optimization.constraints_config import get_constraint_profile, CONSTRAINT_PROFILES
        base_thr = get_constraint_profile("Lactating Cow", profiles=CONSTRAINT_PROFILES).get("thresholds", {})
        effective_thr = base_thr.copy()
        for k, v in custom_thresholds.items():
            if k in effective_thr:
                effective_thr[k] = v

    # Pre-optimization feasibility check (delegate threshold lookup to the precheck helper)
    precheck_raw = feasibility_precheck(
        f_nd,
        animal_requirements,
        categories=categories,
        thr=effective_thr,
    )
    state_for_precheck = precheck_raw.get("context", {}).get(
        "state_phys", animal_requirements["An_StatePhys"]
    )
    precheck = pre_feasibility_warnings(precheck_raw, state_for_precheck)
    cfg["precheck"] = precheck
    if precheck.get("messages"):
        log_fn = logger.error if precheck.get("status") == "error" else logger.warning
        for msg in precheck["messages"]:
            log_fn(msg)
    if precheck.get("status") == "error":
        return None, None, cfg

    decision_mode = str(cfg["decision_mode"]).lower()
    if decision_mode == "proportion":
        xl, xu = rsm_bounds_xlxu(
            f_nd,
            animal_requirements,
            categories=categories,
            custom_thresholds=custom_thresholds,
        )
        sampling_op = SimplexPlusDmiSampling(xl, xu)
        repair_op = SimplexPlusDmiRepair(xl, xu)
    else:
        feed_count = len(f_nd["Fd_Name"])
        target_dmi = float(animal_requirements["Trg_Dt_DMIn"])
        xl = np.zeros(feed_count, dtype=float)
        xu = np.full(feed_count, target_dmi * 1.05, dtype=float)
        sampling_op = FloatRandomSampling()
        repair_op = None

    problem = DietProblemCostOnly(
        f_nd=f_nd,
        animal_requirements=animal_requirements,
        decision_mode=decision_mode,
        eps=cfg["eps"],
        hard_switch_gen=hard_switch_gen,
        constraint_history_level=cfg.get("constraint_history_level", "summary"),
        custom_thresholds=custom_thresholds,
    )

    ref_dirs = np.array([[1.0]])

    algorithm = NSGA3(
        pop_size=cfg["pop_size"],
        ref_dirs=ref_dirs,
        sampling=sampling_op,
        crossover=SimulatedBinaryCrossover(prob=cfg["crossover_prob"], eta=cfg["crossover_eta"]),
        mutation=PolynomialMutation(prob=cfg["mutation_prob"], eta=cfg["mutation_eta"]),
        repair=repair_op,
        eliminate_duplicates=True,
    )

    hard_switch_cb = HardBalanceSwitch(problem, hard_switch_gen)

    combined_cb = MultiCallback([hard_switch_cb])

    # Using 'soo' (Single Objective Optimization) termination 
    # It stops if improvements in Cost or Constraints are below 1e-6 over 25 generations.
    termination = get_termination(
        "soo", 
        ftol=1e-6, 
        period=25, 
        n_max_gen=cfg["generations"]
    )

    start_time = time.time()
    try:
        result = minimize(
            problem,
            algorithm,
            termination,
            seed=cfg["seed"],
            verbose=cfg["verbose"],
            save_history=False,  # save history adds computatioal time. If needed can be switched on with True.
            callback=combined_cb,
        )
        elapsed = time.time() - start_time
        logger.info("NSGA3 cost-only optimization finished in %.2f seconds (%d generations)", elapsed, result.algorithm.n_gen)
        result.constraint_details = getattr(problem, "constraint_details", None)
        result.constraint_results = getattr(problem, "constraint_results", None)
        result.constraint_results_history = getattr(problem, "constraint_results_history", None)
        return result, problem, cfg
    except Exception as exc:
        logger.error("NSGA3 cost-only optimization failed: %s", exc)
        return None, problem, cfg


# Purpose: Normalize result arrays to 2D shapes for downstream processing.
# Notes: Ensures X is 2D and returns (X, F, G).
def _extract_result_arrays(result):
    X = getattr(result, "X", None)
    F = getattr(result, "F", None)
    G = getattr(result, "G", None)
    
    # Ensure X is always 2D
    if X is not None:
        X = np.asarray(X)
        if X.ndim == 1:
            # If it's a 1D array, make it a single-row 2D array
            X = X.reshape(1, -1)
    
    return X, F, G


# Purpose: Select the best solution by feasibility-first then cost, recomputing constraints if needed.
# Notes: Handles missing constraint data, decodes quantities, and returns a summary dict.
def _select_best_cost_solution(result, problem, cfg):
    if result is None:
        return None

    X, F, G = _extract_result_arrays(result)
    if X is None or F is None or len(X) == 0:
        return None

    costs = np.asarray(F).reshape(-1)
    len_costs = len(costs)
    constraint_results = getattr(result, "constraint_results", None)
    debug_validate = bool(cfg.get("debug_validate_constraints", False)) if isinstance(cfg, dict) else False
    # If missing/mismatched, try to recover from problem (single-solution cases)
    if (not isinstance(constraint_results, (list, np.ndarray))) or len(constraint_results) != len_costs:
        fallback_cr = getattr(problem, "constraint_results", None)
        if isinstance(fallback_cr, (list, np.ndarray)) and len(fallback_cr) == len_costs:
            constraint_results = fallback_cr
    # If still mismatched, fall back to legacy G-based ranking
    if (not isinstance(constraint_results, (list, np.ndarray))) or len(constraint_results) != len_costs:
        constraint_results = None
    if constraint_results is not None:
        if debug_validate:
            for idx, cr in enumerate(constraint_results):
                if not isinstance(cr, dict):
                    raise ValueError(f"constraint_results[{idx}] is not a dict")
                for key in ["hard_violation_count", "hard_violation_sum", "max_severity_rank", "raw_cost", "penalized_cost", "total_violation"]:
                    if key not in cr:
                        raise ValueError(f"constraint_results[{idx}] missing key '{key}'")
                    if not isinstance(cr[key], (int, float, np.integer, np.floating)):
                        raise ValueError(f"constraint_results[{idx}]['{key}'] must be numeric")
        raw_costs = np.asarray([cr["raw_cost"] for cr in constraint_results], dtype=float)
        penalized_costs = np.asarray([cr["penalized_cost"] for cr in constraint_results], dtype=float)
    else:
        raw_costs = costs
        penalized_costs = costs

    if isinstance(constraint_results, (list, np.ndarray)) and len(constraint_results) == len_costs:
        ranks = []
        feasible_indices = []
        for idx, cr in enumerate(constraint_results):
            hv_count = cr.get("hard_violation_count", 0) if isinstance(cr, dict) else 0
            hv_sum = cr.get("hard_violation_sum", 0.0) if isinstance(cr, dict) else 0.0
            max_sev = cr.get("max_severity_rank", 0) if isinstance(cr, dict) else 0
            soft_pen = cr.get("soft_penalty", 0.0) if isinstance(cr, dict) else 0.0
            ranks.append((hv_count, hv_sum, max_sev, soft_pen, penalized_costs[idx], raw_costs[idx], idx))
            if hv_count == 0:
                feasible_indices.append(idx)

        if feasible_indices:
            best_idx = min(feasible_indices, key=lambda i: raw_costs[i])
        else:
            best_idx = min(ranks, key=lambda r: (r[0], r[1], r[2], r[3], r[4], r[5]))[-1]
        violation = np.array([cr.get("total_violation", 0.0) if isinstance(cr, dict) else 0.0 for cr in constraint_results])
    else:
        if G is None:
            violation = np.zeros_like(costs)
            feasible_mask = np.ones_like(costs, dtype=bool)
        else:
            G_arr = np.asarray(G)
            if G_arr.ndim == 1:
                if G_arr.shape[0] == getattr(problem, "n_constr", G_arr.shape[0]):
                    G_arr = G_arr.reshape(1, -1)
                else:
                    G_arr = G_arr.reshape(-1, 1)
            if G_arr.shape[0] != len(costs) and G_arr.shape[0] == getattr(problem, "n_constr", G_arr.shape[0]) and len(costs) == 1:
                G_arr = G_arr.reshape(1, -1)
            violation = np.sum(np.clip(G_arr, 0.0, None), axis=1)
            feasible_mask = np.all(G_arr <= 0, axis=1)

        if np.any(feasible_mask):
            feasible_indices = np.where(feasible_mask)[0]
            best_idx = feasible_indices[np.argmin(costs[feasible_mask])]
        else:
            order = np.lexsort((costs, violation))
            best_idx = int(order[0])

    q, p, t, info = problem.decode_solution_vector(X[best_idx])
    details = getattr(result, "constraint_details", None)
    selected_details = None
    if isinstance(details, (list, np.ndarray)) and len(details) > best_idx:
        selected_details = details[best_idx]
    selected_constraint_result = None
    if isinstance(constraint_results, (list, np.ndarray)) and len(constraint_results) > best_idx:
        selected_constraint_result = constraint_results[best_idx]

    # Final detailed check for reporting
    try:
        diet_results = rsm_diet_supply(q, problem.f_nd, problem.animal_requirements)
        final_cr = compute_adequacy(
            problem.An_StatePhys,
            diet_results,
            problem.animal_requirements,
            q,
            problem.f_nd,
            categories=getattr(problem, "categories", None),
            use_hard_balance=getattr(problem, "use_hard_balance", False),
            constraint_order=getattr(problem, "constraint_order", None),
            penalty_cfg=getattr(problem, "soft_penalty_config", None),
            thresholds=getattr(problem, "thr", None),
            detail="full",
        )
        final_cr["raw_cost"] = float(raw_costs[best_idx])
        final_cr["penalized_cost"] = float(penalized_costs[best_idx])
        selected_constraint_result = final_cr
        selected_details = final_cr.get("details", selected_details)
    except Exception as exc:
        logger.warning("Final constraint check failed for selected solution: %s", exc)

    return {
        "index": int(best_idx),
        "x": X[best_idx],
        "q": q,
        "p": p,
        "t": t,
        "decode_info": info,
        "cost": float(costs[best_idx]),
        "raw_cost": float(raw_costs[best_idx]),
        "penalized_cost": float(penalized_costs[best_idx]),
        "violation": float(violation[best_idx]),
        "constraint_details": selected_details,
        "constraint_result": selected_constraint_result,
    }