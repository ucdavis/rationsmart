"""
Report generation module.

This module contains all HTML report generation functionality:
- HTML report generation with modern styling
- Solution summary creation
- Weighted absorption calculations for minerals
- Table formatting for animal info, requirements, diet composition
- Feed selection display utilities
"""

import numpy as np
import pandas as pd
import os
from pathlib import Path

# Import from animal_requirements for table creation
from animal_requirements import rsm_create_animal_requirements_dataframe

# Import from utilities
from utilities import rename_variable, replace_na_and_negatives

# Purpose: Compute weighted mineral absorption coefficients from forage/concentrate totals.
# Notes: Uses total rows to derive proportional absorption for Ca and P; falls back to defaults.
def calculate_weighted_absorption(dt_forages, dt_concentrates):
    # Get proportions from the Total rows in forage and concentrate tables
    # Safety check: if dataframes are empty, return defaults
    if dt_forages.empty or dt_concentrates.empty:
        return 0.50, 0.67

    # Extract from the "Total" rows in each dataframe
    forage_total_row = dt_forages[dt_forages['Name'] == 'Total'] if 'Name' in dt_forages.columns else pd.DataFrame()
    concentrate_total_row = dt_concentrates[dt_concentrates['Name'] == 'Total'] if 'Name' in dt_concentrates.columns else pd.DataFrame()
    
    if not forage_total_row.empty and not concentrate_total_row.empty:
        # Get the DMI percentages from the Total rows
        forage_prop = forage_total_row.iloc[0]['DM_prop'] / 100.0      # 45.12% → 0.4512
        concentrate_prop = concentrate_total_row.iloc[0]['DM_prop'] / 100.0  # 54.87% → 0.5487
        mineral_prop = 1.0 - forage_prop - concentrate_prop        # 0.25% → 0.0025
        
        # Calculate weighted absorption coefficients
        weighted_ca = (forage_prop * 0.40 + concentrate_prop * 0.60 + mineral_prop * 0.60)
        weighted_p = (forage_prop * 0.64 + concentrate_prop * 0.70 + mineral_prop * 0.70)
        
        return weighted_ca, weighted_p
    
    return 0.50, 0.67  # Fallback defaults

# Purpose: Prepare feed dataframe with user-friendly columns and ordering.
# Notes: Drops price columns for display tables and preserves totals formatting.
def format_feed_df(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    rename_map = {
        "Ingr_Type": "Ingredient Type",
        "Name": "Ingredient Name",
        "DM_prop": "Inclusion (% DM)",
        "AF_prop": "Inclusion (% Fresh)",
        "CP": "Protein",
        "EE": "Fat",
        "NDF": "NDF",
        "ADF": "ADF",
        "LG": "Lignin",
        "Lig": "Lignin",
        "ST": "Starch",
        "St": "Starch",
        "ASH": "Ash",
        "NFC": "NFC",
        "TDN": "TDN",
        "CA": "Ca",
        "P": "P",
    }
    base_order = [
        "Ingredient Type",
        "Ingredient Name",
        "Inclusion (% DM)",
        "Inclusion (% Fresh)",
    ]
    nutrient_order = [
        "Protein",
        "Fat",
        "NDF",
        "ADF",
        "Lignin",
        "Starch",
        "Ash",
        "NFC",
        "TDN",
        "Ca",
        "P",
    ]

    formatted = (
        df.drop(columns=[c for c in ("DM_kg", "AF_kg", "FA", "PRICE/KG", "Cost", "Price/kg", "Price/d") if c in df.columns])
        .rename(columns=rename_map)
        .copy()
    )
    ordered_cols = [col for col in base_order if col in formatted.columns]
    ordered_cols += [col for col in nutrient_order if col in formatted.columns]
    ordered_cols += [col for col in formatted.columns if col not in ordered_cols]
    if "Ingredient Name" in formatted.columns and "Price/kg" in formatted.columns:
        total_mask = formatted["Ingredient Name"].astype(str).str.upper().str.contains("TOTAL")
        formatted.loc[total_mask, "Price/kg"] = ""
    
    # Ensure we don't try to index with empty ordered_cols
    if not ordered_cols:
        return formatted
        
    return formatted[ordered_cols]


# Purpose: Ensure data is a Pandas DataFrame with safety defaults.
# Notes: Handles dictionaries, lists, and empty cases.
def ensure_df(data):
    if isinstance(data, pd.DataFrame):
        return data
    if isinstance(data, dict):
        # Check if it's an empty dict
        if not data:
            return pd.DataFrame()
        try:
            return pd.DataFrame.from_dict(data)
        except:
            return pd.DataFrame()
    if isinstance(data, list):
        return pd.DataFrame(data)
    return pd.DataFrame()


# Purpose: Render a full HTML diet/evaluation report from post-analysis results.
# Notes: Formats tables, cost metrics, optional evaluation sections, and writes file.
def rsm_generate_report(
    post_results,
    animal_requirements,
    output_file="final_report.html",
    user_name="User",
    simulation_id="N/A",
    report_id="N/A",
    evaluation_mode=False,
    country_name="Vietnam",
    currency="$",
    recommendations=None,
):
    """
    Generate HTML report from post-optimization analysis results.
    
    Parameters:
    -----------
    post_results : dict
        Dictionary returned from run_post_optimization_analysis()
    animal_requirements : dict
        Animal requirements dictionary from calculate_an_requirements()
    output_file : str
        Output HTML file path
    user_name : str
        User name for the report header
    simulation_id : str
        Simulation ID for the report header
    report_id : str
        Report ID for the report header
    evaluation_mode : bool
        If True, use evaluation title and show additional metrics
    country_name : str
        Country name for the report header
    recommendations : list, optional
        List of human-readable advice strings
    """
    
    animal_inputs = ensure_df(post_results.get('animal_inputs'))
    dt_proportions = ensure_df(post_results.get('dt_proportions'))
    dt_forages = ensure_df(post_results.get('dt_forages'))
    methane_report = ensure_df(post_results.get('methane_report'))
    ration_evaluation = ensure_df(post_results.get('ration_evaluation'))
    constraint_messages = post_results.get("constraint_messages", {})
    post_messages = post_results.get("messages") or constraint_messages.get("messages") or []
    
    if not isinstance(post_messages, list):
        post_messages = []
    # Evaluation reports should always render and should not be blocked or polluted by feasibility/constraint messages.
    if evaluation_mode:
        post_messages = []
        recommendations = []
    
    # Common metrics for display blocks
    daily_cost = post_results.get('total_cost', 0.0)
    milk_target = float(animal_requirements.get('Trg_MilkProd_L', 0) or 0)
    milk_support = post_results.get("milk_support", {}) if evaluation_mode else {}
    milk_supported = milk_support.get("Milk_Supported")
    try:
        milk_supported_val = float(milk_supported)
    except (TypeError, ValueError):
        milk_supported_val = 0.0
    milk_den = milk_supported_val if (evaluation_mode and milk_supported_val > 0) else milk_target
    cost_per_liter = (daily_cost / milk_den) if milk_den else None

    # Optional messages card (rendered below the Diet/Least Cost Diet header).
    # The runner can pass post_results["messages"] (list[str]) and we display them here.
    messages_html = ""
    
    notes_html = ""
    if post_messages:
        note_items = "\n".join([f"<li>{msg}</li>" for msg in post_messages if isinstance(msg, str) and msg.strip()])
        if note_items:
            notes_html = "\n".join(
                [
                    "<div class='message-card'>",
                    "<div class='message-title'>Notes</div>",
                    "<ul class='message-list'>",
                    note_items,
                    "</ul>",
                    "</div>",
                ]
            )
            
    recs_html = ""
    if recommendations and isinstance(recommendations, list):
        rec_items = "\n".join([f"<li>{msg}</li>" for msg in recommendations if isinstance(msg, str) and msg.strip()])
        if rec_items:
            recs_html = "\n".join(
                [
                    "<div class='message-card' style='margin-top: 20px; border-left: 4px solid #28a745;'>",
                    "<div class='message-title' style='color: #28a745;'>Recommendations</div>",
                    "<ul class='message-list'>",
                    rec_items,
                    "</ul>",
                    "</div>",
                ]
            )
            
    messages_html = notes_html + recs_html
    
    # Create Dt_results from dt_proportions with user-friendly column names
    dt_results = pd.DataFrame(columns=['Ingredient Name', 'Amount Fresh (Kg/d)', 'Amount DM (Kg/d DM)', 'Price/kg', 'Price/d'])
    if not dt_proportions.empty:
        dt_results = dt_proportions[['Name', 'AF_kg', 'DM_kg', 'PRICE/KG', 'Cost']].copy()
        dt_results.rename(
            columns={
                "Name": "Ingredient Name",
                "AF_kg": "Amount Fresh (Kg/d)",
                "DM_kg": "Amount DM (Kg/d DM)",
                "PRICE/KG": "Price/kg",
                "Cost": "Price/d",
            },
            inplace=True,
        )
        if "Ingredient Name" in dt_results.columns and "Price/kg" in dt_results.columns:
            dt_results["Price/kg"] = dt_results["Price/kg"].astype("string")
            total_mask = dt_results["Ingredient Name"].astype(str).str.upper().str.contains("TOTAL")
            dt_results.loc[total_mask, "Price/kg"] = ""
    
    # Create An_Requirements DataFrame from animal_requirements dictionary
    # On failure, diet_supply_results might be missing
    diet_supply_results = post_results.get('diet_supply_results', {})
    An_Requirements = rsm_create_animal_requirements_dataframe(animal_requirements, diet_supply_results)

    # Update water intake with calculated value (safety check for water_intake key)
    water_intake = post_results.get('water_intake', 0.0)
    An_Requirements.loc[An_Requirements['Parameter'] == 'Water Intake', 'Value'] = water_intake

    # Optional evaluation tables (present only for evaluation mode)
    milk_table = post_results.get("milk_table")
    intake_table = post_results.get("intake_table")
    cost_table = post_results.get("cost_table")

    # Get concentrates from dt_proportions
    dt_concentrates = pd.DataFrame()
    if not dt_proportions.empty:
        dt_concentrates = dt_proportions[
            (dt_proportions['Ingr_Type'] == 'Concentrate') | 
            (dt_proportions['Ingr_Type'] == 'Minerals') |
            (dt_proportions['Ingr_Type'] == 'By-Product/Other') |
            (dt_proportions['Ingr_Type'] == 'Plant Protein') |
            (dt_proportions['Ingr_Type'] == 'Additive')
        ].copy()
        
        # Add concentrate totals if not empty
        if not dt_concentrates.empty:
            concentrate_total = dt_concentrates.select_dtypes(include=[np.number]).sum()
            concentrate_total['Ingr_Type'] = 'Concentrate'
            concentrate_total['Name'] = 'Total'
            dt_concentrates = pd.concat([dt_concentrates, concentrate_total.to_frame().T], ignore_index=True)
    
    # Calculate weighted absorption coefficients for Ca and P display conversion
    weighted_ca, weighted_p = calculate_weighted_absorption(dt_forages, dt_concentrates)

    # Get current absorbed values
    ca_absorbed = animal_requirements.get("An_Ca_req", 0)
    p_absorbed = animal_requirements.get("An_P_req", 0)

    # Convert to crude using weighted coefficients for display
    ca_crude = (ca_absorbed / weighted_ca)*1000
    p_crude = (p_absorbed / weighted_p)*1000 

    # Update display values in requirements table
    An_Requirements.loc[An_Requirements['Parameter'] == 'Calcium', 'Value'] = ca_crude
    An_Requirements.loc[An_Requirements['Parameter'] == 'Phosphorus', 'Value'] = p_crude

    # Update water intake with calculated value (water fix)
    An_Requirements.loc[An_Requirements['Parameter'] == 'Water Intake', 'Value'] = water_intake

    # Forage footnote: NDF intake metrics (% of BW)
    ndf_bw = None
    forage_ndf_bw = None
    try:
        # diet_supply_results is expected to be a numpy array of length 19
        if isinstance(diet_supply_results, (np.ndarray, list)) and len(diet_supply_results) > 18:
            ndf_bw = float(diet_supply_results[17])
            forage_ndf_bw = float(diet_supply_results[18])
            if not np.isfinite(ndf_bw):
                ndf_bw = None
            if not np.isfinite(forage_ndf_bw):
                forage_ndf_bw = None
    except Exception:
        ndf_bw = None
        forage_ndf_bw = None

    forage_footnote_html = ""
    if ndf_bw is not None or forage_ndf_bw is not None:
        parts = []
        if ndf_bw is not None:
            parts.append(f"<strong>NDF %BW</strong> = {ndf_bw:.2f}% (target &lt; 1.2%)")
        if forage_ndf_bw is not None:
            parts.append(f"<strong>Forage NDF %BW</strong> = {forage_ndf_bw:.2f}% (target &lt; 1.0%)")
        if parts:
            forage_footnote_html = (
                "<p style='font-size: 0.9em; color: #555; margin-top: 8px;'>"
                + " | ".join(parts)
                + "</p>"
            )

    # Round all numeric columns
    dfs = [animal_inputs, An_Requirements, dt_results, dt_proportions, dt_forages, dt_concentrates, methane_report, ration_evaluation]
    for df in dfs:
        if not df.empty:
            num_cols = df.select_dtypes(include=[np.number]).columns
            df[num_cols] = df[num_cols].round(2)

    dt_proportions_display = format_feed_df(dt_proportions)
    dt_forages_display = format_feed_df(dt_forages)
    dt_concentrates_display = format_feed_df(dt_concentrates)

    # Add solution summary information
    # Ensure currency has a space if it's not a symbol like $
    currency_display = currency + " " if len(currency) > 1 else currency
    solution_summary = rsm_create_solution_summary(post_results, animal_requirements, evaluation_mode=evaluation_mode, currency=currency)

    # Custom CSS for modern, beautiful design
    style = """
    <style>
      * { box-sizing: border-box; }
      
      body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        margin: 0; 
        padding: 20px; 
        line-height: 1.6; 
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        min-height: 100vh;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      
      .header {
        background: linear-gradient(135deg, #2e7d32 0%, #388e3c 100%);
        color: white;
        padding: 30px;
        text-align: center;
      }
      
      .header h1 {
        margin: 0;
        font-size: 2.5em;
        font-weight: 300;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      }
      
      .report-meta {
        display: flex;
        justify-content: space-between;
        gap: 5px;
        margin-top: 11.25px;
        padding: 7.5px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        flex-wrap: wrap;
      }
      
      .meta-item {
        color: white;
        font-size: 0.8em;
        padding: 2px 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        flex: 1 1 auto;
        min-width: 100px;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      
      .meta-item strong {
        color: #e8f5e8;
        margin-bottom: 1px;
        font-size: 0.9em;
      }
      
      .meta-item .meta-value {
        color: white;
        font-weight: 500;
        font-size: 0.85em;
      }
      
      .content {
        padding: 30px;
      }
      
      h2 { 
        color: #2e7d32; 
        margin-top: 40px; 
        margin-bottom: 20px; 
        font-size: 1.8em; 
        font-weight: 500;
        border-bottom: 3px solid #4caf50;
        padding-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      h3 { 
        color: #388e3c; 
        margin-top: 25px; 
        margin-bottom: 15px; 
        font-size: 1.3em; 
        font-weight: 500;
      }
      
      .table-container {
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        margin: 20px 0;
        overflow: hidden;
        max-width: 100%;
        overflow-x: auto;
      }
      
      table { 
        border-collapse: collapse; 
        width: auto;
        min-width: 100%;
        margin: 0;
        font-size: 14px;
        background: white;
        table-layout: auto;
      }
      
      th, td { 
        padding: 10px 12px; 
        text-align: left; 
        border-bottom: 1px solid #e0e0e0;
        white-space: nowrap;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      /* Specific column width adjustments for different table types (reduced by another 30%) */
      .animal-info-table th:nth-child(1),
      .animal-info-table td:nth-child(1) { width: 81px; }
      .animal-info-table th:nth-child(2),
      .animal-info-table td:nth-child(2) { width: 54px; }
      .animal-info-table th:nth-child(3),
      .animal-info-table td:nth-child(3) { width: 36px; }
      
      .requirements-table th:nth-child(1),
      .requirements-table td:nth-child(1) { width: 90px; }
      .requirements-table th:nth-child(2),
      .requirements-table td:nth-child(2) { width: 45px; }
      .requirements-table th:nth-child(3),
      .requirements-table td:nth-child(3) { width: 36px; }
      
      .diet-table th:nth-child(1),
      .diet-table td:nth-child(1) { width: 35%; }
      .diet-table th:nth-child(2),
      .diet-table td:nth-child(2) { width: 20%; }
      .diet-table th:nth-child(3),
      .diet-table td:nth-child(3) { width: 20%; }
      .diet-table th:nth-child(4),
      .diet-table td:nth-child(4) { width: 25%; }
      
      .proportions-table th:nth-child(1),
      .proportions-table td:nth-child(1) { width: 81px; }
      .proportions-table th:nth-child(2),
      .proportions-table td:nth-child(2) { width: 54px; }
      .proportions-table th:nth-child(3),
      .proportions-table td:nth-child(3) { width: 36px; }
      .proportions-table th:nth-child(4),
      .proportions-table td:nth-child(4) { width: 36px; }
      .proportions-table th:nth-child(5),
      .proportions-table td:nth-child(5) { width: 36px; }
      
      .forage-table th:nth-child(1),
      .forage-table td:nth-child(1) { width: 67px; }
      .forage-table th:nth-child(2),
      .forage-table td:nth-child(2) { width: 45px; }
      .forage-table th:nth-child(3),
      .forage-table td:nth-child(3) { width: 36px; }
      
      .concentrate-table th:nth-child(1),
      .concentrate-table td:nth-child(1) { width: 67px; }
      .concentrate-table th:nth-child(2),
      .concentrate-table td:nth-child(2) { width: 45px; }
      .concentrate-table th:nth-child(3),
      .concentrate-table td:nth-child(3) { width: 36px; }
      
      .environmental-table th:nth-child(1),
      .environmental-table td:nth-child(1) { width: 81px; }
      .environmental-table th:nth-child(2),
      .environmental-table td:nth-child(2) { width: 54px; }
      .environmental-table th:nth-child(3),
      .environmental-table td:nth-child(3) { width: 45px; }
      
      th { 
        background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
        color: white;
        font-weight: 600;
        font-size: 14px;
        letter-spacing: 0.5px;
      }
      
      tr:hover { 
        background-color: #f8f9fa; 
        transition: background-color 0.3s ease;
      }
      
      tr:nth-child(even) { 
        background-color: #fafafa; 
      }
      
      .summary-box { 
        background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%);
        border: none;
        border-radius: 15px; 
        padding: 25px; 
        margin: 25px 0; 
        box-shadow: 0 4px 15px rgba(76, 175, 80, 0.2);
      }
      
      .status-optimal { 
        color: #2e7d32; 
        font-weight: 600;
        background: #e8f5e8;
        padding: 5px 12px;
        border-radius: 20px;
        display: inline-block;
      }
      
      .status-marginal { 
        color: #f57c00; 
        font-weight: 600;
        background: #fff3e0;
        padding: 5px 12px;
        border-radius: 20px;
        display: inline-block;
      }
      
      .status-infeasible { 
        color: #d32f2f; 
        font-weight: 600;
        background: #ffebee;
        padding: 5px 12px;
        border-radius: 20px;
        display: inline-block;
      }
      
      .cost-highlight { 
        background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
        font-weight: 600;
        padding: 8px 15px;
        border-radius: 8px;
        border-left: 4px solid #ff9800;
      }
      
      .metric-card {
        background: white;
        border-radius: 10px;
        padding: 20px;
        margin: 15px 0;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        border-left: 4px solid #4caf50;
      }

      .message-card {
        background: #f3f7ff;
        border-radius: 10px;
        padding: 16px 18px;
        margin: 12px 0 18px 0;
        box-shadow: 0 4px 15px rgba(0,0,0,0.06);
        border-left: 4px solid #1e88e5;
      }
      .message-title {
        font-weight: 600;
        color: #0d47a1;
        margin-bottom: 8px;
      }
      .message-list {
        margin: 0;
        padding-left: 18px;
        color: #1f2937;
      }
      .message-list li {
        margin: 6px 0;
      }
      
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin: 20px 0;
      }
      
      .metric-item {
        background: white;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        text-align: center;
        border-top: 4px solid #4caf50;
      }
      
      .metric-value {
        font-size: 2em;
        font-weight: 600;
        color: #2e7d32;
        margin: 10px 0;
      }
      
      .metric-label {
        color: #666;
        font-size: 0.9em;
        letter-spacing: 0.5px;
      }
      
      .section {
        margin: 30px 0 50px 0;
        padding: 25px;
        background: white;
        border-radius: 15px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      }
      
      .emoji {
        font-size: 1.2em;
      }
      
      @media (max-width: 768px) {
        .container {
          margin: 10px;
          border-radius: 10px;
        }
        
        .content {
          padding: 20px;
        }
        
        .header h1 {
          font-size: 2em;
        }
        
        .metric-grid {
          grid-template-columns: 1fr;
        }
        
        table {
          font-size: 12px;
        }
        
        th, td {
          padding: 8px 10px;
        }
      }
    </style>
    """

    # Get current date and time for report generation
    from datetime import datetime
    report_date = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    # Assemble HTML with modern structure
    html_parts = [
        "<!DOCTYPE html>",
        "<html><head>",
        "<meta charset='utf-8'/>",
        "<meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        f"<title>{'Diet Evaluation Report' if evaluation_mode else 'Ration Formulation Report'}</title>",
        style,
        "</head><body>",
        
        "<div class='container'>",
        "<div class='header'>",
        f"<h1>🐄 {'Diet Evaluation Report' if evaluation_mode else 'Ration Formulation Report'}</h1>",
        "<div class='report-meta'>",
        f"<div class='meta-item'><strong>User</strong><span class='meta-value'>{user_name}</span></div>",
        f"<div class='meta-item'><strong>Simulation ID</strong><span class='meta-value'>{simulation_id}</span></div>",
        f"<div class='meta-item'><strong>Report ID</strong><span class='meta-value'>{report_id}</span></div>",
        f"<div class='meta-item'><strong>Country</strong><span class='meta-value'>{country_name}</span></div>",
        f"<div class='meta-item'><strong>Generated</strong><span class='meta-value'>{report_date}</span></div>",
        "</div>",
        "</div>",
        
        "<div class='content'>",
        
        # Solution Summary Section
        "<div class='section'>",
        "<h2><span class='emoji'>📊</span>Solution Summary</h2>",
        "<div class='metric-grid'>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{milk_target:.1f}L</div>",
        f"<div class='metric-label'>Target milk production</div>",
        f"</div>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{currency_display}{daily_cost:.2f}</div>",
        f"<div class='metric-label'>Daily cost</div>",
        f"</div>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{f'{currency_display}{cost_per_liter:.2f}' if cost_per_liter is not None else '—'}</div>",
        f"<div class='metric-label'>Cost per liter of milk</div>",
        f"</div>",
        "</div>",
        "</div>",
        "<br><br>",
        
        # Animal Information
        "<div class='section'>",
        "<h2><span class='emoji'>🐄</span>Animal Information</h2>",
        "<div class='table-container'>",
        animal_inputs.to_html(index=False, escape=False, classes='animal-info-table'),
        "</div>",
        "</div>",
        
        # Animal Requirements
        "<div class='section'>",
        "<h2><span class='emoji'>📋</span>Nutritional Requirements</h2>",
        "<div class='table-container'>",
        An_Requirements.to_html(index=False, escape=False, classes='requirements-table'),
        "</div>",
        "</div>",
        
        # Diet Results
        "<div class='section'>",
        f"<h2><span class='emoji'>🍽️</span>{'Diet' if evaluation_mode else 'Least Cost Diet'}</h2>",
        "<div class='table-container'>",
        dt_results.to_html(index=False, escape=False, classes='diet-table'),
        "</div>",
        "<p style='font-size: 0.9em; color: #555; margin-top: 8px;'>",
        "<strong>DM</strong> = Dry matter.",
        "</p>",
        messages_html,
        "</div>",

        # Evaluation-specific tables (only when provided)
        (
            ""
            if not evaluation_mode or milk_table is None
            else "".join(
                [
                    "<div class='section'>",
                    "<h2><span class='emoji'>🥛</span>Milk Production</h2>",
                    "<div class='table-container'>",
                    milk_table.to_html(index=False, escape=False, classes='diet-table'),
                    "</div>",
                    "</div>",
                ]
            )
        ),
        (
            ""
            if not evaluation_mode or intake_table is None
            else "".join(
                [
                    "<div class='section'>",
                    "<h2><span class='emoji'>🍽️</span>Intake</h2>",
                    "<div class='table-container'>",
                    intake_table.to_html(index=False, escape=False, classes='diet-table'),
                    "</div>",
                    "</div>",
                ]
            )
        ),
        (
            ""
            if not evaluation_mode or cost_table is None
            else "".join(
                [
                    "<div class='section'>",
                    "<h2><span class='emoji'>💰</span>Diet Cost</h2>",
                    "<div class='table-container'>",
                    cost_table.to_html(index=False, escape=False, classes='diet-table'),
                    "</div>",
                    "</div>",
                ]
            )
        ),
        
        # Ration Evaluation
        "<div class='section'>",
        "<h2><span class='emoji'>📋</span>Nutrient Balance</h2>",
        "<div class='table-container'>",
        ration_evaluation.to_html(index=False, escape=False, classes='proportions-table') if not ration_evaluation.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No ration evaluation data available.</p>",
        "</div>",
        "</div>",
        
        # Detailed Proportions
        "<div class='section'>",
        "<h2><span class='emoji'>📊</span>Nutrient Proportions (%)</h2>",
        "<div class='table-container'>",
        dt_proportions_display.to_html(index=False, escape=False, classes='proportions-table'),
        "</div>",
        "</div>",
        
        # Forages
        "<div class='section'>",
        "<h2><span class='emoji'>🌾</span>Forage</h2>",
        "<div class='table-container'>",
        dt_forages_display.to_html(index=False, escape=False, classes='forage-table') if not dt_forages_display.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No forages in this diet.</p>",
        "</div>",
        forage_footnote_html,
        "</div>",
        
        # Concentrates
        "<div class='section'>",
        "<h2><span class='emoji'>🌽</span>Concentrate</h2>",
        "<div class='table-container'>",
        dt_concentrates_display.to_html(index=False, escape=False, classes='concentrate-table') if not dt_concentrates_display.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No concentrates in this diet.</p>",
        "</div>",
        "</div>",
        
        # Methane Report
        "<div class='section'>",
        "<h2><span class='emoji'>🌍</span>Environmental Impact</h2>",
        "<div class='table-container'>",
        methane_report.to_html(index=False, escape=False, classes='environmental-table'),
        "</div>",
        "<p style='font-size: 0.9em; color: #555; margin-top: 8px;'>",
        "<strong>Ym (%)</strong> = percentage of gross energy intake lost as methane.",
        "</p>",
        "</div>",
        
        "</div>",  # Close content
        "</div>",  # Close container
        
        "</body></html>"
    ]

    html_content = "\n".join(html_parts)
    # Ensure file gets overwritten
    try:
        # Remove existing file if it exists
        if os.path.exists(output_file):
            os.remove(output_file)
            #print(f"🗑️ Removed existing file: {output_file}")
    
        # Write new file
        Path(output_file).write_text(html_content, encoding="utf-8")
        # print(f"✅ Report generated: {output_file}")
        
        # Add logging if possible
        try:
            from middleware.logging_config import get_logger
            logger = get_logger("report_generation")
            logger.info(f"HTML report successfully written to: {output_file}")
        except:
            pass
    
    except Exception as e:
        print(f"Error writing report: {e}")
        print(f"   Attempted to write to: {os.path.abspath(output_file)}")


# Purpose: Build an HTML snippet summarizing cost and milk production targets.
# Notes: Used in reports to highlight cost and cost per liter; handles evaluation mode.
def rsm_create_solution_summary(post_results, animal_requirements, *, evaluation_mode: bool = False, currency: str = "$"):
    cost = float(post_results.get('total_cost', 0.0))
    milk_support = post_results.get("milk_support", {}) if evaluation_mode and isinstance(post_results, dict) else {}
    milk_production_target = float(animal_requirements.get('Trg_MilkProd_L', 0.0) or 0.0)
    try:
        milk_production_supported = float(milk_support.get("Milk_Supported")) if milk_support else 0.0
    except (TypeError, ValueError):
        milk_production_supported = 0.0
    milk_production_for_cost = milk_production_supported if (evaluation_mode and milk_production_supported > 0) else milk_production_target
    cost_per_liter = (cost / milk_production_for_cost) if milk_production_for_cost else None
    
    # Ensure currency has a space if it's not a symbol like $
    currency_display = currency + " " if len(currency) > 1 else currency
    
    summary_html = f"""
    <table style="width: 100%;">
        <tr class="cost-highlight">
            <td><strong>Daily Cost:</strong></td>
            <td>{currency_display}{cost:.2f}</td>
        </tr>
        <tr>
            <td><strong>Target Milk Production:</strong></td>
            <td>{milk_production_target:.1f} L/day</td>
        </tr>
        <tr>
            <td><strong>Cost per L of Milk:</strong></td>
            <td>{f"{currency_display}{cost_per_liter:.2f}" if cost_per_liter is not None else '—'}</td>
        </tr>
    </table>
    """
    
    return summary_html

# Purpose: Generate a report file from runner results dict, validating success flags.
# Notes: Skips writing when runs failed; delegates to rsm_generate_report.
def generate_report_from_runner_results(results, output_file="final_report.html"):
    """
    Generate report directly from RFT_run.py results
    
    Parameters:
    -----------
    results : dict
        Results dictionary from run_complete_test()
    output_file : str
        Output HTML file path
    """
    
    post_results = results["post_optimization"]
    animal_requirements = results["animal_requirements"]
    evaluation_mode = results.get("report_mode") == "evaluation" or post_results.get("report_mode") == "evaluation"

    # Recommendation (NSGA3) reports are gated by a single authoritative allow_report signal.
    # Evaluation reports should always render (the user asked to evaluate their diet).
    if not evaluation_mode and not results.get("allow_report", False):
        print("❌ Cannot generate report: allow_report is False")
        return
    
    rsm_generate_report(post_results, animal_requirements, output_file, evaluation_mode=evaluation_mode)

# Purpose: Print selected feeds and cost breakdown to stdout for quick inspection.
# Notes: Lists DM/AF amounts, per-category totals, and summary composition.
def print_selected_feeds(best_solution_vector, f_nd, total_cost):
    """
    Print the selected feeds for the diet recommendation
    """
    print("\n" + "="*60)
    print("🍽️  DIET RECOMMENDATION - SELECTED FEEDS")
    print("="*60)
    
    # Convert f_nd to DataFrame for easy access
    f_nd_df = pd.DataFrame(f_nd)
    
    # Get selected feeds (non-zero amounts)
    selected_feeds = []
    total_dm = 0
    
    for i, amount in enumerate(best_solution_vector):
        if amount > 0:
            feed_name = f_nd_df.iloc[i]['Fd_Name']
            feed_category = f_nd_df.iloc[i]['Fd_Category']
            feed_type = f_nd_df.iloc[i]['Fd_Type']
            feed_cost = f_nd_df.iloc[i]['Fd_Cost']
            feed_dm = f_nd_df.iloc[i]['Fd_DM']
            
            # Calculate as-fed amount
            af_amount = amount / (feed_dm / 100) if feed_dm > 0 else amount
            feed_cost_total = af_amount * feed_cost
            
            selected_feeds.append({
                'name': feed_name,
                'category': feed_category,
                'type': feed_type,
                'dm_kg': amount,
                'af_kg': af_amount,
                'dm_pct': feed_dm,
                'cost_per_kg': feed_cost,
                'total_cost': feed_cost_total
            })
            total_dm += amount
    
    # Sort by amount (highest first)
    selected_feeds.sort(key=lambda x: x['dm_kg'], reverse=True)
    
    # Print header
    print(f"{'Feed Name':<25} {'Category':<15} {'DM (kg)':<10} {'AF (kg)':<10} {'Cost ($)':<10}")
    print("-" * 70)
    
    # Print each selected feed
    for feed in selected_feeds:
        print(f"{feed['name']:<25} {feed['category']:<15} {feed['dm_kg']:<10.3f} {feed['af_kg']:<10.3f} {feed['total_cost']:<10.2f}")
    
    print("-" * 70)
    print(f"{'TOTAL':<25} {'':<15} {total_dm:<10.3f} {'':<10} {total_cost:<10.2f}")
    
    # Calculate percentages
    print(f"\n📊 DIET COMPOSITION:")
    print(f"Total DM: {total_dm:.3f} kg/day")
    print(f"Total Cost: ${total_cost:.2f}/day")
    
    # Group by category
    category_totals = {}
    for feed in selected_feeds:
        cat = feed['category']
        if cat not in category_totals:
            category_totals[cat] = {'dm': 0, 'cost': 0}
        category_totals[cat]['dm'] += feed['dm_kg']
        category_totals[cat]['cost'] += feed['total_cost']
    
    print(f"\n📈 BY CATEGORY:")
    for cat, totals in category_totals.items():
        pct = (totals['dm'] / total_dm) * 100 if total_dm > 0 else 0
        print(f"  {cat}: {totals['dm']:.3f} kg ({pct:.1f}%) - ${totals['cost']:.2f}")
    
    print("="*60)

# Run 

#if __name__ == "__main__":
