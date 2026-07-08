import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List

from app.dependencies import get_db
from app.db.models import FeedCategory, FeedType
from app.schemas.feed import FeedCategoryResponse, FeedTypeResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Feed Classification"])


def _ft_response(ft: FeedType) -> FeedTypeResponse:
    return FeedTypeResponse(
        id=str(ft.id),
        type_name=ft.type_name or "",
        description=ft.description,
        sort_order=ft.sort_order,
        is_active=ft.is_active,
        created_at=ft.created_at,
        updated_at=ft.updated_at,
    )


def _cat_response(cat: FeedCategory) -> FeedCategoryResponse:
    ft = getattr(cat, "feed_type", None)
    return FeedCategoryResponse(
        id=str(cat.id),
        category_name=cat.category_name or "",
        feed_type_id=str(cat.feed_type_id),
        description=cat.description,
        sort_order=cat.sort_order,
        is_active=cat.is_active,
        created_at=cat.created_at,
        updated_at=cat.updated_at,
        feed_type=_ft_response(ft) if ft else None,
    )


@router.get("/get-feed-types", response_model=List[FeedTypeResponse],
            summary="List all active feed types")
async def get_feed_types(db: AsyncSession = Depends(get_db)):
    """
    Return all active feed types (e.g. Roughage, Concentrate) sorted by display order then name.

    No authentication required. Use the returned `id` to fetch categories via `GET /v1/feed-classification/get-categories/{type_id}`.
    """
    result = await db.execute(
        select(FeedType)
        .where(FeedType.is_active == True)  # noqa: E712
        .order_by(FeedType.sort_order, FeedType.type_name)
    )
    return [_ft_response(ft) for ft in result.scalars().all()]


@router.get("/types/{type_id}", response_model=FeedTypeResponse, summary="Get a feed type by UUID")
async def get_feed_type(type_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return the details of a single active feed type.

    No authentication required.

    **Path parameter:** `type_id` — UUID of the feed type.

    Returns `400` for invalid UUID format; `404` if the type does not exist or is inactive.
    """
    try:
        uuid.UUID(type_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    result = await db.execute(
        select(FeedType).where(FeedType.id == type_id, FeedType.is_active == True)  # noqa: E712
    )
    ft = result.scalars().first()
    if not ft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed type not found")
    return _ft_response(ft)


@router.get("/get-categories/{type_id}", response_model=List[FeedCategoryResponse],
            summary="List all categories under a feed type")
async def get_categories_by_type(type_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return all active feed categories that belong to the specified feed type, sorted by display order then name.

    No authentication required.

    **Path parameter:** `type_id` — UUID of the parent feed type (from `GET /v1/feed-classification/get-feed-types`).

    Returns `400` for invalid UUID; `404` if the feed type is not found or inactive.
    """
    try:
        uuid.UUID(type_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    ft_result = await db.execute(
        select(FeedType).where(FeedType.id == type_id, FeedType.is_active == True)  # noqa: E712
    )
    if not ft_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed type not found")

    cat_result = await db.execute(
        select(FeedCategory)
        .where(FeedCategory.feed_type_id == type_id, FeedCategory.is_active == True)  # noqa: E712
        .order_by(FeedCategory.sort_order, FeedCategory.category_name)
    )
    return [_cat_response(c) for c in cat_result.scalars().all()]


@router.get("/get-feed-category/{category_id}", response_model=FeedCategoryResponse,
            summary="Get a feed category by UUID")
async def get_feed_category(category_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return the details of a single active feed category, including its parent feed type.

    No authentication required.

    **Path parameter:** `category_id` — UUID of the feed category.

    Returns `400` for invalid UUID format; `404` if the category does not exist or is inactive.
    """
    try:
        uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    result = await db.execute(
        select(FeedCategory).where(
            FeedCategory.id == category_id, FeedCategory.is_active == True  # noqa: E712
        )
    )
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed category not found")
    return _cat_response(cat)


@router.get("/structure", response_model=Dict[str, List[Dict[str, Any]]],
            summary="Get the full hierarchical feed classification structure")
async def get_structure(db: AsyncSession = Depends(get_db)):
    """
    Return the complete feed taxonomy: a list of all active feed types, each with its list of active categories.

    No authentication required.

    Response shape (additive — string keys preserved for backward compatibility):
    ```
    { "feed_classification": [
        { "id": "<type-uuid>", "type": "...", "type_en": "...",
          "categories": ["...", "..."],
          "category_details": [
            { "id": "<cat-uuid>", "feed_type_id": "<type-uuid>", "name": "...", "name_en": "..." }
          ] } ] }
    ```
    `id`/`type_en`/`category_details` let the Front End key on stable UUIDs (recommended)
    while `type`/`categories` remain for existing clients. Useful for populating UI dropdowns
    in a single call.
    """
    ft_result = await db.execute(
        select(FeedType)
        .where(FeedType.is_active == True)  # noqa: E712
        .order_by(FeedType.sort_order, FeedType.type_name)
    )
    feed_types = ft_result.scalars().all()

    structure = []
    for ft in feed_types:
        cat_result = await db.execute(
            select(FeedCategory)
            .where(FeedCategory.feed_type_id == ft.id, FeedCategory.is_active == True)  # noqa: E712
            .order_by(FeedCategory.sort_order, FeedCategory.category_name)
        )
        cats = cat_result.scalars().all()
        structure.append({
            "id": str(ft.id),
            "type": ft.type_name or "",
            "type_en": ft.type_name or "",
            "categories": [c.category_name or "" for c in cats],
            "category_details": [
                {
                    "id": str(c.id),
                    "feed_type_id": str(c.feed_type_id),
                    "name": c.category_name or "",
                    "name_en": c.category_name or "",
                }
                for c in cats
            ],
        })
    return {"feed_classification": structure}
