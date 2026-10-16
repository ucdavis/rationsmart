import logging

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

logger = logging.getLogger(__name__)

_DATABASE_URL = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")

_CONNECT_ARGS = {"timeout": 30, "command_timeout": 60}

engine = create_async_engine(
    _DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    connect_args=_CONNECT_ARGS,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

logger.info("Async database engine initialized")


def create_task_engine() -> AsyncEngine:
    """Engine for code that runs its own event loop, such as a Celery task
    calling asyncio.run(). Dispose of it before that loop closes.

    The shared `engine` above must not be used there: an asyncpg connection
    belongs to the loop that opened it, so its pool would hand the next run a
    connection tied to a closed loop ("RuntimeError: Event loop is closed").
    NullPool keeps no connection past the run.
    """
    return create_async_engine(_DATABASE_URL, poolclass=NullPool, connect_args=_CONNECT_ARGS)
