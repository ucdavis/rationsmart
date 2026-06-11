"""
Report generation module V2.
Enhanced for better PDF parity and print-friendly layout.
"""

import numpy as np
import pandas as pd
import os
import base64
from pathlib import Path
from datetime import datetime

# Import from animal_requirements for table creation
try:
    from .animal_requirements import rsm_create_animal_requirements_dataframe
except ImportError:
    from animal_requirements import rsm_create_animal_requirements_dataframe

# Import from utilities
try:
    from .utilities import rename_variable, replace_na_and_negatives
except ImportError:
    from utilities import rename_variable, replace_na_and_negatives

def get_image_base64(image_path):
    """Encodes an image to a base64 string for embedding in HTML."""
    try:
        if not os.path.exists(image_path):
            return ""
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return f"data:image/png;base64,{encoded_string}"
    except Exception:
        return ""

def calculate_weighted_absorption(dt_forages, dt_concentrates):
    if dt_forages.empty or dt_concentrates.empty:
        return 0.50, 0.67
    
    forage_total_row = dt_forages[dt_forages['Name'] == 'Total'] if 'Name' in dt_forages.columns else pd.DataFrame()
    concentrate_total_row = dt_concentrates[dt_concentrates['Name'] == 'Total'] if 'Name' in dt_concentrates.columns else pd.DataFrame()
    
    if not forage_total_row.empty and not concentrate_total_row.empty:
        forage_prop = forage_total_row.iloc[0]['DM_prop'] / 100.0
        concentrate_prop = concentrate_total_row.iloc[0]['DM_prop'] / 100.0
        mineral_prop = 1.0 - forage_prop - concentrate_prop
        
        weighted_ca = (forage_prop * 0.40 + concentrate_prop * 0.60 + mineral_prop * 0.60)
        weighted_p = (forage_prop * 0.64 + concentrate_prop * 0.70 + mineral_prop * 0.70)
        
        return weighted_ca, weighted_p
    
    return 0.50, 0.67

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
    base_order = ["Ingredient Type", "Ingredient Name", "Inclusion (% DM)", "Inclusion (% Fresh)"]
    nutrient_order = ["Protein", "Fat", "NDF", "ADF", "Lignin", "Starch", "Ash", "NFC", "TDN", "Ca", "P"]

    formatted = (
        df.drop(columns=[c for c in ("DM_kg", "AF_kg", "FA", "PRICE/KG", "Cost", "Price/kg", "Price/d") if c in df.columns])
        .rename(columns=rename_map)
        .copy()
    )
    ordered_cols = [col for col in base_order if col in formatted.columns]
    ordered_cols += [col for col in nutrient_order if col in formatted.columns]
    ordered_cols += [col for col in formatted.columns if col not in ordered_cols]
    
    if not ordered_cols:
        return formatted
        
    return formatted[ordered_cols]

def ensure_df(data):
    if isinstance(data, pd.DataFrame):
        return data
    if isinstance(data, dict):
        if not data: return pd.DataFrame()
        try: return pd.DataFrame.from_dict(data)
        except: return pd.DataFrame()
    if isinstance(data, list):
        return pd.DataFrame(data)
    return pd.DataFrame()

def rsm_generate_report_v2(
    post_results,
    animal_requirements,
    output_file="final_report_v2.html",
    user_name="User",
    simulation_id="N/A",
    report_id="N/A",
    evaluation_mode=False,
    country_name="Unknown",
    currency="$",
    recommendations=None,
    is_pdf_mode=False # New flag to optimize for PDF generation
):
    """
    Enhanced HTML report generation with PDF parity features.
    """
    # 1. Define paths for custom icons within the project structure
    current_dir = os.path.dirname(os.path.abspath(__file__))
    icon_header_path = os.path.join(current_dir, "assets", "report_header.png")
    icon_summary_path = os.path.join(current_dir, "assets", "summary_icon.png")
    icon_animal_path = os.path.join(current_dir, "assets", "animal_icon.png")
    icon_diet_path = os.path.join(current_dir, "assets", "reduction.png")
    icon_env_path = os.path.join(current_dir, "assets", "Environmental_Impact.png")
    icon_req_path = os.path.join(current_dir, "assets", "cattle_nutrition.png")
    icon_prop_path = os.path.join(current_dir, "assets", "Nutrient_Information.png")
    icon_forage_path = os.path.join(current_dir, "assets", "icons8-forage-48.png")
    icon_concentrate_path = os.path.join(current_dir, "assets", "icons8-chemical-65.png")
    
    # New Solution Summary Icons
    icon_prod_path = os.path.join(current_dir, "assets", "target_1790044.png")
    icon_daily_cost_path = os.path.join(current_dir, "assets", "daily_cost.png")
    icon_cost_liter_path = os.path.join(current_dir, "assets", "cost_per_liter.png")
    icon_water_path = os.path.join(current_dir, "assets", "bucket_6265910.png")

    # 2. Get Base64 encoded versions for embedding
    icon_header = get_image_base64(icon_header_path)
    icon_summary = get_image_base64(icon_summary_path)
    icon_animal = get_image_base64(icon_animal_path)
    icon_diet = get_image_base64(icon_diet_path)
    icon_env = get_image_base64(icon_env_path)
    icon_req = get_image_base64(icon_req_path)
    icon_prop = get_image_base64(icon_prop_path)
    icon_forage = get_image_base64(icon_forage_path)
    icon_concentrate = get_image_base64(icon_concentrate_path)
    
    # Encoded summary icons
    icon_prod = get_image_base64(icon_prod_path)
    icon_daily_cost = get_image_base64(icon_daily_cost_path)
    icon_cost_liter = get_image_base64(icon_cost_liter_path)
    icon_water = get_image_base64(icon_water_path)

    animal_inputs = ensure_df(post_results.get('animal_inputs'))
    dt_proportions = ensure_df(post_results.get('dt_proportions'))
    dt_forages = ensure_df(post_results.get('dt_forages'))
    methane_report = ensure_df(post_results.get('methane_report'))
    ration_evaluation = ensure_df(post_results.get('ration_evaluation'))
    constraint_messages = post_results.get("constraint_messages", {})
    post_messages = post_results.get("messages") or constraint_messages.get("messages") or []
    
    if not isinstance(post_messages, list):
        post_messages = []
    if evaluation_mode:
        post_messages = []
        recommendations = []
    
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

    # Message Cards
    notes_html = ""
    if post_messages:
        lis = []
        for msg in post_messages:
            if not isinstance(msg, str): continue
            clean_msg = msg.strip()
            
            if not clean_msg:
                # Keep support for explicit spacers just in case
                lis.append("<li>&nbsp;</li>")
            elif clean_msg.startswith("Diet status:"):
                # Handle "Diet status: Value"
                label = "Diet status:"
                value = clean_msg[len(label):].strip()
                lis.append(f"<li>{label} <span class='note-value'><b>{value}</b></span></li>")
            elif any(clean_msg.startswith(prefix) for prefix in ["Violated parameters:", "Key issues:", "Critical issues:"]):
                # Add automatic spacer BEFORE these sub-headers
                if lis: # Only if it's not the first item
                    lis.append("<li>&nbsp;</li>")
                # Labels that stay normal
                lis.append(f"<li>{clean_msg}</li>")
            else:
                # All other lines (actual violations) become bold and smaller
                lis.append(f"<li><span class='note-value'><b>{clean_msg}</b></span></li>")
        
        note_items = "\n".join(lis)
        if note_items:
            notes_html = f"""
            <div class='message-card'>
                <div class='message-title'>Notes</div>
                <ul class='message-list'>{note_items}</ul>
            </div>"""
            
    messages_html = notes_html
    
    # Tables processing
    dt_results = pd.DataFrame(columns=['Ingredient Name', 'Amount Fresh (Kg/d)', 'Amount DM (Kg/d DM)', 'Price/kg', 'Price/d'])
    if not dt_proportions.empty:
        dt_results = dt_proportions[['Name', 'AF_kg', 'DM_kg', 'PRICE/KG', 'Cost']].copy()
        dt_results.rename(columns={
            "Name": "Ingredient Name", 
            "AF_kg": "Amount Fresh<br/>(Kg/day)",
            "DM_kg": "Amount DM<br/>(Kg/day)", 
            "PRICE/KG": "Price<br/>(Per Kg)", 
            "Cost": "Price<br/>(Per day)",
        }, inplace=True)
        if "Ingredient Name" in dt_results.columns and "Price/kg" in dt_results.columns:
            dt_results["Price/kg"] = dt_results["Price/kg"].astype(str)
            dt_results.loc[dt_results["Ingredient Name"].str.upper().str.contains("TOTAL"), "Price/kg"] = ""
    
    diet_supply_results = post_results.get('diet_supply_results', {})
    An_Requirements = rsm_create_animal_requirements_dataframe(animal_requirements, diet_supply_results)
    water_intake = post_results.get('water_intake', 0.0)
    An_Requirements.loc[An_Requirements['Parameter'] == 'Water Intake', 'Value'] = water_intake

    # Minerals display adjustment
    dt_concentrates = pd.DataFrame()
    if not dt_proportions.empty:
        dt_concentrates = dt_proportions[dt_proportions['Ingr_Type'].isin(['Concentrate', 'Minerals', 'By-Product/Other', 'Plant Protein', 'Additive'])].copy()
        if not dt_concentrates.empty:
            concentrate_total = dt_concentrates.select_dtypes(include=[np.number]).sum()
            concentrate_total['Ingr_Type'] = '' # Blank for total row
            concentrate_total['Name'] = 'Total'
            dt_concentrates = pd.concat([dt_concentrates, concentrate_total.to_frame().T], ignore_index=True)
    
    weighted_ca, weighted_p = calculate_weighted_absorption(dt_forages, dt_concentrates)
    ca_absorbed = animal_requirements.get("An_Ca_req", 0)
    p_absorbed = animal_requirements.get("An_P_req", 0)
    An_Requirements.loc[An_Requirements['Parameter'] == 'Calcium', 'Value'] = (ca_absorbed / weighted_ca) * 1000
    An_Requirements.loc[An_Requirements['Parameter'] == 'Phosphorus', 'Value'] = (p_absorbed / weighted_p) * 1000

    # Footnotes
    ndf_bw = None
    forage_ndf_bw = None
    if isinstance(diet_supply_results, (np.ndarray, list)) and len(diet_supply_results) > 18:
        ndf_bw = float(diet_supply_results[17])
        forage_ndf_bw = float(diet_supply_results[18])

    forage_footnote_html = ""
    if (ndf_bw is not None and np.isfinite(ndf_bw)) or (forage_ndf_bw is not None and np.isfinite(forage_ndf_bw)):
        parts = []
        if ndf_bw is not None and np.isfinite(ndf_bw): parts.append(f"<strong>NDF %BW</strong> = {ndf_bw:.2f}% (target < 1.2%)")
        if forage_ndf_bw is not None and np.isfinite(forage_ndf_bw): parts.append(f"<strong>Forage NDF %BW</strong> = {forage_ndf_bw:.2f}% (target < 1.0%)")
        forage_footnote_html = f"<p class='footnote'>{' | '.join(parts)}</p>"

    # Formatting
    dfs = [animal_inputs, An_Requirements, dt_results, dt_proportions, dt_forages, dt_concentrates, methane_report, ration_evaluation]
    for df in dfs:
        if not df.empty:
            # Clear Ingredient Type for Total rows if they exist
            if 'Ingr_Type' in df.columns and 'Name' in df.columns:
                df.loc[df['Name'].str.upper() == 'TOTAL', 'Ingr_Type'] = ''
            
            num_cols = df.select_dtypes(include=[np.number]).columns
            df[num_cols] = df[num_cols].round(2)

    # Rename Classification to Impact Classification in the table
    if not methane_report.empty and 'Metric' in methane_report.columns:
        methane_report.loc[methane_report['Metric'] == 'Classification', 'Metric'] = 'Impact Classification'

    dt_proportions_display = format_feed_df(dt_proportions)
    dt_forages_display = format_feed_df(dt_forages)
    dt_concentrates_display = format_feed_df(dt_concentrates)

    currency_display = currency + " " if len(currency) > 1 else currency
    report_date = datetime.now().strftime("%b %d, %Y %H:%M") # PDF friendly format

    # Extract methane metrics for the Eco-Efficiency Profile
    m_prod, m_yield, m_int, m_ym, m_class = 0.0, 0.0, 0.0, 0.0, "Unknown"
    if not methane_report.empty and 'Metric' in methane_report.columns:
        m_map = {row['Metric']: row['Value'] for _, row in methane_report.iterrows()}
        m_prod = m_map.get('Methane Production (g/day)', m_map.get('Methane Production', 0.0))
        m_yield = m_map.get('Methane Yield (g/kg DMI)', m_map.get('Methane Yield', 0.0))
        m_int = m_map.get('Methane Intensity (g/kg ECM)', m_map.get('Methane Intensity', 0.0))
        m_ym = m_map.get('Ym (%)', m_map.get('Ym', 0.0))
        m_class = m_map.get('Impact Classification', m_map.get('Classification', 'Average'))

    # Calculate bar widths (relative to benchmarks)
    w_prod = min(100, (float(m_prod) / 800) * 100) if m_prod else 0
    w_yield = min(100, (float(m_yield) / 35) * 100) if m_yield else 0
    w_int = min(100, (float(m_int) / 25) * 100) if m_int else 0
    w_ym = min(100, (float(m_ym) / 12) * 100) if m_ym else 0

    env_impact_html = f"""
    <div class='section'>
        <h2><img src='{icon_env}' class='section-icon'>Environmental Impact</h2>
        <div class='env-scorecard'>
            <div class='profile-row'>
                <div class='profile-info'><span>Methane Production</span><span>{m_prod} g/day</span></div>
                <div class='profile-bar-bg'><div class='profile-bar-fill' style='width: {w_prod}%;'></div></div>
            </div>
            <div class='profile-row'>
                <div class='profile-info'><span>Methane Yield</span><span>{m_yield} g/kg DMI</span></div>
                <div class='profile-bar-bg'><div class='profile-bar-fill' style='width: {w_yield}%; background: #eab308;'></div></div>
            </div>
            <div class='profile-row'>
                <div class='profile-info'><span>Methane Intensity</span><span>{m_int} g/kg ECM</span></div>
                <div class='profile-bar-bg'><div class='profile-bar-fill' style='width: {w_int}%; background: #ef4444;'></div></div>
            </div>
            <div class='profile-row'>
                <div class='profile-info'><span>Methane Conversion Rate (Ym)</span><span>{m_ym} %</span></div>
                <div class='profile-bar-bg'><div class='profile-bar-fill' style='width: {w_ym}%; background: #3b82f6;'></div></div>
            </div>
            <div class='classification-container'>
                <span class='classification-label'>Classification :</span>
                <span class='classification-tag'>{str(m_class).upper()}</span>
            </div>
            <p class='footnote'>*Ym(%) = Percentage of energy intake lost as methane.</p>
        </div>
    </div>
    """

    # CSS with @media print
    style = """
    <style>
      :root {
        --primary-green: #2e7d32;
        --secondary-green: #4caf50;
        --header-bg: linear-gradient(135deg, #2e7d32 0%, #388e3c 100%);
        --card-shadow: 0 4px 15px rgba(0,0,0,0.1);
      }
      * { box-sizing: border-box; }
      body { 
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
        margin: 0; padding: 20px; line-height: 1.5; color: #333;
        background: #f5f7fa;
      }
      .container { max-width: 1100px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: var(--card-shadow); overflow: hidden; }
      .header { background: var(--header-bg); color: white; padding: 25px; text-align: center; margin-bottom: 0; }
      .header h1 { margin: 0; font-size: 2.2em; font-weight: 400; }
      .report-meta { display: flex; justify-content: center; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
      .meta-item { background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; text-align: center; min-width: 120px; }
      .meta-item strong { display: block; font-size: 0.88em; color: #e8f5e8; text-transform: uppercase; font-weight: bold; }
      .meta-item span { font-size: 0.95em; font-weight: normal; }
      
      .content { padding: 30px; }
      .section { margin-bottom: 60px; background: white; border-radius: 10px; }
      h2 { color: var(--primary-green); border-bottom: 2px solid var(--secondary-green); padding-bottom: 8px; margin-top: 0; margin-bottom: 0; display: flex; align-items: center; gap: 8px; font-size: 1.6em; }
      
      .section-icon { width: 32px; height: 32px; vertical-align: middle; margin-right: 10px; }
      .header-icon { width: 48px; height: 48px; vertical-align: middle; margin-right: 12px; }
      .emoji { margin-right: 10px; }

      .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px; margin-bottom: 30px; }
      .metric-item { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); text-align: center; }
      .metric-value { font-size: 1.45em; font-weight: 600; color: var(--primary-green); }
      .metric-label { font-size: 0.85em; color: #333; margin-top: 5px; font-weight: bold; }

      .table-container { overflow-x: auto; margin-top: 15px; border-radius: 8px; border: 1px solid #eee; }
      table { width: 100%; border-collapse: collapse; font-size: 15px; }
      th { background: #eeeeee; color: #333; font-weight: 600; padding: 12px; border-bottom: 2px solid #ddd; text-align: left; }
      td { padding: 10px 12px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #fafafa; }
      
      .message-card { background: #FEEBE7; border-left: 4px solid #E9967A; padding: 15px; border-radius: 6px; margin: 15px 0; }
      .recommendation-card { background: #f0fff4; border-left: 4px solid #28a745; }
      .message-title { font-weight: 600; margin-bottom: 5px; }
      .message-list { margin: 0; padding-left: 0; list-style: none; font-size: 0.9em; }
      .note-value { font-size: 0.9em; }
      .footnote { font-size: 0.85em; color: #666; margin-top: 10px; margin-bottom: 0; }
      .footnote + .footnote { margin-top: 3px; }

      /* Environmental Impact - Eco-Efficiency Profile */
      .env-scorecard { margin-top: 15px; padding: 20px; background: #fff; border-radius: 12px; border: 1px solid #edf2f7; box-shadow: 0 2px 10px rgba(0,0,0,0.03); }
      .profile-row { margin-bottom: 12px; }
      .profile-info { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.92em; font-weight: normal; color: #475569; }
      .profile-bar-bg { height: 7px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
      .profile-bar-fill { height: 100%; background: #22c55e; border-radius: 5px; transition: width 0.5s ease; }
      .classification-container { margin-top: 15px; display: flex; align-items: center; gap: 12px; border-top: 1px solid #f1f5f9; padding-top: 10px; }
      .classification-label { font-size: 0.95em; font-weight: 600; color: #64748b; }
      .classification-tag { background: #dcfce7 !important; color: #166534 !important; padding: 3px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 700; border: 1px solid #bbf7d0; text-transform: uppercase; -webkit-print-color-adjust: exact; }

      /* Solution Summary - Executive Brief (Var 3: Light Green Backgrounds) */
      .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 10px; margin-bottom: 20px; }
      .summary-card { padding: 12px 10px; border-radius: 10px; background: #f0fdf4; text-align: center; border: 1px solid #bbf7d0; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
      .summary-icon { width: 28px; height: 28px; margin: 0 auto 4px auto; display: block; object-fit: contain; }
      .summary-val { font-size: 1.15rem; font-weight: 800; color: #2e7d32; display: block; margin-top: 2px; }
      .summary-lab { font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

      /* Default visibility */
      .transposed-only { display: none !important; }
      .wide-only { display: block !important; }

      @media print {
        body { padding: 0; background: white; }
        .container { box-shadow: none; border-radius: 0; max-width: 100%; }
        .header { padding: 15px; background: #2e7d32 !important; -webkit-print-color-adjust: exact; margin-bottom: 30px !important; }
        .report-meta { 
          display: flex !important; 
          flex-wrap: nowrap !important; 
          justify-content: space-between !important;
          gap: 5px !important;
          margin-top: 10px !important;
        }
        .meta-item { 
          background: rgba(0,0,0,0.2) !important;
          padding: 4px 5px !important; 
          min-width: 0 !important;
          flex: 1 1 0px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .meta-item strong { font-size: 7.7pt !important; font-weight: bold !important; }
        .meta-item span { font-size: 8pt !important; font-weight: normal !important; }

        .content { padding: 15px; display: block !important; }
        
        .metric-grid { 
          display: flex !important; 
          flex-wrap: nowrap !important; 
          justify-content: space-between !important;
          gap: 10px !important;
          margin-bottom: 20px !important;
        }
        .metric-item { 
          flex: 1 1 0px !important;
          min-width: 0 !important;
          padding: 10px 5px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
        }
        .metric-value { 
          font-size: 1.15em !important; 
          white-space: nowrap !important;
        }
        .metric-label { 
          font-size: 8.3pt !important; 
          font-weight: bold !important;
          white-space: nowrap !important;
        }

        .summary-grid { 
          display: flex !important; 
          flex-wrap: nowrap !important; 
          justify-content: space-between !important;
          gap: 8px !important;
          margin-top: 5px !important;
          margin-bottom: 15px !important;
        }
        .summary-card { 
          flex: 1 1 0px !important;
          min-width: 0 !important;
          padding: 8px 4px !important;
          background: #f0fdf4 !important;
          -webkit-print-color-adjust: exact;
        }
        .summary-icon { width: 22px !important; height: 22px !important; margin-bottom: 2px !important; }
        .summary-val { font-size: 0.95rem !important; margin-top: 1px !important; }
        .summary-lab { font-size: 6pt !important; }

        .section { page-break-inside: avoid !important; margin-bottom: 58px !important; }
        h2 { font-size: 1.3em !important; margin-bottom: 10px !important; }
        table { font-size: 13.2px !important; page-break-inside: avoid !important; }
        th { background: #eeeeee !important; -webkit-print-color-adjust: exact; padding: 6px !important; }
        td { padding: 4px 6px !important; }

        /* Print visibility: Hide wide, show transposed */
        .wide-only { display: none !important; }
        .transposed-only { display: block !important; }
        
        .table-container { overflow: visible !important; border: none !important; }
        .page-break { page-break-after: always !important; }
        .footnote { color: #004c99 !important; font-weight: 500 !important; margin-top: 10px !important; margin-bottom: 0 !important; }
        .footnote + .footnote { margin-top: 3px !important; }
      }
    </style>
    """

    def transpose_to_html(df, title_icon="", title_text="", footer="", show_title=True, is_img=True):
        if df.empty: return ""
        # Use the first column as the index for transposition (e.g., Ingredient Name or Parameter)
        index_col = df.columns[0]
        tdf = df.set_index(index_col).T
        
        html = "<div class='transposed-only'>"
        if show_title and title_text:
            if is_img:
                html += f"<h2><img src='{title_icon}' class='section-icon'>{title_text}</h2>"
            else:
                html += f"<h2><span class='emoji'>{title_icon}</span>{title_text}</h2>"
        
        html += "<div class='table-container'>" + tdf.to_html(classes='transposed-table') + "</div>"
        if footer:
            html += footer
        html += "</div>"
        return html

    # Build parts
    parts = [
        "<!DOCTYPE html><html><head>",
        "<meta charset='utf-8'/><meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        f"<title>{'Diet Evaluation' if evaluation_mode else 'Diet Recommendation'}</title>",
        style, "</head><body>",
        "<div class='container'>",
        f"<div class='header'><h1><img src='{icon_header}' class='header-icon'> {'Evaluation Report' if evaluation_mode else 'Recommendation Report'}</h1>",
        "<div class='report-meta'>",
        f"<div class='meta-item'><strong>User</strong><span>{user_name}</span></div>",
        f"<div class='meta-item'><strong>Simulation</strong><span>{simulation_id}</span></div>",
        f"<div class='meta-item'><strong>Report ID</strong><span>{report_id}</span></div>",
        f"<div class='meta-item'><strong>Country</strong><span>{country_name}</span></div>",
        f"<div class='meta-item'><strong>Generated</strong><span>{report_date}</span></div>",
        "</div></div>",
        "<div class='content'>",
        
        # Page 1: Summary, Diet, Impact
        f"<div class='section'><h2><img src='{icon_summary}' class='section-icon'>Solution Summary</h2>",
        "<div class='summary-grid'>",
        "    <div class='summary-card'>",
        f"        <img src='{icon_prod}' class='summary-icon'>",
        "        <span class='summary-lab'>Target Production</span>",
        f"        <span class='summary-val'>{milk_target:.1f} L</span>",
        "    </div>",
        "    <div class='summary-card'>",
        f"        <img src='{icon_daily_cost}' class='summary-icon'>",
        "        <span class='summary-lab'>Daily Cost</span>",
        f"        <span class='summary-val'>{currency_display}{daily_cost:.2f}</span>",
        "    </div>",
        "    <div class='summary-card'>",
        f"        <img src='{icon_cost_liter}' class='summary-icon'>",
        "        <span class='summary-lab'>Cost / Liter</span>",
        f"        <span class='summary-val'>{f'{currency_display}{cost_per_liter:.2f}' if cost_per_liter is not None else '—'}</span>",
        "    </div>",
        "    <div class='summary-card'>",
        f"        <img src='{icon_water}' class='summary-icon'>",
        "        <span class='summary-lab'>Water Intake</span>",
        f"        <span class='summary-val'>{water_intake:.1f} L</span>",
        "    </div>",
        "</div></div>",

        f"<div class='section'><h2><img src='{icon_diet}' class='section-icon'>{'Diet' if evaluation_mode else 'Least Cost Diet'}</h2>",
        "<div class='table-container'>" + dt_results.to_html(index=False, classes='diet-table', escape=False) + "</div>",
        messages_html, "</div>",

        env_impact_html,

        # Page 2: Animal Info, Requirements, Details
        f"<div class='section'><h2><img src='{icon_animal}' class='section-icon'>Animal Information</h2>",
        "<div class='table-container'>" + animal_inputs.to_html(index=False, classes='animal-info-table') + "</div></div>",
        
        f"<div class='section'><h2><img src='{icon_req}' class='section-icon'>Nutritional Requirements</h2>",
        "<div class='table-container'>" + An_Requirements.to_html(index=False, classes='requirements-table') + "</div></div>",

        # Nutrient Proportions
        f"<div class='section wide-only'><h2><img src='{icon_prop}' class='section-icon'>Nutrient Proportions (%)</h2>",
        "<div class='table-container'>" + dt_proportions_display.to_html(index=False, classes='proportions-table') + "</div></div>",
        transpose_to_html(dt_proportions_display, icon_prop, "Nutrient Proportions", is_img=True),
        
        # Forage Details
        f"<div class='section wide-only'><h2><img src='{icon_forage}' class='section-icon'>Forage Details</h2>",
        "<div class='table-container'>" + dt_forages_display.to_html(index=False, classes='forage-table') + "</div>",
        forage_footnote_html, "</div>",
        transpose_to_html(dt_forages_display, icon_forage, "Forage Details", footer=forage_footnote_html, is_img=True),

        # Concentrate Details
        f"<div class='section wide-only'><h2><img src='{icon_concentrate}' class='section-icon'>Concentrate Details</h2>",
        "<div class='table-container'>" + dt_concentrates_display.to_html(index=False, classes='concentrate-table') + "</div></div>",
        transpose_to_html(dt_concentrates_display, icon_concentrate, "Concentrate Details", is_img=True),
        
        "</div>",  # Close content
        "</div>",  # Close container

        "</div></div></body></html>"
    ]

    html_content = "\n".join(parts)
    Path(output_file).write_text(html_content, encoding="utf-8")
    return output_file

def generate_report_from_runner_results_v2(results, output_file="final_report_v2.html"):
    post_results = results["post_optimization"]
    animal_requirements = results["animal_requirements"]
    evaluation_mode = results.get("report_mode") == "evaluation" or post_results.get("report_mode") == "evaluation"
    
    if not evaluation_mode and not results.get("allow_report", False):
        return
    
    return rsm_generate_report_v2(post_results, animal_requirements, output_file, evaluation_mode=evaluation_mode)
