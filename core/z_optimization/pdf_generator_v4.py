"""
PDF Generator V4.
Simplified version that relies on the print-friendly HTML from report_generator_v2.
"""

import os
import logging
from typing import Optional
from weasyprint import HTML

logger = logging.getLogger(__name__)

def generate_pdf_v4(html_file_path: str, output_pdf_path: Optional[str] = None) -> bytes:
    """
    Converts a print-friendly HTML file to PDF using WeasyPrint.
    
    Args:
        html_file_path: Path to the source HTML file.
        output_pdf_path: Optional path to save the PDF file.
        
    Returns:
        bytes: The PDF file content.
    """
    try:
        if not os.path.exists(html_file_path):
            raise FileNotFoundError(f"HTML file not found at {html_file_path}")
            
        logger.info(f"Generating PDF V4 from {html_file_path}")
        
        # Read the HTML file
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        # Convert to PDF
        html_obj = HTML(string=html_content, base_url=os.path.dirname(html_file_path))
        pdf_bytes = html_obj.write_pdf(target=output_pdf_path)
        
        logger.info(f"PDF V4 generated successfully. Size: {len(pdf_bytes) if pdf_bytes else 'N/A'} bytes")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Failed to generate PDF V4: {str(e)}")
        raise
