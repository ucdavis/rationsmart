"""
Feed data processing module.

This module contains functions for processing and preparing feed library data
for diet optimization. It handles:
- Loading feed data from various sources
- Calculating derived nutritional parameters
- Data validation and preprocessing
- Feed categorization and classification
"""

import pandas as pd
import numpy as np

# Import utilities
from .utilities import preprocess_dataframe, rename_variable, replace_na_and_negatives

# Feed column mapping from database/Excel (lowercase) to Engine (CamelCase)
FEED_COLUMN_MAPPING = {
    "fd_name": "Fd_Name", "fd_category": "Fd_Category", "fd_type": "Fd_Type",
    "fd_cost": "Fd_Cost", "price_per_kg": "Fd_Cost",
    "fd_dm": "Fd_DM", "fd_ash": "Fd_Ash", "fd_cp": "Fd_CP",
    "fd_npn_cp": "Fd_NPN_CP", "fd_ee": "Fd_EE", "fd_st": "Fd_St", "fd_ndf": "Fd_NDF",
    "fd_adf": "Fd_ADF", "fd_lg": "Fd_Lg", "fd_ndin": "Fd_NDIN", "fd_adin": "Fd_ADIN",
    "fd_ca": "Fd_Ca", "fd_p": "Fd_P", "fd_country_name": "Fd_Country",
    "fd_filler_role": "Fd_FillerRole",
    # New nutritional additions
    "fd_nfe": "Fd_NFE", "fd_cf": "Fd_CF",
    "fd_hemicellulose": "Fd_Hemicellulose", "fd_cellulose": "Fd_Cellulose",
    # Per-ingredient inclusion bounds (as-fed kg/day; from feed card toggle or Excel columns)
    "fd_min": "Fd_Min", "fd_max": "Fd_Max",
}


def _prepare_feed_bound_columns(f: pd.DataFrame) -> pd.DataFrame:
    # Reads Fd_Min / Fd_Max (as-fed kg/day) and converts to DM kg/day.
    # Both source columns are optional: missing or NaN → 0.0 (no bound).
    if "Fd_Min" not in f.columns:
        f["Fd_Min"] = np.nan
    if "Fd_Max" not in f.columns:
        f["Fd_Max"] = np.nan
    f["Fd_Min"] = pd.to_numeric(f["Fd_Min"], errors="coerce")
    f["Fd_Max"] = pd.to_numeric(f["Fd_Max"], errors="coerce")
    dm_fraction = pd.to_numeric(f["Fd_DM"], errors="coerce").fillna(0.0) / 100.0
    f["Fd_MinDM"] = f["Fd_Min"].fillna(0.0) * dm_fraction   # Step 1: as-fed → DM kg/day
    f["Fd_MaxDM"] = f["Fd_Max"].fillna(0.0) * dm_fraction
    return f

# Purpose: Load and normalize feed data from Excel for optimization inputs.
# Notes: Renames columns, computes derived nutrition fields, and returns dict plus summary DataFrame.
def rsm_process_feed_library(feed_library_path, sheet_name="Fd_selected"):
    """
    Process feed library data and calculate nutritional parameters for optimization.
    
    Parameters:
    -----------
    feed_library_path : str
        Path to the Excel file containing feed library data
    sheet_name : str, optional
        Name of the Excel sheet to read (default: "Fd_selected")
        
    Returns:
    --------
    tuple : (f_nd, Dt)
        f_nd : dict - Dictionary with feed data arrays for optimization
        Dt : DataFrame - Summary DataFrame with intake information
    """
    
    # Load the feed table
    f = pd.read_excel(feed_library_path, sheet_name=sheet_name)

    #f = gen.df

    # Rename to original casing
    f.rename(columns=FEED_COLUMN_MAPPING, inplace=True)

    f = f.dropna(subset=["Fd_Name"]) # Remove rows with NA values in the Fd_Name column

    # ⚡ FIX: Ensure all numeric columns are floats to avoid float/Decimal multiplication errors
    numeric_cols = [
        "Fd_DM", "Fd_CP", "Fd_NDF", "Fd_EE", "Fd_St", "Fd_Ca", "Fd_P", "Fd_Ash",
        "Fd_NPN_CP", "Fd_NDIn", "Fd_ADIn", "Fd_Lg", "Fd_ADF", "Fd_NFE", "Fd_CF",
        "Fd_Hemicellulose", "Fd_Cellulose", "Fd_Cost"
    ]
    for col in numeric_cols:
        if col in f.columns:
            f[col] = pd.to_numeric(f[col], errors='coerce').fillna(0.0).astype(float)

    if "Fd_FillerRole" not in f.columns:
        f["Fd_FillerRole"] = ""

    f = _prepare_feed_bound_columns(f)

    # Energy values according to NRC 2001

    # processing adjustment factor
    f['Fd_PAF'] = 1 # general PAF value for all feeds

    # Calculate missing parameters of feed ingredients
    # # Organic matter
    f["Fd_OM"] = 100 - f["Fd_Ash"]
    f["Fd_OM"] = f["Fd_OM"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Non Forage Carbohydrates
    f["Fd_NFC"] = f["Fd_OM"] - (f["Fd_NDF"] + f["Fd_EE"] + f["Fd_CP"])
    f["Fd_NFC"] = f["Fd_NFC"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Calculate Fd_NDFIP and Fd_ADFIP
    f["Fd_NDFIP"] = f["Fd_NDIN"] * 6.25
    f["Fd_ADFIP"] = f["Fd_ADIN"] * 6.25

    f["Fd_NDFn"] = f["Fd_NDF"] - f["Fd_NDFIP"]
    f["Fd_NDFn"] = f["Fd_NDFn"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    f["Fd_tdNFC"] = 0.98 * (100 - (f["Fd_NDFn"] + f["Fd_CP"] + f["Fd_EE"] + f["Fd_Ash"]) * f["Fd_PAF"])
    f["Fd_tdNFC"] = f["Fd_tdNFC"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Fd_tdCP
    f["Fd_tdCP"] = np.nan
    mask_forage = f["Fd_Type"] == "Forage"
    mask_conc = f["Fd_Type"] == "Concentrate"
    exp_val = lambda row: row["Fd_CP"] * np.exp(-1.2 * (row["Fd_ADFIP"] / row["Fd_CP"])) if row["Fd_CP"] != 0 else 0
    f.loc[mask_forage | mask_conc, "Fd_tdCP"] = f[mask_forage | mask_conc].apply(exp_val, axis=1)
    for cat in ["Minerals", "Additive", "Sugar/Sugar Alcohol"]:
        f.loc[f["Fd_Category"] == cat, "Fd_tdCP"] = 0

    # Fd_cFA and Fd_ctdFA
    f["Fd_FA"] = np.where(f["Fd_EE"] < 1, 0, f["Fd_EE"] - 1)
    f["Fd_ctdFA"] = f["Fd_FA"]

    # Fd_tdNDF
    f["Fd_tdNDF"] = 0.75 * (f["Fd_NDFn"] - f["Fd_Lg"]) * (1 - np.power((f["Fd_Lg"] / f["Fd_NDFn"]).replace(0, np.nan), 0.667))
    f["Fd_tdNDF"] = f["Fd_tdNDF"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Set constants
    de_NFC = 4.2
    de_NDF = 4.2
    de_CP = 5.6
    de_FA = 9.4
    loss_constant = 0.3

    # Weiss et al., 2018.
    f["Fd_GE"] = (f["Fd_CP"] * de_CP/100) + (f["Fd_FA"] * de_FA/100) + (100 - f["Fd_CP"] - f["Fd_FA"] - f["Fd_Ash"]) * 0.042
    f["Fd_GE"] = f["Fd_GE"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    mask_v_m = (f["Fd_Category"] == "Minerals")
    f.loc[mask_v_m, "Fd_GE"] = 0

    # Fd_DE NRC 2001
    f["Fd_DE"] = (
        ((f["Fd_tdNFC"] / 100) * de_NFC) +
        ((f["Fd_tdNDF"] / 100) * de_NDF) +
        ((f["Fd_tdCP"] / 100) * de_CP) +
        ((f["Fd_ctdFA"] / 100) * de_FA)
        - loss_constant
    )
    f["Fd_DE"] = f["Fd_DE"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Animal Protein special case
    # mask_animal_protein = f["Fd_Category"] == "Animal Protein"
    # f.loc[mask_animal_protein, "Fd_DE"] = (
    #     (f.loc[mask_animal_protein, "Fd_tdNFC"] / 100) * de_NFC +
    #     (f.loc[mask_animal_protein, "Fd_tdCP"] / 100) * de_CP +
    #     (f.loc[mask_animal_protein, "Fd_ctdFA"] / 100) * de_FA
    #     - loss_constant
    # )

    # DE for additives with NPN (urea)
    mask_npn = (f["Fd_Category"] == "Additive") & (f["Fd_NPN_CP"] > 0)
    f.loc[mask_npn, "Fd_DE"] *= (
            1 - (f.loc[mask_npn, "Fd_CP"] * f.loc[mask_npn, "Fd_NPN_CP"] / 28200)
        )

    # Set to 0 for specific categories
    for cat in ["Minerals"]:
        f.loc[f["Fd_Category"] == cat, "Fd_DE"] = 0

    # Simplified - GEO # Mcal/kg
    f["Fd_ME"] = 0.82 * f["Fd_DE"]
    f["Fd_ME"] = f["Fd_ME"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Simplified - GEO 
    f["Fd_TDN"] = 100 * (f["Fd_DE"] / 4.4) # % of DM
    f["Fd_TDN"] = f["Fd_TDN"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    f["Fd_NEl"] = 0.0245 * f["Fd_TDN"] - 0.12 # Mcal/kg
    f["Fd_NEl"] = f["Fd_NEl"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Feeds - Extra logic used sometimes - better to keep it here

    f["Fd_Conc"] = f.apply(lambda row: 100 if row["Fd_Type"] == "Concentrate" else 0, axis=1)
    f["Fd_For"] = 100 - f["Fd_Conc"]
    f["Fd_ForWet"] = f.apply(lambda row: row["Fd_For"] if row["Fd_For"] > 50 and row["Fd_DM"] < 71 else 0, axis=1)
    f["Fd_ForDry"] = f.apply(lambda row: row["Fd_For"] if row["Fd_For"] > 50 and row["Fd_DM"] >= 71 else 0, axis=1)
    f["Fd_Past"] = f.apply(lambda row: 100 if row["Fd_Category"] == "Pasture" else 0, axis=1)

    f["Fd_ForNDF"] = (1 - f["Fd_Conc"] / 100) * f["Fd_NDF"]
    f["Fd_NDFnf"] = f["Fd_NDF"] - f["Fd_NDFIP"] # NDF N free

    # Absorption coefficients for minerals

    if "Fd_acCa" not in f.columns:
        f["Fd_acCa"] = None
        f["Fd_acCa"] = f.apply(lambda row: 0.4 if row["Fd_Type"] == "Forage" else row["Fd_acCa"], axis=1)
        f["Fd_acCa"] = f.apply(lambda row: 0.6 if row["Fd_Type"] == "Concentrate" else row["Fd_acCa"], axis=1)
        f["Fd_acCa"] = f.apply(lambda row: 0.6 if row["Fd_Category"] == "Minerals" else row["Fd_acCa"], axis=1)
    else:
        f["Fd_acCa"] = f.apply(lambda row: 0.4 if row["Fd_acCa"] == 0 and row["Fd_Type"] == "Forage" else row["Fd_acCa"], axis=1)
        f["Fd_acCa"] = f.apply(lambda row: 0.6 if row["Fd_acCa"] == 0 and row["Fd_Type"] == "Concentrate" else row["Fd_acCa"], axis=1)
        f["Fd_acCa"] = f.apply(lambda row: 0.6 if row["Fd_acCa"] == 0 and row["Fd_Category"] == "Minerals" else row["Fd_acCa"], axis=1)

    if "Fd_acP" not in f.columns:
        f["Fd_acP"] = None
        f["Fd_acP"] = f.apply(lambda row: 0.64 if row["Fd_Type"] == "Forage" else row["Fd_acP"], axis=1)
        f["Fd_acP"] = f.apply(lambda row: 0.7 if row["Fd_Type"] == "Concentrate" else row["Fd_acP"], axis=1)
        f["Fd_acP"] = f.apply(lambda row: 0.7 if row["Fd_Category"] == "Minerals" else row["Fd_acP"], axis=1)
    else:
        f["Fd_acP"] = f.apply(lambda row: 0.64 if row["Fd_acP"] == 0 and row["Fd_Type"] == "Forage" else row["Fd_acP"], axis=1)
        f["Fd_acP"] = f.apply(lambda row: 0.7 if row["Fd_acP"] == 0 and row["Fd_Type"] == "Concentrate" else row["Fd_acP"], axis=1)
        f["Fd_acP"] = f.apply(lambda row: 0.7 if row["Fd_acP"] == 0 and row["Fd_Category"] == "Minerals" else row["Fd_acP"], axis=1)

    # Change unit of some parameters from % of DM to Kg

    f["Fd_CostDM"] = f["Fd_Cost"] / (f["Fd_DM"] / 100)

    f["Fd_CP_kg"] = f["Fd_CP"] / 100                                          # CP kg
    f["Fd_NDF_kg"] = f["Fd_NDF"] / 100                                        # NDF
    f["Fd_ForNDF_kg"] = np.where(f["Fd_Type"] == "Forage", f["Fd_NDF_kg"], 0) # NDF from forage type
    f["Fd_St_kg"] = f["Fd_St"] / 100                                          # Starch
    f["Fd_EE_kg"] = f["Fd_EE"] / 100                                          # EE
    f["Fd_Ash_kg"] = f["Fd_Ash"] / 100                                        # Ash
    f["Fd_Ca_kg"] = (f["Fd_Ca"] * f["Fd_acCa"]) / 100                         # Ca multiplied by its absoprtion coefficient
    f["Fd_P_kg"] = (f["Fd_P"] * f["Fd_acP"]) / 100                            # P multiplied by its absoprtion coefficient

    f["Fd_Type"] = np.where((f["Fd_Type"] == "Concentrate") & (f["Fd_Category"] == "Minerals"), "Minerals", f["Fd_Type"])
    
    f["Fd_isFat"] = (f["Fd_EE"] > 50).astype(int)
    f["Fd_isMi"] = np.where(f["Fd_Type"] == "Minerals", 1, 0)
    f["Fd_isconc"] = np.where(f["Fd_Type"] == "Concentrate", 1, 0)
    f["Fd_isbyprod"] = f["Fd_Category"].str.contains(r"\bby[-\s]?prod", case=False, regex=True).astype(int)
    f["Fd_isconc_only"] = np.where((f["Fd_isconc"] == 1) & (f["Fd_isbyprod"] == 0) & (f["Fd_isFat"] == 0), 1, 0)

    # Add Placeholders for the following columns
    f["Fd_DMIn"] = 1 
    f["Fd_AFIn"] = 1 
    f["Fd_TDNact"] = 1
    f["Fd_DEact"] = 1
    f["Fd_MEact"] = 1
    f["Fd_NEl_A"] = 1
    f["Fd_NEm"] = 1
    f["Fd_NEg"] = 1

    num_cols = [c for c in f.columns if pd.api.types.is_numeric_dtype(f[c])]
    f[num_cols] = f[num_cols].astype("float64").fillna(0.0)

    str_cols = ["Fd_Name", "Fd_Category", "Fd_Type", "Fd_Country", "Fd_FillerRole"]
    for c in str_cols:
        if c in f.columns:
            f[c] = f[c].astype("string").fillna("")

    Dt = pd.DataFrame({
        "Ingr_Category": f["Fd_Category"],
        "Ingr_Type": f["Fd_Type"],
        "Ingr_Name": f["Fd_Name"],
        "Intake_DM": f["Fd_DMIn"],
        "Intake_AF": f["Fd_AFIn"],
    })

    f_nd = {col: f[col].to_numpy() for col in f.columns}
    
    return f_nd, Dt


# Purpose: Process an in-memory feed DataFrame using the same logic as the Excel loader.
# Notes: Adds missing columns, derives nutrient parameters, and returns dict plus summary DataFrame.
def rsm_process_feed_dataframe(feed_data):
    """
    Process feed DataFrame and calculate nutritional parameters for optimization.
    This function replicates the logic from rsm_process_feed_library() but for DataFrame input.
    
    Parameters:
    -----------
    feed_data : pandas.DataFrame
        DataFrame containing feed data
        
    Returns:
    --------
    tuple : (f_nd, Dt)
        f_nd : dict - Dictionary with feed data arrays for optimization
        Dt : DataFrame - Summary DataFrame with intake information
    """
    # Use the feed data directly
    f = feed_data.copy()
    
    # Add missing columns with default values if they don't exist
    missing_cols_0 = [
        "fd_npn_cp", "fd_ndin", "fd_adin", "fd_lg", "fd_adf", 
        "fd_nfe", "fd_cf", "fd_hemicellulose", "fd_cellulose"
    ]
    for col in missing_cols_0:
        if col not in f.columns:
            f[col] = 0.0
            
    if "fd_filler_role" not in f.columns:
        f["fd_filler_role"] = ""
    
    # Normalize column names to lowercase for robust mapping
    f.columns = [str(c).lower() for c in f.columns]
    
    # Rename columns to original casing using the shared mapping
    f = f.rename(columns=FEED_COLUMN_MAPPING)

    # ⚡ FIX: Ensure all numeric columns are floats to avoid float/Decimal multiplication errors
    # This prevents crashes when database values come in as decimal.Decimal
    numeric_cols = [
        "Fd_DM", "Fd_CP", "Fd_NDF", "Fd_EE", "Fd_St", "Fd_Ca", "Fd_P", "Fd_Ash",
        "Fd_NPN_CP", "Fd_NDIn", "Fd_ADIn", "Fd_Lg", "Fd_ADF", "Fd_NFE", "Fd_CF",
        "Fd_Hemicellulose", "Fd_Cellulose", "Fd_Cost"
    ]
    for col in numeric_cols:
        if col in f.columns:
            f[col] = pd.to_numeric(f[col], errors='coerce').fillna(0.0).astype(float)

    # Ensure Fd_Name exists before dropping
    if "Fd_Name" not in f.columns:
        # Fallback: if fd_name was already Fd_Name or something else
        # we check if any column looks like 'name'
        name_cols = [c for c in f.columns if 'name' in str(c).lower()]
        if name_cols:
            f = f.rename(columns={name_cols[0]: "Fd_Name"})
        else:
            raise KeyError(f"Required column 'Fd_Name' (or 'fd_name') missing from feed data. Available columns: {list(f.columns)}")

    f = f.dropna(subset=["Fd_Name"]) # Remove rows with NA values in the Fd_Name column

    f = _prepare_feed_bound_columns(f)

    # Energy values according to NRC 2001

    # processing adjustment factor
    f['Fd_PAF'] = 1 # general PAF value for all feeds

    # Calculate missing parameters of feed ingredients
    # # Organic matter
    f["Fd_OM"] = 100 - f["Fd_Ash"]
    f["Fd_OM"] = f["Fd_OM"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Non Forage Carbohydrates
    f["Fd_NFC"] = f["Fd_OM"] - (f["Fd_NDF"] + f["Fd_EE"] + f["Fd_CP"])
    f["Fd_NFC"] = f["Fd_NFC"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Calculate Fd_NDFIP and Fd_ADFIP
    f["Fd_NDFIP"] = f["Fd_NDIN"] * 6.25
    f["Fd_ADFIP"] = f["Fd_ADIN"] * 6.25

    f["Fd_NDFn"] = f["Fd_NDF"] - f["Fd_NDFIP"]
    f["Fd_NDFn"] = f["Fd_NDFn"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    f["Fd_tdNFC"] = 0.98 * (100 - (f["Fd_NDFn"] + f["Fd_CP"] + f["Fd_EE"] + f["Fd_Ash"]) * f["Fd_PAF"])
    f["Fd_tdNFC"] = f["Fd_tdNFC"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Fd_tdCP
    f["Fd_tdCP"] = np.nan 
    mask_forage = f["Fd_Type"] == "Forage"
    mask_conc = f["Fd_Type"] == "Concentrate"
    exp_val = lambda row: row["Fd_CP"] * np.exp(-1.2 * (row["Fd_ADFIP"] / row["Fd_CP"])) if row["Fd_CP"] != 0 else 0
    f.loc[mask_forage | mask_conc, "Fd_tdCP"] = f[mask_forage | mask_conc].apply(exp_val, axis=1)
    for cat in ["Minerals", "Additive", "Sugar/Sugar Alcohol"]:
        f.loc[f["Fd_Category"] == cat, "Fd_tdCP"] = 0

    # Fd_cFA and Fd_ctdFA
    f["Fd_FA"] = np.where(f["Fd_EE"] < 1, 0, f["Fd_EE"] - 1)
    f["Fd_ctdFA"] = f["Fd_FA"]

    # Fd_tdNDF
    f["Fd_tdNDF"] = 0.75 * (f["Fd_NDFn"] - f["Fd_Lg"]) * (1 - np.power((f["Fd_Lg"] / f["Fd_NDFn"]).replace(0, np.nan), 0.667))
    f["Fd_tdNDF"] = f["Fd_tdNDF"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Set constants
    de_NFC = 4.2
    de_NDF = 4.2
    de_CP = 5.6
    de_FA = 9.4
    loss_constant = 0.3

    # Weiss et al., 2018.  
    f["Fd_GE"] = (f["Fd_CP"] * de_CP/100) + (f["Fd_FA"] * de_FA/100) + (100 - f["Fd_CP"] - f["Fd_FA"] - f["Fd_Ash"]) * 0.042
    f["Fd_GE"] = f["Fd_GE"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    mask_v_m = (f["Fd_Category"] == "Minerals")
    f.loc[mask_v_m, "Fd_GE"] = 0

    # Fd_DE NRC 2001
    f["Fd_DE"] = (
        ((f["Fd_tdNFC"] / 100) * de_NFC) +
        ((f["Fd_tdNDF"] / 100) * de_NDF) +
        ((f["Fd_tdCP"] / 100) * de_CP) +
        ((f["Fd_ctdFA"] / 100) * de_FA)
        - loss_constant
    )
    f["Fd_DE"] = f["Fd_DE"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # DE for additives with NPN (urea)
    mask_npn = (f["Fd_Category"] == "Additive") & (f["Fd_NPN_CP"] > 0)
    f.loc[mask_npn, "Fd_DE"] *= (
            1 - (f.loc[mask_npn, "Fd_CP"] * f.loc[mask_npn, "Fd_NPN_CP"] / 28200)
        )

    # Set to 0 for specific categories
    for cat in ["Minerals"]:
        f.loc[f["Fd_Category"] == cat, "Fd_DE"] = 0

    # Simplified - GEO # Mcal/kg
    f["Fd_ME"] = 0.82 * f["Fd_DE"]
    f["Fd_ME"] = f["Fd_ME"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Simplified - GEO 
    f["Fd_TDN"] = 100 * (f["Fd_DE"] / 4.4) # % of DM
    f["Fd_TDN"] = f["Fd_TDN"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    f["Fd_NEl"] = 0.0245 * f["Fd_TDN"] - 0.12 # Mcal/kg
    f["Fd_NEl"] = f["Fd_NEl"].apply(lambda x: 0 if pd.isna(x) or x < 0 else x)

    # Feeds - Extra logic used sometimes - better to keep it here

    f["Fd_Conc"] = f.apply(lambda row: 100 if row["Fd_Type"] == "Concentrate" else 0, axis=1)
    f["Fd_For"] = 100 - f["Fd_Conc"]
    f["Fd_ForWet"] = f.apply(lambda row: row["Fd_For"] if row["Fd_For"] > 50 and row["Fd_DM"] < 71 else 0, axis=1)
    f["Fd_ForDry"] = f.apply(lambda row: row["Fd_For"] if row["Fd_For"] > 50 and row["Fd_DM"] >= 71 else 0, axis=1)
    f["Fd_Past"] = f.apply(lambda row:
        100 if row["Fd_Type"] == "Pasture" else 0, axis=1)

    f["Fd_ForNDF"] = f.apply(lambda row: row["Fd_NDF"] if row["Fd_Type"] == "Forage" else 0, axis=1)
    f["Fd_NDFnf"] = f["Fd_NDFn"]

    # Absorption coefficients
    f["Fd_acCa"] = f.apply(lambda row: 0.4 if row["Fd_Type"] == "Forage" else 0.6, axis=1)
    f["Fd_acP"] = f.apply(lambda row: 0.64 if row["Fd_Type"] == "Forage" else 0.7, axis=1)

    # Change unit of some parameters from % of DM 

    f["Fd_CostDM"] = f["Fd_Cost"] / (f["Fd_DM"] / 100)
    f["Fd_CP_kg"] = f["Fd_CP"] / 100                                          # CP kg
    f["Fd_NDF_kg"] = f["Fd_NDF"] / 100                                        # NDF
    f["Fd_ForNDF_kg"] = np.where(f["Fd_Type"] == "Forage", f["Fd_NDF_kg"], 0) # NDF from forage type
    f["Fd_St_kg"] = f["Fd_St"] / 100                                          # Starch
    f["Fd_EE_kg"] = f["Fd_EE"] / 100                                          # EE
    f["Fd_Ash_kg"] = f["Fd_Ash"] / 100                                        # Ash
    f["Fd_Ca_kg"] = (f["Fd_Ca"] * f["Fd_acCa"]) / 100                         # Ca multiplied by its absoprtion coefficient
    f["Fd_P_kg"] = (f["Fd_P"] * f["Fd_acP"]) / 100                            # P multiplied by its absoprtion coefficient

    f["Fd_Type"] = np.where((f["Fd_Type"] == "Concentrate") & (f["Fd_Category"] == "Minerals"), "Minerals", f["Fd_Type"])
    
    f["Fd_isFat"] = (f["Fd_EE"] > 50).astype(int)
    f["Fd_isMi"] = np.where(f["Fd_Type"] == "Minerals", 1, 0)
    f["Fd_isconc"] = np.where(f["Fd_Type"] == "Concentrate", 1, 0)
    f["Fd_isbyprod"] = f["Fd_Category"].str.contains(r"\bby[-\s]?prod", case=False, regex=True).astype(int)
    f["Fd_isconc_only"] = np.where((f["Fd_isconc"] == 1) & (f["Fd_isbyprod"] == 0) & (f["Fd_isFat"] == 0), 1, 0)

    # Add Placeholders for the following columns
    f["Fd_DMIn"] = 1 
    f["Fd_AFIn"] = 1 
    f["Fd_TDNact"] = 1
    f["Fd_DEact"] = 1
    f["Fd_MEact"] = 1
    f["Fd_NEl_A"] = 1
    f["Fd_NEm"] = 1
    f["Fd_NEg"] = 1

    num_cols = [c for c in f.columns if pd.api.types.is_numeric_dtype(f[c])]
    f[num_cols] = f[num_cols].astype("float64").fillna(0.0)

    str_cols = ["Fd_Name", "Fd_Category", "Fd_Type", "Fd_Country", "Fd_FillerRole"]
    for c in str_cols:
        if c in f.columns:
            f[c] = f[c].astype("string").fillna("")

    Dt = pd.DataFrame({
        "Ingr_Category": f["Fd_Category"],
        "Ingr_Type": f["Fd_Type"],
        "Ingr_Name": f["Fd_Name"],
        "Intake_DM": f["Fd_DMIn"],
        "Intake_AF": f["Fd_AFIn"],
    })

    f_nd = {col: f[col].to_numpy() for col in f.columns}
    
    return f_nd, Dt