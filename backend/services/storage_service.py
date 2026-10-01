"""
Storage service abstraction for RationSmart v4.0.
AWS S3 implementation now; Azure Blob Storage added in Phase 5.
"""
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class StorageService(ABC):
    @abstractmethod
    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> str:
        """Upload bytes to storage and return the public URL (never presigned)."""
        ...

    @abstractmethod
    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        """Return the plain public URL for an existing object. `expires_in` is accepted
        for interface parity but ignored — no backend here presigns/SAS-signs URLs."""
        ...

    @abstractmethod
    def delete_file(self, key: str) -> None:
        """Delete an object by storage key. Silently succeeds if already gone."""
        ...

    # ── Upload helpers (shared, backend-agnostic) ──────────────────────────────
    # These only build a storage key + metadata and delegate to upload_file, so every
    # backend gets identical key-naming/tagging conventions for free instead of risking
    # drift.

    def upload_pdf(self, user_id: str, report_id: str, pdf_data: bytes) -> Tuple[bool, Optional[str], Optional[str]]:
        date_str = datetime.utcnow().strftime("%Y%m%d")
        key = f"reports/{user_id}/{report_id}_{date_str}.pdf"
        metadata = {
            "report_id": report_id,
            "user_id": user_id,
            "upload_date": date_str,
            "file_type": "diet_recommendation_report",
        }
        try:
            url = self.upload_file(key, pdf_data, "application/pdf", metadata=metadata)
            return True, url, None
        except Exception as exc:
            logger.error("PDF upload failed: %s", exc)
            return False, None, str(exc)

    def upload_export(
        self, user_id: str, export_id: str, file_data: bytes, ext: str = "xlsx"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        key = f"feed_exports/{user_id}/{export_id}.{ext}"
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        metadata = {
            "export_id": export_id,
            "user_id": user_id,
            "upload_date": datetime.utcnow().strftime("%Y%m%d"),
            "file_type": "feed_export",
        }
        try:
            url = self.upload_file(key, file_data, content_type, metadata=metadata)
            return True, url, None
        except Exception as exc:
            logger.error("Export upload failed: %s", exc)
            return False, None, str(exc)

    def upload_bulk_log(self, filename: str, content: str) -> Tuple[bool, Optional[str], Optional[str]]:
        key = f"bulk_import_logs/{filename}"
        metadata = {
            "filename": filename,
            "upload_date": datetime.utcnow().strftime("%Y%m%d"),
            "file_type": "bulk_import_log",
        }
        try:
            url = self.upload_file(key, content.encode("utf-8"), "text/plain", metadata=metadata)
            return True, url, None
        except Exception as exc:
            logger.error("Bulk log upload failed: %s", exc)
            return False, None, str(exc)


class AWSStorageService(StorageService):
    """boto3-based S3 implementation. Replaces direct boto3 calls in the old codebase."""

    def __init__(self, bucket: str, region: str, access_key: str = "", secret_key: str = ""):
        import boto3

        self._bucket = bucket
        self._region = region
        # Matches legacy aws_service.py: fail-fast if not fully configured, rather than
        # discovering it only when an upload is attempted.
        self.is_configured = bool(access_key and secret_key and bucket)
        if not self.is_configured:
            logger.warning(
                "AWS S3 not fully configured (missing bucket/access_key/secret_key) — uploads will fail."
            )
        try:
            self._client = boto3.client(
                "s3",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region,
            )
        except Exception as exc:
            logger.error("Failed to initialize AWS S3 client: %s", exc)
            self._client = None
            self.is_configured = False

    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> str:
        if not self.is_configured or not self._client:
            raise RuntimeError("AWS S3 not configured properly")

        from botocore.exceptions import ClientError, NoCredentialsError

        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                **({"Metadata": metadata} if metadata else {}),
            )
        except NoCredentialsError:
            raise RuntimeError("AWS credentials not found or invalid")
        except ClientError as exc:
            raise RuntimeError(f"AWS S3 error: {exc}")
        return self.get_file_url(key)

    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        # Plain, non-expiring URL — matches legacy aws_service behavior. `expires_in` is
        # accepted for ABC/interface parity but intentionally unused: this must never
        # return a presigned URL, since bucket_url is persisted to the reports table and
        # reused indefinitely (object access is governed by bucket policy, not a signed URL).
        return f"https://{self._bucket}.s3.{self._region}.amazonaws.com/{key}"

    def delete_file(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            logger.warning("S3 delete failed for key %s: %s", key, exc)

    def delete_by_url(self, url: str) -> Tuple[bool, Optional[str]]:
        """Extract key from an S3 URL and delete it."""
        try:
            parts = url.split(".amazonaws.com/")
            key = parts[1] if len(parts) >= 2 else "/".join(url.split("/")[3:])
            self.delete_file(key)
            return True, None
        except Exception as exc:
            logger.error("S3 delete_by_url failed for %s: %s", url, exc)
            return False, str(exc)


class AzureBlobStorageService(StorageService):
    """azure-storage-blob-based implementation (upload path only, for now)."""

    def __init__(self, account_name: str, account_key: str, container: str):
        if not account_name or not account_key:
            raise ValueError(
                "AzureBlobStorageService requires both account_name and account_key — "
                "unlike AWSStorageService/boto3, there is no IAM-role-style credential "
                "fallback for Azure account-key auth. Set AZURE_STORAGE_ACCOUNT_NAME and "
                "AZURE_STORAGE_ACCOUNT_KEY."
            )
        from azure.storage.blob import BlobServiceClient

        self._account_name = account_name
        self._container_name = container
        account_url = f"https://{account_name}.blob.core.windows.net"
        self._service_client = BlobServiceClient(account_url=account_url, credential=account_key)
        self._container_client = self._service_client.get_container_client(container)

    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> str:
        from azure.storage.blob import ContentSettings

        blob_client = self._container_client.get_blob_client(key)
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
            metadata=metadata,
        )
        return self.get_file_url(key)

    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        # Plain blob URL — no SAS signing. `expires_in` is accepted (to satisfy the ABC
        # signature) but unused; this must never return a presigned/SAS URL.
        return f"https://{self._account_name}.blob.core.windows.net/{self._container_name}/{key}"

    def delete_file(self, key: str) -> None:
        # Minimal implementation to satisfy the ABC — not a focus of this pass.
        try:
            self._container_client.delete_blob(key)
        except Exception as exc:
            logger.warning("Azure Blob delete failed for key %s: %s", key, exc)


def make_storage_service() -> StorageService:
    """Factory — returns the storage backend selected by settings.storage_provider."""
    from app.config import settings

    if settings.storage_provider == "aws":
        return AWSStorageService(
            bucket=settings.aws_s3_bucket,
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
        )
    if settings.storage_provider == "azure":
        return AzureBlobStorageService(
            account_name=settings.azure_storage_account_name,
            account_key=settings.azure_storage_account_key,
            container=settings.azure_storage_container,
        )
    # Not reachable through normal env-var configuration — Settings.storage_provider is a
    # Literal["aws", "azure"], so pydantic already rejects any other value at app startup.
    # This is a second, defensive layer for programmatic misuse (e.g. tests).
    raise ValueError(f"Unsupported storage_provider: {settings.storage_provider!r}")


storage_service: StorageService = make_storage_service()
