from typing import Generator
from sqlalchemy.orm import Session
from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# get_current_user (JWT) — added in Task 2.6
# get_storage_service (Azure Blob) — added in Task 5.x
