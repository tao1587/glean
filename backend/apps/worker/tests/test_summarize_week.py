"""Tests for the summarize_week worker task.

Imports the task module directly and mocks collaborators (AISummaryService,
_make_client, get_session_context) so it does not depend on the worker app or a
live DB/LLM.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from glean_worker.tasks.summarize_week import summarize_week_task


def _fake_row():
    return SimpleNamespace(
        id="w1",
        source_ids=["d1", "d2"],
        target_language="en",
    )


def _fake_payload():
    return SimpleNamespace(
        title="T",
        summary="s",
        topics=[],
        input_tokens=10,
        output_tokens=20,
    )


def _outcome(status, summary_id="w1"):
    return SimpleNamespace(
        status=status,
        summary_id=summary_id,
        source_set_hash="h",
        source_count=2,
    )


@pytest.mark.asyncio
async def test_done_completes():
    svc = AsyncMock()
    svc.enqueue_week.return_value = _outcome("queued")
    svc.claim.return_value = _fake_row()
    svc.load_week_items.return_value = [
        {"date": "2026-06-08", "title": "Mon", "summary": "s", "topics": ["x"]}
    ]

    client = AsyncMock()
    client.summarize_week.return_value = _fake_payload()

    with (
        patch(
            "glean_worker.tasks.summarize_week.get_session_context"
        ) as mock_ctx,
        patch(
            "glean_worker.tasks.summarize_week.AISummaryService", return_value=svc
        ),
        patch(
            "glean_worker.tasks.summarize_week._make_client", return_value=client
        ),
        patch.object(
            __import__(
                "glean_worker.tasks.summarize_week", fromlist=["settings"]
            ).settings,
            "llm_api_key",
            "k",
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        result = await summarize_week_task(
            {}, user_id="u1", week_start="2026-06-08"
        )

    assert result["status"] == "done"
    assert result["summary_id"] == "w1"
    svc.complete.assert_called_once()
    _, kwargs = svc.complete.call_args
    assert kwargs["highlights"] == []
    assert kwargs["recommended_entry_ids"] == []


@pytest.mark.asyncio
async def test_no_entries_does_not_claim():
    svc = AsyncMock()
    svc.enqueue_week.return_value = _outcome("no_entries", summary_id=None)

    with (
        patch(
            "glean_worker.tasks.summarize_week.get_session_context"
        ) as mock_ctx,
        patch(
            "glean_worker.tasks.summarize_week.AISummaryService", return_value=svc
        ),
        patch.object(
            __import__(
                "glean_worker.tasks.summarize_week", fromlist=["settings"]
            ).settings,
            "llm_api_key",
            "k",
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        result = await summarize_week_task(
            {}, user_id="u1", week_start="2026-06-08"
        )

    assert result == {"status": "no_entries"}
    svc.claim.assert_not_awaited()


@pytest.mark.asyncio
async def test_already_done():
    svc = AsyncMock()
    svc.enqueue_week.return_value = _outcome("already_done")

    with (
        patch(
            "glean_worker.tasks.summarize_week.get_session_context"
        ) as mock_ctx,
        patch(
            "glean_worker.tasks.summarize_week.AISummaryService", return_value=svc
        ),
        patch.object(
            __import__(
                "glean_worker.tasks.summarize_week", fromlist=["settings"]
            ).settings,
            "llm_api_key",
            "k",
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        result = await summarize_week_task(
            {}, user_id="u1", week_start="2026-06-08"
        )

    assert result == {"status": "already_done"}
    svc.claim.assert_not_awaited()
