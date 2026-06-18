"""Tests for run_startup_smoke_check."""

from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIConnectionError, AuthenticationError

from glean_core.services.llm.client import (
    LLMBadResponseError,
    OpenAICompatibleClient,
)
from glean_core.services.llm.smoke_check import (
    run_startup_smoke_check,
)


def _auth_error() -> AuthenticationError:
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    response = httpx.Response(401, request=request)
    return AuthenticationError(message="401", response=response, body=None)


def _connection_error() -> APIConnectionError:
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    return APIConnectionError(request=request)


@pytest.mark.asyncio
async def test_success_returns_ready():
    fake_client = AsyncMock(spec=OpenAICompatibleClient)
    fake_client.summarize_day = AsyncMock(return_value="ok-payload")

    result = await run_startup_smoke_check(fake_client, target_language="en")

    assert result.ready is True
    assert result.failure_reason is None
    fake_client.summarize_day.assert_awaited_once()


@pytest.mark.asyncio
async def test_auth_error_returns_disabled():
    fake_client = AsyncMock(spec=OpenAICompatibleClient)
    fake_client.summarize_day = AsyncMock(side_effect=_auth_error())

    result = await run_startup_smoke_check(fake_client, target_language="en")

    assert result.ready is False
    assert result.failure_reason == "auth"


@pytest.mark.asyncio
async def test_bad_response_returns_disabled():
    fake_client = AsyncMock(spec=OpenAICompatibleClient)
    fake_client.summarize_day = AsyncMock(side_effect=LLMBadResponseError("oops"))

    result = await run_startup_smoke_check(fake_client, target_language="en")

    assert result.ready is False
    assert result.failure_reason == "json_mode_unsupported"


@pytest.mark.asyncio
async def test_connection_error_retries_then_disables(monkeypatch):
    fake_client = AsyncMock(spec=OpenAICompatibleClient)
    fake_client.summarize_day = AsyncMock(side_effect=_connection_error())

    monkeypatch.setattr(
        "glean_core.services.llm.smoke_check._SLEEP", AsyncMock(return_value=None)
    )

    result = await run_startup_smoke_check(fake_client, target_language="en")

    assert result.ready is False
    assert result.failure_reason == "network"
    assert fake_client.summarize_day.await_count == 3
