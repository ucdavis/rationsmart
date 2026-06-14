import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.db.models import UserInformationModel
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


def _country_schema(country) -> Country:
    return Country(
        id=str(country.id),
        name=country.name or "",
        country_code=country.country_code or "",
        currency=country.currency or "",
        is_active=country.is_active,
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
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/register", response_model=AuthenticationResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegistration, db: AsyncSession = Depends(get_db)):
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


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db)):
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


@router.get("/countries", response_model=List[Country])
async def get_countries(db: AsyncSession = Depends(get_db)):
    countries = await UserRepository(db).get_all_countries()
    return [_country_schema(c) for c in countries]


@router.get("/user/{email_id}", response_model=UserResponse)
async def get_user(email_id: str, db: AsyncSession = Depends(get_db)):
    user = await UserRepository(db).get_by_email(email_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await _user_response(user, db)


@router.put("/user/{email_id}", response_model=UserResponse)
async def update_user(email_id: str, body: UserUpdateRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    user = await repo.get_by_email(email_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.country_id is not None and not await repo.get_country_by_id(body.country_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid country selected")

    await repo.update_profile(user, name=body.name, country_id=body.country_id)
    await db.commit()
    return await _user_response(user, db)


@router.post("/forgot-pin", response_model=ForgotPinResponse)
async def forgot_pin(body: ForgotPinRequest, db: AsyncSession = Depends(get_db)):
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


@router.post("/change-pin", response_model=ChangePinResponse)
async def change_pin(body: ChangePinRequest, db: AsyncSession = Depends(get_db)):
    if body.current_pin == body.new_pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New PIN must differ from current PIN")
    success, message = await auth_service.change_pin(db, body.email_id, body.current_pin, body.new_pin)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return ChangePinResponse(success=True, message=message)


@router.post("/set-new-pin")
async def set_new_pin(body: SetNewPinRequest, db: AsyncSession = Depends(get_db)):
    """PIN migration gate: upgrade a legacy 4-digit PIN to a 6-digit bcrypt PIN."""
    success, message = await auth_service.set_new_pin(db, body.email_id, body.old_pin, body.new_pin)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Consume the one-time token emailed on registration and activate the account."""
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


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    """Issue a fresh verification token for an unverified account."""
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


@router.get("/email-config")
async def email_config():
    """Diagnostic: returns email service configuration status."""
    return email_service.get_email_config()


from pydantic import BaseModel as _BM


class _PinBody(_BM):
    pin: str


@router.post("/user-delete-account", response_model=UserDeleteAccountResponse)
async def delete_account(
    body: _PinBody,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate the authenticated user's own account (soft delete). PIN confirms intent."""
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
