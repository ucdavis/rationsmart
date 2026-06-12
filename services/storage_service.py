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
        self, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        """Upload bytes to storage and return the public/presigned URL."""
        ...

    @abstractmethod
    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        """Return a (possibly presigned) URL for an existing object."""
        ...

    @abstractmethod
    def delete_file(self, key: str) -> None:
        """Delete an object by storage key. Silently succeeds if already gone."""
        ...


class AWSStorageService(StorageService):
    """boto3-based S3 implementation. Replaces direct boto3 calls in the old codebase."""

    def __init__(self, bucket: str, region: str, access_key: str = "", secret_key: str = ""):
        import boto3

        self._bucket = bucket
        self._region = region
        kwargs = {"region_name": region}
        if access_key and secret_key:
            kwargs["aws_access_key_id"] = access_key
            kwargs["aws_secret_access_key"] = secret_key
        self._client = boto3.client("s3", **kwargs)

    def upload_file(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )
        return self.get_file_url(key)

    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def delete_file(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            logger.warning("S3 delete failed for key %s: %s", key, exc)

    # ── Domain helpers used by services ───────────────────────────────────────

    def upload_pdf(self, user_id: str, report_id: str, pdf_data: bytes) -> Tuple[bool, Optional[str], Optional[str]]:
        date_str = datetime.utcnow().strftime("%Y%m%d")
        key = f"reports/{user_id}/{report_id}_{date_str}.pdf"
        try:
            url = self.upload_file(key, pdf_data, "application/pdf")
            return True, url, None
        except Exception as exc:
            logger.error("PDF upload failed: %s", exc)
            return False, None, str(exc)

    def upload_export(
        self, user_id: str, export_id: str, file_data: bytes, ext: str = "xlsx"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        key = f"feed_exports/{user_id}/{export_id}.{ext}"
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        try:
            url = self.upload_file(key, file_data, content_type)
            return True, url, None
        except Exception as exc:
            logger.error("Export upload failed: %s", exc)
            return False, None, str(exc)

    def upload_bulk_log(self, filename: str, content: str) -> Tuple[bool, Optional[str], Optional[str]]:
        key = f"bulk_import_logs/{filename}"
        try:
            url = self.upload_file(key, content.encode("utf-8"), "text/plain")
            return True, url, None
        except Exception as exc:
            logger.error("Bulk log upload failed: %s", exc)
            return False, None, str(exc)

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


def make_storage_service() -> StorageService:
    """Factory — returns AWSStorageService built from settings. Phase 5 swaps to Azure."""
    from app.config import settings

    return AWSStorageService(
        bucket=settings.aws_s3_bucket,
        region=settings.aws_region,
        access_key=settings.aws_access_key_id,
        secret_key=settings.aws_secret_access_key,
    )


storage_service: StorageService = make_storage_service()
