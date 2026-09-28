import logging
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CountryLanguage, UserInformationModel
from app.dependencies import get_current_user, get_db
from app.schemas.auth import (
    AuthenticationResponse,
    ChangePinRequest,
    ChangePinResponse,
    Country,
    ForgotPinRequest,
    ForgotPinResponse,
    LoginResponse,
    ResendVerificationRequest,
    SetNewPinRequest,
    TokenResponse,
    UserDeleteAccountResponse,
    UserRegistration,
    UserLogin,
    UserResponse,
    UserUpdateRequest,
    VerifyEmailRequest,
)
from app.limiter import limiter
from repositories.user_repository import UserRepository
from services import auth_service
from services.email_service import email_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Authentication"])


def _country_schema(country, supported_languages: list = None) -> Country:
    return Country(
        id=str(country.id),
        name=country.name or "",
        country_code=country.country_code or "",
        currency=country.currency or "",
        is_active=country.is_active,
        supported_languages=supported_languages or [],
        created_at=country.created_at,
        updated_at=country.updated_at,
    )


async def _user_response(user: UserInformationModel, db: AsyncSession) -> UserResponse:
    country = None
    if user.country_id:
        c = await UserRepository(db).get_country_by_id(str(user.country_id))
        if c:
            country = _country_schema(c)
    return UserResponse(
        id=str(user.id),
        name=user.name or "",
        email_id=user.email_id or "",
        country_id=str(user.country_id) if user.country_id else None,
        country=country,
        is_admin=user.is_admin,
        preferred_language=getattr(user, "preferred_language", None) or "en",
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/register", response_model=AuthenticationResponse, status_code=status.HTTP_201_CREATED,
             summary="Register a new user account")
async def register(body: UserRegistration, db: AsyncSession = Depends(get_db)):
    """
    Create a new RationSmart user account and send an email verification link.

    **Mandatory fields:** `name`, `email_id`, `pin` (6-digit), `country_id` (UUID — get valid IDs from `GET /v1/auth/countries`).

    The account remains inactive until the user clicks the verification link sent to their email.
    Login returns `403` until email is confirmed.
    """
    user, error, verify_token = await auth_service.register(
        db, name=body.name, email=body.email_id, pin=body.pin, country_id=body.country_id
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    sent, send_err = await email_service.send_verification_email(
        to_email=user.email_id, user_name=user.name, token=verify_token
    )
    if not sent:
        logger.error("Verification email failed for %s: %s", user.email_id, send_err)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration succeeded but verification email could not be sent. Please try again.",
        )

    await db.commit()
    return AuthenticationResponse(
        success=True,
        message="Registration successful. Please check your email to verify your account.",
        user=await _user_response(user, db),
    )


@router.post("/login", response_model=LoginResponse, summary="Authenticate and receive a JWT token")
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with email and PIN; returns a bearer JWT for use in `Authorization: Bearer <token>` headers.

    **Mandatory fields:** `email_id`, `pin`.

    **Rate limit:** 10 requests / minute per IP.

    - `401` — wrong credentials.
    - `403` — email address not yet verified; call `POST /v1/auth/resend-verification` to get a fresh link.
    - If `requires_pin_reset: true` is returned, call `POST /v1/auth/set-new-pin` before continuing (legacy 4-digit PIN upgrade).
    """
    user, error, needs_reset = await auth_service.login(db, body.email_id, body.pin)
    if not user:
        if error == "EMAIL_NOT_VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your email address before logging in. Check your inbox for a verification link.",
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error)

    if needs_reset:
        return LoginResponse(
            success=True,
            message="Please set a new 6-digit PIN before continuing.",
            requires_pin_reset=True,
        )

    # Silently upgrade legacy SHA-256 hash to bcrypt
    if auth_service.is_legacy_hash(user.pin_hash):
        user.pin_hash = auth_service.hash_pin(body.pin)

    await db.commit()
    token_info = auth_service.issue_token(user)
    return LoginResponse(
        success=True,
        message="Login successful",
        requires_pin_reset=False,
        user=await _user_response(user, db),
        token=TokenResponse(**token_info),
    )


@router.get("/countries", response_model=List[Country], summary="List all supported countries")
async def get_countries(db: AsyncSession = Depends(get_db)):
    """
    Return the full list of countries supported by RationSmart.

    Use the returned `id` (UUID) as `country_id` when registering a user or filtering feeds.
    Each country includes `supported_languages` — the language codes available in that country.
    No authentication required.
    """
    countries = await UserRepository(db).get_all_countries()

    # Batch-load country↔language assignments to avoid N+1 queries
    cl_rows = (await db.execute(select(CountryLanguage))).scalars().all()
    lang_map = defaultdict(list)
    for cl in cl_rows:
        lang_map[str(cl.country_id)].append(cl.language_code)

    return [_country_schema(c, lang_map.get(str(c.id), [])) for c in countries]


@router.get("/user/{email_id}", response_model=UserResponse, summary="Get user profile by email")
async def get_user(email_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch the profile of any registered user by their email address.

    **Path parameter:** `email_id` — the user's registered email address (URL-encoded if it contains `+` or special characters).

    Returns `404` if no account with that email exists.
    """
    user = await UserRepository(db).get_by_email(email_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await _user_response(user, db)


@router.put("/user/{email_id}", response_model=UserResponse, summary="Update user profile")
async def update_user(email_id: str, body: UserUpdateRequest, db: AsyncSession = Depends(get_db)):
    """
    Update the name, country, and/or preferred language of a registered user.

    **Path parameter:** `email_id` — the user's email address.

    **Optional body fields:** `name` (string), `country_id` (UUID from `GET /v1/auth/countries`),
    `preferred_language` (BCP 47 code from `GET /v1/auth/countries`).
    Omit a field to leave it unchanged.

    Returns `404` if the user is not found; `400` if `country_id` or `preferred_language` is invalid.
    """
    repo = UserRepository(db)
    user = await repo.get_by_email(email_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.country_id is not None and not await repo.get_country_by_id(body.country_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid country selected")

    if body.preferred_language is not None:
        from app.lang import get_active_languages
        active = await get_active_languages(db)
        if body.preferred_language not in active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Language '{body.preferred_language}' is not available",
            )

    await repo.update_profile(
        user, name=body.name, country_id=body.country_id, preferred_language=body.preferred_language
    )
    await db.commit()
    return await _user_response(user, db)


@router.post("/forgot-pin", response_model=ForgotPinResponse, summary="Request a PIN reset via email")
async def forgot_pin(body: ForgotPinRequest, db: AsyncSession = Depends(get_db)):
    """
    Generate a new temporary PIN and send it to the user's registered email address.

    **Mandatory field:** `email_id`.

    Returns `404` if no account is found for that email.
    After receiving the temporary PIN, the user should call `POST /v1/auth/change-pin` to set a permanent one.
    """
    success, message, new_pin = await auth_service.forgot_pin(db, body.email_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)

    user = await UserRepository(db).get_by_email(body.email_id)
    sent, err = await email_service.send_pin_reset_email(
        to_email=user.email_id, user_name=user.name, new_pin=new_pin
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {err}",
        )
    await db.commit()
    return ForgotPinResponse(success=True, message=f"New PIN sent to {user.email_id}.", new_pin=new_pin)


@router.post("/change-pin", response_model=ChangePinResponse, summary="Change the current PIN")
async def change_pin(body: ChangePinRequest, db: AsyncSession = Depends(get_db)):
    """
    Change the authenticated user's PIN by supplying the current PIN and a new 6-digit PIN.

    **Mandatory fields:** `email_id`, `current_pin`, `new_pin` (6 digits, must differ from `current_pin`).

    Returns `400` if the current PIN is wrong or the new PIN matches the old one.
    """
    if body.current_pin == body.new_pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New PIN must differ from current PIN")
    success, message = await auth_service.change_pin(db, body.email_id, body.current_pin, body.new_pin)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return ChangePinResponse(success=True, message=message)


@router.post("/set-new-pin", summary="Upgrade legacy 4-digit PIN to a 6-digit PIN")
async def set_new_pin(body: SetNewPinRequest, db: AsyncSession = Depends(get_db)):
    """
    One-time PIN migration: upgrade a legacy 4-digit PIN to a new 6-digit bcrypt-hashed PIN.

    **Mandatory fields:** `email_id`, `old_pin` (the existing 4-digit PIN), `new_pin` (6 digits).

    Only needed when `POST /v1/auth/login` returns `requires_pin_reset: true`.
    Returns `400` if the old PIN is incorrect or the new PIN format is invalid.
    """
    success, message = await auth_service.set_new_pin(db, body.email_id, body.old_pin, body.new_pin)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/verify-email-link", response_class=HTMLResponse,
            summary="One-click email verification (used by the Verify Email button in the registration email)")
async def verify_email_link(token: str, db: AsyncSession = Depends(get_db)):
    """
    Activate a user account by clicking the link in the registration email. No app interaction required.

    **Query parameter:** `token` — the verification token embedded in the email link.

    On success: returns an HTML page confirming the account is active. The user can now open the app and log in.
    On failure: returns an HTML page explaining the error (invalid or expired token).
    """
    user, error = await auth_service.verify_email_token(db, token)
    if not user:
        html = f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:500px;margin:60px auto;text-align:center">
<div style="background:#fff3cd;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <h2 style="color:#856404">Verification Failed</h2>
  <p style="color:#555">{error or 'The verification link is invalid or has expired.'}</p>
  <p style="color:#555;font-size:13px">Please open the RationSmart app and request a new verification email.</p>
</div>
</body></html>"""
        return HTMLResponse(content=html, status_code=400)

    await db.commit()
    html = """<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:500px;margin:60px auto;text-align:center">
<div style="background:#d1e7dd;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <h2 style="color:#0f5132">&#10003; Email Verified!</h2>
  <p style="color:#155724">Your RationSmart account is now active.</p>
  <p style="color:#155724">You can close this page and log in to the app.</p>
</div>
</body></html>"""
    return HTMLResponse(content=html, status_code=200)


@router.post("/verify-email", summary="Verify email address and activate account")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """
    Consume the one-time token emailed after registration to activate the account and receive a JWT.

    **Mandatory field:** `token` — copied from the verification link sent to the user's email.

    Returns `400` if the token is invalid or already used.
    On success, returns the user profile and a valid JWT (same shape as `POST /v1/auth/login`).
    """
    user, error = await auth_service.verify_email_token(db, body.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    await db.commit()
    token_info = auth_service.issue_token(user)
    return {
        "success": True,
        "message": "Email verified. Your account is now active.",
        "user": (await _user_response(user, db)).model_dump(),
        "token": token_info,
    }


@router.post("/resend-verification", summary="Resend the email verification link")
async def resend_verification(body: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    """
    Issue a new one-time verification token and resend the activation email.

    **Mandatory field:** `email_id`.

    Use when the original verification email expired or was not received.
    Returns `400` if the account does not exist or is already verified.
    """
    new_token, error = await auth_service.resend_verification(db, body.email_id)
    if not new_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    user = await UserRepository(db).get_by_email(body.email_id)
    sent, send_err = await email_service.send_verification_email(
        to_email=user.email_id, user_name=user.name, token=new_token
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not send verification email: {send_err}",
        )
    await db.commit()
    return {"success": True, "message": "Verification email resent. Please check your inbox."}


@router.get("/email-config", summary="Check email service configuration (diagnostic)")
async def email_config():
    """
    Diagnostic endpoint that returns the current email service configuration status.

    Useful for verifying SMTP settings without sending a test email. No authentication required.
    Not intended for production client use.
    """
    return email_service.get_email_config()


from pydantic import BaseModel as _BM


class _PinBody(_BM):
    pin: str


@router.post("/user-delete-account", response_model=UserDeleteAccountResponse,
             summary="Deactivate the authenticated user's own account")
async def delete_account(
    body: _PinBody,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete the currently authenticated user's account. The account is deactivated, not permanently erased.

    **Requires:** Bearer JWT in `Authorization` header.

    **Mandatory body field:** `pin` — the user's current 6-digit PIN (confirms intent to delete).

    Returns `401` if the PIN is wrong. Returns the deactivated user's details on success.
    """
    from datetime import datetime

    success, message = await auth_service.deactivate_account(db, str(current_user.id), body.pin)
    if not success:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)
    await db.commit()
    return UserDeleteAccountResponse(
        success=True,
        message=message,
        user_id=str(current_user.id),
        user_name=current_user.name or "",
        user_email=current_user.email_id or "",
        deactivated_at=datetime.utcnow(),
    )
