"""Cron: auto-generate daily summaries for AI-enabled users (hash-deduped)."""
from typing import Any

import sqlalchemy as sa

from glean_core import get_logger
from glean_core.server_time import get_server_now
from glean_core.services.ai_summary_service import AISummaryService
from glean_core.services.llm.prompts import DAILY_SUMMARY_PROMPT_VERSION
from glean_database.models.user import User
from glean_database.session import get_session_context

from ..config import settings

logger = get_logger(__name__)


def parse_cron_hours(spec: str) -> set[int]:
    """Parse "6,12,18,22" → {6,12,18,22}; ignore blanks; clamp to 0..23."""
    hours: set[int] = set()
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        h = int(part)
        if 0 <= h <= 23:
            hours.add(h)
    return hours


async def _ai_enabled_user_ids(session) -> list[str]:
    rows = await session.execute(sa.select(User).where(User.is_active.is_(True)))
    return [u.id for u in rows.scalars() if (u.settings or {}).get("ai_integration_enabled")]


async def scheduled_daily_summaries(ctx: dict[str, Any]) -> None:
    """Enqueue today's daily summary for each AI-enabled user. Hash dedup in enqueue()."""
    if not settings.llm_api_key:
        return
    today = get_server_now().date()
    target_language = settings.llm_target_language or "en"
    async with get_session_context() as session:
        user_ids = await _ai_enabled_user_ids(session)
        for uid in user_ids:
            svc = AISummaryService(
                session, model=settings.llm_model,
                prompt_version=DAILY_SUMMARY_PROMPT_VERSION,
                target_language=target_language, period="day",
            )
            outcome = await svc.enqueue(user_id=uid, summary_date=today)
            if outcome.status == "queued":
                await ctx["redis"].enqueue_job("summarize_day_task", summary_id=outcome.summary_id)
    logger.info("scheduled_daily_summaries: processed %d AI-enabled users", len(user_ids))
