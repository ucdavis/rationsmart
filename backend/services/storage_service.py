"""
Storage service abstraction for RationSmart v4.0.
Backends: AWS S3 (default) and Azure Blob Storage, selected by STORAGE_BACKEND.
"""
import logging
import re
import threading
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, Tuple
from urllib.parse import quote, unquote, urlsplit

logger = logging.getLogger(__name__)


def _inline_pdf_disposition(report_id: str) -> str:
    """Content-Disposition that shows the PDF in the browser and names a saved copy
    rationsmart_rec_<id>.pdf. Anything outside [A-Za-z0-9._-] is replaced, so an odd report
    id can never break the header."""
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", str(report_id))
    return f'inline; filename="rationsmart_rec_{safe}.pdf"'


class StorageService(ABC):
    # Only the Azure backend sets an inline Content-Disposition on PDFs; S3 objects stay
    # exactly as they were, so the Test server's behaviour does not change.
    sets_content_disposition = False

    @abstractmethod
    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
        content_disposition: Optional[str] = None,
    ) -> str:
        """Upload bytes to storage and return the public URL (never presigned).

        `metadata` and `content_disposition` are optional hints; a backend may ignore them
        (Azure ignores `metadata`: on a public container it would be returned as
        x-ms-meta-* headers to anyone holding the link)."""
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
        extra = {}
        if self.sets_content_disposition:
            extra["content_disposition"] = _inline_pdf_disposition(report_id)
        try:
            url = self.upload_file(key, pdf_data, "application/pdf", metadata=metadata, **extra)
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
        content_disposition: Optional[str] = None,
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
                **({"ContentDisposition": content_disposition} if content_disposition else {}),
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


# Azure naming rules (https://learn.microsoft.com/azure/storage/common/storage-account-overview)
_ACCOUNT_RE = re.compile(r"^[a-z0-9]{3,24}$")
_CONTAINER_RE = re.compile(r"^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62}$")


class AzureBlobStorageService(StorageService):
    """Azure Blob Storage, signed in with Microsoft Entra ID (the VM's managed identity).

    No account key or connection string exists: the storage account has shared-key access
    off. Nothing here talks to Azure or imports the Azure SDK until the first upload, so
    importing this module can never fail or hang, whatever the configuration. A bad
    configuration is reported the way the AWS backend reports it: the upload fails with a
    clear message and the report is saved without a PDF link.
    """

    sets_content_disposition = True

    def __init__(self, account_name: str, container: str, credential=None):
        self._account_name = (account_name or "").strip()
        self._container_name = (container or "").strip()
        self._credential = credential  # None: DefaultAzureCredential, created on first use
        self._container_client = None
        self._lock = threading.Lock()
        problems = []
        if not _ACCOUNT_RE.match(self._account_name):
            problems.append("AZURE_STORAGE_ACCOUNT must be 3-24 lowercase letters and digits")
        if not _CONTAINER_RE.match(self._container_name):
            problems.append("AZURE_STORAGE_CONTAINER must be a valid container name (3-63 lowercase letters, digits, single hyphens)")
        self.config_error = "; ".join(problems) or None
        self.is_configured = self.config_error is None
        if not self.is_configured:
            logger.error("Azure Blob Storage not configured (%s) - uploads will fail.", self.config_error)

    # ── internals ─────────────────────────────────────────────────────────────

    def _container(self):
        """Create the SDK client on first use. Raises RuntimeError with a readable message."""
        if not self.is_configured:
            raise RuntimeError(f"Azure Blob Storage not configured properly: {self.config_error}")
        if self._container_client is not None:
            return self._container_client
        with self._lock:
            if self._container_client is None:
                try:
                    from azure.storage.blob import BlobServiceClient
                    credential = self._credential
                    if credential is None:
                        from azure.identity import DefaultAzureCredential
                        credential = DefaultAzureCredential()
                except ImportError as exc:
                    raise RuntimeError(f"Azure SDK is not installed (azure-storage-blob, azure-identity): {exc}")
                service = BlobServiceClient(
                    account_url=f"https://{self._account_name}.blob.core.windows.net",
                    credential=credential,
                )
                self._container_client = service.get_container_client(self._container_name)
        return self._container_client

    # ── StorageService ────────────────────────────────────────────────────────

    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
        content_disposition: Optional[str] = None,
    ) -> str:
        # `metadata` is deliberately NOT sent: the container is publicly readable, so blob
        # metadata (user id, report id) would be returned as x-ms-meta-* headers to anyone
        # holding the link.
        container = self._container()
        try:
            from azure.core.exceptions import ClientAuthenticationError, HttpResponseError
            from azure.storage.blob import ContentSettings

            container.get_blob_client(key).upload_blob(
                data,
                overwrite=True,
                content_settings=ContentSettings(
                    content_type=content_type,
                    **({"content_disposition": content_disposition} if content_disposition else {}),
                ),
            )
        except ClientAuthenticationError:
            raise RuntimeError("Azure credentials not found or invalid")
        except HttpResponseError as exc:
            raise RuntimeError(f"Azure Blob error: {exc}")
        return self.get_file_url(key)

    def get_file_url(self, key: str, expires_in: int = 3600) -> str:
        # Plain blob URL, no SAS signing; `expires_in` is accepted for interface parity and
        # ignored. The key is percent-encoded so a space or '#' in it cannot break the link.
        return f"https://{self._account_name}.blob.core.windows.net/{self._container_name}/{quote(key, safe='/')}"

    def delete_file(self, key: str) -> None:
        try:
            from azure.core.exceptions import ResourceNotFoundError

            try:
                self._container().delete_blob(key)
            except ResourceNotFoundError:
                pass  # already gone
        except Exception as exc:
            logger.warning("Azure Blob delete failed for key %s: %s", key, exc)

    def delete_by_url(self, url: str) -> Tuple[bool, Optional[str]]:
        """Delete the blob a stored link points to. Refuses a link to another account or container."""
        try:
            parts = urlsplit(url)
            prefix = f"/{self._container_name}/"
            if parts.netloc.lower() != f"{self._account_name}.blob.core.windows.net" or not parts.path.startswith(prefix):
                return False, "URL does not belong to the configured storage account and container"
            self.delete_file(unquote(parts.path[len(prefix):]))
            return True, None
        except Exception as exc:
            logger.error("Azure delete_by_url failed for %s: %s", url, exc)
            return False, str(exc)


def make_storage_service() -> StorageService:
    """Factory: the backend selected by settings.storage_backend (STORAGE_BACKEND=aws|azure)."""
    from app.config import settings

    if settings.storage_backend == "aws":
        return AWSStorageService(
            bucket=settings.aws_s3_bucket,
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
        )
    if settings.storage_backend == "azure":
        return AzureBlobStorageService(
            account_name=settings.azure_storage_account,
            container=settings.azure_storage_container,
        )
    # Settings.storage_backend is a Literal["aws", "azure"], so pydantic already rejects any
    # other value at startup. This is a second layer for programmatic misuse (e.g. tests).
    raise ValueError(f"Unsupported storage_backend: {settings.storage_backend!r}")


storage_service: StorageService = make_storage_service()
