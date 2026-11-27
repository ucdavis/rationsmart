"""Page layout of the report HTML/PDF (design "11e", chosen 2026-11-23; Bottle green
theme 2026-11-28).

rsm_generate_report_v2 prepares the data (plain dicts and lists, English keys) and
calls render_report_html(); everything visual lives here: the CSS, the page-1
"at a glance" sheet, page 2 (Environmental Impact + Technical details) and the calf
report. Design samples and the reasons behind each choice:
docs/dev_docs/report_pdf_redesign/.

Layout rules (why the old report split sections and left half-empty pages):
  * sections flow from page to page; only small blocks are kept together
  * a heading never ends a page; table rows never split; headers repeat
  * the nutrient composition is one table per feed group (Forages / Concentrates)
  * running footer: report title, report id, "Page x of y"

Every user-typed value (names, simulation, custom feed names) is escaped here;
fixed text goes through t (report_text.translator). Paper size comes from the
simulation country (paper_size.country_paper_size): A4 or US Letter.
"""
import math
import string
from html import escape as _esc
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

PAPER_CSS_SIZE = {"A4": "A4", "LETTER": "letter"}

# Colours: Bottle green + wheat gold (design 11e, recoloured 2026-11-28; samples in
# docs/dev_docs/report_pdf_redesign/samples/14_bottle_spacing/).
GREEN = "#1f4a33"        # header band, headings, numbers, table rules
GREEN_2 = "#2e6e4c"      # small-caps headings, subtotals
GOLD = "#e2c26a"         # accent: chip, stripe under the key boxes, Methane Yield tile
MUTED = "#5e6e65"        # secondary text
LABEL = "#4b5a52"        # labels in the key boxes, requirement tiles, economics card, Ym card
SOFT = "#edf5f1"
SOFT_2 = "#d2e5db"
LINE = "#e1eae5"
TILE_FILL = "#f4f9f6"    # key boxes, requirement tiles, Ym card
TILE_LINE = "#d6e6de"
TOTAL_FILL = "#2a5d42"   # Total / Whole diet rows: a shade lighter than GREEN (a thin dark strip reads darker)
BAR = "#57b281"
HERO_KICKER = "#e6cf8f"  # "RationSmart · at a glance" line on the header
HERO_META = "#bddbcb"    # header field labels (User, Simulation, ...)

# Ring chart (and the matching diet-table bars): forages in green shades,
# concentrates in gold shades. More feeds than shades reuse them in order.
FORAGE_SHADES = ("#1f4a33", "#2d6a49", "#418e65", "#5eae83", "#8bbfa3", "#b1d0c0")
CONCENTRATE_SHADES = ("#e2c26a", "#cfa94a", "#ecd593", "#b8913a", "#f4e6bb", "#9c7a2e")

# Methane conversion rate (Ym) bands: the engine's own classification
# (diet_tables.rsm_calculate_methane_emissions). Lower is better. The gauge spans
# 2-11.5 %; a value outside is drawn at the nearest end.
YM_BANDS: Tuple[Tuple[float, float, str, str], ...] = (
    (2.0, 3.5, "Extremely Low", "#047857"),
    (3.5, 4.5, "Very Low", "#16a34a"),
    (4.5, 5.5, "Low", "#84cc16"),
    (5.5, 7.5, "Average", "#f59e0b"),
    (7.5, 9.5, "High", "#f97316"),
    (9.5, 11.5, "Very High", "#dc2626"),
)

# The other methane values have no reference range in the engine: number tiles.
METHANE_TILES = (
    ("Methane Production", "Total methane the animal releases per day", BAR),
    ("Methane Yield", "Methane per kg of dry matter eaten", GOLD),
    ("Methane Intensity", "Methane per kg of energy-corrected milk", "#e11d48"),
)

# Short labels for the page-1 "Key requirements" tiles; any other row keeps its name.
KEY_REQUIREMENT_LABELS = {
    "Dry matter intake": "DM intake",
    "Intake (%Body Weight)": "Intake % BW",
    "Net energy lactation (NEL)": "Energy (NEL)",
    "Metabolizable energy (ME)": "Energy (ME)",
    "Metabolizable protein (MP)": "Protein (MP)",
    "Water Intake": "Water",
}

# Requirement groups by unit (Nutritional Requirements on page 2).
REQUIREMENT_GROUPS = (("g/d", "Macro minerals"), ("mg/d", "Trace minerals"), ("IU/d", "Vitamins"))
FIRST_REQUIREMENT_GROUP = "Intake & energy"

# Short headers for the nutrient composition table (the column is narrow).
COMPOSITION_HEADERS = {"Inclusion (% DM)": "Incl. % DM", "Inclusion (% Fresh)": "Incl. % Fresh"}


def fmt(value: Any, dp: int = 2) -> str:
    """A number with fixed decimals (no thousands separator: some report languages
    use the comma as the decimal mark); text and None pass through."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        x = float(value)
    except (TypeError, ValueError):
        return str(value)
    if not math.isfinite(x):
        return ""
    return f"{x:.{dp}f}"


def _css_string(text: str) -> str:
    """text as a CSS string literal (for @page content). < and > are written as CSS
    escapes, so no text (e.g. a translation) can close the <style> block."""
    out = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return '"' + out.replace("<", "\\3c ").replace(">", "\\3e ") + '"'


def _page_counter_css(t: Callable[..., str]) -> str:
    """'Page {page} of {pages}' in the report language as a CSS content value."""
    template = t("Page {page} of {pages}")
    try:
        fields = {f for _, f, _, _ in string.Formatter().parse(template) if f is not None}
    except ValueError:
        fields = set()
    if fields != {"page", "pages"}:
        template = "Page {page} of {pages}"
    parts = []
    for literal, field, _, _ in string.Formatter().parse(template):
        if literal:
            parts.append(_css_string(literal))
        if field:
            parts.append(f"counter({field})")
    return " ".join(parts)


def _css(paper: str, t: Callable[..., str], title: str, rtl: bool = False) -> str:
    size = PAPER_CSS_SIZE.get(str(paper or "A4").upper(), "A4")
    # Page-margin boxes do not inherit the body font: name it, or the footer prints in
    # the system serif.
    FOOTER_FONT = ("'Noto Naskh Arabic', " if rtl else "") + "'Lato', 'DejaVu Sans', sans-serif"
    return f"""
@page {{ size: {size}; margin: 14mm 13mm 18mm 13mm;
  @bottom-left {{ content: {_css_string("RationSmart · " + title + " · ")} string(rid); font-family: {FOOTER_FONT}; font-size: 7pt; color: {MUTED}; vertical-align: top; padding-top: 3mm; }}
  @bottom-right {{ content: {_page_counter_css(t)}; font-family: {FOOTER_FONT}; font-size: 7pt; color: {MUTED}; vertical-align: top; padding-top: 3mm; }} }}
@page :first {{ margin-top: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: 'Lato', 'DejaVu Sans', sans-serif; font-size: 8.6pt; color: {GREEN}; line-height: 1.38; background: #fff; }}
table {{ width: 100%; border-collapse: collapse; }}
thead {{ display: table-header-group; }}
tr {{ break-inside: avoid; page-break-inside: avoid; }}
h1, h2, h3 {{ break-after: avoid; page-break-after: avoid; }}
.keep {{ break-inside: avoid; page-break-inside: avoid; }}
td, th {{ text-align: right; vertical-align: middle; }}
td.l, th.l {{ text-align: left; }}
.cols2 {{ display: flex; gap: 6mm; }}
.cols2 > .col {{ flex: 1 1 0; min-width: 0; }}
.mc2 {{ column-count: 2; column-gap: 6mm; }}
.mc2 table {{ break-inside: avoid; margin-bottom: 3mm; }}
#rid {{ string-set: rid content(); }}
.nowrap, .kpi-v, .econ-v, td.v, td.u {{ white-space: nowrap; }}
.ltr {{ direction: ltr; unicode-bidi: embed; display: inline-block; }}
/* page 1 */
.hero {{ background: {GREEN}; color: #fff; padding: 9mm 13mm 16mm; margin: 0 -13mm; }}
.hero .k {{ color: {HERO_KICKER}; font-size: 7.5pt; letter-spacing: 2.4pt; text-transform: uppercase; font-weight: bold; }}
.hero h1 {{ font-size: 22pt; margin: 1mm 0 0; font-weight: bold; }}
.meta {{ display: flex; margin-top: 4mm; }}
.meta-item {{ flex: 1 1 0; min-width: 0; padding-right: 2mm; }}
.meta-k {{ display: block; font-size: 6.2pt; text-transform: uppercase; letter-spacing: 1pt; color: {HERO_META}; }}
.meta-v {{ display: block; font-size: 8.4pt; font-weight: bold; overflow-wrap: anywhere; }}
.sheet {{ margin-top: -10mm; }}
.kpis {{ display: flex; gap: 2.5mm; }}
.kpi {{ flex: 1 1 0; min-width: 0; background: {TILE_FILL}; border: 0.3mm solid {TILE_LINE}; border-bottom: 0.5mm solid {GOLD}; border-radius: 2.5mm; padding: 3mm 2mm; text-align: center; }}
.kpis.single .kpi {{ flex: 0 0 52mm; }}
.kpi-icon {{ display: block; width: 6.5mm; height: 6.5mm; margin: 0 auto 1mm; }}
.kpi-v {{ font-size: 13pt; font-weight: bold; color: {GREEN}; }}
.kpi-k {{ font-size: 6.5pt; color: {LABEL}; text-transform: uppercase; letter-spacing: 0.25pt; white-space: nowrap; }}
.dash {{ display: flex; gap: 4mm; margin-top: 6mm; }}
.dash .left {{ flex: 1 1 0; min-width: 0; }}
.dash .right {{ width: 52mm; }}
.econ {{ border-radius: 2.5mm; padding: 3mm 4mm; }}
.econ.pos {{ background: {SOFT}; }} .econ.neg {{ background: #fff1f2; }}
.econ-title {{ font-size: 7pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1pt; color: {GREEN_2}; margin-bottom: 1.5mm; }}
.econ-row {{ display: flex; }}
.econ-cell {{ flex: 1 1 0; min-width: 0; }}
.econ-k {{ font-size: 5.8pt; color: {LABEL}; text-transform: uppercase; letter-spacing: 0.2pt; white-space: nowrap; }}
.econ-v {{ font-size: 12pt; font-weight: bold; }}
.pos .hi .econ-v, .pos .econ-verdict {{ color: #047857; }} .neg .hi .econ-v, .neg .econ-verdict {{ color: #be123c; }}
.econ-verdict {{ margin-top: 1.5mm; font-weight: bold; font-size: 8pt; }}
.cap2 {{ font-size: 6.6pt; text-transform: uppercase; letter-spacing: 1pt; color: {GREEN_2}; font-weight: bold; margin: 6mm 0 1.6mm; }}
.dash .left > .cap2:first-child {{ margin-top: 0; }}
.req-strip {{ display: flex; gap: 1.8mm; }}
.req-chip {{ flex: 1 1 0; background: {TILE_FILL}; border-top: 0.3mm solid {TILE_LINE}; border-right: 0.3mm solid {TILE_LINE}; border-bottom: 0.3mm solid {TILE_LINE}; border-radius: 2mm; padding: 2mm 1.4mm 2mm 2mm; border-left: 1mm solid {BAR}; min-width: 0; }}
.req-chip .rk {{ font-size: 6.8pt; font-weight: bold; color: {LABEL}; text-transform: uppercase; letter-spacing: 0.2pt; white-space: nowrap; }}
.req-chip .rv {{ font-size: 11.5pt; font-weight: bold; color: {GREEN}; white-space: nowrap; }}
.req-chip .rv span {{ font-size: 7.6pt; font-weight: normal; color: {LABEL}; margin-left: 0.5mm; }}
.chart {{ background: #fff; border: 0.3mm solid {SOFT_2}; border-radius: 2.5mm; padding: 3mm; text-align: center; }}
.chart .cap {{ font-size: 6.6pt; text-transform: uppercase; letter-spacing: 1pt; color: {GREEN_2}; font-weight: bold; margin-bottom: 1mm; }}
.ring {{ position: relative; width: 112px; height: 112px; margin: 0 auto; }}
.ring-c {{ position: absolute; left: 0; right: 0; top: 36px; text-align: center; }}
.ring-v {{ font-size: 12pt; font-weight: bold; color: {GREEN}; line-height: 1.1; }}
.ring-k {{ font-size: 5.4pt; color: {MUTED}; text-transform: uppercase; letter-spacing: 0.3pt; padding: 0 22px; line-height: 1.15; }}
.gauge {{ direction: ltr; }}
.bands {{ position: relative; height: 5mm; margin-top: -1mm; }}
.band {{ position: absolute; top: 0; text-align: center; font-size: 8.2pt; color: {LABEL}; line-height: 1.1; }}
.band.on {{ color: {GREEN}; font-weight: bold; }}
.mini {{ display: flex; justify-content: center; gap: 3mm; margin-top: 1.5mm; font-size: 6.8pt; color: {MUTED}; }}
.mini b {{ color: {GREEN}; }}
i.dot {{ display: inline-block; width: 2.3mm; height: 2.3mm; border-radius: 50%; margin-right: 1.3mm; vertical-align: -0.2mm; }}
i.dot.none {{ background: #e5e7eb; }}
h2 {{ font-size: 11.5pt; color: {GREEN}; margin: 6mm 0 2.4mm; }}
h2.first {{ margin-top: 0; }}
.sheet h2 {{ margin-top: 9mm; }}
h2 .chip {{ display: inline-block; background: {GOLD}; color: {GREEN}; font-size: 6.5pt; padding: 0.5mm 2mm; border-radius: 3mm; margin-left: 2mm; vertical-align: 2pt; letter-spacing: 0.8pt; text-transform: uppercase; font-weight: bold; }}
/* tables */
table {{ font-size: 8.2pt; }}
th {{ font-size: 6.8pt; color: {GREEN_2}; text-transform: uppercase; letter-spacing: 0.5pt; padding: 1.6mm 2mm; border-bottom: 0.5mm solid {GREEN}; background: {SOFT}; }}
td {{ padding: 1.45mm 2mm; border-bottom: 0.25mm solid {LINE}; }}
.diet .name {{ width: 33%; font-weight: bold; }} .diet .type {{ color: {MUTED}; }} .diet .share {{ width: 18%; }}
.bar {{ display: inline-block; width: 62%; height: 2.2mm; vertical-align: middle; background: {SOFT_2}; border-radius: 1mm; }}
.bar span {{ display: block; height: 100%; background: {BAR}; border-radius: 1mm; }}
.pct {{ display: inline-block; width: 30%; text-align: right; font-size: 0.92em; }}
tr.zero td {{ color: #a8adb5; }} tr.zero .bar span {{ background: transparent; }}
tr.total td {{ font-weight: bold; background: {TOTAL_FILL}; color: #fff; border: none; }}
.strong {{ font-weight: bold; }}
.fn {{ font-size: 7pt; color: {MUTED}; margin: 1.5mm 0 0; }}
.message-card {{ margin-top: 3mm; background: #fffbeb; border-radius: 2.5mm; padding: 2.5mm 4mm; border: 0.3mm solid #fcd34d; }}
.message-title {{ font-weight: bold; color: #b45309; }}
.message-list {{ margin: 0.5mm 0 0; padding: 0; list-style: none; font-size: 8pt; }}
table.kv {{ margin-bottom: 3mm; }}
table.kv .v {{ font-weight: bold; }} table.kv .u, th.u {{ color: {MUTED}; text-align: left; width: 16%; }}
/* page 2: environment */
.ym-card {{ background: {TILE_FILL}; border: 0.3mm solid {SOFT_2}; border-radius: 2.5mm; padding: 3mm 4mm 2mm; }}
.ym-head {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 1mm; }}
.ym-head .t {{ font-weight: bold; font-size: 10.5pt; }}
.ym-head .s {{ font-size: 8.2pt; color: {LABEL}; }}
.ym-head .tag {{ font-size: 8.4pt; }}
.tag {{ padding: 0.6mm 2.6mm; border-radius: 3mm; font-size: 7pt; font-weight: bold; letter-spacing: 0.8pt; }}
.tag.bad {{ background: #ffe4e6; color: #be123c; }} .tag.mid {{ background: #fef3c7; color: #b45309; }} .tag.good {{ background: #d1fae5; color: #047857; }}
.tiles {{ display: flex; gap: 3mm; margin-top: 3mm; }}
.tile {{ flex: 1 1 0; min-width: 0; background: #fff; border: 0.3mm solid {SOFT_2}; border-left: 1.4mm solid; border-radius: 2mm; padding: 2mm 3mm; }}
.tile .tk {{ font-size: 6.2pt; text-transform: uppercase; letter-spacing: 0.6pt; color: {MUTED}; font-weight: bold; }}
.tile .tv {{ font-size: 14pt; font-weight: bold; color: {GREEN}; white-space: nowrap; }}
.tile .tv span {{ font-size: 7.4pt; font-weight: normal; color: {MUTED}; margin-left: 1mm; }}
.tile .th {{ font-size: 6.6pt; color: {MUTED}; }}
.tech-head {{ border-bottom: 0.5mm solid {GREEN}; padding-bottom: 2mm; margin-top: 6mm; display: flex; justify-content: space-between; align-items: flex-end; }}
.tech-head .h {{ font-size: 14pt; font-weight: bold; color: {GREEN}; }}
.tech-head span {{ font-size: 7pt; color: {MUTED}; text-transform: uppercase; letter-spacing: 1.2pt; }}
.pb {{ break-before: page; page-break-before: always; }}
table.comp {{ font-size: 7pt; table-layout: fixed; }} table.comp .name {{ width: 21%; }}
table.comp th {{ font-size: 6.1pt; padding: 1.4mm 0.9mm; text-transform: none; letter-spacing: 0; }}
table.comp td {{ padding: 1.1mm 0.9mm; }}
table.comp + table.comp {{ margin-top: 2.5mm; }}
tr.group td {{ background: {SOFT_2}; color: {GREEN}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8pt; font-size: 6.8pt; }}
tr.sub td {{ font-weight: bold; color: {GREEN_2}; }}
/* On screen (the manual runners' HTML opened in a browser): an A4-wide column with the
   page margins as padding, so the full-width header band stays inside the window. */
@media screen {{ html {{ background: #e5e7eb; }} body {{ max-width: 210mm; margin: 0 auto; padding: 0 13mm 13mm; }} }}
"""


# Right-to-left reports: mirror what the main style pins to the left. Naskh first:
# DejaVu also has Arabic letters but draws them less well. No overflow:hidden box
# (WeasyPrint asserted on one in an RTL page; see report_generation history).
_RTL_CSS = f"""
body {{ font-family: 'Noto Naskh Arabic', 'Lato', 'DejaVu Sans', sans-serif; direction: rtl; }}
td, th {{ text-align: left; }}
td.l, th.l {{ text-align: right; }}
.pct {{ text-align: left; }}
.meta-item {{ padding-right: 0; padding-left: 2mm; }}
.req-chip {{ border-left: 0.3mm solid {TILE_LINE}; border-right: 1mm solid {BAR}; }}
.tile {{ border-left-width: 0.3mm; border-right: 1.4mm solid; }}
h2 .chip {{ margin-left: 0; margin-right: 2mm; }}
i.dot {{ margin-right: 0; margin-left: 1.3mm; }}
.req-chip .rv span, .tile .tv span {{ margin-left: 0; margin-right: 1mm; }}
"""


# --------------------------------------------------------------------------- pieces

# Inline SVG carries numbers only: WeasyPrint draws SVG text without shaping, so
# Devanagari, Bengali, Thai etc. would print broken there. Words (band names, the ring
# label) are HTML laid over or under the picture.
SVG_FONT = "Lato, DejaVu Sans, sans-serif"


def _donut_svg(parts: Sequence[Tuple[float, str]], size: int = 112, thick: int = 18) -> str:
    """Inline SVG ring chart (nothing is fetched). parts: (share, colour)."""
    r = (size - thick) / 2
    c = size / 2
    total = sum(v for v, _ in parts) or 1.0
    out = [f"<circle cx='{c}' cy='{c}' r='{r}' fill='none' stroke='{SOFT_2}' stroke-width='{thick}'/>"]
    a0 = -math.pi / 2
    for value, colour in parts:
        if value <= 0:
            continue
        if value / total > 0.9999:
            out.append(f"<circle cx='{c}' cy='{c}' r='{r}' fill='none' stroke='{colour}' stroke-width='{thick}'/>")
            break
        a1 = a0 + 2 * math.pi * value / total
        x0, y0 = c + r * math.cos(a0), c + r * math.sin(a0)
        x1, y1 = c + r * math.cos(a1), c + r * math.sin(a1)
        large = 1 if (a1 - a0) > math.pi else 0
        out.append(f"<path d='M {x0:.2f} {y0:.2f} A {r:.2f} {r:.2f} 0 {large} 1 {x1:.2f} {y1:.2f}' "
                   f"fill='none' stroke='{colour}' stroke-width='{thick}'/>")
        a0 = a1
    return f"<svg width='{size}' height='{size}' viewBox='0 0 {size} {size}'>{''.join(out)}</svg>"


def _ym_x(v: float) -> float:
    """Gauge position of v in percent of the gauge width (bands span 2 %..98 %)."""
    lo, hi = YM_BANDS[0][0], YM_BANDS[-1][1]
    return 2 + (min(max(v, lo), hi) - lo) / (hi - lo) * 96


def _ym_band(value: float) -> int:
    """Index of the band holding value; below the first / above the last band count as that band."""
    for i, (a, b, _, _) in enumerate(YM_BANDS):
        if value < b or i == len(YM_BANDS) - 1:
            return i
    return len(YM_BANDS) - 1


def _ym_gauge_html(value: float, h: Callable[..., str]) -> str:
    """Ym on the engine's six bands: the band holding the value is solid, the others
    faded; a marker and the value above it. Bars, marker and numbers are SVG; the band
    names are HTML (see SVG_FONT)."""
    active = _ym_band(value)
    w = 10.0                                  # viewBox units per percent
    parts = []
    for i, (a, b, _, colour) in enumerate(YM_BANDS):
        parts.append(f"<rect x='{_ym_x(a) * w + 1.5:.1f}' y='44' width='{(_ym_x(b) - _ym_x(a)) * w - 3:.1f}' height='24' rx='4' "
                     f"fill='{colour}' opacity='{1 if i == active else 0.3}'/>")
    for a, *_ in YM_BANDS[1:]:
        parts.append(f"<text x='{_ym_x(a) * w:.1f}' y='88' text-anchor='middle' font-family='{SVG_FONT}' font-size='16' "
                     f"fill='{LABEL}'>{a:g} %</text>")
    mx = _ym_x(value) * w
    anchor = "start" if mx < 80 else "end" if mx > 920 else "middle"
    parts.append(f"<path d='M {mx - 9:.1f} 24 L {mx + 9:.1f} 24 L {mx:.1f} 40 Z' fill='{GREEN}'/>")
    parts.append(f"<line x1='{mx:.1f}' y1='40' x2='{mx:.1f}' y2='72' stroke='{GREEN}' stroke-width='3'/>")
    parts.append(f"<text x='{mx:.1f}' y='17' text-anchor='{anchor}' font-family='{SVG_FONT}' font-size='23' "
                 f"font-weight='bold' fill='{GREEN}'>{value:g} %</text>")
    names = "".join(
        f"<div class='band{' on' if i == active else ''}' style='left:{_ym_x(a):.2f}%;width:{_ym_x(b) - _ym_x(a):.2f}%'>{h(name)}</div>"
        for i, (a, b, name, _) in enumerate(YM_BANDS))
    return f"<div class='gauge'><svg width='100%' viewBox='0 0 1000 94'>{''.join(parts)}</svg><div class='bands'>{names}</div></div>"


def _class_tone(value: Any) -> str:
    v = str(value or "").strip().lower()
    if v in ("high", "very high"):
        return "bad"
    if v in ("low", "very low", "extremely low"):
        return "good"
    return "mid"


def _to_float(value: Any) -> Optional[float]:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _meta_html(meta: Sequence[Tuple[str, str]], h) -> str:
    cells = []
    for key, value in meta:
        rid = " id='rid'" if key == "Report ID" else ""
        cells.append(f"<div class='meta-item'><span class='meta-k'>{h(key)}</span>"
                     f"<span class='meta-v'{rid}>{_esc(str(value))}</span></div>")
    return "<div class='meta'>" + "".join(cells) + "</div>"


def _kpis_html(kpis: Sequence[Dict[str, str]], h) -> str:
    cells = "".join(
        f"<div class='kpi'><img src='{_esc(k['icon'])}' class='kpi-icon'><div class='kpi-v'>{k['value_html']}</div>"
        f"<div class='kpi-k'>{h(k['label'])}</div></div>"
        for k in kpis
    )
    single = " single" if len(kpis) == 1 else ""
    return f"<div class='kpis keep{single}'>{cells}</div>"


def _econ_html(econ: Optional[Dict[str, Any]], h) -> str:
    if not econ:
        return ""
    tone = "neg" if econ["negative"] else "pos"
    cells = "".join(
        f"<div class='econ-cell{' hi' if i >= 2 else ''}'><div class='econ-k'>{h(label)}</div>"
        f"<div class='econ-v'>{_esc(value)}</div></div>"
        for i, (label, value) in enumerate(econ["cells"])
    )
    return (f"<div class='econ margin-banner {tone} margin-{'negative' if econ['negative'] else 'positive'}'>"
            f"<div class='econ-title'>{h('Milk Price Economics')}</div><div class='econ-row'>{cells}</div>"
            f"<div class='margin-verdict econ-verdict'>{_esc(econ['verdict'])}</div></div>")


def _key_requirements_html(rows: Sequence[Tuple[str, Any, str]], h) -> str:
    if not rows:
        return ""
    chips = "".join(
        f"<div class='req-chip'><div class='rk'>{h(KEY_REQUIREMENT_LABELS.get(label, label))}</div>"
        f"<div class='rv'>{fmt(value)}<span>{_esc(unit or '')}</span></div></div>"
        for label, value, unit in rows
    )
    return (f"<div class='cap2'>{h('Key requirements')} · {h('per day')}</div>"
            f"<div class='req-strip'>{chips}</div>")


def _diet_colours(diet: Sequence[Dict[str, Any]]) -> Dict[int, str]:
    """{row index: colour} for the feeds in the diet (share > 0): forages first."""
    colours, f, c = {}, 0, 0
    for i, row in enumerate(diet):
        if row["share"] > 0 and row["is_forage"]:
            colours[i] = FORAGE_SHADES[f % len(FORAGE_SHADES)]
            f += 1
    for i, row in enumerate(diet):
        if row["share"] > 0 and not row["is_forage"]:
            colours[i] = CONCENTRATE_SHADES[c % len(CONCENTRATE_SHADES)]
            c += 1
    return colours


def _chart_html(diet: Sequence[Dict[str, Any]], colours: Dict[int, str], h) -> str:
    order = [i for i in colours if diet[i]["is_forage"]] + [i for i in colours if not diet[i]["is_forage"]]
    if not order:
        return ""
    forage = round(sum(diet[i]["share"] for i in colours if diet[i]["is_forage"]))
    svg = _donut_svg([(diet[i]["share"], colours[i]) for i in order])
    ring = (f"<div class='ring'>{svg}<div class='ring-c'><div class='ring-v ltr'>{forage}:{100 - forage}</div>"
            f"<div class='ring-k'>{h('Forage : Conc.')}</div></div></div>")
    return (f"<div class='chart keep'><div class='cap'>{h('Diet by dry matter')}</div>{ring}"
            f"<div class='mini'><span><i class='dot' style='background:{FORAGE_SHADES[1]}'></i>{h('Forages')} <b>{forage}%</b></span>"
            f"<span><i class='dot' style='background:{CONCENTRATE_SHADES[1]}'></i>{h('Concentrates')} <b>{100 - forage}%</b></span></div></div>")


def _diet_table_html(diet: Sequence[Dict[str, Any]], total: Optional[Dict[str, Any]], currency: str,
                     colours: Dict[int, str], h) -> str:
    th = (f"<th class='l'>{h('Ingredient Name')}</th><th class='l'>{h('Ingredient Type')}</th>"
          f"<th>{h('Amount Fresh')}<br/>{h('(Kg/day)')}</th><th>{h('Amount DM')}<br/>{h('(Kg/day)')}</th>"
          f"<th class='l share'>{h('Share of DM')}</th>"
          f"<th>{h('Price')}<br/>{h('(Per Kg)')}</th><th>{h('Price')}<br/>{h('(Per day)')}</th>")
    rows = []
    for i, r in enumerate(diet):
        colour = colours.get(i)
        dot = f"<i class='dot' style='background:{colour}'></i>" if colour else "<i class='dot none'></i>"
        style = f"width:{r['share']:.1f}%" + (f";background:{colour}" if colour else "")
        rows.append(
            f"<tr class='{'zero' if r['zero'] else ''}'><td class='l name'>{dot}{_esc(r['name'])}</td>"
            f"<td class='l type'>{_esc(r['type'])}</td><td>{fmt(r['af'])}</td><td>{fmt(r['dm'])}</td>"
            f"<td class='share'><div class='bar'><span style='{style}'></span></div><span class='pct'>{r['share']:.0f}%</span></td>"
            f"<td>{fmt(r['price_kg'])}</td><td class='strong'>{fmt(r['cost'])}</td></tr>"
        )
    if total:
        rows.append(f"<tr class='total'><td class='l' colspan='2'>{h('Total')}</td><td>{fmt(total['af'])}</td>"
                    f"<td>{fmt(total['dm'])}</td><td></td><td></td><td class='nowrap'>{_esc(currency)}{fmt(total['cost'])}</td></tr>")
    table = f"<table class='diet diet-table'><thead><tr>{th}</tr></thead><tbody>{''.join(rows)}</tbody></table>"
    note = (f"<p class='fn'>{h('Greyed rows: selected feeds that are not used in this diet.')}</p>"
            if any(r["zero"] for r in diet) else "")
    return table + note


def _limits_html(limits: Optional[Dict[str, Any]], name_map: Optional[Dict[str, str]], h) -> str:
    if not limits:
        return ""

    def num(v):
        return "—" if v is None else f"{v:g}"

    kg = f"<span class='nowrap'>{h('(Kg/day)')}</span>"
    blocks = []
    feeds = limits.get("inclusion_limits") or []
    if feeds:
        rows = "".join(
            f"<tr><td class='l'>{_esc((name_map or {}).get(f['feed_name'], f['feed_name']))}</td>"
            f"<td>{num(f['min_kg_asfed'])}</td><td>{num(f['max_kg_asfed'])}</td>"
            f"<td class='strong'>{'—' if f['result_kg_asfed'] is None else format(f['result_kg_asfed'], '.2f')}</td></tr>"
            for f in feeds
        )
        blocks.append(f"<table class='lim diet-table'><thead><tr><th class='l'>{h('Ingredient Name')}</th>"
                      f"<th>{h('Min')}<br/>{kg}</th><th>{h('Max')}<br/>{kg}</th><th>{h('In diet')}<br/>{kg}</th>"
                      f"</tr></thead><tbody>{rows}</tbody></table>")
    diet_limits = limits.get("diet_limits") or []
    if diet_limits:
        sign = {"max": "≤", "min": "≥"}
        rows = "".join(
            f"<tr><td class='l'>{h(d['label'])}</td><td class='strong'>{sign[d['direction']]} {num(d['value'])}</td>"
            f"<td>{sign[d['direction']] + ' ' + num(d['default']) if d['default'] is not None else '—'}</td>"
            f"<td>{_esc(d['unit'])}</td></tr>"
            for d in diet_limits
        )
        blocks.append(f"<table class='lim diet-table'><thead><tr><th class='l'>{h('Parameter')}</th><th>{h('Your limit')}</th>"
                      f"<th>{h('Default')}</th><th>{h('Unit')}</th></tr></thead><tbody>{rows}</tbody></table>")
    if not blocks:
        return ""
    body = (f"<div class='cols2'>{''.join(f'<div class=col>{b}</div>' for b in blocks)}</div>"
            if len(blocks) > 1 else blocks[0])
    return (f"<section class='keep'><h2>{h('Limits You Set')}</h2>{body}"
            f"<p class='fn'>{h('These limits were set by the user and shape the diet above.')}</p></section>")


def _environment_html(env: Optional[Dict[str, Any]], h) -> str:
    if not env:
        return ""
    ym = _to_float(env.get("ym"))
    gauge = (
        f"<div class='ym-card keep'><div class='ym-head'><div><div class='t'>{h('Methane Conversion Rate (Ym)')}</div>"
        f"<div class='s'>{h('Share of the feed energy lost as methane; lower is better')}</div></div>"
        f"<span class='tag {_class_tone(env.get('classification'))}'>{h(str(env.get('classification') or '')).upper()}</span></div>"
        f"{_ym_gauge_html(ym, h)}</div>"
    ) if ym is not None else ""
    tiles = []
    for label, hint, colour in METHANE_TILES:
        value, unit = env.get(label, (None, ""))
        if value is None:
            continue
        tiles.append(f"<div class='tile' style='border-color:{SOFT_2};border-left-color:{colour};border-right-color:{colour}'>"
                     f"<div class='tk'>{h(label)}</div><div class='tv'>{fmt(value)}<span>{_esc(unit)}</span></div>"
                     f"<div class='th'>{h(hint)}</div></div>")
    return (f"<section class='keep'><h2 class='first'>{h('Environmental Impact')}</h2>{gauge}"
            f"<div class='tiles'>{''.join(tiles)}</div>"
            f"<p class='fn'>{h('*Ym(%) = Percentage of energy intake lost as methane.')} "
            f"{h('The classification comes from Ym, using the bands shown. The other values have no reference range in RationSmart yet, so they are shown as numbers only.')}</p></section>")


def _plain(value: Any) -> str:
    """A number as entered: 450 not 450.00, 0.2 not 0.20."""
    x = _to_float(value)
    if x is None:
        return "" if value is None else _esc(str(value))
    return str(int(x)) if x.is_integer() else f"{x:g}"


def _kv_rows(rows: Sequence[Tuple[str, Any, str]], h, plain: bool = False) -> str:
    """Parameter / value / unit rows. Text values are fixed words (breed, state,
    topography) and are translated; numbers are formatted."""
    out = []
    for label, value, unit in rows:
        if isinstance(value, str):
            shown = h(value)
        else:
            shown = _plain(value) if plain else fmt(value)
        out.append(f"<tr><td class='l'>{h(label)}</td><td class='v'>{shown}</td><td class='u'>{_esc(unit or '')}</td></tr>")
    return "".join(out)


def _animal_html(rows: Sequence[Tuple[str, Any, str]], h) -> str:
    """Animal Information in two half-height columns."""
    if not rows:
        return ""
    head = (f"<thead><tr><th class='l'>{h('Parameter')}</th><th>{h('Value')}</th>"
            f"<th class='u'>{h('Unit')}</th></tr></thead>")
    k = (len(rows) + 1) // 2
    halves = [rows[:k], rows[k:]] if len(rows) > 1 else [rows]
    cols = "".join(f"<div class='col'><table class='kv animal-info-table'>{head}<tbody>{_kv_rows(part, h, plain=True)}</tbody></table></div>"
                   for part in halves if part)
    return f"<section><h2>{h('Animal Information')}</h2><div class='cols2 keep'>{cols}</div></section>"


def _requirement_groups(rows: Sequence[Tuple[str, Any, str]]) -> List[Tuple[str, List[Tuple[str, Any, str]]]]:
    by_unit = {unit: name for unit, name in REQUIREMENT_GROUPS}
    groups: Dict[str, List[Tuple[str, Any, str]]] = {FIRST_REQUIREMENT_GROUP: []}
    for name in by_unit.values():
        groups[name] = []
    for row in rows:
        groups[by_unit.get(row[2], FIRST_REQUIREMENT_GROUP)].append(row)
    return [(name, items) for name, items in groups.items() if items]


def _requirements_html(rows: Sequence[Tuple[str, Any, str]], h) -> str:
    if not rows:
        return ""
    tables = "".join(
        f"<table class='kv requirements-table'><thead><tr><th class='l' colspan='3'>{h(name)}</th></tr></thead>"
        f"<tbody>{_kv_rows(items, h)}</tbody></table>"
        for name, items in _requirement_groups(rows)
    )
    return f"<section><h2>{h('Nutritional Requirements')}</h2><div class='mc2'>{tables}</div></section>"


def _composition_html(comp: Optional[Dict[str, Any]], h) -> str:
    """One table per feed group, each kept on one page (a group never splits after
    its first rows); the last ends with the whole-diet row."""
    if not comp or not comp.get("groups"):
        return ""
    th = f"<th class='l name'>{h('Ingredient Name')}</th>" + "".join(
        f"<th>{h(COMPOSITION_HEADERS.get(col, col))}</th>" for col in comp["columns"])
    ncol = len(comp["columns"]) + 1
    tables = []
    last = len(comp["groups"]) - 1
    for gi, (group, items, subtotal) in enumerate(comp["groups"]):
        rows = [f"<tr class='group'><td colspan='{ncol}' class='l'>{h(group)}</td></tr>"]
        for name, values, zero in items:
            rows.append(f"<tr class='{'zero' if zero else ''}'><td class='l name'>{_esc(name)}</td>"
                        + "".join(f"<td>{fmt(v)}</td>" for v in values) + "</tr>")
        if subtotal is not None:
            rows.append(f"<tr class='sub'><td class='l'>{h(group + ' total')}</td>"
                        + "".join(f"<td>{fmt(v)}</td>" for v in subtotal) + "</tr>")
        if gi == last and comp.get("total") is not None:
            rows.append(f"<tr class='total'><td class='l'>{h('Whole diet')}</td>"
                        + "".join(f"<td>{fmt(v)}</td>" for v in comp["total"]) + "</tr>")
        tables.append(f"<table class='comp proportions-table keep'><thead><tr>{th}</tr></thead><tbody>{''.join(rows)}</tbody></table>")
    notes = f"<p class='fn'>{h('Nutrient columns show what each feed adds to the whole diet (% of dry matter); the Whole diet row is the composition of the ration.')}</p>"
    ndf = comp.get("ndf_note_html")
    if ndf:
        notes += f"<p class='fn footnote'>{ndf}</p>"
    return f"<section><h2>{h('Nutrient Composition of the Diet')}</h2>{''.join(tables)}{notes}</section>"


# --------------------------------------------------------------------------- page

def render_report_html(ctx: Dict[str, Any], t: Callable[..., str], *, lang: str = "en", rtl: bool = False,
                       paper_size: str = "A4") -> str:
    """The full report HTML (stored in Report.report_html, converted to PDF later).

    ctx keys (built by report_generation.rsm_generate_report_v2):
      title, meta [(label, value)], kpis [{icon, label, value_html}], calf (dict or None),
      econ, key_requirements, diet, diet_total, currency, notes_html, limits, name_map,
      environment, animal_rows, requirement_rows, composition, diet_heading.
    """
    def h(text: str, **values) -> str:
        return _esc(t(text, **values))

    title = t(ctx["title"])
    css = _css(paper_size, t, title, rtl) + (_RTL_CSS if rtl else "")
    hero = (f"<div class='hero'><div class='k'>RationSmart · {h('At a glance')}</div>"
            f"<h1>{_esc(title)}</h1>{_meta_html(ctx['meta'], h)}</div>")
    animal = _animal_html(ctx.get("animal_rows") or [], h)
    requirements = _requirements_html(ctx.get("requirement_rows") or [], h)

    calf = ctx.get("calf")
    if calf:
        table = "".join(f"<tr><td class='l'>{h(time)}</td><td class='v'>{fmt(litres, 1)}</td></tr>"
                        for time, litres in calf["rows"])
        notes = "".join(f"<p class='fn footnote'>{_esc(n)}</p>" for n in calf["notes"])
        body = (f"{hero}<div class='sheet'>{_kpis_html(ctx['kpis'], h)}"
                f"<section><h2>{h('Milk Feeding Schedule')}</h2>"
                f"<table class='kv diet-table'><thead><tr><th class='l'>{h('Feeding Time')}</th><th>{h('Milk Amount (liters)')}</th></tr></thead>"
                f"<tbody>{table}</tbody></table>{notes}</section></div>{animal}{requirements}")
    else:
        diet = ctx.get("diet") or []
        colours = _diet_colours(diet)
        chart = _chart_html(diet, colours, h)
        left = _econ_html(ctx.get("econ"), h) + _key_requirements_html(ctx.get("key_requirements") or [], h)
        dash = ""
        if left or chart:
            dash = (f"<div class='dash keep'><div class='left'>{left}</div>"
                    + (f"<div class='right'>{chart}</div>" if chart else "") + "</div>")
        diet_section = (f"<h2>{h(ctx.get('diet_heading') or 'Least Cost Diet')} <span class='chip'>{h('per animal · per day')}</span></h2>"
                        + _diet_table_html(diet, ctx.get("diet_total"), ctx.get("currency", ""), colours, h)
                        + (ctx.get("notes_html") or ""))
        technical = (f"<div class='tech-head keep'><div class='h'>{h('Technical details')}</div>"
                     f"<span>{h('For advisers and nutritionists')}</span></div>"
                     + _limits_html(ctx.get("limits"), ctx.get("name_map"), h)
                     + animal + requirements + _composition_html(ctx.get("composition"), h))
        body = (f"{hero}<div class='sheet'>{_kpis_html(ctx['kpis'], h)}{dash}{diet_section}</div>"
                f"<div class='pb'></div>{_environment_html(ctx.get('environment'), h)}{technical}")

    dir_attr = " dir='rtl'" if rtl else ""
    return (f"<!DOCTYPE html><html lang='{_esc(str(lang or 'en'))}'{dir_attr}><head><meta charset='utf-8'/>"
            f"<meta name='viewport' content='width=device-width, initial-scale=1.0'><title>{_esc(title)}</title>"
            f"<style>{css}</style></head><body>{body}</body></html>")
