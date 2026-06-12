import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


# ── Shared ──────────────────────────────────────────────────────────────────

_EMAIL_RE = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'


def _validate_email(v: str) -> str:
    if not re.match(_EMAIL_RE, v):
        raise ValueError('Invalid email format')
    return v.lower().strip()


def _validate_pin_digits(v: str, *, min_len: int = 6, max_len: int = 6) -> str:
    if not v.isdigit():
        raise ValueError('PIN must contain only digits')
    if not (min_len <= len(v) <= max_len):
        raise ValueError(f'PIN must be {min_len}–{max_len} digits')
    return v


# ── Country ──────────────────────────────────────────────────────────────────

class Country(BaseModel):
    id: Optional[str] = Field(None, description="Country UUID")
    name: str = Field(..., max_length=100, description="Country name")
    country_code: str = Field(..., max_length=3, description="ISO 3-letter country code")
    currency: Optional[str] = Field(None, max_length=10, description="Currency code")
    is_active: bool = Field(..., description="Active for registration")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True


# ── Registration / Login ─────────────────────────────────────────────────────

class UserRegistration(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email_id: str = Field(..., max_length=255)
    pin: str = Field(..., min_length=6, max_length=6, description="6-digit PIN")
    country_id: str = Field(..., description="Country UUID")

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)

    @validator('pin')
    def validate_pin(cls, v):
        return _validate_pin_digits(v, min_len=6, max_len=6)

    @validator('name')
    def validate_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        return v


class UserLogin(BaseModel):
    email_id: str = Field(..., max_length=255)
    # Accept 4–6 digits: legacy users have 4-digit PINs; migration gate in service layer forces reset.
    pin: str = Field(..., min_length=4, max_length=6, description="4–6 digit PIN")

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)

    @validator('pin')
    def validate_pin(cls, v):
        return _validate_pin_digits(v, min_len=4, max_len=6)


# ── User responses ───────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str = Field(..., description="User UUID")
    name: str
    email_id: str
    country_id: Optional[str] = None
    country: Optional[Country] = None
    is_admin: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class AuthenticationResponse(BaseModel):
    success: bool
    message: str
    user: Optional[UserResponse] = None


# ── JWT ── (new in v4, used by Task 2.6) ────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Seconds until expiry")


class LoginResponse(BaseModel):
    success: bool
    message: str
    requires_pin_reset: bool = Field(False, description="True when legacy PIN must be upgraded")
    user: Optional[UserResponse] = None
    token: Optional[TokenResponse] = None


# ── Forgot / Change PIN ──────────────────────────────────────────────────────

class ForgotPinRequest(BaseModel):
    email_id: str = Field(..., max_length=255)

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)


class ForgotPinResponse(BaseModel):
    success: bool
    message: str
    new_pin: Optional[str] = Field(None, description="New 6-digit PIN — only returned in dev mode")


class ChangePinRequest(BaseModel):
    email_id: str = Field(..., max_length=255)
    current_pin: str = Field(..., min_length=4, max_length=6, description="Current PIN (4-digit legacy or 6-digit)")
    new_pin: str = Field(..., min_length=6, max_length=6, description="New 6-digit PIN")

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)

    @validator('current_pin')
    def validate_current_pin(cls, v):
        return _validate_pin_digits(v, min_len=4, max_len=6)

    @validator('new_pin')
    def validate_new_pin(cls, v):
        return _validate_pin_digits(v, min_len=6, max_len=6)


class ChangePinResponse(BaseModel):
    success: bool
    message: str


# ── Email verification flow (Task 2.7) ──────────────────────────────────────

class VerifyEmailRequest(BaseModel):
    token: str = Field(..., description="Email verification token")


class ResendVerificationRequest(BaseModel):
    email_id: str = Field(..., max_length=255)

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)


class SetNewPinRequest(BaseModel):
    """Used in the PIN migration gate to upgrade a legacy 4-digit PIN to 6 digits."""
    email_id: str = Field(..., max_length=255)
    old_pin: str = Field(..., min_length=4, max_length=4, description="Existing legacy 4-digit PIN")
    new_pin: str = Field(..., min_length=6, max_length=6, description="New 6-digit PIN")

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)

    @validator('old_pin')
    def validate_old_pin(cls, v):
        return _validate_pin_digits(v, min_len=4, max_len=4)

    @validator('new_pin')
    def validate_new_pin(cls, v):
        return _validate_pin_digits(v, min_len=6, max_len=6)


# ── User information / update ────────────────────────────────────────────────

class UserInformation(BaseModel):
    name: str = Field(..., max_length=100)
    email_id: str = Field(..., max_length=255)
    country_id: str

    @validator('email_id')
    def validate_email(cls, v):
        return _validate_email(v)

    @validator('name')
    def validate_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        return v

    class Config:
        orm_mode = True


class UserUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    country_id: Optional[str] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Name cannot be empty if provided')
        return v

    @validator('country_id')
    def validate_country_id(cls, v):
        if v is not None:
            try:
                uuid.UUID(v)
            except ValueError:
                raise ValueError('country_id must be a valid UUID')
        return v


class UpdateUserInformation(BaseModel):
    name: str
    email_id: str
    country_id: str


class UserDeleteAccountResponse(BaseModel):
    success: bool
    message: str
    user_id: str
    user_name: str
    user_email: str
    deactivated_at: Optional[datetime] = None


# ── Admin user management ────────────────────────────────────────────────────

class AdminUserListItem(BaseModel):
    id: str
    name: str
    email_id: str
    country: str
    is_active: bool
    is_admin: bool
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class AdminUserListResponse(BaseModel):
    success: bool
    message: str
    users: List[AdminUserListItem]
    total_count: int
    page: int
    page_size: int
    total_pages: int


class AdminUserToggleRequest(BaseModel):
    action: str = Field(..., description="'enable' or 'disable'")

    @validator('action')
    def validate_action(cls, v):
        if v.lower() not in ('enable', 'disable'):
            raise ValueError('action must be "enable" or "disable"')
        return v.lower()


class AdminUserToggleResponse(BaseModel):
    success: bool
    message: str
    user_id: str
    new_status: str
    user_name: str
    user_email: str
