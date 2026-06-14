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

    @classmethod
    def from_orm(
        cls,
        feed: Any,
        fid: str,
        country_name: str = "",
        price_per_kg: float = 0.0,
        quantity_as_fed: Optional[float] = None,
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
        )


# ── Feed lookup helpers ───────────────────────────────────────────────────────

async def get_feed_details(
    db: AsyncSession, feed_id: str, user_id: str
) -> Optional[Dict[str, Any]]:
    """
    Look up a feed by ID from the standard or custom_feeds table.
    Returns a dict with nutrient fields + country_name, or None if not found.
    """
    repo = FeedRepository(db)
    user_repo = UserRepository(db)

    feed: Optional[Feed | CustomFeed] = await repo.get_by_id(feed_id)
    if feed is None:
        feed = await repo.get_custom_by_id(feed_id, user_id)
    if feed is None:
        return None

    country_name = ""
    if feed.fd_country_id:
        country = await user_repo.get_country_by_id(str(feed.fd_country_id))
        country_name = country.name if country else ""

    return {
        "feed_id": str(feed.id),
        "fd_code": getattr(feed, "fd_code", None),
        "fd_name": feed.fd_name,
        "fd_type": feed.fd_type,
        "fd_category": feed.fd_category,
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
    }


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

        rec = FeedRecord.from_orm(feed, fid, country_name, price_per_kg=item.price_per_kg)
        feed_data_list.append(dataclasses.asdict(rec))
    return feed_data_list, missing


# ── Diet recommendation ───────────────────────────────────────────────────────

async def run_diet_recommendation(
    db: AsyncSession,
    pool: ProcessPoolExecutor,
    request: Any,
    user_id: str,
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

    # 1 — Resolve feeds
    feed_data_list, missing = await _build_feed_data_list(db, request.feed_selection, user_id)
    if not feed_data_list:
        raise ValueError("No valid feeds found for the provided feed IDs.")
    if missing:
        logger.warning("Missing feed IDs (skipped): %s", missing)

    # 2 — Build animal inputs for the optimizer
    cattle = request.cattle_info
    animal_inputs = {
        "body_weight": cattle.body_weight,
        "breed": cattle.breed,
        "lactating": cattle.lactating,
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
    }

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

    # 3 — Run optimizer in process pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        pool,
        z_optimization_main,
        animal_inputs,
        feed_data_list,
        custom_thresholds,
    )

    # 4 — Build API response
    # reporting.py uses dict-access; convert OptimizationResult to a compat dict.
    report_id = f"rec-{_uuid_mod.uuid4().hex[:8]}"
    result_dict = {
        "status": result.status,
        "post_results": result.post_results,
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

    response = build_diet_response(
        optimization_results=result_dict,
        cattle_info=request.cattle_info,
        simulation_id=request.simulation_id,
        report_id=report_id,
        user_name="",
        currency=currency,
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
) -> Dict[str, Any]:
    """
    Evaluate a user-supplied diet against calculated animal requirements.
    Persists a Report record (type='eval') and returns the response dict.
    Caller must commit.
    """
    from core.z_optimization.evaluation import evaluate_diet
    from core.z_optimization.reporting import build_evaluation_response

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
        "lactating": cattle.lactating,
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
    }

    country = await user_repo.get_country_by_id(request.country_id)
    country_name = country.name if country else ""

    ingredient_amounts_af = [f["quantity_as_fed"] or 0.0 for f in feed_data_list]
    eval_result = evaluate_diet(animal_inputs, ingredient_amounts_af, feed_data_list=feed_data_list)
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

async def get_unique_feed_types(db: AsyncSession, country_id: str, user_id: str) -> List[str]:
    return await FeedRepository(db).get_unique_types(country_id, user_id)


async def get_unique_feed_categories(db: AsyncSession, country_id: str, user_id: str) -> List[str]:
    return await FeedRepository(db).get_unique_categories(country_id, user_id)


async def get_feed_names(
    db: AsyncSession,
    country_id: str,
    user_id: str,
    feed_type: Optional[str] = None,
    category: Optional[str] = None,
) -> Tuple[List, List]:
    return await FeedRepository(db).get_feed_names(country_id, user_id, feed_type, category)


async def check_insert_or_update(
    db: AsyncSession, feed_id: str, user_id: str
) -> Tuple[str, Optional[CustomFeed]]:
    """Returns ('insert', None) or ('update', existing_feed)."""
    existing = await FeedRepository(db).get_custom_by_id(feed_id, user_id)
    if existing:
        return "update", existing
    return "insert", None


async def insert_custom_feed(db: AsyncSession, data: Dict[str, Any]) -> CustomFeed:
    """Create a new custom feed. Caller must commit."""
    from app.models import generate_next_custom_feed_code  # legacy helper still in old models

    if "fd_code" not in data:
        data["fd_code"] = generate_next_custom_feed_code(db)
    return await FeedRepository(db).create_custom_feed(data)


async def update_custom_feed(
    db: AsyncSession, feed_id: str, user_id: str, data: Dict[str, Any]
) -> Tuple[bool, Optional[CustomFeed]]:
    """Update an existing custom feed. Caller must commit."""
    feed = await FeedRepository(db).get_custom_by_id(feed_id, user_id)
    if not feed:
        return False, None
    updated = await FeedRepository(db).update_custom_feed(feed, data)
    return True, updated
