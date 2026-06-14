import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

from .animal_requirements import (
    rsm_calculate_an_requirements,
    rsm_create_animal_inputs_dataframe,
)
from .feed_processing import rsm_process_feed_library, rsm_process_feed_dataframe
from .optimization_core import rsm_diet_supply
from .diet_tables import (
    rsm_calculate_methane_emissions,
    rsm_calculate_water_intake,
    rsm_create_diet_table,
    rsm_create_final_diet_dataframe,
    rsm_create_proportions_dataframe,
    rsm_create_ration_evaluation,
    rsm_generate_nutrient_comparison,
)
from .report_generation import generate_report_from_runner_results
from .utilities import (
    convert_af_to_dm,
    rename_variable,
    replace_na_and_negatives,
)

# Milk support prediction
# Purpose: Estimate milk production supported by nutrient supply and derive cost/emission metrics.
# Notes: Returns dict of milk support, intake status, cost per milk, and methane indicators.
def predict_total_milk_supported(Supply_NEl, Supply_MP, Supply_DMIn, Trg_Dt_DMIn,
                               An_NELm, An_NEgest, An_NELgain, An_NELlact, 
                               An_MPm, An_MPg, An_MPp, 
                               Trg_NEmilk_Milk, Trg_MilkTPp, Trg_MilkProd, An_LactDay,
                               An_BW, ingredient_amounts_DM, f_nd, An_StatePhys, animal_requirements):
        
    MP_efficiency = 0.67          # NRC 2001 - high? 
    # MP per kg milk (g/kg)
    MP_per_kg_milk = (Trg_MilkTPp / 100) / MP_efficiency * 1000
    
    # Milk supported by energy (kg/d)
    NEL_available = Supply_NEl - An_NELm - An_NEgest - An_NELgain
    milk_energy_supported = max(0, NEL_available / Trg_NEmilk_Milk)
    
    # Milk supported by protein (kg/d)
    MP_available = (Supply_MP * 1000) - (An_MPm + An_MPg + An_MPp)
    milk_protein_supported = max(0, MP_available / MP_per_kg_milk)
    MP_Available_kg = MP_available / 1000

    # Limiting factor
    limiting_factor = "Energy" if milk_energy_supported < milk_protein_supported else "Protein"
    
    # DMI evaluation
    dmi_difference = Supply_DMIn - Trg_Dt_DMIn
    dmi_percent = (Supply_DMIn / Trg_Dt_DMIn) * 100 if Trg_Dt_DMIn > 0 else 0
    
    if dmi_percent >= 95 and dmi_percent <= 105:
        dmi_status = "Adequate"
    elif dmi_percent < 95:
        dmi_status = "Below target"
    else:
        dmi_status = "Above target"
    
    # Calculate diet cost (as-fed basis)
    # Convert DM intake to AF intake for each ingredient
    inclusion_DM_kg = f_nd["Fd_DMIn"]
    inclusion_AF_kg = inclusion_DM_kg / (f_nd["Fd_DM"] / 100)  # Convert DM intake to as-fed intake 
    inclusion_AF_kg_rounded = np.round(inclusion_AF_kg, 2)
    diet_cost_total_af = sum(inclusion_AF_kg_rounded * f_nd["Fd_Cost"])  
    
    # Calculate feed cost per kg milk
    milk_produced = np.round(min(milk_energy_supported, milk_protein_supported), 2)
    feed_cost_per_l_milk = diet_cost_total_af / milk_produced if milk_produced > 0 else 0

    Dt_DMInSum = sum(ingredient_amounts_DM)  # Total DM intake from all ingredients

    An_BW = animal_requirements["An_BW"]
    Trg_MilkTPp = animal_requirements["Trg_MilkTPp"]
    Trg_MilkFatp = animal_requirements["Trg_MilkFatp"]

    # Calculate diet composition values
    EE_diet = (sum(ingredient_amounts_DM * (f_nd["Fd_EE"] / 100)) / Dt_DMInSum) * 100
    FA_diet = (sum(ingredient_amounts_DM * (f_nd["Fd_FA"] / 100)) / Dt_DMInSum) * 100
    NDF_diet = (sum(ingredient_amounts_DM * (f_nd["Fd_NDF"] / 100)) / Dt_DMInSum) * 100
    CP_diet = sum(ingredient_amounts_DM * (f_nd["Fd_CP"]/100)) / Dt_DMInSum * 100
    
    GE_diet = (f_nd["Fd_GE"] * ingredient_amounts_DM).sum()  # Mcal/d
   
    # Calculate Methane in g/d
    if An_StatePhys == "Lactating Cow":
        CH4 = (76.0 + 13.5 * Dt_DMInSum - 9.55 * EE_diet + 2.24 * NDF_diet)
    elif An_StatePhys == "Dry Cow":
        CH4 = (0.69 + 0.053 * GE_diet - 0.0789 * FA_diet) * 4184 / 55.5
    elif An_StatePhys == "Heifer":
        CH4 = (-0.038 + 0.051 * GE_diet - 0.0091 * NDF_diet) * 4184 / 55.5
    else:
        CH4 = 0  # Default for unknown animal types
    
    # Methane Intensity
    CH4_intensity = -0.101 - 0.215 * Dt_DMInSum - 0.118 * CP_diet - 0.323 * EE_diet + 0.120 * NDF_diet - 0.253 * Trg_MilkFatp + 3.44 * Trg_MilkTPp + 0.00947 * An_BW

    # Methane metrics
    CH4_MJ = CH4 * 55.5/1000  # convert from g to MJ
    GE_MJ = GE_diet * 4.184   # convert from Mcal to MJ
    CH4_grams_per_kg_DMI = CH4 / Dt_DMInSum if Dt_DMInSum > 0 else 0
    MCR = (CH4_MJ / GE_MJ) * 100 if GE_MJ > 0 else 0
    
    return {
        "Milk_Target_Production": round(Trg_MilkProd, 2),
        "Milk_Energy_Supported": round(milk_energy_supported, 2),
        "Milk_Protein_Supported": round(milk_protein_supported, 2),
        "Milk_Supported": round(min(milk_energy_supported, milk_protein_supported), 2),
        "Limiting_Nutrient": limiting_factor,
        "NEL_Available": round(NEL_available, 2),
        "MP_Available_kg": round(MP_Available_kg, 2),
        "DMI_Status": dmi_status,
        "DMI_Actual": round(Supply_DMIn, 2),
        "DMI_Target": round(Trg_Dt_DMIn, 2),
        "DMI_Difference": round(dmi_difference, 2),
        "DMI_Percent": round(dmi_percent, 2),
        "Diet_Cost_Total_AF": round(diet_cost_total_af, 2),
        "Feed_Cost_Per_L_Milk": round(feed_cost_per_l_milk, 2),
        "CH4_MJ": round(CH4_MJ, 2),
        "CH4_grams": round(CH4, 2),
        "CH4_grams_per_kg_DMI": round(CH4_grams_per_kg_DMI, 2),
        "CH4_intensity": round(CH4_intensity, 2),
        "MCR": round(MCR, 2)
    }

# Purpose: Build evaluation tables for reporting and reuse across outputs.
# Notes: Returns dict of tables and summary values derived from diet and requirements.
def build_evaluation_tables(ingredient_amounts_dm, f_nd, animal_requirements, diet_supply_results):

    diet_table, total_cost_real = rsm_create_diet_table(ingredient_amounts_dm, f_nd)
    nutrient_comparison = rsm_generate_nutrient_comparison(
        diet_supply_results, animal_requirements, f_nd
    )
    Dt, final_diet_df, Dt_DMInSum, Dt_AFIn = rsm_create_final_diet_dataframe(
        diet_table, f_nd
    )
    water_intake = rsm_calculate_water_intake(
        Dt_DMInSum, Dt_AFIn, f_nd, animal_requirements, ingredient_amounts_dm
    )
    ration_evaluation = rsm_create_ration_evaluation(
        diet_supply_results, animal_requirements, diet_table, f_nd, ingredient_amounts_dm
    )
    dt_proportions, dt_forages, dt_concentrates, dt_results = rsm_create_proportions_dataframe(
        Dt, Dt_DMInSum
    )
    methane_report = rsm_calculate_methane_emissions(
        Dt, Dt_DMInSum, f_nd, animal_requirements, ingredient_amounts_dm
    )
    return {
        "diet_table": diet_table,
        "total_cost_real": total_cost_real,
        "nutrient_comparison": nutrient_comparison,
        "Dt": Dt,
        "Dt_kg": final_diet_df,
        "Dt_DMInSum": Dt_DMInSum,
        "Dt_AFIn": Dt_AFIn,
        "water_intake": water_intake,
        "ration_evaluation": ration_evaluation,
        "dt_proportions": dt_proportions,
        "dt_forages": dt_forages,
        "dt_concentrates": dt_concentrates,
        "dt_results": dt_results,
        "methane_report": methane_report,
    }


# Purpose: Orchestrate a full diet evaluation pipeline from inputs to report-ready payload.
# Notes: Converts AF to DM, runs supply calculations, builds tables, and packages results.
def evaluate_diet(
    animal_inputs: dict,
    ingredient_amounts_af,
    feed_data_list=None,
    feed_library_path="RFT_FD_Lib_Y2test.xlsx",
    sheet_name="Fd_selected",
    report_id=None,
    simulation_id=None,
    country_id=None,
    user_id=None,
    db=None
):
    """
    Orchestrate a full diet evaluation using updated shared helpers.
    """
    animal_requirements = rsm_calculate_an_requirements(animal_inputs)
    
    # Process feeds from database list if provided, otherwise fallback to Excel
    if feed_data_list is not None:
        feed_df = pd.DataFrame(feed_data_list)
        f_nd, _ = rsm_process_feed_dataframe(feed_df)
    else:
        f_nd, _ = rsm_process_feed_library(feed_library_path, sheet_name=sheet_name)
        
    ingredient_amounts_dm, f_nd_aug = convert_af_to_dm(ingredient_amounts_af, f_nd)

    diet_summary_values = rsm_diet_supply(
        x=ingredient_amounts_dm,
        f_nd=f_nd_aug,
        animal_requirements=animal_requirements,
    )
    intermediate_results_values = None
    An_MPm = float(diet_summary_values[16]) if len(diet_summary_values) > 16 else np.nan

    milk_target_input = float(animal_inputs["Trg_MilkProd_L"])
    milk_support = predict_total_milk_supported(
        Supply_NEl=diet_summary_values[1],
        Supply_MP=diet_summary_values[2],
        Supply_DMIn=diet_summary_values[0],
        Trg_Dt_DMIn=animal_requirements["Trg_Dt_DMIn"],
        An_NELm=animal_requirements["An_NELm"],
        An_NEgest=animal_requirements["An_NEgest"],
        An_NELgain=animal_requirements["An_NELgain"],
        An_NELlact=animal_requirements["An_NELlact"],
        An_MPm=An_MPm,
        An_MPg=animal_requirements["An_MPg"],
        An_MPp=animal_requirements["An_MPp"],
        Trg_NEmilk_Milk=animal_requirements["Trg_NEmilk_Milk"],
        Trg_MilkTPp=animal_inputs["Trg_MilkTPp"],
        Trg_MilkProd=milk_target_input,
        An_LactDay=animal_inputs["An_LactDay"],
        An_BW=animal_requirements["An_BW"],
        ingredient_amounts_DM=ingredient_amounts_dm,
        f_nd=f_nd_aug,
        An_StatePhys=animal_requirements["An_StatePhys"],
        animal_requirements=animal_requirements
    )

    tables = build_evaluation_tables(
        ingredient_amounts_dm, f_nd_aug, animal_requirements, diet_summary_values
    )
    animal_inputs_df = rsm_create_animal_inputs_dataframe(animal_requirements)
    milk_table = create_milk_production_dataframe(milk_support)
    intake_table = create_intake_dataframe(milk_support)
    cost_table = create_cost_dataframe(milk_support)

    post_optimization = {
        "status": "SUCCESS",
        # "messages": [],  # optional: keep empty to avoid rendering Notes in evaluation reports
        # "worst_constraints": [],  # optional: available for future linking/debug
        "total_cost": tables["total_cost_real"],
        "water_intake": tables["water_intake"],
        "diet_supply_results": diet_summary_values,
        "animal_inputs": animal_inputs_df,
        "ration_evaluation": tables["ration_evaluation"],
        "diet_table": tables["diet_table"],
        "Dt": tables["Dt"],
        "Dt_kg": tables["Dt_kg"],
        "dt_proportions": tables["dt_proportions"],
        "dt_forages": tables["dt_forages"],
        "dt_concentrates": tables["dt_concentrates"],
        "dt_results": tables["dt_results"],
        "nutrient_comparison": tables["nutrient_comparison"],
        "methane_report": tables["methane_report"],
        "best_solution_result": ingredient_amounts_dm,
        "constraint_messages": {},
        "milk_support": milk_support,
        "milk_table": milk_table,
        "intake_table": intake_table,
        "cost_table": cost_table,
        "report_mode": "evaluation",
    }

    report_ready = {
        "allow_report": True,
        "post_optimization": post_optimization,
        "animal_requirements": animal_requirements,
        "report_mode": "evaluation",
    }

    return {
        "status": "SUCCESS",
        "animal_requirements": animal_requirements,
        "post_results": post_optimization,
        "milk_support": milk_support,
        "ingredient_amounts_dm": ingredient_amounts_dm,
        "ingredient_amounts_af": ingredient_amounts_af,
        "f_nd": f_nd_aug,
        "report_id": report_id,
        "simulation_id": simulation_id,
        "country_id": country_id,
        "user_id": user_id,
        "report_ready": report_ready,
    }


# Purpose: Write evaluation results to HTML using the shared report generator.
# Notes: Ensures output directory exists and returns the generated file path.
def generate_evaluation_html(report_ready: dict, output_dir="output_evaluation"):

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "ration_evaluation_report.html"
    generate_report_from_runner_results(report_ready, output_file=str(output_file))
    return output_file


# Purpose: Format milk support metrics into a readable multiline string for CLI output.
# Notes: Groups metrics by section labels and formats numeric values to two decimals.
def report_diet_eval(results_dict):
    
    display_names = {
        "Milk_Target_Production": "Milk Production Target (L/d)",
        "Milk_Energy_Supported": "Milk Supported by Energy (kg/d)",
        "Milk_Protein_Supported": "Milk Supported by Protein (kg/d)",
        "Milk_Supported": "Actual Milk Production  Supported(kg/d)",
        "Limiting_Nutrient": "Limiting Nutrient",
        "NEL_Available": "Energy Available (Mcal)",
        "MP_Available_kg": "Metabolizable Protein Available (kg)",
        "DMI_Status": "Intake Status",
        "DMI_Actual": "Actual Intake (kg/d)",
        "DMI_Target": "Target Intake (kg/d)",
        "DMI_Difference": "Intake Difference (kg/d)",
        "Diet_Cost_Total_AF": "Total Diet Cost (as-fed)",
        "Feed_Cost_Per_kg_Milk": "Feed Cost per kg of Milk",
        "CH4_MJ": "Methane Emission (MJ/d)",
        "CH4_grams": "Methane Production (g/d)",
        "CH4_grams_per_kg_DMI": "Methane Yield (g/kg DMI)",
        "CH4_intensity": "Methane Intensity (g/kg ECM)",
        "MCR": "Methane Conversion Rate (%)"
        #"MCR_Range": "Methane Conversion Range"
    }
    sections = {
        "Milk Production": [
            "Milk_Target_Production",
            "Milk_Energy_Supported",
            "Milk_Protein_Supported",
            "Milk_Supported",
            "Limiting_Nutrient",
            "NEL_Available",
            "MP_Available_kg"
        ],
        "Intake": [
            "DMI_Status",
            "DMI_Actual",
            "DMI_Target",
            "DMI_Difference"
        ],
        "Diet Cost": [
            "Diet_Cost_Total_AF",
            "Feed_Cost_Per_L_Milk"
        ],
        "Methane Output": [
            "CH4_MJ",
            "CH4_grams",
            "CH4_grams_per_kg_DMI",
            "CH4_intensity",
            "MCR"
        ]
    }
    
    formatted_output = ""
    for section, keys in sections.items():
        formatted_output += f"\n--- {section} ---\n"
        for key in keys:
            if key in results_dict:
                value = results_dict[key]
                label = display_names.get(key, key)  # Use display name if available
                if isinstance(value, (int, float)):
                    formatted_output += f"{label}: {value:.2f}\n"
                else:
                    formatted_output += f"{label}: {value}\n"
    return formatted_output

# Purpose: Create a milk production summary dataframe for reporting.
# Notes: Includes target and supported values with units, rounded for display.
def create_milk_production_dataframe(allowable_milk):

    milk_data = {
        "Parameter": [
            "Target Milk Production",
            "Milk Supported by Energy", 
            "Milk Supported by Protein",
            "Actual Milk Supported",
            "Limiting Nutrient"
        ],
        "Value": [
            allowable_milk.get("Milk_Target_Production", 0),
            allowable_milk.get("Milk_Energy_Supported", 0),
            allowable_milk.get("Milk_Protein_Supported", 0),
            allowable_milk.get("Milk_Supported", 0),
            allowable_milk.get("Limiting_Nutrient", "")
        ],
        "Unit": [
            "L/d",
            "kg/d", 
            "kg/d",
            "kg/d",
            ""
        ]
    }
    return pd.DataFrame(milk_data).round(2)

# Purpose: Build an intake summary dataframe for HTML reporting.
# Notes: Uses allowable_milk dict values, computes % target, and rounds outputs.
def create_intake_dataframe(allowable_milk):

    intake_data = {
        "Parameter": [
            "Intake Status",
            "Actual Dry Matter Intake",
            "Target Dry Matter Intake", 
            "Intake Difference",
            "Intake as % of Target"
        ],
        "Value": [
            allowable_milk.get("DMI_Status", ""),
            allowable_milk.get("DMI_Actual", 0),
            allowable_milk.get("DMI_Target", 0),
            allowable_milk.get("DMI_Difference", 0),
            allowable_milk.get("DMI_Percent", 0)
        ],
        "Unit": [
            "",
            "kg/d",
            "kg/d",
            "kg/d", 
            "%"
        ]
    }
    return pd.DataFrame(intake_data).round(2)

# Purpose: Build a cost summary dataframe for the HTML report.
# Notes: Pulls total diet cost and cost per liter values, rounded for presentation.
def create_cost_dataframe(allowable_milk):
    """
    Create Diet Cost DataFrame for HTML report
    """
    cost_data = {
        "Parameter": [
            "Total Diet Cost (As-Fed)",
            "Feed Cost per kg Milk"
        ],
        "Value": [
            allowable_milk.get("Diet_Cost_Total_AF", 0),
            allowable_milk.get("Feed_Cost_Per_L_Milk", 0)
        ],
        "Unit": [
            "cost/d",
            "cost/L milk"
        ]
    }
    return pd.DataFrame(cost_data).round(2)
