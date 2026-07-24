"""
Diet tables module.

This module contains all diet table creation and calculation functions:
- Diet table creation with ingredient proportions
- Nutrient comparison tables
- Water intake calculations
- Ration evaluation
- Diet proportions (forage/concentrate breakdown)
- Methane emissions calculations
"""

import numpy as np
import pandas as pd

# Import from utilities
from .utilities import rename_variable, replace_na_and_negatives

# Purpose: Build a diet table with DM/AF inclusions and per-ingredient costs.
# Notes: Returns the table plus total cost using rounded AF inclusions.
def rsm_create_diet_table(best_solution_vector, f_nd, zero_cost_mask=None):
    #Create diet table with ingredient proportions

    # Calculate the inclusion in As-Fed
    inclusion_DM_kg = best_solution_vector
    inclusion_AF_kg = inclusion_DM_kg / (f_nd["Fd_DM"] / 100)

    # Round AF amounts to 2 decimals 
    inclusion_AF_kg_rounded = np.round(inclusion_AF_kg, 2)

    # Include actual costs for all ingredients including fillers
    cost_display = np.array(f_nd["Fd_Cost"], dtype=float).copy()

    #total_cost_per_ingredient = inclusion_AF_kg * cost_display(#satish-Maria
    total_cost_per_ingredient = inclusion_AF_kg_rounded * cost_display
    total_real_cost = np.sum(total_cost_per_ingredient)
    
    df = pd.DataFrame({
        "Ingredient": f_nd["Fd_Name"],
        "Inclusion_DM_kg": inclusion_DM_kg,
        "Inclusion_AF_kg": inclusion_AF_kg_rounded,
        "Cost_per_kg": cost_display,
        "Total_Cost": total_cost_per_ingredient
    })

    return df, total_real_cost

# Purpose: Compare supplied nutrients against targets and limits.
# Notes: Produces a dataframe with supplied values, targets, and balance interpretation.
def rsm_generate_nutrient_comparison(diet_supply_results, animal_requirements, f_nd, thresholds=None):

    # Determine energy requirement
    An_StatePhys = animal_requirements["An_StatePhys"]
    is_heifer = "heifer" in An_StatePhys.strip().lower()
    energy_req = animal_requirements["An_ME"] if is_heifer else animal_requirements["An_NEL"]
    
    # Get constraint values from thresholds or animal_requirements
    Trg_Dt_DMIn = animal_requirements["Trg_Dt_DMIn"]
    An_Ca_req = animal_requirements["An_Ca_req"]
    An_P_req = animal_requirements["An_P_req"]
    
    # If thresholds provided, use them; otherwise fallback to animal_requirements or defaults
    thr = thresholds if thresholds is not None else {}
    
    # Map thresholds to % values (they are stored as decimals in thr)
    An_NDFfor_req = thr.get("ndf_for_min", 0.0) * 100 if "ndf_for_min" in thr else animal_requirements.get("An_NDFfor_req", np.nan)
    An_NDF_req = thr.get("ndf_max", 0.0) * 100 if "ndf_max" in thr else animal_requirements.get("An_NDF_req", np.nan)
    An_St_req = thr.get("starch_max", 0.0) * 100 if "starch_max" in thr else animal_requirements.get("An_St_req", np.nan)
    An_EE_req = thr.get("ee_max", 0.0) * 100 if "ee_max" in thr else animal_requirements.get("An_EE_req", np.nan)
    
    nutrient_labels = [
        "DMI (kg/day)",
        "Energy (Mcal/day)",
        "MP (g/day)",
        "Ca (g/day)",
        "P (g/day)",
        "NDF (% DM)",
        "NDF forage (% DM)",
        "Starch (% DM)",
        "Fat (% DM)"
    ]
    
    dmi = diet_supply_results[0]
    supplied = [
        dmi,  # DMI
        diet_supply_results[1],  # Energy
        diet_supply_results[2],  # MP
        diet_supply_results[3],  # Ca
        diet_supply_results[4],  # P
        (diet_supply_results[5] / dmi) * 100,  # NDF
        (diet_supply_results[6] / dmi) * 100,  # NDF forage
        (diet_supply_results[7] / dmi) * 100,  # Starch
        (diet_supply_results[8] / dmi) * 100   # Fat
    ]
    
    targets = [
        Trg_Dt_DMIn,
        energy_req,
        diet_supply_results[13],  # MP requirement
        An_Ca_req,
        An_P_req,
        An_NDF_req,     # NDF target
        An_NDFfor_req,  # NDF forage target
        An_St_req,      # Starch target
        An_EE_req       # Fat target
    ]
    
    min_targets = [
        np.nan, np.nan, np.nan,
        An_Ca_req, An_P_req,
        np.nan, An_NDFfor_req,
        np.nan, np.nan
    ]
    
    max_targets = [
        np.nan, np.nan, np.nan,
        np.nan, np.nan,
        An_NDF_req, np.nan,
        An_St_req, An_EE_req
    ]
    
    # Calculate balance
    balance = []
    for i, (sup, targ, min_targ, max_targ) in enumerate(zip(supplied, targets, min_targets, max_targets)):
        if pd.notna(targ):
            balance.append(sup - targ)
        elif pd.notna(min_targ) and pd.notna(max_targ):
            if min_targ <= sup <= max_targ:
                balance.append("Within range")
            else:
                balance.append(f"Outside range")
        elif pd.notna(max_targ):
            if sup <= max_targ:
                balance.append("Within range")
            else:
                balance.append(f"Exceeds limit")
        elif pd.notna(min_targ):
            if sup >= min_targ:
                balance.append("Within range")
            else:
                balance.append(f"Below minimum")
        else:
            balance.append("No constraint")
    
    return pd.DataFrame({
        'Nutrient': nutrient_labels,
        'Supplied': supplied,
        'Target': targets,
        'Min Target': min_targets,
        'Max Target': max_targets,
        'Balance': balance
    })

# Purpose: Assemble detailed diet data with nutrient intakes and totals.
# Notes: Returns per-ingredient table, totals row, and summed DM/AF intakes.
def rsm_create_final_diet_dataframe(diet_table, f_nd):

    # Create base DataFrame
    Dt = pd.DataFrame({
        "Ingr_Category": f_nd["Fd_Category"],
        "Ingr_Type": f_nd["Fd_Type"],
        "Ingr_Name": f_nd["Fd_Name"],
        "Intake_DM": diet_table["Inclusion_DM_kg"],
        "Intake_AF": diet_table["Inclusion_AF_kg"],
        "Cost_per_kg": diet_table["Cost_per_kg"],
        "Ingr_Cost": diet_table["Total_Cost"]
    })

    Dt['DM'] = f_nd['Fd_DM']

    # Sum the nutrient intake for the diet
    Dt_DMInSum = Dt["Intake_DM"].sum() 
    Dt_AFIn = Dt["Intake_AF"].sum()

    # Calculate the AF and DM ingredient proportions
    Dt['Dt_DMInp'] = Dt['Intake_DM'] / Dt_DMInSum * 100
    Dt['Dt_AFInp'] = Dt['Intake_AF'] / Dt_AFIn * 100

    # Vector to get the variable names desired
    Col_names = [
       "Fd_ADF", "Fd_NDF", "Fd_Lg", "Fd_CP", "Fd_St", "Fd_EE", "Fd_FA", 
       "Fd_Ash", "Fd_NFC", "Fd_TDN", "Fd_Ca", "Fd_P"
    ]

    # Calculate nutrient intake in Kg/d
    for nutrient in Col_names:
        if nutrient in f_nd:
            renamed_nutrient = rename_variable(nutrient)
            Dt[renamed_nutrient] = Dt['Intake_DM'] * f_nd[nutrient] / 100

    # Replace NA and negative numbers with 0
    Dt = Dt.apply(replace_na_and_negatives)

    # Add totals row
    column_sums = Dt.select_dtypes(include=[np.number]).sum()
    Dt_kg = pd.concat([Dt, pd.DataFrame([column_sums])], ignore_index=True)
    Dt_kg.iloc[-1, Dt_kg.columns.get_loc('Ingr_Name')] = 'Total'
    
    # Remove sum of columns Cost per kg and DM 
    total_idx = Dt_kg.index[-1]
    for col in ['DM', 'Cost_per_kg']:
        if col in Dt_kg.columns:
            Dt_kg.at[total_idx, col] = np.nan

    return Dt, Dt_kg, Dt_DMInSum, Dt_AFIn

# Purpose: Estimate animal water intake based on diet composition and environment.
# Notes: Uses state-specific equations; returns liters/day prediction.
def rsm_calculate_water_intake(Dt_DMInSum, Dt_AFIn, f_nd, animal_requirements, best_solution_vector):

    An_StatePhys = animal_requirements["An_StatePhys"]
    Env_TempCurr = animal_requirements.get("Env_TempCurr") 
    
    # Nutrient concentrations in the diet
    Dt_DMprop = Dt_DMInSum / Dt_AFIn * 100
    
    # Calculate diet composition using best_solution_vector directly
    ASH_diet = sum(best_solution_vector * (f_nd["Fd_Ash"]/100)) / Dt_DMInSum * 100 # (amount opt * kg of ash in diet / DMI) * 100 = % of DM
    CP_diet = sum(best_solution_vector * (f_nd["Fd_CP"]/100)) / Dt_DMInSum * 100
    
    # Water intake calculations
    An_WaIn_Lact = (
        -68.8 + 2.89 * Dt_DMInSum + 0.44 * Dt_DMprop +
        5.60 * ASH_diet + 1.81 * CP_diet
    )
    An_WaIn_Dry = (
        1.16 * Dt_DMInSum + 0.23 * Dt_DMprop +
        0.44 * Env_TempCurr + 0.061 * (Env_TempCurr - 16.4) ** 2
    )

    if An_StatePhys == "Lactating Cow":
        An_WaIn = An_WaIn_Lact
    elif An_StatePhys == "Heifer":
        An_WaIn = An_WaIn_Dry
    else:
        An_WaIn = An_WaIn_Dry
    
    return An_WaIn

# Purpose: Summarize key ration requirements vs supply with balances.
# Notes: Uses energy mode based on heifer/cow and rounds outputs.
def rsm_create_ration_evaluation(diet_supply_results, animal_requirements, diet_table, f_nd, best_solution_vector):

    An_StatePhys = animal_requirements["An_StatePhys"]
    is_heifer = An_StatePhys.strip().lower() == "heifer"
    energy_req = animal_requirements["An_ME"] if is_heifer else animal_requirements["An_NEL"]
    energy_name = "Metabolizable Energy (ME) - Mcal/d" if is_heifer else "Net Energy Lactation (NEL) - Mcal/d"
    
    Trg_Dt_DMIn = animal_requirements["Trg_Dt_DMIn"]
    An_Ca_req = animal_requirements["An_Ca_req"]
    An_P_req = animal_requirements["An_P_req"]

    # diet_supply_results[11] is Supply_ME; [10] is Supply_NEL 
    energy_supply = diet_supply_results[1]
    energy_balance = energy_supply - energy_req

    # Ration Evaluation DataFrame 
    Ration_Evaluation = pd.DataFrame({
        "Parameter": [
            "Dry Matter Intake" + " - kg/d",
            energy_name,
            "Metabolizable Protein (MP) - Kg/d",
            "Calcium - Kg/d",
            "Phosphorus - Kg/d",
        ],
        
        "Requirement": [
            Trg_Dt_DMIn,
            energy_req,                      # ME or NEL
            diet_supply_results[13],
            An_Ca_req,
            An_P_req
        ],
        
        "Supply": [
            diet_supply_results[0],           # DMI
            energy_supply,                    # ME or NEL
            diet_supply_results[2],           # MP
            diet_table["Inclusion_DM_kg"].mul(f_nd["Fd_Ca"]/100).sum(),
            diet_table["Inclusion_DM_kg"].mul(f_nd["Fd_P"]/100).sum()
        ],
        
        "Balance": [
            diet_supply_results[0] - Trg_Dt_DMIn,
            energy_balance,                     # ME−ME_req or NEL−NEL_req
            diet_supply_results[2] - diet_supply_results[13],
            (best_solution_vector * f_nd["Fd_Ca"] / 100).sum() - An_Ca_req,
            (best_solution_vector * f_nd["Fd_P"]/100).sum() - An_P_req
        ]
    }).round(2)
    
    return Ration_Evaluation


# Purpose: Produce forage/concentrate proportion tables and cost view.
# Notes: Adds total rows when missing and normalizes nutrients to DM intake.
def rsm_create_proportions_dataframe(Dt, Dt_DMInSum):

    # Calculate Dt dataframe in % of DM
    Dt_proportions = Dt[['Ingr_Type', 'Ingr_Name', 'Intake_DM', 'Intake_AF', 'Dt_DMInp', 'Dt_AFInp', 'Cost_per_kg', 'Ingr_Cost']].copy()

    # Calculate nutrient intake in %
    Col_names = [
       "Fd_ADF", "Fd_NDF", "Fd_Lg", "Fd_CP", "Fd_St", "Fd_EE", "Fd_FA", 
       "Fd_Ash", "Fd_NFC", "Fd_TDN", "Fd_Ca", "Fd_P"
    ]
    
    for nutrient in Col_names:
        if f"Dt_{nutrient[3:]}In" in Dt.columns:
            renamed_nutrient = rename_variable(nutrient)
            Dt_proportions[renamed_nutrient] = Dt[renamed_nutrient] / Dt_DMInSum * 100

    # Replace NA and negative numbers with 0
    Dt_proportions = Dt_proportions.apply(replace_na_and_negatives)

    # Check if totals row already exists before adding
    if not (Dt_proportions['Ingr_Name'] == 'Total').any():
        # Add totals row only if it doesn't exist
        column_sums = Dt_proportions.select_dtypes(include=[np.number]).sum()
        Dt_proportions = pd.concat([Dt_proportions, pd.DataFrame([column_sums])], ignore_index=True)
        Dt_proportions.iloc[-1, Dt_proportions.columns.get_loc('Ingr_Name')] = 'Total'

    # Edit the Dt_proportions dataframe for report
    Dt_proportions = Dt_proportions.round(2).rename(columns={
        'Ingr_Type': 'Ingr_Type',
        'Ingr_Name': 'Name',
        'Intake_DM': 'DM_kg',
        'Intake_AF': 'AF_kg',
        'Dt_DMInp': 'DM_prop',
        'Dt_AFInp': 'AF_prop',
        'Cost_per_kg': 'PRICE/KG',
        'Ingr_Cost': 'Cost',
        'Dt_CPIn': 'CP',
        'Dt_NDFIn': 'NDF',
        'Dt_ADFIn': 'ADF',
        'Dt_LgIn': 'Lig',
        'Dt_StIn': 'St',
        'Dt_EEIn': 'EE',
        'Dt_FAIn': 'FA',
        'Dt_AshIn': 'Ash',
        'Dt_NFCIn': 'NFC',
        'Dt_TDNIn': 'TDN',
        'Dt_CaIn': 'Ca',
        'Dt_PIn': 'P'
    })

    # Preserve cost view for dt_results before dropping price columns from proportions table
    Dt_results = Dt_proportions[['Name', 'DM_kg', 'AF_kg', 'Cost', 'PRICE/KG']].copy()

    # Fix total row NaN values
    total_row_index = Dt_proportions[Dt_proportions['Name'] == 'Total'].index
    if len(total_row_index) > 0:
        idx = total_row_index[0]
        # Replace NaN with empty string in Ingr_Type column
        Dt_proportions.loc[idx, 'Ingr_Type'] = ''
    
        # Replace NaN with calculated totals for nutrient columns
        numeric_cols = ['ADF', 'NDF', 'Lig', 'CP', 'St', 'EE', 'FA', 'Ash', 'NFC', 'TDN', 'Ca', 'P']
        for col in numeric_cols:
            if col in Dt_proportions.columns:
                col_total = Dt_proportions.loc[Dt_proportions['Name'] != 'Total', col].sum()
                Dt_proportions.loc[idx, col] = col_total
                
    # Filter and add a Total row for Forage
    Dt_forages = Dt_proportions[Dt_proportions['Ingr_Type'] == 'Forage'].copy()
    if not Dt_forages.empty:
        forage_total = Dt_forages.select_dtypes(include=[np.number]).sum()
        forage_total['Ingr_Type'] = 'Forage'
        forage_total['Name'] = 'Total'
        Dt_forages = pd.concat([Dt_forages, forage_total.to_frame().T], ignore_index=True)

    # Filter and add a Total row for Concentrate
    Dt_concentrates = Dt_proportions[(Dt_proportions['Ingr_Type'] == 'Concentrate') | 
                                     (Dt_proportions['Ingr_Type'] == 'Minerals')].copy()
    if not Dt_concentrates.empty:
        concentrate_total = Dt_concentrates.select_dtypes(include=[np.number]).sum()
        concentrate_total['Ingr_Type'] = 'Concentrate'
        concentrate_total['Name'] = 'Total'
        Dt_concentrates = pd.concat([Dt_concentrates, concentrate_total.to_frame().T], ignore_index=True)

    Dt_results = Dt_results  # already captured with price columns intact

    return Dt_proportions, Dt_forages, Dt_concentrates, Dt_results

# Purpose: Compute the forage-to-concentrate ratio on a fresh-matter (as-fed) basis.
# Notes: Concentrate side includes minerals (consistent with the Concentrate Details table).
#        Returns a normalized "F:C" pair summing to 100 (e.g. "60:40"), or None when there
#        is no formulated ration (empty diet / baby-calf milk-only path).
def compute_forage_concentrate_ratio(forage_af_kg, concentrate_af_kg):
    total = float(forage_af_kg) + float(concentrate_af_kg)
    if total <= 0:
        return None
    forage_pct = round(float(forage_af_kg) / total * 100)
    concentrate_pct = 100 - forage_pct  # derive from forage so the pair always sums to 100
    return f"{forage_pct}:{concentrate_pct}"

# Purpose: Extract forage/concentrate as-fed totals from proportions frames and build the ratio.
# Notes: Concentrate is defined as everything that is not forage (grand total - forage), so the
#        concentrate side includes minerals and any other non-forage category, regardless of how
#        the taxonomy labels them. Reads the 'Total' row AF_kg from the dt_proportions (grand
#        total) and dt_forages dataframes produced by rsm_create_proportions_dataframe.
def forage_concentrate_ratio_from_proportions(dt_proportions, dt_forages):
    def _total_af_kg(df):
        if df is None or not hasattr(df, 'empty') or df.empty or 'Name' not in df.columns:
            return 0.0
        total_rows = df[df['Name'] == 'Total']
        if total_rows.empty or 'AF_kg' not in total_rows.columns:
            return 0.0
        try:
            return float(total_rows.iloc[0]['AF_kg'])
        except (ValueError, TypeError):
            return 0.0

    total_af = _total_af_kg(dt_proportions)
    forage_af = _total_af_kg(dt_forages)
    concentrate_af = max(total_af - forage_af, 0.0)
    return compute_forage_concentrate_ratio(forage_af, concentrate_af)

# Purpose: Estimate methane production metrics from diet composition.
# Notes: Chooses formula by physiological state and reports yield/intensity classifications.
def rsm_calculate_methane_emissions(Dt, Dt_DMInSum, f_nd, animal_requirements, best_solution_vector):

    An_StatePhys = animal_requirements["An_StatePhys"]
    An_BW = animal_requirements["An_BW"]
    Trg_MilkTPp = animal_requirements["Trg_MilkTPp"]
    Trg_MilkFatp = animal_requirements["Trg_MilkFatp"]
    
    # Calculate diet composition values
    EE_diet = sum(best_solution_vector * (f_nd["Fd_EE"]/100)) / Dt_DMInSum * 100
    FA_diet = sum(best_solution_vector * (f_nd["Fd_FA"]/100)) / Dt_DMInSum * 100
    NDF_diet = sum(best_solution_vector * (f_nd["Fd_NDF"]/100)) / Dt_DMInSum * 100
    CP_diet = sum(best_solution_vector * (f_nd["Fd_CP"]/100)) / Dt_DMInSum * 100
    
    GE_diet = (f_nd["Fd_GE"] * best_solution_vector).sum()  # Mcal/d
   
    # Calculate Methane in g/d       # Niu et al. 2018
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

    # Interpret MCR
    if MCR < 3.5:
        MCR_range = "Extremely Low"
    elif MCR < 4.5:
        MCR_range = "Very Low"
    elif MCR < 5.5:
        MCR_range = "Low"
    elif MCR < 7.5:
        MCR_range = "Average"
    elif MCR < 9.5:
        MCR_range = "High"
    else:
        MCR_range = "Very High"

    # Combine results into a DataFrame
    Methane_Report = pd.DataFrame({
        "Metric": [
            "Methane Production (g/day)",
            "Methane Yield (g/kg DMI)",
            "Methane Intensity (g/kg ECM)",
            "Ym (%)",
            "Classification"
        ],
        "Value": [
            round(CH4, 2),
            round(CH4_grams_per_kg_DMI, 2),
            round(CH4_intensity, 2),
            round(MCR, 2),
            MCR_range
        ]
    })
    
    return Methane_Report
