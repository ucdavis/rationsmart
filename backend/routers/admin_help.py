"""Admin Manual endpoints (/v1/admin/help): admins only, read-only, no database.

Same answers as the public In-App Help (/v1/help) for a second content folder,
backend/help_content/admin/ (services.help_content.get_admin_help_content), so the PWA
reuses its User Manual screens behind the "Admin Manual" card. English only: no ?lang=.

Every endpoint, images included, needs an admin (router-level dependency: 401 without a
session, 403 for other users). Answers are `private` so a shared cache (Cloudflare in
front of Production) never keeps them. Contract: dev_docs/admin_manual/v1_Admin_Manual_API_Contract.md
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse

from app.dependencies import require_admin_user
from app.schemas.help import AdminHelpIndexResponse, AdminHelpTopicResponse
from services.help_content import (
    ENGLISH,
    MEDIA_NAME_RE,
    TOPIC_KEY_RE,
    HelpContent,
    HelpContentError,
    get_admin_help_content,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Admin Manual"], dependencies=[Depends(require_admin_user)])

TEXT_CACHE = "private, no-store"
MEDIA_CACHE = "private, max-age=31536000, immutable"
NOT_AVAILABLE = "Help is not available right now"
TOPIC_NOT_FOUND = "Help topic not found"


def _content() -> HelpContent:
    try:
        return get_admin_help_content()
    except HelpContentError:
        logger.error("Admin help content failed to load", exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_AVAILABLE)


@router.get("/index", response_model=AdminHelpIndexResponse, summary="Admin Manual topics")
def admin_help_index(response: Response):
    """
    The Admin Manual's topic list (same shape as `GET /v1/help/index`; `screens` and
    `faqs` are empty). English only.

    Admins only: `401` without a session, `403` for other users. `503` when the admin
    help content could not be loaded.
    """
    data = _content().index(ENGLISH)
    response.headers["Cache-Control"] = TEXT_CACHE
    return data


@router.get("/topics/{key}", response_model=AdminHelpTopicResponse, summary="One Admin Manual topic")
def admin_help_topic(key: str, response: Response):
    """
    One admin topic: video, numbered steps with screenshots, common problems, related
    topics (same shape as `GET /v1/help/topics/{key}`).

    Admins only. `404` for an unknown key; `503` when the admin help content could not be loaded.
    """
    if not TOPIC_KEY_RE.fullmatch(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TOPIC_NOT_FOUND)
    data = _content().topic(key, ENGLISH)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TOPIC_NOT_FOUND)
    response.headers["Cache-Control"] = TEXT_CACHE
    return data


@router.get("/media/en/{name}", summary="An Admin Manual image", response_class=FileResponse)
def admin_help_media(name: str):
    """
    A screenshot or video poster named in the Admin Manual (WebP or PNG). Only listed files
    are served; any other name is `404`. Admins only; cached in the admin's own browser
    only (`private`), for a year: the `?v=` tag in the links changes when the file changes.
    """
    if not MEDIA_NAME_RE.fullmatch(name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    found = _content().media_file(ENGLISH, name)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    path, media_type = found
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": MEDIA_CACHE})
