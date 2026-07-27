"""
Diet service for RationSmart v4.0.

Orchestrates: feed lookup → NSGA-III optimization → response build → report persist.
PDF generation and S3 upload are triggered as background tasks (Task 2.8).

No FastAPI imports. All DB access goes through repositories.
"""
import dataclasses
import logging
import uuid as _uuid_mod
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CustomFeed, Feed, FeedAnalytics, Report
from repositories.feed_repository import FeedRepository
from repositories.report_repository import ReportRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ── Feed record ───────────────────────────────────────────────────────────────

@dataclass
class FeedRecord:
    """Typed bridge between ORM feed objects and the optimizer's dict interface."""
    feed_id: str
    fd_name: str
    fd_type: str = ""
    fd_category: str = ""
    fd_country_name: str = ""
    fd_code: Optional[str] = None
    fd_dm: float = 0.0
    fd_ash: float = 0.0
    fd_cp: float = 0.0
    fd_npn_cp: float = 0.0
    fd_ee: float = 0.0
    fd_cf: float = 0.0
    fd_nfe: float = 0.0
    fd_st: float = 0.0
    fd_ndf: float = 0.0
    fd_hemicellulose: float = 0.0
    fd_adf: float = 0.0
    fd_cellulose: float = 0.0
    fd_lg: float = 0.0
    fd_ndin: float = 0.0
    fd_adin: float = 0.0
    fd_ca: float = 0.0
    fd_p: float = 0.0
    price_per_kg: float = 0.0
    quantity_as_fed: Optional[float] = None
    fd_min: Optional[float] = None   # as-fed min kg/day from feed card toggle (None = no bound)
    fd_max: Optional[float] = None   # as-fed max kg/day from feed card toggle (None = no bound)

    @classmethod
    def from_orm(
        cls,
        feed: Any,
        fid: str,
        country_name: str = "",
        price_per_kg: float = 0.0,
        quantity_as_fed: Optional[float] = None,
        fd_min: Optional[float] = None,
        fd_max: Optional[float] = None,
    ) -> "FeedRecord":
        return cls(
            feed_id=fid,
            fd_name=feed.fd_name or "",
            fd_type=feed.fd_type or "",
            fd_category=feed.fd_category or "",
            fd_country_name=feed.fd_country_name or country_name,
            fd_code=getattr(feed, "fd_code", None),
            fd_dm=float(feed.fd_dm or 0),
            fd_ash=float(feed.fd_ash or 0),
            fd_cp=float(feed.fd_cp or 0),
            fd_npn_cp=float(feed.fd_npn_cp or 0),
            fd_ee=float(feed.fd_ee or 0),
            fd_cf=float(feed.fd_cf or 0),
            fd_nfe=float(feed.fd_nfe or 0),
            fd_st=float(feed.fd_st or 0),
            fd_ndf=float(feed.fd_ndf or 0),
            fd_hemicellulose=float(feed.fd_hemicellulose or 0),
            fd_adf=float(feed.fd_adf or 0),
            fd_cellulose=float(feed.fd_cellulose or 0),
            fd_lg=float(feed.fd_lg or 0),
            fd_ndin=float(feed.fd_ndin or 0),
            fd_adin=float(feed.fd_adin or 0),
            fd_ca=float(feed.fd_ca or 0),
            fd_p=float(feed.fd_p or 0),
            price_per_kg=price_per_kg,
            quantity_as_fed=quantity_as_fed,
            fd_min=fd_min,
            fd_max=fd_max,
        )


# ── Feed lookup helpers ───────────────────────────────────────────────────────

async def get_feed_details(
    db: AsyncSession, feed_id: str, user_id: str, lang: str = "en"
) -> Optional[Dict[str, Any]]:
    """Look up a feed by ID (standard or custom) with optional localized display fields.

    Returns a dict with nutrient fields + display_name/display_type/display_category, or None.

    Nutrient columns are Postgres NUMERIC and may hold the literal value ``NaN``;
    ``float(Decimal('NaN'))`` is ``nan``, which Starlette's JSONResponse rejects
    (``allow_nan=False``) and turns into a 500. The result is passed through
    ``ensure_json_safe`` (NaN/inf -> 0.0), matching how the recommendation/eval
    responses are already sanitized.
    """
    from core.z_optimization.utilities import ensure_json_safe

    repo = FeedRepository(db)
    user_repo = UserRepository(db)

    # Try standard feed first (get_by_id_localized returns None if not found)
    row = await repo.get_by_id_localized(feed_id, lang=lang)
    if row is not None:
        feed = row.Feed
        display_name = row.display_name
        display_type = row.display_type
        display_category = row.display_category
    else:
        feed = await repo.get_custom_by_id(feed_id, user_id)
        if feed is None:
            return None
        display_name = feed.fd_name
        display_type = feed.fd_type
        display_category = feed.fd_category

    country_name = ""
    if feed.fd_country_id:
        country = await user_repo.get_country_by_id(str(feed.fd_country_id))
        country_name = country.name if country else ""

    return ensure_json_safe({
        "feed_id": str(feed.id),
        "fd_code": getattr(feed, "fd_code", None),
        "fd_name": feed.fd_name,
        "fd_type": feed.fd_type,
        "fd_category": feed.fd_category,
        "display_name": display_name,
        "display_type": display_type,
        "display_category": display_category,
        "fd_country_name": feed.fd_country_name,
        "fd_country_cd": feed.fd_country_cd,
        "country_name": country_name,
        "fd_dm": float(feed.fd_dm or 0),
        "fd_ash": float(feed.fd_ash or 0),
        "fd_cp": float(feed.fd_cp or 0),
        "fd_npn_cp": float(feed.fd_npn_cp or 0),
        "fd_ee": float(feed.fd_ee or 0),
        "fd_cf": float(feed.fd_cf or 0),
        "fd_nfe": float(feed.fd_nfe or 0),
        "fd_st": float(feed.fd_st or 0),
        "fd_ndf": float(feed.fd_ndf or 0),
        "fd_hemicellulose": float(feed.fd_hemicellulose or 0),
        "fd_adf": float(feed.fd_adf or 0),
        "fd_cellulose": float(feed.fd_cellulose or 0),
        "fd_lg": float(feed.fd_lg or 0),
        "fd_ndin": float(feed.fd_ndin or 0),
        "fd_adin": float(feed.fd_adin or 0),
        "fd_ca": float(feed.fd_ca or 0),
        "fd_p": float(feed.fd_p or 0),
    })


async def search_feeds(
    db: AsyncSession,
    query: str,
    country_id: str,
    user_id: str,
    limit: int = 20,
    lang: str = "en",
) -> Tuple[List[Dict[str, Any]], int]:
    """Typeahead feed search scoped to country + user's custom feeds.

    Returns (feed_list, total_count).
    Short queries (< 2 chars) return ([], 0) with no DB hit.
    Ranking: custom feeds first, then prefix matches, then alphabetical.
    feed_name / feed_type / feed_category are the localized display values (I2).
    """
    if len(query.strip()) < 2:
        return [], 0

    repo = FeedRepository(db)
    std_rows, custom_feeds, total_count = await repo.search_feeds(
        query=query.strip(),
        country_id=country_id,
        user_id=user_id,
        limit=limit,
        lang=lang,
    )

    q_lower = query.strip().lower()

    def _rank(name: str, is_custom: bool) -> tuple:
        return (0 if is_custom else 1, 0 if name.lower().startswith(q_lower) else 1, name.lower())

    results = []
    for f in custom_feeds:
        results.append({
            "feed_uuid": str(f.id),
            "feed_name": f.fd_name,
            "feed_type": f.fd_type or "",
            "feed_category": f.fd_category or "",
            "fd_code": getattr(f, "fd_code", None),
            "is_custom": True,
        })
    for row in std_rows:
        results.append({
            "feed_uuid": str(row.Feed.id),
            "feed_name": row.display_name,
            "feed_type": row.display_type or "",
            "feed_category": row.display_category or "",
            "fd_code": row.Feed.fd_code,
            "is_custom": False,
        })

    results.sort(key=lambda r: _rank(r["feed_name"], r["is_custom"]))
    return results[:limit], total_count


async def _build_feed_data_list(
    db: AsyncSession,
    feed_selection: List[Any],
    user_id: str,
) -> Tuple[List[Dict], List[str]]:
    """
    Resolve feed UUIDs to nutrient dicts for the optimizer.
    Returns (feed_data_list, missing_ids).
    """
    feed_repo = FeedRepository(db)
    ids = [item.feed_id for item in feed_selection]

    std_map = {str(f.id): f for f in await feed_repo.get_by_ids(ids)}
    cust_map = {str(f.id): f for f in await feed_repo.get_custom_by_ids(ids)}
    user_repo = UserRepository(db)

    feed_data_list = []
    missing = []
    for item in feed_selection:
        fid = item.feed_id
        feed = std_map.get(fid) or cust_map.get(fid)
        if feed is None:
            missing.append(fid)
            continue

        country_name = ""
        if feed.fd_country_id:
            c = await user_repo.get_country_by_id(str(feed.fd_country_id))
            country_name = c.name if c else ""

        rec = FeedRecord.from_orm(
            feed, fid, country_name,
            price_per_kg=item.price_per_kg,
            fd_min=getattr(item, 'min_kg_asfed', None),
            fd_max=getattr(item, 'max_kg_asfed', None),
        )
        feed_data_list.append(dataclasses.asdict(rec))
    return feed_data_list, missing


# ── Animal-input helpers ──────────────────────────────────────────────────────

def _neutralize_lactation_fields(animal_inputs: Dict[str, Any], physiological_state: str) -> Dict[str, Any]:
    """Force lactation drivers to 0 for any non-lactating state, in place.

    Safety rule for the animal-category feature: the engine defaults
    ``Trg_MilkProd_L`` to 25 L when absent and folds lactation energy/protein/minerals
    in whenever milk > 0 (not gated by state). Since the milk fields are optional for
    non-lactating states, we zero them here — server-side so it cannot be bypassed —
    rather than relying on the caller to send 0. Returns the same dict for convenience.
    """
    if physiological_state != "Lactating Cow":
        animal_inputs["milk_production"] = 0   # Trg_MilkProd_L -> 0 (zeros An_NELlact, An_MPl, milk minerals)
        animal_inputs["days_in_milk"] = 0       # An_LactDay
        animal_inputs["tp_milk"] = 0             # Trg_MilkTPp
        animal_inputs["fat_milk"] = 0            # Trg_MilkFatp
    return animal_inputs


async def _run_baby_calf_recommendation(db: AsyncSession, request: Any, user_id: str) -> Dict[str, Any]:
    """Baby Calf/Heifer recommendation: return the milk-feeding schedule directly.

    A baby calf has no least-cost solid-feed ration to solve — the recommendation IS
    the milk-feeding schedule the requirements path already produces. We compute the
    requirements without touching the optimizer (which has no calf constraint profile),
    build the calf response, persist a Report row, and return. Caller-facing behavior
    mirrors run_diet_recommendation (commits before returning).
    """
    from core.z_optimization.animal_requirements import rsm_calculate_an_requirements
    from core.z_optimization.reporting import build_calf_recommendation_response

    cattle = request.cattle_info
    animal_inputs = {
        "body_weight": cattle.body_weight,
        "breed": cattle.breed,
        "An_StatePhys": cattle.physiological_state,
        "milk_production": 0,
        "days_in_milk": 0,
        "parity": 0,
        "days_of_pregnancy": cattle.days_of_pregnancy,
        "tp_milk": 0,
        "fat_milk": 0,
        "temperature": cattle.temperature,
        "topography": cattle.topography,
        "distance": cattle.distance,
        "grazing": cattle.grazing,
        "calving_interval": cattle.calving_interval,
        "bw_gain": cattle.bw_gain,
        "bc_score": cattle.bc_score,
    }
    animal_requirements = rsm_calculate_an_requirements(animal_inputs)

    report_id = f"rec-{_uuid_mod.uuid4().hex[:8]}"
    response = build_calf_recommendation_response(
        animal_requirements=animal_requirements,
        cattle_info=cattle,
        simulation_id=request.simulation_id,
        report_id=report_id,
    )

    report_repo = ReportRepository(db)
    await report_repo.delete_unsaved_for_user(user_id)
    new_report = Report(
        report_id=report_id,
        report_type="rec",
        simulation_id=request.simulation_id,
        user_id=_uuid_mod.UUID(user_id),
        country_id=_uuid_mod.UUID(request.country_id) if request.country_id else None,
        animal_inputs=animal_inputs,
        feed_selection=[],
        custom_constraints=None,
        json_result=response,
        save_report=False,
        saved_to_bucket=False,
    )
    await report_repo.save(new_report)
    await db.commit()
    return response


# ── Diet recommendation ───────────────────────────────────────────────────────

async def run_diet_recommendation(
    db: AsyncSession,
    pool: ProcessPoolExecutor,
    request: Any,
    user_id: str,
    lang: str = "en",
) -> Dict[str, Any]:
    """
    Full diet recommendation pipeline:
      1. Resolve feeds from DB
      2. Run NSGA-III in the process pool (off the async event loop)
      3. Build and persist the Report record
      4. Return the API response dict

    PDF generation (Task 2.8) is triggered separately as a background task.
    """
    import asyncio

    from core.z_optimization.nsga3_runner import z_optimization_main
    from core.z_optimization.reporting import build_diet_response

    cattle = request.cattle_info

    # Baby Calf/Heifer: no least-cost solid-feed ration to solve — the recommendation
    # IS the milk-feeding schedule. Short-circuit before feed resolution and the
    # optimizer (which has no calf constraint profile and would raise).
    if cattle.physiological_state == "Baby Calf/Heifer":
        return await _run_baby_calf_recommendation(db, request, user_id)

    # 1 — Resolve feeds
    feed_data_list, missing = await _build_feed_data_list(db, request.feed_selection, user_id)
    if not feed_data_list:
        raise ValueError("No valid feeds found for the provided feed IDs.")
    if missing:
        logger.warning("Missing feed IDs (skipped): %s", missing)

    # 2 — Build animal inputs for the optimizer
    animal_inputs = {
        "body_weight": cattle.body_weight,
        "breed": cattle.breed,
        "An_StatePhys": cattle.physiological_state,   # always present (required, validated)
        "milk_production": cattle.milk_production,
        "days_in_milk": cattle.days_in_milk,
        "parity": cattle.parity,
        "days_of_pregnancy": cattle.days_of_pregnancy,
        "tp_milk": cattle.tp_milk,
        "fat_milk": cattle.fat_milk,
        "temperature": cattle.temperature,
        "topography": cattle.topography,
        "distance": cattle.distance,
        "grazing": cattle.grazing,
        "calving_interval": cattle.calving_interval,
        "bw_gain": cattle.bw_gain,
        "bc_score": cattle.bc_score,
        "milk_price": cattle.milk_price,
    }
    # Zero the lactation drivers for Dry Cow / Heifer so the engine's 25 L milk
    # default cannot leak in (see _neutralize_lactation_fields).
    _neutralize_lactation_fields(animal_inputs, cattle.physiological_state)

    custom_thresholds = None
    if request.base_thresholds:
        t = request.base_thresholds
        custom_thresholds = {
            k: v for k, v in {
                "ndf_max": t.ndf_max,
                "starch_max": t.starch_max,
                "ee_max": t.ee_max,
                "ash_max": t.ash_max,
            }.items() if v is not None
        }

    # 3 — Run optimizer in process pool.
    # NOTE: bind with functools.partial so custom_thresholds reaches its real
    # keyword parameter. Passing it positionally lands it in z_optimization_main's
    # `simulation_id` slot, leaving custom_thresholds=None and silently ignoring
    # client-supplied nutrient thresholds (see PR #0 / plan §5).
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        pool,
        partial(
            z_optimization_main,
            animal_inputs,
            feed_data_list,
            custom_thresholds=custom_thresholds,
        ),
    )

    # A blocking pre-check means the request itself is unsafe to optimize (e.g. an
    # inclusion minimum that forces urea past its hard safety limit). Surface it as a
    # 400 naming the offending ingredient rather than a 200 with an empty diet — the
    # router maps ValueError to HTTP 400.
    if getattr(result, "blocking", False):
        raise ValueError(result.error_message or "Request rejected by pre-check.")

    # 4 — Build API response
    # reporting.py uses dict-access; convert OptimizationResult to a compat dict.
    report_id = f"rec-{_uuid_mod.uuid4().hex[:8]}"
    # Carry milk_price into post_results so the background HTML/PDF generator
    # (which receives post_results, not cattle_info) can render the margin card.
    post_results = result.post_results if isinstance(result.post_results, dict) else {}
    post_results["milk_price"] = cattle.milk_price
    result_dict = {
        "status": result.status,
        "post_results": post_results,
        "animal_requirements": result.animal_requirements,
        "simulation_id": request.simulation_id,
        "report_id": report_id,
    }
    currency = "$"
    try:
        row = await db.execute(
            text("SELECT currency FROM country WHERE id = :cid"),
            {"cid": request.country_id},
        )
        val = row.scalar_one_or_none()
        if val:
            currency = val
    except Exception:
        pass

    # Localize feed names at response-build time (main process — the pool worker
    # has no DB session). {english_fd_name: translated_name} from feed_translations.
    name_map: Dict[str, str] = {}
    if lang != "en":
        id_name_map = await FeedRepository(db).get_name_translation_map(
            [f["feed_id"] for f in feed_data_list], lang
        )
        name_map = {
            f["fd_name"]: id_name_map[f["feed_id"]]
            for f in feed_data_list
            if f["feed_id"] in id_name_map
        }

    response = build_diet_response(
        optimization_results=result_dict,
        cattle_info=request.cattle_info,
        simulation_id=request.simulation_id,
        report_id=report_id,
        user_name="",
        currency=currency,
        name_map=name_map,
    )

    # 5 — Persist report record (no PDF yet — Task 2.8 adds that)
    country_id = request.country_id
    report_repo = ReportRepository(db)
    await report_repo.delete_unsaved_for_user(user_id)

    new_report = Report(
        report_id=report_id,
        report_type="rec",
        simulation_id=request.simulation_id,
        user_id=_uuid_mod.UUID(user_id),
        country_id=_uuid_mod.UUID(country_id) if country_id else None,
        animal_inputs=animal_inputs,
        feed_selection=[
            {"feed_id": f["feed_id"], "price_per_kg": f["price_per_kg"]}
            for f in feed_data_list
        ],
        custom_constraints=custom_thresholds,
        json_result=response,
        save_report=False,
        saved_to_bucket=False,
    )
    await report_repo.save(new_report)
    await db.commit()

    return response


# ── Diet evaluation ───────────────────────────────────────────────────────────

async def run_diet_evaluation(
    db: AsyncSession,
    request: Any,
    user_id: str,
    lang: str = "en",
) -> Dict[str, Any]:
    """
    Evaluate a user-supplied diet against calculated animal requirements.
    Persists a Report record (type='eval') and returns the response dict.
    Caller must commit.
    """
    from core.z_optimization.evaluation import evaluate_diet
    from core.z_optimization.reporting import build_evaluation_response

    # A baby calf has no solid ration to evaluate — reject before running the cow/heifer
    # pipeline (which would otherwise return a misleading report: milk-supported computed
    # against a defaulted milk target, methane forced to 0, calf schedule discarded).
    # The router maps this ValueError to HTTP 400.
    if request.cattle_info.physiological_state == "Baby Calf/Heifer":
        raise ValueError(
            "evaluation is not applicable to baby calves — no solid ration to evaluate"
        )

    feed_repo = FeedRepository(db)
    user_repo = UserRepository(db)
    ids = [item.feed_id for item in request.feed_evaluation]
    std_map = {str(f.id): f for f in await feed_repo.get_by_ids(ids)}
    cust_map = {str(f.id): f for f in await feed_repo.get_custom_by_ids(ids)}

    feed_data_list = []
    for item in request.feed_evaluation:
        fid = item.feed_id
        feed = std_map.get(fid) or cust_map.get(fid)
        if feed is None:
            continue
        rec = FeedRecord.from_orm(
            feed, fid, price_per_kg=item.price_per_kg, quantity_as_fed=item.quantity_as_fed
        )
        feed_data_list.append(dataclasses.asdict(rec))

    cattle = request.cattle_info
    animal_inputs = {
        "body_weight": cattle.body_weight,
        "breed": cattle.breed,
        "An_StatePhys": cattle.physiological_state,   # always present (required, validated)
        "milk_production": cattle.milk_production,
        "days_in_milk": cattle.days_in_milk,
        "parity": cattle.parity,
        "days_of_pregnancy": cattle.days_of_pregnancy,
        "tp_milk": cattle.tp_milk,
        "fat_milk": cattle.fat_milk,
        "temperature": cattle.temperature,
        "topography": cattle.topography,
        "distance": cattle.distance,
        "grazing": cattle.grazing,
        "calving_interval": cattle.calving_interval,
        "bw_gain": cattle.bw_gain,
        "bc_score": cattle.bc_score,
        "milk_price": cattle.milk_price,
    }
    # Zero the lactation drivers for Dry Cow / Heifer so the engine's 25 L milk
    # default cannot leak in (see _neutralize_lactation_fields).
    _neutralize_lactation_fields(animal_inputs, cattle.physiological_state)

    country = await user_repo.get_country_by_id(request.country_id)
    country_name = country.name if country else ""

    ingredient_amounts_af = [f["quantity_as_fed"] or 0.0 for f in feed_data_list]
    eval_result = evaluate_diet(animal_inputs, ingredient_amounts_af, feed_data_list=feed_data_list)
    # Carry milk_price into post_results for the background HTML/PDF margin card.
    if isinstance(eval_result, dict):
        eval_post = eval_result.get("post_results")
        if isinstance(eval_post, dict):
            eval_post["milk_price"] = cattle.milk_price
    # Localize feed names (feed_translations) and feed types (vocabulary_translations,
    # country-scoped) at response-build time. Display layer only — the engine's
    # internal English names stay English.
    name_map: Dict[str, str] = {}
    type_map: Dict[str, str] = {}
    if lang != "en":
        repo = FeedRepository(db)
        id_name_map = await repo.get_name_translation_map(
            [f["feed_id"] for f in feed_data_list], lang
        )
        name_map = {
            f["fd_name"]: id_name_map[f["feed_id"]]
            for f in feed_data_list
            if f["feed_id"] in id_name_map
        }
        type_map = await repo.get_vocabulary_translation_map(
            request.country_id, "feed_type", lang,
            [f["fd_type"] for f in feed_data_list if f.get("fd_type")],
        )

    report_id = f"eval-{_uuid_mod.uuid4().hex[:8]}"
    response = build_evaluation_response(
        evaluation_results=eval_result,
        cattle_info=request.cattle_info,
        simulation_id=request.simulation_id,
        report_id=report_id,
        currency=request.currency,
        country_name=country_name,
        feed_evaluation=request.feed_evaluation,
        feeds=feed_data_list,
        name_map=name_map,
        type_map=type_map,
    )

    report_repo = ReportRepository(db)
    await report_repo.delete_unsaved_for_user(user_id)

    new_report = Report(
        report_id=report_id,
        report_type="eval",
        simulation_id=request.simulation_id,
        user_id=_uuid_mod.UUID(user_id),
        country_id=_uuid_mod.UUID(request.country_id) if request.country_id else None,
        animal_inputs=animal_inputs,
        feed_selection=[
            {"feed_id": f["feed_id"], "price_per_kg": f["price_per_kg"], "quantity_as_fed": f["quantity_as_fed"]}
            for f in feed_data_list
        ],
        json_result=response,
        save_report=False,
        saved_to_bucket=False,
    )
    await report_repo.save(new_report)
    return response


# ── Feed analytics ────────────────────────────────────────────────────────────

async def save_feed_analytics(db: AsyncSession, data: Dict[str, Any]) -> FeedAnalytics:
    """Persist a feed analytics record. Caller must commit."""
    record = FeedAnalytics(**data)
    await ReportRepository(db).save_feed_analytics(record)
    return record


# ── Custom feed operations ────────────────────────────────────────────────────

async def get_unique_feed_types(
    db: AsyncSession, country_id: str, user_id: str, lang: str = "en"
) -> List[str]:
    return await FeedRepository(db).get_unique_types(country_id, user_id, lang=lang)


async def get_unique_feed_categories(
    db: AsyncSession, country_id: str, user_id: str, lang: str = "en"
) -> List[str]:
    return await FeedRepository(db).get_unique_categories(country_id, user_id, lang=lang)


async def get_feed_names(
    db: AsyncSession,
    country_id: str,
    user_id: str,
    feed_type: Optional[str] = None,
    category: Optional[str] = None,
    lang: str = "en",
    feed_type_id: Optional[str] = None,
    feed_category_id: Optional[str] = None,
) -> Tuple[List[Dict], List[Dict]]:
    """Return (standard_feeds, custom_feeds) as dicts with localized display fields."""
    std_rows, cust_rows = await FeedRepository(db).get_feed_names(
        country_id, user_id, feed_type, category, lang=lang,
        feed_type_id=feed_type_id, feed_category_id=feed_category_id,
    )

    std_feeds = [
        {
            "id": str(row.Feed.id),
            "fd_code": row.Feed.fd_code,
            "fd_name": row.Feed.fd_name,
            "fd_type": row.Feed.fd_type,
            "fd_category": row.Feed.fd_category,
            "fd_country_id": str(row.Feed.fd_country_id) if row.Feed.fd_country_id else None,
            "fd_country_name": row.Feed.fd_country_name,
            "display_name": row.display_name,
            "display_type": row.display_type,
            "display_category": row.display_category,
        }
        for row in std_rows
    ]
    cust_feeds = [
        {
            "id": str(f.id),
            "fd_code": getattr(f, "fd_code", None),
            "fd_name": f.fd_name,
            "fd_type": f.fd_type,
            "fd_category": f.fd_category,
            "fd_country_id": str(f.fd_country_id) if f.fd_country_id else None,
            "fd_country_name": f.fd_country_name,
            "display_name": f.fd_name,
            "display_type": f.fd_type,
            "display_category": f.fd_category,
        }
        for f in cust_rows
    ]
    return std_feeds, cust_feeds


async def check_insert_or_update(
    db: AsyncSession, feed_id: str, user_id: str
) -> Tuple[str, Optional[CustomFeed]]:
    """Returns ('insert', None) or ('update', existing_feed)."""
    existing = await FeedRepository(db).get_custom_by_id(feed_id, user_id)
    if existing:
        return "update", existing
    return "insert", None


class CustomFeedTaxonomyError(ValueError):
    """Raised when a custom-feed request carries an invalid taxonomy selection.

    The router maps this to HTTP 400.
    """


async def _resolve_custom_feed_taxonomy(
    repo: FeedRepository, data: Dict[str, Any], *, require: bool
) -> None:
    """Validate + canonicalize a custom-feed request's taxonomy in place (Ticket B).

    ID-first with a text fallback (matches the standard-feed path):
      * If ``feed_type_id``/``feed_category_id`` are present → validate by ID (id wins).
        Both are required together; a lone id or a mixed id+text request is rejected.
      * Else if ``fd_type``/``fd_category`` text is present → canonicalize by text.
    Either path writes BOTH the FK columns (fd_type_id/fd_category_id) and the resolved
    canonical English text (fd_type/fd_category) — T1. The request-only ``feed_*_id``
    keys are popped so they never reach ``CustomFeed(**data)``.

    ``require=True`` (create) errors when no taxonomy is supplied; ``require=False``
    (partial update) leaves the row untouched when none is supplied.

    Raises CustomFeedTaxonomyError on any invalid selection.
    """
    type_id = data.pop("feed_type_id", None)
    category_id = data.pop("feed_category_id", None)
    has_ids = bool(type_id) or bool(category_id)
    has_text = bool((data.get("fd_type") or "").strip()) or bool((data.get("fd_category") or "").strip())

    if has_ids:
        ok, reason, canon_type, canon_cat, tid, cid = await repo.resolve_taxonomy_by_ids(
            type_id, category_id
        )
        if not ok:
            raise CustomFeedTaxonomyError(reason)
        data["fd_type"] = canon_type
        data["fd_category"] = canon_cat
        data["fd_type_id"] = tid
        data["fd_category_id"] = cid
        return

    if has_text:
        from services.feed_service import resolve_taxonomy

        type_by_name, cat_by_type_and_name = await repo.get_active_taxonomy_maps()
        ok, reason, canon_type, canon_cat, tid, cid = resolve_taxonomy(
            type_by_name,
            cat_by_type_and_name,
            (data.get("fd_type") or "").strip(),
            (data.get("fd_category") or "").strip(),
        )
        if not ok:
            raise CustomFeedTaxonomyError(reason)
        data["fd_type"] = canon_type
        data["fd_category"] = canon_cat
        data["fd_type_id"] = tid
        data["fd_category_id"] = cid
        return

    if require:
        raise CustomFeedTaxonomyError(
            "feed_type_id + feed_category_id (or fd_type + fd_category) are required"
        )


async def insert_custom_feed(db: AsyncSession, data: Dict[str, Any]) -> CustomFeed:
    """Create a new custom feed. Caller must commit.

    Validates the taxonomy selection against the active taxonomy and writes both the
    FK columns and the resolved English text (Ticket B). Raises CustomFeedTaxonomyError
    (→ HTTP 400) on an invalid selection.
    """
    repo = FeedRepository(db)
    await _resolve_custom_feed_taxonomy(repo, data, require=True)
    if not data.get("fd_code"):
        # Replaces the defunct app.models.generate_next_custom_feed_code (module removed).
        from services.feed_service import make_unique_custom_feed_code

        data["fd_code"] = await make_unique_custom_feed_code(repo, data.get("fd_name", ""))
    return await repo.create_custom_feed(data)


async def update_custom_feed(
    db: AsyncSession, feed_id: str, user_id: str, data: Dict[str, Any]
) -> Tuple[bool, Optional[CustomFeed]]:
    """Update an existing custom feed. Caller must commit.

    Re-validates + canonicalizes taxonomy only when the request supplies it (partial
    update); a request that omits type/category leaves the existing values untouched.
    Raises CustomFeedTaxonomyError (→ HTTP 400) on an invalid selection.
    """
    repo = FeedRepository(db)
    feed = await repo.get_custom_by_id(feed_id, user_id)
    if not feed:
        return False, None
    await _resolve_custom_feed_taxonomy(repo, data, require=False)
    updated = await repo.update_custom_feed(feed, data)
    return True, updated
