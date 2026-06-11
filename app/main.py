import logging
from fastapi import FastAPI

from app.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title="RationSmart",
    version="4.0.0",
    description="Dairy cattle least-cost diet optimization API",
)


@app.on_event("startup")
async def startup_event():
    # Task 1.3 adds ProcessPoolExecutor here.
    logger.info("RationSmart API starting up")


@app.on_event("shutdown")
async def shutdown_event():
    # Task 1.3 shuts down the ProcessPoolExecutor here.
    logger.info("RationSmart API shutting down")


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
