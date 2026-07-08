import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_language
from app.db.models import FeedCategory, FeedType
from app.schemas.feed import FeedCategoryResponse, FeedTypeResponse
from repositories.feed_repository import FeedRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Feed Classification"])


def _ft_response(ft: FeedType, display_name: Optional[str] = None) -> FeedTypeResponse:
    return FeedTypeResponse(
        id=str(ft.id),
        type_name=ft.type_name or "",
        description=ft.description,
        sort_order=ft.sort_order,
        is_active=ft.is_active,
        created_at=ft.created_at,
        updated_at=ft.updated_at,
        display_name=display_name if display_name is not None else (ft.type_name or ""),
    )


def _cat_response(cat: FeedCategory, display_name: Optional[str] = None) -> FeedCategoryResponse:
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
        display_name=display_name if display_name is not None else (cat.category_name or ""),
    )


@router.get("/get-feed-types", response_model=List[FeedTypeResponse],
            summary="List all active feed types")
async def get_feed_types(
    country_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    """
    Return all active feed types (e.g. Roughage, Concentrate) sorted by display order then name.

    No authentication required. Use the returned `id` to fetch categories via `GET /v1/feed-classification/get-categories/{type_id}`.

    **Optional query params:** `country_id` (UUID), `lang` (BCP-47 code). Each item includes
    `display_name` — the localized type name (COALESCE fallback to English). `display_name`
    equals `type_name` when `lang='en'` or `country_id` is omitted.
    """
    rows = await FeedRepository(db).get_feed_types_localized(lang=lang, country_id=country_id)
    return [_ft_response(r.FeedType, r.display_name) for r in rows]


@router.get("/types/{type_id}", response_model=FeedTypeResponse, summary="Get a feed type by UUID")
async def get_feed_type(
    type_id: str,
    country_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    """
    Return the details of a single active feed type.

    No authentication required.

    **Path parameter:** `type_id` — UUID of the feed type.

    **Optional query params:** `country_id`, `lang` — see `GET /get-feed-types`. Response
    includes localized `display_name`.

    Returns `400` for invalid UUID format; `404` if the type does not exist or is inactive.
    """
    try:
        uuid.UUID(type_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    row = await FeedRepository(db).get_feed_type_by_id_localized(
        type_id, lang=lang, country_id=country_id
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed type not found")
    return _ft_response(row.FeedType, row.display_name)


@router.get("/get-categories/{type_id}", response_model=List[FeedCategoryResponse],
            summary="List all categories under a feed type")
async def get_categories_by_type(
    type_id: str,
    country_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    """
    Return all active feed categories that belong to the specified feed type, sorted by display order then name.

    No authentication required.

    **Path parameter:** `type_id` — UUID of the parent feed type (from `GET /v1/feed-classification/get-feed-types`).

    **Optional query params:** `country_id`, `lang`. Each category includes localized `display_name`.

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

    rows = await FeedRepository(db).get_categories_localized(
        type_id, lang=lang, country_id=country_id
    )
    return [_cat_response(r.FeedCategory, r.display_name) for r in rows]


@router.get("/get-feed-category/{category_id}", response_model=FeedCategoryResponse,
            summary="Get a feed category by UUID")
async def get_feed_category(
    category_id: str,
    country_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    """
    Return the details of a single active feed category.

    No authentication required.

    **Path parameter:** `category_id` — UUID of the feed category.

    **Optional query params:** `country_id`, `lang`. Response includes localized `display_name`.

    Returns `400` for invalid UUID format; `404` if the category does not exist or is inactive.
    """
    try:
        uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    row = await FeedRepository(db).get_category_by_id_localized(
        category_id, lang=lang, country_id=country_id
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed category not found")
    return _cat_response(row.FeedCategory, row.display_name)


@router.get("/structure", response_model=Dict[str, List[Dict[str, Any]]],
            summary="Get the full hierarchical feed classification structure")
async def get_structure(
    country_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lang: str = Depends(get_language),
):
    """
    Return the complete feed taxonomy: a list of all active feed types, each with its list of active categories.

    No authentication required.

    **Optional query params:** `country_id` (UUID), `lang` (BCP-47 code) — missing `country_id`
    or `lang='en'` returns English (no error).

    Response shape (additive — English string keys preserved for backward compatibility):
    ```
    { "feed_classification": [
        { "id": "<type-uuid>", "type": "<English>", "display_type": "<localized>",
          "categories": ["<English>", ...],
          "category_details": [
            { "id": "<cat-uuid>", "feed_type_id": "<type-uuid>",
              "name": "<English>", "display_name": "<localized>" }
          ] } ] }
    ```
    Key on `id`; render `display_type`/`display_name` (they fall back to the English
    `type`/`name` when untranslated). `type`/`categories` stay English for existing clients.
    Assembled in two queries (types + all categories), grouped in memory — no N+1.
    """
    repo = FeedRepository(db)
    types = await repo.get_feed_types_localized(lang=lang, country_id=country_id)
    cats_by_type = await repo.get_categories_grouped_localized(lang=lang, country_id=country_id)

    structure = []
    for tr in types:
        ft = tr.FeedType
        cat_rows = cats_by_type.get(ft.id, [])
        structure.append({
            "id": str(ft.id),
            "type": ft.type_name or "",
            "display_type": tr.display_name,
            "categories": [cr.FeedCategory.category_name or "" for cr in cat_rows],
            "category_details": [
                {
                    "id": str(cr.FeedCategory.id),
                    "feed_type_id": str(cr.FeedCategory.feed_type_id),
                    "name": cr.FeedCategory.category_name or "",
                    "display_name": cr.display_name,
                }
                for cr in cat_rows
            ],
        })
    return {"feed_classification": structure}
