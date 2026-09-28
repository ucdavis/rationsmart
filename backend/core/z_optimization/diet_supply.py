import logging
import numpy as np
from typing import Optional
from .utilities import safe_divide, safe_sum, calculate_discount, calculate_MEact, classify_feed_categories

logger = logging.getLogger(__name__)

# Purpose: Calculate nutrient supply vector from ingredient quantities and feed data.
# Notes: Raises on invalid inputs; returns 17-element array with supply and balance metrics.
def rsm_diet_supply(x, f_nd, animal_requirements, is_heifer: Optional[bool] = None):
    """
    Calculate the diet supply based on the input vector x and feed data.
    Supports both single diet (1D array) and batch (2D matrix) inputs.
    """
    try:
        # 1. Input Validation and Shape Detection
        x_arr = np.asarray(x, dtype=float)
        is_batch = x_arr.ndim > 1
        num_feeds = len(f_nd["Fd_Name"])
        
        if (is_batch and x_arr.shape[1] != num_feeds) or (not is_batch and x_arr.shape[0] != num_feeds):
           raise ValueError(f"Input vector length doesn't match feed count {num_feeds}")
        if np.any(x_arr < 0):
                raise ValueError("Negative feed amounts not allowed")

        # 2. Requirement Extraction
        An_MBW = animal_requirements["An_MBW"]
        An_BW = animal_requirements["An_BW"]
        An_MPg = animal_requirements["An_MPg"]
        An_MPp = animal_requirements["An_MPp"]
        An_MPl = animal_requirements["An_MPl"]
        An_ME = animal_requirements["An_ME"]
        An_NEL = animal_requirements["An_NEL"]
        An_StatePhys = animal_requirements["An_StatePhys"]
        An_BW_mature = animal_requirements["An_BW_mature"]
        Body_NP_CP = 0.86  

        # 3. Dry Matter Intake (DMI)
        dmi = np.sum(x_arr, axis=1) if is_batch else np.sum(x_arr)
        
        # Protection against zero intake
        if is_batch:
            dmi = np.maximum(dmi, 1e-10)
        elif dmi < 1e-6:
            raise ValueError("Total DMI is too small or zero")

        # 4. Nutritional Discount Calculation (Vectorized)
        fd_tdn_prop = f_nd["Fd_TDN"] / 100.0
        total_tdn = x_arr @ fd_tdn_prop if is_batch else np.sum(x_arr * fd_tdn_prop)
        discount = calculate_discount(total_tdn, dmi, An_MBW)

        # 5. Energy Values (Matrix Broadcasting)
        if is_batch:
            # Broadcast discount (Pop,) across all feeds (NumFeeds,)
            fd_de_act = f_nd["Fd_DE"] * discount[:, np.newaxis]
            fd_me_act = calculate_MEact(fd_de_act, f_nd["Fd_EE"], f_nd["Fd_isFat"], f_nd["Fd_isMi"])
            nel_diet = np.sum(x_arr * fd_me_act, axis=1) * 0.66
        else:
            fd_de_act = f_nd["Fd_DE"] * discount
            fd_me_act = calculate_MEact(fd_de_act, f_nd["Fd_EE"], f_nd["Fd_isFat"], f_nd["Fd_isMi"])
            nel_diet = np.sum(x_arr * fd_me_act) * 0.66

        # 6. Protein & Fiber Logic (Vectorized)
        ndf_diet_val = (x_arr @ f_nd["Fd_NDF"]) / dmi if is_batch else np.sum(x_arr * f_nd["Fd_NDF"]) / dmi
        
        # Dynamic Protein requirement components
        Km_MP_NP = 0.65 
        scrf_cp = 0.20 * An_BW**0.60 
        scrf_np = scrf_cp * Body_NP_CP
        fecal_cp = (12 + 0.12 * ndf_diet_val) * dmi
        fecal_np = fecal_cp * 0.73 
        urinary_np = (0.053 * An_BW) * 6.25

        total_np_m_use = scrf_np + urinary_np + fecal_np
        an_mp_m = total_np_m_use / Km_MP_NP  
        total_mp_req_g = an_mp_m + An_MPg + An_MPp + An_MPl

        # Heifer safety checks
        if is_heifer is None:
            state_lower = str(An_StatePhys).lower()
            is_heifer = "heifer" in state_lower and "lact" not in state_lower

        if is_heifer:
            mp_min = (53 - 25 * (An_BW / An_BW_mature)) * (An_NEL / 0.66)
            total_mp_req_g = np.maximum(total_mp_req_g, mp_min)

        total_mp_requirement_kg = total_mp_req_g / 1000.0

        # GER Protein Supply (Matrix path)
        fd_cp_prop = f_nd["Fd_CP"] / 100.0
        if is_batch:
            total_me_mj = np.sum(fd_me_act * x_arr, axis=1) * 4.184
            total_cp_g = (x_arr @ fd_cp_prop) * 1000.0
        else:
            total_me_mj = np.sum(fd_me_act * x_arr) * 4.184
            total_cp_g = np.sum(fd_cp_prop * x_arr) * 1000.0
            
        util_cp = 8.76 * total_me_mj + 0.36 * total_cp_g
        mp_ger = (util_cp * 0.73 * 0.85) / 1000.0
        protein_balance = mp_ger - total_mp_requirement_kg

        # 7. Final Supply Vector Building
        # Energy selection (ME for heifers, NEL for cows)
        energy_calc = (x_arr @ (f_nd["Fd_DE"] * 0.82)) if is_batch else np.sum(x_arr * f_nd["Fd_DE"] * 0.82)
        energy_calc = energy_calc * discount # apply discount to ME
        supply_energy = energy_calc if is_heifer else nel_diet

        # Nutrient sums (Vectorized)
        s_ca = x_arr @ f_nd["Fd_Ca_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_Ca_kg"])
        s_p = x_arr @ f_nd["Fd_P_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_P_kg"])
        s_ndf = x_arr @ f_nd["Fd_NDF_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_NDF_kg"])
        s_ndf_for = x_arr @ f_nd["Fd_ForNDF_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_ForNDF_kg"])
        s_st = x_arr @ f_nd["Fd_St_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_St_kg"])
        s_ee = x_arr @ f_nd["Fd_EE_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_EE_kg"])
        s_ash = x_arr @ f_nd["Fd_Ash_kg"] if is_batch else np.sum(x_arr * f_nd["Fd_Ash_kg"])
        
        s_me = energy_calc
        nel_balance = nel_diet - An_NEL
        me_balance = s_me - An_ME

        # 8. Intake Metrics (% of Body Weight)
        ndf_intake_pct_bw = safe_divide(s_ndf, An_BW, default_value=np.nan) * 100.0
        forage_ndf_intake_pct_bw = safe_divide(s_ndf_for, An_BW, default_value=np.nan) * 100.0

        # 9. Return Results
        if is_batch:
            # Build matrix [Pop, 19]
            results = np.column_stack([
                dmi, supply_energy, mp_ger, s_ca, s_p,
                s_ndf, s_ndf_for, s_st, s_ee, s_ash, nel_diet, s_me,
                nel_balance, total_mp_requirement_kg, protein_balance, me_balance, an_mp_m,
                ndf_intake_pct_bw, forage_ndf_intake_pct_bw
            ])
        else:
            # Return single array [19]
            results = np.array([
                dmi, supply_energy, mp_ger, s_ca, s_p,
                s_ndf, s_ndf_for, s_st, s_ee, s_ash, nel_diet, s_me,
                nel_balance, total_mp_requirement_kg, protein_balance, me_balance, an_mp_m,
                ndf_intake_pct_bw, forage_ndf_intake_pct_bw
            ])

        return results
    
    except Exception as e:
        logger.error("Error in diet_supply: %s", e)
        # Return default values
        fallback = np.full(19, np.nan)
        return fallback if not is_batch else np.full((x_arr.shape[0], 19), np.nan)