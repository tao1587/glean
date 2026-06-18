"""OpenAI-compatible LLM client wrapper.

Targets DeepSeek v4 by default but works with any provider that implements
OpenAI's /v1/chat/completions endpoint and JSON mode.
"""

import json
import logging
from typing import Any

from openai import AsyncOpenAI
from pydantic import ValidationError

from glean_core.schemas.ai import SynthesisPayload
from glean_core.services.llm.prompts import (
    DailyItem,
    WeeklyItem,
    build_daily_summary_messages,
    build_weekly_summary_messages,
)

log = logging.getLogger(__name__)


class LLMError(Exception):
    """Base for LLM-side failures we classify ourselves."""


class LLMBadResponseError(LLMError):
    """Provider returned malformed JSON or an unexpected schema."""


class LLMRefusalError(LLMError):
    """Provider refused to generate output (safety filter, etc.)."""


class OpenAICompatibleClient:
    """Thin wrapper around openai.AsyncOpenAI for our summarization needs."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        max_output_tokens_summarize: int,
        max_output_tokens_synthesize: int,
        timeout_seconds: int,
        extra_params: dict[str, Any],
    ) -> None:
        self._raw = AsyncOpenAI(
            api_key=api_key, base_url=base_url, timeout=timeout_seconds
        )
        self._model = model
        self._max_summarize = max_output_tokens_summarize
        self._max_synthesize = max_output_tokens_synthesize
        self._extra_params = dict(extra_params or {})

    async def summarize_day(
        self,
        *,
        items: list[DailyItem],
        target_language: str,
    ) -> SynthesisPayload:
        """Build a daily summary from raw article entries."""
        messages = build_daily_summary_messages(items=items, target_language=target_language)
        response = await self._raw.chat.completions.create(
            model=self._model,
            messages=messages,
            response_format={"type": "json_object"},
            max_tokens=self._max_synthesize,
            **self._extra_params,
        )
        return self._parse(response, SynthesisPayload)

    async def summarize_week(
        self,
        *,
        items: list[WeeklyItem],
        target_language: str,
    ) -> SynthesisPayload:
        """Build a weekly summary from per-day summaries."""
        messages = build_weekly_summary_messages(items=items, target_language=target_language)
        response = await self._raw.chat.completions.create(
            model=self._model,
            messages=messages,
            response_format={"type": "json_object"},
            max_tokens=self._max_synthesize,
            **self._extra_params,
        )
        return self._parse(response, SynthesisPayload)

    @staticmethod
    def _parse(response: Any, payload_cls: type) -> Any:
        choice = response.choices[0]
        if choice.finish_reason == "content_filter":
            raise LLMRefusalError("provider safety filter triggered")
        raw = choice.message.content or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LLMBadResponseError(f"non-JSON response: {raw[:200]!r}") from exc
        try:
            payload = payload_cls.model_validate(data)
        except ValidationError as exc:
            raise LLMBadResponseError(f"schema mismatch: {exc}") from exc
        if response.usage:
            payload = payload.model_copy(
                update={
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                }
            )
        return payload
