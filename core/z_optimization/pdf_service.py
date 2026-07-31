#!/usr/bin/env python3
"""
PDF Service for Diet Recommendation Reports.

Task 2.8 — ORM imports removed from core.
  - PDFService class (v3.0, used DietReport ORM) is stubbed; Task 2.11 will consolidate.
  - rec/eval generators accept user_name/user_email as plain params rather than DB lookups.
  - DB update logic removed; callers in services/ are responsible for updating the report record.
  - get_country_* helpers use raw SQL so no app.models import is needed.
"""

import logging
import os
import pandas as pd
import random
import re
import string
import time
import uuid
from datetime import datetime
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ── Stubbed v3.0 class (Task 2.11 consolidates pdf_service* into one module) ──

class PDFService:
    """
    V3.0 PDF service — retained as a stub so existing import sites don't break.
    All methods raise NotImplementedError; use the module-level functions below
    (or pdf_service_v2 for the active v4.0 path) until Task 2.11 consolidates them.
    """

    def __init__(self, db: Session):
        self.db = db

    def generate_and_store_pdf(self, *args, **kwargs):
        raise NotImplementedError("Use rec_pdf_report_generator or pdf_service_v2 instead")

    def get_report_by_id(self, *args, **kwargs):
        raise NotImplementedError

    def get_reports_by_user(self, *args, **kwargs):
        raise NotImplementedError

    def get_report_by_case_id(self, *args, **kwargs):
        raise NotImplementedError

    def delete_report(self, *args, **kwargs):
        raise NotImplementedError

    def get_report_metadata(self, *args, **kwargs):
        raise NotImplementedError


# ── Utility functions ─────────────────────────────────────────────────────────

def generate_report_id(report_type: str = 'rec', db: Session = None) -> str:
    """
    Generate a unique report ID (format: '<type>-<4-digit-ts><6-char-random>').
    If *db* is provided, checks uniqueness against the reports table.
    """
    max_attempts = 10
    for _ in range(max_attempts):
        timestamp_suffix = str(int(time.time() * 1000))[-4:]
        chars = string.ascii_lowercase + string.digits
        random_suffix = ''.join(random.choice(chars) for _ in range(6))
        report_id = f"{report_type}-{timestamp_suffix}{random_suffix}"

        if db is not None:
            row = db.execute(
                text("SELECT 1 FROM reports WHERE report_id = :rid"),
                {"rid": report_id},
            ).fetchone()
            if row is None:
                return report_id
        else:
            return report_id

    raise RuntimeError(f"Failed to generate unique report ID after {max_attempts} attempts")


def get_country_name_by_id(country_id: str, db: Session) -> str:
    """Return country name for *country_id*, or 'Unknown Country' if not found."""
    try:
        if not country_id:
            return "Unknown Country"
        row = db.execute(
            text("SELECT name FROM country WHERE id = :cid"),
            {"cid": country_id},
        ).fetchone()
        return row[0] if row and row[0] else "Unknown Country"
    except Exception as exc:
        logger.error("Error getting country name for %s: %s", country_id, exc)
        return "Unknown Country"


def get_currency_by_country_id(country_id: str, db: Session) -> str:
    """Return currency code for *country_id*, or '$' if not found."""
    try:
        if not country_id:
            return "$"
        row = db.execute(
            text("SELECT currency FROM country WHERE id = :cid"),
            {"cid": country_id},
        ).fetchone()
        return row[0] if row and row[0] else "$"
    except Exception as exc:
        logger.error("Error getting currency for %s: %s", country_id, exc)
        return "$"


# ── PDF generators (v1 path — Task 2.11 consolidates into pdf_service_v2) ─────

def rec_pdf_report_generator(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    report_id: str,
    db: Session,
    user_name: str = "",
    user_email: str = "",
) -> None:
    """
    Generate a recommendation PDF and upload to S3.
    DB record update is the caller's responsibility (moved to services/report_service.py
    in Task 2.8 to keep core free of ORM imports).
    """
    try:
        logger.info(
            "Starting PDF report generation: simulation=%s report=%s",
            simulation_id, report_id,
        )
        pdf_bytes = generate_diet_recommendation_pdf(
            api_response, user_id, simulation_id, user_name, user_email, report_id
        )

        from services.aws_service import aws_service
        success, bucket_url, error_message = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes, user_id=user_id, report_id=report_id
        )

        # Persist result without importing ORM models
        if success:
            db.execute(
                text(
                    "UPDATE reports SET bucket_url=:url, json_result=:jr, "
                    "saved_to_bucket=true, updated_at=:now "
                    "WHERE report_id=:rid"
                ),
                {"url": bucket_url, "jr": api_response, "now": datetime.utcnow(), "rid": report_id},
            )
        else:
            db.execute(
                text(
                    "UPDATE reports SET json_result=:jr, saved_to_bucket=false, "
                    "updated_at=:now WHERE report_id=:rid"
                ),
                {"jr": api_response, "now": datetime.utcnow(), "rid": report_id},
            )
        db.commit()
        logger.info("PDF report complete: report=%s bucket_url=%s", report_id, bucket_url if success else "N/A")

    except Exception as exc:
        logger.error("PDF generation failed (simulation=%s): %s", simulation_id, exc, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


def eval_pdf_report_generator(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    report_id: str,
    db: Session,
    user_name: str = "",
    user_email: str = "",
) -> None:
    """Evaluation variant of rec_pdf_report_generator."""
    try:
        logger.info(
            "Starting evaluation PDF generation: simulation=%s report=%s",
            simulation_id, report_id,
        )
        pdf_bytes = generate_diet_evaluation_pdf(
            api_response, user_id, simulation_id, user_name, user_email, report_id
        )

        from services.aws_service import aws_service
        success, bucket_url, _ = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes, user_id=user_id, report_id=report_id
        )

        if success:
            db.execute(
                text(
                    "UPDATE reports SET bucket_url=:url, json_result=:jr, "
                    "saved_to_bucket=true, updated_at=:now WHERE report_id=:rid"
                ),
                {"url": bucket_url, "jr": api_response, "now": datetime.utcnow(), "rid": report_id},
            )
        else:
            db.execute(
                text(
                    "UPDATE reports SET json_result=:jr, saved_to_bucket=false, "
                    "updated_at=:now WHERE report_id=:rid"
                ),
                {"jr": api_response, "now": datetime.utcnow(), "rid": report_id},
            )
        db.commit()
        logger.info("Evaluation PDF complete: report=%s", report_id)

    except Exception as exc:
        logger.error("Evaluation PDF failed (simulation=%s): %s", simulation_id, exc, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


# ── pdf_service_v2: v2 DB-level PDF generator ──────────────────────────────────

# Icons in report_html are referenced by filename, not embedded (see
# report_generation.py:rsm_generate_report_v2) — this base_url is where WeasyPrint
# resolves them from at conversion time.
REPORT_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")


async def rec_pdf_report_generator_v2(
    html_content: str,
    user_id: str,
    report_id: str,
    db: AsyncSession,
) -> bool:
    """Convert already-rendered report HTML (Report.report_html) to PDF, upload to
    S3, and update the Report row's bucket_url/saved_to_bucket. Returns True on
    success.

    Caller owns the session's lifecycle — a FastAPI request-scoped session is
    already closed by the time a BackgroundTask runs, so this expects a fresh
    session opened for the task (see services/report_service.py).
    """
    try:
        logger.info("V2 PDF generation starting for report=%s", report_id)
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content, base_url=REPORT_ASSETS_DIR).write_pdf()
        if not pdf_bytes:
            raise RuntimeError("HTML-to-PDF conversion returned no bytes")

        from services.aws_service import aws_service
        success, bucket_url, error_message = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes, user_id=user_id, report_id=report_id
        )
        if success:
            await db.execute(
                text(
                    "UPDATE reports SET bucket_url=:url, saved_to_bucket=true, "
                    "updated_at=:now WHERE report_id=:rid"
                ),
                {"url": bucket_url, "now": datetime.utcnow(), "rid": report_id},
            )
            await db.commit()
            logger.info("V2 PDF uploaded. report=%s url=%s", report_id, bucket_url)
            return True
        else:
            await db.execute(
                text(
                    "UPDATE reports SET saved_to_bucket=false, updated_at=:now "
                    "WHERE report_id=:rid"
                ),
                {"now": datetime.utcnow(), "rid": report_id},
            )
            await db.commit()
            logger.error("V2 PDF upload failed for report=%s: %s", report_id, error_message)
            return False
    except Exception as exc:
        logger.error("V2 PDF generation/upload failed (report=%s): %s", report_id, exc, exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return False


async def eval_pdf_report_generator_v2(
    html_content: str,
    user_id: str,
    report_id: str,
    db: AsyncSession,
) -> bool:
    """Evaluation variant — same HTML-to-PDF path as recommendation."""
    return await rec_pdf_report_generator_v2(html_content, user_id, report_id, db)


# ── pdf_generator: PDF helpers and recommendation/evaluation generators (merged) ─

class _ProportionsTableHTMLParser(HTMLParser):
    """Lightweight parser to extract a table by CSS class without lxml."""

    def __init__(self, target_class: str):
        super().__init__()
        self.target_class = target_class
        self.capture_table = False
        self.table_depth = 0
        self.section = "body"
        self.current_row = None
        self.capturing_cell = False
        self.cell_buffer: list = []
        self.headers: list = []
        self.rows: list = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "table":
            class_attr = attrs_dict.get("class", "")
            class_tokens = class_attr.split()
            if self.capture_table:
                self.table_depth += 1
            elif self.target_class in class_attr or self.target_class in class_tokens:
                self.capture_table = True
                self.table_depth = 1
        elif self.capture_table:
            if tag == "thead":
                self.section = "header"
            elif tag == "tbody":
                self.section = "body"
            elif tag == "tr":
                self.current_row = []
            elif tag in ("th", "td"):
                self.capturing_cell = True
                self.cell_buffer = []

    def handle_endtag(self, tag):
        if tag == "table" and self.capture_table:
            self.table_depth -= 1
            if self.table_depth == 0:
                self.capture_table = False
        elif self.capture_table:
            if tag in ("th", "td") and self.capturing_cell:
                text_val = "".join(self.cell_buffer).strip()
                if self.current_row is not None:
                    self.current_row.append(text_val)
                self.capturing_cell = False
                self.cell_buffer = []
            elif tag == "tr" and self.current_row is not None:
                if self.section == "header":
                    self.headers.append(self.current_row)
                else:
                    self.rows.append(self.current_row)
                self.current_row = None
            elif tag == "thead":
                self.section = "body"

    def handle_data(self, data):
        if self.capture_table and self.capturing_cell:
            self.cell_buffer.append(data)


def _transpose_table_by_class(
    html_content: str,
    table_class: str,
    section_anchor: Optional[str] = None,
    base_identifier_cols: Optional[list] = None,
    replacement_class: str = "proportions-table-transposed",
) -> str:
    """Locate a table by CSS class, transpose it, and replace the original markup."""
    base_identifier_cols = base_identifier_cols or ["Ingr_Type", "Name"]
    try:
        anchor_idx = html_content.find(section_anchor) if section_anchor else 0
        search_start = anchor_idx if anchor_idx != -1 else 0
        pattern = re.compile(
            rf'(<table[^>]*class="[^"]*{re.escape(table_class)}[^"]*"[^>]*>.*?</table>)',
            re.DOTALL,
        )
        match = pattern.search(html_content, search_start)
        if not match:
            return html_content
        table_html = match.group(1)
        parser = _ProportionsTableHTMLParser(table_class)
        parser.feed(table_html)
        if not parser.rows:
            return html_content
        header_row = parser.headers[-1] if parser.headers else [f"Col {i+1}" for i in range(len(parser.rows[0]))]
        max_len = max(len(header_row), *(len(r) for r in parser.rows))
        header_row = header_row + [""] * (max_len - len(header_row))
        normalized_rows = [row + [""] * (max_len - len(row)) for row in parser.rows]
        df = pd.DataFrame(normalized_rows, columns=header_row)
        nutrient_cols = [c for c in df.columns if c not in base_identifier_cols]
        if not nutrient_cols:
            return html_content
        if all(col in df.columns for col in base_identifier_cols):
            type_series = df[base_identifier_cols[0]].fillna("").astype(str).str.strip()
            name_series = df[base_identifier_cols[1]].fillna("").astype(str).str.strip()
            combined = [" - ".join(p for p in (t, n) if p).strip() for t, n in zip(type_series, name_series)]
            col_names = [c if c else name or f"Item {i+1}" for i, (c, name) in enumerate(zip(combined, name_series))]
        elif base_identifier_cols and base_identifier_cols[1] in df.columns:
            col_names = df[base_identifier_cols[1]].astype(str).tolist()
        else:
            col_names = [f"Item {i+1}" for i in range(len(df))]
        value_df = df[nutrient_cols].T
        value_df.columns = col_names
        value_df.insert(0, "Metric", nutrient_cols)
        value_df.reset_index(drop=True, inplace=True)
        transposed_html = value_df.to_html(index=False, classes=f"dataframe {replacement_class}", border=1)
        wrapper_html = "\n<div class='table-container'>\n" + transposed_html + "\n</div>\n"
        return html_content[:match.start()] + wrapper_html + html_content[match.end():]
    except Exception as e:
        logger.warning("Failed to transpose table with class %s: %s", table_class, e)
        return html_content


def _optimize_html_for_pdf(html_content: str) -> str:
    """Optimize HTML/CSS for WeasyPrint PDF rendering."""
    try:
        lower_html = html_content.lower()
        start = lower_html.find("<style")
        end = lower_html.find("</style>", start + 6) if start != -1 else -1
        if start != -1 and end != -1:
            end += len("</style>")
            style_block = html_content[start:end]
            opt = style_block
            opt = opt.replace("display: flex;", "display: block;")
            opt = opt.replace("display:flex;", "display: block;")
            opt = opt.replace("display: grid;", "display: block;")
            opt = opt.replace("display:grid;", "display: block;")
            for token in ["gap:", "row-gap:", "column-gap:"]:
                while token in opt:
                    idx = opt.find(token)
                    semi = opt.find(";", idx)
                    if semi == -1:
                        break
                    opt = opt[:idx] + opt[semi + 1:]
            opt = opt.replace("white-space: nowrap;", "white-space: normal; word-wrap: break-word;")
            opt = opt.replace("font-size: 14px;", "font-size: 12px;")
            opt = opt.replace(
                "background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);", "background: #f5f7fa;"
            )
            opt = opt.replace("border-left: 4px solid", "border-left: 2px solid")
            pdf_overrides = """
      /* PDF-specific layout tweaks */
      @page { margin: 0.5in; }
      body { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 0; margin: 0; }
      .header { background: linear-gradient(135deg, #2e7d32 0%, #388e3c 100%); padding: 18px 10px 10px 10px; }
      .report-meta { display: block; width: 100%; margin: 8px 0 2px 0; padding: 4px 0; }
      .report-meta::after { content: ""; display: block; clear: both; }
      .report-meta .meta-item { display: block; float: left; width: 20%; padding: 2px 4px; font-size: 0.85em; box-sizing: border-box; }
      .report-meta .meta-item:last-child { width: 20%; }
      .report-meta .meta-item strong { display: block; font-size: 1.0em; }
      .report-meta .meta-item .meta-value { display: block; margin-top: 2px; font-size: 0.85em; }
      .container { border: none; box-shadow: none; margin: 0.08in auto; max-width: 98%; }
      .metric-grid { display: table; width: 100%; margin: 4px 0; }
      .metric-grid .metric-item { display: table-cell; padding: 8px 10px; }
      .metric-grid .metric-value { font-size: 1.26em; }
      .metric-grid .metric-label { font-size: 0.8em; }
      .requirements-table { width: 90%; min-width: 90%; margin: 0; }
      .requirements-table th:nth-child(1), .requirements-table td:nth-child(1) { width: 50%; }
      .requirements-table th:nth-child(2), .requirements-table td:nth-child(2) { width: 25%; }
      .requirements-table th:nth-child(3), .requirements-table td:nth-child(3) { width: 25%; }
      .diet-table { width: 90%; min-width: 90%; margin: 0; }
      .diet-table th:nth-child(1), .diet-table td:nth-child(1) { width: 40%; }
      .diet-table th:nth-child(2), .diet-table td:nth-child(2) { width: 20%; }
      .diet-table th:nth-child(3), .diet-table td:nth-child(3) { width: 20%; }
      .diet-table th:nth-child(4), .diet-table td:nth-child(4) { width: 20%; }
      .animal-info-table { width: 90%; min-width: 90%; margin: 0; }
      .animal-info-table th:nth-child(1), .animal-info-table td:nth-child(1) { width: 50%; }
      .animal-info-table th:nth-child(2), .animal-info-table td:nth-child(2) { width: 25%; }
      .animal-info-table th:nth-child(3), .animal-info-table td:nth-child(3) { width: 25%; }
      .animal-info-table th, .animal-info-table td, .requirements-table th, .requirements-table td,
      .diet-table th, .diet-table td, .proportions-table-transposed th, .proportions-table-transposed td,
      .environmental-table th, .environmental-table td { padding: 4px 6px; font-size: 1.0em; }
      .environmental-table { width: 70%; min-width: 70%; margin: 0; }
      .environmental-table th:nth-child(1), .environmental-table td:nth-child(1) { width: 60%; }
      .environmental-table th:nth-child(2), .environmental-table td:nth-child(2) { width: 40%; }
      .animal-info-table th, .requirements-table th, .diet-table th,
      .proportions-table-transposed th, .environmental-table th { text-align: left; background: #1e88e5; color: #ffffff; }
      table.proportions-table-transposed { width: 90%; min-width: 90%; margin: 0; table-layout: auto; }
      .proportions-table-transposed th { white-space: normal; word-wrap: break-word; }
      .section, .table-container, table { page-break-inside: avoid; break-inside: avoid; }
      .section { margin: 6px 0; padding: 10px 18px; }
      .section h2 { margin-top: 2px; margin-bottom: 3px; font-size: 1.45em; color: #2e7d32; font-weight: 500; }
"""
            opt = opt.replace("</style>", f"{pdf_overrides}\n    </style>", 1)
            html_content = html_content[:start] + opt + html_content[end:]
        else:
            html_content = html_content.replace("display: flex;", "display: block;")
            html_content = html_content.replace("display:flex;", "display: block;")
            html_content = html_content.replace("display: grid;", "display: block;")
            html_content = html_content.replace("display:grid;", "display: block;")
            html_content = html_content.replace("white-space: nowrap;", "white-space: normal; word-wrap: break-word;")
        html_content = _normalize_generated_timestamp(html_content)
        return html_content
    except Exception as e:
        logger.warning("HTML optimization for PDF failed, using original HTML. Error: %s", e)
        return html_content


def _transpose_proportions_table(html_content: str) -> str:
    return _transpose_table_by_class(
        html_content,
        table_class="proportions-table",
        section_anchor="<h2><span class='emoji'>📊</span>Nutrient Proportions (%)</h2>",
    )


def _inject_transposed_proportions_from_api(html_content: str, api_response: dict) -> str:
    """Inject a transposed Nutrient Proportions table from API response data."""
    try:
        diet_proportions = api_response.get("diet_proportions")
        if diet_proportions is None:
            logger.warning("PDF transpose: diet_proportions missing in API response")
            return _transpose_proportions_table(html_content)
        if isinstance(diet_proportions, pd.DataFrame):
            df = diet_proportions.copy()
        elif isinstance(diet_proportions, list) and len(diet_proportions) > 0:
            df = pd.DataFrame(diet_proportions)
        else:
            logger.warning("PDF transpose: diet_proportions has unsupported type (%s)", type(diet_proportions))
            return _transpose_proportions_table(html_content)
        if df.empty:
            logger.warning("PDF transpose: diet_proportions DataFrame is empty")
            return _transpose_proportions_table(html_content)
        base_cols = ["Ingr_Type", "Name"]
        nutrient_cols = [c for c in df.columns if c not in base_cols]
        if not nutrient_cols:
            return _transpose_proportions_table(html_content)
        if all(col in df.columns for col in base_cols):
            col_names = (df["Ingr_Type"].astype(str) + " - " + df["Name"].astype(str)).tolist()
        elif "Name" in df.columns:
            col_names = df["Name"].astype(str).tolist()
        else:
            col_names = [f"Item {i+1}" for i in range(len(df))]
        value_df = df[nutrient_cols].T
        value_df.columns = col_names
        value_df.insert(0, "Metric", nutrient_cols)
        value_df.reset_index(drop=True, inplace=True)
        transposed_table_html = value_df.to_html(index=False, classes="dataframe proportions-table-transposed", border=1)
        wrapper_html = "\n<div class='table-container'>\n" + transposed_table_html + "\n</div>\n"
        anchor = "<h2><span class='emoji'>📊</span>Nutrient Proportions (%)</h2>"
        anchor_idx = html_content.find(anchor)
        if anchor_idx == -1:
            return html_content + wrapper_html
        table_start = html_content.find("<table", anchor_idx)
        if table_start == -1:
            return html_content + wrapper_html
        table_end = html_content.find("</table>", table_start)
        if table_end == -1:
            return html_content + wrapper_html
        after_table = table_end + len("</table>")
        return html_content[:table_start] + wrapper_html + html_content[after_table:]
    except Exception as e:
        logger.warning("Failed to inject transposed diet_proportions table from API: %s", e)
        return _transpose_proportions_table(html_content)


def _transpose_feed_tables(html_content: str) -> str:
    """Transpose both Forage and Concentrate tables for PDF view."""
    html_content = _transpose_table_by_class(
        html_content, table_class="forage-table",
        section_anchor="<h2><span class='emoji'>🌾</span>Forage</h2>",
    )
    html_content = _transpose_table_by_class(
        html_content, table_class="concentrate-table",
        section_anchor="<h2><span class='emoji'>🌽</span>Concentrate</h2>",
    )
    return html_content


def _find_section_block(html_content: str, header_marker: str):
    header_idx = html_content.find(header_marker)
    if header_idx == -1:
        return None
    section_start = html_content.rfind("<div", 0, header_idx)
    if section_start == -1:
        return None
    section_end = _find_matching_div_end(html_content, section_start)
    if section_end == -1:
        return None
    return html_content[section_start:section_end], section_start, section_end


def _find_matching_div_end(html_content: str, start_idx: int) -> int:
    div_pattern = re.compile(r"<(/?)div\b", re.IGNORECASE)
    depth = 0
    for match in div_pattern.finditer(html_content, start_idx):
        is_closing = match.group(1) == "/"
        if not is_closing:
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return match.end()
    return -1


def _reorder_sections_for_pdf(html_content: str) -> str:
    """Reorder sections: Summary + Diet + Env on page 1; Animal + details on page 2."""
    markers = {
        "solution": "<h2><span class='emoji'>📊</span>Solution Summary</h2>",
        "diet": "<h2><span class='emoji'>🍽️</span>Least Cost Diet</h2>",
        "environment": "<h2><span class='emoji'>🌍</span>Environmental Impact</h2>",
        "animal": "<h2><span class='emoji'>🐄</span>Animal Information</h2>",
    }
    sections = {}
    for key in ("solution", "diet", "environment", "animal"):
        block = _find_section_block(html_content, markers[key])
        if block is None:
            return html_content
        sections[key] = block
    remove_keys = ["diet", "environment", "animal"]
    for key in sorted(remove_keys, key=lambda k: sections[k][1], reverse=True):
        _, start, end = sections[key]
        html_content = html_content[:start] + html_content[end:]
    solution_block = _find_section_block(html_content, markers["solution"])
    if solution_block is None:
        return html_content
    _, _, solution_end = solution_block
    insertion = (
        sections["diet"][0]
        + sections["environment"][0]
        + "<div class='page-break'></div>"
        + sections["animal"][0]
    )
    return html_content[:solution_end] + insertion + html_content[solution_end:]


def _repl_timestamp(match: re.Match) -> str:
    original = match.group(1)
    try:
        dt = datetime.strptime(original, "%B %d, %Y at %I:%M %p")
        return dt.strftime("%b %d, %Y %H:%M")
    except Exception:
        return original


def _normalize_generated_timestamp(html_content: str) -> str:
    """Normalize 'Generated' header timestamp from 12-hour to 24-hour for PDF."""
    pattern = r'([A-Za-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM))'
    try:
        return re.sub(pattern, _repl_timestamp, html_content)
    except Exception as e:
        logger.warning("Failed to normalize Generated timestamp in PDF HTML: %s", e)
        return html_content


def generate_diet_recommendation_pdf(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    user_name: str = None,
    user_email: str = None,
    report_id: str = None,
) -> bytes:
    """Generate a recommendation PDF from the HTML file written to result_html/."""
    try:
        if not report_id:
            report_id = api_response.get("report_info", {}).get("report_id")
        logger.info("Generating PDF V3 for simulation_id: %s, report_id: %s", simulation_id, report_id)
        if report_id:
            html_file_path = f"result_html/diet-{report_id}.html"
        else:
            html_file_path = f"result_html/diet_report_{simulation_id}.html"
        if not os.path.exists(html_file_path):
            alt_path = (
                f"result_html/diet_report_{simulation_id}.html"
                if report_id
                else f"result_html/diet-{report_id}.html"
            )
            if os.path.exists(alt_path):
                html_file_path = alt_path
            else:
                raise FileNotFoundError(f"HTML file not found at {html_file_path} or {alt_path}")
        with open(html_file_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        logger.info("Successfully read HTML file: %s", html_file_path)
        html_content = _inject_transposed_proportions_from_api(html_content, api_response)
        html_content = _transpose_feed_tables(html_content)
        html_content = _reorder_sections_for_pdf(html_content)
        html_content = _optimize_html_for_pdf(html_content)
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
        logger.info("PDF V3 generated successfully. Size: %d bytes", len(pdf_bytes))
        return pdf_bytes
    except Exception as e:
        logger.error("Failed to generate PDF V3: %s", e)
        raise


def generate_diet_evaluation_pdf(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    user_name: str = None,
    user_email: str = None,
    report_id: str = None,
) -> bytes:
    """Generate an evaluation PDF from the HTML file written to result_html/."""
    try:
        if not report_id:
            report_id = api_response.get("report_id")
        logger.info("Generating Evaluation PDF V3 for simulation_id: %s, report_id: %s", simulation_id, report_id)
        html_file_path = f"result_html/diet-{report_id}.html"
        if not os.path.exists(html_file_path):
            raise FileNotFoundError(f"HTML file not found at {html_file_path}")
        with open(html_file_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        logger.info("Successfully read Evaluation HTML file: %s", html_file_path)
        html_content = _optimize_html_for_pdf(html_content)
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
        logger.info("Evaluation PDF V3 generated. Size: %d bytes", len(pdf_bytes))
        return pdf_bytes
    except Exception as e:
        logger.error("Failed to generate Evaluation PDF V3: %s", e)
        raise
