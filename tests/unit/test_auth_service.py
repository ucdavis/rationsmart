"""
Unit tests for services/auth_service.py.

Covers:
  - PIN primitives: hash_pin (bcrypt), verify_pin (bcrypt + legacy SHA-256),
    is_legacy_hash — all sync, no DB needed.
  - JWT primitives: issue_token / decode_token — sync, no DB needed.
  - Auth flows: register, login, verify_email_token, resend_verification,
    set_new_pin — all async; DB interactions are mocked.
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

import services.auth_service as svc


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_user(
    *,
    is_active=True,
    is_email_verified=True,
    pin_hash=None,
    email_verify_token=None,
    email_verify_token_exp=None,
    requires_pin_reset=False,
):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email_id = "test@example.com"
    user.name = "Test User"
    user.country_id = str(uuid.uuid4())
    user.is_active = is_active
    user.is_email_verified = is_email_verified
    user.pin_hash = pin_hash or svc.hash_pin("123456")
    user.email_verify_token = email_verify_token
    user.email_verify_token_exp = email_verify_token_exp
    user.requires_pin_reset = requires_pin_reset
    user.is_admin = False
    return user


def _make_repo(**lookup_returns):
    repo = AsyncMock()
    repo.get_by_email.return_value = lookup_returns.get("get_by_email")
    repo.get_by_id.return_value = lookup_returns.get("get_by_id")
    repo.get_country_by_id.return_value = lookup_returns.get(
        "get_country_by_id", MagicMock()
    )
    repo.get_by_email_verify_token.return_value = lookup_returns.get(
        "get_by_email_verify_token"
    )
    return repo


# ── PIN primitives (sync) ─────────────────────────────────────────────────────

class TestHashPin:
    def test_produces_bcrypt_prefix(self):
        h = svc.hash_pin("123456")
        assert h.startswith("$2b$"), f"Expected bcrypt hash, got: {h[:10]}"

    def test_different_pins_produce_different_hashes(self):
        assert svc.hash_pin("123456") != svc.hash_pin("654321")

    def test_same_pin_produces_different_hashes_each_call(self):
        # bcrypt salts each hash
        assert svc.hash_pin("123456") != svc.hash_pin("123456")


class TestVerifyPin:
    def test_bcrypt_correct_pin(self):
        h = svc.hash_pin("123456")
        assert svc.verify_pin("123456", h) is True

    def test_bcrypt_wrong_pin(self):
        h = svc.hash_pin("123456")
        assert svc.verify_pin("000000", h) is False

    def test_legacy_sha256_correct_pin(self):
        salt = "a" * 32
        digest = hashlib.sha256(f"123456{salt}".encode()).hexdigest()
        legacy_hash = salt + digest
        assert svc.verify_pin("123456", legacy_hash) is True

    def test_legacy_sha256_wrong_pin(self):
        salt = "a" * 32
        digest = hashlib.sha256(f"123456{salt}".encode()).hexdigest()
        legacy_hash = salt + digest
        assert svc.verify_pin("999999", legacy_hash) is False

    def test_too_short_hash_returns_false(self):
        assert svc.verify_pin("123456", "short") is False


class TestIsLegacyHash:
    def test_bcrypt_is_not_legacy(self):
        assert svc.is_legacy_hash(svc.hash_pin("123456")) is False

    def test_sha256_format_is_legacy(self):
        salt = "a" * 32
        digest = hashlib.sha256(f"123456{salt}".encode()).hexdigest()
        assert svc.is_legacy_hash(salt + digest) is True


# ── JWT primitives (sync) ─────────────────────────────────────────────────────

class TestJWT:
    def _fake_user(self):
        user = MagicMock()
        user.id = uuid.uuid4()
        user.email_id = "jwt@example.com"
        user.is_admin = False
        return user

    def test_issue_and_decode_round_trip(self):
        user = self._fake_user()
        token_info = svc.issue_token(user)
        assert "access_token" in token_info
        payload = svc.decode_token(token_info["access_token"])
        assert payload["sub"] == str(user.id)

    def test_decode_expired_raises(self):
        import jwt as _jwt
        from app.config import settings
        payload = {"sub": "user-id", "exp": 0}  # already expired
        token = _jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
        with pytest.raises(_jwt.ExpiredSignatureError):
            svc.decode_token(token)


# ── register (async) ──────────────────────────────────────────────────────────

class TestRegister:
    @pytest.mark.asyncio
    async def test_creates_unverified_inactive_user(self):
        repo = _make_repo(get_by_email=None)
        created = _make_user(is_active=False, is_email_verified=False)
        repo.create.return_value = created

        with patch("services.auth_service.UserRepository", return_value=repo):
            user, error, token = await svc.register(
                MagicMock(), "Alice", "alice@x.com", "111111", "country-1"
            )

        assert user is not None
        assert error is None
        assert token is not None and len(token) > 10
        repo.create.assert_called_once()
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["is_active"] is False
        assert call_kwargs["is_email_verified"] is False
        repo.set_email_verification_token.assert_called_once()

    @pytest.mark.asyncio
    async def test_duplicate_email_returns_error(self):
        existing = _make_user()
        repo = _make_repo(get_by_email=existing)

        with patch("services.auth_service.UserRepository", return_value=repo):
            user, error, token = await svc.register(
                MagicMock(), "Alice", "alice@x.com", "111111", "country-1"
            )

        assert user is None
        assert "already registered" in error
        assert token is None

    @pytest.mark.asyncio
    async def test_invalid_country_returns_error(self):
        repo = _make_repo(get_by_email=None, get_country_by_id=None)

        with patch("services.auth_service.UserRepository", return_value=repo):
            user, error, token = await svc.register(
                MagicMock(), "Alice", "alice@x.com", "111111", "bad-country"
            )

        assert user is None
        assert "country" in error.lower()
        assert token is None


# ── login (async) ─────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.mark.asyncio
    async def test_unverified_email_blocked(self):
        user = _make_user(is_active=True, is_email_verified=False)
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error, _ = await svc.login(MagicMock(), "test@example.com", "123456")

        assert result_user is None
        assert error == "EMAIL_NOT_VERIFIED"

    @pytest.mark.asyncio
    async def test_inactive_account_blocked(self):
        user = _make_user(is_active=False, is_email_verified=True)
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error, _ = await svc.login(MagicMock(), "test@example.com", "123456")

        assert result_user is None
        assert "disabled" in error.lower()

    @pytest.mark.asyncio
    async def test_wrong_pin_blocked(self):
        user = _make_user(is_active=True, is_email_verified=True, pin_hash=svc.hash_pin("123456"))
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error, _ = await svc.login(MagicMock(), "test@example.com", "000000")

        assert result_user is None
        assert "incorrect" in error.lower()

    @pytest.mark.asyncio
    async def test_successful_login(self):
        pin = "987654"
        user = _make_user(is_active=True, is_email_verified=True, pin_hash=svc.hash_pin(pin))
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error, needs_reset = await svc.login(MagicMock(), "test@example.com", pin)

        assert result_user is user
        assert error is None
        assert needs_reset is False


# ── verify_email_token (async) ────────────────────────────────────────────────

class TestVerifyEmailToken:
    @pytest.mark.asyncio
    async def test_valid_token_activates_user(self):
        token = "abc123"
        future = datetime.now(timezone.utc) + timedelta(hours=12)
        user = _make_user(
            is_active=False, is_email_verified=False,
            email_verify_token=token, email_verify_token_exp=future,
        )
        repo = _make_repo(get_by_email_verify_token=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error = await svc.verify_email_token(MagicMock(), token)

        assert result_user is user
        assert error is None
        repo.mark_email_verified.assert_called_once_with(user)

    @pytest.mark.asyncio
    async def test_unknown_token_returns_error(self):
        repo = _make_repo(get_by_email_verify_token=None)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error = await svc.verify_email_token(MagicMock(), "no-such-token")

        assert result_user is None
        assert "invalid" in error.lower() or "already" in error.lower()

    @pytest.mark.asyncio
    async def test_expired_token_returns_error(self):
        token = "expired-token"
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        user = _make_user(
            is_active=False, is_email_verified=False,
            email_verify_token=token, email_verify_token_exp=past,
        )
        repo = _make_repo(get_by_email_verify_token=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error = await svc.verify_email_token(MagicMock(), token)

        assert result_user is None
        assert "expired" in error.lower()
        repo.mark_email_verified.assert_not_called()

    @pytest.mark.asyncio
    async def test_null_expiry_treated_as_expired(self):
        token = "null-exp-token"
        user = _make_user(
            is_active=False, is_email_verified=False,
            email_verify_token=token, email_verify_token_exp=None,
        )
        repo = _make_repo(get_by_email_verify_token=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            result_user, error = await svc.verify_email_token(MagicMock(), token)

        assert result_user is None
        repo.mark_email_verified.assert_not_called()


# ── resend_verification (async) ────────────────────────────────────────────────

class TestResendVerification:
    @pytest.mark.asyncio
    async def test_unverified_user_gets_new_token(self):
        user = _make_user(is_email_verified=False, is_active=False)
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            token, error = await svc.resend_verification(MagicMock(), "test@example.com")

        assert token is not None and len(token) > 10
        assert error is None
        repo.set_email_verification_token.assert_called_once()

    @pytest.mark.asyncio
    async def test_already_verified_returns_error(self):
        user = _make_user(is_email_verified=True, is_active=True)
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            token, error = await svc.resend_verification(MagicMock(), "test@example.com")

        assert token is None
        assert "already verified" in error.lower()

    @pytest.mark.asyncio
    async def test_unknown_email_returns_vague_message(self):
        repo = _make_repo(get_by_email=None)

        with patch("services.auth_service.UserRepository", return_value=repo):
            token, error = await svc.resend_verification(MagicMock(), "ghost@example.com")

        assert token is None
        assert error is not None


# ── set_new_pin (async) ───────────────────────────────────────────────────────

class TestSetNewPin:
    @pytest.mark.asyncio
    async def test_set_new_pin_succeeds_on_legacy_hash(self):
        old_pin = "1234"
        legacy_hash = (
            "aabbccddaabbccddaabbccddaabbccdd"
            + "a" * 64
        )
        user = _make_user(pin_hash=legacy_hash, is_active=True, is_email_verified=True)
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            with patch.object(svc, "verify_pin", return_value=True):
                success, message = await svc.set_new_pin(
                    MagicMock(), "test@example.com", old_pin, "654321"
                )

        assert success is True
        repo.update_pin_hash.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_new_pin_rejects_already_upgraded(self):
        user = _make_user(pin_hash=svc.hash_pin("654321"))
        repo = _make_repo(get_by_email=user)

        with patch("services.auth_service.UserRepository", return_value=repo):
            success, message = await svc.set_new_pin(
                MagicMock(), "test@example.com", "654321", "111111"
            )

        assert success is False
        assert "already upgraded" in message.lower()
