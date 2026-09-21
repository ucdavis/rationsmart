import uuid
from datetime import date, datetime
from typing import Annotated, Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core.z_optimization.constraints_config import (
    CONSTRAINT_PROFILES,
    UI_THRESHOLD_SPEC,
    UI_THRESHOLD_UNIT_LABELS,
    to_engine_units,
    to_wire_units,
    ui_threshold_bounds,
    ui_threshold_widest_bounds,
)


# Canonical physiological states plus the aliases callers are allowed to use. Shared by
# CattleInfo and by GET /v1/animal/diet-thresholds so the two accept the same spellings.
PHYSIOLOGICAL_STATE_ALIASES = {
    "lactating cow": "Lactating Cow", "lactating": "Lactating Cow",
    "dry cow": "Dry Cow", "dry": "Dry Cow",
    "heifer": "Heifer",
    "baby calf/heifer": "Baby Calf/Heifer", "baby calf": "Baby Calf/Heifer",
    "calf": "Baby Calf/Heifer",
}


# Purpose: Map a caller-supplied physiological state onto its canonical spelling.
# Notes: Raises ValueError naming the four valid categories.
def normalise_physiological_state(value: Any) -> str:
    canonical = PHYSIOLOGICAL_STATE_ALIASES.get(str(value).strip().lower())
    if canonical is None:
        raise ValueError(
            "physiological_state must be one of: Lactating Cow, Dry Cow, Heifer, Baby Calf/Heifer"
        )
    return canonical


# ── Basic animal characteristics (legacy endpoint) ───────────────────────────

class AnimalCharacteristics(BaseModel):
    name: str
    country: str
    location: str
    language: str
    lactating: bool
    body_weight: float
    breed: str
    tp_milk: float
    fat_milk: float
    lactose_milk: float
    days_in_milk: int
    milk_production: float
    days_of_pregnancy: int
    calving_interval: int
    parity: int
    topography: str
    housing: str
    temperature: float
    feeds: List


# ── Cattle info (used in diet recommendation & evaluation) ───────────────────

class CattleInfo(BaseModel):
    body_weight: float = Field(..., description="Body weight in kg")
    breed: str
    physiological_state: str = Field(
        ...,
        description="Physiological state / animal category: Lactating Cow | Dry Cow | Heifer | Baby Calf/Heifer",
    )
    # Lactation drivers — required only for a Lactating Cow (enforced by the
    # model-validator below), default to 0 otherwise. The service layer additionally
    # forces them to 0 for any non-lactating state so the engine's 25 L milk default
    # (Trg_MilkProd_L) can never leak in. See the animal-category plan.
    milk_production: float = Field(0.0, description="Litres per day (required for Lactating Cow)")
    days_in_milk: int = Field(0, description="Days in milk (required for Lactating Cow)")
    tp_milk: float = Field(0.0, description="True protein % in milk (required for Lactating Cow)")
    fat_milk: float = Field(0.0, description="Fat % in milk (required for Lactating Cow)")
    # Lactation-context fields — optional with engine-matching defaults so non-lactating
    # states may omit them (the engine forces parity=0 for a Heifer regardless).
    parity: int = Field(0)
    days_of_pregnancy: int = Field(0)
    calving_interval: int = Field(0, description="Days")
    temperature: float = Field(..., description="Ambient temperature °C")
    topography: str = Field(..., description="Flat or Hilly")
    distance: float = Field(..., description="Walking distance km")
    grazing: bool = Field(False)
    bw_gain: float = Field(0.2, description="Body weight gain kg/day")
    bc_score: float = Field(3.0, description="Body condition score 1–5")
    milk_price: Optional[float] = Field(None, ge=0, description="Milk sale price per litre, local currency")

    @field_validator('body_weight', 'milk_production', 'tp_milk', 'fat_milk', 'temperature', 'distance', 'bw_gain', 'bc_score', mode='before')
    @classmethod
    def round_floats(cls, v):
        return round(float(v), 2)

    @field_validator('physiological_state', mode='before')
    @classmethod
    def validate_physiological_state(cls, v):
        """Normalize physiological_state to one of the four canonical categories.

        Accepts the canonical names case-insensitively plus common aliases
        (e.g. "lactating", "dry", "calf"); raises ValueError on anything else.
        """
        return normalise_physiological_state(v)

    @model_validator(mode='after')
    def _require_lactation_fields(self):
        """Require the milk fields only for a Lactating Cow.

        Milk drivers define a lactating cow's ration, so they are mandatory there;
        for every other state they are neutralized server-side and may be omitted.
        """
        if self.physiological_state == "Lactating Cow":
            missing = [
                f for f in ("milk_production", "days_in_milk", "tp_milk", "fat_milk")
                if f not in self.model_fields_set
            ]
            if missing:
                raise ValueError(
                    "milk_production, days_in_milk, tp_milk, fat_milk are required for a "
                    "Lactating Cow (missing: " + ", ".join(missing) + ")"
                )
        return self

    @field_validator('milk_price', mode='before')
    @classmethod
    def round_milk_price(cls, v):
        if v is None:
            return None
        return round(float(v), 2)

    @field_validator('topography', mode='before')
    @classmethod
    def validate_topography(cls, v):
        allowed = {"flat": "Flat", "hilly": "Hilly", "mountainous": "Mountainous"}
        canonical = allowed.get(str(v).strip().lower())
        if canonical is None:
            raise ValueError("topography must be one of: Flat, Hilly, Mountainous")
        return canonical

    def model_post_init(self, __context: Any) -> None:
        if self.grazing and self.distance < 1:
            raise ValueError('distance must be >= 1 km when grazing is enabled')


# ── Feed with price (diet recommendation input) ──────────────────────────────

class FeedWithPrice(BaseModel):
    feed_id: str = Field(..., description="Feed UUID")
    price_per_kg: float = Field(..., ge=0, description="Price per kg in local currency")
    min_kg_asfed: Optional[float] = Field(None, gt=0, description="Min inclusion kg/day as-fed (omit for no lower bound)")
    max_kg_asfed: Optional[float] = Field(None, gt=0, description="Max inclusion kg/day as-fed (omit for no upper bound)")

    @field_validator('price_per_kg', mode='before')
    @classmethod
    def round_price(cls, v):
        return round(float(v), 2)

    @field_validator('feed_id', mode='before')
    @classmethod
    def validate_feed_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('feed_id must be a valid UUID')

    @field_validator('min_kg_asfed', 'max_kg_asfed', mode='before')
    @classmethod
    def round_bounds(cls, v):
        if v is None:
            return None
        rounded = round(float(v), 3)
        # Zero is not "no limit". rsm_bounds_xlxu masks on `> 0`, so a zero bound is
        # dropped and the diet is solved as though the field had never been sent -- a
        # user who enters max 0 to exclude a feed gets that feed at full inclusion, with
        # nothing in the response to say so. Omitting the key is how "no limit" is
        # expressed; a zero can only be something the user typed, so reject it.
        #
        # Checked AFTER rounding, deliberately: 0.0004 passes a pre-rounding check and
        # then rounds to 0.0 on its way to the engine, which is the same silent bug.
        if rounded == 0:
            raise ValueError(
                'enter a value greater than 0, or omit the field for no limit'
            )
        return rounded

    def model_post_init(self, __context: Any) -> None:
        if self.min_kg_asfed is not None and self.max_kg_asfed is not None:
            if self.min_kg_asfed > self.max_kg_asfed:
                raise ValueError('min_kg_asfed must be ≤ max_kg_asfed')


# ── Diet thresholds ──────────────────────────────────────────────────────────

def _normalise_threshold(key: str, value: Any) -> Optional[float]:
    """Range-check one user-supplied threshold and convert it to engine units.

    The conversion is driven by the key's `unit` in UI_THRESHOLD_SPEC and is never
    applied uniformly: `pct_dm` values are divided by 100, while `mcal_day` and
    `kg_day` values are absolute and pass through. See UI_THRESHOLD_SPEC for why
    scaling nel_balance_max/mp_balance_max would make every diet infeasible.

    Returns None for an omitted field, which leaves the engine's profile default in
    place. Raises ValueError for a non-number or an out-of-range value.
    """
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be a number")

    # State-independent sanity bound: the widest range in use across every state.
    # BaseThresholds is nested and cannot see cattle_info, so the real per-animal bound
    # is applied by DietRecommendationRequest.enforce_state_bounds once the state is known.
    low, high = ui_threshold_widest_bounds(key)
    if not low <= numeric <= high:
        unit = UI_THRESHOLD_UNIT_LABELS[UI_THRESHOLD_SPEC[key]["unit"]]
        raise ValueError(f"{key} must be between {low:g} and {high:g} {unit}")

    return to_engine_units(key, numeric)


class BaseThresholds(BaseModel):
    """Caller overrides for the diet-wide nutrient limits.

    Values arrive as PERCENTAGES of dietary DM (15 means 15%) and are stored as the
    fractions the optimizer expects, because compute_adequacy compares
    `threshold * dmi_supply` against the diet total. Sending 15 unconverted would
    produce a 15 x DMI limit -- roughly 100x too loose, which silently disables the
    constraint rather than tightening it.

    An omitted field is not the same as a zero. Omitted means "keep the profile
    default for this animal's physiological state"; zero is rejected, because a zero
    limit makes compute_adequacy raise, which _evaluate swallows into a 1e6 penalty
    for every individual -- the solve degenerates and returns an arbitrary diet.
    """

    ndf_max: Optional[float] = Field(
        None, description="Max total fibre (NDF), % of diet DM (e.g. 60 for 60%)")
    starch_max: Optional[float] = Field(
        None, description="Max starch, % of diet DM (e.g. 26 for 26%)")
    ee_max: Optional[float] = Field(
        None, description="Max fat (ether extract), % of diet DM (e.g. 7 for 7%)")
    ash_max: Optional[float] = Field(
        None, description="Max ash, % of diet DM (e.g. 15 for 15%)")
    ndf_for_min: Optional[float] = Field(
        None, description="MINIMUM forage fibre (NDF from forage), % of diet DM (e.g. 20 for 20%)")
    conc_max: Optional[float] = Field(
        None, description="Max total concentrates, % of diet DM (e.g. 80 for 80%)")
    nel_balance_max: Optional[float] = Field(
        None, description="Max energy surplus over requirement, **Mcal/day** (e.g. 4.0) - not a percentage")
    mp_balance_max: Optional[float] = Field(
        None, description="Max metabolizable-protein surplus over requirement, **kg/day** (e.g. 1.0) - not a percentage")

    # A misspelled limit (`ash_maks`) would otherwise be dropped by Pydantic's default
    # `ignore`, and the diet would be solved against the default cap with nothing in the
    # response to say so -- the same silent failure as the `thresholds` alias below.
    # Forbidding extras is safe *here* and not on the enclosing models: callers send
    # annotation keys such as `_comment` and `_feed` at those levels, but never inside
    # base_thresholds.
    model_config = ConfigDict(extra="forbid")

    @field_validator(*UI_THRESHOLD_SPEC, mode='before')
    @classmethod
    def normalise(cls, v, info):
        """Convert each supplied limit from its wire unit to the engine's."""
        return _normalise_threshold(info.field_name, v)

    @model_validator(mode='after')
    def forage_fibre_floor_below_total_fibre(self):
        """A forage-NDF minimum above the total-NDF maximum is unsatisfiable.

        Reachable: ndf_for_min may be raised as far as ndf_max's *default* while ndf_max
        itself may be lowered to its floor, so a caller can ask for more forage fibre than
        total fibre. The result would be a diet that cannot exist.
        """
        if self.ndf_for_min is not None and self.ndf_max is not None:
            if self.ndf_for_min > self.ndf_max:
                raise ValueError(
                    "ndf_for_min (minimum forage fibre) cannot exceed ndf_max "
                    "(maximum total fibre)"
                )
        return self


# ── Diet threshold discovery (GET /v1/animal/diet-thresholds) ────────────────

class DietThresholdSpec(BaseModel):
    """One user-editable limit, described well enough for a client to render it."""

    key: str = Field(..., description="Field name to send inside `base_thresholds`")
    default: float = Field(..., description="Engine default for this animal, in `unit`")
    min: float = Field(
        ..., description="Smallest accepted value; equals `default` when `direction` is 'min'")
    max: float = Field(
        ..., description="Largest accepted value; equals `default` when `direction` is 'max'")
    unit: str = Field(..., description="pct_dm (% of diet DM) | mcal_day | kg_day")
    direction: str = Field(..., description="'max' for a ceiling, 'min' for a floor")
    enforcement: str = Field(
        ...,
        description=("hard = tightening may return no diet (INFEASIBLE); "
                     "soft = only penalised in the cost objective; "
                     "hard_after_switch = soft early in the solve, enforced as hard at the end"),
    )


class DietThresholdsResponse(BaseModel):
    physiological_state: str
    thresholds: List[DietThresholdSpec]


# ── Diet recommendation ──────────────────────────────────────────────────────

# Names that look like `base_thresholds` but are not. Pydantic ignores unknown keys, so
# without this guard a body using one of them returned 200 with the engine defaults
# silently applied and nothing in the response to say the limits had been dropped.
# extra="forbid" is not usable here: callers legitimately send annotation keys such as
# `_comment` and `_feed`.
_THRESHOLD_FIELD_ALIASES = ("thresholds", "base_threshold", "custom_thresholds")


class DietRecommendationRequest(BaseModel):
    simulation_id: str
    user_id: str
    country_id: str
    cattle_info: CattleInfo
    feed_selection: List[FeedWithPrice] = Field(..., description="Feeds with prices")
    base_thresholds: Optional[BaseThresholds] = None

    @model_validator(mode='after')
    def enforce_state_bounds(self):
        """Hold each supplied limit to the TIGHTEN-ONLY bound for this animal's state.

        `BaseThresholds` can only range-check against the widest range in use across every
        state, because a nested model cannot see `cattle_info`. Here the state is known, so
        each limit is held to that animal's own default -- a Heifer's ash ceiling is 13%
        where a Lactating Cow's is 15%.

        Direction matters: for a ceiling the default is the maximum, but for a floor such
        as `ndf_for_min` it is the *minimum*, because tightening a floor raises it.
        """
        supplied = {} if self.base_thresholds is None else {
            k: v for k, v in self.base_thresholds.model_dump().items() if v is not None
        }
        if not supplied:
            # An absent or empty object overrides nothing, so there is nothing to check --
            # and nothing to complain about, even for a calf.
            return self

        state = self.cattle_info.physiological_state
        if state not in CONSTRAINT_PROFILES:
            # Baby Calf/Heifer has no constraint profile by design -- it is answered with a
            # milk-feeding schedule before the optimizer runs, so nutrient limits mean
            # nothing for it. Say so rather than accepting values that would be dropped.
            raise ValueError(
                f"base_thresholds is not applicable to '{state}'; it is fed a milk "
                f"schedule rather than a formulated ration"
            )

        for key, engine_value in supplied.items():
            wire_value = to_wire_units(key, engine_value)
            low, high = ui_threshold_bounds(key, state)
            if low <= wire_value <= high:
                continue
            # Each end means something different, so name it accurately: only the
            # tighten-only end is this key's own default. Branch on direction explicitly --
            # `ceiling_key` exists only on floors, and a condensed form here was misread in
            # review as reaching it for a ceiling.
            spec = UI_THRESHOLD_SPEC[key]
            unit = UI_THRESHOLD_UNIT_LABELS[spec["unit"]]
            tighten_only = "custom limits may only tighten a limit, not loosen it"

            if spec["direction"] == "min":
                # A floor. Its own default is the minimum; the most it can be is the
                # ceiling_key default, which it cannot physically exceed.
                if wire_value < low:
                    why = f"its default for a {state}; {tighten_only}"
                    bound, word = low, "at least"
                else:
                    why = f"the {spec['ceiling_key']} default for a {state}, which it cannot exceed"
                    bound, word = high, "at most"
            else:
                # A ceiling. Its own default is the maximum; the floor is a fixed safety
                # guard, identical for every state and already applied by BaseThresholds.
                if wire_value > high:
                    why = f"its default for a {state}; {tighten_only}"
                    bound, word = high, "at most"
                else:
                    why = "the lowest value the optimizer can work with"
                    bound, word = low, "at least"
            raise ValueError(f"{key} must be {word} {bound:g} {unit} - {why}")
        return self

    @model_validator(mode='before')
    @classmethod
    def reject_threshold_aliases(cls, data):
        """Fail on a misnamed thresholds key rather than silently ignoring it."""
        if isinstance(data, dict):
            wrong = [k for k in _THRESHOLD_FIELD_ALIASES if k in data]
            if wrong:
                raise ValueError(
                    f"unknown field(s): {', '.join(wrong)}. Nutrient limit overrides go in "
                    f"'base_thresholds'"
                )
        return data

    @field_validator('user_id', mode='before')
    @classmethod
    def validate_user_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('user_id must be a valid UUID')

    @field_validator('country_id', mode='before')
    @classmethod
    def validate_country_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('country_id must be a valid UUID')


class AnimalCharacteristicItem(BaseModel):
    characteristic: str
    value: Union[str, float, int]
    unit: str


class AnimalCharacteristicsData(BaseModel):
    characteristics: List[AnimalCharacteristicItem]
    requirements: List[AnimalCharacteristicItem]


class SelectedFeedItem(BaseModel):
    name: str
    category: str
    type: str
    dm_kg: float
    af_kg: float
    dm_pct: float
    cost_per_kg: float
    total_cost: float


class CategoryBreakdownItem(BaseModel):
    category: str
    dm_kg: float
    percentage: float
    cost: float


class DietSummaryDetailed(BaseModel):
    selected_feeds: List[SelectedFeedItem]
    total_dm: float
    total_cost: float
    category_breakdown: List[CategoryBreakdownItem]


class DietRecommendationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    simulation_id: str
    report_id: str
    animal_characteristics: AnimalCharacteristicsData
    diet_summary_detailed: DietSummaryDetailed
    diet_summary: Dict[str, Any]
    nutrient_comparison: Dict[str, Any]
    animal_requirements: Dict[str, Any]
    solution_status: str
    confidence_level: str
    total_cost: float
    water_intake: float
    methane_emissions: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    optimization_details: Dict[str, Any]
    ration_evaluation: Dict[str, Any]


# ── Diet evaluation ──────────────────────────────────────────────────────────

class FeedEvaluationItem(BaseModel):
    feed_id: str
    quantity_as_fed: float = Field(..., gt=0, description="kg/day as-fed")
    price_per_kg: float = Field(..., ge=0)

    @field_validator('quantity_as_fed', 'price_per_kg', mode='before')
    @classmethod
    def round_floats(cls, v):
        return round(float(v), 2)

    @field_validator('feed_id', mode='before')
    @classmethod
    def validate_feed_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('feed_id must be a valid UUID')


class DietEvaluationRequest(BaseModel):
    user_id: str
    country_id: str
    simulation_id: str
    currency: str = Field(..., max_length=3, description="e.g. INR, USD")
    cattle_info: CattleInfo
    feed_evaluation: Annotated[List[FeedEvaluationItem], Field(min_length=1)]

    @field_validator('user_id', mode='before')
    @classmethod
    def validate_user_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('user_id must be a valid UUID')

    @field_validator('country_id', mode='before')
    @classmethod
    def validate_country_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError('country_id must be a valid UUID')

    @field_validator('currency', mode='before')
    @classmethod
    def validate_currency(cls, v):
        import re
        if not re.match(r'^[A-Z]{3}$', v):
            raise ValueError('currency must be a 3-letter code (e.g. INR, USD)')
        return v


class MilkProductionAnalysis(BaseModel):
    target_production_kg_per_day: float
    milk_supported_by_energy_kg_per_day: float
    milk_supported_by_protein_kg_per_day: float
    actual_milk_supported_kg_per_day: float
    limiting_nutrient: str
    energy_available_mcal: float
    protein_available_g: float
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class IntakeEvaluation(BaseModel):
    intake_status: str
    actual_intake_kg_per_day: float
    target_intake_kg_per_day: float
    intake_difference_kg_per_day: float
    intake_percentage: float
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class CostAnalysis(BaseModel):
    total_diet_cost_as_fed: float
    feed_cost_per_kg_milk: float
    currency: str
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class MethaneAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    methane_emission_mj_per_day: float
    methane_production_g_per_day: float
    methane_yield_g_per_kg_dmi: float
    # None for a non-lactating state -- the metric is undefined for an animal with no
    # ECM (energy-corrected milk), not merely "not calculated". See
    # docs/defects/methane-intensity-non-lactating-implementation-plan.md.
    methane_intensity_g_per_kg_ecm: Optional[float] = None
    ym_percent: float = Field(..., alias="Ym (%)")
    classification: str
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class NutrientBalance(BaseModel):
    energy_balance_mcal: float
    protein_balance_kg: float
    calcium_balance_kg: float
    phosphorus_balance_kg: float
    ndf_balance_kg: float
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class FeedBreakdownItem(BaseModel):
    feed_id: str
    feed_name: str
    feed_type: str
    quantity_as_fed_kg_per_day: float
    quantity_dm_kg_per_day: float
    price_per_kg: float
    total_cost: float
    contribution_percent: float


class DietEvaluationSummary(BaseModel):
    overall_status: str
    limiting_factor: str


class DietEvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    simulation_id: str
    report_id: str
    currency: str
    country: str
    evaluation_summary: DietEvaluationSummary
    milk_production_analysis: MilkProductionAnalysis
    intake_evaluation: IntakeEvaluation
    cost_analysis: CostAnalysis
    methane_analysis: MethaneAnalysis
    nutrient_balance: NutrientBalance
    feed_breakdown: List[FeedBreakdownItem]
    animal_information: Optional[Dict[str, Any]] = None


# ── Feed analytics ───────────────────────────────────────────────────────────

class FeedAnalyticsBase(BaseModel):
    da_name: str = Field(..., max_length=100)
    da_phone_num: str = Field(..., max_length=100)
    country_cd: str = Field(..., max_length=3)
    country_name: str = Field(..., max_length=100)
    animal_info: str
    sys_rcmd: str
    cust_rcmd: str
    farmer_name: str
    farmer_phone_num: str = Field(..., max_length=100)
    rcmd_dt: date
    farmer_adopted: Optional[bool] = None


class FeedAnalyticsCreate(FeedAnalyticsBase):
    pass


class FeedAnalyticsUpdate(BaseModel):
    da_name: Optional[str] = Field(None, max_length=100)
    da_phone_num: Optional[str] = Field(None, max_length=100)
    country_cd: Optional[str] = Field(None, max_length=3)
    country_name: Optional[str] = Field(None, max_length=100)
    animal_info: Optional[str] = None
    sys_rcmd: Optional[str] = None
    cust_rcmd: Optional[str] = None
    farmer_name: Optional[str] = None
    farmer_phone_num: Optional[str] = Field(None, max_length=100)
    rcmd_dt: Optional[date] = None
    farmer_adopted: Optional[bool] = None


class FeedAnalyticsResponse(FeedAnalyticsBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_on: datetime
    updated_on: datetime

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        return str(v) if v else v

    @field_validator('rcmd_dt', mode='before')
    @classmethod
    def convert_date(cls, v):
        if isinstance(v, date):
            return v.isoformat()
        return v
