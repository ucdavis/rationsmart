"""
PIN hashing, verification, and generation for RationSmart v4.0.

Replaces auth_utils.hash_pin / verify_pin / generate_random_pin.
DB-level helpers (get_user_by_email, authenticate_user, etc.) remain in
auth_utils.py until Task 2.7 wires the auth router.
"""
import hashlib
import secrets

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_pin() -> str:
    """Cryptographically secure random 6-digit PIN (100000–999999)."""
    return str(secrets.randbelow(900000) + 100000)


def hash_pin(pin: str) -> str:
    """Bcrypt-hash a PIN. Always produces a $2b$ prefixed string."""
    return pwd_context.hash(pin)


def verify_pin(pin: str, hashed_pin: str) -> bool:
    """
    Verify a PIN against a stored hash.

    Supports two formats transparently:
    - Bcrypt ($2b$ prefix): new v4.0 hashes.
    - Legacy SHA-256 (32-char hex salt + 64-char hex digest): old 4-digit PINs.
    """
    if hashed_pin.startswith("$2b$"):
        return pwd_context.verify(pin, hashed_pin)

    # Legacy SHA-256 path
    if len(hashed_pin) < 96:
        return False
    salt, stored_hash = hashed_pin[:32], hashed_pin[32:]
    computed = hashlib.sha256(f"{pin}{salt}".encode()).hexdigest()
    return secrets.compare_digest(computed, stored_hash)
