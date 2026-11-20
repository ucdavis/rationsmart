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
import zlib
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import segno
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape
from PIL import Image

from services.help_content import ENGLISH, MEDIA_URL_PREFIX, PLACEHOLDER_RE, HelpContent

logger = logging.getLogger(__name__)

EDITIONS = ("full", "quick")
TEMPLATES = Path(__file__).resolve().parent / "templates"
CACHE_DIR = Path(tempfile.gettempdir()) / "rationsmart-help-guide"

# FAQs printed on the back of the Quick Start card (manifest keys; missing ones are skipped).
QUICK_CARD_FAQS = ("no-diet-found", "feed-missing", "calf-milk", "margin-meaning", "pdf-pending")

AUDIENCES_LABELLED = ("advanced", "farmers", "nutritionists")  # "all" gets no chip
FILE_TITLES = {"full": "RationSmart_User_Guide", "quick": "RationSmart_Quick_Start"}

STEP_PICTURE_WIDTH = 780  # px; the help screenshots are 780 px wide already
POSTER_WIDTH = 640
JPEG_QUALITY = 85
QR_COLOUR = "#064E3B"
QUICK_CARD_PAGES = 2  # the Quick Start card is a 2-page handout; longer languages get the compact layout

_MEDIA_RE = re.compile(re.escape(MEDIA_URL_PREFIX) + r"/([^/?]+)/([^/?]+)")
_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]")

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html", "j2"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


# ── small helpers ─────────────────────────────────────────────────────────────


class _Texts:
    """The guide's own texts in one language (guide/<lang>.yaml, English per missing key).

    Calling it fills {placeholders} and returns escaped HTML (Markup), so a value may itself
    be Markup (e.g. the italic topic title in the trainers' tip).
    """

    def __init__(self, texts: Dict[str, Any]) -> None:
        self.texts = texts

    def raw(self, key: str, **values: Any) -> str:
        return PLACEHOLDER_RE.sub(lambda m: str(values.get(m.group(1), m.group(0))), self.texts[key])

    def __call__(self, key: str, **values: Any) -> Markup:
        parts, pos, text = [], 0, self.texts[key]
        for m in PLACEHOLDER_RE.finditer(text):
            parts.append(escape(text[pos:m.start()]))
            parts.append(escape(values[m.group(1)]) if m.group(1) in values else escape(m.group(0)))
            pos = m.end()
        parts.append(escape(text[pos:]))
        return Markup("").join(parts)

    def css(self, key: str, **values: str) -> str:
        """A CSS `content:` value: text as CSS strings, {placeholders} as the given CSS (counters)."""
        css_string = _css_string
        parts, pos, text = [], 0, self.texts[key]
        for m in PLACEHOLDER_RE.finditer(text):
            if m.start() > pos:
                parts.append(css_string(text[pos:m.start()]))
            parts.append(values.get(m.group(1), css_string(m.group(0))))
            pos = m.end()
        if pos < len(text):
            parts.append(css_string(text[pos:]))
        return " ".join(parts) or '""'

    def length(self, seconds: int) -> str:
        if seconds >= 60:
            return self.raw("length_min_sec", min=seconds // 60, sec=seconds % 60)
        return self.raw("length_sec", sec=seconds)

    def date(self, iso: str) -> str:
        try:
            d = _dt.date.fromisoformat(iso)
        except ValueError:
            return iso
        return self.raw("date", day=d.day, month=self.texts["months"][d.month - 1], year=d.year)


def _mmss(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def _qr(url: str) -> str:
    return segno.make(url, error="m").svg_data_uri(dark=QR_COLOUR, scale=4, border=0)


def _css_string(text: str) -> str:
    """Text as a quoted CSS string (backslash, quote and line breaks made safe)."""
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'


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
                pictures: _Pictures, tr: _Texts) -> Dict[str, Any]:
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
            "length": tr.length(v["seconds"]),
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
        "audience": tr.raw(f"audience_{audience}") if audience in AUDIENCES_LABELLED else None,
        "video": video,
        "steps": steps,
        "problems": t["problems"],
        "updated": t["updated"],
    }


def _guide_data(content: HelpContent, lang: Optional[str]) -> Dict[str, Any]:
    index = content.index(lang)
    served = index["language"]
    tr = _Texts(content.guide_texts(served)[1])
    pictures = _Pictures(content)
    topics = [_topic_view(content, t["key"], served, t["audience"], pictures, tr)
              for t in index["topics"]]
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
        "tr": tr,
        "en": _Texts(content.guide_texts(ENGLISH)[1]),
        "italic": lambda text: Markup("<i>%s</i>") % text,
        "translation": content.translation_info(served),
        "lang": served,
        "language": tr.raw("language_name"),
        "edition": index["content_version"],
        "updated": tr.date(max(t["updated"] for t in topics)),
        "topics": topics,
        "videos": sum(1 for t in topics if t["video"]),
        "quick": by_key[index["quick_start"]],
        "faqs": faqs,
        "quick_faqs": [faq_by_key[k] for k in QUICK_CARD_FAQS if k in faq_by_key],
    }


# ── public API ────────────────────────────────────────────────────────────────


def build_guide_html(content: HelpContent, edition: str, lang: Optional[str] = None,
                     compact: bool = False) -> str:
    """The guide as one self-contained HTML page (pictures and QR codes inline).

    compact=True tightens the Quick Start card's second page for long languages."""
    if edition not in EDITIONS:
        raise ValueError(f"unknown help guide edition {edition!r}")
    data = _guide_data(content, lang)
    tr: _Texts = data["tr"]
    counters = {"page": "counter(page)", "pages": "counter(pages)",
                "edition": _css_string(data["edition"])}
    css = (TEMPLATES / "guide.css").read_text(encoding="utf-8")
    for token, key in (("__HEADER_GUIDE__", "header_guide"), ("__FOOTER_EDITION__", "footer_edition"),
                       ("__FOOTER_PAGE__", "footer_page"), ("__FOOTER_CARD__", "footer_card"),
                       ("__FOOTER_CARD_PAGE__", "footer_card_page")):
        css = css.replace(token, tr.css(key, **counters))
    template = "guide.html.j2" if edition == "full" else "quick_start.html.j2"
    return _env.get_template(template).render(css=css, compact=compact, **data)


def page_count(pdf: bytes) -> Optional[int]:
    """Pages in a PDF made by WeasyPrint: the /Count of its page tree (object streams included)."""
    chunks = [pdf]
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf, re.S):
        try:
            chunks.append(zlib.decompress(m.group(1)))
        except zlib.error:
            pass
    counts = [int(n) for chunk in chunks
              for tree in re.findall(rb"<<[^<>]*/Type\s*/Pages\b[^<>]*>>", chunk)
              for n in re.findall(rb"/Count\s+(\d+)", tree)]
    return max(counts) if counts else None


def render_guide_pdf(content: HelpContent, edition: str, lang: Optional[str] = None) -> bytes:
    """Render one edition to PDF bytes (no cache). A Quick Start card that runs past
    QUICK_CARD_PAGES (a long translation) is rendered again in the compact layout."""
    from core.z_optimization.pdf_service import html_to_pdf  # heavy import, only when rendering

    pdf = html_to_pdf(build_guide_html(content, edition, lang))
    if edition == "quick" and (page_count(pdf) or 0) > QUICK_CARD_PAGES:
        pdf = html_to_pdf(build_guide_html(content, edition, lang, compact=True))
        pages = page_count(pdf)
        if (pages or 0) > QUICK_CARD_PAGES:
            logger.warning("Help guide: Quick Start card (%s) has %s pages even when compact; "
                           "shorten its texts", lang, pages)
    return pdf


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
