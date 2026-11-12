"""Create the first administrator of a deployment.

    ./deploy.sh create-admin --email admin@example.org --name "Admin Name" --country-code ETH
    (or, inside the api container: python -m scripts_2.create_admin ...)

The PIN is never given on the command line or stored in a file: it is asked for twice, or read from
the first line of stdin with --pin-stdin (for automation). It is hashed with the application's own
bcrypt hash (services.auth_service.hash_pin), so the account signs in like any other.

  * Needs the country to exist: load the data pack first (./deploy.sh seed).
  * Refuses if an active super admin already exists, unless --force.
  * Refuses if the email is already registered, unless --promote (which makes that existing account
    a verified super admin and leaves its PIN unchanged).
"""
import argparse
import getpass
import re
import sys
from typing import Iterable, Optional

import psycopg2

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PIN_RE = re.compile(r"^\d{6}$")


class AdminError(Exception):
    """The admin cannot be created; the message says why."""


def create_admin(conn, email: str, name: str, country_code: str, pin: Optional[str], force: bool = False, promote: bool = False) -> str:
    """Create (or, with promote, upgrade) a super admin in the caller's transaction; returns a description."""
    email = email.strip().lower()
    name = name.strip()
    if not _EMAIL_RE.match(email):
        raise AdminError("invalid email address")
    if not (1 <= len(name) <= 100):
        raise AdminError("name must be 1-100 characters")

    cur = conn.cursor()
    cur.execute("SELECT id FROM country WHERE country_code = %s", (country_code.upper(),))
    country = cur.fetchone()
    if country is None:
        raise AdminError(f"country '{country_code}' not found; load the data pack first (./deploy.sh seed)")

    cur.execute("SELECT count(*) FROM user_information WHERE admin_level = 'super_admin' AND is_active")
    if cur.fetchone()[0] and not force:
        raise AdminError("an active super admin already exists (use --force to add another)")

    cur.execute("SELECT id, is_admin FROM user_information WHERE email_id = %s", (email,))
    existing = cur.fetchone()
    if existing:
        if not promote:
            raise AdminError("that email is already registered; use --promote to make the existing account a super admin")
        cur.execute(
            "UPDATE user_information SET is_admin = true, admin_level = 'super_admin', is_active = true, "
            "is_email_verified = true, deactivated_by = NULL, deactivated_at = NULL WHERE id = %s",
            (existing[0],),
        )
        return f"existing account {email} is now a super admin (PIN unchanged)"

    if pin is None or not _PIN_RE.match(pin):
        raise AdminError("the PIN must be exactly 6 digits")
    from services.auth_service import hash_pin

    cur.execute(
        "INSERT INTO user_information (name, email_id, pin_hash, country_id, is_admin, admin_level, "
        "is_email_verified, requires_pin_reset, preferred_language) "
        "VALUES (%s, %s, %s, %s, true, 'super_admin', true, false, 'en') RETURNING id",
        (name, email, hash_pin(pin), country[0]),
    )
    return f"super admin {email} created (id {cur.fetchone()[0]})"


def _read_pin(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.readline().strip()
    first = getpass.getpass("PIN (6 digits): ")
    if getpass.getpass("Repeat PIN: ") != first:
        raise AdminError("the two PINs differ")
    return first


def main(argv: Optional[Iterable[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Create the first RationSmart super admin")
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--country-code", required=True, help="3-letter code of an existing country, e.g. ETH")
    ap.add_argument("--pin-stdin", action="store_true", help="read the PIN from the first line of stdin")
    ap.add_argument("--promote", action="store_true", help="make an already registered account a super admin")
    ap.add_argument("--force", action="store_true", help="allow when another super admin exists")
    args = ap.parse_args(argv)

    from app.config import settings

    conn = psycopg2.connect(settings.database_url)
    try:
        pin = None if args.promote else _read_pin(args.pin_stdin)
        message = create_admin(conn, args.email, args.name, args.country_code, pin, args.force, args.promote)
        conn.commit()
    except AdminError as exc:
        conn.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
