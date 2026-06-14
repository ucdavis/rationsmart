"""
Shared Redis feed cache for RationSmart v4.0.

Replaces the in-process dict cache (broken across workers) with a Redis
key-space keyed by country_id. Initialized in app lifespan; each worker
shares the same Redis connection pool.
"""
import json
import logging
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None


async def init_redis(url: str) -> aioredis.Redis:
    global _redis
    _redis = aioredis.from_url(url, decode_responses=True)
    logger.info("Redis feed cache connected: %s", url)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("Redis feed cache closed")


async def get_feeds_from_cache(country_id: str) -> Optional[list]:
    if not _redis:
        return None
    data = await _redis.get(f"feeds:{country_id}")
    return json.loads(data) if data else None


async def set_feeds_in_cache(
    country_id: str, feeds: list, ttl_seconds: int = 300
) -> None:
    if not _redis:
        return
    await _redis.setex(f"feeds:{country_id}", ttl_seconds, json.dumps(feeds))


async def invalidate_feeds_cache(country_id: Optional[str] = None) -> None:
    if not _redis:
        return
    if country_id:
        await _redis.delete(f"feeds:{country_id}")
    else:
        keys = await _redis.keys("feeds:*")
        if keys:
            await _redis.delete(*keys)
