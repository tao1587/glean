"""
User authentication provider model definition.

This module defines the UserAuthProvider model for mapping users to
their authentication providers (local, OIDC, OAuth, etc.).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class UserAuthProvider(Base, TimestampMixin):
    """
    User authentication provider mapping.

    Enables users to authenticate with multiple providers (local password, Google, etc.).

    Attributes:
        id: Unique mapping identifier (UUID).
        user_id: User account (foreign key to users).
        provider_id: Provider type (local, oidc, google, microsoft, etc.).
        provider_user_id: User ID from the authentication provider.
        provider_metadata: Provider-specific metadata (JSONB).
        last_used_at: Timestamp of most recent authentication with this provider.
    """

    __tablename__ = "user_auth_providers"
    __table_args__ = (UniqueConstraint("user_id", "provider_id", name="uq_user_provider"),)

    # Primary key
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

    # Foreign key
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Provider information
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)

    # Provider-specific metadata (e.g., OAuth tokens, email verification status)
    provider_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )

    # Usage tracking
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    user = relationship("User", back_populates="auth_providers")
