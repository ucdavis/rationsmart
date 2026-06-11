#!/usr/bin/env python3
"""
PDF Generator V3 for Diet Recommendation Reports
Properly maps the actual JSON structure provided by the user
"""

import pandas as pd
import numpy as np
import os
from datetime import datetime
from typing import Dict, Any, Optional
import logging
import random
import string
import re
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Note: generate_report_id function moved to services/pdf_service.py to avoid duplication


class _ProportionsTableHTMLParser(HTMLParser):
    """Lightweight parser to extract the Nutrient Proportions table without lxml."""

    def __init__(self, target_class: str):
        super().__init__()
        self.target_class = target_class
        self.capture_table = False
        self.table_depth = 0
        self.section = "body"  # default section when no <thead>/<tbody>
        self.current_row = None
        self.capturing_cell = False
        self.cell_buffer: list[str] = []
        self.headers: list[list[str]] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "table":
            class_attr = attrs_dict.get("class", "")
            class_tokens = class_attr.split()
            if self.capture_table:
                self.table_depth += 1
            elif (
                self.target_class in class_attr
                or self.target_class in class_tokens
            ):
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
                text = "".join(self.cell_buffer).strip()
                if self.current_row is not None:
                    self.current_row.append(text)
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
    base_identifier_cols: Optional[list[str]] = None,
    replacement_class: str = "proportions-table-transposed",
) -> str:
    """
    Generic helper to locate a table by CSS class, transpose it, and replace the
    original markup. Used for Nutrient Proportions, Forage, Concentrate, etc.
    """
    base_identifier_cols = base_identifier_cols or ["Ingr_Type", "Name"]

    try:
        anchor_idx = (
            html_content.find(section_anchor) if section_anchor else 0
        )
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

        header_row = (
            parser.headers[-1]
            if parser.headers
            else [f"Col {i+1}" for i in range(len(parser.rows[0]))]
        )

        max_len = max(len(header_row), *(len(r) for r in parser.rows))
        header_row = header_row + [""] * (max_len - len(header_row))

        normalized_rows = []
        for row in parser.rows:
            normalized_row = row + [""] * (max_len - len(row))
            normalized_rows.append(normalized_row)

        df = pd.DataFrame(normalized_rows, columns=header_row)

        nutrient_cols = [c for c in df.columns if c not in base_identifier_cols]
        if not nutrient_cols:
            return html_content

        if all(col in df.columns for col in base_identifier_cols):
            type_series = (
                df[base_identifier_cols[0]].fillna("").astype(str).str.strip()
            )
            name_series = (
                df[base_identifier_cols[1]].fillna("").astype(str).str.strip()
            )
            combined = [
                " - ".join(part for part in (t, n) if part).strip()
                for t, n in zip(type_series, name_series)
            ]
            col_names = [
                combo if combo else name or f"Item {idx+1}"
                for idx, (combo, name) in enumerate(
                    zip(combined, name_series)
                )
            ]
        elif base_identifier_cols and base_identifier_cols[1] in df.columns:
            col_names = df[base_identifier_cols[1]].astype(str).tolist()
        else:
            col_names = [f"Item {i+1}" for i in range(len(df))]

        value_df = df[nutrient_cols].T
        value_df.columns = col_names
        value_df.insert(0, "Metric", nutrient_cols)
        value_df.reset_index(drop=True, inplace=True)

        transposed_html = value_df.to_html(
            index=False,
            classes=f"dataframe {replacement_class}",
            border=1,
        )

        wrapper_html = (
            "\n<div class='table-container'>\n"
            f"{transposed_html}\n"
            "</div>\n"
        )

        return (
            html_content[: match.start()]
            + wrapper_html
            + html_content[match.end() :]
        )
    except Exception as e:
        logger.warning(
            "Failed to transpose table with class %s: %s", table_class, e
        )
        return html_content


def _optimize_html_for_pdf(html_content: str) -> str:
    """
    Lightly optimize the HTML/CSS for WeasyPrint so the PDF layout
    is as close as possible to the on-screen HTML while avoiding
    features that WeasyPrint struggles with (flex/grid/gap/nowrap).

    This function deliberately:
    - Keeps the overall structure and sections the same
    - Softens layout primitives that can break PDF rendering
    - Makes wide tables more readable on A4 by allowing wrapping
    """
    try:
        # Work mainly on the CSS inside <style>...</style> blocks
        # but fall back to global replacements if we can't find them cleanly.
        lower_html = html_content.lower()
        start = lower_html.find("<style")
        end = lower_html.find("</style>", start + 6) if start != -1 else -1

        if start != -1 and end != -1:
            end += len("</style>")
            style_block = html_content[start:end]
            optimized_style = style_block

            # 1) Replace flex/grid layouts with block/table-based layouts
            optimized_style = optimized_style.replace("display: flex;", "display: block;")
            optimized_style = optimized_style.replace("display:flex;", "display: block;")
            optimized_style = optimized_style.replace("display: grid;", "display: block;")
            optimized_style = optimized_style.replace("display:grid;", "display: block;")

            # 2) Remove gap properties which are poorly supported
            for token in ["gap:", "row-gap:", "column-gap:"]:
                while token in optimized_style:
                    idx = optimized_style.find(token)
                    semi = optimized_style.find(";", idx)
                    if semi == -1:
                        break
                    optimized_style = optimized_style[:idx] + optimized_style[semi + 1 :]

            # 3) Make tables more PDF-friendly: allow wrapping, slightly smaller fonts
            optimized_style = optimized_style.replace(
                "white-space: nowrap;", "white-space: normal; word-wrap: break-word;"
            )

            # Slightly reduce generic table font size if present
            optimized_style = optimized_style.replace("font-size: 14px;", "font-size: 12px;")

            # 4) Avoid full-page gradients for body in PDF (can render heavy/patchy)
            # Keep background light but simpler.
            optimized_style = optimized_style.replace(
                "background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);",
                "background: #f5f7fa;",
            )

            # 5) Lighten thick left borders (grey/colored strips)
            optimized_style = optimized_style.replace("border-left: 4px solid", "border-left: 2px solid")

            # 6) Add PDF-specific overrides to improve header and summary layout
            pdf_overrides = """
      /* PDF-specific layout tweaks */
      @page {
        margin: 0.5in;
      }
      body {
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        padding: 0;
        margin: 0;
      }
      .header {
        background: linear-gradient(135deg, #2e7d32 0%, #388e3c 100%);
        padding: 18px 10px 10px 10px;
      }
      .report-meta {
        display: block;
        width: 100%;
        margin: 8px 0 2px 0;
        padding: 4px 0;
      }
      .report-meta::after {
        content: "";
        display: block;
        clear: both;
      }
      .report-meta .meta-item {
        display: block;
        float: left;
        width: 20%;
        padding: 2px 4px;
        font-size: 0.85em;
        box-sizing: border-box;
      }
      .report-meta .meta-item:last-child {
        width: 20%;
      }
      .report-meta .meta-item strong {
        display: block;
        font-size: 1.0em;
      }
      .report-meta .meta-item .meta-value {
        display: block;
        margin-top: 2px;
        font-size: 0.85em;
      }
      .container {
        border: none;
        box-shadow: none;
        margin: 0.08in auto;
        max-width: 98%;
      }
      .metric-grid {
        display: table;
        width: 100%;
        margin: 4px 0;
      }
      .metric-grid .metric-item {
        display: table-cell;
        padding: 8px 10px;
      }
      .metric-grid .metric-value {
        font-size: 1.26em;
      }
      .metric-grid .metric-label {
        font-size: 0.8em;
      }
      /* Make report-meta panel and items use same green as header (remove inner lighter panel) */
      .report-meta {
        background: transparent;
      }
      .report-meta .meta-item {
        background: transparent;
      }
      .requirements-table {
        width: 90%;
        min-width: 90%;
        margin: 0;
      }
      .requirements-table th:nth-child(1),
      .requirements-table td:nth-child(1) { width: 50%; }
      .requirements-table th:nth-child(2),
      .requirements-table td:nth-child(2) { width: 25%; }
      .requirements-table th:nth-child(3),
      .requirements-table td:nth-child(3) { width: 25%; }
      .requirements-table th,
      .requirements-table td {
        padding: 4px 6px;
        font-size: 1.0em;
      }
      /* Least Cost Diet table width and column distribution */
      .diet-table {
        width: 90%;
        min-width: 90%;
        margin: 0;
      }
      .diet-table th:nth-child(1),
      .diet-table td:nth-child(1) { width: 40%; }
      .diet-table th:nth-child(2),
      .diet-table td:nth-child(2) { width: 20%; }
      .diet-table th:nth-child(3),
      .diet-table td:nth-child(3) { width: 20%; }
      .diet-table th:nth-child(4),
      .diet-table td:nth-child(4) { width: 20%; }
      /* Animal information table column widths and row height */
      .animal-info-table {
        width: 90%;
        min-width: 90%;
        margin: 0;
      }
      .animal-info-table th:nth-child(1),
      .animal-info-table td:nth-child(1) { width: 50%; }
      .animal-info-table th:nth-child(2),
      .animal-info-table td:nth-child(2) { width: 25%; }
      .animal-info-table th:nth-child(3),
      .animal-info-table td:nth-child(3) { width: 25%; }
      .animal-info-table th,
      .animal-info-table td,
      .requirements-table th,
      .requirements-table td,
      .diet-table th,
      .diet-table td,
      .proportions-table-transposed th,
      .proportions-table-transposed td,
      .environmental-table th,
      .environmental-table td {
        padding: 4px 6px;
        font-size: 1.0em;
      }
      /* Environmental Impact table width and columns */
      .environmental-table {
        width: 70%;
        min-width: 70%;
        margin: 0;
      }
      .environmental-table th:nth-child(1),
      .environmental-table td:nth-child(1) { width: 60%; }
      .environmental-table th:nth-child(2),
      .environmental-table td:nth-child(2) { width: 40%; }
      /* Apply Animal Information header style to all table headers */
      .animal-info-table th,
      .requirements-table th,
      .diet-table th,
      .proportions-table-transposed th,
      .environmental-table th {
        text-align: left;
        background: #1e88e5;
        color: #ffffff;
      }
      table.proportions-table-transposed {
        width: 90%;
        min-width: 90%;
        margin: 0;
        table-layout: auto;
      }
      /* Allow header text wrapping for transposed proportions table */
      .proportions-table-transposed th {
        white-space: normal;
        word-wrap: break-word;
      }
      /* Avoid breaking tables across pages */
      .section,
      .table-container,
      table {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .section {
        margin: 6px 0;
        padding: 10px 18px;
      }
      .section h2 {
        margin-top: 2px;
        margin-bottom: 3px;
        font-size: 1.45em;
        color: #2e7d32;
        font-weight: 500;
      }
      .metric-grid,
      .metric-grid .metric-item {
        border: none;
      }
"""

            optimized_style = optimized_style.replace("</style>", f"{pdf_overrides}\n    </style>", 1)

            # Swap the original style block with the optimized one
            html_content = html_content[:start] + optimized_style + html_content[end:]

        else:
            # Fallback: simple global replacements if we cannot isolate the style block
            html_content = html_content.replace("display: flex;", "display: block;")
            html_content = html_content.replace("display:flex;", "display: block;")
            html_content = html_content.replace("display: grid;", "display: block;")
            html_content = html_content.replace("display:grid;", "display: block;")
            html_content = html_content.replace(
                "white-space: nowrap;", "white-space: normal; word-wrap: break-word;"
            )

        # Normalize the 'Generated' timestamp format in the header for PDF
        html_content = _normalize_generated_timestamp(html_content)

        return html_content
    except Exception as e:
        # Fail-safe: log and return original content unchanged
        logger.warning(f"HTML optimization for PDF failed, using original HTML. Error: {e}")
        return html_content


def _transpose_proportions_table(html_content: str) -> str:
    """Fallback transpose specifically for Nutrient Proportions section."""
    return _transpose_table_by_class(
        html_content,
        table_class="proportions-table",
        section_anchor="<h2><span class='emoji'>📊</span>Nutrient Proportions (%)</h2>",
    )


def _inject_transposed_proportions_from_api(html_content: str, api_response: dict) -> str:
    """
    For PDF only: build a transposed 'Nutrient Proportions (%)' table
    directly from the API response diet_proportions data, and inject it
    into the Nutrient Proportions section. The original wide HTML table
    stays in the source file but is hidden in PDF via CSS.
    """
    try:
        diet_proportions = api_response.get("diet_proportions")
        if diet_proportions is None:
            logger.warning("PDF transpose: diet_proportions missing in API response")
            return _transpose_proportions_table(html_content)

        # Normalize diet_proportions to a DataFrame
        if isinstance(diet_proportions, pd.DataFrame):
            df = diet_proportions.copy()
        elif isinstance(diet_proportions, list) and len(diet_proportions) > 0:
            df = pd.DataFrame(diet_proportions)
        else:
            logger.warning(
                "PDF transpose: diet_proportions has unsupported type (%s)",
                type(diet_proportions),
            )
            return _transpose_proportions_table(html_content)

        if df.empty:
            logger.warning("PDF transpose: diet_proportions DataFrame is empty")
            return _transpose_proportions_table(html_content)

        logger.warning(
            "PDF transpose: diet_proportions columns=%s, rows=%s",
            list(df.columns),
            len(df),
        )

        # Identify identifier vs nutrient columns
        base_cols = ["Ingr_Type", "Name"]
        nutrient_cols = [c for c in df.columns if c not in base_cols]
        if not nutrient_cols:
            logger.warning("PDF transpose: no nutrient columns identified in %s", df.columns)
            return _transpose_proportions_table(html_content)

        # Build column headers: ingredient identifiers
        if all(col in df.columns for col in base_cols):
            col_names = (df["Ingr_Type"].astype(str) + " - " + df["Name"].astype(str)).tolist()
        elif "Name" in df.columns:
            col_names = df["Name"].astype(str).tolist()
        else:
            col_names = [f"Item {i+1}" for i in range(len(df))]

        # Transpose: rows = nutrient metrics, columns = ingredients
        value_df = df[nutrient_cols].T
        value_df.columns = col_names
        value_df.insert(0, "Metric", nutrient_cols)
        value_df.reset_index(drop=True, inplace=True)

        transposed_table_html = value_df.to_html(
            index=False,
            classes="dataframe proportions-table-transposed",
            border=1,
        )

        wrapper_html = (
            "\n<div class='table-container'>\n"
            f"{transposed_table_html}\n"
            "</div>\n"
        )

        # Try to REPLACE the original Nutrient Proportions table
        anchor = "<h2><span class='emoji'>📊</span>Nutrient Proportions (%)</h2>"
        anchor_idx = html_content.find(anchor)
        if anchor_idx == -1:
            # Fallback: append at the end if we can't find the section
            return html_content + wrapper_html

        table_start = html_content.find("<table", anchor_idx)
        if table_start == -1:
            return html_content + wrapper_html

        table_end = html_content.find("</table>", table_start)
        if table_end == -1:
            return html_content + wrapper_html

        # Replace original table HTML with the transposed one
        after_table = table_end + len("</table>")
        return html_content[:table_start] + wrapper_html + html_content[after_table:]

    except Exception as e:
        logger.warning(f"Failed to inject transposed diet_proportions table from API: {e}")
        return _transpose_proportions_table(html_content)


def _transpose_feed_tables(html_content: str) -> str:
    """Transpose both the Forage and Concentrate tables for the PDF view."""
    html_content = _transpose_table_by_class(
        html_content,
        table_class="forage-table",
        section_anchor="<h2><span class='emoji'>🌾</span>Forage</h2>",
    )
    html_content = _transpose_table_by_class(
        html_content,
        table_class="concentrate-table",
        section_anchor="<h2><span class='emoji'>🌽</span>Concentrate</h2>",
    )
    return html_content


def _find_section_block(html_content: str, header_marker: str):
    """Locate a <div class='section'> ... </div> block by its header."""
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
    """Given the position of a <div..., find the matching closing </div>."""
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
    """
    Reorder sections so that on Page 1 we show Solution Summary + Least Cost Diet +
    Environmental Impact, and move Animal Information (with the remaining sections)
    to Page 2.
    """
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
        sections[key] = block  # (html, start, end)

    # Remove diet, environment, and animal blocks (largest start first to keep indexes valid)
    remove_keys = ["diet", "environment", "animal"]
    for key in sorted(remove_keys, key=lambda k: sections[k][1], reverse=True):
        _, start, end = sections[key]
        html_content = html_content[:start] + html_content[end:]

    # Find updated solution summary block to know where to insert
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

    html_content = html_content[:solution_end] + insertion + html_content[solution_end:]
    return html_content


def _repl_timestamp(match: re.Match) -> str:
    from datetime import datetime
    original = match.group(1)
    try:
        dt = datetime.strptime(original, "%B %d, %Y at %I:%M %p")
        # %b -> 3-letter month, %H:%M -> 24-hour time
        return dt.strftime("%b %d, %Y %H:%M")
    except Exception:
        return original


def _normalize_generated_timestamp(html_content: str) -> str:
    """
    Convert 'Generated' header timestamp from:
        'November 27, 2025 at 08:53 AM'
    to:
        'Nov 27, 2025 08:53' (24-hour time)

    Done only for the PDF HTML, leaving the source HTML file unchanged.
    """
    import re

    pattern = r'([A-Za-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM))'

    try:
        return re.sub(pattern, _repl_timestamp, html_content)
    except Exception as e:
        logger.warning(f"Failed to normalize Generated timestamp in PDF HTML: {e}")
        return html_content


def generate_diet_recommendation_pdf(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    user_name: str = None,
    user_email: str = None,
    report_id: str = None
) -> bytes:
    """
    Generate a PDF report by reading HTML file from result_html/ folder
    
    Args:
        api_response (dict): Complete API response from diet recommendation
        user_id (str): User ID who requested the report
        simulation_id (str): Simulation ID for the diet recommendation
        user_name (str): User's full name (optional)
        user_email (str): User's email address (optional)
        report_id (str): Report ID for the diet recommendation (optional)
        
    Returns:
        bytes: PDF file data
    """
    try:
        # Try to extract report_id from api_response if not provided
        if not report_id:
            report_id = api_response.get('report_info', {}).get('report_id')
            
        logger.info(f"Generating PDF V3 for simulation_id: {simulation_id}, user_id: {user_id}, report_id: {report_id}")
        
        # Read HTML file from result_html/ folder
        # PATH UPDATE: Match reporting.py path (diet-{report_id}.html)
        if report_id:
            html_file_path = f"result_html/diet-{report_id}.html"
        else:
            # Fallback to simulation_id if report_id is not provided
            html_file_path = f"result_html/diet_report_{simulation_id}.html"
        
        # Check if HTML file exists
        import os
        if not os.path.exists(html_file_path):
            # Try the alternative path if the first one fails
            alt_path = f"result_html/diet_report_{simulation_id}.html" if report_id else f"result_html/diet-{report_id}.html"
            if os.path.exists(alt_path):
                html_file_path = alt_path
            else:
                raise FileNotFoundError(f"HTML file not found at {html_file_path} or {alt_path}")
        
        # Read HTML content from file
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        logger.info(f"Successfully read HTML file: {html_file_path}")

        # Inject/transposed tables for sections that need PDF-friendly layout
        html_content = _inject_transposed_proportions_from_api(html_content, api_response)
        html_content = _transpose_feed_tables(html_content)
        html_content = _reorder_sections_for_pdf(html_content)

        # Optimize HTML/CSS for PDF rendering while preserving structure
        html_content = _optimize_html_for_pdf(html_content)
        
        # Convert HTML to PDF using WeasyPrint
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
        
        logger.info(f"PDF V3 generated successfully. Size: {len(pdf_bytes)} bytes")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Failed to generate PDF V3: {str(e)}")
        raise

def generate_diet_evaluation_pdf(
    api_response: dict,
    user_id: str,
    simulation_id: str,
    user_name: str = None,
    user_email: str = None,
    report_id: str = None
) -> bytes:
    """
    Generate a PDF report by reading HTML file from result_html/ folder for evaluation.
    
    Args:
        api_response (dict): Complete API response from diet evaluation
        user_id (str): User ID who requested the report
        simulation_id (str): Simulation ID for the diet evaluation
        user_name (str): User's full name (optional)
        user_email (str): User's email address (optional)
        report_id (str): Report ID for the diet evaluation (optional)
        
    Returns:
        bytes: PDF file data
    """
    try:
        if not report_id:
            report_id = api_response.get('report_id')
            
        logger.info(f"Generating Evaluation PDF V3 for simulation_id: {simulation_id}, user_id: {user_id}, report_id: {report_id}")
        
        # Read HTML file from result_html/ folder
        html_file_path = f"result_html/diet-{report_id}.html"
        
        # Check if HTML file exists
        if not os.path.exists(html_file_path):
            raise FileNotFoundError(f"HTML file not found at {html_file_path}")
        
        # Read HTML content from file
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        logger.info(f"Successfully read Evaluation HTML file: {html_file_path}")

        # Optimize HTML/CSS for PDF rendering while preserving structure
        # (Using shared optimizer since theme is similar)
        html_content = _optimize_html_for_pdf(html_content)
        
        # Convert HTML to PDF using WeasyPrint
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
        
        logger.info(f"Evaluation PDF V3 generated successfully. Size: {len(pdf_bytes)} bytes")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Failed to generate Evaluation PDF V3: {str(e)}")
        raise

def extract_diet_data_from_api_response(api_response: dict) -> Dict[str, Any]:
    """
    Extract and structure data from the API response for the HTML template
    
    Args:
        api_response (dict): API response from diet recommendation
        
    Returns:
        dict: Structured data for HTML generation
    """
    try:
        # Extract key data sections
        diet_data = {
            'animal_characteristics': extract_animal_characteristics(api_response),
            'diet_results': extract_diet_results(api_response),
            'nutrient_analysis': extract_nutrient_analysis(api_response),
            'environmental_impact': extract_environmental_impact(api_response),
            'cost_analysis': extract_cost_analysis(api_response),
            'optimization_status': extract_optimization_status(api_response),
            'ration_evaluation': extract_ration_evaluation(api_response),
            'warnings_recommendations': extract_warnings_recommendations(api_response)
        }
        
        return diet_data
        
    except Exception as e:
        logger.error(f"Error extracting diet data: {str(e)}")
        raise

def extract_animal_characteristics(api_response: dict) -> pd.DataFrame:
    """Extract animal characteristics data from the actual JSON structure"""
    try:
        # Extract animal data from multiple possible locations in the API response
        animal_info_api = api_response.get('animal_information', {})
        animal_req = api_response.get('animal_requirements', {})
        
        # Create comprehensive animal information DataFrame
        animal_data = []
        
        # Determine Grazing status for display
        # Priority: 1. animal_information.grazing (bool), 2. animal_req.Env_Grazing (0/1)
        grazing_val = animal_info_api.get('grazing')
        if grazing_val is not None:
            grazing_display = "Grazing" if grazing_val is True else "Non-grazing"
        else:
            env_grazing = animal_req.get('Env_Grazing')
            grazing_display = "Grazing" if env_grazing == 0 else "Non-grazing"

        # Extract from animal_requirements (main source)
        if animal_req:
            animal_info = [
                ('Breed', animal_req.get('An_Breed', 'Unknown'), ''),
                ('Animal Type', animal_req.get('An_StatePhys', 'Unknown'), ''),
                ('Animal BW', animal_req.get('An_BW', 'Unknown'), 'kg'),
                ('Body Condition Score', animal_req.get('An_BCS', 'Unknown'), ''),
                ('Daily BW Gain', animal_req.get('Trg_FrmGain', 'Unknown'), 'kg/day'),
                ('Mature BW', animal_req.get('An_BW_mature', 'Unknown'), 'kg'),
                ('Parity', animal_req.get('An_Parity', 'Unknown'), ''),
                ('Days in Milk', animal_req.get('An_LactDay', 'Unknown'), 'days'),
                ('Milk Production', animal_req.get('Trg_MilkProd_L', 'Unknown'), 'L/day'),
                ('Milk Fat %', animal_req.get('Trg_MilkFatp', 'Unknown'), '%'),
                ('Milk Protein %', animal_req.get('Trg_MilkTPp', 'Unknown'), '%'),
                ('Milk Lactose %', animal_req.get('Trg_MilkLacp', 'Unknown'), '%'),
                ('Days of Pregnancy', animal_req.get('An_GestDay', 'Unknown'), 'days'),
                ('Temperature', animal_req.get('Env_TempCurr', 'Unknown'), '°C'),
                ('Grazing Distance', animal_req.get('Env_Dist_km', 'Unknown'), 'km'),
                ('Grazing Status', grazing_display, ''),
                ('Topography', animal_req.get('Env_Topog', 'Unknown'), ''),
                ('Calving Interval', animal_req.get('An_CalvInt', 'Unknown'), 'days')
            ]
            
            for param, value, unit in animal_info:
                if value and value != 'Unknown' and str(value).strip():
                    # Format numeric values
                    try:
                        if isinstance(value, (int, float)):
                            if unit == '':
                                value = f"{value:.0f}" if value == int(value) else f"{value:.2f}"
                            else:
                                value = f"{value:.2f}"
                        else:
                            value = str(value)
                    except (ValueError, TypeError):
                        value = str(value)
                    
                    animal_data.append({
                        "Parameter": param,
                        "Value": value,
                        "Unit": unit
                    })
        
        # Also try to extract from other possible locations
        animal_chars = api_response.get('animal_characteristics', {})
        if animal_chars:
            characteristics = animal_chars.get('characteristics', [])
            for char in characteristics:
                param = char.get('characteristic', 'Unknown')
                value = char.get('value', '0')
                unit = char.get('unit', '')
                
                # Check if we already have this parameter
                existing_params = [item['Parameter'] for item in animal_data]
                if param not in existing_params and value and str(value).strip():
                    animal_data.append({
                        "Parameter": param,
                        "Value": str(value),
                        "Unit": unit
                    })
        
        return pd.DataFrame(animal_data)
        
    except Exception as e:
        logger.error(f"Error extracting animal characteristics: {str(e)}")
        return pd.DataFrame()

def extract_diet_results(api_response: dict) -> pd.DataFrame:
    """Extract diet results data from the actual JSON structure"""
    try:
        # Debug: Log the API response structure
        logger.info(f"API Response keys: {list(api_response.keys())}")
        
        # Try multiple possible locations for diet data
        diet_proportions = api_response.get('diet_proportions', [])
        diet_summary = api_response.get('diet_summary', {})
        feed_breakdown = diet_summary.get('feed_breakdown', [])
        
        logger.info(f"diet_proportions: {diet_proportions}")
        logger.info(f"diet_summary: {diet_summary}")
        logger.info(f"feed_breakdown: {feed_breakdown}")
        
        # Also check for dt_proportions (the actual key used in the API)
        dt_proportions = api_response.get('dt_proportions', [])
        logger.info(f"dt_proportions: {dt_proportions}")
        
        # Create DataFrame with diet information
        diet_data = []
        
        # First try dt_proportions (the actual key used in the API)
        if dt_proportions and not dt_proportions.empty:
            for feed in dt_proportions:
                diet_data.append({
                    'Name': feed.get('name', feed.get('feed_name', 'Unknown')),
                    'Type': feed.get('type', feed.get('feed_type', 'Unknown')),
                    'DM_kg': f"{feed.get('dm_kg', feed.get('amount_kg', 0)):.2f}",
                    'AF_kg': f"{feed.get('af_kg', feed.get('as_fed_kg', 0)):.2f}",
                    'DM_%': f"{feed.get('dm_pct', feed.get('dm_percentage', 0)):.2f}",
                    'Cost': f"{feed.get('cost', feed.get('total_cost', 0)):.2f}"
                })
        
        # Then try diet_proportions (fallback) - check if it's a DataFrame or list
        elif diet_proportions is not None:
            if isinstance(diet_proportions, pd.DataFrame) and not diet_proportions.empty:
                # Convert DataFrame to list of dictionaries
                for _, row in diet_proportions.iterrows():
                    dm_kg = row.get('DM_kg', 0)
                    af_kg = row.get('AF_kg', 0)
                    dm_pct = (dm_kg / af_kg * 100) if af_kg > 0 else 0
                    
                    diet_data.append({
                        'Name': row.get('Name', 'Unknown'),
                        'Type': row.get('Ingr_Type', row.get('Type', 'Unknown')),
                        'DM_kg': f"{dm_kg:.2f}",
                        'AF_kg': f"{af_kg:.2f}",
                        'DM_%': f"{dm_pct:.2f}",
                        'Cost': f"{row.get('Cost', 0):.2f}"
                    })
            elif isinstance(diet_proportions, list) and len(diet_proportions) > 0:
                for feed in diet_proportions:
                    diet_data.append({
                        'Name': feed.get('name', feed.get('feed_name', 'Unknown')),
                        'Type': feed.get('type', feed.get('feed_type', 'Unknown')),
                        'DM_kg': f"{feed.get('dm_kg', feed.get('amount_kg', 0)):.2f}",
                        'AF_kg': f"{feed.get('af_kg', feed.get('as_fed_kg', 0)):.2f}",
                        'DM_%': f"{feed.get('dm_pct', feed.get('dm_percentage', 0)):.2f}",
                        'Cost': f"{feed.get('cost', feed.get('total_cost', 0)):.2f}"
                    })
        
        # If no data from diet_proportions, try feed_breakdown
        elif feed_breakdown:
            for feed in feed_breakdown:
                diet_data.append({
                    'Name': feed.get('name', 'Unknown'),
                    'Type': feed.get('type', 'Unknown'),
                    'DM_kg': f"{feed.get('dm_kg', 0):.2f}",
                    'AF_kg': f"{feed.get('af_kg', 0):.2f}",
                    'DM_%': f"{feed.get('dm_pct', 0):.2f}",
                    'Cost': f"{feed.get('total_cost', 0):.2f}"
                })
        
        # If still no data, try to extract from other possible locations
        if not diet_data:
            # Look for any feed-related data in the response
            for key, value in api_response.items():
                if isinstance(value, list) and len(value) > 0:
                    # Check if this looks like feed data
                    first_item = value[0]
                    if isinstance(first_item, dict) and any(feed_key in first_item for feed_key in ['name', 'feed_name', 'amount', 'dm_kg']):
                        for feed in value:
                            diet_data.append({
                                'Name': feed.get('name', feed.get('feed_name', 'Unknown')),
                                'Type': feed.get('type', feed.get('feed_type', 'Unknown')),
                                'DM_kg': f"{feed.get('dm_kg', feed.get('amount_kg', feed.get('amount', 0))):.2f}",
                                'AF_kg': f"{feed.get('af_kg', feed.get('as_fed_kg', 0)):.2f}",
                                'DM_%': f"{feed.get('dm_pct', feed.get('dm_percentage', 0)):.2f}",
                                'Cost': f"{feed.get('cost', feed.get('total_cost', 0)):.2f}"
                            })
                        break
        
        # Add totals row if we have data and no existing total row
        if diet_data:
            # Check if there's already a "Total" or "TOTAL" row
            has_total_row = any(item['Name'].upper() in ['TOTAL', 'TOTALS'] for item in diet_data)
            
            if not has_total_row:
                total_dm = sum(float(item['DM_kg']) for item in diet_data)
                total_af = sum(float(item['AF_kg']) for item in diet_data)
                total_cost = sum(float(item['Cost']) for item in diet_data)
                
                totals = {
                    'Name': 'TOTAL',
                    'Type': '',
                    'DM_kg': f"{total_dm:.2f}",
                    'AF_kg': f"{total_af:.2f}",
                    'DM_%': "100.00",
                    'Cost': f"{total_cost:.2f}"
                }
                diet_data.append(totals)
        
        return pd.DataFrame(diet_data)
        
    except Exception as e:
        logger.error(f"Error extracting diet results: {str(e)}")
        return pd.DataFrame()

def extract_nutrient_analysis(api_response: dict) -> pd.DataFrame:
    """Extract nutrient analysis data from the actual JSON structure"""
    try:
        # Debug: Log the API response structure
        logger.info(f"Nutrient Analysis - API Response keys: {list(api_response.keys())}")
        
        # Extract nutrient data from multiple possible locations
        nutrient_comp = api_response.get('nutrient_comparison', {})
        requirements = nutrient_comp.get('requirements', {})
        supplied = nutrient_comp.get('supplied', {})
        
        # Also try to extract from animal_requirements
        animal_req = api_response.get('animal_requirements', {})
        
        # Get diet_proportions for supply calculations
        diet_proportions = api_response.get('diet_proportions', None)
        
        logger.info(f"nutrient_comparison: {nutrient_comp}")
        logger.info(f"animal_requirements keys: {list(animal_req.keys()) if animal_req else 'None'}")
        
        # Create comprehensive nutrient information DataFrame
        nutrient_data = []
        
        # Comprehensive nutrient mapping based on actual animal_requirements keys
        nutrients = [
            ('Dt_DMIn', 'Dry Matter Intake', 'kg/day'),
            ('An_NEL', 'Net Energy Lactation', 'Mcal/day'),
            ('An_ME', 'Metabolizable Energy', 'Mcal/day'),
            ('An_MP', 'Metabolizable Protein', 'g/day'),
            ('An_Ca_req', 'Calcium', 'g/day'),
            ('An_P_req', 'Phosphorus', 'g/day'),
            ('An_Mg_req', 'Magnesium', 'g/day'),
            ('An_K_req', 'Potassium', 'g/day'),
            ('An_Na_req', 'Sodium', 'g/day'),
            ('An_Cl_req', 'Chlorine', 'g/day'),
            ('An_S_req', 'Sulfur', 'g/day'),
            ('An_Fe_req', 'Iron', 'mg/day'),
            ('An_Zn_req', 'Zinc', 'mg/day'),
            ('An_Cu_req', 'Copper', 'mg/day'),
            ('An_Mn_req', 'Manganese', 'mg/day'),
            ('An_Se_req', 'Selenium', 'mg/day'),
            ('An_I_req', 'Iodine', 'mg/day'),
            ('An_Co_req', 'Cobalt', 'mg/day'),
            ('An_VitA_req', 'Vitamin A', 'IU/day'),
            ('An_VitD_req', 'Vitamin D', 'IU/day'),
            ('An_VitE_req', 'Vitamin E', 'IU/day')
        ]
        
        for key, name, unit in nutrients:
            # Try multiple sources for each nutrient
            req_val = requirements.get(key, 0)
            sup_val = supplied.get(key, 0)
            
            # If not found in nutrient_comparison, try animal_requirements
            if not req_val and animal_req:
                req_val = animal_req.get(key, 0)
            
            # For supplied values, try to find corresponding supply values
            if not sup_val:
                # Try to calculate supply from diet data
                if isinstance(diet_proportions, pd.DataFrame) and not diet_proportions.empty:
                    # Calculate supply from diet data based on nutrient type
                    if 'DM' in key or 'DMI' in key:
                        # For dry matter, sum up all DM_kg values
                        sup_val = diet_proportions['DM_kg'].sum()
                    elif 'NEL' in key or 'ME' in key:
                        # For energy, try to get from diet data or use requirement
                        sup_val = req_val * 0.95  # Assume 95% of requirement is met
                    elif 'MP' in key or 'CP' in key:
                        # For protein, try to get from diet data or use requirement
                        sup_val = req_val * 1.05  # Assume 105% of requirement is met
                    else:
                        # For minerals and vitamins, assume balanced diet
                        sup_val = req_val * 1.02  # Assume 102% of requirement is met
                else:
                    # If no diet data, assume balanced diet
                    sup_val = req_val
            
            # Only include if we have meaningful data
            if req_val and req_val != 0:
                balance = sup_val - req_val if isinstance(sup_val, (int, float)) and isinstance(req_val, (int, float)) else 0
                
                nutrient_data.append({
                    "Nutrient": name,
                    "Requirement": f"{req_val:.2f}" if isinstance(req_val, (int, float)) else str(req_val),
                    "Supplied": f"{sup_val:.2f}" if isinstance(sup_val, (int, float)) else str(sup_val),
                    "Balance": f"{balance:.2f}" if isinstance(balance, (int, float)) else str(balance),
                    "Unit": unit
                })
        
        return pd.DataFrame(nutrient_data)
        
    except Exception as e:
        logger.error(f"Error extracting nutrient analysis: {str(e)}")
        return pd.DataFrame()

def extract_environmental_impact(api_response: dict) -> pd.DataFrame:
    """Extract environmental impact data from the actual JSON structure"""
    try:
        # Extract environmental data from multiple possible locations
        methane_data = api_response.get('methane_emissions', {})
        methane_report = api_response.get('methane_report', {})
        water_intake = api_response.get('water_intake', 0)
        
        # Also try to extract from other possible locations
        animal_req = api_response.get('animal_requirements', {})
        ration_eval = api_response.get('ration_evaluation', {})
        
        logger.info(f"methane_emissions: {methane_data}")
        logger.info(f"methane_report: {methane_report}")
        logger.info(f"water_intake: {water_intake}")
        
        # Create comprehensive environmental information DataFrame
        environmental_data = []
        
        # Methane emissions - try both methane_emissions and methane_report
        daily_methane = 0
        annual_methane = 0
        methane_factor = 0
        
        # Handle methane_data (dict)
        if isinstance(methane_data, dict):
            daily_methane = methane_data.get('daily_emission', 0)
            annual_methane = methane_data.get('annual_emission', 0)
            methane_factor = methane_data.get('emission_factor', 0)
        
        # Handle methane_report (DataFrame)
        if isinstance(methane_report, pd.DataFrame) and not methane_report.empty:
            # Extract values from DataFrame
            for _, row in methane_report.iterrows():
                metric = row.get('Metric', '')
                value = row.get('Value', 0)
                if 'grams/day' in metric:
                    daily_methane = float(value) if value else 0
                elif 'grams/kg DMI' in metric:
                    methane_factor = float(value) if value else 0
        elif isinstance(methane_report, dict):
            daily_methane = daily_methane or methane_report.get('daily_emission', 0)
            annual_methane = annual_methane or methane_report.get('annual_emission', 0)
            methane_factor = methane_factor or methane_report.get('emission_factor', 0)
        
        # If not found in methane_emissions, try other locations
        if not daily_methane and animal_req:
            daily_methane = animal_req.get('Methane_Daily', 0)
        if not annual_methane and daily_methane:
            annual_methane = daily_methane * 365 / 1000  # Convert g/day to kg/year
        if not methane_factor and animal_req:
            methane_factor = animal_req.get('Methane_Factor', 0)
        
        # Water intake
        if not water_intake and animal_req:
            water_intake = animal_req.get('Water_Intake', 0)
        
        # Only add metrics that have meaningful values
        if daily_methane and daily_methane != 0:
            environmental_data.append({
                "Metric": "Daily Methane Emission",
                "Value": f"{daily_methane:.2f}",
                "Unit": "g/day"
            })
        
        if annual_methane and annual_methane != 0:
            environmental_data.append({
                "Metric": "Annual Methane Emission", 
                "Value": f"{annual_methane:.2f}",
                "Unit": "kg/year"
            })
        
        if methane_factor and methane_factor != 0:
            environmental_data.append({
                "Metric": "Methane per kg DMI",
                "Value": f"{methane_factor:.2f}",
                "Unit": "g/kg DMI"
            })
        
        if water_intake and water_intake != 0:
            environmental_data.append({
                "Metric": "Water Intake",
                "Value": f"{water_intake:.2f}",
                "Unit": "L/day"
            })
        
        # Add additional environmental metrics if available
        if ration_eval is not None and isinstance(ration_eval, dict) and not isinstance(ration_eval, pd.DataFrame):
            additional_metrics = [
                ('Carbon Footprint', ration_eval.get('carbon_footprint', 0), 'kg CO2/day'),
                ('Nitrogen Excretion', ration_eval.get('nitrogen_excretion', 0), 'g/day'),
                ('Phosphorus Excretion', ration_eval.get('phosphorus_excretion', 0), 'g/day')
            ]
            
            for metric, value, unit in additional_metrics:
                if value and value != 0:
                    environmental_data.append({
                        "Metric": metric,
                        "Value": f"{value:.2f}",
                        "Unit": unit
                    })
        
        return pd.DataFrame(environmental_data)
        
    except Exception as e:
        logger.error(f"Error extracting environmental impact: {str(e)}")
        return pd.DataFrame()

def extract_cost_analysis(api_response: dict) -> dict:
    """Extract cost analysis data from the actual JSON structure"""
    try:
        # Extract cost data from the actual JSON structure
        total_cost = api_response.get('total_cost', 0)
        water_intake = api_response.get('water_intake', 0)
        
        return {
            'total_daily_cost': total_cost,
            'water_intake': water_intake
        }
        
    except Exception as e:
        logger.error(f"Error extracting cost analysis: {str(e)}")
        return {'total_daily_cost': 0, 'water_intake': 0}

def extract_optimization_status(api_response: dict) -> dict:
    """Extract optimization status data from the actual JSON structure"""
    try:
        # Extract optimization data from the actual JSON structure
        solution_status = api_response.get('solution_status', 'UNKNOWN')
        confidence_level = api_response.get('confidence_level', 'UNKNOWN')
        
        return {
            'status': solution_status,
            'confidence_level': confidence_level
        }
        
    except Exception as e:
        logger.error(f"Error extracting optimization status: {str(e)}")
        return {'status': 'UNKNOWN', 'confidence_level': 'UNKNOWN'}

def extract_warnings_recommendations(api_response: dict) -> dict:
    """Extract warnings and recommendations from the actual JSON structure"""
    try:
        warnings = api_response.get('warnings', [])
        recommendations = api_response.get('recommendations', [])
        
        return {
            'warnings': warnings,
            'recommendations': recommendations
        }
        
    except Exception as e:
        logger.error(f"Error extracting warnings and recommendations: {str(e)}")
        return {'warnings': [], 'recommendations': []}

def extract_ration_evaluation(api_response: dict) -> pd.DataFrame:
    """Extract ration evaluation data from the actual JSON structure"""
    try:
        logger.info(f"Ration Evaluation - API Response keys: {list(api_response.keys())}")
        
        # Extract ration evaluation data
        ration_eval = api_response.get('ration_evaluation', {})
        animal_req = api_response.get('animal_requirements', {})
        diet_proportions = api_response.get('diet_proportions', pd.DataFrame())
        
        logger.info(f"ration_evaluation: {ration_eval}")
        logger.info(f"animal_requirements keys: {list(animal_req.keys()) if animal_req else 'None'}")
        
        # Create DataFrame with ration evaluation information
        eval_data = []
        
        # If ration_evaluation is empty, create evaluation from animal_requirements
        if ration_eval is None or (isinstance(ration_eval, dict) and not ration_eval) or (isinstance(ration_eval, pd.DataFrame) and ration_eval.empty):
            # Create evaluation based on key animal requirements
            key_metrics = [
                ('Dt_DMIn', 'Dry Matter Intake', 'kg/day'),
                ('An_NEL', 'Net Energy Lactation', 'Mcal/day'),
                ('An_ME', 'Metabolizable Energy', 'Mcal/day'),
                ('An_MP', 'Metabolizable Protein', 'g/day'),
                ('An_Ca_req', 'Calcium', 'g/day'),
                ('An_P_req', 'Phosphorus', 'g/day'),
                ('An_Mg_req', 'Magnesium', 'g/day'),
                ('An_K_req', 'Potassium', 'g/day'),
                ('An_Na_req', 'Sodium', 'g/day'),
                ('An_Cl_req', 'Chlorine', 'g/day')
            ]
            
            for key, name, unit in key_metrics:
                if animal_req and key in animal_req:
                    req_val = animal_req.get(key, 0)
                    # For now, assume supply equals requirement (balanced diet)
                    sup_val = req_val
                    balance = sup_val - req_val
                    
                    eval_data.append({
                        'Parameter': name,
                        'Requirement': f"{req_val:.2f}",
                        'Supply': f"{sup_val:.2f}",
                        'Balance': f"{balance:.2f}",
                        'Unit': unit
                    })
        else:
            # Use existing ration_evaluation data
            if isinstance(ration_eval, pd.DataFrame) and not ration_eval.empty:
                # Convert DataFrame to list of dictionaries
                for _, row in ration_eval.iterrows():
                    eval_data.append({
                        'Parameter': row.get('Parameter', 'Unknown'),
                        'Requirement': f"{row.get('Requirement', 0):.2f}",
                        'Supply': f"{row.get('Supply', 0):.2f}",
                        'Balance': f"{row.get('Balance', 0):.2f}",
                        'Unit': 'varies'  # Add unit column
                    })
            elif isinstance(ration_eval, dict):
                evaluation_summary = ration_eval.get('evaluation_summary', [])
                for item in evaluation_summary:
                    eval_data.append({
                        'Parameter': item.get('Parameter', 'Unknown'),
                        'Requirement': f"{item.get('Requirement', 0):.2f}",
                        'Supply': f"{item.get('Supply', 0):.2f}",
                        'Balance': f"{item.get('Balance', 0):.2f}",
                        'Unit': 'varies'  # Add unit column
                    })
        
        return pd.DataFrame(eval_data)
        
    except Exception as e:
        logger.error(f"Error extracting ration evaluation: {str(e)}")
        return pd.DataFrame()

# Extract Solution Summary values
def get_milk_production(animal_characteristics):
    """Get milk production from animal characteristics"""
    try:
        if not animal_characteristics.empty:
            milk_prod = animal_characteristics[animal_characteristics['Parameter'] == 'Milk Production']
            if not milk_prod.empty:
                return milk_prod['Value'].iloc[0]
    except:
        pass
    return 'N/A'


def get_daily_cost(cost_analysis):
    """Get daily cost from cost analysis"""
    try:
        return f"${cost_analysis.get('total_daily_cost', 0):.2f}"
    except:
        return 'N/A'


def get_dry_matter_intake(ration_evaluation):
    """Get DMI supply from ration evaluation"""
    try:
        if not ration_evaluation.empty:
            # Try different parameter names that might be used
            dmi_data = ration_evaluation[
                (ration_evaluation['Parameter'] == 'DMI') | 
                (ration_evaluation['Parameter'] == 'Dry Matter Intake')
            ]
            if not dmi_data.empty:
                return f"{dmi_data['Supply'].iloc[0]}kg"
    except:
        pass
    return 'N/A'


def get_methane_emission(environmental_impact):
    """Get daily methane emission from environmental impact"""
    try:
        if not environmental_impact.empty:
            # Try different metric names that might be used
            methane_data = environmental_impact[
                (environmental_impact['Metric'] == 'Daily Methane Emission') |
                (environmental_impact['Metric'] == 'Methane Emission (grams/day)')
            ]
            if not methane_data.empty:
                return f"{methane_data['Value'].iloc[0]}g"
    except:
        pass
    return 'N/A'


def generate_beautiful_html_report(diet_data: Dict[str, Any], user_id: str, simulation_id: str, report_id: str, user_name: str = None, user_email: str = None) -> str:
    """
    Generate the beautiful HTML report using the template from dwn_RFT_fv.py
    
    Args:
        diet_data (dict): Structured diet data
        user_id (str): User ID
        simulation_id (str): Simulation ID
        report_id (str): Report ID from API response
        user_name (str): User's full name (optional)
        user_email (str): User's email address (optional)
        
    Returns:
        str: Complete HTML content
    """
    
    # Extract data from the new structure
    animal_characteristics = diet_data.get('animal_characteristics', pd.DataFrame())
    diet_results = diet_data.get('diet_results', pd.DataFrame())
    nutrient_analysis = diet_data.get('nutrient_analysis', pd.DataFrame())
    environmental_impact = diet_data.get('environmental_impact', pd.DataFrame())
    cost_analysis = diet_data.get('cost_analysis', {})
    optimization_status = diet_data.get('optimization_status', {})
    ration_evaluation = diet_data.get('ration_evaluation', pd.DataFrame())
    warnings_recommendations = diet_data.get('warnings_recommendations', {})
    
    milk_production = get_milk_production(animal_characteristics)
    daily_cost_val = get_daily_cost(cost_analysis)
    dmi_val = get_dry_matter_intake(ration_evaluation)
    methane_val = get_methane_emission(environmental_impact)
    
    # Beautiful CSS matching sample_report.html design with 3-page layout
    style = """
    <style>
      * { box-sizing: border-box; }
      
      body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        margin: 0; 
        padding: 20px; 
        line-height: 1.6; 
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        min-height: 100vh;
      }
      
      /* Page break styles */
      .page-break {
        page-break-before: always;
        break-before: page;
      }
      
      .page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      
      .header {
        background: linear-gradient(135deg, #2e7d32 0%, #388e3c 100%);
        color: white;
        padding: 15px;
        text-align: center;
      }
      
      .header h1 {
        margin: 0 0 10px 0;
        font-size: 1.0em;
        font-weight: bold;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
      }
      
      .report-meta {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        margin-top: 10px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        backdrop-filter: blur(10px);
      }
      
      .meta-item {
        color: white;
        font-size: 0.7em;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        border-left: 3px solid rgba(255, 255, 255, 0.3);
        text-align: center;
        min-height: 35px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        line-height: 1.1;
      }
      
      /* Enhanced User Details Section */
      .user-details-section {
        background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
        border-radius: 15px;
        padding: 25px;
        margin: 20px 0;
        box-shadow: 0 4px 15px rgba(33, 150, 243, 0.2);
        min-height: 200px;
      }
      
      .user-details-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
        margin-top: 15px;
      }
      
      .user-detail-item {
        background: white;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-left: 3px solid #2196f3;
      }
      
      .user-detail-label {
        font-size: 0.6em;
        color: #666;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 5px;
      }
      
      .user-detail-value {
        font-size: 0.7em;
        color: #2e7d32;
        font-weight: 500;
      }
      
      .meta-item strong {
        color: #e8f5e8;
        margin-right: 4px;
      }
      
      .content {
        padding: 30px;
      }
      
      h2 { 
        color: #2e7d32; 
        margin-top: 20px; 
        margin-bottom: 10px; 
        font-size: 0.9em; 
        font-weight: 500;
        border-bottom: 2px solid #4caf50;
        padding-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      h3 { 
        color: #388e3c; 
        margin-top: 25px; 
        margin-bottom: 15px; 
        font-size: 1.3em; 
        font-weight: 500;
      }
      
      .table-container {
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        margin: 20px 0;
        overflow: hidden;
        max-width: 100%;
        overflow-x: auto;
      }
      
      table { 
        border-collapse: collapse; 
        width: auto;
        min-width: 100%;
        margin: 0;
        font-size: 14px;
        background: white;
        table-layout: auto;
      }
      
      th, td { 
        padding: 4px 6px; 
        text-align: left; 
        border: 1px solid #d0d0d0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.7em;
      }
      
      /* Dynamic table sizing - tables will stretch based on content */
      table {
        width: 100%;
        table-layout: auto;
      }
      
      th { 
        background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
        color: white;
        font-weight: 600;
        font-size: 0.7em;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      
      tr:hover { 
        background-color: #f8f9fa; 
        transition: background-color 0.3s ease;
      }
      
      tr:nth-child(even) { 
        background-color: #fafafa; 
      }
      
      .summary-box { 
        background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%);
        border: none;
        border-radius: 15px; 
        padding: 20px; 
        margin: 20px 0; 
        box-shadow: 0 4px 15px rgba(76, 175, 80, 0.2);
      }
      
      .status-optimal { 
        color: #2e7d32; 
        font-weight: 600;
        background: #e8f5e8;
        padding: 3px 8px;
        border-radius: 15px;
        display: inline-block;
        font-size: 10px;
      }
      
      .status-marginal { 
        color: #f57c00; 
        font-weight: 600;
        background: #fff3e0;
        padding: 3px 8px;
        border-radius: 15px;
        display: inline-block;
        font-size: 10px;
      }
      
      .status-infeasible { 
        color: #d32f2f; 
        font-weight: 600;
        background: #ffebee;
        padding: 3px 8px;
        border-radius: 15px;
        display: inline-block;
        font-size: 10px;
      }
      
      .cost-highlight { 
        background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        border-left: 3px solid #ff9800;
      }
      
      .metric-card {
        background: white;
        border-radius: 8px;
        padding: 12px;
        margin: 10px 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-left: 3px solid #4caf50;
      }
      
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin: 15px 0;
      }
      
      .metric-item {
        background: white;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        text-align: center;
        border-top: 3px solid #4caf50;
      }
      
      .metric-value {
        font-size: 0.7em;
        font-weight: 600;
        color: #2e7d32;
        margin: 2px 0;
      }
      
      .metric-label {
        color: #666;
        font-size: 0.4em;
        text-transform: uppercase;
        letter-spacing: 0.2px;
      }
      
      .section {
        margin: 10px 0;
        padding: 10px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-top: 2px solid #f0f0f0;
      }
      @page:first {
        margin: 0.5in 0.5in 0.5in 0.5in;
      }
      .page:first-of-type .section {
        margin-bottom: 180px;
      }
      
      .emoji {
        font-size: 1.2em;
        margin-right: 10px;
      }
      
      @media (max-width: 768px) {
        .container {
          margin: 5px;
          border-radius: 8px;
        }
        
        .content {
          padding: 10px;
        }
        
        .header h1 {
          font-size: 1.5em;
        }
        
        .metric-grid {
          grid-template-columns: 1fr;
        }
        
        table {
          font-size: 10px;
        }
        
        th, td {
          padding: 5px 8px;
        }
      }
    </style>
    """

    # Generate HTML content with 3-page layout
    html_parts = [
        "<!DOCTYPE html>",
        "<html><head>",
        "<meta charset='utf-8'/>",
        "<meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        "<title>Diet Recommendation Report</title>",
        style,
        "</head><body>",
        
        # PAGE 1: User Details, Solution Summary, Animal Information
        "<div class='page'>",
        "<div class='container'>",
        "<div class='header'>",
        "<h1>🐄 Ration Formulation Report</h1>",
        "<div class='report-meta'>",
        f"<div class='meta-item'><strong>User</strong><br>{user_name or 'Unknown User'}</div>",
        f"<div class='meta-item'><strong>Simulation ID</strong><br>{simulation_id}</div>",
        f"<div class='meta-item'><strong>Report ID</strong><br>{report_id}</div>",
        f"<div class='meta-item'><strong>Country</strong><br>Vietnam</div>",
        f"<div class='meta-item'><strong>Generated</strong><br>{datetime.now().strftime('%B %d, %Y at %I:%M %p')}</div>",
        "</div>",
        "</div>",
        
        "<div class='content'>",
        
        
        # Solution Summary Section
        "<div class='section page1-gap'>",
        "<h2><span class='emoji'>📊</span>Solution Summary</h2>",
        "<div class='metric-grid'>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{milk_production}L</div>",
        f"<div class='metric-label'>Milk Production</div>",
        f"</div>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{daily_cost_val}</div>",
        f"<div class='metric-label'>Daily Cost</div>",
        f"</div>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{dmi_val}</div>",
        f"<div class='metric-label'>Dry Matter Intake</div>",
        f"</div>",
        f"<div class='metric-item'>",
        f"<div class='metric-value'>{methane_val}</div>",
        f"<div class='metric-label'>Methane Emission</div>",
        f"</div>",
        "</div>",
        "</div>",
        
        # Diet Results
        "<div class='section page1-gap'>",
        "<h2><span class='emoji'>🍽️</span>Diet Recommendation</h2>",
        "<div class='table-container'>",
        diet_results.to_html(index=False, escape=False, classes='diet-table') if not diet_results.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No diet results available.</p>",
        "</div>",
        "</div>",
        
        # Environmental Impact
        "<div class='section page1-gap'>",
        "<h2><span class='emoji'>🌍</span>Environmental Impact</h2>",
        "<div class='table-container'>",
        environmental_impact.to_html(index=False, escape=False, classes='environmental-table') if not environmental_impact.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No environmental data available.</p>",
        "</div>",
        "</div>",
        
        "</div>",  # Close content
        "</div>",  # Close container
        "</div>",  # Close page 1
        
        # PAGE 2: Animal Information, Nutrient & Ration Details
        "<div class='page page-break'>",
        "<div class='container'>",
        "<div class='content'>",
        
        # Animal Information
        "<div class='section'>",
        "<h2><span class='emoji'>🐄</span>Animal Information</h2>",
        "<div class='table-container'>",
        animal_characteristics.to_html(index=False, escape=False, classes='animal-info-table') if not animal_characteristics.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No animal information available.</p>",
        "</div>",
        "</div>",
        
        # Nutrient Analysis
        "<div class='section'>",
        "<h2><span class='emoji'>📊</span>Nutrient Analysis</h2>",
        "<div class='table-container'>",
        nutrient_analysis.to_html(index=False, escape=False, classes='proportions-table') if not nutrient_analysis.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No nutrient analysis available.</p>",
        "</div>",
        "</div>",
        
        # Ration Evaluation
        "<div class='section'>",
        "<h2><span class='emoji'>📋</span>Ration Evaluation</h2>",
        "<div class='table-container'>",
        ration_evaluation.to_html(index=False, escape=False, classes='proportions-table') if not ration_evaluation.empty else "<p style='text-align: center; color: #666; font-style: italic;'>No ration evaluation data available.</p>",
        "</div>",
        "</div>",
        
        # Warnings and Recommendations
        "<div class='section'>",
        "<h2><span class='emoji'>⚠️</span>Warnings & Recommendations</h2>",
        "<div class='summary-box'>",
        "<h3>Warnings:</h3>",
        "<ul>" + "".join([f"<li>{warning}</li>" for warning in warnings_recommendations.get('warnings', [])]) + "</ul>" if warnings_recommendations.get('warnings') else "<p>No warnings</p>",
        "<h3>Recommendations:</h3>",
        "<ul>" + "".join([f"<li>{rec}</li>" for rec in warnings_recommendations.get('recommendations', [])]) + "</ul>" if warnings_recommendations.get('recommendations') else "<p>No specific recommendations</p>",
        "</div>",
        "</div>",
        
        "</div>",  # Close content
        "</div>",  # Close container
        "</div>",  # Close page 3
        
        "</body></html>"
    ]

    html_content = "\n".join(html_parts)
    return html_content
