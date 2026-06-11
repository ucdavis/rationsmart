"""
Standalone script to test the optimization core without the HTTP layer.
Runs NSGA-III on hardcoded animal inputs + Excel feed library and
generates an HTML report in scripts/output/.

Usage (from rationsmart/ project root):
    python -m scripts.run_optimization
"""
import logging
import os
import random
import uuid

import pandas as pd

from core.z_optimization.nsga3_runner import z_optimization_main
from core.z_optimization.report_generation import rsm_generate_report

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("run_optimization")

EXCEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "core", "z_optimization", "RFT_FD_Lib_Y2test.xlsx"
)

COLUMN_RENAMES = {
    "fd_name": "Fd_Name", "fd_category": "Fd_Category", "fd_type": "Fd_Type",
    "fd_cost": "Fd_Cost", "fd_dm": "Fd_DM", "fd_ash": "Fd_Ash", "fd_cp": "Fd_CP",
    "fd_npn_cp": "Fd_NPN_CP", "fd_ee": "Fd_EE", "fd_cf": "Fd_CF",
    "fd_nfe": "NFE (%)", "nfe_pct": "NFE (%)", "nfe (%)": "NFE (%)",
    "fd_st": "Fd_St", "fd_ndf": "Fd_NDF", "fd_hemicellulose": "Fd_Hemicellulose",
    "fd_adf": "Fd_ADF", "fd_cellulose": "Fd_Cellulose", "fd_lg": "Fd_Lg",
    "fd_ndin": "Fd_NDIN", "fd_adin": "Fd_ADIN", "fd_ca": "Fd_Ca", "fd_p": "Fd_P",
    "fd_country": "Fd_Country", "fd_country_name": "Fd_Country",
    "fd_filler_role": "Fd_FillerRole",
}

ANIMAL_INPUTS = {
    "An_StatePhys": "Lactating Cow",
    "An_Breed": "Holstein",
    "An_BW": 600,
    "Trg_FrmGain": 0.2,
    "An_BCS": 3.0,
    "An_LactDay": 100,
    "Trg_MilkProd_L": 30,
    "Trg_MilkTPp": 3.2,
    "Trg_MilkFatp": 3.8,
    "An_Parity": 2,
    "An_GestDay": 0,
    "Env_TempCurr": 25,
    "Env_Grazing": 1,
    "Env_Dist_km": 0,
    "Env_Topog": 0,
}


def load_feed_data() -> pd.DataFrame:
    excel_path = os.path.normpath(EXCEL_PATH)
    logger.info("Loading feed data from: %s", excel_path)
    df = pd.read_excel(excel_path, sheet_name="Fd_selected")
    df = df.loc[:, ~df.columns.duplicated()]
    df.rename(columns=COLUMN_RENAMES, inplace=True)
    logger.info("Loaded %d feeds", len(df))
    return df


def generate_html_report(results: dict, simulation_id: str, report_id: str) -> str | None:
    output_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_dir, exist_ok=True)
    html_path = os.path.join(output_dir, f"diet_report_{simulation_id}.html")
    post_results = results.get("post_results", {})
    animal_requirements = results.get("animal_requirements", {})
    rsm_generate_report(
        post_results,
        animal_requirements,
        html_path,
        user_name="Standalone Tester",
        simulation_id=simulation_id,
        report_id=report_id,
    )
    return html_path


def main() -> None:
    simulation_id = f"standalone-test-{random.randint(1000, 9999)}"
    user_id = str(uuid.uuid4())
    report_id = f"rec-{uuid.uuid4()}"

    feed_df = load_feed_data()

    logger.info("Running optimization (simulation_id=%s) ...", simulation_id)
    results = z_optimization_main(
        animal_inputs=ANIMAL_INPUTS,
        feed_data=feed_df,
        simulation_id=simulation_id,
        user_id=user_id,
        report_id=report_id,
    )

    if results.get("status") != "SUCCESS":
        logger.error("Optimization failed: %s", results.get("error_message"))
        return

    post_results = results.get("post_results", {})
    total_cost = post_results.get("total_cost", results.get("total_cost", 0))
    logger.info("Optimization succeeded. Cost: $%.2f  Status: %s", total_cost, results.get("status_classification"))

    html_path = generate_html_report(results, simulation_id, report_id)
    if html_path:
        logger.info("HTML report: %s", html_path)
    else:
        logger.error("HTML report generation failed.")


if __name__ == "__main__":
    main()
