"""Build the printable Help guide from the In-App Help content.

Two editions, both made from the same validated content the app's Help shows
(services.help_content), so the paper and the app never disagree:

  * "full"  -- the User Guide: cover, how to use, contents, every topic, FAQs, back page;
  * "quick" -- the 2-page Quick Start card: the quick-start topic, common problems, topic list.

Videos reach paper through QR codes (segno, inline SVG) and "▶ m:ss" step times.
Pictures are re-encoded to JPEG and embedded as data: URIs, which keeps the PDF small
(the PWA proxy refuses answers over 10 MB) and lets pdf_service.report_url_fetcher stay
as strict as it is. The PDF itself is made by pdf_service.html_to_pdf, like every PDF.

guide_pdf() caches each PDF on disk by edition, served language and content_version:
a content change bumps the version, so a stale guide is never served.
"""
from __future__ import annotations

import base64
import datetime as _dt
import io
import logging
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import segno
from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image

from services.help_content import MEDIA_URL_PREFIX, HelpContent

logger = logging.getLogger(__name__)

EDITIONS = ("full", "quick")
TEMPLATES = Path(__file__).resolve().parent / "templates"
CACHE_DIR = Path(tempfile.gettempdir()) / "rationsmart-help-guide"

# FAQs printed on the back of the Quick Start card (manifest keys; missing ones are skipped).
QUICK_CARD_FAQS = ("no-diet-found", "feed-missing", "calf-milk", "margin-meaning", "pdf-pending")

AUDIENCE_LABELS = {"advanced": "Advanced", "farmers": "For farmers", "nutritionists": "For nutritionists"}
LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "om": "Oromo", "sw": "Swahili", "fil": "Filipino",
    "id": "Indonesian", "vi": "Vietnamese", "th": "Thai", "am": "Amharic",
}
FILE_TITLES = {"full": "RationSmart_User_Guide", "quick": "RationSmart_Quick_Start"}

STEP_PICTURE_WIDTH = 780  # px; the help screenshots are 780 px wide already
POSTER_WIDTH = 640
JPEG_QUALITY = 85
QR_COLOUR = "#064E3B"

_MEDIA_RE = re.compile(re.escape(MEDIA_URL_PREFIX) + r"/([^/?]+)/([^/?]+)")
_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]")

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html", "j2"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


# ── small helpers ─────────────────────────────────────────────────────────────


def _mmss(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def _length(seconds: int) -> str:
    return f"{seconds // 60} min {seconds % 60} s" if seconds >= 60 else f"{seconds} s"


def _qr(url: str) -> str:
    return segno.make(url, error="m").svg_data_uri(dark=QR_COLOUR, scale=4, border=0)


def _long_date(iso: str) -> str:
    try:
        d = _dt.date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{d.day} {d.strftime('%B')} {d.year}"


class _Pictures:
    """Help media URL -> inline JPEG data: URI, once per URL per build."""

    def __init__(self, content: HelpContent) -> None:
        self._content = content
        self._done: Dict[Tuple[str, int], Optional[str]] = {}

    def __call__(self, url: Optional[str], max_width: int = STEP_PICTURE_WIDTH) -> Optional[str]:
        if not url:
            return None
        key = (url, max_width)
        if key not in self._done:
            self._done[key] = self._encode(url, max_width)
        return self._done[key]

    def _encode(self, url: str, max_width: int) -> Optional[str]:
        m = _MEDIA_RE.search(url)
        found = self._content.media_file(*m.groups()) if m else None
        if not found:
            logger.warning("Help guide: picture %s is not a listed help file; left out", url)
            return None
        try:
            with Image.open(found[0]) as img:
                rgb = img.convert("RGB")
            if rgb.width > max_width:
                rgb = rgb.resize((max_width, round(rgb.height * max_width / rgb.width)), Image.LANCZOS)
            buf = io.BytesIO()
            rgb.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
        except Exception:  # a broken picture must not stop the guide
            logger.warning("Help guide: picture %s could not be read; left out", url, exc_info=True)
            return None
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# ── data for the templates ────────────────────────────────────────────────────


def _topic_view(content: HelpContent, key: str, lang: str, audience: str,
                pictures: _Pictures) -> Dict[str, Any]:
    t = content.topic(key, lang)
    v = t["video"]
    video = None
    chapter_at: Dict[int, str] = {}
    if v:
        url = f"https://youtu.be/{v['youtube_id']}"
        video = {
            "url": url,
            "short": url.split("://", 1)[1],
            "qr": _qr(url),
            "length": _length(v["seconds"]),
            "poster": pictures(v["poster"], POSTER_WIDTH),
            "chapters": [{"at": _mmss(c["start"]), "label": c["label"]} for c in v["chapters"]],
        }
        chapter_at = {c["start"]: c["label"] for c in v["chapters"]}
    steps = []
    for i, s in enumerate(t["steps"], start=1):
        start = s["video_start"] if video else None
        steps.append({
            "n": i,
            "text": s["text"],
            "image": pictures(s["image"]),
            "at": _mmss(start) if start is not None else None,
            # Short step name for the Quick Start card: the video chapter this step starts.
            "title": chapter_at.get(start, "") if start is not None else "",
        })
    return {
        "key": key,
        "number": t["number"],
        "title": t["title"],
        "summary": t["summary"],
        "screen_label": t["screen_label"],
        "audience": AUDIENCE_LABELS.get(audience),
        "video": video,
        "steps": steps,
        "problems": t["problems"],
        "updated": t["updated"],
    }


def _guide_data(content: HelpContent, lang: Optional[str]) -> Dict[str, Any]:
    index = content.index(lang)
    served = index["language"]
    pictures = _Pictures(content)
    topics = [_topic_view(content, t["key"], served, t["audience"], pictures) for t in index["topics"]]
    by_key = {t["key"]: t for t in topics}
    faqs = []
    for key, f in zip(content.faq_keys, index["faqs"]):
        linked = by_key.get(f["topic"]) if f["topic"] else None
        faqs.append({
            "key": key,
            "question": f["question"],
            "answer": f["answer"],
            "topic_number": linked["number"] if linked else None,
            "topic_title": linked["title"] if linked else None,
        })
    faq_by_key = {f["key"]: f for f in faqs}
    return {
        "lang": served,
        "language": LANGUAGE_NAMES.get(served, served),
        "edition": index["content_version"],
        "updated": _long_date(max(t["updated"] for t in topics)),
        "topics": topics,
        "videos": sum(1 for t in topics if t["video"]),
        "quick": by_key[index["quick_start"]],
        "faqs": faqs,
        "quick_faqs": [faq_by_key[k] for k in QUICK_CARD_FAQS if k in faq_by_key],
    }


# ── public API ────────────────────────────────────────────────────────────────


def build_guide_html(content: HelpContent, edition: str, lang: Optional[str] = None) -> str:
    """The guide as one self-contained HTML page (pictures and QR codes inline)."""
    if edition not in EDITIONS:
        raise ValueError(f"unknown help guide edition {edition!r}")
    data = _guide_data(content, lang)
    css = (TEMPLATES / "guide.css").read_text(encoding="utf-8").replace("EDITION", _SAFE_RE.sub("_", data["edition"]))
    template = "guide.html.j2" if edition == "full" else "quick_start.html.j2"
    return _env.get_template(template).render(css=css, **data)


def render_guide_pdf(content: HelpContent, edition: str, lang: Optional[str] = None) -> bytes:
    """Render one edition to PDF bytes (no cache)."""
    from core.z_optimization.pdf_service import html_to_pdf  # heavy import, only when rendering

    return html_to_pdf(build_guide_html(content, edition, lang))


def guide_filename(content: HelpContent, edition: str, lang: Optional[str] = None) -> str:
    """Download name, e.g. RationSmart_User_Guide_en_2026-11-19.1.pdf."""
    served = content.index(lang)["language"]
    version = _SAFE_RE.sub("_", content.content_version)
    return f"{FILE_TITLES[edition]}_{_SAFE_RE.sub('_', served)}_{version}.pdf"


_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(name: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(name, threading.Lock())


def guide_pdf(content: HelpContent, edition: str, lang: Optional[str] = None,
              cache_dir: Path = CACHE_DIR) -> Tuple[Path, str]:
    """(path of the cached PDF, download name). Renders once per edition, language and version."""
    if edition not in EDITIONS:
        raise ValueError(f"unknown help guide edition {edition!r}")
    name = guide_filename(content, edition, lang)
    path = cache_dir / name
    if path.is_file():
        return path, name
    with _lock_for(name):
        if path.is_file():  # another request made it while this one waited
            return path, name
        cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        pdf = render_guide_pdf(content, edition, lang)
        tmp = path.with_name(f".{name}.{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_bytes(pdf)
        os.replace(tmp, path)  # atomic: other workers see the old state or the whole file
        logger.info("Help guide %s rendered (%d bytes)", name, len(pdf))
    return path, name
