"""
Utility functions for diet optimization.

This module contains general-purpose helper functions used throughout
the optimization system, including:
- Data preprocessing and validation
- Mathematical operations with safety checks
- Variable naming conventions
- Temperature adjustments
"""

import pandas as pd
import numpy as np

########################################################
# Utility for Animal Requirements
########################################################

# Purpose: Adjust DMI for temperature stress using simple linear modifiers.
# Notes: Reduces intake above 20°C and below 5°C; returns input otherwise.
def adjust_dmi_temperature(DMI, Temp):
    """
    Adjust DMI based on temperature conditions.
    
    Args:
        DMI (float): Dry Matter Intake
        Temp (float): Current temperature
        
    Returns:
        float: Temperature-adjusted DMI
    """
    if Temp > 20:
        return DMI * (1 - (Temp - 20) * 0.005922)
    elif Temp < 5:
        return DMI * (1 - (5 - Temp) * 0.004644)
    else:
        return DMI

########################################################
# Utility for Feed Processing
########################################################

# Purpose: Normalize dataframe types and fill missing values ahead of feed calculations.
# Notes: Converts integer columns to float and replaces NaNs with zeros.
def preprocess_dataframe(df):
    """
    Preprocess DataFrame by converting data types and handling NaN values.
    
    Args:
        df (DataFrame): Input DataFrame to preprocess
        
    Returns:
        DataFrame: Preprocessed DataFrame
    """
    for col in df.columns:
        # Convert integers to float
        if pd.api.types.is_integer_dtype(df[col]):
            df[col] = df[col].astype(np.float64)
        
        # Replace NaN values with 0
        df[col] = df[col].fillna(0)
    
    return df

# Purpose: Translate feed variable names to diet variable names with consistent suffix.
# Notes: Replaces 'Fd_' prefix and appends 'In'.
def rename_variable(variable_name):
    """
    Rename variable by replacing 'Fd_' with 'Dt_' and adding 'In' suffix.
    
    Args:
        variable_name (str): Original variable name
        
    Returns:
        str: Renamed variable
    """
    new_name = variable_name.replace("Fd_", "Dt_") + "In"
    return new_name

# Purpose: Zero out NaN or negative numeric entries while leaving other types unchanged.
# Notes: Applies elementwise replacement only for numeric dtypes.
def replace_na_and_negatives(col):
    """
    Replace NaN and negative values with 0 in numeric columns.
    
    Args:
        col (Series): DataFrame column to process
        
    Returns:
        Series: Processed column
    """
    if col.dtype.kind in 'biufc':  # Check if the column is of numeric type
        col = col.apply(lambda x: 0 if pd.isna(x) or x < 0 else x)
    return col

# Purpose: Perform division with a guard against extremely small denominators.
# Notes: Returns default_value instead of raising when denominator is near zero.
def safe_divide(numerator, denominator, default_value=0.0):

    if abs(denominator) < 1e-12:  # Very small number
        return default_value
    return numerator / denominator

# Purpose: Sum values while converting NaNs to zero to avoid propagation.
# Notes: Returns numpy sum of sanitized array.
def safe_sum(array):

    array = np.array(array)
    array = np.nan_to_num(array, nan=0.0)  # Replace NaN with 0
    return np.sum(array)

# Purpose: Compute diet-level TDN discount based on concentration and intake.
# Notes: Uses maintenance scaling and returns 1.0 when inputs are insufficient.
def calculate_discount(TotalTDN, DMI, An_MBW):
    # Convert inputs to numpy arrays to support vectorization (single diet or batch)
    ttdn = np.atleast_1d(TotalTDN).astype(float)
    dmi = np.atleast_1d(DMI).astype(float)
    
    # Initialize discount with 1.0
    discount = np.ones_like(ttdn)
    
    # Primary calculation mask: DMI must be enough and TDN positive
    mask = (dmi >= 1e-6) & (ttdn >= 0)
    
    if np.any(mask):
        # Calculate TDN concentration
        tdn_conc = np.zeros_like(ttdn)
        tdn_conc[mask] = (ttdn[mask] / dmi[mask]) * 100
        
        # Calculate DMI to maintenance
        maint_val = 0.035 * An_MBW
        dmi_to_maint = np.ones_like(ttdn)
        maint_mask = mask & (ttdn >= maint_val)
        dmi_to_maint[maint_mask] = ttdn[maint_mask] / maint_val
        
        # Calculate final discount
        # Condition: TDNconc >= 60
        calc_mask = mask & (tdn_conc >= 60)
        if np.any(calc_mask):
            # Formula: (TDNconc - ((0.18 * TDNconc - 10.3) * (DMI_to_maint - 1))) / TDNconc
            c = tdn_conc[calc_mask]
            m = dmi_to_maint[calc_mask]
            discount[calc_mask] = (c - ((0.18 * c - 10.3) * (m - 1))) / c
            
    # Return scalar if inputs were scalars
    if np.isscalar(TotalTDN) and np.isscalar(DMI):
        return float(discount[0])
    return discount


# Purpose: Estimate actual ME values per feed accounting for fat/mineral adjustments.
# Notes: Adjusts ME based on EE, handles fat/mineral overrides, and clips negatives.
def calculate_MEact(Fd_DEact, Fd_EE, Fd_isFat, Fd_isMi):     # As NRC ... NASEM eq ME = DE - UE - GAS_E (I do not have all parameters to calculate UE currently)
    
    de_act = np.nan_to_num(np.atleast_1d(Fd_DEact), nan=0.0)
    ee = np.nan_to_num(np.atleast_1d(Fd_EE), nan=0.0)
    is_fat = np.atleast_1d(Fd_isFat)
    is_mi = np.atleast_1d(Fd_isMi)

    # Formula: MEact = 1.01 * Fd_DEact - 0.45
    me_act = 1.01 * de_act - 0.45

    # EE adjustment
    # Handle both 1D (per feed) and 2D (per population, per feed)
    if de_act.ndim > 1:
        # ee is (Feeds,), de_act is (Pop, Feeds)
        # mask_EE will be (Pop, Feeds) or we can broadcast
        mask_ee = ee >= 3
        me_act[:, mask_ee] += 0.0046 * (ee[mask_ee] - 3)
        
        # Overrides
        # is_fat is (Feeds,)
        me_act[:, is_fat == 1] = de_act[:, is_fat == 1]
        me_act[:, is_mi == 1] = 0
    else:
        mask_ee = ee >= 3
        me_act[mask_ee] += 0.0046 * (ee[mask_ee] - 3)
        me_act[is_fat == 1] = de_act[is_fat == 1]
        me_act[is_mi == 1] = 0

    res = np.clip(me_act, a_min=0, a_max=None)
    
    # Return scalar if input was scalar
    if np.isscalar(Fd_DEact):
        return float(res[0])
    return res

# Purpose: Convert as-fed ingredient vector to dry matter and augment feed dict with intakes.
# Notes: Validates vector length against feed names and returns DM vector plus augmented dict.
def convert_af_to_dm(ingredient_amounts_af: np.ndarray, f_nd: dict):
    ""
    ingredient_amounts_af = np.asarray(ingredient_amounts_af, dtype=float)
    if len(ingredient_amounts_af) != len(f_nd["Fd_Name"]):
        raise ValueError(
            f"As-fed vector length {len(ingredient_amounts_af)} does not match feed count {len(f_nd['Fd_Name'])}"
        )
    ingredient_amounts_dm = ingredient_amounts_af * (f_nd["Fd_DM"] / 100.0)
    f_nd_aug = f_nd.copy()
    f_nd_aug["Fd_DMIn"] = ingredient_amounts_dm
    f_nd_aug["Fd_AFIn"] = ingredient_amounts_af
    return ingredient_amounts_dm, f_nd_aug

########################################################
# Feed Categorization Helpers
########################################################

# Purpose: Build boolean masks and summary flags describing feed categories.
# Notes: Validates required columns and returns masks for forages, concentrates, urea, etc.

def _get_column(f_nd, keys, required=False):
    if not isinstance(keys, (list, tuple)):
        keys = [keys]
    for key in keys:
        value = None
        if isinstance(f_nd, dict) and key in f_nd:
            value = f_nd[key]
        elif isinstance(f_nd, pd.DataFrame) and key in f_nd.columns:
            value = f_nd[key].values
        if value is not None:
            return value
    if required:
        raise KeyError(f"Required feed column(s) {keys} not found in f_nd")
    return None

def _string_array(f_nd, n, column, required=False):
    arr = _get_column(f_nd, column, required=required)
    arr = np.asarray(arr, dtype=str)
    if arr.shape[0] != n:
        raise ValueError(f"Column {column} length mismatch (expected {n}, got {arr.shape[0]}).")
    return np.char.strip(np.char.lower(arr))

def _numeric_array(f_nd, n, column, required=False, fallback=0.0):
    arr = _get_column(f_nd, column, required=required)
    arr = np.asarray(arr, dtype=float)
    if arr.shape[0] != n:
        raise ValueError(f"Column {column} length mismatch (expected {n}, got {arr.shape[0]}).")
    return np.nan_to_num(arr, nan=fallback)

def classify_feed_categories(f_nd):
    """
    Build reusable masks/flags describing feed categories (forage subtypes,
    wet ingredients, minerals, concentrates, urea, etc.).

    Args:
        f_nd (dict or DataFrame): Feed data dictionary/DataFrame produced by
            rsm_process_feed_dataframe / rsm_process_feed_library.

    Returns:
        dict: Contains boolean masks (per ingredient) and summary flags
              indicating which categories are present.
    """
    if f_nd is None:
        raise ValueError("f_nd cannot be None when classifying feed categories.")

    names = _get_column(f_nd, "Fd_Name", required=True)
    names = np.asarray(names)
    n = len(names)
    if n == 0:
        raise ValueError("Fd_Name column is empty; cannot classify feeds.")

    feed_type = _string_array(f_nd, n, ["Fd_Type", "Feed_Type"], required=True)
    feed_category = _string_array(f_nd, n, ["Fd_Category", "Category"], required=True)
    dm_values = _numeric_array(f_nd, n, ["Fd_DM", "DM_Percent"], required=True)
    cp_values = _numeric_array(f_nd, n, "Fd_CP", required=True)
    ndf_values = _numeric_array(f_nd, n, "Fd_NDF", required=True)
    is_byprod = _numeric_array(f_nd, n, "Fd_isbyprod", required=True) > 0

    mask_for = feed_type == "forage"
    mask_minerals = feed_category == "minerals"
    mask_conc_all = ~mask_for & (~mask_minerals)

    cat_grass_legume = (np.char.find(feed_category, "grass") >= 0) | \
                       (np.char.find(feed_category, "legume") >= 0)
    mask_lqf = mask_for & ~cat_grass_legume & (cp_values < 7) & (ndf_values > 65)

    # Forage tree/shrub — tree legumes (leucaena, moringa, indigofera, sesbania,
    # pigeon pea).
    mask_tree_legume = mask_for & (
        (np.char.find(feed_category, "tree") >= 0)
        | (np.char.find(feed_category, "shrub") >= 0)
    )
    
    # Wet by-products: any feed marked as a by-product with low DM%.
    mask_wet_byprod = is_byprod & (dm_values < 30)
    # Other wet ingredients: non-forage, very low DM%, explicitly excluding wet by-products
    # so the same ingredient is not charged against both conc_byprod_max and
    # other_wet_ingr_max. Without this clause a wet by-product consumes both budgets and
    # is effectively capped by the tighter of the two.
    mask_wet_other = (~mask_for) & (dm_values < 21) & (~mask_wet_byprod)

    fd_names_lower = np.char.strip(np.char.lower(np.asarray(names, dtype=str)))
    mask_molasses = np.char.find(fd_names_lower, "molasses") >= 0
    
    # Pure NPN sources are caught by CP alone: no true feedstuff exceeds 100% CP
    # (N x 6.25), while urea itself reads ~281% — this catches a pure-urea/NPN
    # feed regardless of how it's named. The name check is kept alongside it as a
    # safety net for blended/diluted urea products (urea-molasses licks,
    # urea-treated straw): their CP is far under 100 despite containing urea, so
    # CP alone would silently drop them from the per-feed urea cap in
    # optimization_core.py:159 (calibrated for pure urea; sharing that same cap
    # across "any urea-bearing feed" is exactly why both signals are needed here).
    mask_urea = (cp_values > 100) | (np.char.find(fd_names_lower, "urea") >= 0)

    categories = {
        # Masks
        "mask_forage": mask_for,
        "mask_conc_all": mask_conc_all,
        "mask_minerals": mask_minerals,
        "mask_lqf": mask_lqf,
        "mask_tree_legume": mask_tree_legume,
        "mask_wet_other": mask_wet_other,
        "mask_wet_byprod": mask_wet_byprod,
        "mask_urea": mask_urea,
        "mask_molasses": mask_molasses,
        # Summary flags
        "has_lqf": bool(np.any(mask_lqf)),
        "has_wet_byprod": bool(np.any(mask_wet_byprod)),
        "has_wet_other": bool(np.any(mask_wet_other)),
        "has_concentrate": bool(np.any(mask_conc_all)),
        "has_minerals": bool(np.any(mask_minerals)),
        "has_tree_legume": bool(np.any(mask_tree_legume)),
        "has_urea": bool(np.any(mask_urea)),
        "has_molasses": bool(np.any(mask_molasses)),
    }

    return categories

########################################################
# Utility for Message Handling
########################################################


########################################################
# Formatting / JSON-safety helpers (moved from app/utils.py — Task 2.8)
# Kept here so core/ has zero upward imports into app/.
########################################################

def round_numeric_value(value, decimal_places=2):
    """Round a numeric value to *decimal_places* using ROUND_HALF_UP. Returns None on invalid input."""
    from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
    if value is None:
        return None
    if isinstance(value, (int, float)):
        value = str(value)
    if not value or str(value).strip() == '':
        return None
    value_lower = str(value).lower().strip()
    if value_lower in ('nan', 'inf', '-inf', 'null', 'none'):
        return None
    try:
        rounded = Decimal(str(value)).quantize(
            Decimal('0.' + '0' * decimal_places),
            rounding=ROUND_HALF_UP,
        )
        return float(rounded)
    except (ValueError, TypeError, OverflowError, InvalidOperation):
        return None


def format_value_with_unit(value, unit):
    """Format a numeric value with a unit string; returns None for blank/None values."""
    if value is None or value == '':
        return None
    if value == 0:
        return 0
    if isinstance(value, (int, float)) and value == int(value):
        return f"{int(value)} {unit}"
    return f"{value:.2f} {unit}"


def safe_float(value):
    """Coerce *value* to float; returns 0.0 on failure."""
    if value is None or value == '':
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def ensure_json_safe(value):
    """Recursively replace NaN/inf with 0.0 and numpy scalars with plain Python types."""
    import numpy as np
    if isinstance(value, dict):
        return {k: ensure_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [ensure_json_safe(v) for v in value]
    if isinstance(value, (int, str, bool)) or value is None:
        return value
    if isinstance(value, float):
        return 0.0 if (np.isnan(value) or np.isinf(value)) else value
    if hasattr(value, 'item'):  # numpy scalar
        val = value.item()
        return 0.0 if (np.isnan(val) or np.isinf(val)) else val
    return value
