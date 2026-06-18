"""
Feed fetch run model definition.

This module stores one persisted row per feed refresh attempt.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class FeedFetchRun(Base, TimestampMixin):
    """
    Persisted feed refresh attempt.

    Stores queue and execution timestamps plus lightweight progress metadata.
    """

    __tablename__ = "feed_fetch_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    feed_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("feeds.id", ondelete="CASCADE"),
        nullable=False,
    )
    job_id: Mapped[str | None] = mapped_column(String(64), index=True)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    current_stage: Mapped[str | None] = mapped_column(String(50))
    path_kind: Mapped[str | None] = mapped_column(String(32))
    profile_key: Mapped[str | None] = mapped_column(String(255), index=True)
    queue_entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    predicted_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    predicted_finish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)

    feed = relationship("Feed")
    stage_events = relationship(
        "FeedFetchStageEvent",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="FeedFetchStageEvent.stage_order",
    )

    __table_args__ = (
        Index("ix_feed_fetch_runs_feed_created", "feed_id", "created_at"),
    )
