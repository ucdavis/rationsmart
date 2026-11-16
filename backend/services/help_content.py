"""In-App Help content: read backend/help_content/ once, validate it, serve it per language.

Layout (all plain text, tracked in git):

    help_content/
      manifest.yaml            topic order, numbers, audience, screen label, related/next,
                               the screen -> topic map, FAQ order
      topics/en/<key>.yaml     English master: title, summary, updated, video, steps, problems
      topics/<lang>/<key>.yaml same shape, text only; anything missing falls back to English
      faqs/en.yaml             FAQ key -> question, answer (English master)
      faqs/<lang>.yaml         same keys, translated
      media/en/<file>          images named in the English files (WebP/PNG, <= 300 KB)
      media/<lang>/<file>      optional same-name image for that language

Rules (checked at load; any problem makes the whole content unavailable, so a bad file
fails the unit tests instead of reaching users):
- every topic, screen, related, next and FAQ reference points at a real topic;
- every image named in English exists, is WebP/PNG and at most 300 KB;
- translation files use only keys the English files have (no extra steps or problems);
- no '<' or '>' in any text, so no HTML can reach the app;
- YouTube ids are 11 characters of [A-Za-z0-9_-].

Language: `?lang=` is matched with match_language_code (no langcodes call on public
input). `fallback` is true when a language other than English was asked and some text
in the answer is English (also when that language has no help files at all).
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import logging
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from app.language_tags import match_language_code

logger = logging.getLogger(__name__)

HELP_ROOT = Path(__file__).resolve().parents[1] / "help_content"
ENGLISH = "en"

TOPIC_KEY_RE = re.compile(r"^[a-z0-9-]{1,40}$")
SCREEN_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{0,59}$")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
LANG_DIR_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
MEDIA_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,80}\.(webp|png)$")
MAX_MEDIA_BYTES = 300 * 1024
MEDIA_TYPES = {".webp": "image/webp", ".png": "image/png"}
AUDIENCES = ("all", "farmers", "advanced", "nutritionists")
MEDIA_URL_PREFIX = "/v1/help/media"


class HelpContentError(Exception):
    """The help content is missing or invalid; the message lists every problem."""


# ── small checking helpers ────────────────────────────────────────────────────


class _Problems:
    def __init__(self) -> None:
        self.items: List[str] = []

    def add(self, where: str, what: str) -> None:
        self.items.append(f"{where}: {what}")


def _read_yaml(path: Path, problems: _Problems) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        problems.add(str(path.name), f"cannot be read ({exc.__class__.__name__}: {exc})")
        return None


def _text(value: Any, where: str, problems: _Problems, required: bool = True) -> Optional[str]:
    """A plain-text field: a non-empty string without '<' or '>'."""
    if value is None:
        if required:
            problems.add(where, "missing")
        return None
    if not isinstance(value, str) or not value.strip():
        problems.add(where, "must be non-empty text")
        return None
    if "<" in value or ">" in value:
        problems.add(where, "must be plain text (no '<' or '>')")
        return None
    return value.strip()


def _int(value: Any, where: str, problems: _Problems, minimum: int = 0) -> Optional[int]:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        problems.add(where, f"must be a whole number >= {minimum}")
        return None
    return value


def _list(value: Any, where: str, problems: _Problems) -> List[Any]:
    """A YAML list; None means empty. Anything else is a problem (never sliced or iterated)."""
    if value is None:
        return []
    if not isinstance(value, list):
        problems.add(where, "must be a list")
        return []
    return value


def _only_keys(data: Any, allowed: set, where: str, problems: _Problems) -> bool:
    if not isinstance(data, dict):
        problems.add(where, "must be a mapping")
        return False
    extra = sorted(set(data) - allowed)
    if extra:
        problems.add(where, f"unknown key(s): {', '.join(map(str, extra))}")
    return True


def _media_name(value: Any, where: str, problems: _Problems) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str) or not MEDIA_NAME_RE.fullmatch(value):
        problems.add(where, "image must be a lower-case .webp or .png file name")
        return None
    return value


# ── file shapes ───────────────────────────────────────────────────────────────


def _video(data: Any, where: str, problems: _Problems) -> Optional[Dict[str, Any]]:
    if data is None:
        return None
    if not _only_keys(data, {"youtube_id", "seconds", "poster", "chapters"}, where, problems):
        return None
    yid = data.get("youtube_id")
    if not isinstance(yid, str) or not YOUTUBE_ID_RE.fullmatch(yid):
        problems.add(f"{where}.youtube_id", "must be 11 characters of A-Z a-z 0-9 _ -")
    seconds = _int(data.get("seconds"), f"{where}.seconds", problems, minimum=1)
    chapters = []
    for i, ch in enumerate(_list(data.get("chapters"), f"{where}.chapters", problems)):
        cw = f"{where}.chapters[{i}]"
        if _only_keys(ch, {"start", "label"}, cw, problems):
            chapters.append({
                "start": _int(ch.get("start"), f"{cw}.start", problems),
                "label": _text(ch.get("label"), f"{cw}.label", problems),
            })
    return {
        "youtube_id": yid,
        "seconds": seconds,
        "poster": _media_name(data.get("poster"), f"{where}.poster", problems),
        "chapters": chapters,
    }


def _english_topic(data: Any, where: str, problems: _Problems) -> Optional[Dict[str, Any]]:
    allowed = {"title", "summary", "updated", "video", "steps", "problems"}
    if not _only_keys(data, allowed, where, problems):
        return None
    updated = data.get("updated")
    if isinstance(updated, _dt.date):
        updated = updated.isoformat()
    if not isinstance(updated, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", updated):
        problems.add(f"{where}.updated", "must be a date YYYY-MM-DD")
    steps = []
    raw_steps = data.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        problems.add(f"{where}.steps", "needs at least one step")
        raw_steps = []
    for i, st in enumerate(raw_steps):
        sw = f"{where}.steps[{i}]"
        if _only_keys(st, {"text", "image", "video_start"}, sw, problems):
            vs = st.get("video_start")
            steps.append({
                "text": _text(st.get("text"), f"{sw}.text", problems),
                "image": _media_name(st.get("image"), f"{sw}.image", problems),
                "video_start": None if vs is None else _int(vs, f"{sw}.video_start", problems),
            })
    probs = []
    for i, pr in enumerate(_list(data.get("problems"), f"{where}.problems", problems)):
        pw = f"{where}.problems[{i}]"
        if _only_keys(pr, {"title", "text"}, pw, problems):
            probs.append({
                "title": _text(pr.get("title"), f"{pw}.title", problems),
                "text": _text(pr.get("text"), f"{pw}.text", problems),
            })
    video = _video(data.get("video"), f"{where}.video", problems)
    # A step's "watch this step" time must point inside the English video.
    for i, st in enumerate(steps):
        start = st["video_start"]
        if start is None:
            continue
        if video is None:
            problems.add(f"{where}.steps[{i}].video_start", "set, but the topic has no video")
        elif video["seconds"] is not None and start >= video["seconds"]:
            problems.add(f"{where}.steps[{i}].video_start",
                         f"{start} s is past the end of the video ({video['seconds']} s)")
    return {
        "title": _text(data.get("title"), f"{where}.title", problems),
        "summary": _text(data.get("summary"), f"{where}.summary", problems),
        "updated": updated,
        "video": video,
        "steps": steps,
        "problems": probs,
    }


def _translated_topic(data: Any, english: Dict[str, Any], where: str,
                      problems: _Problems) -> Dict[str, Any]:
    """Text only, same shape as English; a missing field means 'use English'."""
    out: Dict[str, Any] = {"steps": [], "problems": []}
    if not _only_keys(data, {"title", "summary", "video", "steps", "problems"}, where, problems):
        return out
    out["title"] = _text(data.get("title"), f"{where}.title", problems, required=False)
    out["summary"] = _text(data.get("summary"), f"{where}.summary", problems, required=False)
    # A translated video replaces the English one completely (its own id, length, chapters).
    out["video"] = _video(data.get("video"), f"{where}.video", problems)
    if out["video"] and out["video"].get("poster"):
        problems.add(f"{where}.video.poster", "set posters in the English file only")
    steps = _list(data.get("steps"), f"{where}.steps", problems)
    if len(steps) > len(english["steps"]):
        problems.add(f"{where}.steps", f"has {len(steps)} steps; English has {len(english['steps'])}")
    for i, st in enumerate(steps[: len(english["steps"])]):
        sw = f"{where}.steps[{i}]"
        out["steps"].append(
            _text(st.get("text"), f"{sw}.text", problems, required=False)
            if _only_keys(st, {"text"}, sw, problems) else None
        )
    probs = _list(data.get("problems"), f"{where}.problems", problems)
    if len(probs) > len(english["problems"]):
        problems.add(f"{where}.problems", f"has {len(probs)}; English has {len(english['problems'])}")
    for i, pr in enumerate(probs[: len(english["problems"])]):
        pw = f"{where}.problems[{i}]"
        if _only_keys(pr, {"title", "text"}, pw, problems):
            out["problems"].append({
                "title": _text(pr.get("title"), f"{pw}.title", problems, required=False),
                "text": _text(pr.get("text"), f"{pw}.text", problems, required=False),
            })
        else:
            out["problems"].append({})
    return out


def _faqs(data: Any, where: str, problems: _Problems, required: bool) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    if not isinstance(data, dict):
        problems.add(where, "must map FAQ keys to a question and an answer")
        return out
    for key, item in data.items():
        fw = f"{where}.{key}"
        if _only_keys(item, {"question", "answer"}, fw, problems):
            out[str(key)] = {
                "question": _text(item.get("question"), f"{fw}.question", problems, required),
                "answer": _text(item.get("answer"), f"{fw}.answer", problems, required),
            }
    return out


# ── the content object ────────────────────────────────────────────────────────


class _Pick:
    """Chooses translated text, else English, and remembers when English was used."""

    def __init__(self, asked_other: bool) -> None:
        self.asked_other = asked_other
        self.fallback = False

    def __call__(self, translated: Optional[str], english: str) -> str:
        if translated:
            return translated
        if self.asked_other:
            self.fallback = True
        return english


def _asked_other_than_english(lang: Optional[str]) -> bool:
    raw = str(lang or "").strip()
    if not raw:
        return False
    return re.split(r"[-_]", raw, maxsplit=1)[0].lower() != ENGLISH


class HelpContent:
    """Validated help content; every public method returns contract-shaped dicts."""

    def __init__(self, manifest: Dict[str, Any], topics: Dict[str, Dict[str, Any]],
                 faqs: Dict[str, Dict[str, Dict[str, str]]],
                 media: Dict[str, Dict[str, Tuple[Path, str]]]) -> None:
        self._manifest = manifest
        self._topics = topics  # lang -> key -> topic (English full, others text only)
        self._faqs = faqs  # lang -> faq key -> {question, answer}
        self._media = media  # lang -> file name -> (path, short hash)
        self.languages = sorted(set(topics) | set(faqs) | {ENGLISH})

    @property
    def content_version(self) -> str:
        return self._manifest["content_version"]

    def _served(self, lang: Optional[str]) -> str:
        return match_language_code(lang, self.languages, fallback=True) or ENGLISH

    def _media_url(self, lang: str, name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        folder = lang if name in self._media.get(lang, {}) else ENGLISH
        _, digest = self._media[folder][name]
        return f"{MEDIA_URL_PREFIX}/{folder}/{name}?v={digest}"

    def _own_video(self, lang: str, key: str) -> bool:
        """True when `lang` has its own video for this topic (it replaces the English one)."""
        if lang == ENGLISH:
            return False
        return bool(self._topics.get(lang, {}).get(key, {}).get("video"))

    def _video_for(self, lang: str, key: str,
                   pick: Optional[_Pick] = None) -> Optional[Dict[str, Any]]:
        english = self._topics[ENGLISH][key]["video"]
        own = self._own_video(lang, key)
        video = self._topics[lang][key]["video"] if own else english
        if not video:
            return None
        poster_name = english.get("poster") if english else None
        chapters = []
        for ch in video["chapters"]:
            # English chapter names shown to a non-English user count as fallback text.
            label = ch["label"] if own or pick is None else pick(None, ch["label"])
            chapters.append({"start": ch["start"], "label": label})
        return {
            "youtube_id": video["youtube_id"],
            "seconds": video["seconds"],
            "poster": self._media_url(lang, poster_name),
            "chapters": chapters,
        }

    def index(self, lang: Optional[str]) -> Dict[str, Any]:
        served = self._served(lang)
        pick = _Pick(_asked_other_than_english(lang))
        tr_topics = self._topics.get(served, {}) if served != ENGLISH else {}
        tr_faqs = self._faqs.get(served, {}) if served != ENGLISH else {}
        topics = []
        for entry in self._manifest["topics"]:
            key = entry["key"]
            en, tr = self._topics[ENGLISH][key], tr_topics.get(key, {})
            video = self._video_for(served, key)
            topics.append({
                "key": key,
                "number": entry["number"],
                "title": pick(tr.get("title"), en["title"]),
                "summary": pick(tr.get("summary"), en["summary"]),
                "audience": entry["audience"],
                "video_seconds": video["seconds"] if video else None,
            })
        faqs = []
        for entry in self._manifest["faqs"]:
            en, tr = self._faqs[ENGLISH][entry["key"]], tr_faqs.get(entry["key"], {})
            faqs.append({
                "question": pick(tr.get("question"), en["question"]),
                "answer": pick(tr.get("answer"), en["answer"]),
                "topic": entry["topic"],
            })
        return {
            "content_version": self.content_version,
            "language": served,
            "fallback": pick.fallback,
            "quick_start": self._manifest["quick_start"],
            "topics": topics,
            "screens": {k: {"topic": v["topic"], "related": list(v["related"])}
                        for k, v in self._manifest["screens"].items()},
            "faqs": faqs,
        }

    def topic(self, key: str, lang: Optional[str]) -> Optional[Dict[str, Any]]:
        if key not in self._topics[ENGLISH]:
            return None
        served = self._served(lang)
        pick = _Pick(_asked_other_than_english(lang))
        en = self._topics[ENGLISH][key]
        tr = self._topics.get(served, {}).get(key, {}) if served != ENGLISH else {}
        entry = self._manifest["topic_by_key"][key]
        tr_steps, tr_probs = tr.get("steps", []), tr.get("problems", [])
        # Step timings belong to the English video; a language's own video has its own
        # timing, so its steps get no "watch this step" time.
        own_video = self._own_video(served, key)
        steps = []
        for i, st in enumerate(en["steps"]):
            steps.append({
                "text": pick(tr_steps[i] if i < len(tr_steps) else None, st["text"]),
                "image": self._media_url(served, st["image"]),
                "video_start": None if own_video else st["video_start"],
            })
        probs = []
        for i, pr in enumerate(en["problems"]):
            t = tr_probs[i] if i < len(tr_probs) else {}
            probs.append({"title": pick(t.get("title"), pr["title"]),
                          "text": pick(t.get("text"), pr["text"])})
        title = pick(tr.get("title"), en["title"])
        summary = pick(tr.get("summary"), en["summary"])
        video = self._video_for(served, key, pick)  # may mark English chapter names
        return {
            "key": key,
            "number": entry["number"],
            "language": served,
            "fallback": pick.fallback,  # every text above has been picked by now
            "title": title,
            "summary": summary,
            "screen_label": entry["screen_label"],
            "video": video,
            "steps": steps,
            "problems": probs,
            "related": list(entry["related"]),
            "next": entry["next"],
            "updated": en["updated"],
        }

    def media_file(self, lang: str, name: str) -> Optional[Tuple[Path, str]]:
        """(path, media type) for a listed image, else None. Never builds a path from input."""
        found = self._media.get(lang, {}).get(name)
        if not found:
            return None
        return found[0], MEDIA_TYPES[found[0].suffix]


# ── loading ───────────────────────────────────────────────────────────────────


def _manifest(data: Any, problems: _Problems) -> Dict[str, Any]:
    where = "manifest.yaml"
    out: Dict[str, Any] = {"topics": [], "screens": {}, "faqs": [], "topic_by_key": {}}
    if not _only_keys(data, {"content_version", "quick_start", "topics", "screens", "faqs"},
                      where, problems):
        return out
    out["content_version"] = _text(data.get("content_version"), f"{where}.content_version", problems)
    out["quick_start"] = data.get("quick_start")
    numbers = set()
    for i, t in enumerate(_list(data.get("topics"), f"{where}.topics", problems)):
        tw = f"{where}.topics[{i}]"
        if not _only_keys(t, {"key", "number", "audience", "screen_label", "related", "next"},
                          tw, problems):
            continue
        key = t.get("key")
        if not isinstance(key, str) or not TOPIC_KEY_RE.fullmatch(key):
            problems.add(f"{tw}.key", "must match [a-z0-9-], 1-40 characters")
            continue
        if key in out["topic_by_key"]:
            problems.add(f"{tw}.key", f"duplicate topic '{key}'")
            continue
        number = _int(t.get("number"), f"{tw}.number", problems)
        if number is not None and number in numbers:
            problems.add(f"{tw}.number", f"duplicate number {number}")
        numbers.add(number)
        if t.get("audience") not in AUDIENCES:
            problems.add(f"{tw}.audience", f"must be one of {', '.join(AUDIENCES)}")
        entry = {
            "key": key,
            "number": number,
            "audience": t.get("audience"),
            "screen_label": _text(t.get("screen_label"), f"{tw}.screen_label", problems),
            "related": list(_list(t.get("related"), f"{tw}.related", problems)),
            "next": t.get("next"),
        }
        out["topics"].append(entry)
        out["topic_by_key"][key] = entry
    if not out["topics"]:
        problems.add(f"{where}.topics", "needs at least one topic")
    screens = data.get("screens") or {}
    if not isinstance(screens, dict):
        problems.add(f"{where}.screens", "must map screen keys to a topic")
        screens = {}
    for skey, s in screens.items():
        sw = f"{where}.screens.{skey}"
        if not isinstance(skey, str) or not SCREEN_KEY_RE.fullmatch(skey):
            problems.add(sw, "screen key must match [a-z0-9.-]")
            continue
        if _only_keys(s, {"topic", "related"}, sw, problems):
            out["screens"][skey] = {"topic": s.get("topic"),
                                    "related": list(_list(s.get("related"), f"{sw}.related", problems))}
    seen_faq = set()
    for i, f in enumerate(_list(data.get("faqs"), f"{where}.faqs", problems)):
        fw = f"{where}.faqs[{i}]"
        if _only_keys(f, {"key", "topic"}, fw, problems):
            fkey = f.get("key")
            if not isinstance(fkey, str) or not TOPIC_KEY_RE.fullmatch(fkey) or fkey in seen_faq:
                problems.add(f"{fw}.key", "must be a unique key of [a-z0-9-]")
                continue
            seen_faq.add(fkey)
            out["faqs"].append({"key": fkey, "topic": f.get("topic")})
    return out


def _check_references(manifest: Dict[str, Any], problems: _Problems) -> None:
    keys = set(manifest["topic_by_key"])

    def ref(value: Any, where: str, allow_none: bool = False) -> None:
        if value is None and allow_none:
            return
        if value not in keys:
            problems.add(where, f"unknown topic '{value}'")

    ref(manifest.get("quick_start"), "manifest.yaml.quick_start")
    for t in manifest["topics"]:
        for r in t["related"]:
            ref(r, f"manifest.yaml.topics.{t['key']}.related")
        ref(t["next"], f"manifest.yaml.topics.{t['key']}.next", allow_none=True)
    for skey, s in manifest["screens"].items():
        ref(s["topic"], f"manifest.yaml.screens.{skey}.topic")
        for r in s["related"]:
            ref(r, f"manifest.yaml.screens.{skey}.related")
    for f in manifest["faqs"]:
        ref(f["topic"], f"manifest.yaml.faqs.{f['key']}.topic", allow_none=True)


def _lang_dirs(folder: Path, problems: _Problems) -> List[str]:
    if not folder.is_dir():
        return []
    langs = []
    for p in sorted(folder.iterdir()):
        if p.name.startswith("."):
            continue
        if not p.is_dir() or not LANG_DIR_RE.fullmatch(p.name):
            problems.add(f"{folder.name}/{p.name}", "must be a folder named by a language code")
            continue
        langs.append(p.name)
    return langs


def _load_media(root: Path, english_names: set, problems: _Problems) -> Dict[str, Dict[str, Tuple[Path, str]]]:
    media: Dict[str, Dict[str, Tuple[Path, str]]] = {}
    for lang in _lang_dirs(root / "media", problems):
        media[lang] = {}
        for p in sorted((root / "media" / lang).iterdir()):
            if p.name.startswith("."):
                continue
            where = f"media/{lang}/{p.name}"
            if not p.is_file() or not MEDIA_NAME_RE.fullmatch(p.name):
                problems.add(where, "must be a lower-case .webp or .png file")
                continue
            if p.name not in english_names:
                problems.add(where, "not named in any English topic")
                continue
            try:
                data = p.read_bytes()
            except OSError as exc:
                problems.add(where, f"cannot be read ({exc.__class__.__name__})")
                continue
            if len(data) > MAX_MEDIA_BYTES:
                problems.add(where, f"is {len(data) // 1024} KB; the limit is {MAX_MEDIA_BYTES // 1024} KB")
                continue
            media[lang][p.name] = (p.resolve(), hashlib.sha256(data).hexdigest()[:10])
    for name in sorted(english_names):
        if name not in media.get(ENGLISH, {}):
            problems.add(f"media/{ENGLISH}/{name}", "is named in an English topic but missing")
    return media


def help_content_problems(root: Path = HELP_ROOT) -> List[str]:
    """Every problem in the content at `root` (empty list = valid)."""
    try:
        load_help_content(root)
    except HelpContentError as exc:
        return str(exc).splitlines()
    return []


def load_help_content(root: Path = HELP_ROOT) -> HelpContent:
    """Load and validate the content at `root`. Any failure is a HelpContentError, so
    /v1/help answers 503 rather than 500 even for a case the checks did not foresee."""
    try:
        return _load(root)
    except HelpContentError:
        raise
    except Exception as exc:
        raise HelpContentError(
            f"{root}: unexpected error while loading ({exc.__class__.__name__}: {exc})"
        ) from exc


def _load(root: Path) -> HelpContent:
    problems = _Problems()
    manifest_path = root / "manifest.yaml"
    if not manifest_path.is_file():
        raise HelpContentError(f"{manifest_path}: missing")
    manifest = _manifest(_read_yaml(manifest_path, problems), problems)
    _check_references(manifest, problems)
    keys = set(manifest["topic_by_key"])

    topics: Dict[str, Dict[str, Any]] = {ENGLISH: {}}
    en_dir = root / "topics" / ENGLISH
    for key in manifest["topic_by_key"]:
        path = en_dir / f"{key}.yaml"
        if not path.is_file():
            problems.add(f"topics/{ENGLISH}/{key}.yaml", "missing")
            continue
        topic = _english_topic(_read_yaml(path, problems), f"topics/{ENGLISH}/{key}", problems)
        if topic:
            topics[ENGLISH][key] = topic
    for lang in _lang_dirs(root / "topics", problems):
        for path in sorted((root / "topics" / lang).glob("*")):
            if path.name.startswith("."):
                continue
            key = path.stem
            where = f"topics/{lang}/{path.name}"
            if path.suffix != ".yaml" or key not in keys:
                problems.add(where, "not a topic in manifest.yaml")
                continue
            if lang == ENGLISH or key not in topics[ENGLISH]:
                continue
            topics.setdefault(lang, {})[key] = _translated_topic(
                _read_yaml(path, problems), topics[ENGLISH][key], f"topics/{lang}/{key}", problems)

    faqs: Dict[str, Dict[str, Dict[str, str]]] = {}
    faq_dir = root / "faqs"
    en_faq = faq_dir / f"{ENGLISH}.yaml"
    faq_keys = {f["key"] for f in manifest["faqs"]}
    if faq_keys or en_faq.is_file():
        if not en_faq.is_file():
            problems.add(f"faqs/{ENGLISH}.yaml", "missing")
        else:
            faqs[ENGLISH] = _faqs(_read_yaml(en_faq, problems), f"faqs/{ENGLISH}", problems, True)
            for k in sorted(faq_keys - set(faqs[ENGLISH])):
                problems.add(f"faqs/{ENGLISH}.yaml", f"has no entry for FAQ '{k}'")
    faqs.setdefault(ENGLISH, {})
    if faq_dir.is_dir():
        for path in sorted(faq_dir.iterdir()):
            if path.name.startswith(".") or path == en_faq:
                continue
            lang = path.stem
            if path.suffix != ".yaml" or not LANG_DIR_RE.fullmatch(lang):
                problems.add(f"faqs/{path.name}", "must be <language code>.yaml")
                continue
            faqs[lang] = _faqs(_read_yaml(path, problems), f"faqs/{lang}", problems, False)
    for lang, items in faqs.items():
        for k in sorted(set(items) - faq_keys):
            problems.add(f"faqs/{lang}.yaml", f"'{k}' is not an FAQ in manifest.yaml")

    english_names = set()
    for topic in topics[ENGLISH].values():
        english_names.update(st["image"] for st in topic["steps"] if st["image"])
        if topic["video"] and topic["video"].get("poster"):
            english_names.add(topic["video"]["poster"])
    media = _load_media(root, english_names, problems)

    if problems.items:
        raise HelpContentError("\n".join(problems.items))
    return HelpContent(manifest, topics, faqs, media)


_lock = threading.Lock()
_content: Optional[HelpContent] = None


def get_help_content() -> HelpContent:
    """The shipped help content, loaded once per process. Raises HelpContentError if invalid."""
    global _content
    if _content is None:
        with _lock:
            if _content is None:
                _content = load_help_content(HELP_ROOT)
    return _content
