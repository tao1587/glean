"""
Authentication schemas.

Request and response models for authentication endpoints.
"""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """User registration request."""

    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=100)


class LoginRequest(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str
