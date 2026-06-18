"""Pydantic schemas for /api/today/ai/* endpoints (internal triggers)."""

from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, Field


class SummaryRequest(BaseModel):
    period: Literal["day", "week"] = "day"
    date: date_type  # for week, any date within the target week


class SummaryView(BaseModel):
    period: str
    period_start: str | None = None
    period_end: str | None = None
    status: str
    title: str | None = None
    summary: str | None = None
    topics: list[dict] = Field(default_factory=list)
    highlights: list[dict] = Field(default_factory=list)
    recommended_entry_ids: list[str] = Field(default_factory=list)
    model: str | None = None
    generated_at: str | None = None
    source_set_hash: str | None = None
    source_count: int | None = None
    error_code: str | None = None
    error_message: str | None = None


class SummaryLookupResponse(BaseModel):
    summary: SummaryView | None = None
    current_set_hash: str | None = None
    current_count: int = 0
    is_stale: bool = False


class SummaryGenerateResponse(BaseModel):
    status: Literal["queued", "in_flight", "already_done", "no_entries"]
    summary_id: str
    source_set_hash: str
    source_count: int
