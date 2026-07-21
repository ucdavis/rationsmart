import uuid
from datetime import date, datetime
from typing import Annotated, Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    lactating: bool
    milk_production: float = Field(..., description="Litres per day")
    days_in_milk: int
    parity: int
    days_of_pregnancy: int
    tp_milk: float = Field(..., description="True protein % in milk")
    fat_milk: float = Field(..., description="Fat % in milk")
    temperature: float = Field(..., description="Ambient temperature °C")
    topography: str = Field(..., description="Flat or Hilly")
    distance: float = Field(..., description="Walking distance km")
    grazing: bool = Field(False)
    calving_interval: int = Field(..., description="Days")
    bw_gain: float = Field(0.2, description="Body weight gain kg/day")
    bc_score: float = Field(3.0, description="Body condition score 1–5")
    milk_price: Optional[float] = Field(None, ge=0, description="Milk sale price per litre, local currency")

    @field_validator('body_weight', 'milk_production', 'tp_milk', 'fat_milk', 'temperature', 'distance', 'bw_gain', 'bc_score', mode='before')
    @classmethod
    def round_floats(cls, v):
        return round(float(v), 2)

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
    min_kg_asfed: Optional[float] = Field(None, ge=0, description="Min inclusion kg/day as-fed (None = no lower bound)")
    max_kg_asfed: Optional[float] = Field(None, ge=0, description="Max inclusion kg/day as-fed (None = no upper bound)")

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
        return round(float(v), 3)

    def model_post_init(self, __context: Any) -> None:
        if self.min_kg_asfed is not None and self.max_kg_asfed is not None:
            if self.min_kg_asfed > self.max_kg_asfed:
                raise ValueError('min_kg_asfed must be ≤ max_kg_asfed')


# ── Diet thresholds ──────────────────────────────────────────────────────────

class BaseThresholds(BaseModel):
    ndf_max: Optional[float] = Field(None, description="Max Fiber % diet DM")
    starch_max: Optional[float] = Field(None, description="Max Starch % diet DM")
    ee_max: Optional[float] = Field(None, description="Max Fat % diet DM")
    ash_max: Optional[float] = Field(None, description="Max Ash % diet DM")

    @field_validator('ndf_max', 'starch_max', 'ee_max', 'ash_max', mode='before')
    @classmethod
    def round_floats(cls, v):
        if v is None:
            return None
        return round(float(v), 2)


# ── Diet recommendation ──────────────────────────────────────────────────────

class DietRecommendationRequest(BaseModel):
    simulation_id: str
    user_id: str
    country_id: str
    cattle_info: CattleInfo
    feed_selection: List[FeedWithPrice] = Field(..., description="Feeds with prices")
    base_thresholds: Optional[BaseThresholds] = None

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
    methane_intensity_g_per_kg_ecm: float
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
