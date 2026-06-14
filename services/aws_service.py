#!/usr/bin/env python3
"""
AWS Service for S3 Operations
Handles uploading PDF reports to AWS S3 bucket
"""

import os
import boto3
from datetime import datetime
from typing import Optional, Tuple
from botocore.exceptions import ClientError, NoCredentialsError
import logging

logger = logging.getLogger(__name__)

class AWSService:
    def __init__(self):
        """Initialize AWS S3 client with credentials from environment variables"""
        self.aws_access_key_id = os.getenv('AWS_ACCESS_KEY_ID')
        self.aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY')
        self.aws_region = os.getenv('AWS_REGION', 'us-east-1')
        self.s3_bucket_name = os.getenv('AWS_S3_BUCKET')
        
        # Validate required environment variables
        if not all([self.aws_access_key_id, self.aws_secret_access_key, self.s3_bucket_name]):
            logger.warning("AWS credentials not fully configured. S3 uploads will fail.")
            self.is_configured = False
        else:
            self.is_configured = True
        
        # Initialize S3 client
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.aws_region
            )
            logger.info(f"AWS S3 client initialized for bucket: {self.s3_bucket_name}")
        except Exception as e:
            logger.error(f"Failed to initialize AWS S3 client: {str(e)}")
            self.s3_client = None
            self.is_configured = False

    def upload_pdf_to_s3(self, pdf_data: bytes, user_id: str, report_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Upload PDF data to S3 bucket
        
        Args:
            pdf_data (bytes): PDF file data as bytes
            user_id (str): User UUID
            report_id (str): Report ID (e.g., 'rec-abc123')
            
        Returns:
            Tuple[bool, Optional[str], Optional[str]]: (success, bucket_url, error_message)
        """
        if not self.is_configured or not self.s3_client:
            return False, None, "AWS S3 not configured properly"
        
        try:
            # Generate file path: reports/{user_id}/{report_id}_{date}.pdf
            current_date = datetime.now().strftime("%Y%m%d")
            file_name = f"{report_id}_{current_date}.pdf"
            s3_key = f"reports/{user_id}/{file_name}"
            
            logger.info(f"Uploading PDF to S3: {s3_key}")
            
            # Upload file to S3
            self.s3_client.put_object(
                Bucket=self.s3_bucket_name,
                Key=s3_key,
                Body=pdf_data,
                ContentType='application/pdf',
                Metadata={
                    'report_id': report_id,
                    'user_id': user_id,
                    'upload_date': current_date,
                    'file_type': 'diet_recommendation_report'
                }
            )
            
            # Generate the public URL
            bucket_url = f"https://{self.s3_bucket_name}.s3.{self.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"PDF uploaded successfully to S3: {bucket_url}")
            return True, bucket_url, None
            
        except NoCredentialsError:
            error_msg = "AWS credentials not found or invalid"
            logger.error(error_msg)
            return False, None, error_msg
        except ClientError as e:
            error_msg = f"AWS S3 error: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg
        except Exception as e:
            error_msg = f"Unexpected error uploading to S3: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg

    def upload_export_to_s3(self, file_data: bytes, user_id: str, export_id: str, file_extension: str = "xlsx") -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Upload export file (Excel) to S3 bucket in feed_exports folder
        
        Args:
            file_data (bytes): File data as bytes
            user_id (str): User UUID
            export_id (str): Export ID (e.g., 'feeds_export_20250824_143052')
            file_extension (str): File extension (default: 'xlsx')
            
        Returns:
            Tuple[bool, Optional[str], Optional[str]]: (success, bucket_url, error_message)
        """
        if not self.is_configured or not self.s3_client:
            return False, None, "AWS S3 not configured properly"
        
        try:
            # Generate file path: feed_exports/{user_id}/{export_id}.{extension}
            file_name = f"{export_id}.{file_extension}"
            s3_key = f"feed_exports/{user_id}/{file_name}"
            
            logger.info(f"Uploading export file to S3: {s3_key}")
            
            # Upload file to S3
            self.s3_client.put_object(
                Bucket=self.s3_bucket_name,
                Key=s3_key,
                Body=file_data,
                ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                Metadata={
                    'export_id': export_id,
                    'user_id': user_id,
                    'upload_date': datetime.now().strftime("%Y%m%d"),
                    'file_type': 'feed_export'
                }
            )
            
            # Generate the public URL
            bucket_url = f"https://{self.s3_bucket_name}.s3.{self.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Export file uploaded successfully to S3: {bucket_url}")
            return True, bucket_url, None
            
        except NoCredentialsError:
            error_msg = "AWS credentials not found or invalid"
            logger.error(error_msg)
            return False, None, error_msg
        except ClientError as e:
            error_msg = f"AWS S3 error: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg
        except Exception as e:
            error_msg = f"Unexpected error uploading to S3: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg

    def upload_bulk_import_log_to_s3(self, log_content: str, filename: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Upload bulk import log file to S3 bucket
        
        Args:
            log_content (str): Log content as string
            filename (str): Log filename (e.g., 'bulk_import_27:09:24:14:30.txt')
            
        Returns:
            Tuple[bool, Optional[str], Optional[str]]: (success, bucket_url, error_message)
        """
        if not self.is_configured or not self.s3_client:
            return False, None, "AWS S3 not configured properly"
        
        try:
            # Generate file path: bulk_import_logs/{filename}
            s3_key = f"bulk_import_logs/{filename}"
            
            logger.info(f"Uploading bulk import log to S3: {s3_key}")
            
            # Convert string to bytes
            log_bytes = log_content.encode('utf-8')
            
            # Upload file to S3
            self.s3_client.put_object(
                Bucket=self.s3_bucket_name,
                Key=s3_key,
                Body=log_bytes,
                ContentType='text/plain',
                Metadata={
                    'filename': filename,
                    'upload_date': datetime.now().strftime("%Y%m%d"),
                    'file_type': 'bulk_import_log'
                }
            )
            
            # Generate the public URL
            bucket_url = f"https://{self.s3_bucket_name}.s3.{self.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Bulk import log uploaded successfully to S3: {bucket_url}")
            return True, bucket_url, None
            
        except NoCredentialsError:
            error_msg = "AWS credentials not found or invalid"
            logger.error(error_msg)
            return False, None, error_msg
        except ClientError as e:
            error_msg = f"AWS S3 error: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg
        except Exception as e:
            error_msg = f"Unexpected error uploading log to S3: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg

    def delete_file_from_s3(self, bucket_url: str) -> Tuple[bool, Optional[str]]:
        """
        Delete a file from S3 using its bucket URL
        
        Args:
            bucket_url (str): The full URL of the file in S3
            
        Returns:
            Tuple[bool, Optional[str]]: (success, error_message)
        """
        if not self.is_configured or not self.s3_client:
            return False, "AWS S3 not configured properly"
        
        if not bucket_url:
            return True, None # Nothing to delete
            
        try:
            # Extract s3_key from bucket_url
            # URL format: https://{bucket}.s3.{region}.amazonaws.com/{key}
            parts = bucket_url.split('.amazonaws.com/')
            if len(parts) < 2:
                # Try alternative format if needed (e.g. bucket.s3-region.amazonaws.com)
                parts = bucket_url.split('/')
                # if URL is https://bucket.s3.region.amazonaws.com/key, parts[0] is https:, parts[1] is "", parts[2] is bucket.s3.region.amazonaws.com
                # the key is everything after parts[2]
                s3_key = "/".join(parts[3:])
            else:
                s3_key = parts[1]
            
            logger.info(f"Deleting file from S3: {s3_key}")
            
            self.s3_client.delete_object(
                Bucket=self.s3_bucket_name,
                Key=s3_key
            )
            
            logger.info(f"Successfully deleted file from S3: {s3_key}")
            return True, None
            
        except ClientError as e:
            error_msg = f"AWS S3 deletion error: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error deleting from S3: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def get_latest_export_file(self, export_type: str, user_id: str) -> Tuple[bool, Optional[str], Optional[datetime]]:
        """
        Get the latest export file of a specific type for a user
        
        Args:
            export_type (str): Type of export ('feeds_export' or 'custom_feeds_export')
            user_id (str): User UUID
            
        Returns:
            Tuple[bool, Optional[str], Optional[datetime]]: (success, file_url, file_timestamp)
        """
        if not self.is_configured or not self.s3_client:
            return False, None, None
        
        try:
            # List objects in the user's feed_exports folder
            prefix = f"feed_exports/{user_id}/"
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(
                Bucket=self.s3_bucket_name,
                Prefix=prefix
            )
            
            latest_file = None
            latest_timestamp = None
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        # Check if this is an export file of the specified type
                        if (key.startswith(prefix) and 
                            export_type in key and 
                            key.endswith('.xlsx')):
                            
                            # Extract timestamp from filename
                            # Format: feeds_export_20250824_133858.xlsx
                            filename = key.split('/')[-1]
                            if '_' in filename and '.' in filename:
                                timestamp_part = filename.split('_')[-1].replace('.xlsx', '')
                                try:
                                    # Parse timestamp: YYYYMMDD_HHMMSS
                                    file_timestamp = datetime.strptime(timestamp_part, '%Y%m%d_%H%M%S')
                                    
                                    if latest_timestamp is None or file_timestamp > latest_timestamp:
                                        latest_timestamp = file_timestamp
                                        latest_file = f"https://{self.s3_bucket_name}.s3.{self.aws_region}.amazonaws.com/{key}"
                                except ValueError:
                                    # Skip files with invalid timestamp format
                                    continue
            
            if latest_file and latest_timestamp:
                logger.info(f"Found latest {export_type} file: {latest_file} (timestamp: {latest_timestamp})")
                return True, latest_file, latest_timestamp
            else:
                logger.info(f"No {export_type} files found for user {user_id}")
                return True, None, None
                
        except ClientError as e:
            error_msg = f"AWS S3 error getting latest export file: {str(e)}"
            logger.error(error_msg)
            return False, None, None
        except Exception as e:
            error_msg = f"Unexpected error getting latest export file: {str(e)}"
            logger.error(error_msg)
            return False, None, None

    def delete_old_export_files(self, export_type: str) -> Tuple[bool, str, int]:
        """
        Delete all previous export files of the same type across all users, keeping the most recent one
        
        Args:
            export_type (str): Type of export ('feeds_export' or 'custom_feeds_export')
            
        Returns:
            Tuple[bool, str, int]: (success, message, deleted_count)
        """
        if not self.is_configured or not self.s3_client:
            return False, "AWS S3 not configured properly", 0
        
        try:
            deleted_count = 0
            
            # List all objects in the feed_exports folder
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(
                Bucket=self.s3_bucket_name,
                Prefix='feed_exports/'
            )
            
            # Collect all files that match the export type pattern with their timestamps
            files_with_timestamps = []
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        # Check if this is an export file of the same type
                        if (key.startswith('feed_exports/') and 
                            export_type in key and 
                            key.endswith('.xlsx')):
                            
                            # Extract timestamp from filename
                            filename = key.split('/')[-1]
                            if '_' in filename and '.' in filename:
                                timestamp_part = filename.split('_')[-1].replace('.xlsx', '')
                                try:
                                    # Parse timestamp: YYYYMMDD_HHMMSS
                                    file_timestamp = datetime.strptime(timestamp_part, '%Y%m%d_%H%M%S')
                                    files_with_timestamps.append((key, file_timestamp))
                                except ValueError:
                                    # Skip files with invalid timestamp format
                                    continue
            
            # Sort files by timestamp (newest first) and keep the most recent one
            if files_with_timestamps:
                files_with_timestamps.sort(key=lambda x: x[1], reverse=True)
                
                # Keep the most recent file, delete all others
                files_to_delete = [key for key, _ in files_with_timestamps[1:]]
                
                # Delete old files
                if files_to_delete:
                    # S3 can delete up to 1000 objects in a single request
                    for i in range(0, len(files_to_delete), 1000):
                        batch = files_to_delete[i:i+1000]
                        delete_objects = {'Objects': [{'Key': key} for key in batch]}
                        
                        response = self.s3_client.delete_objects(
                            Bucket=self.s3_bucket_name,
                            Delete=delete_objects
                        )
                        
                        deleted_count += len(response.get('Deleted', []))
                    
                    logger.info(f"Deleted {deleted_count} old {export_type} files from S3, kept the most recent one")
                    return True, f"Successfully deleted {deleted_count} old {export_type} files, kept the most recent one", deleted_count
                else:
                    logger.info(f"No old {export_type} files to delete (only one file exists)")
                    return True, f"No old {export_type} files to delete (only one file exists)", 0
            else:
                logger.info(f"No {export_type} files found to delete")
                return True, f"No {export_type} files found to delete", 0
                
        except ClientError as e:
            error_msg = f"AWS S3 error during deletion: {str(e)}"
            logger.error(error_msg)
            return False, error_msg, 0
        except Exception as e:
            error_msg = f"Unexpected error during deletion: {str(e)}"
            logger.error(error_msg)
            return False, error_msg, 0

    def get_latest_bulk_import_log(self) -> Tuple[bool, Optional[str], Optional[str], Optional[str], Optional[str], Optional[datetime]]:
        """
        Get the latest bulk import log file from S3
        
        Returns:
            Tuple[bool, Optional[str], Optional[str], Optional[str], Optional[str], Optional[datetime]]: 
            (success, log_file_url, filename, file_size, error_message, created_at)
        """
        if not self.is_configured or not self.s3_client:
            return False, None, None, None, "AWS S3 not configured properly", None
        
        try:
            # List objects in the bulk_import_logs folder
            prefix = "bulk_import_logs/"
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(
                Bucket=self.s3_bucket_name,
                Prefix=prefix
            )
            
            latest_file = None
            latest_timestamp = None
            latest_size = None
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        # Check if this is a bulk import log file
                        if (key.startswith(prefix) and 
                            key.endswith('.txt') and
                            'bulk_import' in key):
                            
                            # Get file metadata
                            file_size = obj['Size']
                            last_modified = obj['LastModified']
                            
                            # Use LastModified as the timestamp for comparison
                            if latest_timestamp is None or last_modified > latest_timestamp:
                                latest_timestamp = last_modified
                                latest_file = key
                                latest_size = file_size
            
            if latest_file and latest_timestamp:
                # Generate the public URL
                log_file_url = f"https://{self.s3_bucket_name}.s3.{self.aws_region}.amazonaws.com/{latest_file}"
                filename = latest_file.split('/')[-1]
                file_size_str = f"{latest_size} bytes"
                
                logger.info(f"Found latest bulk import log: {filename} (timestamp: {latest_timestamp})")
                return True, log_file_url, filename, file_size_str, None, latest_timestamp
            else:
                logger.info("No bulk import log files found in S3")
                return True, None, None, None, "No bulk import log files found", None
                
        except ClientError as e:
            error_msg = f"AWS S3 error getting latest bulk import log: {str(e)}"
            logger.error(error_msg)
            return False, None, None, None, error_msg, None
        except Exception as e:
            error_msg = f"Unexpected error getting latest bulk import log: {str(e)}"
            logger.error(error_msg)
            return False, None, None, None, error_msg, None

    def test_s3_connection(self) -> Tuple[bool, str]:
        """
        Test S3 connection and bucket access
        
        Returns:
            Tuple[bool, str]: (success, message)
        """
        if not self.is_configured or not self.s3_client:
            return False, "AWS S3 not configured"
        
        try:
            # Test bucket access
            self.s3_client.head_bucket(Bucket=self.s3_bucket_name)
            return True, f"Successfully connected to S3 bucket: {self.s3_bucket_name}"
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                return False, f"S3 bucket not found: {self.s3_bucket_name}"
            elif error_code == '403':
                return False, f"Access denied to S3 bucket: {self.s3_bucket_name}"
            else:
                return False, f"S3 connection error: {str(e)}"
        except Exception as e:
            return False, f"Unexpected error testing S3 connection: {str(e)}"

# Create global instance
aws_service = AWSService()
