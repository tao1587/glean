"""
User schemas.

Request and response models for user-related operations.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr


class UserSettings(BaseModel):
    """Known user settings with forward-compatible extra keys."""

    model_config = ConfigDict(extra="allow")

    read_later_days: int | None = None
    show_read_later_remaining: bool | None = None
    translation_provider: Literal["google", "deepl", "openai", "mtran"] | None = None
    translation_target_language: Literal["zh-CN", "en"] | None = None
    list_translation_auto_enabled: bool | None = None
    list_translation_english_only: bool | None = None
    ai_integration_enabled: bool | None = None
    today_board_default_view: Literal["list", "ai_summary"] | None = None
    translation_api_key: str | None = None
    translation_model: str | None = None
    translation_base_url: str | None = None


class UserBase(BaseModel):
    """Base user fields."""

    email: EmailStr | None = None  # Email can be None for OAuth users without email scope
    name: str | None = None
    username: str | None = None  # Username (e.g., preferred_username from OIDC)
    phone: str | None = None  # Phone number (e.g., phone_number from OIDC)


class UserResponse(UserBase):
    """User response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    avatar_url: str | None = None
    is_active: bool
    is_verified: bool
    settings: UserSettings | None = None
    created_at: datetime
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    """User creation request (for internal use)."""

    email: EmailStr
    name: str
    password: str


class UserUpdate(BaseModel):
    """User update request."""

    name: str | None = None
    username: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    settings: UserSettings | None = None
