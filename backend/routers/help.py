"""In-App Help endpoints (/v1/help): public, read-only, no database.

The PWA reaches them through its proxy (/api/proxy/v1/help/...). Content comes from
backend/help_content/ via services.help_content (validated once per process).
"""
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from app.schemas.help import HelpIndexResponse, HelpTopicResponse
from services.help_content import (
    MEDIA_NAME_RE,
    TOPIC_KEY_RE,
    HelpContent,
    HelpContentError,
    get_help_content,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Help"])

TEXT_CACHE = "public, max-age=300"
MEDIA_CACHE = "public, max-age=31536000, immutable"
NOT_AVAILABLE = "Help is not available right now"
TOPIC_NOT_FOUND = "Help topic not found"
LANG_SEGMENT_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")

LANG_QUERY = Query(
    None,
    description="Language code (e.g. `hi`). Unknown or missing → English. "
    "Text not yet translated falls back to English and sets `fallback: true`.",
)


def _content() -> HelpContent:
    try:
        return get_help_content()
    except HelpContentError:
        logger.error("Help content failed to load", exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_AVAILABLE)


@router.get("/index", response_model=HelpIndexResponse, summary="Help topics, screen map and FAQs")
def help_index(response: Response, lang: Optional[str] = LANG_QUERY):
    """
    Everything the Help home and the FAQ list need, plus the **screen → topic map** the
    app's help buttons use.

    No authentication. Returns `503` when the help content could not be loaded.
    """
    data = _content().index(lang)
    response.headers["Cache-Control"] = TEXT_CACHE
    return data


@router.get("/topics/{key}", response_model=HelpTopicResponse, summary="One help topic")
def help_topic(key: str, response: Response, lang: Optional[str] = LANG_QUERY):
    """
    One topic: video (or `null`), numbered steps with images, common problems, related topics.

    No authentication. `404` for an unknown key; `503` when the help content could not be loaded.
    """
    if not TOPIC_KEY_RE.fullmatch(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TOPIC_NOT_FOUND)
    data = _content().topic(key, lang)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TOPIC_NOT_FOUND)
    response.headers["Cache-Control"] = TEXT_CACHE
    return data


@router.get("/media/{lang}/{name}", summary="A help image", response_class=FileResponse)
def help_media(lang: str, name: str):
    """
    An image named in the help content (WebP or PNG). Only listed files are served; any
    other name is `404`. The `?v=` tag in the links changes when the file changes, so the
    answer can be cached for a year.
    """
    if not LANG_SEGMENT_RE.fullmatch(lang) or not MEDIA_NAME_RE.fullmatch(name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    found = _content().media_file(lang, name)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    path, media_type = found
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": MEDIA_CACHE})
