"""
Auth service for RationSmart v4.0.

Covers PIN hashing/generation (Tasks 1.5+1.6), business-logic functions
(register, login, forgot_pin, change_pin, deactivate), and JWT helpers
(issue_token, verify_token) added in Task 2.6.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

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

_EMAIL_VERIFY_TOKEN_HOURS = 24


async def register(
    db: AsyncSession,
    name: str,
    email: str,
    pin: str,
    country_id: str,
) -> Tuple[Optional[UserInformationModel], Optional[str], Optional[str]]:
    """
    Create a new (unverified) user account and return a verification token.

    Returns (user, None, verify_token) on success or (None, error_message, None) on failure.
    Caller must commit the session after sending the verification email.
    """
    repo = UserRepository(db)

    if await repo.get_by_email(email):
        return None, "Email address already registered", None

    if not await repo.get_country_by_id(country_id):
        return None, "Invalid country selected", None

    user = await repo.create(
        name=name,
        email=email,
        pin_hash=hash_pin(pin),
        country_id=country_id,
        is_active=False,
        is_email_verified=False,
    )

    verify_token = secrets.token_urlsafe(48)
    expiry = datetime.now(timezone.utc) + timedelta(hours=_EMAIL_VERIFY_TOKEN_HOURS)
    await repo.set_email_verification_token(user, verify_token, expiry)

    logger.info("User registered (unverified): %s (id=%s)", email, user.id)
    return user, None, verify_token


async def login(
    db: AsyncSession,
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
    user = await repo.get_by_email(email)

    if not user or not user.pin_hash:
        return None, "User not found. Please check the email address entered.", False

    if not user.is_email_verified:
        return None, "EMAIL_NOT_VERIFIED", False

    if not user.is_active:
        return None, "Account is disabled. Please contact the administrator.", False

    if not verify_pin(pin, user.pin_hash):
        return None, "PIN is incorrect. Please try again.", False

    needs_reset = is_legacy_hash(user.pin_hash)
    return user, None, needs_reset


async def forgot_pin(
    db: AsyncSession,
    email: str,
) -> Tuple[bool, str, Optional[str]]:
    """
    Generate a new 6-digit PIN and store its hash.

    Returns (True, message, new_pin) on success.
    Caller must commit after confirming the email was sent.
    """
    repo = UserRepository(db)
    user = await repo.get_by_email(email)
    if not user:
        return False, "Email address not found in our system.", None

    new_pin = generate_pin()
    await repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN updated successfully", new_pin


async def change_pin(
    db: AsyncSession,
    email: str,
    current_pin: str,
    new_pin: str,
) -> Tuple[bool, str]:
    """
    Change a user's PIN after verifying the current one.

    Returns (True, message) on success, (False, error) on failure.
    Caller must commit.
    """
    user, error, _ = await login(db, email, current_pin)
    if not user:
        return False, error or "Authentication failed"

    repo = UserRepository(db)
    await repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN changed successfully"


async def set_new_pin(
    db: AsyncSession,
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
    user = await repo.get_by_email(email)
    if not user or not user.pin_hash:
        return False, "User not found."

    if not is_legacy_hash(user.pin_hash):
        return False, "PIN already upgraded. Please use the regular change-PIN flow."

    if not verify_pin(old_pin, user.pin_hash):
        return False, "Current PIN is incorrect."

    await repo.update_pin_hash(user, hash_pin(new_pin))
    return True, "PIN upgraded successfully"


async def deactivate_account(
    db: AsyncSession,
    user_id: str,
    pin: str,
) -> Tuple[bool, str]:
    """
    Deactivate a user account after PIN verification.

    Returns (True, message) on success, (False, error) on failure.
    Caller must commit.
    """
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        return False, "User not found."

    if not verify_pin(pin, user.pin_hash):
        return False, "Invalid PIN."

    if not user.is_active:
        return True, "Account is already inactive."

    await repo.deactivate(user)
    logger.info("Account deactivated: %s", user_id)
    return True, "Account deactivated successfully"


async def is_admin(db: AsyncSession, user_id: str) -> bool:
    return await UserRepository(db).is_admin(user_id)


# ── Email verification (Task 2.7) ─────────────────────────────────────────────

async def verify_email_token(
    db: AsyncSession,
    token: str,
) -> Tuple[Optional[UserInformationModel], Optional[str]]:
    """
    Consume an email-verification token and activate the user.

    Returns (user, None) on success, (None, error_message) on failure.
    Caller must commit.
    """
    repo = UserRepository(db)
    user = await repo.get_by_email_verify_token(token)

    if not user:
        return None, "Verification link is invalid or has already been used."

    expiry = user.email_verify_token_exp
    if expiry is None or datetime.now(timezone.utc) > expiry:
        return None, "Verification link has expired. Please request a new one."

    await repo.mark_email_verified(user)
    logger.info("Email verified: %s (id=%s)", user.email_id, user.id)
    return user, None


async def resend_verification(
    db: AsyncSession,
    email: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate a fresh verification token for an unverified user.

    Returns (new_token, None) on success, (None, error_message) on failure.
    Caller must commit after sending the email.
    """
    repo = UserRepository(db)
    user = await repo.get_by_email(email)

    if not user:
        # Deliberate vague response — don't reveal whether the email is registered
        return None, "If that email is registered and unverified, a new link has been sent."

    if user.is_email_verified:
        return None, "This account is already verified. Please log in."

    new_token = secrets.token_urlsafe(48)
    expiry = datetime.now(timezone.utc) + timedelta(hours=_EMAIL_VERIFY_TOKEN_HOURS)
    await repo.set_email_verification_token(user, new_token, expiry)

    logger.info("Resent verification email: %s (id=%s)", email, user.id)
    return new_token, None


# ── JWT helpers (Task 2.6) ────────────────────────────────────────────────────

def issue_token(user: UserInformationModel) -> Dict[str, Any]:
    """Issue a JWT for an authenticated user. Returns token info dict."""
    from app.config import settings
    import jwt

    now = datetime.now(timezone.utc)
    expire_minutes = settings.jwt_access_token_expire_minutes
    payload = {
        "sub": str(user.id),
        "email": user.email_id,
        "is_admin": user.is_admin,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expire_minutes * 60,
    }


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT. Raises jwt.InvalidTokenError on failure."""
    from app.config import settings
    import jwt

    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
