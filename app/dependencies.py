import logging
from typing import AsyncGenerator, Optional

import jwt as _jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.db.models import UserInformationModel

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def _user_from_jwt(token: str, db: AsyncSession) -> UserInformationModel:
    """Decode JWT and return the active user. Raises HTTPException on any failure."""
    from services.auth_service import decode_token
    from repositories.user_repository import UserRepository

    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub", "")
    except _jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> UserInformationModel:
    """
    Resolve the calling user from a Bearer JWT (preferred) or a legacy
    user_id / email_id in the request body (deprecated, mobile transition).

    Remove the legacy fallback once mobile confirms JWT works in production.
    """
    from repositories.user_repository import UserRepository

    # ── Primary path: Bearer JWT ──────────────────────────────────────────────
    if credentials and credentials.credentials:
        return await _user_from_jwt(credentials.credentials, db)

    # ── Legacy fallback: user_id or email_id in request body ─────────────────
    body: dict = {}
    try:
        body = request.state._cached_body  # type: ignore[attr-defined]
    except AttributeError:
        try:
            body = await request.json()
            request.state._cached_body = body
        except Exception:
            body = {}

    repo = UserRepository(db)

    user_id: Optional[str] = body.get("user_id")
    if user_id:
        logger.warning(
            "DEPRECATED: user_id in request body used for auth (endpoint=%s). "
            "Switch to Bearer JWT.",
            request.url.path,
        )
        user = await repo.get_by_id(user_id)
        if user and user.is_active:
            return user

    email_id: Optional[str] = body.get("email_id")
    if email_id:
        logger.warning(
            "DEPRECATED: email_id in request body used for auth (endpoint=%s). "
            "Switch to Bearer JWT.",
            request.url.path,
        )
        user = await repo.get_by_email(email_id)
        if user and user.is_active:
            return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Provide a Bearer token.",
    )


async def require_admin_user(
    current_user: UserInformationModel = Depends(get_current_user),
) -> UserInformationModel:
    """Gate that ensures the calling user has admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


async def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[UserInformationModel]:
    """Like get_current_user but returns None instead of raising 401.

    Used by get_language so unauthenticated endpoints (e.g. feed listing) can
    still resolve a language from ?lang= without requiring a Bearer token.
    """
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None


async def get_language(
    lang: Optional[str] = Query(default=None, description="BCP 47 language code, e.g. 'hi', 'vi'"),
    current_user: Optional[UserInformationModel] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Resolve the effective language for a request (i18n V2 Phase 2).

    Priority: ?lang= query param > user.preferred_language > 'en'.
    Validates the candidate against the DB-backed, Redis-cached active-language
    set so only real languages are accepted (I4). Falls back to 'en' (I3).

    Inject with `lang: str = Depends(get_language)` on any feed-returning endpoint.
    """
    from app.lang import get_active_languages, resolve_language

    user_pref = getattr(current_user, "preferred_language", None)
    active = await get_active_languages(db)
    return resolve_language(lang, user_pref, active)


async def get_language_authenticated(
    lang: Optional[str] = Query(default=None, description="BCP 47 language code, e.g. 'hi', 'vi'"),
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Like get_language but requires authentication (uses get_current_user, not optional).

    For endpoints that already require a Bearer JWT. FastAPI caches get_current_user per
    request, so pairing this with Depends(get_current_user) in the same endpoint does not
    result in two DB lookups.
    """
    from app.lang import get_active_languages, resolve_language

    user_pref = getattr(current_user, "preferred_language", None)
    active = await get_active_languages(db)
    return resolve_language(lang, user_pref, active)
