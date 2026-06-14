import logging
import uuid
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.limiter import limiter
from middleware.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

_optimization_pool: Optional[ProcessPoolExecutor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.feed_cache import init_redis, close_redis

    global _optimization_pool
    _optimization_pool = ProcessPoolExecutor(max_workers=settings.optimization_pool_workers)
    app.state.optimization_pool = _optimization_pool

    if settings.redis_url:
        await init_redis(settings.redis_url)

    logger.info(
        "RationSmart API starting up (optimization pool: %d workers)",
        settings.optimization_pool_workers,
    )
    yield
    _optimization_pool.shutdown(wait=False)
    await close_redis()
    logger.info("RationSmart API shut down")


app = FastAPI(
    title="RationSmart",
    version="4.0.0",
    description="Dairy cattle least-cost diet optimization API",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
_allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


# ── Request-ID middleware ─────────────────────────────────────────────────────
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


from routers.auth import router as auth_router
from routers.animal import router as animal_router
from routers.admin import router as admin_router
from routers.feed_classification import router as feed_classification_router
from routers.user_feedback import router as user_feedback_router

app.include_router(auth_router, prefix="/v1/auth")
app.include_router(animal_router, prefix="/v1/animal")
app.include_router(admin_router, prefix="/v1/admin")
app.include_router(feed_classification_router, prefix="/v1/feed-classification")
app.include_router(user_feedback_router, prefix="/v1/user-feedback")


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    from app.feed_cache import _redis

    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    redis_ok = False
    try:
        if _redis:
            await _redis.ping()
            redis_ok = True
    except Exception:
        pass

    healthy = db_ok and redis_ok
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "healthy" if healthy else "degraded",
            "database": "connected" if db_ok else "disconnected",
            "cache": "connected" if redis_ok else "disconnected",
            "version": "4.0.0",
        },
    )


@app.get("/")
async def root():
    return {
        "service": "RationSmart",
        "version": "4.0.0",
        "status": "running",
    }
