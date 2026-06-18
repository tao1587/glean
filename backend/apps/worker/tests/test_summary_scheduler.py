"""Tests for the summary_scheduler cron task.

Imports the module directly and mocks collaborators (get_session_context,
AISummaryService, _ai_enabled_user_ids) so it does not depend on the worker
app or a live DB/LLM.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from glean_worker.tasks import summary_scheduler
from glean_worker.tasks.summary_scheduler import (
    parse_cron_hours,
    scheduled_daily_summaries,
)


def test_parse_cron_hours_basic():
    assert parse_cron_hours("6,12,18,22") == {6, 12, 18, 22}


def test_parse_cron_hours_empty():
    assert parse_cron_hours("") == set()


def test_parse_cron_hours_strips_whitespace():
    assert parse_cron_hours(" 7 , 9 ") == {7, 9}


def test_parse_cron_hours_excludes_out_of_range():
    assert parse_cron_hours("25") == set()
    assert parse_cron_hours("0,23,24,-1") == {0, 23}


def _outcome(status="queued", summary_id="s1"):
    return SimpleNamespace(
        status=status,
        summary_id=summary_id,
        source_set_hash="h",
        source_count=1,
    )


@pytest.mark.asyncio
async def test_scheduled_enqueues_for_each_user():
    svc = AsyncMock()
    svc.enqueue.return_value = _outcome()

    ctx = {"redis": AsyncMock()}

    with (
        patch(
            "glean_worker.tasks.summary_scheduler.get_session_context"
        ) as mock_ctx,
        patch(
            "glean_worker.tasks.summary_scheduler.AISummaryService",
            return_value=svc,
        ),
        patch(
            "glean_worker.tasks.summary_scheduler._ai_enabled_user_ids",
            new=AsyncMock(return_value=["u1", "u2"]),
        ),
        patch.object(summary_scheduler.settings, "llm_api_key", "k"),
    ):
        mock_ctx.return_value.__aenter__.return_value = AsyncMock()

        await scheduled_daily_summaries(ctx)

    assert ctx["redis"].enqueue_job.await_count == 2
    for call in ctx["redis"].enqueue_job.await_args_list:
        assert call.args[0] == "summarize_day_task"
        assert call.kwargs["summary_id"] == "s1"


@pytest.mark.asyncio
async def test_scheduled_no_op_without_api_key():
    ctx = {"redis": AsyncMock()}

    with (
        patch(
            "glean_worker.tasks.summary_scheduler.get_session_context"
        ) as mock_ctx,
        patch.object(summary_scheduler.settings, "llm_api_key", ""),
    ):
        await scheduled_daily_summaries(ctx)

    mock_ctx.assert_not_called()
    ctx["redis"].enqueue_job.assert_not_awaited()
