"""
Feed fetch stage event model definition.

This module stores ordered stage transitions for a feed refresh run.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class FeedFetchStageEvent(Base, TimestampMixin):
    """
    Persisted stage transition for a feed fetch run.
    """

    __tablename__ = "feed_fetch_stage_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("feed_fetch_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    stage_name: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    metrics_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    run = relationship("FeedFetchRun", back_populates="stage_events")

    __table_args__ = (
        Index("ix_feed_fetch_stage_events_run_order", "run_id", "stage_order"),
        UniqueConstraint("run_id", "stage_order", name="uq_feed_fetch_stage_events_run_order"),
    )
