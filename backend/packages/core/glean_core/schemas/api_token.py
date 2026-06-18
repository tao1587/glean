"""
API Token schemas.

Pydantic models for API token request/response handling.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class APITokenCreate(BaseModel):
    """Schema for creating a new API token."""

    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: int | None = Field(None, ge=1, le=365)


class APITokenResponse(BaseModel):
    """Response schema for a single API token (without the actual token)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime


class APITokenCreateResponse(APITokenResponse):
    """Response schema when creating a token (includes the plain token)."""

    token: str  # Only returned once during creation


class APITokenListResponse(BaseModel):
    """Response schema for API token list."""

    tokens: list[APITokenResponse]
