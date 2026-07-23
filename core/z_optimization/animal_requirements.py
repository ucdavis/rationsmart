"""
Animal requirements calculation module.

This module contains functions for calculating nutritional requirements
for dairy cattle based on animal characteristics, production goals, and
environmental conditions. It implements requirements equations from NRC (2001), NASEM (2021) 
and other models for:
- Dry Matter Intake (DMI) prediction
- Energy requirements (maintenance, lactation, growth, gestation)
- Protein requirements (metabolizable protein)
- Mineral and vitamin requirements
"""

import pandas as pd
import numpy as np

# Import utilities
from .utilities import adjust_dmi_temperature

# Animal input mapping from API (lowercase) to Engine (CamelCase)
ANIMAL_INPUT_MAPPING = {
    "body_weight": "An_BW",
    "breed": "An_Breed",
    "milk_production": "Trg_MilkProd_L",
    "days_in_milk": "An_LactDay",
    "parity": "An_Parity",
    "days_of_pregnancy": "An_GestDay",
    "tp_milk": "Trg_MilkTPp",
    "fat_milk": "Trg_MilkFatp",
    "temperature": "Env_TempCurr",
    "topography": "Env_Topog",
    "distance": "Env_Dist_km",
    "bw_gain": "Trg_FrmGain",
    "bc_score": "An_BCS",
    "grazing": "Env_Grazing"
}

# Purpose: Calculate comprehensive animal nutrient requirements and intermediate metrics.
# Notes: Raises on invalid state; returns a results dict including inputs, energy, protein, minerals, and status.
def rsm_calculate_an_requirements(animal_inputs):
    """
    Calculate animal nutritional requirements based on input parameters.

    Parameters:
    -----------
    animal_inputs : dict
        Dictionary containing all animal and environment parameters
        
    Returns:
    --------
    dict : Dictionary containing all calculated requirements and intermediate values
    """
    
    animal_inputs = dict(animal_inputs)  # protect caller's dict from mutation (Task 1.8)

    # 1. Map lowercase API keys to internal engine keys if they don't already exist
    for api_key, engine_key in ANIMAL_INPUT_MAPPING.items():
        if api_key in animal_inputs and engine_key not in animal_inputs:
            animal_inputs[engine_key] = animal_inputs[api_key]
            
    # 2. Handle topography mapping if string is provided
    if isinstance(animal_inputs.get("An_Topog"), str) or isinstance(animal_inputs.get("Env_Topog"), str):
        val = animal_inputs.get("Env_Topog") or animal_inputs.get("An_Topog")
        topog_map = {"Flat": 0, "Hilly": 1, "Mountainous": 2}
        animal_inputs["Env_Topog"] = topog_map.get(val, 0)
        
    # 3. Handle lactating state if boolean provided
    if "lactating" in animal_inputs and "An_StatePhys" not in animal_inputs:
        animal_inputs["An_StatePhys"] = "Lactating Cow" if animal_inputs["lactating"] else "Dry Cow"

    # ===================================================================
    # INPUTS
    # ===================================================================
    
    # Required inputs with defaults
    VALID_STATES = ["Lactating Cow", "Dry Cow", "Heifer", "Baby Calf/Heifer"] # State of the animal: "Lactating Cow", "Dry Cow", "Heifer", "Baby Calf/Heifer"
    An_StatePhys = animal_inputs.get("An_StatePhys", "Lactating Cow") 
    if An_StatePhys not in VALID_STATES:
        raise ValueError(f"Invalid animal state: {An_StatePhys}")
    
    An_Breed = animal_inputs.get("An_Breed", "Holstein")  # Breed of the animal: "Holstein", "Indigenous", "Crossbred"
    An_BW = animal_inputs.get("An_BW", 600) # Body weight of the animal in kg
    
    # if user selects "Baby Calf/Heifer" the body weight input can be defauls as 40 kg and the input box should not take values > 100 kg
    
    Trg_FrmGain = animal_inputs.get("Trg_FrmGain", 0.2)          # Target gain in kg/day  Default value: 0.2 kg/day

    # Specify in the front end:
    # Baby_Calf - milk intake only =< 8 weeks of age

    # -------- Only for lactating cows ----------#
    # If animals is not lactating, the following inputs should be disabled : An_ BCS, An_LactDay, Trg_MilkProd_L, Trg_MilkTPp, Trg_MilkFatp, Trg_MilkLacp, An_Parity
    An_BCS = animal_inputs.get("An_BCS", 3.0)              # Body condition score (BCS) of the animal
    An_LactDay = animal_inputs.get("An_LactDay", 100)      # Lactation day of the animal
    Trg_MilkProd_L = animal_inputs.get("Trg_MilkProd_L", 25)         # Target milk production in liters/day
    Trg_MilkTPp = animal_inputs.get("Trg_MilkTPp", 3.2)        # Target milk protein percentage
    Trg_MilkFatp = animal_inputs.get("Trg_MilkFatp", 3.8)         # Target milk fat percentage
    An_Parity = animal_inputs.get("An_Parity", 2)              # Parity of the animal
    # -------------------------------------------#

    An_GestDay = animal_inputs.get("An_GestDay", 0)     # Dry cows and heifer can also be pregnant
    Env_TempCurr = animal_inputs.get("Env_TempCurr", 20)  # Current temperature in Celsius
    Env_Dist_km = animal_inputs.get("Env_Dist_km", 0)  # Distance to grazing area in kilometers
    
    # Standardize Grazing logic:
    # 1. Check if user provided explicit grazing (bool)
    user_grazing = animal_inputs.get("grazing")
    if user_grazing is not None:
        # User explicitly specified grazing status
        # UI/API: True (Grazing), False (Non-grazing)
        # Engine: 1 (Grazing), 0 (Non-grazing)
        Env_Grazing = 1 if user_grazing is True else 0
    else:
        # Fallback to distance-based inference if field missing
        Env_Grazing = 1 if Env_Dist_km > 0 else 0
        
    Env_Topog = animal_inputs.get("Env_Topog", 0)  # Topography (0 for flat, 1 for hilly, 2 for mountainous)           

    # ===================================================================
    # Only defauls in the backend
    # ===================================================================

    Trg_MilkLacp = 4.85        # Target milk lactose percentage
    Trg_RsrvGain = 0           # Target reserve gain in kg/day
    An_305RHA_MlkTP = 396      # 305-day rolling herd average milk protein in kg
    An_AgeCalv1st = 729.6      # Age at first calving in days 
    Fet_BWbrth = 44.1          # Body weight of the fetus in kg
    An_GestLength = 280        # Gestation length in days
    An_AgeConcept1st = 491     # Age at first conception in days
    CalfInt = 370              # Interval between calves in days

    # ===================================================================
    # ANIMAL INPUTS PROCESSING
    # ===================================================================
    
    An_BW_mature = 600 if An_Breed in ["Holstein", "Crossbred"] else 550          # Mature body weight
    An_MBW = An_BW ** 0.75                                                        # Metabolic body weight
    An_BWgain = Trg_FrmGain + Trg_RsrvGain                                        # Body weight gain in kg/day
    Trg_BWgain_g = An_BWgain * 1000                                               # Body weight gain in grams/day
    An_Parity = 2 if An_Parity > 1 else 1                                          # Parity of the animal
    An_Parity = 0 if An_StatePhys == 'Heifer' else An_Parity                      # Heifers have no parity
    Env_Topo = 50 if Env_Topog == 1 else 200 if Env_Topog == 2 else 500 if Env_Topog >= 3 else 0 # Topography in meters
    Env_Dist = Env_Dist_km * 1000                                                 # Distance to grazing area in meters
    Trg_MilkProd = Trg_MilkProd_L * 1.03                                           # Target milk production in kg/d
    An_GestDay = 0 if An_GestDay < 0 or An_GestDay is None else An_GestDay         # Gestation day
    An_GestDay = 0 if An_GestDay > An_GestLength + 10 else An_GestDay             # Gestation day cannot be greater than gestation length + 10 days
    An_PrePartDay = An_GestDay - An_GestLength                                    # Prepartum day
    An_PrePartWk = An_PrePartDay / 7                                              # Prepartum week
    An_PostPartDay = 0 if An_LactDay <= 0 else An_LactDay                          # Postpartum day
    An_PostPartDay = 100 if An_LactDay > 100 else An_LactDay                      # Postpartum day cannot be greater than 100 days
    An_PrePartWklim = -3 if An_PrePartWk < -3 else 0 if An_PrePartWk > 0 else An_PrePartWk # Prepartum week limit
    An_PrePartWkDurat = An_PrePartWklim * 2                                        # Prepartum week duration
    
    # ===================================================================
    # Requirements
    # ===================================================================
    
    # Dry matter intake (DMI) requirements
    
    Trg_NEmilk_Milk = (9.29 * Trg_MilkFatp / 100 + 5.85 * Trg_MilkTPp / 100 + 3.95 * Trg_MilkLacp / 100)
    Trg_NEmilkOut = Trg_NEmilk_Milk * Trg_MilkProd if Trg_MilkProd > 0 else 0

    Dt_DMIn = 0.0

    # Base DMI calculation
    if An_StatePhys == "Lactating Cow":
        # Dt_DMIn = (3.7 + 5.7 * (An_Parity - 1) + 0.305 * Trg_NEmilkOut + 0.022 * An_BW +
        #            (-0.689 - 1.87 * (An_Parity - 1)) * An_BCS) * (1 - (0.212 + 0.136 * (An_Parity - 1)) * np.exp(-0.053 * An_LactDay))     # NASEM 2021

        FCM = (0.4 * Trg_MilkProd) + (15 * Trg_MilkFatp * Trg_MilkProd / 100)

        # DMI_NRC = (0.372 * FCM + 0.0968 * An_MBW) * (1 - np.exp(-0.192 * (An_LactDay / 7 + 3.67)))              # NRC 2001
        # Dt_DMIn_MN = DMI_NRC * 0.87 + 1.3131 # if An_Breed == "Indigenous" else Dt_DMIn                         # eq Brasil UFLA
        Dt_DMIn_BR = (0.4762 * FCM + 0.07219 * An_MBW) * (1 - np.exp(-0.03202 * (An_LactDay + 24.9576)))       # Souza et al., 2014
        Dt_DMIn = adjust_dmi_temperature(Dt_DMIn_BR, Env_TempCurr)                                # selected eq + adjust DMI based on temperature

    elif An_StatePhys == "Dry Cow":                                                             
        Dt_DMIn_DryCow_AdjGest = An_BW * (-0.756 * np.exp(0.154 * (An_GestDay - An_GestLength))) / 100
        Dt_DMIn_DryCow_AdjGest = 0 if (An_GestDay - An_GestLength) < -21 else Dt_DMIn_DryCow_AdjGest
        Dt_DMIn = An_BW * 1.979 / 100 + Dt_DMIn_DryCow_AdjGest

    elif An_StatePhys == "Heifer":
        if An_Breed == "Holstein":
            Dt_DMIn = 15.36 * (1 - np.exp(-0.0022 * An_BW))
        else:  # Crossbred or others
            Dt_DMIn = 12.91 * (1 - np.exp(-0.00295 * An_BW))

    elif An_StatePhys == "Baby Calf/Heifer":
         Dt_DMIn = 0.10 * An_BW

    Trg_Dt_DMIn = Dt_DMIn # Target DMI
    Dt_DMIn_BW = (Dt_DMIn / An_BW) * 100
    Dt_DMIn_MBW = (Dt_DMIn / An_MBW) * 100

    # For baby calf the Trg_Dt_DMIn is the amount of milk that should be fed in L a day; half in the morning and half in the evening.
    # Feed recomendation end here and report can be displayed as following:

    if An_StatePhys == "Baby Calf/Heifer":
        milk_total = round(Trg_Dt_DMIn)  
        milk_morning = round(milk_total / 2, 1)
        milk_evening = round(milk_total / 2, 1)
    else:
        milk_total = milk_morning = milk_evening = 0

    # Report summary if "Baby Calf/Heifer": for this category formulation stops here.
    # The milk-feeding schedule is returned as data (milk_total / milk_morning /
    # milk_evening, above) for the API/report layer to render — no plotting here.
    # (The old standalone version drew a matplotlib table via plt.show(); that has no
    # place in the API engine and is intentionally removed.)

    # Energy requirements

    # Maintenance Energy, Mcal/d 

    Km_ME_NE = 0.63 if An_StatePhys == "Heifer" else 0.66  # dry & lactating cows = 0.66
    Kl_ME_NE = 0.554 # efficiency for tropical catte = 0.554 - NASEM = 0.66

    # Same for Lact, Dry and Heifer (Kelly et al., 2021) 0.10 in Nasem and 0.08 in Kelly et al., 2021
    An_ME_maint = 0.15 *  An_MBW # Mcal/d                                                # only for heifers
    An_NEL_maint = 0.08 * An_MBW if An_StatePhys == "Lactating Cow" else (An_ME_maint * Km_ME_NE)  # Mcal/d

    An_NEmUse_Env = 0
    # Activity energy (walking + topography) only applies when the animal is grazing;
    # a housed animal (Env_Grazing == 0) gets no allowance regardless of whatever
    # distance/topography values were passed in.
    if Env_Grazing == 1:
        An_NEm_Act = (0.00035 * Env_Dist / 1000) * An_BW  # Walking
        An_NEm_Act_Topo = 0.0067 * Env_Topo / 1000 * An_BW  # Topography
    else:
        An_NEm_Act = 0.0
        An_NEm_Act_Topo = 0.0
    An_NEmUse_Act = An_NEm_Act + An_NEm_Act_Topo
    An_NEm = An_NEL_maint + An_NEmUse_Env + An_NEmUse_Act
    An_ME_m = An_NEm / Km_ME_NE  # Maintenance ME, Mcal/d

    # Total Maintenance Energy
    An_NELm = An_NEm

    # Lactation Energy, Mcal/kg of Milk
    An_NELlact = Trg_NEmilkOut  # Mcal/d

    # Gestation energy requirements (NASEM, 2021)

    An_Preg = (An_GestDay > 0) and (An_GestDay <= An_GestLength)

    GrUter_BWgain = 0.0
    Uter_Wt = 0.204
    Fet_Wt = 0.0
    Fet_BWgain = 0.0
    Uter_BWgain = 0.0
    Conc_BWgain = 0.0

    if not An_Preg:
        Gest_REgain = 0.0
        Gest_MEuse = 0.0
        An_MEgest = 0.0
        An_NEgest = 0.0
        Ky_ME_NE = 0.14
        GrUter_BWgain = 0.0
        GrUter_Wt = 0.0
        Uter_Wt = 0.0
        Fet_Wt = 0.0
        Uter_BWgain = 0.0
        Fet_BWgain = 0.0
        Conc_BWgain = 0.0
    else:
        # Calf birth weight (heifers produce slightly smaller calves)
        Fet_BWbrth = 0.058 * An_BW_mature if An_StatePhys == "Heifer" else 0.063 * An_BW_mature

       # NASEM constants
        GrUterWt_FetBWbrth = 1.816
        UterWt_FetBWbrth  = 0.2311
        NE_GrUtWt = 0.950
        GrUter_Ksyn = 2.43e-2
        GrUter_KsynDecay = 2.45e-5
        Fet_Ksyn = 5.16e-2
        Fet_KsynDecay = 7.59e-5
        Uter_Ksyn  = 2.42e-2
        Uter_KsynDecay = 3.53e-5
        Uter_Kdeg  = 0.20

        # Maternal uterus tissue
        Uter_Wtpart = Fet_BWbrth * UterWt_FetBWbrth
        Uter_Wt_base = 0.204
        if An_GestDay > 0:
            Uter_Wt = Uter_Wtpart * np.exp(-(Uter_Ksyn - Uter_KsynDecay * An_GestDay) *
                                           (An_GestLength - An_GestDay))
        elif 0 < An_LactDay < 100:
            Uter_Wt = ((Uter_Wtpart - Uter_Wt_base) *
                       np.exp(-Uter_Kdeg * An_LactDay) + Uter_Wt_base)
        else:
            Uter_Wt = Uter_Wt_base
    
        if An_Parity > 0 and Uter_Wt < 0.204:
            Uter_Wt = 0.204

        # Gravid uterus weight
        if An_GestDay > 0:
            GrUter_Wtpart = Fet_BWbrth * GrUterWt_FetBWbrth
            GrUter_Wt = (GrUter_Wtpart *
                        np.exp(-(GrUter_Ksyn - GrUter_KsynDecay * An_GestDay) *
                                (An_GestLength - An_GestDay)))
            GrUter_Wt = max(GrUter_Wt, Uter_Wt)
        else:
            GrUter_Wt = 0
    
        # Fetal weight prediction
        if An_GestDay > 0:
            Fet_Wt = Fet_BWbrth * np.exp(-(Fet_Ksyn - Fet_KsynDecay * An_GestDay) *
                                         (An_GestLength - An_GestDay))
        else:
            Fet_Wt = 0.0

        # Maternal and fetal tissue growth rates
        if An_GestDay > 0:
            Uter_BWgain = (Uter_Ksyn - Uter_KsynDecay * An_GestDay) * Uter_Wt
        elif 0 < An_LactDay < 100:
            Uter_BWgain = -Uter_Kdeg * Uter_Wt
        else:
            Uter_BWgain = 0.0

        if An_GestDay > 0:
            Fet_BWgain = (Fet_Ksyn - Fet_KsynDecay * An_GestDay) * Fet_Wt
        else:
            Fet_BWgain = 0.0

        # Daily gain/loss of gravid uterus tissue
        if An_GestDay > 0:
            GrUter_BWgain = (GrUter_Ksyn - GrUter_KsynDecay * An_GestDay) * GrUter_Wt
        elif 0 < An_LactDay < 100:
            GrUter_BWgain = Uter_BWgain
        else:
            GrUter_BWgain = 0.0

        Conc_BWgain = GrUter_BWgain - Uter_BWgain

        # Net energy retained and ME use
        Gest_REgain = GrUter_BWgain * NE_GrUtWt
        Ky_ME_NE = 0.14 if Gest_REgain >= 0 else 0.89
        An_MEgest = Gest_REgain / Ky_ME_NE
        An_NEgest = An_MEgest * Kl_ME_NE  # NEL equivalent

    # Changes in BW
    BW_BCS = 0.094 * An_BW  # Each BCS represents 94 g of weight per kg of BW
    An_BWnp = An_BW - GrUter_Wt  # Non-pregnant BW
    An_BWnp3 = An_BWnp / (1 + 0.094 * (An_BCS - 3))  # BWnp standardized to BCS of 3 using 9.4% of BW/unit of BCS

    # Frame and reserve gains (kg/d)
    Frm_Gain = Trg_FrmGain
    Rsrv_Gain = Trg_RsrvGain
    Body_Gain = Frm_Gain + Rsrv_Gain

    # Gut fill adjustment (as in NASEM)
    An_GutFill_BW = 0.06 # calf starter
    if An_StatePhys == "Heifer":
        An_GutFill_BW = 0.15
    elif An_StatePhys in ("Dry Cow", "Lactating Cow") and An_Parity > 0:
        An_GutFill_BW = 0.18

    Rsrv_Gain_empty = Rsrv_Gain

    An_GutFill_Wt = An_GutFill_BW * An_BWnp
    An_BW_empty = An_BW - An_GutFill_Wt
    An_BWmature_empty = An_BW_mature * (1 - An_GutFill_BW)
    An_BWnp_empty = An_BWnp3 - An_GutFill_Wt  # Non-pregnant empty BW
    An_BWnp3_empty = An_BWnp3 - An_GutFill_Wt  # Non-pregnant empty BW standardized to BCS of 3

    # Body composition
    Body_Fat_EBW = 0.067 + 0.188 * An_BW / An_BW_mature # eq 11-4a empty
    Frm_Gain_empty = Frm_Gain * (1 - An_GutFill_BW)
    Prot_BW_empty = 0.215 * Frm_Gain_empty # Protein in empty in kg/d

    # Fat and protein gains
    FatGain_Frm = 0.067 + 0.375 * (An_BW / An_BW_mature) # eq 11.5a gain
    NonFatGain_FrmGain = 1 - FatGain_Frm    # eq 11.5b
    Prot_EBG = 0.215 * NonFatGain_FrmGain

    FatGain_Rsrv = 0.622
    Frm_Fatgain = FatGain_Frm * Frm_Gain_empty
    Rsrv_Fatgain = FatGain_Rsrv * Rsrv_Gain_empty 
    Body_Fatgain = Frm_Fatgain + Rsrv_Fatgain

    Body_NP_CP = 0.86

    CPGain_Frm = 0.201 - 0.081 * (An_BW / An_BW_mature) #CP gain / gain for heifers
    NPGain_Frm = CPGain_Frm * Body_NP_CP #Convert to CP to TP gain / gain
    Frm_NPgain = NPGain_Frm * Frm_Gain_empty #TP gain
    CPGain_Rsrv = 0.068
    NPGain_Rsrv = CPGain_Rsrv * Body_NP_CP
    Rsrv_NPgain = NPGain_Rsrv * Rsrv_Gain_empty
    Body_CPgain = (Frm_NPgain + Rsrv_NPgain) / Body_NP_CP #CP gain

    # Retained energy (NE) for gain
    Frm_CPgain = Frm_NPgain /  Body_NP_CP   #CP gain
    Rsrv_CPgain = CPGain_Frm * Rsrv_Gain_empty

    Frm_NEgain = 9.4 * Frm_Fatgain + 5.55 * Frm_CPgain
    Rsrv_NEgain = 9.4 * Rsrv_Fatgain + 5.55 * Rsrv_CPgain

    # ME efficiencies
    Kf_ME_RE = 0.4 if An_BW < 250 else 0.63  # dry & lactating cows = 0.66.  # Nasem mixed this eff. for heifer sometimes 0.4 and sometimes 0.63 ??
    Kf_ME_RE = Kf_ME_RE if An_StatePhys == "Heifer" else 0.66  # dry & lactating cows = 0.66
    Kr_ME_RE = 0.60                      # reserves gain (heifers and dry cows)
    if Trg_MilkProd > 0 and Trg_RsrvGain > 0:
        Kr_ME_RE = 0.75                  # lactating cows gaining reserves
    if Trg_RsrvGain <= 0:
        Kr_ME_RE = 0.89                  # cows losing reserves

    # Convert to ME and then to NEL
    Frm_MEgain = Frm_NEgain / Kf_ME_RE
    Rsrv_MEgain = Rsrv_NEgain / Kr_ME_RE
    An_MEgain = Frm_MEgain + Rsrv_MEgain
    An_NELgain = An_MEgain * Kf_ME_RE if An_StatePhys == "Heifer" else Kl_ME_NE #NEL equivalent

    An_ME = An_ME_m + An_MEgest + An_MEgain # Only for heifers

    An_NEL = An_NELm + An_NELlact + An_NEgest + An_NELgain # For dry and lact cows

    # Protein requirements 
    # Maintenance protein, g/d

    Km_MP_NP = 0.69

    # Scurf
    #Scrf_CP_g = 0.20 * An_BW**0.60 
    #Scrf_MP_g = Scrf_CP_g / Km_MP_NP
    #Scrf_NP_g = Scrf_CP_g * Body_NP_CP
    # Fecal                                                           #   dynamic part calculated inside the diet supply function
    #Fecal_CPend_g = ((12 + 0.12 * NDF in diet) * DMI) 
    #Fecal_MPend_g = Fecal_CPend_g / Km_MP_NP
    #Fe_NPend_g = Fe_CPend_g * 0.73 
    # Urinary
    # Urinary endogenous protein
    #Ur_NPend_g  = 0.053 * An_BW
    #Ur_MPend_g = Ur_NPend_g / Km_MP_NP
    #Ur_NPend_g = Ur_NPend_g * 6.25

    # Total maintenance NP and CP use
    #An_NPm_Use = Scrf_NP_g + Ur_NPend_g # + Fe_NPend_g   Add to diet supply function
    #An_CPm_Use = Scrf_CP_g + Ur_NPend_g # + Fe_CPend_g   Add to diet supply function

    # An_MPm = An_NPm_Use / Km_MP_NP  # Maintenance MP, g/d

    # Lactation
    An_MPl = Trg_MilkProd * Trg_MilkTPp / 100 / 0.67 * 1000

    # Growth

    # Net protein gain from frame and reserves gain (kg/d)
    Body_NPgain = Frm_NPgain + Rsrv_NPgain
    Body_NPgain_g = Body_NPgain * 1000

    # MP efficiency for growth
    if An_Parity == 0:  # heifers
        Kg_MP_NP = 0.60 * Body_NP_CP
        if An_BW_empty / An_BWmature_empty > 0.12:
            Kg_MP_NP = (0.64 - 0.3 * (An_BW_empty / An_BWmature_empty)) * Body_NP_CP
        if Kg_MP_NP < 0.394 * Body_NP_CP:
            Kg_MP_NP = 0.394 * Body_NP_CP
    else:  # cows (lactating or dry)
         Kg_MP_NP = 0.69

    An_MPg = Body_NPgain_g / Kg_MP_NP if Kg_MP_NP > 0 else 0

    # Pregnancy 

    CP_GrUtWt = 0.123
    # Net protein gain in the gravid uterus
    Gest_NCPgain_g = GrUter_BWgain * CP_GrUtWt * 1000
    Gest_NPgain_g = Gest_NCPgain_g * Body_NP_CP
    Gest_NPother_g = 0  # Other protein gain in gestation, defaults to 0
    Gest_NPuse_g = Gest_NPgain_g + Gest_NPother_g     # Gest_NPother_g defaults to 0
    Gest_CPuse_g = Gest_NPuse_g / Body_NP_CP

    Ky_MP_NP_Trg = 0.33

    if Gest_NPuse_g >= 0:
        An_MPp = Gest_NPuse_g / Ky_MP_NP_Trg
    else:
        An_MPp = Gest_NPuse_g * 1  # or just MP_p = Gest_NPuse_g

    An_MP = An_MPl + An_MPg + An_MPp           # # Incomplete requirement - Maintenance requirement (An_MPm) is calculated during optimization

    # Mineral requirements g/d unless specified otherwise

    # Calcium requirements 
    Fe_Ca_m = 0.9 * Dt_DMIn
    An_Ca_g = (9.83 * An_BW_mature ** 0.22 * An_BW ** -0.22) * An_BWgain
    An_Ca_y = (0.0245 * np.exp((0.05581 - 0.00007 * An_GestDay) * An_GestDay) - 0.0245 * np.exp((0.05581 - 0.00007 * (An_GestDay - 1)) * (An_GestDay - 1))) * An_BW / 715
    An_Ca_l = (0.295 + 0.239 * Trg_MilkTPp) * Trg_MilkProd

    # total Ca requirement
    An_Ca_r = Fe_Ca_m + An_Ca_g + An_Ca_y + An_Ca_l # g/day
    An_Ca_req = An_Ca_r / 1000 # convert to kg      # absorbed requirement

    # Phosphorus requirements
    Ur_P_m = 0.0006 * An_BW
    Fe_P_m = 0.8 * Dt_DMIn if An_Parity == 0 else 1.0 * Dt_DMIn
    An_P_m = Ur_P_m + Fe_P_m

    An_P_g = (1.2 + (4.635 * An_BW_mature ** 0.22 * An_BW ** -0.22)) * An_BWgain
    An_P_y = (0.02743 * np.exp((0.05527 - 0.000075 * An_GestDay) * An_GestDay) - 0.02743 * np.exp((0.05527 - 0.000075 * (An_GestDay - 1)) * (An_GestDay - 1))) * An_BW / 715
    An_P_l = 0 if Trg_MilkProd <= 0 else (0.48 + 0.13 * Trg_MilkTPp) * Trg_MilkProd

    # total P requirement
    An_P_r = An_P_m + An_P_g + An_P_y + An_P_l
    An_P_req = An_P_r / 1000 # convert to kg.       # absorbed requirement

    # Magnesium requirements
    Ur_Mg_m = 0.0007 * An_BW
    Fe_Mg_m = 0.3 * Dt_DMIn
    An_Mg_m = Ur_Mg_m + Fe_Mg_m
    An_Mg_g = 0.45 * An_BWgain
    An_Mg_y = 0.3 * (An_BW / 715) if An_GestDay > 190 else 0
    An_Mg_l = 0 if Trg_MilkProd <= 0 else 0.11 * Trg_MilkProd
    An_Mg_req = An_Mg_m + An_Mg_g + An_Mg_y + An_Mg_l
    An_Mg_prod = An_Mg_y + An_Mg_l + An_Mg_g

    # Sodium requirements
    Fe_Na_m = 1.45 * Dt_DMIn
    An_Na_g = 1.4 * An_BWgain
    An_Na_y = 1.4 * An_BW / 715 if An_GestDay > 190 else 0
    An_Na_l = 0 if Trg_MilkProd <= 0 else 0.4 * Trg_MilkProd
    An_Na_req = Fe_Na_m + An_Na_g + An_Na_y + An_Na_l
    An_Na_prod = An_Na_y + An_Na_l + An_Na_g

    # Chloride requirements
    Fe_Cl_m = 1.11 * Dt_DMIn
    An_Cl_g = 1.0 * An_BWgain
    An_Cl_y = 1.0 * An_BW / 715 if An_GestDay > 190 else 0
    An_Cl_l = 0 if Trg_MilkProd <= 0 else 1.0 * Trg_MilkProd
    An_Cl_req = Fe_Cl_m + An_Cl_g + An_Cl_y + An_Cl_l
    An_Cl_prod = An_Cl_y + An_Cl_l + An_Cl_g

    # Potassium requirements
    Ur_K_m = 0.2 * An_BW if Trg_MilkProd > 0 else 0.07 * An_BW
    Fe_K_m = 2.5 * Dt_DMIn
    An_K_m = Ur_K_m + Fe_K_m
    An_K_g = 2.5 * An_BWgain
    An_K_y = 1.03 * (An_BW / 715) if An_GestDay > 190 else 0
    An_K_l = 0 if Trg_MilkProd <= 0 else 1.5 * Trg_MilkProd
    An_K_req = An_K_m + An_K_g + An_K_y + An_K_l
    An_K_prod = An_K_y + An_K_l + An_K_g

    # Sulfur requirements
    An_S_req = 2 * Dt_DMIn

    # Cobalt requirements
    An_Co_req = 0.2 * Dt_DMIn

    # Copper requirements
    An_Cu_m = 0.0145 * An_BW
    An_Cu_g = 2.0 * An_BWgain
    An_Cu_y = 0 if An_GestDay < 90 else 0.0023 * An_BW if An_GestDay > 190 else 0.0003 * An_BW
    An_Cu_l = 0 if Trg_MilkProd <= 0 else 0.04 * Trg_MilkProd
    An_Cu_req = An_Cu_m + An_Cu_g + An_Cu_y + An_Cu_l
    An_Cu_prod = An_Cu_y + An_Cu_l + An_Cu_g

    # Iodine requirements
    An_I_req = 0.216 * An_BW ** 0.528 + 0.1 * Trg_MilkProd

    # Iron requirements
    An_Fe_m = 0
    An_Fe_g = 34 * An_BWgain
    An_Fe_y = 0.025 * An_BW if An_GestDay > 190 else 0
    An_Fe_l = 0 if Trg_MilkProd <= 0 else 1.0 * Trg_MilkProd
    An_Fe_req = An_Fe_m + An_Fe_g + An_Fe_y + An_Fe_l
    An_Fe_prod = An_Fe_y + An_Fe_l + An_Fe_g

    # Manganese requirements
    An_Mn_m = 0.0026 * An_BW
    An_Mn_g = 2.0 * An_BWgain
    An_Mn_y = 0.00042 * An_BW if An_GestDay > 190 else 0
    An_Mn_l = 0 if Trg_MilkProd <= 0 else 0.03 * Trg_MilkProd
    An_Mn_req = An_Mn_m + An_Mn_g + An_Mn_y + An_Mn_l
    An_Mn_prod = An_Mn_y + An_Mn_l + An_Mn_g

    # Selenium requirements
    An_Se_req = 0.3 * Dt_DMIn

    # Zinc requirements
    An_Zn_m = 5.0 * Dt_DMIn
    An_Zn_g = 24 * An_BWgain
    An_Zn_y = 0.017 * An_BW if An_GestDay > 190 else 0
    An_Zn_l = 0 if Trg_MilkProd <= 0 else 4.0 * Trg_MilkProd
    An_Zn_req = An_Zn_m + An_Zn_g + An_Zn_y + An_Zn_l
    An_Zn_prod = An_Zn_y + An_Zn_l + An_Zn_g

    # Vitamin A requirements
    An_VitA_req = 110 * An_BW + 1000 * (Trg_MilkProd - 35) if Trg_MilkProd > 35 else 110 * An_BW

    # Vitamin D requirements
    An_VitD_req = 40 * An_BW if Trg_MilkProd > 0 else 32 * An_BW

    # Vitamin E requirements
    An_VitE_req = 2.0 * An_BW if Trg_MilkProd == 0 and An_Parity >= 1 else 0.8 * An_BW
    An_VitE_req = 3.0 * An_BW if An_GestDay >= 259 and An_Preg == 1 else An_VitE_req
    An_VitE_req = 0 if An_VitE_req < 0 else An_VitE_req
    
    
    # ===================================================================
    # 5. RETURN RESULTS DICTIONARY
    # ===================================================================
    
    results = {
        # Animal inputs (processed)
        "An_StatePhys": An_StatePhys,
        "An_Breed": An_Breed,
        "An_BW": An_BW,
        "An_BCS": An_BCS,
        "An_LactDay": An_LactDay,
        "An_Parity": An_Parity,
        "An_BW_mature": An_BW_mature,
        "An_MBW": An_MBW,
        "An_GestDay": An_GestDay,         #Jan 25 : From QS List SNo 8  #satish
        
        # Milk production
        "Trg_MilkProd": Trg_MilkProd,
        "Trg_MilkProd_L": Trg_MilkProd_L,
        "Trg_MilkFatp": Trg_MilkFatp,
        "Trg_MilkTPp": Trg_MilkTPp,
        "Trg_MilkLacp": Trg_MilkLacp,
        "Trg_NEmilk_Milk": Trg_NEmilk_Milk,
        "Trg_NEmilkOut": Trg_NEmilkOut,
        
        # Environment
        "Env_TempCurr": Env_TempCurr,
        "Env_Grazing": Env_Grazing,
        "Env_Dist": Env_Dist,
        "Env_Topo": Env_Topo,
        
        # Growth
        "Trg_FrmGain": Trg_FrmGain,
        "Trg_RsrvGain": Trg_RsrvGain,
        "An_BWgain": An_BWgain,
        
        # DMI calculations
        "Dt_DMIn": Dt_DMIn,
        "Trg_Dt_DMIn": Trg_Dt_DMIn,
        "Dt_DMIn_BW": Dt_DMIn_BW,
        "Dt_DMIn_MBW": Dt_DMIn_MBW,
        
        # Milk feeding (for baby calves)
        "milk_total": milk_total,
        "milk_morning": milk_morning,
        "milk_evening": milk_evening,

        # Energy requirements
        "An_NEmUse_Env": An_NEmUse_Env,
        "An_NEm_Act": An_NEm_Act,
        "An_NEm_Act_Topo": An_NEm_Act_Topo,
        "An_ME_m": An_ME_m,
        "An_NEm": An_NEm,
        "An_NELm": An_NELm,
        "An_NELlact": An_NELlact,
        "An_Preg": An_Preg,
        "An_MEgest": An_MEgest,
        "An_NEgest": An_NEgest,
        "An_MEgain": An_MEgain,
        "An_NELgain": An_NELgain,
        "An_ME": An_ME,
        "An_NEL": An_NEL,

        # Protein requirements
        "An_MPl": An_MPl,
        "An_MPg": An_MPg,
        "An_MPp": An_MPp,
        "An_MP": An_MP,

        # Mineral requirements
        "An_Ca_req": An_Ca_req,
        "An_P_req": An_P_req,
        "An_Mg_req": An_Mg_req,
        "An_Na_req": An_Na_req,
        "An_Cl_req": An_Cl_req,
        "An_K_req": An_K_req,
        "An_S_req": An_S_req,
        "An_Co_req": An_Co_req,
        "An_Cu_req": An_Cu_req,
        "An_I_req": An_I_req,
        "An_Fe_req": An_Fe_req,
        "An_Mn_req": An_Mn_req,
        "An_Se_req": An_Se_req,
        "An_Zn_req": An_Zn_req,
        "An_VitA_req": An_VitA_req,
        "An_VitD_req": An_VitD_req,
        "An_VitE_req": An_VitE_req,

        # Status
        "status": "success"
    }
    
    return results

# Purpose: Build a display dataframe of key animal inputs.
# Notes: Infers missing mature weight and converts environment fields for presentation.
def rsm_create_animal_inputs_dataframe(animal_requirements):
    """
    Create Animal Inputs DataFrame
    """
    # Extract values with defaults for missing keys
    An_Breed = animal_requirements.get("An_Breed", "Unknown")
    An_StatePhys = animal_requirements.get("An_StatePhys", "Unknown")
    An_BW = animal_requirements.get("An_BW", 0)
    An_BCS = animal_requirements.get("An_BCS", 0)
    Trg_FrmGain = animal_requirements.get("Trg_FrmGain", 0)
    # Ensure An_BW_mature is always calculated if missing (fallback to breed-based calculation)
    An_BW_mature = animal_requirements.get("An_BW_mature", None)
    if An_BW_mature is None or An_BW_mature == 0:
        # Recalculate based on breed if missing or zero
        An_BW_mature = 600 if An_Breed in ["Holstein", "Crossbred"] else 550
    An_Parity = animal_requirements.get("An_Parity", 0)
    An_LactDay = animal_requirements.get("An_LactDay", 0)
    An_GestDay = animal_requirements.get("An_GestDay", 0)
    Env_TempCurr = animal_requirements.get("Env_TempCurr", 20)
    # Convert Env_Dist (meters) to km for display
    Env_Dist_meters = animal_requirements.get("Env_Dist", 0)
    Env_Dist_km = Env_Dist_meters / 1000 if Env_Dist_meters > 0 else 0
    # Convert Env_Topo (elevation in meters) to text description for display
    Env_Topo_elevation = animal_requirements.get("Env_Topo", 0)
    if Env_Topo_elevation == 0:
        Env_Topo_display = "Flat"
    elif Env_Topo_elevation == 50:
        Env_Topo_display = "Hilly"
    elif Env_Topo_elevation in [200, 500]:
        Env_Topo_display = "Mountainous"
    else:
        Env_Topo_display = "Flat"  # Default fallback
    Trg_MilkProd_L = animal_requirements.get("Trg_MilkProd_L", 0)
    Trg_MilkTPp = animal_requirements.get("Trg_MilkTPp", 0)
    Trg_MilkFatp = animal_requirements.get("Trg_MilkFatp", 0)
    
    # Grazing status
    env_grazing = animal_requirements.get("Env_Grazing", 0)
    grazing_display = "Grazing" if env_grazing == 1 else "Non-grazing"
    
    Animal_inputs = pd.DataFrame({
        "Parameter": [
            "Breed", "Animal Type", "Animal Weight", "Body Condition Score",
            "Daily BW Gain", "Parity", "Days in Milk", "Days of Pregnancy",
            "Current Temperature", "Distance Walked", "Topography", "Grazing Status", "Milk Production",
            "Milk True Protein Content", "Milk Fat Content"
        ],
        
        "Value": [
            An_Breed, An_StatePhys, An_BW, An_BCS, 
            Trg_FrmGain, An_Parity, An_LactDay, An_GestDay,
            Env_TempCurr, Env_Dist_km, Env_Topo_display, grazing_display, Trg_MilkProd_L,
            Trg_MilkTPp, Trg_MilkFatp
        ],
        
        "Unit": [
            "", "", "kg", "", "kg/day", "", "days", "days",
            "°C", "km", "", "", "L", "%", "%"
        ]
    })
    
    return Animal_inputs

# Purpose: Assemble a dataframe summarizing computed animal requirements for reporting.
# Notes: Uses diet supply results for MP entry and adapts energy label to heifer/cow context.
def rsm_create_animal_requirements_dataframe(animal_requirements, diet_supply_results=None):
    """
    Create comprehensive Animal Requirements DataFrame from animal_requirements dictionary
    """
    # Determine energy requirement and name
    An_StatePhys = animal_requirements.get("An_StatePhys", "Unknown")
    is_heifer = "heifer" in An_StatePhys.strip().lower()
    energy_req = animal_requirements.get("An_ME", 0) if is_heifer else animal_requirements.get("An_NEL", 0)
    energy_name = "Metabolizable energy (ME)" if is_heifer else "Net energy lactation (NEL)"
    
    # Calculate DMI as % of BW
    Trg_Dt_DMIn = animal_requirements.get("Trg_Dt_DMIn", 0)
    An_BW = animal_requirements.get("An_BW", 0)
    Dt_DMIn_BW = (Trg_Dt_DMIn / An_BW * 100) if An_BW > 0 else 0
    
    # Extract all requirements with proper defaults
    requirements_data = {
        "Parameter": [
            "Dry matter intake", 
            "Intake (%Body Weight)", 
            energy_name, 
            "Metabolizable protein (MP)",
            "Water Intake", 
            "Calcium", 
            "Phosphorus", 
            "Magnesium", 
            "Sodium",
            "Chlorine", 
            "Potassium", 
            "Sulfur", 
            "Cobalt", 
            "Copper", 
            "Iodine", 
            "Iron", 
            "Manganese",
            "Selenium", 
            "Zinc", 
            "Vitamin A", 
            "Vitamin D", 
            "Vitamin E"
        ],
        
        "Value": [
            Trg_Dt_DMIn,
            Dt_DMIn_BW,
            energy_req,
            (diet_supply_results.get(13, 0) if isinstance(diet_supply_results, dict) else (diet_supply_results[13] if (isinstance(diet_supply_results, (list, np.ndarray)) and len(diet_supply_results) > 13) else 0)),                                     # To use wen finishing function
            animal_requirements.get("An_WaIn", 0),
            animal_requirements.get("An_Ca_req", 0),
            animal_requirements.get("An_P_req", 0),
            animal_requirements.get("An_Mg_req", 0),
            animal_requirements.get("An_Na_req", 0),
            animal_requirements.get("An_Cl_req", 0),
            animal_requirements.get("An_K_req", 0),
            animal_requirements.get("An_S_req", 0),
            animal_requirements.get("An_Co_req", 0),
            animal_requirements.get("An_Cu_req", 0),
            animal_requirements.get("An_I_req", 0),
            animal_requirements.get("An_Fe_req", 0),
            animal_requirements.get("An_Mn_req", 0),
            animal_requirements.get("An_Se_req", 0),
            animal_requirements.get("An_Zn_req", 0),
            animal_requirements.get("An_VitA_req", 0),
            animal_requirements.get("An_VitD_req", 0),
            animal_requirements.get("An_VitE_req", 0)
        ],
        
        "Unit": [
            "kg/d", 
            "%BW", 
            "Mcal/d", 
            "kg/d", 
            "L/d", 
            "g/d", 
            "g/d", 
            "g/d", 
            "g/d", 
            "g/d", 
            "g/d", 
            "g/d", 
            "mg/d", 
            "mg/d", 
            "mg/d", 
            "mg/d", 
            "mg/d", 
            "mg/d", 
            "mg/d", 
            "IU/d", 
            "IU/d", 
            "IU/d"
        ]
    }
    
    return pd.DataFrame(requirements_data)

# Run 

#if __name__ == "__main__":