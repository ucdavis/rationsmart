"""
Auth service for RationSmart v4.0.

PIN hashing/generation (Tasks 1.5+1.6) are at the bottom.
Business-logic functions (register, login, forgot_pin, change_pin, deactivate)
wrap UserRepository so routers never write SQL directly.

JWT helpers (issue_token, verify_token, get_current_user) are added in Task 2.6.
"""
import hashlib
import logging
import secrets
from typing import Optional, Tuple

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db.models import UserInformationModel
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── PIN primitives ────────────────────────────────────────────────────────────

def generate_pin() -> str:
    """Cryptographically secure random 6-digit PIN (100000–999999)."""
    return str(secrets.randbelow(900000) + 100000)


def hash_pin(pin: str) -> str:
    """Bcrypt-hash a PIN. Always produces a $2b$ prefixed string."""
    return _pwd_context.hash(pin)


def verify_pin(pin: str, hashed_pin: str) -> bool:
    """
    Verify a PIN against a stored hash.

    Supports two formats transparently:
    - Bcrypt ($2b$ prefix): new v4.0 hashes for 6-digit PINs.
    - Legacy SHA-256 (32-char hex salt + 64-char hex digest): old 4-digit PINs.
    """
    if hashed_pin.startswith("$2b$"):
        return _pwd_context.verify(pin, hashed_pin)
    # Legacy SHA-256 path
    if len(hashed_pin) < 96:
        return False
    salt, stored = hashed_pin[:32], hashed_pin[32:]
    computed = hashlib.sha256(f"{pin}{salt}".encode()).hexdigest()
    return secrets.compare_digest(computed, stored)


def is_legacy_hash(hashed_pin: str) -> bool:
    """Returns True when the stored hash is the old SHA-256 format."""
    return not hashed_pin.startswith("$2b$")


# ── Business logic ────────────────────────────────────────────────────────────

def register(
    db: Session,
    name: str,
    email: str,
    pin: str,
    country_id: str,
) -> Tuple[Optional[UserInformationModel], Optional[str]]:
    """
    Create a new user account.

    Returns (user, None) on success or (None, error_message) on failure.
    Caller must commit the session.
    """
    repo = UserRepository(db)

    if repo.get_by_email(email):
        return None, "Email address already registered"

    if not repo.get_country_by_id(country_id):
        return None, "Invalid country selected"

    user = repo.create(
        name=name,
        email=email,
        pin_hash=hash_pin(pin),
        country_id=country_id,
    )
    logger.info("User registered: %s (id=%s)", email, user.id)
    return user, None


def login(
    db: Session,
    email: str,
    pin: str,
) -> Tuple[Optional[UserInformationModel], Optional[str], bool]:
    """
    Authenticate a user.

    Returns (user, None, requires_pin_reset) on success,
            (None, error_message, False) on failure.

    requires_pin_reset=True when the user authenticated with a legacy 4-digit
    SHA-256 hash — the router must force them through SetNewPin before issuing
    a JWT (Task 2.7 migration gate).
    """
    repo = UserRepository(db)
    user = repo.get_by_email(email)

    if not user or not user.pin_hash:
        return None, "User not found. Please check the email address entered.", False

    if not user.is_active:
        return None, "Account is disabled. Please contact the administrator.", False

    if not verify_pin(pin, user.pin_hash):
        return None, "PIN is incorrect. Please try again.", False

    needs_reset = is_legacy_hash(user.pin_hash)
    return user, None, needs_reset


def forgot_pin(
    db: Session,
    email: str,
) -> Tuple[bool, str, Optional[str]]:
    """
    Generate a new 6-digit PIN and store its hash.

    Returns (True, message, new_pin) on success.
    Caller must commit after confirming the email was sent.
    """
    repo = UserRepository(db)
    user = repo.get_by_email(email)
    if not user:
        return False, "Email address not found in our system.", None

    new_pin = generate_pin()
    repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN updated successfully", new_pin


def change_pin(
    db: Session,
    email: str,
    current_pin: str,
    new_pin: str,
) -> Tuple[bool, str]:
    """
    Change a user's PIN after verifying the current one.

    Returns (True, message) on success, (False, error) on failure.
    Caller must commit.
    """
    user, error, _ = login(db, email, current_pin)
    if not user:
        return False, error or "Authentication failed"

    repo = UserRepository(db)
    repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN changed successfully"


def set_new_pin(
    db: Session,
    email: str,
    old_pin: str,
    new_pin: str,
) -> Tuple[bool, str]:
    """
    PIN migration gate (Task 2.7): verify legacy 4-digit PIN and upgrade to
    a 6-digit bcrypt hash.

    Returns (True, message) on success, (False, error) on failure.
    Caller must commit.
    """
    repo = UserRepository(db)
    user = repo.get_by_email(email)
    if not user or not user.pin_hash:
        return False, "User not found."

    if not is_legacy_hash(user.pin_hash):
        return False, "PIN already upgraded. Please use the regular change-PIN flow."

    if not verify_pin(old_pin, user.pin_hash):
        return False, "Current PIN is incorrect."

    repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN upgraded successfully"


def deactivate_account(
    db: Session,
    user_id: str,
    pin: str,
) -> Tuple[bool, str]:
    """
    Deactivate a user account after PIN verification.

    Returns (True, message) on success, (False, error) on failure.
    Caller must commit.
    """
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if not user:
        return False, "User not found."

    if not verify_pin(pin, user.pin_hash):
        return False, "Invalid PIN."

    if not user.is_active:
        return True, "Account is already inactive."

    repo.deactivate(user)
    logger.info("Account deactivated: %s", user_id)
    return True, "Account deactivated successfully"


def is_admin(db: Session, user_id: str) -> bool:
    return UserRepository(db).is_admin(user_id)
