"""
JWT token creation and verification utilities.

Implements access and refresh token generation with configurable expiration.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from jose import JWTError, jwt
from pydantic import BaseModel


class TokenData(BaseModel):
    """JWT token payload data."""

    sub: str  # User ID
    type: Literal["access", "refresh"]
    exp: int  # Expiration timestamp
    iat: int  # Issued at timestamp


class JWTConfig:
    """JWT configuration."""

    def __init__(
        self,
        secret_key: str,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 15,
        refresh_token_expire_days: int = 7,
    ):
        """
        Initialize JWT configuration.

        Args:
            secret_key: Secret key for signing tokens.
            algorithm: JWT algorithm (default: HS256).
            access_token_expire_minutes: Access token expiration in minutes.
            refresh_token_expire_days: Refresh token expiration in days.
        """
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days


def create_access_token(
    user_id: str, config: JWTConfig, type_: Literal["access", "admin"] = "access"
) -> str:
    """
    Create an access token.

    Args:
        user_id: User identifier.
        config: JWT configuration.

    Returns:
        Encoded JWT access token.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=config.access_token_expire_minutes)

    payload = {
        "sub": user_id,
        "type": type_,
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    return jwt.encode(payload, config.secret_key, algorithm=config.algorithm)


def create_refresh_token(user_id: str, config: JWTConfig) -> str:
    """
    Create a refresh token.

    Args:
        user_id: User identifier.
        config: JWT configuration.

    Returns:
        Encoded JWT refresh token.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(days=config.refresh_token_expire_days)

    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    return jwt.encode(payload, config.secret_key, algorithm=config.algorithm)


def verify_token(token: str, config: JWTConfig) -> TokenData | None:
    """
    Verify and decode a JWT token.

    Args:
        token: JWT token to verify.
        config: JWT configuration.

    Returns:
        TokenData if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
        return TokenData(**payload)
    except JWTError:
        return None
