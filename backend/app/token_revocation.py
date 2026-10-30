"""
Deny-list for logged-out JWTs (POST /v1/auth/logout).

A revoked token is keyed on the SHA-256 of its signed part (header.payload),
not of the whole string: the signature segment is malleable (PyJWT also accepts
it with "=" padding appended), so a hash of the raw string would let a padded
copy of a logged-out token through. The signed part cannot change without
failing verification, and callers check only tokens that already verified.
This covers every token, including those issued before tokens had a `jti`.
Each key expires with the token itself, so the list never outgrows the live
sessions.

Redis down or slow: each call gives up after REDIS_TIMEOUT_S. A revocation
then cannot be recorded (logout answers 503), and a check lets the token
through with an error log. Locking every user out whenever Redis is
unavailable was judged worse; /health already reports it as 503.
"""
import asyncio
import hashlib
import logging
import time

from redis.exceptions import RedisError

from app import feed_cache

logger = logging.getLogger(__name__)

_KEY_PREFIX = "revoked_token:"

# A healthy Redis answers in well under a millisecond. Without a bound, a hung
# Redis would add redis-py's 5 s socket timeout to every authenticated request.
REDIS_TIMEOUT_S = 0.5


def _key(token: str) -> str:
    signed_part = token.rsplit(".", 1)[0]
    return _KEY_PREFIX + hashlib.sha256(signed_part.encode()).hexdigest()


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
        await asyncio.wait_for(redis.setex(_key(token), ttl, "1"), REDIS_TIMEOUT_S)
    except (RedisError, asyncio.TimeoutError):
        logger.exception("Token revocation failed: Redis error or timeout")
        return False
    return True


async def is_token_revoked(token: str) -> bool:
    redis = feed_cache._redis
    if redis is None:
        logger.error("Token revocation check skipped: Redis is not configured")
        return False
    try:
        return bool(await asyncio.wait_for(redis.exists(_key(token)), REDIS_TIMEOUT_S))
    except (RedisError, asyncio.TimeoutError):
        logger.exception("Token revocation check skipped: Redis error or timeout")
        return False
