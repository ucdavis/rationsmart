"""
One email per address per COOLDOWN_S for the anonymous "send me an email" endpoints:
POST /v1/auth/forgot-pin (scope "pin_reset", the default) and
POST /v1/auth/resend-verification (scope "verify_resend"). Each scope has its own keys,
so a PIN reset never blocks a verification resend for the same address.

The limit is keyed on the email, not the client IP: PWA traffic reaches the API
through the Next.js proxy, which does not forward the browser's address, so an
IP limit would let one user block resets for everyone. The key is the SHA-256
of the lower-cased address, so Redis never holds the email itself. Unknown
addresses are counted too, which keeps the reply identical for every address.

Redis down or slow: the claim fails closed (no email, error log). The caller
answers with the same neutral message, so nothing leaks and the user can retry;
/health already reports Redis as down.
"""
import asyncio
import hashlib
import logging

from redis.exceptions import RedisError

from app import feed_cache

logger = logging.getLogger(__name__)

PIN_RESET = "pin_reset"
VERIFY_RESEND = "verify_resend"
COOLDOWN_S = 60
REDIS_TIMEOUT_S = 0.5


def _key(email: str, scope: str = PIN_RESET) -> str:
    return f"{scope}:" + hashlib.sha256(email.strip().lower().encode()).hexdigest()


async def claim(email: str, scope: str = PIN_RESET) -> bool:
    """True if an email may go out for `email` now; False during the cooldown or without Redis."""
    redis = feed_cache._redis
    if redis is None:
        logger.error("Email cooldown (%s) refused: Redis is not configured", scope)
        return False
    try:
        return bool(await asyncio.wait_for(
            redis.set(_key(email, scope), "1", ex=COOLDOWN_S, nx=True), REDIS_TIMEOUT_S))
    except (RedisError, asyncio.TimeoutError):
        logger.exception("Email cooldown (%s) refused: Redis error or timeout", scope)
        return False
