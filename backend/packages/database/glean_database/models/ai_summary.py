"""AI-generated summary models."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class AIDailySummary(Base, TimestampMixin):
    """User-scoped AI synthesis for a local collection day."""

    __tablename__ = "ai_daily_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    summary_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    period: Mapped[str] = mapped_column(
        String(8), nullable=False, server_default="day", index=True
    )  # day | week
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    title: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    highlights: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )
    topics: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )
    recommended_entry_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )
    model: Mapped[str | None] = mapped_column(String(200))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    # Lifecycle / lookup-key fields (added in 2026-04-28 schema v2)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending", index=True
    )
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    prompt_version: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="v1"
    )
    target_language: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="en"
    )
    source_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )
    # sha256 of empty bytes — sentinel for migrated v0 rows
    source_set_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="internal"
    )

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "user_id", "period", "summary_date", "timezone", "model",
            "prompt_version", "target_language", "source_set_hash",
            name="uq_ai_daily_summary_tuple",
        ),
    )
