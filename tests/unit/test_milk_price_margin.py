"""
Unit tests for the Milk Price & Profit Margin feature.

Covers every layer of the implementation:
  1. API schema  — CattleInfo.milk_price (app/schemas/animal.py)
  2. Screen JSON  — margin_summary in build_diet_response (recommendation)
                    and build_evaluation_response (evaluation) (core/z_optimization/reporting.py)
  3. HTML report  — margin banner in rsm_generate_report_v2 (core/z_optimization/report_generation.py)
  4. PDF pass     — banner survives _optimize_html_for_pdf (core/z_optimization/pdf_service.py)

No database or HTTP server is needed for any of these tests.

margin_per_liter = milk_price - cost_per_liter
daily_iofc       = milk_price * milk_yield - daily_cost
"""

from types import SimpleNamespace

import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas.animal import CattleInfo
from core.z_optimization.reporting import build_diet_response, build_evaluation_response
from core.z_optimization.report_generation import rsm_generate_report_v2
from core.z_optimization.pdf_service import _optimize_html_for_pdf


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

_BASE_CATTLE = dict(
    body_weight=500, breed="HF", lactating=True, milk_production=20,
    days_in_milk=100, parity=2, days_of_pregnancy=0, tp_milk=3.2, fat_milk=3.8,
    temperature=25, topography="Flat", distance=2, calving_interval=400,
)


def _cattle_ns(milk_price=None, milk_production=20.0):
    """Lightweight cattle_info stand-in for the response builders (dot access)."""
    return SimpleNamespace(
        breed="HF", body_weight=500, bw_gain=0.2, bc_score=3.0, days_in_milk=100,
        milk_production=milk_production, tp_milk=3.2, fat_milk=3.8, parity=2,
        days_of_pregnancy=0, temperature=25, distance=2.0, grazing=False,
        topography="Flat", milk_price=milk_price,
    )


def _rec_response(milk_price, daily_cost=100.0, milk_production=20.0):
    opt = {
        "status": "SUCCESS",
        "post_results": {
            "total_cost": daily_cost, "diet_table": [], "nutrient_comparison": [],
            "dt_proportions": [], "methane_report": {}, "Dt_kg": {}, "water_intake": 60.0,
            "constraint_messages": {"status": "SUCCESS", "messages": []},
            "milk_price": milk_price,
        },
        "animal_requirements": {"Env_Grazing": 1, "Trg_MilkProd_L": milk_production},
    }
    return build_diet_response(
        opt, _cattle_ns(milk_price, milk_production), "sim1", "rec-1", "U", currency="VND"
    )


def _eval_response(milk_price, daily_cost=80.0, cost_per_l=4.0, milk_supported=16.0):
    ev = {
        "milk_support": {
            "Diet_Cost_Total_AF": daily_cost, "Feed_Cost_Per_L_Milk": cost_per_l,
            "Milk_Supported": milk_supported, "DMI_Status": "Adequate",
        },
        "post_results": {"milk_price": milk_price},
        "ingredient_amounts_dm": [], "ingredient_amounts_af": [],
        "f_nd": {}, "animal_requirements": {"Env_Grazing": 1},
    }
    return build_evaluation_response(
        ev, _cattle_ns(milk_price), "sim1", "eval-1",
        currency="VND", country_name="VN", feed_evaluation=[], feeds=[],
    )


def _render_html(milk_price, currency="VND", tmp_path=None):
    post = {
        "total_cost": 100.0, "water_intake": 60.0, "milk_price": milk_price,
        "dt_proportions": pd.DataFrame(), "dt_forages": pd.DataFrame(),
        "methane_report": pd.DataFrame(), "ration_evaluation": pd.DataFrame(),
        "diet_supply_results": {},
        "constraint_messages": {"status": "SUCCESS", "messages": []},
    }
    reqs = {"Trg_MilkProd_L": 20.0, "Env_Grazing": 1}
    out = str((tmp_path / "report.html")) if tmp_path else "result_html/_test_margin.html"
    rsm_generate_report_v2(
        post, reqs, out, user_name="U", simulation_id="s", report_id="rec-1",
        country_name="VN", currency=currency,
    )
    with open(out, encoding="utf-8") as f:
        return f.read()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Schema
# ─────────────────────────────────────────────────────────────────────────────

class TestSchema:
    def test_milk_price_is_optional(self):
        assert CattleInfo(**_BASE_CATTLE).milk_price is None

    def test_milk_price_rounded_to_2dp(self):
        assert CattleInfo(**_BASE_CATTLE, milk_price="12.349").milk_price == 12.35

    def test_negative_milk_price_rejected(self):
        with pytest.raises(ValidationError):
            CattleInfo(**_BASE_CATTLE, milk_price=-1)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Recommendation screen JSON
# ─────────────────────────────────────────────────────────────────────────────

class TestRecommendationMargin:
    def test_positive_margin(self):
        ss = _rec_response(8.0)["solution_summary"]
        assert ss["cost_per_liter"] == 5.0
        ms = ss["margin_summary"]
        assert ms == {"milk_price": 8.0, "margin_per_liter": 3.0,
                      "daily_iofc": 60.0, "is_positive": True}

    def test_negative_margin(self):
        ms = _rec_response(4.0)["solution_summary"]["margin_summary"]
        assert ms["margin_per_liter"] == -1.0
        assert ms["daily_iofc"] == -20.0
        assert ms["is_positive"] is False

    def test_absent_when_no_price(self):
        assert _rec_response(None)["solution_summary"]["margin_summary"] is None


# ─────────────────────────────────────────────────────────────────────────────
# 3. Evaluation screen JSON
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluationMargin:
    def test_positive_margin_uses_supported_milk(self):
        ms = _eval_response(6.0)["cost_analysis"]["margin_summary"]
        # cost/L = 4.0 -> margin +2.0 ; iofc = 6*16 - 80 = 16
        assert ms == {"milk_price": 6.0, "margin_per_liter": 2.0,
                      "daily_iofc": 16.0, "is_positive": True}

    def test_absent_when_no_price(self):
        assert _eval_response(None)["cost_analysis"]["margin_summary"] is None


# ─────────────────────────────────────────────────────────────────────────────
# 4. HTML banner + PDF pass
# ─────────────────────────────────────────────────────────────────────────────

class TestHtmlBanner:
    def test_positive_banner_rendered(self, tmp_path):
        html = _render_html(8.0, tmp_path=tmp_path)
        assert "class='margin-banner margin-positive'" in html
        assert "+VND 3.00" in html        # margin / liter
        assert "+VND 60.00" in html       # daily IOFC

    def test_negative_banner_rendered(self, tmp_path):
        html = _render_html(4.0, tmp_path=tmp_path)
        assert "class='margin-banner margin-negative'" in html

    def test_no_banner_without_price(self, tmp_path):
        html = _render_html(None, tmp_path=tmp_path)
        assert "margin-banner margin-positive" not in html
        assert "margin-banner margin-negative" not in html

    def test_pdf_pass_preserves_horizontal_layout(self, tmp_path):
        pdf_html = _optimize_html_for_pdf(_render_html(8.0, tmp_path=tmp_path))
        # base flex is downgraded to block for WeasyPrint...
        assert ".margin-banner { display: block;" in pdf_html
        # ...but the @media print rule restores flex.
        assert "display: flex !important" in pdf_html
