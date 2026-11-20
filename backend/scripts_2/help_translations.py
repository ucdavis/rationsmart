"""Translate the In-App Help (and the printable guide) through an Excel workbook.

    python -m scripts_2.help_translations export --lang hi                    # every text
    python -m scripts_2.help_translations export --lang hi --only changed     # English changed since
    python -m scripts_2.help_translations import --lang hi --file help_hi.xlsx --status reviewed

English (help_content/) is the master. `export` writes one workbook per language: one row per
text (topic titles, steps, problems, video chapter names, screen names, FAQs, guide texts) with
the English, the app's own label translations as hints, the current translation and a status
(new / changed / ok). Translators only fill the 'Translation' column (and 'Note').

`import` writes topics/<lang>/, faqs/<lang>.yaml, guide/<lang>.yaml and translations/<lang>.yaml
(status, source edition and a hash of each English text, used to mark rows 'changed' later),
then validates the whole help content. If anything is wrong it restores the old files, lists
the problems and exits 1. Bump content_version in manifest.yaml before committing.

Needs loadable settings (run from backend/ with .env, or in the api container).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Protection

from services.help_content import ENGLISH, HELP_ROOT, LANG_DIR_RE, TRANSLATION_STATUSES, help_content_problems
from services.text_cleaning import clean_local_name

UI_LABELS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "data" / "ui-labels.xlsx"
SHEET, META, GUIDE_SHEET = "Translate", "Meta", "How to review"
COLUMNS = ("ID", "Where", "English", "App labels", "Status", "Translation", "Note")
WIDTHS = (26, 30, 60, 40, 10, 60, 30)
EDITABLE = {"Translation", "Note"}
GENERATED = "# Written by scripts_2/help_translations.py from a translation workbook; edit through the workbook.\n"
QUOTED = re.compile(r"(?<![\w'])'([^'\n]{1,80})'(?![\w])")

HOW_TO = [
    "How to review this translation",
    "",
    "1. Work only in the 'Translation' column (and 'Note' for comments). The other columns are locked.",
    "2. Keep every {placeholder} exactly as it is, e.g. {count} or {edition}.",
    "3. Words in 'single quotes' are names of buttons or screens in the app. Use the name the app shows in your",
    "   language: the 'App labels' column lists them. If it says 'keep English', the app shows that name in English.",
    "4. Keep numbers, topic numbers (topic 9) and units (kg, L) as they are.",
    "5. Plain text only: no '<' or '>'. Line breaks are not needed.",
    "6. Status: 'new' = not translated yet, 'changed' = the English changed since the last translation, 'ok' = up to date.",
    "7. Leave a cell empty to show the English text there.",
    "",
    "Questions about a row: write them in 'Note'.",
]


# ── reading the English master and an existing translation ───────────────────


def _yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.is_file() else None


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def english_units(root: Path) -> List[Tuple[str, str, str]]:
    """(ID, where, English text) for every translatable text, in reading order."""
    manifest = _yaml(root / "manifest.yaml")
    units: List[Tuple[str, str, str]] = []
    for key, value in (_yaml(root / "guide" / "en.yaml") or {}).items():
        if key == "months":
            units += [(f"guide:months/{i}", "Printable guide · month", m) for i, m in enumerate(value)]
        else:
            units.append((f"guide:{key}", "Printable guide", value))
    for entry in manifest["topics"]:
        key, n = entry["key"], entry["number"]
        t = _yaml(root / "topics" / ENGLISH / f"{key}.yaml")
        where = f"{n} · {t['title']}"
        units.append((f"topic:{key}/title", f"{where} · title", t["title"]))
        units.append((f"topic:{key}/summary", f"{where} · summary", t["summary"]))
        units.append((f"topic:{key}/screen_label", f"{where} · screen name", entry["screen_label"]))
        for i, ch in enumerate((t.get("video") or {}).get("chapters") or []):
            units.append((f"topic:{key}/chapters/{i}", f"{where} · video chapter {i + 1}", ch["label"]))
        for i, st in enumerate(t["steps"]):
            units.append((f"topic:{key}/steps/{i}", f"{where} · step {i + 1}", st["text"]))
        for i, pr in enumerate(t.get("problems") or []):
            units.append((f"topic:{key}/problems/{i}/title", f"{where} · problem {i + 1} title", pr["title"]))
            units.append((f"topic:{key}/problems/{i}/text", f"{where} · problem {i + 1} text", pr["text"]))
    faqs = _yaml(root / "faqs" / f"{ENGLISH}.yaml") or {}
    for entry in manifest["faqs"]:
        key = entry["key"]
        units.append((f"faq:{key}/question", f"FAQ {key} · question", faqs[key]["question"]))
        units.append((f"faq:{key}/answer", f"FAQ {key} · answer", faqs[key]["answer"]))
    return [(uid, where, str(text).strip()) for uid, where, text in units]


def current_translation(root: Path, lang: str) -> Dict[str, str]:
    """ID → translated text, read from the language's files."""
    out: Dict[str, str] = {}
    for key, value in (_yaml(root / "guide" / f"{lang}.yaml") or {}).items():
        if key == "months" and isinstance(value, list):
            out.update({f"guide:months/{i}": m for i, m in enumerate(value) if m})
        elif value:
            out[f"guide:{key}"] = value
    tdir = root / "topics" / lang
    for path in sorted(tdir.glob("*.yaml")) if tdir.is_dir() else []:
        key, t = path.stem, _yaml(path) or {}
        for field in ("title", "summary", "screen_label"):
            if t.get(field):
                out[f"topic:{key}/{field}"] = t[field]
        for i, label in enumerate(t.get("chapters") or []):
            if label:
                out[f"topic:{key}/chapters/{i}"] = label
        for i, st in enumerate(t.get("steps") or []):
            if (st or {}).get("text"):
                out[f"topic:{key}/steps/{i}"] = st["text"]
        for i, pr in enumerate(t.get("problems") or []):
            for field in ("title", "text"):
                if (pr or {}).get(field):
                    out[f"topic:{key}/problems/{i}/{field}"] = pr[field]
    for key, item in (_yaml(root / "faqs" / f"{lang}.yaml") or {}).items():
        for field in ("question", "answer"):
            if (item or {}).get(field):
                out[f"faq:{key}/{field}"] = item[field]
    return {k: str(v).strip() for k, v in out.items()}


_SHEET_SLOT = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_.]*)\}")


def _norm(label: str) -> str:
    """A label without what the help never quotes: a required-field ' *', a trailing ':', '!' or
    '.', and letter case."""
    return re.sub(r"[\s*:!.]+$", "", label.strip()).casefold()


class AppLabels(dict):
    """English app label → this language's label (the PWA sheet's column).

    lookup() also finds a label the help quotes slightly differently from the sheet: without the
    sheet's ' *' or trailing punctuation, in other letter case, or with a value where the sheet
    has a ${slot} ('FEED 1' ↔ 'FEED ${N}'; 'between … and …' ↔ 'between ${min} and ${max}').
    """

    def __init__(self, pairs: Dict[str, str]) -> None:
        super().__init__(pairs)
        self._normal = {}
        self._slotted = []
        for english, translated in pairs.items():
            if _SHEET_SLOT.search(english):
                names = _SHEET_SLOT.findall(english)
                pattern = "".join(re.escape(part) if i % 2 == 0 else "(.+?)"
                                  for i, part in enumerate(_SHEET_SLOT.split(_norm(english))))
                self._slotted.append((re.compile(pattern), names, translated))
            else:
                self._normal.setdefault(_norm(english), translated)

    def lookup(self, label: str) -> Optional[str]:
        if label in self:
            return self[label]
        found = self._fuzzy(label)
        if found and not re.search(r"[*:]\s*$", label):
            found = re.sub(r"[\s*:]+$", "", found)  # the sheet's field mark or colon, not quoted in the help
        return found

    def _fuzzy(self, label: str) -> Optional[str]:
        key = _norm(label)
        if key in self._normal:
            return self._normal[key]
        for pattern, names, translated in self._slotted:
            m = pattern.fullmatch(key)
            if m:
                # Give each slot the value the help used, e.g. 'THỨC ĂN ${N}' → 'THỨC ĂN 1'.
                values = {}
                for name, value in zip(names, m.groups()):
                    values.setdefault(name, value)
                return _SHEET_SLOT.sub(lambda s: values.get(s.group(1), s.group(0)), translated)
        return None


def app_labels(lang: str, path: Path = UI_LABELS) -> Optional[AppLabels]:
    """This language's app labels from the PWA sheet; None = the sheet has no column for it."""
    if not path.is_file():
        return None
    ws = load_workbook(path, read_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = next((i for i, h in enumerate(header) if h and str(h).strip().endswith(f"({lang})")), None)
    if col is None:
        return None
    return AppLabels({str(r[0]).strip(): str(r[col]).strip() for r in rows
                      if r and r[0] and col < len(r) and r[col]})


def label_hints(english: str, labels: Optional[AppLabels], has_sheet: bool) -> str:
    found = list(dict.fromkeys(QUOTED.findall(english)))
    if not found:
        return ""
    if labels is None:
        return "\n".join(f"'{x}' → keep English" if has_sheet else f"'{x}'" for x in found)
    lines = []
    for x in found:
        translated = labels.lookup(x)
        lines.append(f"'{x}' → '{translated}'" if translated else f"'{x}' → (not an app label)")
    return "\n".join(lines)


# ── export ────────────────────────────────────────────────────────────────────


def export(root: Path, lang: str, out_dir: Path, only: str = "all", labels_path: Path = UI_LABELS) -> Path:
    manifest = _yaml(root / "manifest.yaml")
    units = english_units(root)
    have = current_translation(root, lang)
    hashes = (_yaml(root / "translations" / f"{lang}.yaml") or {}).get("hashes") or {}
    labels = app_labels(lang, labels_path)
    has_sheet = labels_path.is_file()

    wb = Workbook()
    guide = wb.active
    guide.title = GUIDE_SHEET
    for line in HOW_TO:
        guide.append([line])
    guide["A1"].font = Font(bold=True, size=14)
    guide.column_dimensions["A"].width = 120

    ws = wb.create_sheet(SHEET)
    ws.append(COLUMNS)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="064E3B")
    rows = 0
    for uid, where, english in units:
        text = have.get(uid, "")
        status = "new" if not text else ("ok" if hashes.get(uid) == _hash(english) else "changed")
        if only != "all" and status != only:
            continue
        ws.append([uid, where, english, label_hints(english, labels, has_sheet), status, text, ""])
        rows += 1
    for i, width in enumerate(WIDTHS, start=1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = width
    wrap = Alignment(wrap_text=True, vertical="top")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = wrap
            cell.protection = Protection(locked=COLUMNS[cell.column - 1] not in EDITABLE)
    ws.freeze_panes = "C2"
    ws.protection.sheet = True  # locks ID/English/...; no password, it only prevents slips

    meta = wb.create_sheet(META)
    for k, v in (("language", lang), ("content_version", manifest["content_version"]),
                 ("exported", _dt.date.today().isoformat()), ("rows", rows), ("only", only)):
        meta.append([k, v])
    meta.sheet_state = "hidden"

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"help_{lang}_{manifest['content_version']}.xlsx"
    wb.save(path)
    print(f"{path}  ({rows} rows)")
    return path


# ── import ────────────────────────────────────────────────────────────────────


def _read_workbook(path: Path, lang: str) -> Tuple[Dict[str, Tuple[str, Optional[str]]], List[str]]:
    """ID → (English as exported, translation or None); and the reviewers' notes."""
    wb = load_workbook(path, read_only=True)
    meta = {r[0]: r[1] for r in wb[META].iter_rows(values_only=True)} if META in wb.sheetnames else {}
    if meta.get("language") != lang:
        raise SystemExit(f"{path} is a workbook for '{meta.get('language')}', not '{lang}'")
    rows = wb[SHEET].iter_rows(values_only=True)
    header = [str(h) for h in next(rows)]
    if tuple(header[:len(COLUMNS)]) != COLUMNS:
        raise SystemExit(f"{path}: the '{SHEET}' sheet's columns were changed")
    col = {name: header.index(name) for name in COLUMNS}
    out: Dict[str, Tuple[str, Optional[str]]] = {}
    notes: List[str] = []
    for r in rows:
        if not r or not r[col["ID"]]:
            continue
        raw = r[col["Translation"]]
        text = clean_local_name(str(raw)) if raw is not None else ""
        out[str(r[col["ID"]])] = (str(r[col["English"]] or "").strip(), text or None)
        if r[col["Note"]]:
            notes.append(f"{r[col['ID']]}: {r[col['Note']]}")
    return out, notes


def _trim(items: List[Any]) -> List[Any]:
    while items and not items[-1]:
        items.pop()
    return items


def _files_for(lang: str, texts: Dict[str, str], units: List[Tuple[str, str, str]]) -> Dict[str, Any]:
    """Relative path → YAML data for one language (only files that have any text)."""
    guide: Dict[str, Any] = {}
    months = [None] * 12
    topics: Dict[str, Dict[str, Any]] = {}
    faqs: Dict[str, Dict[str, str]] = {}
    sizes: Dict[Tuple[str, str], int] = {}
    for uid, _, _ in units:  # list lengths come from English
        if uid.startswith("topic:"):
            key, rest = uid[6:].split("/", 1)
            part = rest.split("/")
            if part[0] in ("chapters", "steps", "problems"):
                sizes[(key, part[0])] = max(sizes.get((key, part[0]), 0), int(part[1]) + 1)
    for uid, text in texts.items():
        kind, rest = uid.split(":", 1)
        if kind == "guide":
            if rest.startswith("months/"):
                months[int(rest.split("/")[1])] = text
            else:
                guide[rest] = text
        elif kind == "faq":
            key, field = rest.split("/")
            faqs.setdefault(key, {})[field] = text
        else:
            key, path = rest.split("/", 1)
            t = topics.setdefault(key, {})
            part = path.split("/")
            if len(part) == 1:
                t[part[0]] = text
            elif part[0] == "problems":
                lst = t.setdefault("problems", [{} for _ in range(sizes[(key, "problems")])])
                lst[int(part[1])][part[2]] = text
            else:
                lst = t.setdefault(part[0], [None] * sizes[(key, part[0])])
                lst[int(part[1])] = {"text": text} if part[0] == "steps" else text
    if all(months):
        guide["months"] = months
    files: Dict[str, Any] = {}
    order = ("title", "summary", "screen_label", "chapters", "steps", "problems")
    for key, t in topics.items():
        if "steps" in t:
            t["steps"] = _trim([s or {} for s in t["steps"]])
        for name in ("chapters", "problems"):
            if name in t:
                t[name] = _trim(t[name])
        data = {k: t[k] for k in order if t.get(k)}
        if data:
            files[f"topics/{lang}/{key}.yaml"] = data
    if faqs:
        files[f"faqs/{lang}.yaml"] = faqs
    if guide:
        files[f"guide/{lang}.yaml"] = guide
    return files


def _dump(data: Any) -> str:
    return GENERATED + yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=4096)


def import_workbook(root: Path, lang: str, path: Path, status: str) -> int:
    if lang == ENGLISH or not LANG_DIR_RE.fullmatch(lang):
        raise SystemExit(f"'{lang}' is not a translation language code")
    units = english_units(root)
    english = {uid: text for uid, _, text in units}
    rows, notes = _read_workbook(path, lang)
    texts = current_translation(root, lang)
    old_info = _yaml(root / "translations" / f"{lang}.yaml") or {}
    hashes = dict(old_info.get("hashes") or {})

    unknown = sorted(set(rows) - set(english))
    stale = sorted(uid for uid, (eng, _) in rows.items() if uid in english and eng != english[uid])
    for uid, (_, text) in rows.items():
        if uid in unknown or uid in stale:
            continue
        if text:
            texts[uid] = text
            hashes[uid] = _hash(english[uid])
        else:
            texts.pop(uid, None)
            hashes.pop(uid, None)
    texts = {k: v for k, v in texts.items() if k in english}
    hashes = {k: v for k, v in hashes.items() if k in texts}

    manifest = _yaml(root / "manifest.yaml")
    files = _files_for(lang, texts, units)
    if files:  # a language with no text at all keeps no files (not even a status file)
        files[f"translations/{lang}.yaml"] = {"status": status, "from": manifest["content_version"],
                                              "hashes": dict(sorted(hashes.items()))}

    # Replace the language's files, keeping a copy to put back if the result is invalid.
    old = {p: p.read_text(encoding="utf-8") for p in _language_files(root, lang)}
    for p in old:
        p.unlink()
    for rel, data in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(_dump(data), encoding="utf-8")
    problems = help_content_problems(root)
    if problems:
        for p in _language_files(root, lang):
            p.unlink()
        for p, text in old.items():
            p.write_text(text, encoding="utf-8")
        print("Import refused; nothing changed. Problems:", *problems, sep="\n  ")
        return 1

    print(f"{lang}: {len(texts)} of {len(units)} texts translated ({status}), "
          f"{max(len(files) - 1, 0)} files written.")
    if unknown:
        print(f"  {len(unknown)} unknown ID(s) ignored: {', '.join(unknown[:5])}")
    if stale:
        print(f"  {len(stale)} row(s) skipped: their English changed since the export "
              f"(re-export and translate again): {', '.join(stale[:5])}")
    for note in notes:
        print(f"  Note {note}")
    print("Next: bump content_version in help_content/manifest.yaml.")
    return 0


def _language_files(root: Path, lang: str) -> List[Path]:
    files = [root / "faqs" / f"{lang}.yaml", root / "guide" / f"{lang}.yaml",
             root / "translations" / f"{lang}.yaml"]
    tdir = root / "topics" / lang
    files += sorted(tdir.glob("*.yaml")) if tdir.is_dir() else []
    return [p for p in files if p.is_file()]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    ex = sub.add_parser("export", help="write a workbook for one language")
    ex.add_argument("--lang", required=True)
    ex.add_argument("--out", type=Path, default=Path("help_translations"))
    ex.add_argument("--only", choices=("all", "new", "changed", "ok"), default="all")
    im = sub.add_parser("import", help="read a filled workbook back into help_content/")
    im.add_argument("--lang", required=True)
    im.add_argument("--file", type=Path, required=True)
    im.add_argument("--status", choices=TRANSLATION_STATUSES, required=True)
    for p in (ex, im):
        p.add_argument("--root", type=Path, default=HELP_ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.cmd == "export":
        export(args.root, args.lang, args.out, args.only)
        return 0
    return import_workbook(args.root, args.lang, args.file, args.status)


if __name__ == "__main__":
    sys.exit(main())
