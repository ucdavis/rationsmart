from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.language_tags import canonical_language_tag


class LanguageCreateRequest(BaseModel):
    code: str = Field(
        ..., max_length=10,
        description="BCP 47 language code, e.g. 'hi', 'fil', 'pt-BR'. Stored in its standard "
                    "form ('BEN' -> 'bn', 'tl' -> 'fil'); invalid codes are refused",
    )
    name: str = Field(..., min_length=1, max_length=100, description="Display name, e.g. 'Hindi'")

    @field_validator("code", mode="before")
    @classmethod
    def normalise_code(cls, v: str) -> str:
        return canonical_language_tag(v)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Language name cannot be empty")
        return v


class LanguageUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    is_active: Optional[bool] = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Language name cannot be empty if provided")
        return v


class LanguageResponse(BaseModel):
    code: str
    name: str
    is_active: bool
    created_at: Optional[datetime] = None


class LanguageListResponse(BaseModel):
    success: bool
    languages: List[LanguageResponse]


class CountryWithLanguagesResponse(BaseModel):
    id: str
    name: str
    country_code: str
    currency: Optional[str] = None
    is_active: bool
    languages: List[str] = Field(default_factory=list, description="Assigned language codes")


class CountryLanguageListResponse(BaseModel):
    success: bool
    countries: List[CountryWithLanguagesResponse]
