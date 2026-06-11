#!/usr/bin/env python3
"""
V2 PDF Service for Diet Recommendation Reports
Uses the new PDF V4 generator (HTML-to-PDF based)
"""

import uuid
import os
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Report, UserInformationModel
from .pdf_generator_v4 import generate_pdf_v4
from middleware.logging_config import get_logger

logger = get_logger("pdf_service_v2")

def rec_pdf_report_generator_v2(api_response: dict, user_id: str, simulation_id: str, report_id: str, db: Session) -> None:
    """
    Asynchronously generate PDF report using V4 (HTML-to-PDF), 
    upload to AWS bucket, and store metadata in reports table.
    """
    try:
        logger.info(f"Starting V2 async PDF report generation for simulation_id: {simulation_id}, report_id: {report_id}")
        
        # 1. Fetch user information
        user_info = db.query(UserInformationModel).filter(
            UserInformationModel.id == uuid.UUID(user_id)
        ).first()
        
        user_name = user_info.name if user_info else "User"
        
        # 2. Get additional data for report
        # We need the same data that report_generator_v2 needs
        # This is already in api_response mostly, but we need the raw engine results 
        # for some tables if we were to regenerate HTML. 
        # HOWEVER, the strategy for V4 is to use the HTML file already generated!
        
        html_report_path = f"result_html/diet-{report_id}.html"
        pdf_output_path = f"result_html/diet-{report_id}.pdf"
        
        # 3. Generate PDF using V4 (HTML -> PDF)
        # We call it without output_pdf_path to get bytes back directly
        pdf_bytes = generate_pdf_v4(html_report_path)
        
        if not pdf_bytes:
            raise Exception("HTML to PDF conversion failed in V4 generator")
            
        # Write to local disk for reference/audit
        with open(pdf_output_path, "wb") as f:
            f.write(pdf_bytes)
            
        # 4. Upload PDF directly to AWS bucket
        from services.aws_service import aws_service
        success, bucket_url, error_message = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes,
            user_id=user_id,
            report_id=report_id
        )
        
        # 5. Update database record
        report = db.query(Report).filter(Report.report_id == report_id).first()
        
        if report:
            if success:
                report.bucket_url = bucket_url
                report.json_result = api_response
                report.saved_to_bucket = True
                report.updated_at = datetime.utcnow()
                logger.info(f"V2 PDF report uploaded to AWS. Report ID: {report_id}, URL: {bucket_url}")
            else:
                report.json_result = api_response
                report.saved_to_bucket = False
                report.updated_at = datetime.utcnow()
                logger.error(f"V2 PDF upload failed for report_id {report_id}")
            
            db.commit()
        else:
            logger.warning(f"Report record not found for update. Report ID: {report_id}")
        
    except Exception as e:
        logger.error(f"V2 PDF generation/upload failed: {str(e)}", exc_info=True)
        try:
            db.rollback()
        except:
            pass

def eval_pdf_report_generator_v2(api_response: dict, user_id: str, simulation_id: str, report_id: str, db: Session) -> None:
    """
    Same as above but for evaluation. 
    Currently uses same logic as V4 generator is generic for HTML files.
    """
    rec_pdf_report_generator_v2(api_response, user_id, simulation_id, report_id, db)
