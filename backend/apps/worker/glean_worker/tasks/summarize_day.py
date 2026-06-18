"""arq job: build a daily summary from raw entries.

Operates over the entry ids frozen on the placeholder summary row at enqueue
time (`source_ids`), so concurrent ingestion of new entries during job
execution doesn't mutate the inputs mid-flight. On success, enqueues the
weekly rollup for the week containing the day.
"""

import json
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
from glean_core.services.ai_summary_service import AISummaryService, week_bounds
from glean_core.services.llm.client import (
    LLMBadResponseError,
    LLMRefusalError,
    OpenAICompatibleClient,
)
from glean_core.services.llm.prompts import DAILY_SUMMARY_PROMPT_VERSION
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


async def summarize_day_task(_ctx, *, summary_id: str) -> dict[str, Any]:
    async with get_session_context() as session:
        svc = AISummaryService(
            session,
            model=settings.llm_model,
            prompt_version=DAILY_SUMMARY_PROMPT_VERSION,
            target_language=settings.llm_target_language or "en",
            period="day",
        )
        row = await svc.claim(summary_id=summary_id)
        if row is None:
            return {"status": "skipped", "summary_id": summary_id}
        if not settings.llm_api_key:
            await svc.fail(
                summary_id=summary_id,
                error_code="ai_integration_disabled",
                message="LLM_API_KEY is empty",
            )
            return {"status": "failed", "error_code": "ai_integration_disabled"}
        items = await svc.load_day_items(
            entry_ids=row.source_ids or [],
            max_chars=settings.llm_max_input_chars_daily,
        )
        if not items:
            await svc.fail(
                summary_id=summary_id,
                error_code="no_entries",
                message="empty source set at task time",
            )
            return {"status": "failed", "error_code": "no_entries"}
        client = _make_client()
        try:
            payload = await client.summarize_day(
                items=items, target_language=row.target_language
            )
        except _RETRYABLE_ERRORS:
            raise
        except Exception as exc:
            for cls, code in _PERMANENT_ERRORS.items():
                if isinstance(exc, cls):
                    await svc.fail(
                        summary_id=summary_id, error_code=code, message=str(exc)
                    )
                    return {"status": "failed", "error_code": code}
            logger.exception(
                "summarize_day: unclassified error",
                extra={"summary_id": summary_id},
            )
            await svc.fail(
                summary_id=summary_id, error_code="unknown", message=str(exc)
            )
            return {"status": "failed", "error_code": "unknown"}
        input_ids = [i["entry_id"] for i in items]
        try:
            svc.validate_payload_subset(
                input_entry_ids=input_ids,
                recommended=payload.recommended_entry_ids,
                topics_entry_ids=[
                    eid for t in payload.topics for eid in t.entry_ids
                ],
            )
        except ValueError as exc:
            await svc.fail(
                summary_id=summary_id, error_code="bad_response", message=str(exc)
            )
            return {"status": "failed", "error_code": "bad_response"}
        await svc.complete(
            summary_id=summary_id,
            title=sanitize_string(payload.title, max_chars=80) or "",
            summary=sanitize_string(payload.summary, max_chars=400) or "",
            topics=[
                {
                    "name": sanitize_string(t.name, max_chars=40) or "",
                    "entry_ids": list(t.entry_ids),
                }
                for t in payload.topics
            ],
            highlights=[
                {
                    "entry_id": h.entry_id,
                    "reason": sanitize_string(h.reason, max_chars=200) or "",
                }
                for h in payload.highlights
            ],
            recommended_entry_ids=list(payload.recommended_entry_ids),
            input_tokens=payload.input_tokens,
            output_tokens=payload.output_tokens,
        )
        ws, _ = week_bounds(row.summary_date)
        await _ctx["redis"].enqueue_job(
            "summarize_week_task", user_id=row.user_id, week_start=ws.isoformat()
        )
        return {"status": "done", "summary_id": summary_id}
