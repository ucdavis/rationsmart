"""Invisible-character clean-up for text read from uploaded or synced workbooks.

Copied text carries characters that render as nothing (zero-width spaces,
direction marks, BOMs, soft hyphens). A name holding them looks right on
screen, yet a search for its visible text misses it: CLIMDES's completedOnly
export (2026-10-03) had 28 English and 27 Vietnamese feed names like
"Whole plant \u200bDough\u200b," with U+200B in them.

Removal joins the neighbouring characters. In that export every U+200B sits
next to a space or a comma, so removing is right; turning it into a space
would put a space before the comma.
"""
import re

# Always removed: zero-width space, word joiner, BOM / zero-width no-break
# space, soft hyphen, LRM/RLM, bidi embeddings and overrides, bidi isolates.
_INVISIBLE = "\u200b\u2060\ufeff\u00ad\u200e\u200f\u202a-\u202e\u2066-\u2069"
# Zero-width non-joiner and joiner shape Devanagari and Kannada conjuncts,
# so local-language text keeps them; everywhere else they are noise.
_JOINERS = "\u200c\u200d"

_ALWAYS_RE = re.compile(f"[{_INVISIBLE}]")
_WITH_JOINERS_RE = re.compile(f"[{_INVISIBLE}{_JOINERS}]")


def clean_text(value: str, keep_joiners: bool = False) -> str:
    """Drop invisible characters, turn no-break spaces into spaces, trim.

    `keep_joiners=True` for local-language names (ZWNJ/ZWJ are meaningful in
    Indic scripts); English names, codes and keys use the default.
    """
    pattern = _ALWAYS_RE if keep_joiners else _WITH_JOINERS_RE
    return pattern.sub("", value).replace("\u00a0", " ").strip()
