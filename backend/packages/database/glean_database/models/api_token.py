"""
API Token model definition.

This module defines the APIToken model for storing long-lived API tokens
used for MCP server authentication and other API access.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class APIToken(Base, TimestampMixin):
    """
    API Token model for long-lived authentication.

    Used for MCP server access and other programmatic API access.
    Tokens are hashed and only the prefix is stored for display.

    Attributes:
        id: Unique token identifier (UUID).
        user_id: Owner of the token (foreign key to users).
        name: User-defined name for the token.
        token_hash: Bcrypt hash of the token.
        token_prefix: First 16 characters for display (e.g., "glean_xxxxxxxxxx").
        last_used_at: Timestamp of most recent token usage.
        expires_at: Token expiration timestamp (null = never expires).
        is_revoked: Whether the token has been revoked.
    """

    __tablename__ = "api_tokens"

    # Primary key
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

    # Foreign key
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Token metadata
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Usage tracking
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Status
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    user = relationship("User", back_populates="api_tokens")
