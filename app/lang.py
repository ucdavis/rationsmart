"""
Language resolution (i18n V2 plan, Phase 2).

Provides:
  get_active_languages(db)  — DB-backed, Redis-cached set of active codes.
  resolve_language(...)     — pure priority resolver: ?lang= > user pref > 'en'.
  invalidate_lang_cache()   — called by Phase 5 admin endpoints on language changes.

Invariants (V2 §2):
  I3: 'en' is always a valid return value — it is the implicit baseline. No
      translation rows exist for 'en'; 'en' is returned when nothing else matches.
  I4: The set of supported languages is *data*, not code — sourced from the
      `languages` table so a new language can be added at runtime without a deploy.
"""
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.feed_cache import (
    get_lang_codes_from_cache,
    invalidate_lang_cache,  # re-exported for callers that import from here
    set_lang_codes_in_cache,
)

logger = logging.getLogger(__name__)

__all__ = ["get_active_languages", "resolve_language", "invalidate_lang_cache"]


async def get_active_languages(db: AsyncSession) -> set[str]:
    """Return the set of active language codes (Redis-cached, falls back to DB).

    'en' is always included (I3) even if somehow absent from the DB.
    Falls back to {'en'} if both Redis and DB fail so the app keeps working.
    """
    cached = await get_lang_codes_from_cache()
    if cached is not None:
        return set(cached)

    try:
        result = await db.execute(
            text("SELECT code FROM languages WHERE is_active = true")
        )
        codes: set[str] = {row[0] for row in result}
    except Exception:
        logger.warning("get_active_languages: DB query failed; falling back to {'en'}")
        codes = set()

    codes.add("en")  # I3 baseline — always valid

    await set_lang_codes_in_cache(list(codes))
    return codes


def resolve_language(
    query_param: Optional[str],
    user_preferred: Optional[str],
    active: set[str],
) -> str:
    """Resolve the effective language for a request (pure — no I/O).

    Priority (V2 §2.1): ?lang= query param > user.preferred_language > 'en'.
    A candidate is accepted only if it is in `active`. 'en' is the hard fallback
    (I3) and is returned even if it is absent from `active`.
    """
    for candidate in (query_param, user_preferred):
        if candidate and candidate in active:
            return candidate
    return "en"
