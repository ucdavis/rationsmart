import logging
import os

logger = logging.getLogger(__name__)

import pandas as pd
import numpy as np
import re
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.patches import Rectangle
import warnings
warnings.filterwarnings('ignore')
import time
import multiprocessing
import random
from itertools import combinations
from pprint import pprint 
from pathlib import Path
from dataclasses import dataclass
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.problems import get_problem
from pymoo.optimize import minimize
from pymoo.core.evaluator import Evaluator
from pymoo.visualization.scatter import Scatter
from pymoo.termination import get_termination
from pymoo.operators.sampling.rnd import FloatRandomSampling
from pymoo.operators.crossover.sbx import SimulatedBinaryCrossover
from pymoo.operators.mutation.pm import PolynomialMutation
from pymoo.core.sampling import Sampling      
from pymoo.core.repair import Repair        
from pymoo.operators.sampling.rnd import FloatRandomSampling
from concurrent.futures import ThreadPoolExecutor, as_completed
#from tests import TestGenerator
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

#gen = TestGenerator()
#from analysis import plot_pareto
#from excel_exporter import analyze_optimization_population

# Import configuration constants
# from config import Constraints, CONSTRAINT_TOLERANCE_RANGES

# Import utility functions
from .utilities import (
    adjust_dmi_temperature,
    preprocess_dataframe,
    rename_variable,
    replace_na_and_negatives,
    safe_divide,
    safe_sum,
    _msg
)

# Import animal requirements functions
from .animal_requirements import (
    rsm_calculate_an_requirements,
    rsm_create_animal_inputs_dataframe,
    rsm_create_animal_requirements_dataframe,
    print_animal_characteristics
)

# Import feed processing functions
from .feed_processing import (
    rsm_process_feed_library,
    rsm_process_feed_dataframe
)

# Import constraint evaluation functions (module not yet ported — will resolve in Task 2.11)
from .constraints import (
    evaluate_constraints,
    build_conditional_constraints,
    evaluate_constraint_adequacy,
    extract_constraint_deviations,
    ca_constraint_name,
    pick_band_and_distance,
    _constraint_type,
    _counts_as_marginal,
    _counts_as_infeasible,
    _is_over,
    _is_under,
    _append_actions_for_constraint,
    _resolve_action_conflicts,
    ConstraintEval,
    CONSTRAINT_META,
    COUNT_OVERRIDES,
    PRESENTATION,
    CRITICAL_REQS,
    ACTION_TEMPLATES
)

# Import optimization core
from .optimization_core import (
    rsm_bounds_xlxu,
    _project_to_simplex,
    SimplexPlusDmiRepair,
    SimplexPlusDmiSampling,
    rsm_decode_solution_to_q,
    calculate_discount,
    calculate_MEact,
    rsm_diet_supply,
    rsm_run_optimization,
    rsm_detect_present_categories,
    DietOptimizationProblem,
    EpsilonUpdateCallback
)

# Import solution selection (module not yet ported — will resolve in Task 2.11)
from .solution_selection import (
    rsm_solution_selection,
    SELECTION_CONFIG
)

# Import report generation
from .report_generation import (
    calculate_weighted_absorption,
    rsm_create_solution_summary,
    generate_report_from_runner_results,
    print_selected_feeds
)

# Import post-optimization analysis (module not yet ported — will resolve in Task 2.11)
from .post_analysis import (
    rsm_run_post_optimization_analysis,
    rsm_clean_solution,
    user_warnings
)

# Import diet tables
from .diet_tables import (
    rsm_create_diet_table,
    rsm_generate_nutrient_comparison,
    rsm_create_final_diet_dataframe,
    rsm_calculate_water_intake,
    rsm_create_ration_evaluation,
    rsm_create_proportions_dataframe,
    rsm_calculate_methane_emissions
)

# ===================================================================
# MAIN ENTRY POINT
# ===================================================================

def rsm_main(animal_inputs, feed_data, simulation_id=None, user_id=None, report_id=None, **kwargs):
    # ===================================================================
    # 0. CONFIGURATION AND OPTIMIZATION PARAMETERS
    # ===================================================================
    
    # ---- run config (single source of truth) ----
    RUN_CONFIG = {
        # DMI bounds (single source of truth)
        "decision_mode": "proportion",   # Always proportions now, do not change!!!! 
        "dmi_lo": 0.90,
        "dmi_hi": 1.05,
        # Optimization algorithm parameters
        "pop_size": 100,
        "generations": 200,
        "initial_epsilon": 3.00,
        "final_epsilon": 0.05,
        "crossover_prob": 0.9,
        "crossover_eta": 5,
        "mutation_prob": 0.3,
        "mutation_eta": 5,
        "verbose": True, 
        # Energy/protein offsets
        "energy_offset": 1.0,   # Mcal above requirement
        "mp_offset": 0.10,      # kg above requirement
        # System parameters
        "seed": 42,
        "n_workers": 7,
        "enable_sanity": True,
        # Early convergence settings
        "early_convergence_check": True,
        "early_gen_limit": 30,
        "full_gen_limit": 200,
        "main_sheet": "Fd_selected", 
        "feed_xlsx": "RFT_FD_Lib_Y2test.xlsx",
        # Solution selection
        "use_cv_ranking": True  # Enable constraint violation aware ranking
    }

    # ===================================================================
    # 2. CALCULATE ANIMAL REQUIREMENTS
    # ===================================================================
    logger.info("Calculating animal nutritional requirements...")
    animal_requirements = rsm_calculate_an_requirements(animal_inputs) #(gen.animal_inputs)
    logger.info("Animal requirements calculated successfully")

    # ===================================================================
    # 3. PROCESS FEED DATA
    # ===================================================================
    logger.info("Processing feed data...")
    # Process feed data using the same logic as rsm_process_feed_library
    f_nd, Dt = rsm_process_feed_dataframe(feed_data)
    logger.info("Feed data processed: %d feeds loaded", len(f_nd['Fd_Name']))


    # ===================================================================
    # 4. RUN OPTIMIZATION
    # ===================================================================
    logger.info("Running ration optimization...")

    # run optimization
    results = rsm_run_optimization(animal_requirements=animal_requirements, f_nd=f_nd, cfg=RUN_CONFIG)

    # Check if optimization was successful
    if results is None:
        logger.error("Optimization failed - no results returned")
        return {
            'status': 'ERROR',
            'error_message': 'Optimization failed - no results returned',
            'simulation_id': simulation_id,
            'user_id': user_id,
            'report_id': report_id
        }

    #result = analyze_optimization_population(results, f_nd, animal_requirements)
    #if result["success"]:
    #     print(f"Exported {result['solutions_analyzed']} solutions to {result['output_file']}")
    #plot_pareto(results, save_path="pareto_front.png")
    #print("Saved Pareto figure: pareto_front.png")

    # ===================================================================
    # 5. POST-OPTIMIZATION ANALYSIS
    # ===================================================================
    logger.info("Analyzing optimization results...")
    post_results = rsm_run_post_optimization_analysis(results, f_nd, animal_requirements)
    
    # Check if post-optimization analysis was successful
    if post_results is None:
        logger.error("Post-optimization analysis failed - no results returned")
        return {
            'status': 'ERROR',
            'error_message': 'Post-optimization analysis failed - no results returned',
            'simulation_id': simulation_id,
            'user_id': user_id,
            'report_id': report_id
        }
    
    # Display policy analysis (unified for both success and failure)
    violation_report = post_results.get('violation_report', {})
    policy = violation_report.get('policy', {})
    
    if post_results['status'] != 'SUCCESS':
        logger.error("Post-optimization analysis failed: %s", post_results.get('error_message', 'Unknown error'))
    else:
        logger.info("Post-optimization analysis completed")
    
    # Single policy display logic
    if policy:
        logger.info("POLICY ANALYSIS: %s | %s", policy.get('title', 'Policy Analysis'), policy.get('summary', 'No summary available'))
        for msg in policy.get('user_messages', []):
            logger.info(msg)
    elif violation_report.get('console_output'):
        logger.info("CONSTRAINT ANALYSIS: %s", violation_report['console_output'])
    
    # Return error instead of exiting
    if post_results['status'] != 'SUCCESS':
        return {
            'status': 'FAILED',
            'error_message': post_results.get('error_message', 'Post-optimization analysis failed'),
            'violation_report': post_results.get('violation_report', {}),
            'post_optimization': post_results
        }

    # ===================================================================
    # 6. DISPLAY FINAL RESULTS
    # ===================================================================
    logger.info("RATION FORMULATION COMPLETED SUCCESSFULLY!")
    for key, value in post_results.items():
        if isinstance(value, (int, float, str)):
            logger.debug("  %s: %s", key, value)
        else:
            logger.debug("  %s: %s", key, type(value).__name__)
    logger.info("All operations completed successfully!")
    
    # Add metadata to post_results (same as dr_main) to fix dr_generate_report compatibility
    post_results.update({
        "simulation_id": simulation_id,
        "user_id": user_id,
        "report_id": report_id,
        # "animal_inputs": animal_inputs,  # COMMENTED OUT: This was overwriting the DataFrame with a dict, causing 'dict' object has no attribute 'empty' error in rsm_generate_report()
        "animal_requirements": animal_requirements,
        "feed_data": feed_data.to_dict('records') if hasattr(feed_data, 'to_dict') else feed_data,
        "optimization_config": RUN_CONFIG
    })
    
    # Return results for API consumption
    return {
        'status': 'SUCCESS',
        'post_results': post_results, # satish
        'animal_requirements': animal_requirements,
        'optimization_results': results,
        'simulation_id': simulation_id,
        'user_id': user_id,
        'report_id': report_id
    }

# python RationSmart.py