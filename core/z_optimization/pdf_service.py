#!/usr/bin/env python3
"""
PDF Service for Diet Recommendation Reports
Handles PDF generation, storage, and retrieval from database
"""

import uuid
import random
import string
import os
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models import DietReport, Report, UserInformationModel, CountryModel
from .pdf_generator import generate_diet_recommendation_pdf
from middleware.logging_config import get_logger

logger = get_logger("pdf_service")

class PDFService:
    def __init__(self, db: Session):
        self.db = db
    
    def generate_and_store_pdf(self, api_response: dict, user_id: str, simulation_id: str) -> Optional[DietReport]:
        """
        Generate a PDF report and store it in the database
        
        Args:
            api_response (dict): Complete API response from diet recommendation
            user_id (str): User ID who requested the report
            simulation_id (str): Simulation ID for the diet recommendation
            
        Returns:
            DietReport: The created report record, or None if failed
        """
        try:
            logger.info(f"Generating PDF for simulation_id: {simulation_id}, user_id: {user_id}")
            
            # Fetch user information from database
            user_info = self.db.query(UserInformationModel).filter(
                UserInformationModel.id == uuid.UUID(user_id)
            ).first()
            
            if not user_info:
                logger.warning(f"User information not found for user_id: {user_id}")
                user_name = "Unknown User"
                user_email = "unknown@email.com"
            else:
                user_name = user_info.name
                user_email = user_info.email_id
            
            # Generate the PDF with user information
            report_id = api_response.get('report_info', {}).get('report_id')
            pdf_bytes = generate_diet_recommendation_pdf(api_response, user_id, simulation_id, user_name, user_email, report_id)
            
            # Create filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_name = f"diet_report_{simulation_id}_{timestamp}.pdf"
            
            # Create report name
            report_name = f"Diet Recommendation Report - {simulation_id}"
            
            # Create database record
            report = DietReport(
                user_id=uuid.UUID(user_id),
                simulation_id=simulation_id,
                report_name=report_name,
                file_name=file_name,
                pdf_data=pdf_bytes,
                file_size=len(pdf_bytes)
            )
            
            # Save to database
            self.db.add(report)
            self.db.commit()
            self.db.refresh(report)
            
            logger.info(f"PDF generated and stored successfully. Report ID: {report.id}, Size: {len(pdf_bytes)} bytes")
            return report
            
        except Exception as e:
            logger.error(f"Failed to generate and store PDF: {str(e)}")
            self.db.rollback()
            return None
    
    def get_report_by_id(self, report_id: str, user_id: str) -> Optional[DietReport]:
        """
        Retrieve a specific report by ID for a user
        
        Args:
            report_id (str): Report ID
            user_id (str): User ID (for security)
            
        Returns:
            DietReport: The report record, or None if not found
        """
        try:
            report = self.db.query(DietReport).filter(
                DietReport.id == uuid.UUID(report_id),
                DietReport.user_id == uuid.UUID(user_id)
            ).first()
            
            return report
            
        except Exception as e:
            logger.error(f"Failed to retrieve report {report_id}: {str(e)}")
            return None
    
    def get_reports_by_user(self, user_id: str, limit: int = 50) -> List[DietReport]:
        """
        Get all reports for a specific user
        
        Args:
            user_id (str): User ID
            limit (int): Maximum number of reports to return
            
        Returns:
            List[DietReport]: List of report records
        """
        try:
            reports = self.db.query(DietReport).filter(
                DietReport.user_id == uuid.UUID(user_id)
            ).order_by(desc(DietReport.created_at)).limit(limit).all()
            
            return reports
            
        except Exception as e:
            logger.error(f"Failed to retrieve reports for user {user_id}: {str(e)}")
            return []
    
    def get_report_by_case_id(self, case_id: str, user_id: str) -> Optional[DietReport]:
        """
        Get the most recent report for a specific case ID
        
        Args:
            case_id (str): Case ID
            user_id (str): User ID (for security)
            
        Returns:
            DietReport: The most recent report for the case, or None if not found
        """
        try:
            report = self.db.query(DietReport).filter(
                DietReport.case_id == case_id,
                DietReport.user_id == uuid.UUID(user_id)
            ).order_by(desc(DietReport.created_at)).first()
            
            return report
            
        except Exception as e:
            logger.error(f"Failed to retrieve report for case {case_id}: {str(e)}")
            return None
    
    def delete_report(self, report_id: str, user_id: str) -> bool:
        """
        Delete a specific report
        
        Args:
            report_id (str): Report ID
            user_id (str): User ID (for security)
            
        Returns:
            bool: True if deleted successfully, False otherwise
        """
        try:
            report = self.db.query(DietReport).filter(
                DietReport.id == uuid.UUID(report_id),
                DietReport.user_id == uuid.UUID(user_id)
            ).first()
            
            if report:
                self.db.delete(report)
                self.db.commit()
                logger.info(f"Report {report_id} deleted successfully")
                return True
            else:
                logger.warning(f"Report {report_id} not found for user {user_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to delete report {report_id}: {str(e)}")
            self.db.rollback()
            return False
    
    def get_report_metadata(self, report_id: str, user_id: str) -> Optional[dict]:
        """
        Get report metadata without the PDF data
        
        Args:
            report_id (str): Report ID
            user_id (str): User ID (for security)
            
        Returns:
            dict: Report metadata, or None if not found
        """
        try:
            report = self.db.query(DietReport).filter(
                DietReport.id == uuid.UUID(report_id),
                DietReport.user_id == uuid.UUID(user_id)
            ).first()
            
            if report:
                return {
                    "id": str(report.id),
                    "user_id": str(report.user_id),
                    "case_id": report.case_id if report.case_id is not None else "",
                    "report_name": report.report_name if report.report_name is not None else "",
                    "file_name": report.file_name if report.file_name is not None else "",
                    "file_size": report.file_size,
                    "created_at": report.created_at.isoformat() if report.created_at else "",
                    "updated_at": report.updated_at.isoformat() if report.updated_at else ""
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to retrieve report metadata {report_id}: {str(e)}")
            return None


def generate_report_id(report_type: str = 'rec', db: Session = None) -> str:
    """
    Generate a unique report ID in format 'rec-xxxxxxxxxx' or 'eval-xxxxxxxxxx'
    where xxxxxxxxxx is a 10-character alphanumeric string with timestamp component
    
    Args:
        report_type (str): Type of report ('rec' or 'eval')
        db (Session): Database session for uniqueness check (optional)
        
    Returns:
        str: Unique report ID
    """
    import time
    from app.models import Report
    
    max_attempts = 10
    for attempt in range(max_attempts):
        # Generate timestamp-based component (last 4 digits of timestamp)
        timestamp_suffix = str(int(time.time() * 1000))[-4:]
        
        # Generate 6-character random alphanumeric string
        chars = string.ascii_lowercase + string.digits
        random_suffix = ''.join(random.choice(chars) for _ in range(6))
        
        # Combine timestamp and random components
        report_id = f"{report_type}-{timestamp_suffix}{random_suffix}"
        
        # If database session is provided, check for uniqueness
        if db is not None:
            existing_report = db.query(Report).filter(Report.report_id == report_id).first()
            if existing_report is None:
                return report_id
        else:
            # If no database check, return the generated ID
            return report_id
    
    # If we've exhausted all attempts, raise an error
    raise Exception(f"Failed to generate unique report ID after {max_attempts} attempts")


def get_country_name_by_id(country_id: str, db: Session) -> str:
    """
    Get country name by country ID
    
    Args:
        country_id (str): Country ID
        db (Session): Database session
        
    Returns:
        str: Country name or "Unknown Country" if not found
    """
    try:
        if not country_id:
            return "Unknown Country"
            
        country_info = db.query(CountryModel).filter(
            CountryModel.id == uuid.UUID(country_id)
        ).first()
        
        if country_info and country_info.name:
            return country_info.name
        else:
            logger.warning(f"Country information not found for country_id: {country_id}")
            return "Unknown Country"
    except Exception as e:
        logger.error(f"Error getting country name for country_id {country_id}: {str(e)}")
        return "Unknown Country"


def get_currency_by_country_id(country_id: str, db: Session) -> str:
    """
    Get country currency by country ID
    
    Args:
        country_id (str): Country ID
        db (Session): Database session
        
    Returns:
        str: Country currency symbol/code or "$" if not found
    """
    try:
        if not country_id:
            return "$"
            
        country_info = db.query(CountryModel).filter(
            CountryModel.id == uuid.UUID(country_id)
        ).first()
        
        if country_info and country_info.currency:
            return country_info.currency
        else:
            logger.warning(f"Currency information not found for country_id: {country_id}")
            return "$"
    except Exception as e:
        logger.error(f"Error getting currency for country_id {country_id}: {str(e)}")
        return "$"


def rec_pdf_report_generator(api_response: dict, user_id: str, simulation_id: str, report_id: str, db: Session) -> None:
    """
    Asynchronously generate PDF report, upload to AWS bucket, and store metadata in reports table
    This function is designed to be called as fire-and-forget
    
    Args:
        api_response (dict): Complete API response from diet recommendation
        user_id (str): User ID who requested the report
        simulation_id (str): Simulation ID from the request
        report_id (str): Pre-generated report ID to use
        db (Session): Database session
    """
    try:
        logger.info(f"Starting async PDF report generation for simulation_id: {simulation_id}, user_id: {user_id}, report_id: {report_id}")
        
        # Fetch user information from database
        user_info = db.query(UserInformationModel).filter(
            UserInformationModel.id == uuid.UUID(user_id)
        ).first()
        
        if not user_info:
            logger.warning(f"User information not found for user_id: {user_id}")
            user_name = "Unknown User"
            user_email = "unknown@email.com"
        else:
            user_name = user_info.name
            user_email = user_info.email_id
        
        # Generate PDF using existing generator with user information
        pdf_bytes = generate_diet_recommendation_pdf(api_response, user_id, simulation_id, user_name, user_email, report_id)
        
        # Upload PDF directly to AWS bucket
        from services.aws_service import aws_service
        success, bucket_url, error_message = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes,
            user_id=user_id,
            report_id=report_id
        )
        
        # Store API response as Python dict (not JSON string) to match evaluation API format
        json_result = api_response
        
        # UPDATE the existing report record instead of creating a new one
        report = db.query(Report).filter(Report.report_id == report_id).first()
        
        if report:
            if success:
                report.bucket_url = bucket_url
                report.json_result = json_result
                report.saved_to_bucket = True
                report.updated_at = datetime.utcnow()
                logger.info(f"PDF report uploaded to AWS and record updated. Report ID: {report_id}, Bucket URL: {bucket_url}")
            else:
                report.json_result = json_result
                report.saved_to_bucket = False
                report.updated_at = datetime.utcnow()
                logger.error(f"Failed to upload PDF to AWS for report_id {report_id}, record updated with error status")
            
            db.commit()
            db.refresh(report)
        else:
            # Fallback if record wasn't created synchronously for some reason
            if success:
                report = Report(
                    report_id=report_id,
                    report_type='rec',
                    user_id=uuid.UUID(user_id),
                    bucket_url=bucket_url,
                    json_result=json_result,
                    saved_to_bucket=True,
                    save_report=False,
                    report=None
                )
            else:
                report = Report(
                    report_id=report_id,
                    report_type='rec',
                    user_id=uuid.UUID(user_id),
                    bucket_url=None,
                    json_result=json_result,
                    saved_to_bucket=False,
                    save_report=False,
                    report=None
                )
            db.add(report)
            db.commit()
            logger.warning(f"Report record not found for update, created new record instead. Report ID: {report_id}")
        
    except Exception as e:
        logger.error(f"Failed to generate/upload PDF report for simulation_id {simulation_id}: {str(e)}")
        # Don't raise the exception - this is fire-and-forget
        try:
            db.rollback()
        except:
            pass  # Ignore rollback errors in async context

def eval_pdf_report_generator(api_response: dict, user_id: str, simulation_id: str, report_id: str, db: Session) -> None:
    """
    Asynchronously generate PDF report for evaluation, upload to AWS bucket, and store metadata in reports table.
    Designed to be called as fire-and-forget.
    """
    try:
        logger.info(f"Starting async Evaluation PDF report generation for simulation_id: {simulation_id}, user_id: {user_id}, report_id: {report_id}")
        
        # Fetch user information from database
        user_info = db.query(UserInformationModel).filter(
            UserInformationModel.id == uuid.UUID(user_id)
        ).first()
        
        if not user_info:
            logger.warning(f"User information not found for user_id: {user_id}")
            user_name = "Unknown User"
            user_email = "unknown@email.com"
        else:
            user_name = user_info.name
            user_email = user_info.email_id
        
        # Generate PDF using evaluation-specific generator
        from core.z_optimization.pdf_generator import generate_diet_evaluation_pdf
        pdf_bytes = generate_diet_evaluation_pdf(api_response, user_id, simulation_id, user_name, user_email, report_id)
        
        # Upload PDF directly to AWS bucket
        from services.aws_service import aws_service
        success, bucket_url, error_message = aws_service.upload_pdf_to_s3(
            pdf_data=pdf_bytes,
            user_id=user_id,
            report_id=report_id
        )
        
        # UPDATE the existing report record instead of creating a new one
        report = db.query(Report).filter(Report.report_id == report_id).first()
        
        if report:
            if success:
                report.bucket_url = bucket_url
                report.json_result = api_response
                report.saved_to_bucket = True
                report.updated_at = datetime.utcnow()
                logger.info(f"Evaluation PDF report uploaded to AWS and record updated. Report ID: {report_id}, URL: {bucket_url}")
            else:
                report.json_result = api_response
                report.saved_to_bucket = False
                report.updated_at = datetime.utcnow()
                logger.error(f"Failed to upload Evaluation PDF to AWS for report_id {report_id}, record updated with error status")
            
            db.commit()
            db.refresh(report)
        else:
            # Fallback if record wasn't created synchronously for some reason
            if success:
                report = Report(
                    report_id=report_id,
                    report_type='eval',
                    user_id=uuid.UUID(user_id),
                    bucket_url=bucket_url,
                    json_result=api_response,
                    saved_to_bucket=True,
                    save_report=False,
                    report=None
                )
            else:
                report = Report(
                    report_id=report_id,
                    report_type='eval',
                    user_id=uuid.UUID(user_id),
                    bucket_url=None,
                    json_result=api_response,
                    saved_to_bucket=False,
                    save_report=False,
                    report=None
                )
            db.add(report)
            db.commit()
            logger.warning(f"Evaluation report record not found for update, created new record instead. Report ID: {report_id}")
        
    except Exception as e:
        logger.error(f"Failed to generate/upload Evaluation PDF report: {str(e)}")
        try:
            db.rollback()
        except:
            pass
