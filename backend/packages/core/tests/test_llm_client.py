"""Tests for OpenAICompatibleClient."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from glean_core.services.llm.client import (
    OpenAICompatibleClient,
)


def _mock_openai_response(content_str: str, usage_in: int = 100, usage_out: int = 30):
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = content_str
    response.choices[0].finish_reason = "stop"
    response.usage = MagicMock(prompt_tokens=usage_in, completion_tokens=usage_out)
    return response


@pytest.fixture
def client() -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        api_key="sk-test",
        base_url="https://api.deepseek.com",
        model="deepseek-v4-flash",
        max_output_tokens_summarize=500,
        max_output_tokens_synthesize=1500,
        timeout_seconds=60,
        extra_params={},
    )


class TestSummarizeDay:
    _VALID_SYNTHESIS_JSON = json.dumps(
        {
            "title": "Daily Themes",
            "summary": "Today's reading focused on AI and infrastructure.",
            "topics": [{"name": "AI", "entry_ids": ["e1"]}],
            "highlights": [{"entry_id": "e1", "reason": "Top story"}],
            "recommended_entry_ids": ["e1"],
        }
    )

    @pytest.mark.asyncio
    async def test_summarize_day_parses_payload(self, client, monkeypatch):
        fake = AsyncMock(
            return_value=_mock_openai_response(self._VALID_SYNTHESIS_JSON)
        )
        monkeypatch.setattr(client._raw.chat.completions, "create", fake)

        payload = await client.summarize_day(
            items=[{"entry_id": "e1", "title": "T", "content": "c"}],
            target_language="en",
        )

        assert payload.title == "Daily Themes"
        assert payload.recommended_entry_ids == ["e1"]

    @pytest.mark.asyncio
    async def test_summarize_day_uses_synthesize_max_tokens(self, monkeypatch):
        c = OpenAICompatibleClient(
            api_key="k",
            base_url="https://x",
            model="m",
            max_output_tokens_summarize=500,
            max_output_tokens_synthesize=1500,
            timeout_seconds=60,
            extra_params={},
        )
        captured: dict = {}

        async def fake_create(**kwargs):
            captured.update(kwargs)
            return _mock_openai_response(self._VALID_SYNTHESIS_JSON)

        monkeypatch.setattr(c._raw.chat.completions, "create", fake_create)
        await c.summarize_day(items=[], target_language="en")

        assert captured["max_tokens"] == 1500
        assert captured["response_format"] == {"type": "json_object"}


class TestSummarizeWeek:
    _VALID_SYNTHESIS_JSON = json.dumps(
        {
            "title": "Weekly Overview",
            "summary": "This week dominated by chip policy and open-source AI.",
            "topics": [{"name": "Chips", "entry_ids": []}],
            "highlights": [],
            "recommended_entry_ids": [],
        }
    )

    @pytest.mark.asyncio
    async def test_summarize_week_parses_payload(self, client, monkeypatch):
        fake = AsyncMock(
            return_value=_mock_openai_response(self._VALID_SYNTHESIS_JSON)
        )
        monkeypatch.setattr(client._raw.chat.completions, "create", fake)

        payload = await client.summarize_week(
            items=[
                {
                    "date": "2026-06-08",
                    "title": "Mon",
                    "summary": "s",
                    "topics": ["a"],
                }
            ],
            target_language="en",
        )

        assert payload.title == "Weekly Overview"
        assert payload.recommended_entry_ids == []

    @pytest.mark.asyncio
    async def test_summarize_week_uses_synthesize_max_tokens(self, monkeypatch):
        c = OpenAICompatibleClient(
            api_key="k",
            base_url="https://x",
            model="m",
            max_output_tokens_summarize=500,
            max_output_tokens_synthesize=1500,
            timeout_seconds=60,
            extra_params={},
        )
        captured: dict = {}

        async def fake_create(**kwargs):
            captured.update(kwargs)
            return _mock_openai_response(self._VALID_SYNTHESIS_JSON)

        monkeypatch.setattr(c._raw.chat.completions, "create", fake_create)
        await c.summarize_week(items=[], target_language="en")

        assert captured["max_tokens"] == 1500
        assert captured["response_format"] == {"type": "json_object"}
