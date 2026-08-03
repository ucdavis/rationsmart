"""
Standalone Diet Recommendation runner (NSGA-III least-cost formulation).

Runs the SAME engine the API uses (core.z_optimization.nsga3_runner.z_optimization_main)
without FastAPI / the DB / the process pool. Reads all inputs from an xlsx
workbook and writes an HTML report per animal to scripts_2/manual_run/results/,
using rsm_generate_report_v2 — the same renderer that produces Report.report_html
(and, via WeasyPrint, the PDF) on the API path — so the standalone HTML matches
the PDF layout/content exactly.

Local dev tooling only: lives under the scripts_2/ tree, is never imported by
the app, and cannot affect the server, deployment, or the FE/BE.

Usage (from the rationsmart/ project root):
    python -m scripts_2.manual_run.run_optimization                 # single animal ("Animal" sheet)
    python -m scripts_2.manual_run.run_optimization --mode bulk     # every column in "BulkAnimals"
    python -m scripts_2.manual_run.run_optimization --file path.xlsx --output-dir some/dir

Workbook (default scripts_2/manual_run/RFT_FD_Lib_Y2test.xlsx):
    "Fd_selected"  feed library      "Animal" single animal      "BulkAnimals" many
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

# Make the project root importable whether launched as `-m scripts_2.manual_run.run_optimization`
# or `python scripts_2/manual_run/run_optimization.py`.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.z_optimization.nsga3_runner import z_optimization_main  # noqa: E402
from core.z_optimization.pdf_service import REPORT_ASSETS_DIR  # noqa: E402
from core.z_optimization.report_generation import rsm_generate_report_v2  # noqa: E402
from scripts_2.animal_inputs_loader import (  # noqa: E402
    load_bulk_animals,
    load_single_animal,
    safe_animal_id,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("run_optimization")

DEFAULT_FILE = ROOT / "scripts_2" / "manual_run" / "RFT_FD_Lib_Y2test.xlsx"
DEFAULT_OUTPUT_DIR = ROOT / "scripts_2" / "manual_run" / "results"
FEED_SHEET = "Fd_selected"


def _inject_asset_base(html: str) -> str:
    """Point the report's relative icon <img> src at the real assets dir.

    rsm_generate_report_v2 references icons by bare filename (e.g.
    'report_header.png'), relying on WeasyPrint's base_url=REPORT_ASSETS_DIR
    to resolve them at PDF-conversion time. A browser opening this HTML file
    directly has no such base_url, so we add an explicit <base> tag pointing
    at the same assets directory the PDF path uses.
    """
    base_tag = f'<base href="file://{REPORT_ASSETS_DIR}/">'
    return html.replace("<head>", f"<head>{base_tag}", 1)


def _run_for_animal(record, feed_list, output_dir: Path, ts: str) -> None:
    animal_id = record["animal_id"]
    animal_inputs = record["animal_inputs"]
    milk_price = record["milk_price_per_liter"]
    logger.info("\n=== Diet Recommendation — animal %s ===", animal_id)

    result = z_optimization_main(animal_inputs, feed_list)

    logger.info(
        "status=%s  total_cost(AF)=%.2f  water_intake=%.2f",
        result.status, result.total_cost, result.water_intake,
    )
    if result.messages:
        logger.info("notes: %s", "; ".join(map(str, result.messages)))

    if not result.allow_report:
        logger.warning("Report suppressed (allow_report=False, status=%s).", result.status)
        if result.error_message:
            logger.warning("reason: %s", result.error_message)
        return

    # Carry milk price so the report's margin card can render (mirrors the API path).
    post_results = result.post_results if isinstance(result.post_results, dict) else {}
    post_results["milk_price"] = milk_price

    # Same renderer the API uses for Report.report_html (and thus the PDF, which is
    # just this HTML converted by WeasyPrint) — see run_optimization.py's module
    # docstring / docs/dev_docs/manual_run/manual_run_guide.md for why.
    html = rsm_generate_report_v2(
        post_results=post_results,
        animal_requirements=result.animal_requirements,
        simulation_id="manual-run",
        report_id=f"rec-{safe_animal_id(animal_id)}",
        evaluation_mode=False,
    )
    out = output_dir / f"diet_recommendation_{safe_animal_id(animal_id)}_{ts}.html"
    out.write_text(_inject_asset_base(html), encoding="utf-8")
    logger.info("report: %s", out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone Diet Recommendation runner.")
    parser.add_argument("--file", default=str(DEFAULT_FILE), help="Input xlsx workbook.")
    parser.add_argument("--mode", choices=["single", "bulk"], default="single",
                        help="'single' reads the Animal sheet; 'bulk' reads BulkAnimals.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR),
                        help="Directory for HTML reports.")
    args = parser.parse_args()

    xlsx = Path(args.file)
    if not xlsx.exists():
        parser.error(f"Input workbook not found: {xlsx}")
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")

    feed_df = pd.read_excel(xlsx, sheet_name=FEED_SHEET)
    feed_df = feed_df.loc[:, ~feed_df.columns.duplicated()]
    feed_list = feed_df.to_dict("records")
    logger.info("Loaded %d feed(s) from '%s' [%s]", len(feed_list), xlsx.name, FEED_SHEET)

    if args.mode == "single":
        records = [load_single_animal(str(xlsx), sheet="Animal")]
    else:
        records = load_bulk_animals(str(xlsx), sheet="BulkAnimals")
        if not records:
            logger.warning("No animals found in 'BulkAnimals'.")
            return
        logger.info("Loaded %d animal(s) from 'BulkAnimals'.", len(records))

    for record in records:
        try:
            _run_for_animal(record, feed_list, output_dir, ts)
        except Exception as exc:  # noqa: BLE001 - keep bulk runs going
            logger.error("Animal %r failed: %s", record.get("animal_id"), exc)


if __name__ == "__main__":
    main()
