"""arq job: build a weekly rollup summary from the week's daily summaries.

Mirrors summarize_day.py. Operates over the daily-summary ids frozen on the
placeholder weekly row at enqueue time (`source_ids`). Weekly summaries produce
no per-article highlights or recommendations.
"""

import json
from datetime import date
from typing import Any

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

from glean_core import get_logger
from glean_core.services.ai_summary_service import AISummaryService
from glean_core.services.llm.client import (
    LLMBadResponseError,
    LLMRefusalError,
    OpenAICompatibleClient,
)
from glean_core.services.llm.prompts import WEEKLY_SUMMARY_PROMPT_VERSION
from glean_core.services.llm.sanitize import sanitize_string
from glean_database.session import get_session_context

from ..config import settings

logger = get_logger(__name__)

_PERMANENT_ERRORS: dict[type[Exception], str] = {
    AuthenticationError: "provider_auth",
    PermissionDeniedError: "provider_auth",
    BadRequestError: "provider_4xx",
    LLMBadResponseError: "bad_response",
    LLMRefusalError: "model_refused",
}

_RETRYABLE_ERRORS = (
    APIConnectionError,
    APITimeoutError,
    RateLimitError,
    APIError,
)


def _make_client() -> OpenAICompatibleClient:
    extra: dict[str, Any]
    try:
        extra = json.loads(settings.llm_extra_params or "{}")
        if not isinstance(extra, dict):
            extra = {}
    except json.JSONDecodeError:
        logger.warning("LLM_EXTRA_PARAMS is not valid JSON; ignoring")
        extra = {}
    return OpenAICompatibleClient(
        api_key=settings.llm_api_key or "",
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        max_output_tokens_summarize=settings.llm_max_output_tokens_summarize,
        max_output_tokens_synthesize=settings.llm_max_output_tokens_synthesize,
        timeout_seconds=settings.llm_request_timeout_seconds,
        extra_params=extra,
    )


async def summarize_week_task(
    _ctx, *, user_id: str, week_start: str
) -> dict[str, Any]:
    ws = date.fromisoformat(week_start)
    async with get_session_context() as session:
        svc = AISummaryService(
            session,
            model=settings.llm_model,
            prompt_version=WEEKLY_SUMMARY_PROMPT_VERSION,
            target_language=settings.llm_target_language or "en",
            period="week",
        )
        if not settings.llm_api_key:
            return {"status": "skipped", "reason": "no_api_key"}
        outcome = await svc.enqueue_week(user_id=user_id, week_start=ws)
        if outcome.status != "queued":
            return {"status": outcome.status}
        row = await svc.claim(summary_id=outcome.summary_id)
        if row is None:
            return {"status": "skipped"}
        items = await svc.load_week_items(daily_ids=row.source_ids or [])
        if not items:
            await svc.fail(
                summary_id=row.id,
                error_code="no_entries",
                message="empty weekly source set",
            )
            return {"status": "failed", "error_code": "no_entries"}
        client = _make_client()
        try:
            payload = await client.summarize_week(
                items=items, target_language=row.target_language
            )
        except _RETRYABLE_ERRORS:
            raise
        except Exception as exc:
            for cls, code in _PERMANENT_ERRORS.items():
                if isinstance(exc, cls):
                    await svc.fail(
                        summary_id=row.id, error_code=code, message=str(exc)
                    )
                    return {"status": "failed", "error_code": code}
            logger.exception(
                "summarize_week: unclassified error",
                extra={"summary_id": row.id},
            )
            await svc.fail(
                summary_id=row.id, error_code="unknown", message=str(exc)
            )
            return {"status": "failed", "error_code": "unknown"}
        await svc.complete(
            summary_id=row.id,
            title=sanitize_string(payload.title, max_chars=80) or "",
            summary=sanitize_string(payload.summary, max_chars=400) or "",
            topics=[
                {
                    "name": sanitize_string(t.name, max_chars=40) or "",
                    "entry_ids": list(t.entry_ids),
                }
                for t in payload.topics
            ],
            highlights=[],
            recommended_entry_ids=[],
            input_tokens=payload.input_tokens,
            output_tokens=payload.output_tokens,
        )
        return {"status": "done", "summary_id": row.id}
