import os
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path

import logging

from .utilities import format_value_with_unit, safe_float, ensure_json_safe
from .diet_tables import (
    forage_concentrate_ratio_from_proportions,
    compute_forage_concentrate_ratio,
)

logger = logging.getLogger(__name__)


def _build_animal_information(cattle_info, env_grazing):
    """
    Build the standardized animal-information block shared by the diet
    recommendation and diet evaluation responses. Presentation layer only:
    each field is formatted for display; no engine values are altered.

    The milk fields are shown only for a Lactating Cow. For every other state they
    are displayed as 0 — mirroring diet_service._neutralize_lactation_fields — so the
    "Animal Information" block never shows milk values the engine did not use (a
    caller may submit a stray milk_production for a Dry Cow; the schema does not force
    it to 0, but the report must stay consistent with the computed ration).
    """
    is_lactating = getattr(cattle_info, 'physiological_state', None) == "Lactating Cow"
    milk_production = cattle_info.milk_production if is_lactating else 0
    days_in_milk = cattle_info.days_in_milk if is_lactating else 0
    tp_milk = cattle_info.tp_milk if is_lactating else 0
    fat_milk = cattle_info.fat_milk if is_lactating else 0
    return {
        'breed': cattle_info.breed or None,
        'physiological_state': getattr(cattle_info, 'physiological_state', None),
        'body_weight': format_value_with_unit(cattle_info.body_weight, 'Kg'),
        'bw_gain': format_value_with_unit(cattle_info.bw_gain, 'kg/day'),
        'bc_score': cattle_info.bc_score or None,
        'days_in_milk': format_value_with_unit(days_in_milk, 'Days'),
        'milk_production': format_value_with_unit(milk_production, 'Liter'),
        'tp_milk': format_value_with_unit(tp_milk, '%'),
        'fat_milk': format_value_with_unit(fat_milk, '%'),
        'parity': cattle_info.parity or None,
        'days_of_pregnancy': format_value_with_unit(cattle_info.days_of_pregnancy, 'Days'),
        'temperature': format_value_with_unit(cattle_info.temperature, '°C'),
        'distance': round(safe_float(cattle_info.distance), 2),
        'grazing': getattr(cattle_info, 'grazing', env_grazing == 1),
        'topography': cattle_info.topography
    }


def _build_margin_summary(milk_price, cost_per_liter, daily_cost, milk_qty, currency="$"):
    """
    Compare the user-supplied milk selling rate against the diet's cost per liter.

    Returns None when no milk price was supplied or `milk_qty` is non-positive
    (nothing to compare against). Otherwise returns the margin fields plus an
    explicit `comparison` verdict ("profitable" | "loss" | "break_even") and a
    human-readable `message`. The verdict uses the 2-dp-rounded margin, so a
    sub-cent difference reads as break-even — consistent with the displayed value.

    margin_per_liter = milk_price - cost_per_liter
    daily_iofc (Income Over Feed Cost) = milk_price * milk_qty - daily_cost
    """
    if milk_price is None or milk_qty <= 0:
        return None

    milk_price = float(milk_price)
    margin_per_liter = round(milk_price - cost_per_liter, 2)
    abs_margin = abs(margin_per_liter)
    # Space multi-char currency codes ("VND 3.00") but not symbols ("$3.00"),
    # matching the HTML report banner's currency_display.
    cur = currency + " " if len(currency) > 1 else currency

    if margin_per_liter > 0:
        comparison = "profitable"
        message = f"Cost per liter is {cur}{abs_margin:.2f} below your milk rate — profitable"
    elif margin_per_liter < 0:
        comparison = "loss"
        message = f"Cost per liter is {cur}{abs_margin:.2f} above your milk rate — loss"
    else:
        comparison = "break_even"
        message = "Cost per liter equals your milk rate — break-even"

    return {
        "milk_price": round(milk_price, 2),
        "cost_per_liter": round(cost_per_liter, 2),
        "margin_per_liter": margin_per_liter,
        "daily_iofc": round(milk_price * milk_qty - daily_cost, 2),
        "is_positive": margin_per_liter >= 0,
        "comparison": comparison,
        "message": message,
    }


def build_diet_response(
    optimization_results: Dict[str, Any],
    cattle_info: Any,
    simulation_id: str,
    report_id: str,
    user_name: str,
    currency: str = "$",
    name_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    SINGLE SOURCE OF TRUTH: Builds the formatted JSON response for both
    the API response and the background PDF report.

    name_map: optional {english_feed_name: translated_name}. When provided, each
    diet row gains a localized `display_name` (additive — English `feed_name` is
    preserved). Applied at the display layer only; the optimizer's English names
    are untouched.
    """
    name_map = name_map or {}
    post_results = optimization_results.get('post_results', {})
    
    # Get derived grazing status from engine results
    animal_reqs = optimization_results.get('animal_requirements', {})
    env_grazing = animal_reqs.get('Env_Grazing', 0)
    
    # 1. Animal Information (Formatted)
    animal_information = _build_animal_information(cattle_info, env_grazing)

    # 2. Least Cost Diet
    diet_table = post_results.get('diet_table', [])
    least_cost_diet = []
    total_diet_cost = 0.0
    
    if hasattr(diet_table, 'to_dict'):
        diet_records = diet_table.to_dict('records')
    else:
        diet_records = diet_table if isinstance(diet_table, list) else []
        
    for feed in diet_records:
        quantity_kg_day = feed.get('Inclusion_AF_kg', 0.0)
        if quantity_kg_day > 0:
            feed_cost = feed.get('Total_Cost', 0.0)
            total_diet_cost += feed_cost
            ingredient = feed.get('Ingredient') if feed.get('Ingredient') is not None else ""
            least_cost_diet.append({
                'feed_name': ingredient,
                'display_name': name_map.get(ingredient, ingredient),
                'quantity_kg_per_day': round(quantity_kg_day, 2),
                'price_per_kg': round(feed.get('Cost_per_kg', 0.0), 2),
                'daily_cost': round(feed_cost, 2)
            })

    # 3. Environmental Impact
    methane_report = post_results.get('methane_report', {})
    environmental_impact = {
        'methane_production_grams_per_day': 0.0,
        'methane_yield_grams_per_kg_dmi': 0.0,
        'methane_intensity_grams_per_kg_ecm': 0.0,
        'Ym (%)': 0.0,
        'classification': "Unknown"
    }
    
    # Mapping for human-readable methane efficiency descriptions
    METHANE_DESC_MAP = {
        "Extremely Low": "Highly efficient; very little energy lost to methane.",
        "Very Low": "Efficient diet.",
        "Low": "Good efficiency.",
        "Average": "The typical range for most cattle.",
        "High": "Inefficient; indicates potential for diet improvement.",
        "Very High": "Highly inefficient; likely very low-quality forage."
    }

    if hasattr(methane_report, 'to_dict'):
        methane_dict = methane_report.to_dict('records')
        if methane_dict:
            methane_lookup = {row['Metric']: row['Value'] for row in methane_dict}
            short_class = methane_lookup.get('Classification', 'Average')
            environmental_impact = {
                'methane_production_grams_per_day': round(float(methane_lookup.get('Methane Production (g/day)', 0.0)), 2) if 'Methane Production (g/day)' in methane_lookup else 0.0,
                'methane_yield_grams_per_kg_dmi': round(float(methane_lookup.get('Methane Yield (g/kg DMI)', 0.0)), 2) if 'Methane Yield (g/kg DMI)' in methane_lookup else 0.0,
                'methane_intensity_grams_per_kg_ecm': round(float(methane_lookup.get('Methane Intensity (g/kg ECM)', 0.0)), 2) if 'Methane Intensity (g/kg ECM)' in methane_lookup else 0.0,
                'Ym (%)': round(float(methane_lookup.get('Ym (%)', 0.0)), 2) if 'Ym (%)' in methane_lookup else 0.0,
                'classification': short_class
            }

    # 4. Nutritional Details
    nutritional_details = []
    nutrient_comparison = post_results.get('nutrient_comparison', [])
    if hasattr(nutrient_comparison, 'to_dict'):
        for row in nutrient_comparison.to_dict('records'):
            nutritional_details.append({
                'parameter': row.get('Nutrient', ''),
                'supply': round(row.get('Supplied', 0.0), 2),
                'target': round(row.get('Target', 0.0), 2),
                'unit': row.get('Unit', '')
            })

    # 5. Diet Proportions
    proportions = []
    dt_proportions = post_results.get('dt_proportions', [])
    if hasattr(dt_proportions, 'to_dict'):
        for row in dt_proportions.to_dict('records'):
            proportions.append({
                'category': row.get('Name', ''),
                'af_kg': round(row.get('AF_kg', 0.0), 2),
                'dm_kg': round(row.get('DM_kg', 0.0), 2),
                'af_percent': round(row.get('AF_prop', 0.0), 1),
                'dm_percent': round(row.get('DM_prop', 0.0), 1)
            })

    # 6. Status and Intake
    messages_obj = post_results.get('constraint_messages', {})
    if not messages_obj and optimization_results.get('status') in ['FAILED', 'ERROR']:
        # Pull messages from post_results if constraint_messages is missing (Failure path)
        messages_obj = {
            'status': post_results.get('status', optimization_results.get('status')),
            'messages': post_results.get('messages', [])
        }

    daily_cost = float(post_results.get('total_cost', 0.0))
    # Only a Lactating Cow has a milk yield to cost against; mirror the engine-side
    # neutralization so cost-per-liter / margin stay consistent even if a caller sent
    # a stray milk_production for a non-lactating state.
    is_lactating = getattr(cattle_info, 'physiological_state', None) == "Lactating Cow"
    milk_prod = float(cattle_info.milk_production) if is_lactating else 0.0
    cost_per_liter = round(daily_cost / milk_prod, 2) if milk_prod > 0 else 0.0

    # Milk selling rate vs. diet cost-per-liter comparison (optional input).
    milk_price = getattr(cattle_info, 'milk_price', None)
    if milk_price is None:
        milk_price = post_results.get('milk_price')
    margin_summary = _build_margin_summary(
        milk_price, cost_per_liter, daily_cost, milk_prod, currency
    )

    # Get dry matter intake
    dt_kg = post_results.get('Dt_kg', {})
    dry_matter_intake = 0.0
    if hasattr(dt_kg, 'to_dict'):
        dt_dict = dt_kg.to_dict('records')
        for row in dt_dict:
            if row.get('Ingr_Name') == 'Total':
                dry_matter_intake = round(float(row.get('Intake_DM', 0.0)), 2)
                break
        else:
            dry_matter_intake = round(sum(float(row.get('Intake_DM', 0.0)) for row in dt_dict), 2)
    
    # Check for failure status
    diet_rating = messages_obj.get('status', 'UNKNOWN').upper()
    status_messages = messages_obj.get('messages', [])
    
    # Positive messaging for SUCCESS
    if diet_rating == "SUCCESS":
        status_messages = ["This diet is well-balanced and meets all nutritional requirements."]
        
    if not status_messages and optimization_results.get('error_message'):
        status_messages = [optimization_results.get('error_message')]

    # 7. Advice Engine Integration (Optional/Pluggable)
    recommendations = [msg for msg in status_messages if 'recommendation' in msg.lower() or 'suggestion' in msg.lower()]
    
    # Try to use the new advice engine if enabled in config
    try:
        from .config import ENABLE_ADVICE_ENGINE
        if ENABLE_ADVICE_ENGINE:
            # Skip advice engine for SUCCESS to avoid fallback warnings
            if diet_rating not in ["SUCCESS", "PERFECT"]:
                from .advice_engine import get_recommendations
                # Worst constraints contains the raw reasons for failure
                worst_constraints = post_results.get('worst_constraints', [])
                # Feed table contains the ingredients selected (needed for balance checks)
                feed_table = post_results.get('diet_table', [])
                
                # Generate more helpful advice
                advice = get_recommendations(worst_constraints, feed_table if isinstance(feed_table, list) else [])
                if advice:
                    # Merge with any existing recommendations from the engine
                    for a in advice:
                        if a not in recommendations:
                            recommendations.append(a)
            else:
                # For SUCCESS, we can add a positive recommendation
                recommendations.append("Continue monitoring animal performance and adjust as needed.")
    except Exception as e:
        logger.warning(f"Advice engine failed or disabled: {str(e)}")

    # NEW: Extract diet_status and violated_parameters for independent API keys
    diet_status_val = "Optimal" if diet_rating in ["SUCCESS", "PERFECT"] else "Unknown"
    violated_params_list = []
    
    is_capturing_violations = False
    for msg in status_messages:
        if not isinstance(msg, str):
            continue
        clean_msg = msg.strip()
        if clean_msg.startswith("Diet status:"):
            diet_status_val = clean_msg.replace("Diet status:", "").strip()
        elif any(header in clean_msg for header in ["Violated parameters:", "Critical issues:", "Key issues:"]):
            is_capturing_violations = True
        elif is_capturing_violations:
            # All lines after the header are actual violations
            if clean_msg:
                violated_params_list.append(clean_msg)

    # Forage-to-concentrate ratio on a fresh-matter (as-fed) basis, e.g. "60:40".
    forage_concentrate_ratio = forage_concentrate_ratio_from_proportions(
        post_results.get('dt_proportions'), post_results.get('dt_forages')
    )

    # Build final structure
    response_data = {
        'report_info': {
            'simulation_id': simulation_id,
            'report_id': report_id,
            'user_name': user_name,
            'generated_date': datetime.now().isoformat(),
            'diet_rating': diet_rating
        },
        'solution_summary': {
            'daily_cost': round(daily_cost, 2),
            'cost_per_liter': round(cost_per_liter, 2),
            'currency': currency,
            'milk_production': animal_information.get('milk_production', '0 Liter'),
            'dry_matter_intake': format_value_with_unit(dry_matter_intake, 'kg/day') if dry_matter_intake > 0 else "0 kg/day",
            'predicted_water_intake': format_value_with_unit(post_results.get('water_intake', 0.0), 'L/day') if post_results.get('water_intake', 0.0) > 0 else "0 L/day",
            'forage_concentrate_ratio': forage_concentrate_ratio,
            'margin_summary': margin_summary
        },
        'animal_information': animal_information,
        'least_cost_diet': least_cost_diet,
        'diet_proportions': proportions,
        'nutritional_details': nutritional_details,
        'total_diet_cost': round(total_diet_cost, 2),
        'environmental_impact': environmental_impact,
        'additional_information': {
            'diet_status': diet_status_val,
            'violated_parameters': violated_params_list,
            'worst_constraints': post_results.get('worst_constraints', []),
            'recommendations': recommendations[:1]
        },
        # B2: safety caps that overrode a per-feed limit the user entered. Previously the
        # clamp happened silently — a farmer could ask for 2 kg of an ingredient, receive
        # 0.13 kg, and be told the diet was optimal.
        'warnings': list(post_results.get('bound_warnings') or []),
    }

    return ensure_json_safe(response_data)

def build_calf_recommendation_response(
    animal_requirements: Dict[str, Any],
    cattle_info: Any,
    simulation_id: str,
    report_id: str,
) -> Dict[str, Any]:
    """Build the API response for a Baby Calf/Heifer recommendation.

    A baby calf has no least-cost solid-feed ration — the recommendation IS the
    milk-feeding schedule (morning / evening / total litres) produced by the
    requirements path. No optimizer output is involved. Water intake is intentionally
    omitted: it is only computed in the post-optimization diet step, which a calf never
    runs (see the animal-category plan). `solution_status="MILK_FEEDING_ONLY"` signals
    to the frontend that this is a milk schedule, not a solved ration.
    """
    milk_total = float(animal_requirements.get("milk_total", 0) or 0)
    milk_morning = float(animal_requirements.get("milk_morning", 0) or 0)
    milk_evening = float(animal_requirements.get("milk_evening", 0) or 0)
    dmi = float(animal_requirements.get("Trg_Dt_DMIn", 0) or 0)
    an_bw = float(animal_requirements.get("An_BW", 0) or 0)
    intake_pct_bw = round((dmi / an_bw) * 100, 2) if an_bw > 0 else 0.0

    animal_information = _build_animal_information(
        cattle_info, animal_requirements.get("Env_Grazing", 0)
    )

    response_data = {
        "simulation_id": simulation_id,
        "report_id": report_id,
        "physiological_state": "Baby Calf/Heifer",
        "solution_status": "MILK_FEEDING_ONLY",
        "animal_information": animal_information,
        "calf_feeding_schedule": {
            "daily_milk_allowance_liters": round(milk_total, 1),
            "morning_liters": round(milk_morning, 1),
            "evening_liters": round(milk_evening, 1),
            "table": [
                {"feeding_time": "Morning", "milk_liters": round(milk_morning, 1)},
                {"feeding_time": "Evening", "milk_liters": round(milk_evening, 1)},
                {"feeding_time": "Total per Day", "milk_liters": round(milk_total, 1)},
            ],
        },
        "animal_requirements": {
            "dry_matter_intake": format_value_with_unit(round(dmi, 2), "kg/day"),
            "intake_pct_bw": format_value_with_unit(intake_pct_bw, "%BW"),
        },
        "recommendations": [
            "Feed milk only, split between morning and evening. Solid-feed ration "
            "formulation does not apply to a baby calf (milk intake only, up to ~8 weeks of age)."
        ],
        "warnings": [],
    }
    return ensure_json_safe(response_data)


def build_evaluation_response(
    evaluation_results: Dict[str, Any],
    cattle_info: Any,
    simulation_id: str,
    report_id: str,
    currency: str,
    country_name: str,
    feed_evaluation: List[Any],
    feeds: List[Any],
    name_map: Optional[Dict[str, str]] = None,
    type_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    SINGLE SOURCE OF TRUTH: Builds the formatted JSON response for both
    the API response and the background PDF report for diet evaluation.

    name_map / type_map: optional {english: translated} for feed names and feed
    types. When provided, each feed_breakdown row gains localized display_name /
    display_type (additive — English feed_name/feed_type preserved). Display layer
    only; the engine's internal English names are untouched.
    """
    name_map = name_map or {}
    type_map = type_map or {}
    milk_support = evaluation_results.get("milk_support", {})
    post_results = evaluation_results.get("post_results", {})
    ingredient_amounts_dm = evaluation_results.get("ingredient_amounts_dm", [])
    ingredient_amounts_af = evaluation_results.get("ingredient_amounts_af", [])
    f_nd = evaluation_results.get("f_nd", {})
    animal_requirements = evaluation_results.get("animal_requirements", {})

    # 0. Animal Information (Standardized format for consistency)
    env_grazing = animal_requirements.get('Env_Grazing', 0)
    
    animal_information = _build_animal_information(cattle_info, env_grazing)

    # 1. Milk Production Analysis
    milk_production_analysis = {
        "target_production_kg_per_day": round(milk_support.get("Milk_Target_Production", 0.0), 2),
        "milk_supported_by_energy_kg_per_day": round(milk_support.get("Milk_Energy_Supported", 0.0), 2),
        "milk_supported_by_protein_kg_per_day": round(milk_support.get("Milk_Protein_Supported", 0.0), 2),
        "actual_milk_supported_kg_per_day": round(milk_support.get("Milk_Supported", 0.0), 2),
        "limiting_nutrient": milk_support.get("Limiting_Nutrient", "Unknown"),
        "energy_available_mcal": round(milk_support.get("NEL_Available", 0.0), 2),
        "protein_available_g": round(milk_support.get("MP_Available_kg", 0.0) * 1000, 2),
        "warnings": [],
        "recommendations": []
    }

    # 2. Intake Evaluation
    intake_evaluation = {
        "intake_status": milk_support.get("DMI_Status", "Unknown"),
        "actual_intake_kg_per_day": round(milk_support.get("DMI_Actual", 0.0), 2),
        "target_intake_kg_per_day": round(milk_support.get("DMI_Target", 0.0), 2),
        "intake_difference_kg_per_day": round(milk_support.get("DMI_Difference", 0.0), 2),
        "intake_percentage": round(milk_support.get("DMI_Percent", 0.0), 2),
        "warnings": [],
        "recommendations": []
    }

    # 3. Cost Analysis
    # Milk selling rate vs. diet cost-per-liter comparison (optional input). For
    # evaluation, revenue uses the milk the diet actually supports (same denominator
    # as feed_cost_per_kg_milk).
    eval_daily_cost = float(milk_support.get("Diet_Cost_Total_AF", 0.0))
    eval_cost_per_liter = float(milk_support.get("Feed_Cost_Per_L_Milk", 0.0))
    eval_milk_supported = float(milk_support.get("Milk_Supported", 0.0))
    milk_price = getattr(cattle_info, 'milk_price', None)
    if milk_price is None:
        milk_price = post_results.get('milk_price')
    margin_summary = _build_margin_summary(
        milk_price, eval_cost_per_liter, eval_daily_cost, eval_milk_supported, currency
    )

    cost_analysis = {
        "total_diet_cost_as_fed": round(milk_support.get("Diet_Cost_Total_AF", 0.0), 2),
        "feed_cost_per_kg_milk": round(milk_support.get("Feed_Cost_Per_L_Milk", 0.0), 2),
        "currency": currency,
        "margin_summary": margin_summary,
        "warnings": [],
        "recommendations": []
    }

    # 4. Methane Analysis
    methane_report = evaluation_results.get("methane_report", {})
    methane_analysis = {
        "methane_emission_mj_per_day": round(milk_support.get("CH4_MJ", 0.0), 2),
        "methane_production_g_per_day": round(milk_support.get("CH4_grams", 0.0), 2),
        "methane_yield_g_per_kg_dmi": round(milk_support.get("CH4_grams_per_kg_DMI", 0.0), 2),
        "methane_intensity_g_per_kg_ecm": round(milk_support.get("CH4_intensity", 0.0), 2),
        "Ym (%)": round(milk_support.get("MCR", 0.0), 2),
        "classification": "Normal",
        "warnings": [],
        "recommendations": []
    }

    # Mapping for human-readable methane efficiency descriptions
    METHANE_DESC_MAP = {
        "Extremely Low": "Highly efficient; very little energy lost to methane.",
        "Very Low": "Efficient diet.",
        "Low": "Good efficiency.",
        "Average": "The typical range for most cattle.",
        "High": "Inefficient; indicates potential for diet improvement.",
        "Very High": "Highly inefficient; likely very low-quality forage."
    }

    if hasattr(methane_report, 'to_dict'):
        methane_dict = methane_report.to_dict('records')
        if methane_dict:
            methane_lookup = {row['Metric']: row['Value'] for row in methane_dict}
            short_class = methane_lookup.get('Classification', 'Average')
            
            # Update with engine values for consistency
            methane_analysis["methane_production_g_per_day"] = round(float(methane_lookup.get('Methane Production (g/day)', 0.0)), 2)
            methane_analysis["methane_yield_g_per_kg_dmi"] = round(float(methane_lookup.get('Methane Yield (g/kg DMI)', 0.0)), 2)
            methane_analysis["methane_intensity_g_per_kg_ecm"] = round(float(methane_lookup.get('Methane Intensity (g/kg ECM)', 0.0)), 2)
            methane_analysis["Ym (%)"] = round(float(methane_lookup.get('Ym (%)', 0.0)), 2)
            methane_analysis["classification"] = short_class
    else:
        # Fallback to simple classification if report is missing
        mcr = milk_support.get("MCR", 0.0)
        if 5 <= mcr <= 7:
            short_class = "Average"
        elif mcr > 7:
            short_class = "High"
        else:
            short_class = "Low"
        methane_analysis["classification"] = short_class

    # 5. Nutrient Balance
    # Calculate mineral balances (supply - requirement)
    ingredient_amounts_DM_array = np.array(ingredient_amounts_dm)
    
    ca_balance = 0.0
    p_balance = 0.0
    ndf_balance = 0.0
    
    if "Fd_Ca" in f_nd and "Fd_P" in f_nd and "Fd_NDF" in f_nd:
        ca_supply = np.sum(ingredient_amounts_DM_array * np.array(f_nd["Fd_Ca"]) / 100)
        p_supply = np.sum(ingredient_amounts_DM_array * np.array(f_nd["Fd_P"]) / 100)
        ndf_supply = np.sum(ingredient_amounts_DM_array * np.array(f_nd["Fd_NDF"]) / 100)
        
        ca_requirement = animal_requirements.get("An_Ca_req", 0)
        p_requirement = animal_requirements.get("An_P_req", 0)
        
        ca_balance = ca_supply - ca_requirement
        p_balance = p_supply - p_requirement
        ndf_balance = ndf_supply

    nutrient_balance = {
        "energy_balance_mcal": round(milk_support.get("NEL_Available", 0.0), 2),
        "protein_balance_kg": round(milk_support.get("MP_Available_kg", 0.0), 2),
        "calcium_balance_kg": round(float(ca_balance), 2),
        "phosphorus_balance_kg": round(float(p_balance), 2),
        "ndf_balance_kg": round(float(ndf_balance), 2),
        "warnings": [],
        "recommendations": []
    }

    # 6. Feed Breakdown (Preserving User Order)
    feed_breakdown = []
    # Create a mapping of feed_id to its index in the engine's f_nd results
    # The feeds list passed to evaluate_diet corresponds to f_nd order
    engine_feed_names = list(f_nd.get("Fd_Name", []))

    # Raw (unrounded) as-fed totals for the forage:concentrate ratio fallback, accumulated
    # by type over the same feeds that make it into feed_breakdown.
    fallback_forage_af = 0.0
    fallback_concentrate_af = 0.0

    for item in feed_evaluation:
        feed_id = item.feed_id
        # feeds may be ORM objects or plain dicts (from dataclasses.asdict)
        def _fid(f): return str(f["feed_id"] if isinstance(f, dict) else f.id)
        def _fname(f): return (f["fd_name"] if isinstance(f, dict) else f.fd_name) or ""
        feed_obj = next((f for f in feeds if _fid(f) == feed_id), None)
        if not feed_obj:
            continue

        # Find index in engine results
        try:
            idx = engine_feed_names.index(_fname(feed_obj))

            fname = _fname(feed_obj)
            ftype = f_nd["Fd_Type"][idx] if f_nd["Fd_Type"][idx] is not None else ""
            feed_breakdown.append({
                "feed_id": feed_id,
                "feed_name": fname,
                "display_name": name_map.get(fname, fname),
                "feed_type": ftype,
                "display_type": type_map.get(ftype, ftype),
                "quantity_as_fed_kg_per_day": round(float(ingredient_amounts_af[idx]), 2),
                "quantity_dm_kg_per_day": round(float(ingredient_amounts_dm[idx]), 2),
                "price_per_kg": round(float(f_nd["Fd_Cost"][idx]), 2),
                "total_cost": round(float(ingredient_amounts_af[idx] * f_nd["Fd_Cost"][idx]), 2),
                "contribution_percent": round((ingredient_amounts_af[idx] / sum(ingredient_amounts_af)) * 100, 2) if sum(ingredient_amounts_af) > 0 else 0
            })
            af_raw = float(ingredient_amounts_af[idx])
            if ftype == "Forage":
                fallback_forage_af += af_raw
            else:
                fallback_concentrate_af += af_raw
        except (ValueError, IndexError):
            continue

    # Forage-to-concentrate ratio on a fresh-matter (as-fed) basis, e.g. "60:40".
    # Prefer the engine's forage/concentrate proportion frames; fall back to the raw as-fed
    # totals accumulated above (forage = feed_type == "Forage"; concentrate side is everything
    # else, incl. minerals).
    forage_concentrate_ratio = forage_concentrate_ratio_from_proportions(
        post_results.get('dt_proportions'), post_results.get('dt_forages')
    )
    if forage_concentrate_ratio is None and feed_breakdown:
        forage_concentrate_ratio = compute_forage_concentrate_ratio(
            fallback_forage_af, fallback_concentrate_af
        )

    # 7. Evaluation Summary
    evaluation_summary = {
        "overall_status": "Adequate" if milk_support.get("DMI_Status") == "Adequate" else "Marginal",
        "limiting_factor": milk_production_analysis["limiting_nutrient"],
        "forage_concentrate_ratio": forage_concentrate_ratio
    }

    response_data = {
        "simulation_id": simulation_id,
        "report_id": report_id,
        "currency": currency,
        "country": country_name,
        "animal_information": animal_information,
        "evaluation_summary": evaluation_summary,
        "milk_production_analysis": milk_production_analysis,
        "intake_evaluation": intake_evaluation,
        "cost_analysis": cost_analysis,
        "methane_analysis": methane_analysis,
        "nutrient_balance": nutrient_balance,
        "feed_breakdown": feed_breakdown
    }

    return ensure_json_safe(response_data)

# generate_evaluation_background_reports and generate_background_reports have been
# moved to services/report_service.py (Task 2.8) — they owned DB sessions and S3
# uploads which do not belong in the pure optimization core.

def generate_evaluation_background_reports(
    evaluation_results: Dict[str, Any],
    user_id: str,
    simulation_id: str,
    report_id: str,
    cattle_info: Any,
    currency: str = "$",
    country_name: str = "Unknown",
    feed_evaluation: List[Any] = [],
    feeds: List[Any] = [],
    user_name: str = "User",
    db_session: Any = None,
):
    """
    Runs in background task. Generates HTML and PDF reports for diet evaluation.
    """
    try:
        # 1. Prepare data using shared builder
        api_response_data = build_evaluation_response(
            evaluation_results, cattle_info, simulation_id, report_id, currency, country_name, feed_evaluation, feeds
        )

        # 2. Generate HTML Report
        os.makedirs("result_html", exist_ok=True)
        html_report_path = f"result_html/diet-{report_id}.html"
        abs_html_path = os.path.abspath(html_report_path)
        logger.info(f"[{simulation_id}] Generating Evaluation HTML report at: {abs_html_path}")
        
        from .report_generation import rsm_generate_report_v2 as rsm_generate_report
        rsm_generate_report(
            evaluation_results.get('post_results', {}), 
            evaluation_results.get('animal_requirements', {}), 
            html_report_path,
            user_name=user_name,
            simulation_id=simulation_id,
            report_id=report_id,
            evaluation_mode=True,
            country_name=country_name,
            currency=currency
        )
        logger.info(f"[{simulation_id}] Evaluation HTML report created")

        # 3. Generate PDF and Save to S3/DB
        # SessionLocal is never created in core (Task 2.8). The caller must pass
        # db_session; if none is provided the PDF/upload step is skipped silently.
        if db_session is not None:
            from .pdf_service import eval_pdf_report_generator_v2
            eval_pdf_report_generator_v2(
                api_response_data,
                user_id,
                simulation_id,
                report_id,
                db_session,
            )
            logger.info(f"[{simulation_id}] Background evaluation report generation complete")

    except Exception as e:
        logger.error(f"[{simulation_id}] Background evaluation report task failed: {str(e)}", exc_info=True)

def generate_background_reports(
    optimization_results: Dict[str, Any],
    user_id: str,
    simulation_id: str,
    report_id: str,
    cattle_info: Any,
    user_name: str = "User",
    country_name: str = "Vietnam",
    currency: str = "$",
    db_session: Any = None,
    api_response_data: Optional[Dict[str, Any]] = None,
):
    """
    Runs in background task. Generates HTML and PDF reports.
    If api_response_data is provided from the main API thread, it reuses it
    to avoid redundant formatting work.
    """
    try:
        # 1. Use provided data or build it if missing
        if api_response_data is None:
            api_response_data = build_diet_response(
                optimization_results, cattle_info, simulation_id, report_id, user_name, currency=currency
            )

        # 2. Generate HTML Report
        os.makedirs("result_html", exist_ok=True)
        # PATH UPDATE: as requested result_html/diet-{report_id}.html
        html_report_path = f"result_html/diet-{report_id}.html"
        abs_html_path = os.path.abspath(html_report_path)
        logger.info(f"[{simulation_id}] Generating HTML report at absolute path: {abs_html_path}")
        
        from .report_generation import rsm_generate_report_v2 as rsm_generate_report
        rsm_generate_report(
            optimization_results.get('post_results', {}), 
            optimization_results.get('animal_requirements', {}), 
            html_report_path,
            user_name=user_name,
            simulation_id=simulation_id,
            report_id=report_id,
            country_name=country_name,
            currency=currency,
            recommendations=api_response_data.get('additional_information', {}).get('recommendations', [])
        )
        logger.info(f"[{simulation_id}] HTML report created: {html_report_path}")

        # 3. Generate PDF and Save to S3/DB
        # SessionLocal is never created in core (Task 2.8). The caller must pass
        # db_session; if none is provided the PDF/upload step is skipped silently.
        if db_session is not None:
            from .pdf_service import rec_pdf_report_generator_v2
            rec_pdf_report_generator_v2(
                api_response_data,
                user_id,
                simulation_id,
                report_id,
                db_session,
            )
            logger.info(f"[{simulation_id}] Background report generation complete")

    except Exception as e:
        logger.error(f"[{simulation_id}] Background report task failed: {str(e)}", exc_info=True)
