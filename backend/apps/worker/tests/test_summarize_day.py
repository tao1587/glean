"""Tests for the summarize_day worker task.

Imports the task module directly and mocks collaborators (AISummaryService,
_make_client) so it does not depend on the worker app or a live DB/LLM.
"""

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_worker.tasks.summarize_day import summarize_day_task


def _fake_row():
    return SimpleNamespace(
        source_ids=["e1"],
        user_id="u1",
        summary_date=date(2026, 6, 10),  # a Wednesday
        target_language="en",
    )


def _fake_payload():
    return SimpleNamespace(
        title="T",
        summary="s",
        topics=[],
        highlights=[],
        recommended_entry_ids=[],
        input_tokens=10,
        output_tokens=20,
    )


@pytest.mark.asyncio
async def test_done_completes_and_enqueues_week():
    svc = AsyncMock()
    svc.claim.return_value = _fake_row()
    svc.load_day_items.return_value = [
        {"entry_id": "e1", "title": "T", "content": "c"}
    ]
    svc.validate_payload_subset = MagicMock()

    client = AsyncMock()
    client.summarize_day.return_value = _fake_payload()

    ctx = {"redis": AsyncMock()}

    with (
        patch("glean_worker.tasks.summarize_day.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.summarize_day.AISummaryService", return_value=svc
        ),
        patch(
            "glean_worker.tasks.summarize_day._make_client", return_value=client
        ),
        patch.object(
            __import__(
                "glean_worker.tasks.summarize_day", fromlist=["settings"]
            ).settings,
            "llm_api_key",
            "sk-test",
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        result = await summarize_day_task(ctx, summary_id="sum-1")

    assert result["status"] == "done"
    assert result["summary_id"] == "sum-1"
    svc.complete.assert_called_once()
    # week_start = Monday of the week containing 2026-06-10 (Wed) -> 2026-06-08
    ctx["redis"].enqueue_job.assert_awaited_once_with(
        "summarize_week_task", user_id="u1", week_start="2026-06-08"
    )


@pytest.mark.asyncio
async def test_skipped_when_claim_returns_none():
    svc = AsyncMock()
    svc.claim.return_value = None

    ctx = {"redis": AsyncMock()}

    with (
        patch("glean_worker.tasks.summarize_day.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.summarize_day.AISummaryService", return_value=svc
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        result = await summarize_day_task(ctx, summary_id="sum-1")

    assert result["status"] == "skipped"
    assert result["summary_id"] == "sum-1"
    ctx["redis"].enqueue_job.assert_not_awaited()
