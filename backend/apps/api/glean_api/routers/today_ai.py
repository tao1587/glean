"""Internal AI triggers for the Today Board.

Mounted at `/api/today/ai/`. Distinct from `/api/ai/*` (external writeback)
so internal browser-triggered flows have a clean boundary and a separate
admin gate (`allow_today_synthesis`).

Exposes three period-aware summary endpoints (`day` or `week`):
`summary:lookup`, `summary:generate`, `summary:retry`.
"""

from typing import Annotated

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas import UserResponse
from glean_core.schemas.config import AIIntegrationConfig
from glean_core.schemas.today_ai import (
    SummaryGenerateResponse,
    SummaryLookupResponse,
    SummaryRequest,
    SummaryView,
)
from glean_core.services.ai_summary_service import AISummaryService, week_bounds
from glean_core.services.llm.prompts import (
    DAILY_SUMMARY_PROMPT_VERSION,
    WEEKLY_SUMMARY_PROMPT_VERSION,
)
from glean_database.models.ai_summary import AIDailySummary
from glean_database.session import get_session

from ..config import settings as api_settings
from ..dependencies import get_current_user_or_api_token_user, get_redis_pool
from .ai import ensure_user_ai_enabled, get_enabled_ai_config

router = APIRouter()


def _make_summary_service(session: AsyncSession, period: str) -> AISummaryService:
    pv = (
        WEEKLY_SUMMARY_PROMPT_VERSION
        if period == "week"
        else DAILY_SUMMARY_PROMPT_VERSION
    )
    return AISummaryService(
        session,
        model=api_settings.llm_model,
        prompt_version=pv,
        target_language=api_settings.llm_target_language or "en",
        period=period,
    )


def _summary_view(row: AIDailySummary) -> SummaryView:
    return SummaryView(
        period=row.period,
        period_start=row.period_start.isoformat() if row.period_start else None,
        period_end=row.period_end.isoformat() if row.period_end else None,
        status=row.status,
        title=row.title,
        summary=row.summary,
        topics=row.topics or [],
        highlights=row.highlights or [],
        recommended_entry_ids=row.recommended_entry_ids or [],
        model=row.model,
        generated_at=row.generated_at.isoformat() if row.generated_at else None,
        source_set_hash=row.source_set_hash,
        source_count=len(row.source_ids or []),
        error_code=row.error_code,
        error_message=row.error_message,
    )


def _ensure_synthesis_allowed(config: AIIntegrationConfig) -> None:
    if not (config.allow_today_synthesis and api_settings.llm_synthesis_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Today synthesis is disabled",
        )


@router.post("/summary:lookup", response_model=SummaryLookupResponse)
async def lookup_summary(
    payload: SummaryRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user_or_api_token_user)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SummaryLookupResponse:
    """Return the cached summary (if any) plus the current set hash + stale flag."""
    ensure_user_ai_enabled(current_user)
    _ensure_synthesis_allowed(config)

    svc = _make_summary_service(session, payload.period)
    if payload.period == "week":
        result = await svc.lookup_week(
            user_id=current_user.id, week_start=week_bounds(payload.date)[0]
        )
    else:
        result = await svc.lookup(user_id=current_user.id, summary_date=payload.date)
    return SummaryLookupResponse(
        summary=_summary_view(result.summary) if result.summary else None,
        current_set_hash=result.current_set_hash,
        current_count=result.current_count,
        is_stale=result.is_stale,
    )


@router.post("/summary:generate", response_model=SummaryGenerateResponse)
async def generate_summary(
    payload: SummaryRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user_or_api_token_user)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> SummaryGenerateResponse:
    """Reserve a placeholder summary row + enqueue the worker job.

    Returns 422 if there is nothing to summarize (no entries for the day, or
    no done daily summaries for the week).
    """
    ensure_user_ai_enabled(current_user)
    _ensure_synthesis_allowed(config)

    svc = _make_summary_service(session, payload.period)
    if payload.period == "week":
        ws = week_bounds(payload.date)[0]
        outcome = await svc.enqueue_week(user_id=current_user.id, week_start=ws)
        if outcome.status == "queued":
            await redis.enqueue_job(
                "summarize_week_task",
                user_id=current_user.id,
                week_start=ws.isoformat(),
            )
    else:
        outcome = await svc.enqueue(
            user_id=current_user.id, summary_date=payload.date
        )
        if outcome.status == "queued":
            await redis.enqueue_job(
                "summarize_day_task", summary_id=outcome.summary_id
            )

    if outcome.status == "no_entries":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="no_entries",
        )
    return SummaryGenerateResponse(
        status=outcome.status,
        summary_id=outcome.summary_id or "",
        source_set_hash=outcome.source_set_hash or "",
        source_count=outcome.source_count,
    )


@router.post("/summary:retry", response_model=SummaryView)
async def retry_summary(
    payload: SummaryRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user_or_api_token_user)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> SummaryView:
    """Reset the latest failed summary for this period to pending and re-enqueue."""
    ensure_user_ai_enabled(current_user)
    _ensure_synthesis_allowed(config)

    svc = _make_summary_service(session, payload.period)
    target = (
        week_bounds(payload.date)[0] if payload.period == "week" else payload.date
    )
    sid = await svc.retry(user_id=current_user.id, summary_date=target)
    if sid is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No failed summary to retry",
        )
    if payload.period == "week":
        await redis.enqueue_job(
            "summarize_week_task",
            user_id=current_user.id,
            week_start=target.isoformat(),
        )
    else:
        await redis.enqueue_job("summarize_day_task", summary_id=sid)
    row = await svc.get_by_id(sid)
    if row is None:
        raise HTTPException(status_code=500, detail="Lost row after retry")
    return _summary_view(row)
