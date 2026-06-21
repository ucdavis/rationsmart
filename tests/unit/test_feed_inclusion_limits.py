"""
Unit tests for the per-ingredient inclusion limits feature.

Covers every layer of the implementation:
  1. API schema  — FeedWithPrice (app/schemas/animal.py)
  2. FeedRecord  — dataclass + from_orm (services/diet_service.py)
  3. Feed processing — _prepare_feed_bound_columns (core/z_optimization/feed_processing.py)
  4. Optimizer bounds — _get_explicit_dm_bounds, rsm_bounds_xlxu,
                        _project_to_bounded_simplex (core/z_optimization/optimization_core.py)

No database or HTTP server is needed for any of these tests.
"""

import dataclasses
from unittest.mock import MagicMock

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

# ── imports under test ────────────────────────────────────────────────────────

from app.schemas.animal import FeedWithPrice
from services.diet_service import FeedRecord
from core.z_optimization.feed_processing import _prepare_feed_bound_columns
from core.z_optimization.optimization_core import (
    _get_explicit_dm_bounds,
    _project_to_bounded_simplex,
    rsm_bounds_xlxu,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _minimal_f_nd(n=3, trg=14.0):
    """Minimal f_nd dict satisfying all required columns in classify_feed_categories."""
    return {
        "Fd_Name": np.array([f"Feed{i}" for i in range(n)]),
        "Fd_Type": np.array(["Concentrate"] * n),
        "Fd_Category": np.array(["Grains"] * n),
        "Fd_DM": np.full(n, 88.0),
        "Fd_CP": np.full(n, 15.0),
        "Fd_NDF": np.full(n, 30.0),
        "Fd_NPN_CP": np.zeros(n),
        "Fd_isbyprod": np.zeros(n),
        "Fd_FillerRole": np.array([""] * n),
    }


def _animal_reqs(trg=14.0):
    return {
        "Trg_Dt_DMIn": trg,
        "An_StatePhys": "Lactating Cow",
        "An_NEL": 1.0,
        "An_ME": 1.0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. API schema — FeedWithPrice
# ─────────────────────────────────────────────────────────────────────────────

class TestFeedWithPrice:

    def test_no_bounds_accepted(self):
        obj = FeedWithPrice(feed_id="00000000-0000-0000-0000-000000000001", price_per_kg=10.0)
        assert obj.min_kg_asfed is None
        assert obj.max_kg_asfed is None

    def test_min_only_accepted(self):
        obj = FeedWithPrice(
            feed_id="00000000-0000-0000-0000-000000000001",
            price_per_kg=10.0,
            min_kg_asfed=0.5,
        )
        assert obj.min_kg_asfed == pytest.approx(0.5)
        assert obj.max_kg_asfed is None

    def test_max_only_accepted(self):
        obj = FeedWithPrice(
            feed_id="00000000-0000-0000-0000-000000000001",
            price_per_kg=10.0,
            max_kg_asfed=3.0,
        )
        assert obj.min_kg_asfed is None
        assert obj.max_kg_asfed == pytest.approx(3.0)

    def test_both_valid_accepted(self):
        obj = FeedWithPrice(
            feed_id="00000000-0000-0000-0000-000000000001",
            price_per_kg=10.0,
            min_kg_asfed=0.5,
            max_kg_asfed=3.0,
        )
        assert obj.min_kg_asfed == pytest.approx(0.5)
        assert obj.max_kg_asfed == pytest.approx(3.0)

    def test_equal_min_max_accepted(self):
        obj = FeedWithPrice(
            feed_id="00000000-0000-0000-0000-000000000001",
            price_per_kg=10.0,
            min_kg_asfed=2.0,
            max_kg_asfed=2.0,
        )
        assert obj.min_kg_asfed == obj.max_kg_asfed

    def test_min_greater_than_max_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            FeedWithPrice(
                feed_id="00000000-0000-0000-0000-000000000001",
                price_per_kg=10.0,
                min_kg_asfed=5.0,
                max_kg_asfed=2.0,
            )
        assert "min_kg_asfed" in str(exc_info.value)

    def test_negative_min_rejected(self):
        with pytest.raises(ValidationError):
            FeedWithPrice(
                feed_id="00000000-0000-0000-0000-000000000001",
                price_per_kg=10.0,
                min_kg_asfed=-1.0,
            )

    def test_negative_max_rejected(self):
        with pytest.raises(ValidationError):
            FeedWithPrice(
                feed_id="00000000-0000-0000-0000-000000000001",
                price_per_kg=10.0,
                max_kg_asfed=-0.1,
            )

    def test_bounds_rounded_to_3dp(self):
        obj = FeedWithPrice(
            feed_id="00000000-0000-0000-0000-000000000001",
            price_per_kg=10.0,
            min_kg_asfed=0.12345,
            max_kg_asfed=2.98765,
        )
        assert obj.min_kg_asfed == pytest.approx(0.123)
        assert obj.max_kg_asfed == pytest.approx(2.988)

    def test_invalid_uuid_rejected(self):
        with pytest.raises(ValidationError):
            FeedWithPrice(feed_id="not-a-uuid", price_per_kg=10.0)


# ─────────────────────────────────────────────────────────────────────────────
# 2. FeedRecord dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestFeedRecord:

    def _mock_feed(self):
        feed = MagicMock()
        feed.fd_name = "Maize Silage"
        feed.fd_type = "Forage"
        feed.fd_category = "Silage"
        feed.fd_country_name = "Vietnam"
        feed.fd_code = "MS001"
        for attr in ["fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf",
                     "fd_nfe", "fd_st", "fd_ndf", "fd_hemicellulose", "fd_adf",
                     "fd_cellulose", "fd_lg", "fd_ndin", "fd_adin", "fd_ca", "fd_p"]:
            setattr(feed, attr, 0.0)
        feed.fd_dm = 35.0
        return feed

    def test_fd_min_fd_max_default_none(self):
        rec = FeedRecord(feed_id="abc", fd_name="Feed A")
        assert rec.fd_min is None
        assert rec.fd_max is None

    def test_from_orm_without_bounds(self):
        rec = FeedRecord.from_orm(self._mock_feed(), "fid-1", price_per_kg=12.0)
        assert rec.fd_min is None
        assert rec.fd_max is None

    def test_from_orm_with_bounds(self):
        rec = FeedRecord.from_orm(
            self._mock_feed(), "fid-1",
            price_per_kg=12.0,
            fd_min=0.5,
            fd_max=3.0,
        )
        assert rec.fd_min == pytest.approx(0.5)
        assert rec.fd_max == pytest.approx(3.0)

    def test_asdict_includes_bounds(self):
        rec = FeedRecord.from_orm(
            self._mock_feed(), "fid-1",
            price_per_kg=12.0,
            fd_min=0.5,
            fd_max=3.0,
        )
        d = dataclasses.asdict(rec)
        assert d["fd_min"] == pytest.approx(0.5)
        assert d["fd_max"] == pytest.approx(3.0)

    def test_asdict_none_bounds_when_not_set(self):
        rec = FeedRecord.from_orm(self._mock_feed(), "fid-1", price_per_kg=12.0)
        d = dataclasses.asdict(rec)
        assert d["fd_min"] is None
        assert d["fd_max"] is None


# ─────────────────────────────────────────────────────────────────────────────
# 3. Feed processing — _prepare_feed_bound_columns
# ─────────────────────────────────────────────────────────────────────────────

class TestPrepareFeedBoundColumns:

    def _df(self, fd_min=None, fd_max=None, fd_dm=35.0):
        data = {"Fd_Name": ["Maize Silage"], "Fd_DM": [fd_dm]}
        if fd_min is not None:
            data["Fd_Min"] = [fd_min]
        if fd_max is not None:
            data["Fd_Max"] = [fd_max]
        return pd.DataFrame(data)

    def test_no_bound_columns_gives_zeros(self):
        df = _prepare_feed_bound_columns(self._df())
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.0)
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(0.0)

    def test_min_conversion_asfed_to_dm(self):
        # 2.0 kg as-fed × 35% DM = 0.70 kg DM/day
        df = _prepare_feed_bound_columns(self._df(fd_min=2.0, fd_dm=35.0))
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.70, rel=1e-4)

    def test_max_conversion_asfed_to_dm(self):
        # 4.0 kg as-fed × 35% DM = 1.40 kg DM/day
        df = _prepare_feed_bound_columns(self._df(fd_max=4.0, fd_dm=35.0))
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(1.40, rel=1e-4)

    def test_both_bounds_converted(self):
        df = _prepare_feed_bound_columns(self._df(fd_min=1.0, fd_max=5.0, fd_dm=50.0))
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.50, rel=1e-4)
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(2.50, rel=1e-4)

    def test_nan_min_gives_zero_dm(self):
        df = _prepare_feed_bound_columns(self._df(fd_min=float("nan")))
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.0)

    def test_nan_max_gives_zero_dm(self):
        df = _prepare_feed_bound_columns(self._df(fd_max=float("nan")))
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(0.0)

    def test_zero_dm_pct_gives_zero_bounds(self):
        # If DM% is 0, DM bounds must be 0 (avoids divide-by-zero downstream)
        df = _prepare_feed_bound_columns(self._df(fd_min=2.0, fd_max=5.0, fd_dm=0.0))
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.0)
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(0.0)

    def test_columns_created_even_when_absent(self):
        df = _prepare_feed_bound_columns(self._df())
        assert "Fd_Min" in df.columns
        assert "Fd_Max" in df.columns
        assert "Fd_MinDM" in df.columns
        assert "Fd_MaxDM" in df.columns

    def test_multiple_rows_converted_independently(self):
        df = pd.DataFrame({
            "Fd_Name": ["Feed A", "Feed B"],
            "Fd_DM": [88.0, 35.0],
            "Fd_Min": [1.0, 2.0],
            "Fd_Max": [3.0, float("nan")],
        })
        df = _prepare_feed_bound_columns(df)
        assert df["Fd_MinDM"].iloc[0] == pytest.approx(0.88, rel=1e-4)
        assert df["Fd_MinDM"].iloc[1] == pytest.approx(0.70, rel=1e-4)
        assert df["Fd_MaxDM"].iloc[0] == pytest.approx(2.64, rel=1e-4)
        assert df["Fd_MaxDM"].iloc[1] == pytest.approx(0.0)


# ─────────────────────────────────────────────────────────────────────────────
# 4a. Optimizer — _get_explicit_dm_bounds
# ─────────────────────────────────────────────────────────────────────────────

class TestGetExplicitDmBounds:

    def test_absent_keys_return_zeros(self):
        f_nd = {}
        min_dm, max_dm = _get_explicit_dm_bounds(f_nd, n=3)
        assert np.all(min_dm == 0.0)
        assert np.all(max_dm == 0.0)
        assert min_dm.shape == (3,)

    def test_returns_correct_values(self):
        f_nd = {
            "Fd_MinDM": np.array([0.175, 0.0, 0.0]),
            "Fd_MaxDM": np.array([1.050, 0.0, 0.0]),
        }
        min_dm, max_dm = _get_explicit_dm_bounds(f_nd, n=3)
        assert min_dm[0] == pytest.approx(0.175)
        assert max_dm[0] == pytest.approx(1.050)
        assert min_dm[1] == pytest.approx(0.0)

    def test_nan_replaced_with_zero(self):
        f_nd = {
            "Fd_MinDM": np.array([float("nan"), 0.5]),
            "Fd_MaxDM": np.array([1.0, float("nan")]),
        }
        min_dm, max_dm = _get_explicit_dm_bounds(f_nd, n=2)
        assert min_dm[0] == pytest.approx(0.0)
        assert max_dm[1] == pytest.approx(0.0)


# ─────────────────────────────────────────────────────────────────────────────
# 4b. Optimizer — rsm_bounds_xlxu
# ─────────────────────────────────────────────────────────────────────────────

class TestRsmBoundsXlXu:

    def test_no_user_bounds_baseline(self):
        """Without any user bounds, xl should be all zeros and xu all ones for ingredients."""
        f_nd = _minimal_f_nd(n=3, trg=14.0)
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(14.0))
        # Ingredient slots: xl=0, xu=1
        assert np.all(xl[:3] == pytest.approx(0.0))
        assert np.all(xu[:3] == pytest.approx(1.0))
        # DMI slot: both pinned to target
        assert xl[-1] == pytest.approx(14.0)
        assert xu[-1] == pytest.approx(14.0)

    def test_min_bound_applied_to_xl(self):
        """Min = 0.5 kg as-fed, DM=35%, trg=14  →  xl[0] = (0.5×0.35)/14 = 0.0125"""
        f_nd = _minimal_f_nd(n=3, trg=14.0)
        f_nd["Fd_DM"] = np.array([35.0, 88.0, 88.0])
        f_nd["Fd_MinDM"] = np.array([0.175, 0.0, 0.0])  # 0.5 × 0.35
        f_nd["Fd_MaxDM"] = np.array([0.0, 0.0, 0.0])
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(14.0))
        assert xl[0] == pytest.approx(0.175 / 14.0, rel=1e-4)
        assert xl[1] == pytest.approx(0.0)

    def test_max_bound_applied_to_xu(self):
        """Max = 3.0 kg as-fed, DM=35%, trg=14  →  xu[0] = (3.0×0.35)/14 = 0.075"""
        f_nd = _minimal_f_nd(n=3, trg=14.0)
        f_nd["Fd_DM"] = np.array([35.0, 88.0, 88.0])
        f_nd["Fd_MinDM"] = np.array([0.0, 0.0, 0.0])
        f_nd["Fd_MaxDM"] = np.array([1.050, 0.0, 0.0])  # 3.0 × 0.35
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(14.0))
        assert xu[0] == pytest.approx(1.050 / 14.0, rel=1e-4)
        # Other ingredients untouched
        assert xu[1] == pytest.approx(1.0)

    def test_both_bounds_applied(self):
        f_nd = _minimal_f_nd(n=2, trg=14.0)
        f_nd["Fd_DM"] = np.array([35.0, 88.0])
        f_nd["Fd_MinDM"] = np.array([0.175, 0.0])
        f_nd["Fd_MaxDM"] = np.array([1.050, 0.0])
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(14.0))
        assert xl[0] == pytest.approx(0.175 / 14.0, rel=1e-4)
        assert xu[0] == pytest.approx(1.050 / 14.0, rel=1e-4)

    def test_unconstrained_ingredients_untouched(self):
        """Only ingredient 0 is bounded; ingredients 1 and 2 must be fully free."""
        f_nd = _minimal_f_nd(n=3, trg=14.0)
        f_nd["Fd_MinDM"] = np.array([0.175, 0.0, 0.0])
        f_nd["Fd_MaxDM"] = np.array([1.050, 0.0, 0.0])
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(14.0))
        assert xl[1] == pytest.approx(0.0)
        assert xl[2] == pytest.approx(0.0)
        assert xu[1] == pytest.approx(1.0)
        assert xu[2] == pytest.approx(1.0)

    def test_sum_of_mins_exceeds_dmi_raises(self):
        """User minimums that together exceed total DMI must raise ValueError."""
        trg = 14.0
        f_nd = _minimal_f_nd(n=3, trg=trg)
        # Three ingredients each requiring more than 1/3 of DMI → sum > 1.0
        f_nd["Fd_MinDM"] = np.array([6.0, 6.0, 6.0])
        f_nd["Fd_MaxDM"] = np.zeros(3)
        with pytest.raises(ValueError, match="minimum bounds exceed target DMI"):
            rsm_bounds_xlxu(f_nd, _animal_reqs(trg))

    def test_dmi_slot_always_pinned(self):
        """DMI slot (last) must always equal Trg_Dt_DMIn regardless of ingredient bounds."""
        f_nd = _minimal_f_nd(n=4, trg=18.5)
        xl, xu = rsm_bounds_xlxu(f_nd, _animal_reqs(18.5))
        assert xl[-1] == pytest.approx(18.5)
        assert xu[-1] == pytest.approx(18.5)


# ─────────────────────────────────────────────────────────────────────────────
# 4c. Optimizer — _project_to_bounded_simplex
# ─────────────────────────────────────────────────────────────────────────────

class TestProjectToBoundedSimplex:

    def test_sum_equals_one(self):
        v = np.array([0.5, 0.3, 0.2])
        lower = np.zeros(3)
        upper = np.ones(3)
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result.sum() == pytest.approx(1.0, abs=1e-8)

    def test_result_within_bounds(self):
        lower = np.array([0.1, 0.0, 0.0])
        upper = np.array([0.8, 0.5, 0.5])
        v = np.array([0.9, 0.05, 0.05])
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result.sum() == pytest.approx(1.0, abs=1e-8)
        assert np.all(result >= lower - 1e-8)
        assert np.all(result <= upper + 1e-8)

    def test_lower_bound_respected(self):
        """Ingredient 0 must be at least 0.2."""
        v = np.array([0.05, 0.5, 0.45])
        lower = np.array([0.2, 0.0, 0.0])
        upper = np.ones(3)
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result[0] >= 0.2 - 1e-8
        assert result.sum() == pytest.approx(1.0, abs=1e-8)

    def test_upper_bound_respected(self):
        """Ingredient 0 must be at most 0.3."""
        v = np.array([0.9, 0.05, 0.05])
        lower = np.zeros(3)
        upper = np.array([0.3, 1.0, 1.0])
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result[0] <= 0.3 + 1e-8
        assert result.sum() == pytest.approx(1.0, abs=1e-8)

    def test_already_feasible_unchanged(self):
        """A vector already on the bounded simplex should stay (nearly) unchanged."""
        v = np.array([0.2, 0.5, 0.3])
        lower = np.array([0.1, 0.0, 0.0])
        upper = np.array([0.9, 0.9, 0.9])
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result == pytest.approx(v, abs=1e-6)

    def test_infeasible_bounds_raise(self):
        """lower_sum > 1 is infeasible and must raise ValueError."""
        lower = np.array([0.5, 0.4, 0.3])  # sum = 1.2 > 1
        upper = np.ones(3)
        v = np.array([0.33, 0.33, 0.34])
        with pytest.raises(ValueError, match="Infeasible"):
            _project_to_bounded_simplex(v, lower, upper)

    def test_shape_mismatch_raises(self):
        with pytest.raises(ValueError):
            _project_to_bounded_simplex(
                np.array([0.5, 0.5]),
                np.zeros(3),
                np.ones(3),
            )

    def test_tight_lower_bounds_all_set(self):
        """All lower bounds active: result should equal lower (only feasible point)."""
        lower = np.array([0.4, 0.35, 0.25])  # sum = 1.0
        upper = np.ones(3)
        v = np.array([0.1, 0.1, 0.8])
        result = _project_to_bounded_simplex(v, lower, upper)
        assert result == pytest.approx(lower, abs=1e-6)
        assert result.sum() == pytest.approx(1.0, abs=1e-8)
