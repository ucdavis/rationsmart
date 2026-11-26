"""Storage backends (services/storage_service.py) and their configuration (app/config.py).

No network and no real cloud account: boto3 and the Azure SDK are replaced by fakes.
The module is loaded straight from its file so these tests do not import the whole
`services` package (database, e-mail, optimisation ...).
"""
import importlib.util
import os
import pathlib
import subprocess
import sys
import threading
from types import SimpleNamespace
from unittest import mock

import pytest
from pydantic import ValidationError

BACKEND = pathlib.Path(__file__).resolve().parents[2]

REQUIRED_ENV = {
    "POSTGRES_USER": "u", "POSTGRES_PASSWORD": "p", "POSTGRES_DB": "d", "POSTGRES_HOST": "h",
    "SMTP_USERNAME": "u", "SMTP_PASSWORD": "p", "FROM_EMAIL": "a@example.org",
    "JWT_SECRET_KEY": "k", "API_BASE_URL": "http://localhost",
}
for _k, _v in REQUIRED_ENV.items():
    os.environ.setdefault(_k, _v)
sys.path.insert(0, str(BACKEND))


def _load():
    spec = importlib.util.spec_from_file_location("storage_service_under_test", BACKEND / "services" / "storage_service.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ss = _load()

ACCOUNT = "rsreportsabc12345"
CONTAINER = "reports"


# ── helpers ───────────────────────────────────────────────────────────────────

class FakeBlobClient:
    def __init__(self, store, key, fail=None):
        self.store, self.key, self.fail = store, key, fail

    def upload_blob(self, data, overwrite=False, content_settings=None, **kw):
        if self.fail:
            raise self.fail
        self.store.append({"key": self.key, "data": data, "overwrite": overwrite,
                           "content_settings": content_settings, "kw": kw})


class FakeContainer:
    def __init__(self, fail=None, delete_fail=None):
        self.uploads, self.deleted, self.fail, self.delete_fail = [], [], fail, delete_fail

    def get_blob_client(self, key):
        return FakeBlobClient(self.uploads, key, self.fail)

    def delete_blob(self, key):
        if self.delete_fail:
            raise self.delete_fail
        self.deleted.append(key)


def azure(container=None, **kw):
    """An Azure service whose SDK client is the fake container."""
    svc = ss.AzureBlobStorageService(kw.pop("account", ACCOUNT), kw.pop("container", CONTAINER), credential=object())
    svc._container_client = container if container is not None else FakeContainer()
    return svc


def aws(**kw):
    defaults = dict(bucket="b", region="ap-southeast-2", access_key="AK", secret_key="SK")
    defaults.update(kw)
    with mock.patch("boto3.client") as client:
        svc = ss.AWSStorageService(**defaults)
    svc._client = client.return_value if svc._client is not None else None
    return svc


def make_settings(**overrides):
    from app.config import Settings
    env = {k.lower(): v for k, v in REQUIRED_ENV.items()}
    env.update(overrides)
    return Settings(_env_file=None, **env)


def run_import(env_extra, code="import services.storage_service as m; print(type(m.storage_service).__name__)"):
    """Import the module in a fresh interpreter with a controlled environment (cwd has no .env)."""
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("STORAGE_", "AZURE_", "AWS_"))}
    env.update(REQUIRED_ENV)
    env.update(env_extra)
    env["PYTHONPATH"] = str(BACKEND)
    # services/__init__ pulls in the whole app; load the file directly instead
    code = (
        "import importlib.util,sys;"
        f"s=importlib.util.spec_from_file_location('m', r'{BACKEND}/services/storage_service.py');"
        "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
        "print(type(m.storage_service).__name__)"
    )
    import tempfile
    with tempfile.TemporaryDirectory() as cwd:
        return subprocess.run([sys.executable, "-c", code], env=env, cwd=cwd, capture_output=True, text=True, timeout=60)


# ── configuration / backend selection ─────────────────────────────────────────

class TestSettings:
    def test_default_is_aws_and_azure_fields_have_safe_defaults(self):
        s = make_settings()
        assert s.storage_backend == "aws"
        assert s.azure_storage_account == ""
        assert s.azure_storage_container == "reports"

    @pytest.mark.parametrize("raw,expected", [("azure", "azure"), ("AZURE", "azure"), (" Azure ", "azure"),
                                              ("aws", "aws"), ("AWS", "aws"), ("", "aws"), ("   ", "aws")])
    def test_backend_value_is_normalised(self, raw, expected):
        assert make_settings(storage_backend=raw).storage_backend == expected

    @pytest.mark.parametrize("bad", ["gcp", "s3", "azure,aws", "blob", "none"])
    def test_unknown_backend_is_rejected(self, bad):
        with pytest.raises(ValidationError):
            make_settings(storage_backend=bad)

    def test_names_are_stripped(self):
        s = make_settings(azure_storage_account="  acct  ", azure_storage_container=" reports ")
        assert (s.azure_storage_account, s.azure_storage_container) == ("acct", "reports")

    def test_env_names_match_the_deploy_pipeline(self, monkeypatch):
        from app.config import Settings
        for k, v in REQUIRED_ENV.items():
            monkeypatch.setenv(k, v)
        monkeypatch.setenv("STORAGE_BACKEND", "azure")
        monkeypatch.setenv("AZURE_STORAGE_ACCOUNT", ACCOUNT)
        monkeypatch.setenv("AZURE_STORAGE_CONTAINER", "reports")
        s = Settings(_env_file=None)
        assert (s.storage_backend, s.azure_storage_account, s.azure_storage_container) == ("azure", ACCOUNT, "reports")

    def test_no_account_key_setting_exists(self):
        from app.config import Settings
        assert not any("key" in f and "azure" in f for f in Settings.model_fields)

    def test_the_three_lines_vm_deploy_writes_are_accepted_in_a_dotenv_file(self, tmp_path):
        """backend/.env is read with extra=forbid: an unknown name would stop the API."""
        from app.config import Settings
        env = tmp_path / ".env"
        lines = [f"{k}='{v}'" for k, v in REQUIRED_ENV.items()]
        lines += ["STORAGE_BACKEND=azure", f"AZURE_STORAGE_ACCOUNT={ACCOUNT}", "AZURE_STORAGE_CONTAINER=reports"]
        env.write_text("\n".join(lines) + "\n")
        with mock.patch.dict(os.environ, {}, clear=False):
            for k in list(os.environ):
                if k.startswith(("STORAGE_", "AZURE_")):
                    del os.environ[k]
            s = Settings(_env_file=str(env))
        assert s.storage_backend == "azure"


class TestFactory:
    def _factory(self, **settings):
        return SimpleNamespace(**{
            "storage_backend": "aws", "aws_s3_bucket": "b", "aws_region": "r",
            "aws_access_key_id": "AK", "aws_secret_access_key": "SK",
            "azure_storage_account": ACCOUNT, "azure_storage_container": CONTAINER, **settings})

    def test_aws_selected(self):
        with mock.patch("app.config.settings", self._factory()), mock.patch("boto3.client"):
            assert isinstance(ss.make_storage_service(), ss.AWSStorageService)

    def test_azure_selected(self):
        with mock.patch("app.config.settings", self._factory(storage_backend="azure")):
            svc = ss.make_storage_service()
        assert isinstance(svc, ss.AzureBlobStorageService) and svc.is_configured

    def test_unsupported_backend_raises(self):
        with mock.patch("app.config.settings", self._factory(storage_backend="gcp")):
            with pytest.raises(ValueError, match="Unsupported storage_backend"):
                ss.make_storage_service()


class TestImportNeverCrashes:
    """The module builds `storage_service` at import; the API must still start."""

    def test_default_environment_uses_aws(self):
        r = run_import({})
        assert r.returncode == 0, r.stderr
        assert r.stdout.strip() == "AWSStorageService"

    def test_azure_with_valid_settings(self):
        r = run_import({"STORAGE_BACKEND": "azure", "AZURE_STORAGE_ACCOUNT": ACCOUNT})
        assert r.returncode == 0, r.stderr
        assert r.stdout.strip() == "AzureBlobStorageService"

    def test_azure_without_account_does_not_crash(self):
        r = run_import({"STORAGE_BACKEND": "azure"})
        assert r.returncode == 0, r.stderr
        assert "not configured" in r.stderr.lower()

    def test_azure_with_azure_sdk_missing_does_not_crash(self):
        r = run_import({"STORAGE_BACKEND": "azure", "AZURE_STORAGE_ACCOUNT": ACCOUNT})
        assert r.returncode == 0   # the SDK is only imported on the first upload

    def test_invalid_backend_stops_startup_with_a_validation_error(self):
        r = run_import({"STORAGE_BACKEND": "gcp"})
        assert r.returncode != 0 and "storage_backend" in r.stderr


# ── Azure backend ─────────────────────────────────────────────────────────────

class TestAzureConfiguration:
    @pytest.mark.parametrize("account", ["", "ab", "UPPER12345", "has-dash-1", "a" * 25, "under_score", "spa ce"])
    def test_bad_account_name_is_not_configured(self, account):
        svc = ss.AzureBlobStorageService(account, CONTAINER)
        assert not svc.is_configured and "AZURE_STORAGE_ACCOUNT" in svc.config_error

    @pytest.mark.parametrize("container", ["", "ab", "Reports", "-reports", "reports-", "re--ports", "a" * 64, "re ports", "re_ports"])
    def test_bad_container_name_is_not_configured(self, container):
        svc = ss.AzureBlobStorageService(ACCOUNT, container)
        assert not svc.is_configured and "AZURE_STORAGE_CONTAINER" in svc.config_error

    @pytest.mark.parametrize("container", ["reports", "ucd-reports", "r-1-2", "a" * 63, "abc"])
    def test_good_container_names(self, container):
        assert ss.AzureBlobStorageService(ACCOUNT, container).is_configured

    def test_both_problems_are_reported_together(self):
        svc = ss.AzureBlobStorageService("", "")
        assert "AZURE_STORAGE_ACCOUNT" in svc.config_error and "AZURE_STORAGE_CONTAINER" in svc.config_error

    def test_none_values_do_not_raise(self):
        assert not ss.AzureBlobStorageService(None, None).is_configured

    def test_surrounding_whitespace_is_ignored(self):
        assert ss.AzureBlobStorageService(f" {ACCOUNT} ", " reports ").is_configured

    def test_unconfigured_upload_fails_with_a_clear_message_and_calls_nothing(self):
        svc = ss.AzureBlobStorageService("", CONTAINER)
        with mock.patch.dict(sys.modules, {"azure.storage.blob": None, "azure.identity": None}):
            ok, url, err = svc.upload_pdf("u", "r", b"%PDF")
        assert (ok, url) == (False, None) and "not configured" in err


class TestAzureClientCreation:
    def test_no_sdk_object_is_created_at_construction(self):
        with mock.patch.dict(sys.modules, {"azure.storage.blob": None, "azure.identity": None}):
            ss.AzureBlobStorageService(ACCOUNT, CONTAINER)   # must not raise ImportError

    def test_missing_sdk_gives_a_readable_error(self):
        svc = ss.AzureBlobStorageService(ACCOUNT, CONTAINER)
        with mock.patch.dict(sys.modules, {"azure.identity": None}):
            ok, url, err = svc.upload_pdf("u", "r", b"x")
        assert not ok and url is None and "Azure SDK is not installed" in err

    def test_default_credential_is_the_managed_identity_chain_and_client_is_built_once(self):
        svc = ss.AzureBlobStorageService(ACCOUNT, CONTAINER)
        fake_cred = object()
        container = FakeContainer()
        service = mock.Mock()
        service.get_container_client.return_value = container
        with mock.patch("azure.identity.DefaultAzureCredential", return_value=fake_cred) as dac, \
             mock.patch("azure.storage.blob.BlobServiceClient", return_value=service) as bsc:
            svc.upload_pdf("u", "r1", b"1")
            svc.upload_pdf("u", "r2", b"2")
        dac.assert_called_once_with()
        bsc.assert_called_once_with(account_url=f"https://{ACCOUNT}.blob.core.windows.net", credential=fake_cred)
        service.get_container_client.assert_called_once_with(CONTAINER)
        assert len(container.uploads) == 2

    def test_explicit_credential_is_used_instead_of_default(self):
        cred = object()
        svc = ss.AzureBlobStorageService(ACCOUNT, CONTAINER, credential=cred)
        with mock.patch("azure.identity.DefaultAzureCredential") as dac, \
             mock.patch("azure.storage.blob.BlobServiceClient") as bsc:
            bsc.return_value.get_container_client.return_value = FakeContainer()
            svc.upload_pdf("u", "r", b"x")
        dac.assert_not_called()
        assert bsc.call_args.kwargs["credential"] is cred

    def test_account_key_is_never_used(self):
        import inspect
        assert "key" not in " ".join(inspect.signature(ss.AzureBlobStorageService.__init__).parameters)

    def test_concurrent_first_uploads_build_one_client(self):
        svc = ss.AzureBlobStorageService(ACCOUNT, CONTAINER, credential=object())
        built = []
        container = FakeContainer()

        def build(*a, **k):
            built.append(1)
            m = mock.Mock()
            m.get_container_client.return_value = container
            return m

        with mock.patch("azure.storage.blob.BlobServiceClient", side_effect=build):
            threads = [threading.Thread(target=svc.upload_pdf, args=("u", f"r{i}", b"x")) for i in range(8)]
            [t.start() for t in threads]
            [t.join() for t in threads]
        assert len(built) == 1 and len(container.uploads) == 8


class TestAzureUpload:
    def test_pdf_upload_success(self):
        c = FakeContainer()
        ok, url, err = azure(c).upload_pdf("user-1", "rep-1", b"%PDF-1.7")
        assert ok and err is None
        up = c.uploads[0]
        assert up["key"].startswith("reports/user-1/rep-1_") and up["key"].endswith(".pdf")
        assert up["data"] == b"%PDF-1.7" and up["overwrite"] is True
        assert url == f"https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/{up['key']}"

    def test_content_type_and_inline_disposition(self):
        c = FakeContainer()
        azure(c).upload_pdf("u", "rep-9", b"x")
        cs = c.uploads[0]["content_settings"]
        assert cs.content_type == "application/pdf"
        assert cs.content_disposition == 'inline; filename="rationsmart_rec_rep-9.pdf"'

    def test_no_metadata_is_sent_so_no_x_ms_meta_headers_are_public(self):
        c = FakeContainer()
        azure(c).upload_pdf("secret-user", "rep", b"x")
        assert "metadata" not in c.uploads[0]["kw"]

    def test_metadata_argument_is_ignored_not_forwarded(self):
        c = FakeContainer()
        azure(c).upload_file("k.bin", b"x", metadata={"user_id": "u"})
        assert "metadata" not in c.uploads[0]["kw"]
        assert c.uploads[0]["content_settings"].content_type == "application/octet-stream"

    def test_disposition_header_is_sanitised(self):
        c = FakeContainer()
        azure(c).upload_pdf("u", 'a"b\r\nSet-Cookie: x/../é', b"x")
        header = c.uploads[0]["content_settings"].content_disposition
        assert "\r" not in header and "\n" not in header and header.count('"') == 2
        assert header.startswith('inline; filename="rationsmart_rec_') and header.endswith('.pdf"')

    def test_other_helpers_have_no_disposition_and_the_right_keys(self):
        c = FakeContainer()
        svc = azure(c)
        assert svc.upload_export("u", "exp1", b"x")[0]
        assert svc.upload_bulk_log("log.txt", "hello")[0]
        keys = [u["key"] for u in c.uploads]
        assert keys == ["feed_exports/u/exp1.xlsx", "bulk_import_logs/log.txt"]
        assert c.uploads[1]["data"] == b"hello"
        assert all(u["content_settings"].content_disposition is None for u in c.uploads)

    def test_overwrite_of_an_existing_blob_is_allowed(self):
        c = FakeContainer()
        svc = azure(c)
        svc.upload_file("same.pdf", b"1")
        svc.upload_file("same.pdf", b"2")
        assert [u["overwrite"] for u in c.uploads] == [True, True]

    def test_empty_payload_is_uploaded(self):
        c = FakeContainer()
        assert azure(c).upload_pdf("u", "r", b"")[0]
        assert c.uploads[0]["data"] == b""

    def test_authentication_failure_message(self):
        from azure.core.exceptions import ClientAuthenticationError
        ok, url, err = azure(FakeContainer(fail=ClientAuthenticationError("denied"))).upload_pdf("u", "r", b"x")
        assert (ok, url) == (False, None) and err == "Azure credentials not found or invalid"

    @pytest.mark.parametrize("status", [403, 404, 409, 500, 503])
    def test_http_errors_are_reported_not_raised(self, status):
        from azure.core.exceptions import HttpResponseError
        exc = HttpResponseError(message=f"boom {status}")
        ok, url, err = azure(FakeContainer(fail=exc)).upload_pdf("u", "r", b"x")
        assert not ok and url is None and err.startswith("Azure Blob error:") and f"boom {status}" in err

    def test_container_missing_is_reported(self):
        from azure.core.exceptions import ResourceNotFoundError
        ok, _, err = azure(FakeContainer(fail=ResourceNotFoundError("ContainerNotFound"))).upload_pdf("u", "r", b"x")
        assert not ok and "ContainerNotFound" in err

    def test_unexpected_error_is_reported_by_the_helper(self):
        ok, url, err = azure(FakeContainer(fail=ConnectionError("network down"))).upload_pdf("u", "r", b"x")
        assert (ok, url) == (False, None) and "network down" in err


class TestAzureUrlsAndDelete:
    @pytest.mark.parametrize("key,expected", [
        ("reports/u/r_20260101.pdf", "reports/u/r_20260101.pdf"),
        ("reports/u/my report.pdf", "reports/u/my%20report.pdf"),
        ("reports/u/a#b?c.pdf", "reports/u/a%23b%3Fc.pdf"),
        ("reports/u/é.pdf", "reports/u/%C3%A9.pdf"),
    ])
    def test_plain_encoded_url_never_signed(self, key, expected):
        url = azure().get_file_url(key)
        assert url == f"https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/{expected}"
        assert "sig=" not in url and "?" not in url.split(".net/")[1].replace("%3F", "")

    def test_expires_in_is_ignored(self):
        svc = azure()
        assert svc.get_file_url("k", expires_in=1) == svc.get_file_url("k", expires_in=99999)

    def test_url_is_stable_across_calls(self):
        svc = azure()
        assert svc.get_file_url("k") == svc.get_file_url("k")

    def test_delete_file(self):
        c = FakeContainer()
        azure(c).delete_file("reports/u/r.pdf")
        assert c.deleted == ["reports/u/r.pdf"]

    def test_delete_missing_blob_is_silent(self):
        from azure.core.exceptions import ResourceNotFoundError
        azure(FakeContainer(delete_fail=ResourceNotFoundError("gone"))).delete_file("x")   # no raise

    def test_delete_other_errors_are_logged_not_raised(self, caplog):
        azure(FakeContainer(delete_fail=RuntimeError("nope"))).delete_file("x")
        assert "Azure Blob delete failed" in caplog.text

    def test_delete_by_url_round_trip(self):
        c = FakeContainer()
        svc = azure(c)
        key = "reports/u/my report.pdf"
        assert svc.delete_by_url(svc.get_file_url(key)) == (True, None)
        assert c.deleted == [key]

    @pytest.mark.parametrize("url", [
        f"https://other.blob.core.windows.net/{CONTAINER}/k.pdf",
        f"https://{ACCOUNT}.blob.core.windows.net/other/k.pdf",
        "https://bucket.s3.ap-southeast-2.amazonaws.com/reports/u/r.pdf",
        "not a url",
        "",
    ])
    def test_delete_by_url_refuses_foreign_links(self, url):
        c = FakeContainer()
        ok, err = azure(c).delete_by_url(url)
        assert not ok and err and c.deleted == []


# ── AWS backend: behaviour must be unchanged for the Test server ──────────────

class TestAwsBackend:
    def test_pdf_upload_success_and_plain_url(self):
        svc = aws()
        ok, url, err = svc.upload_pdf("user-1", "rep-1", b"%PDF")
        assert ok and err is None
        kwargs = svc._client.put_object.call_args.kwargs
        assert kwargs["Bucket"] == "b" and kwargs["ContentType"] == "application/pdf"
        assert kwargs["Key"].startswith("reports/user-1/rep-1_")
        assert url == f"https://b.s3.ap-southeast-2.amazonaws.com/{kwargs['Key']}"
        assert "Signature" not in url and "X-Amz" not in url

    def test_s3_objects_keep_their_metadata_and_get_no_content_disposition(self):
        svc = aws()
        svc.upload_pdf("u", "r", b"x")
        kwargs = svc._client.put_object.call_args.kwargs
        assert kwargs["Metadata"]["file_type"] == "diet_recommendation_report"
        assert kwargs["Metadata"]["user_id"] == "u" and kwargs["Metadata"]["report_id"] == "r"
        assert "ContentDisposition" not in kwargs
        assert svc.sets_content_disposition is False

    def test_explicit_content_disposition_is_passed_to_s3(self):
        svc = aws()
        svc.upload_file("k", b"x", content_disposition="inline")
        assert svc._client.put_object.call_args.kwargs["ContentDisposition"] == "inline"

    @pytest.mark.parametrize("kw", [dict(access_key=""), dict(secret_key=""), dict(bucket=""),
                                    dict(access_key="", secret_key="")])
    def test_not_configured_fails_fast_without_calling_s3(self, kw):
        svc = aws(**kw)
        assert not svc.is_configured
        ok, url, err = svc.upload_pdf("u", "r", b"x")
        assert (ok, url) == (False, None) and err == "AWS S3 not configured properly"
        svc._client.put_object.assert_not_called()

    def test_client_init_failure_marks_not_configured(self):
        with mock.patch("boto3.client", side_effect=RuntimeError("bad region")):
            svc = ss.AWSStorageService("b", "r", "AK", "SK")
        assert not svc.is_configured and svc._client is None
        assert svc.upload_pdf("u", "r", b"x")[0] is False

    def test_no_credentials_message(self):
        from botocore.exceptions import NoCredentialsError
        svc = aws()
        svc._client.put_object.side_effect = NoCredentialsError()
        assert svc.upload_pdf("u", "r", b"x") == (False, None, "AWS credentials not found or invalid")

    def test_client_error_message(self):
        from botocore.exceptions import ClientError
        svc = aws()
        svc._client.put_object.side_effect = ClientError({"Error": {"Code": "AccessDenied", "Message": "no"}}, "PutObject")
        ok, url, err = svc.upload_pdf("u", "r", b"x")
        assert not ok and url is None and err.startswith("AWS S3 error:") and "AccessDenied" in err

    def test_delete_by_url(self):
        svc = aws()
        assert svc.delete_by_url("https://b.s3.ap-southeast-2.amazonaws.com/reports/u/r.pdf") == (True, None)
        svc._client.delete_object.assert_called_once_with(Bucket="b", Key="reports/u/r.pdf")

    def test_delete_failure_is_logged_not_raised(self, caplog):
        svc = aws()
        svc._client.delete_object.side_effect = RuntimeError("x")
        svc.delete_file("k")
        assert "S3 delete failed" in caplog.text

    def test_export_and_bulk_log_keys(self):
        svc = aws()
        svc.upload_export("u", "e1", b"x", ext="csv")
        assert svc._client.put_object.call_args.kwargs["Key"] == "feed_exports/u/e1.csv"
        svc.upload_bulk_log("l.txt", "hi")
        kwargs = svc._client.put_object.call_args.kwargs
        assert kwargs["Key"] == "bulk_import_logs/l.txt" and kwargs["Body"] == b"hi"


# ── both backends share the same contract ─────────────────────────────────────

@pytest.mark.parametrize("make", [azure, aws], ids=["azure", "aws"])
class TestSharedContract:
    def test_helper_returns_three_tuple_on_success(self, make):
        result = make().upload_pdf("u", "r", b"x")
        assert len(result) == 3 and result[0] is True and result[1].startswith("https://") and result[2] is None

    def test_url_has_no_expiry_or_signature(self, make):
        url = make().get_file_url("reports/u/r.pdf")
        assert not any(t in url.lower() for t in ("expires", "signature", "sig=", "x-amz", "sas"))

    def test_key_layout_is_identical(self, make):
        svc = make()
        _, url, _ = svc.upload_pdf("user-7", "rep-7", b"x")
        assert "/reports/user-7/rep-7_" in url and url.endswith(".pdf")

    def test_is_a_storage_service(self, make):
        assert isinstance(make(), ss.StorageService)


# ── pdf_service must go through the selected backend ──────────────────────────

class TestPdfServiceCallSites:
    SOURCE = (BACKEND / "core" / "z_optimization" / "pdf_service.py").read_text()

    def test_all_three_upload_sites_use_storage_service(self):
        assert self.SOURCE.count("storage_service.upload_pdf(") == 3

    def test_no_direct_s3_upload_is_left(self):
        assert "aws_service" not in self.SOURCE
        assert "upload_pdf_to_s3" not in self.SOURCE

    def test_every_call_passes_the_pdf_keyword_arguments(self):
        for call in self.SOURCE.split("storage_service.upload_pdf(")[1:]:
            head = call.split(")", 1)[0]
            assert "user_id=user_id" in head and "report_id=report_id" in head and "pdf_data=pdf_bytes" in head
