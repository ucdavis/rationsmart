"""Report paper size by the simulation's country (decided 2026-11-23).

A report prints on US Letter when the simulation country uses Letter, else on A4.
Letter content printed on A4 paper loses nothing (Letter is 6 mm wider, 18 mm
shorter: about 3 mm trimmed per side, inside the 13 mm margins); A4 printed on Letter
at actual size would lose the bottom of every page. So a country is on this list
when Letter is its everyday paper. Codes are alpha-3, like country.country_code.
"""
from typing import Optional

A4 = "A4"
LETTER = "LETTER"

LETTER_COUNTRIES = frozenset({
    "USA",  # United States
    "CAN",  # Canada
    "MEX",  # Mexico
    "PHL",  # Philippines
})


def country_paper_size(country_code: Optional[str]) -> str:
    """LETTER for a Letter country, else A4 (also when the country is unknown)."""
    return LETTER if (country_code or "").strip().upper() in LETTER_COUNTRIES else A4
