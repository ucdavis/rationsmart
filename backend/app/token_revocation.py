"""
Deny-list for logged-out JWTs (POST /v1/auth/logout).

Tokens carry no `jti`, so a revoked token is keyed on its SHA-256 hash; that
also covers tokens issued before logout existed. Each key expires with the
token itself, so the list never outgrows the live sessions.

Redis down: a revocation cannot be recorded (logout answers 503), and a check
lets the token through with an error log. Locking every user out whenever
Redis is unavailable was judged worse; /health already reports it as 503.
"""
import hashlib
import logging
import time

from redis.exceptions import RedisError

from app import feed_cache

logger = logging.getLogger(__name__)

_KEY_PREFIX = "revoked_token:"


def _key(token: str) -> str:
    return _KEY_PREFIX + hashlib.sha256(token.encode()).hexdigest()


async def revoke_token(token: str, expires_at: int) -> bool:
    """Deny `token` until `expires_at` (epoch seconds). False if Redis is unavailable."""
    ttl = int(expires_at - time.time())
    if ttl <= 0:
        return True  # already expired: nothing left to deny
    redis = feed_cache._redis
    if redis is None:
        logger.error("Token revocation skipped: Redis is not configured")
        return False
    try:
        await redis.setex(_key(token), ttl, "1")
    except RedisError:
        logger.exception("Token revocation failed: Redis error")
        return False
    return True


async def is_token_revoked(token: str) -> bool:
    redis = feed_cache._redis
    if redis is None:
        logger.error("Token revocation check skipped: Redis is not configured")
        return False
    try:
        return bool(await redis.exists(_key(token)))
    except RedisError:
        logger.exception("Token revocation check skipped: Redis error")
        return False
