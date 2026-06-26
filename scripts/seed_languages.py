"""
Seed i18n language data (i18n V2 plan, Step 1.3).

Idempotent. Safe to run repeatedly — every write is an UPSERT / ON CONFLICT DO
NOTHING, so re-running never duplicates rows and never overwrites admin edits.

What it does
------------
1. Inserts the supported languages into `languages` ('en' is mandatory; the rest
   come from SUPPORTED_LANGUAGES below — edit that list as the final language set
   is confirmed, V2 Open Question #1).
2. Assigns 'en' to EVERY existing country in `country_languages` (the universal,
   non-removable baseline — I3 / Phase 5.2).
3. Assigns each country's local language(s) per COUNTRY_LANGUAGE_MAP, matched by
   country name or country_code (case-insensitive). Countries not in the map keep
   English only until an admin assigns more (Phase 5).

No translation rows are seeded (I3 — English is the implicit baseline).

Usage
-----
    python scripts/seed_languages.py            # seed against settings.database_url
    python scripts/seed_languages.py --dry-run  # report what would change, write nothing
"""
import argparse
import os
import sys

# Make the repo root importable when this file is run directly
# (`python scripts/seed_languages.py` otherwise puts only `scripts/` on sys.path,
# so `import app...` fails with ModuleNotFoundError).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text


# ── Editable configuration ────────────────────────────────────────────────────

# (code, display name). 'en' MUST stay first / present. Expand as the final
# language set is confirmed (V2 Open Question #1).
SUPPORTED_LANGUAGES = [
    ("en", "English"),
    ("hi", "Hindi"),
    ("kn", "Kannada"),
    ("vi", "Vietnamese"),
    ("sw", "Swahili"),
    ("am", "Amharic"),
]

# Local language assignments per country, keyed by a lowercased match token that
# is compared against BOTH country.name and country.country_code. 'en' is always
# added regardless of this map. Confirm the final map with the product team.
COUNTRY_LANGUAGE_MAP = {
    "vietnam": ["vi"],
    "vnm": ["vi"],
    "vn": ["vi"],
    "india": ["hi", "kn"],
    "ind": ["hi", "kn"],
    "in": ["hi", "kn"],
    "kenya": ["sw"],
    "ken": ["sw"],
    "ke": ["sw"],
    "tanzania": ["sw"],
    "tza": ["sw"],
    "tz": ["sw"],
    "ethiopia": ["am"],
    "eth": ["am"],
    "et": ["am"],
}


# ── Pure helper (unit-testable without a DB) ──────────────────────────────────

def resolve_country_languages(name: str, country_code: str) -> list[str]:
    """Return the ordered, de-duplicated language list for a country.

    'en' is always first. Local languages are appended from COUNTRY_LANGUAGE_MAP
    matched on either the (lowercased) name or country_code.
    """
    langs = ["en"]
    for token in (str(name or "").strip().lower(), str(country_code or "").strip().lower()):
        for lang in COUNTRY_LANGUAGE_MAP.get(token, []):
            if lang not in langs:
                langs.append(lang)
    return langs


# ── DB seeding ────────────────────────────────────────────────────────────────

def seed_languages(conn) -> dict:
    """UPSERT SUPPORTED_LANGUAGES into `languages`. Returns a small summary."""
    inserted = 0
    for code, name in SUPPORTED_LANGUAGES:
        result = conn.execute(
            text(
                "INSERT INTO languages (code, name, is_active) "
                "VALUES (:code, :name, true) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": code, "name": name},
        )
        inserted += result.rowcount or 0
    return {"languages_total": len(SUPPORTED_LANGUAGES), "languages_inserted": inserted}


def seed_country_languages(conn) -> dict:
    """Assign 'en' + mapped local languages to every existing country."""
    countries = conn.execute(text("SELECT id, name, country_code FROM country")).fetchall()
    assigned = 0
    for row in countries:
        for lang in resolve_country_languages(row.name, row.country_code):
            result = conn.execute(
                text(
                    "INSERT INTO country_languages (country_id, language_code) "
                    "VALUES (:cid, :lang) ON CONFLICT DO NOTHING"
                ),
                {"cid": str(row.id), "lang": lang},
            )
            assigned += result.rowcount or 0
    return {"countries": len(countries), "country_language_rows_inserted": assigned}


def run(database_url: str, dry_run: bool = False) -> dict:
    engine = create_engine(database_url)
    summary = {}
    with engine.begin() as conn:
        summary.update(seed_languages(conn))
        summary.update(seed_country_languages(conn))
        if dry_run:
            # Roll back by raising out of the transaction context.
            conn.rollback()
            summary["dry_run"] = True
    engine.dispose()
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed i18n language data (idempotent).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report changes without committing.")
    args = parser.parse_args()

    # Imported here so the module's pure helpers can be unit-tested without a
    # valid Settings()/.env present.
    from app.config import settings

    summary = run(settings.database_url, dry_run=args.dry_run)
    print("Seed summary:")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    if summary.get("languages_inserted", 0) == 0 and summary.get("country_language_rows_inserted", 0) == 0:
        print("  (nothing new — already seeded)")


if __name__ == "__main__":
    sys.exit(main())
