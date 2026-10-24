"""
Language codes as BCP 47 tags (plan: docs/dev_docs/langauge_setup/v1_Language_Codes_BCP47_Plan.md).

Two jobs, kept apart on purpose:

1. Registering a code (admin API, feed-sync files): canonical_language_tag puts
   it in its standard form, using the IANA registry via langcodes:

     canonical_language_tag("BEN")        -> "bn"          3-letter -> 2-letter where one exists
     canonical_language_tag("pt-br")      -> "pt-BR"       standard case
     canonical_language_tag("zh-hans-cn") -> "zh-Hans-CN"
     canonical_language_tag("tl")         -> "fil"         deprecated alias replaced
     canonical_language_tag("zz")         -> ValueError    not a registered code

   Allowed shape (D6): language (2-3 letters) [-Script] [-Region], at most 10
   characters (the column size). Special codes (und, mul, zxx, mis),
   private-use codes (qaa-qtz, x-...), variants and extensions are refused.

2. Matching a code someone sends against stored codes (?lang=, profile,
   lookups by code): match_language_code compares case-insensitively with
   the codes that exist, and never calls langcodes. Public input can't grow
   langcodes' internal parse cache (it never evicts), and a row stored before
   BCP 47 (e.g. 'tl') still matches itself.
"""
import re
from functools import lru_cache
from typing import Iterable, List, Optional

import langcodes

MAX_TAG_LENGTH = 10

_SHAPE_RE = re.compile(r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$")
# Loose pre-check before langcodes: letters/digits/separators, short. Keeps junk
# (and very long strings) away from the library and its cache.
_RAW_RE = re.compile(r"^[A-Za-z]{1,8}([-_][A-Za-z0-9]{1,8}){0,3}$")
_SPECIAL_CODES = frozenset({"und", "mul", "zxx", "mis"})


@lru_cache(maxsize=1024)
def _canonical_or_error(text: str) -> tuple:
    """(tag, None) for a usable code, (None, reason) otherwise. Cached: pure."""
    if len(text) > 2 * MAX_TAG_LENGTH or not _RAW_RE.match(text):
        return None, f"'{text}' is not a valid language code"
    try:
        tag = langcodes.standardize_tag(text)
    except ValueError:
        return None, f"'{text}' is not a valid language code"
    language = tag.split("-")[0]
    if not langcodes.tag_is_valid(tag):
        return None, f"'{text}' is not a valid language code"
    if not _SHAPE_RE.match(tag):
        return None, (f"'{text}': only language, script and region parts are "
                      f"allowed (e.g. 'bn', 'pt-BR', 'zh-Hans-CN')")
    if language in _SPECIAL_CODES or "qaa" <= language <= "qtz":
        return None, f"'{text}' is a special or private-use code, not a language"
    if len(tag) > MAX_TAG_LENGTH:
        return None, f"'{tag}' is longer than {MAX_TAG_LENGTH} characters"
    return tag, None


def canonical_language_tag(raw: Optional[str]) -> str:
    """The standard BCP 47 form of `raw`; ValueError (readable message) if unusable."""
    text = str(raw or "").strip().replace("_", "-")
    if not text:
        raise ValueError("Language code cannot be empty")
    tag, reason = _canonical_or_error(text)
    if tag is None:
        raise ValueError(reason)
    return tag


def try_canonical_language_tag(raw: Optional[str]) -> Optional[str]:
    """Like canonical_language_tag, but None instead of an error."""
    if not raw:
        return None
    try:
        return canonical_language_tag(raw)
    except ValueError:
        return None


def fallback_chain(tag: str) -> List[str]:
    """Most specific first; drops the region, never the script.

    'pt-BR' -> ['pt-BR', 'pt']; 'zh-Hans-CN' -> ['zh-Hans-CN', 'zh-Hans'].
    A script is not dropped: a Traditional-Chinese reader should get English
    rather than Simplified, and 'sr-Latn' should not become Cyrillic 'sr'.
    """
    parts = tag.split("-")
    chain = [tag]
    if len(parts) > 1 and not _is_script(parts[1]):
        chain.append(parts[0])
    elif len(parts) > 2:
        chain.append("-".join(parts[:2]))
    return chain


def _is_script(subtag: str) -> bool:
    return len(subtag) == 4 and subtag.isalpha()


def match_language_code(
    raw: Optional[str], codes: Iterable[str], fallback: bool = False
) -> Optional[str]:
    """The stored code in `codes` that `raw` names, compared case-insensitively.

    With fallback, also tries fallback_chain ('pt-br' finds 'pt'). Never calls
    langcodes, so it is safe for public input. None when nothing matches.
    """
    text = str(raw or "").strip().replace("_", "-")
    if not text or len(text) > MAX_TAG_LENGTH:
        return None
    by_lower = {str(c).lower(): c for c in codes}
    candidates = fallback_chain(text) if fallback else [text]
    for candidate in candidates:
        found = by_lower.get(candidate.lower())
        if found is not None:
            return found
    return None
