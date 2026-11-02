from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# Redis down: count in each process's memory instead of failing every limited
# request with 500 (slowapi raises storage errors unless a fallback is enabled).
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    in_memory_fallback_enabled=True,
)
