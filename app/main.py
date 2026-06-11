import logging
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level handle so routers can reach the pool via app.state.optimization_pool
# (set during lifespan startup; None before startup completes)
_optimization_pool: Optional[ProcessPoolExecutor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _optimization_pool
    _optimization_pool = ProcessPoolExecutor(max_workers=settings.optimization_pool_workers)
    app.state.optimization_pool = _optimization_pool
    logger.info(
        "RationSmart API starting up (optimization pool: %d workers)",
        settings.optimization_pool_workers,
    )
    yield
    # wait=False lets in-flight requests finish without blocking the shutdown signal
    _optimization_pool.shutdown(wait=False)
    logger.info("RationSmart API shut down")


app = FastAPI(
    title="RationSmart",
    version="4.0.0",
    description="Dairy cattle least-cost diet optimization API",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "4.0.0"}


@app.get("/")
async def root():
    return {
        "service": "RationSmart",
        "version": "4.0.0",
        "status": "running",
    }


# Routers registered in Task 2.x:
# app.include_router(auth_router,               prefix="/v1/auth")
# app.include_router(animal_router,             prefix="/v1/animal")
# app.include_router(admin_router,              prefix="/v1/admin")
# app.include_router(feed_classification_router,prefix="/v1/feed-classification")
# app.include_router(user_feedback_router,      prefix="/v1/user-feedback")
