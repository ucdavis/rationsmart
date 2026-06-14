"""
RationSmart evaluation runner
"""

import logging
import numpy as np
from .evaluation import evaluate_diet, generate_evaluation_html, report_diet_eval

logger = logging.getLogger(__name__)

# Purpose: Run a single evaluation pass with default inputs and emit console/HTML outputs.
# Notes: Seeds default animal/feed values, prints milk support, and writes an HTML report.
def main():
    # Default animal inputs; adjust as needed
    animal_inputs = {
        "An_StatePhys": "Lactating Cow",
        "An_Breed": "Crossbred",
        "An_BW": 490,
        "Trg_FrmGain": 0.0,
        "An_BCS": 3.00,
        "An_LactDay": 190,
        "Trg_MilkProd_L": 12.55,
        "Trg_MilkTPp": 3.4,
        "Trg_MilkFatp": 3.8,
        "An_Parity": 1,
        "An_GestDay": 0,
        "Env_TempCurr": 28,
        "Env_Grazing": 1,
        "Env_Dist_km": 1,
        "Env_Topog": 0,
    }

    # Default as-fed amounts; align with feed library order
    ingredient_amounts_AF = np.array([21.48, 3.72, 6.52, 0.00])

    results = evaluate_diet(animal_inputs, ingredient_amounts_AF)

    logger.info("RATION EVALUATION RESULTS: %s", report_diet_eval(results["milk_support"]))

    output_file = generate_evaluation_html(results["report_ready"])
    logger.info("Evaluation report generated at: %s", output_file)


if __name__ == "__main__":
    main()

# python evaluation_runner.py