"""
Hindi Translation Workbook — Manual Round-Trip Script
======================================================

Usage:
    python tests/language/test_hindi_workbook.py [mode] [--env ENV]

mode (optional, default: both):
    export   Download the blank workbook template
    import   Upload the filled workbook
    both     Export → pause for manual fill → import

--env (optional, default: test):
    local    http://localhost:8000
    test     http://47.128.1.51:8000

Examples:
    python tests/language/test_hindi_workbook.py export --env local
    python tests/language/test_hindi_workbook.py import --env test
    python tests/language/test_hindi_workbook.py --env local

Workflow
--------
1. Run 'export':
   - Logs in as admin.
   - Finds India's country_id via GET /v1/auth/countries.
   - Confirms Hindi ('hi') is assigned to India.
   - Downloads the 3-sheet workbook → saves to WORKBOOK_PATH.

2. Open the saved .xlsx file.
   - Fill in the 'hi' column in the "Feeds" sheet with Hindi feed names.
   - Fill in the 'hi' column in "Feed Types" and "Feed Categories" if desired.
   - Save and close the file.

3. Run 'import':
   - Uploads the filled workbook via POST /v1/admin/translations/workbook.
   - Prints: rows processed / inserted / updated / skipped.
"""

import argparse
import pathlib
import sys

import requests

# ── Configuration ─────────────────────────────────────────────────────────────

ENVIRONMENTS = {
    "local": "http://localhost:8000",
    "test":  "http://47.128.1.51:8000",
}

ADMIN_EMAIL = "satishchandra@digitalgreen.org"
ADMIN_PIN   = "432156"

# Where the workbook file is saved / read from (relative to this script)
WORKBOOK_PATH = pathlib.Path(__file__).parent / "india_hindi_workbook.xlsx"

# Resolved at startup from --env; used by _url()
_base_url: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _url(path: str) -> str:
    return f"{_base_url.rstrip('/')}/{path.lstrip('/')}"


def login() -> str:
    """POST /v1/auth/login → return Bearer token."""
    print(f"[auth] Logging in as {ADMIN_EMAIL} ...")
    resp = requests.post(
        _url("/v1/auth/login"),
        json={"email_id": ADMIN_EMAIL, "pin": ADMIN_PIN},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"[auth] Login failed ({resp.status_code}): {resp.text}")
        sys.exit(1)
    data = resp.json()
    token = data.get("access_token") or data.get("token", {}).get("access_token")
    if not token:
        print(f"[auth] No access_token in response: {data}")
        sys.exit(1)
    print("[auth] Login successful.")
    return token


def get_india_country_id(token: str) -> str:
    """GET /v1/auth/countries → find India → return its UUID."""
    resp = requests.get(_url("/v1/auth/countries"), timeout=15)
    if resp.status_code != 200:
        print(f"[countries] Failed to fetch countries ({resp.status_code}): {resp.text}")
        sys.exit(1)
    countries = resp.json()
    india = next(
        (c for c in countries if c.get("name", "").strip().lower() == "india"),
        None,
    )
    if india is None:
        names = [c.get("name") for c in countries]
        print(f"[countries] 'India' not found. Available: {names}")
        sys.exit(1)
    country_id = india["id"]
    langs = india.get("languages", [])
    print(f"[countries] India found → id={country_id}, assigned languages={langs}")
    if "hi" not in langs:
        print(
            "\n[warn] Hindi ('hi') is NOT assigned to India in country_languages.\n"
            "       The exported workbook will have no 'hi' column.\n"
            "       An admin must first run:\n"
            "         POST /v1/admin/countries/{india_id}/languages/hi\n"
            "       (and ensure 'hi' exists in the languages table)\n"
            "       before continuing.\n"
        )
        ans = input("Continue anyway? (y/N): ").strip().lower()
        if ans != "y":
            sys.exit(0)
    return country_id


# ── Phase A: Export ───────────────────────────────────────────────────────────

def export_workbook(token: str, country_id: str) -> None:
    """GET /v1/admin/translations/workbook → save .xlsx to WORKBOOK_PATH."""
    print(f"\n[export] Requesting workbook for country_id={country_id} ...")
    resp = requests.get(
        _url("/v1/admin/translations/workbook"),
        params={"country_id": country_id},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[export] Failed ({resp.status_code}): {resp.text}")
        sys.exit(1)

    WORKBOOK_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKBOOK_PATH.write_bytes(resp.content)

    size_kb = len(resp.content) / 1024
    print(f"[export] Saved → {WORKBOOK_PATH}  ({size_kb:.1f} KB)")
    print()
    print("=" * 60)
    print("  NEXT STEPS")
    print("=" * 60)
    print(f"  1. Open:  {WORKBOOK_PATH}")
    print("  2. Go to the 'Feeds' sheet.")
    print("  3. Fill in the 'hi' column with Hindi feed names.")
    print("  4. Optionally fill 'hi' in 'Feed Types' and 'Feed Categories'.")
    print("  5. Save and close the file.")
    print("  6. Run:  python tests/language/test_hindi_workbook.py import")
    print("=" * 60)


# ── Phase B: Import ───────────────────────────────────────────────────────────

def import_workbook(token: str, country_id: str) -> None:
    """POST /v1/admin/translations/workbook → upload filled .xlsx."""
    if not WORKBOOK_PATH.exists():
        print(f"[import] Workbook not found at {WORKBOOK_PATH}")
        print("         Run 'export' first to download the template.")
        sys.exit(1)

    size_kb = WORKBOOK_PATH.stat().st_size / 1024
    print(f"\n[import] Uploading {WORKBOOK_PATH.name} ({size_kb:.1f} KB) ...")

    with WORKBOOK_PATH.open("rb") as f:
        resp = requests.post(
            _url("/v1/admin/translations/workbook"),
            params={"country_id": country_id},
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (WORKBOOK_PATH.name, f,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            timeout=60,
        )

    if resp.status_code != 200:
        print(f"[import] Failed ({resp.status_code}): {resp.text}")
        sys.exit(1)

    result = resp.json()
    print()
    print("=" * 60)
    print("  IMPORT SUMMARY")
    print("=" * 60)
    print(f"  Success          : {result.get('success')}")
    print()
    print("  Feed translations")
    print(f"    Inserted       : {result.get('feeds_inserted', 0)}")
    print(f"    Updated        : {result.get('feeds_updated', 0)}")
    print(f"    Skipped        : {result.get('feeds_skipped', 0)}")
    print()
    print("  Feed Type translations")
    print(f"    Inserted       : {result.get('types_inserted', 0)}")
    print(f"    Updated        : {result.get('types_updated', 0)}")
    print(f"    Skipped        : {result.get('types_skipped', 0)}")
    print()
    print("  Feed Category translations")
    print(f"    Inserted       : {result.get('categories_inserted', 0)}")
    print(f"    Updated        : {result.get('categories_updated', 0)}")
    print(f"    Skipped        : {result.get('categories_skipped', 0)}")

    warnings = result.get("warnings") or []
    if warnings:
        print()
        print(f"  Warnings ({len(warnings)}):")
        for w in warnings:
            print(f"    • {w}")

    print("=" * 60)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    global _base_url

    parser = argparse.ArgumentParser(
        description="Hindi translation workbook export / import tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="both",
        choices=["export", "import", "both"],
        help="export | import | both (default: both)",
    )
    parser.add_argument(
        "--env",
        default="test",
        choices=list(ENVIRONMENTS),
        help="target environment: local | test (default: test)",
    )
    args = parser.parse_args()

    _base_url = ENVIRONMENTS[args.env]
    print(f"[env]  {args.env} → {_base_url}")

    token = login()
    country_id = get_india_country_id(token)

    if args.mode in ("export", "both"):
        export_workbook(token, country_id)

    if args.mode == "both":
        print()
        input("Fill in the workbook, then press Enter to import ... ")
        token = login()  # re-login in case the session sat idle

    if args.mode in ("import", "both"):
        import_workbook(token, country_id)


if __name__ == "__main__":
    main()
