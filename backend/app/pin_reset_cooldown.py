"""
One forgot-PIN reset per email address per COOLDOWN_S (POST /v1/auth/forgot-pin).

The limit is keyed on the email, not the client IP: PWA traffic reaches the API
through the Next.js proxy, which does not forward the browser's address, so an
IP limit would let one user block resets for everyone. The key is the SHA-256
of the lower-cased address, so Redis never holds the email itself. Unknown
addresses are counted too, which keeps the reply identical for every address.

Redis down or slow: the claim fails closed (no reset, error log). The caller
answers with the same neutral message, so nothing leaks and the user can retry;
/health already reports Redis as down.
"""
import asyncio
import hashlib
import logging

from redis.exceptions import RedisError

from app import feed_cache

logger = logging.getLogger(__name__)

_KEY_PREFIX = "pin_reset:"
COOLDOWN_S = 60
REDIS_TIMEOUT_S = 0.5


def _key(email: str) -> str:
    return _KEY_PREFIX + hashlib.sha256(email.strip().lower().encode()).hexdigest()


async def claim(email: str) -> bool:
    """True if a reset may go ahead for `email` now; False during the cooldown or without Redis."""
    redis = feed_cache._redis
    if redis is None:
        logger.error("Forgot PIN refused: Redis is not configured")
        return False
    try:
        return bool(await asyncio.wait_for(
            redis.set(_key(email), "1", ex=COOLDOWN_S, nx=True), REDIS_TIMEOUT_S))
    except (RedisError, asyncio.TimeoutError):
        logger.exception("Forgot PIN refused: Redis error or timeout")
        return False
