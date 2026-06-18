"""Tests for scheduled feed refresh dedupe and interval behavior."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_database.models.feed import FeedStatus
from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_worker.config import Settings
from glean_worker.main import get_oss_cron_jobs
from glean_worker.tasks.feed_fetcher import (
    _midnight_guard_minutes,
    _should_queue_midnight_supplemental_feed,
    _should_run_midnight_supplement,
    fetch_all_feeds,
    scheduled_fetch,
)


@pytest.mark.asyncio
async def test_fetch_all_feeds_skips_feed_with_active_run():
    due_feed_one = MagicMock()
    due_feed_one.id = "feed-1"
    due_feed_two = MagicMock()
    due_feed_two.id = "feed-2"

    due_feeds_result = MagicMock()
    due_feeds_result.scalars.return_value.all.return_value = [due_feed_one, due_feed_two]

    active_run_result = MagicMock()
    active_run_result.scalar_one_or_none.return_value = FeedFetchRun(
        id="run-active",
        feed_id="feed-1",
        job_id="job-active",
        trigger_type="scheduled",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
    )

    no_active_run_result = MagicMock()
    no_active_run_result.scalar_one_or_none.return_value = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        side_effect=[due_feeds_result, active_run_result, no_active_run_result]
    )
    mock_session.add = MagicMock()

    run_two = FeedFetchRun(id="run-2", feed_id="feed-2", trigger_type="scheduled", status="queued")
    stage_two = MagicMock()
    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id=run_two.id)

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run_two, stage_two)),
        ) as mock_create_run,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(side_effect=[active_run_result.scalar_one_or_none.return_value, None]),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 1}
    mock_create_run.assert_awaited_once()
    redis.enqueue_job.assert_awaited_once()
    assert redis.enqueue_job.await_args.args[1] == "feed-2"


@pytest.mark.asyncio
async def test_fetch_all_feeds_requeues_feed_when_active_run_is_stale():
    due_feed = MagicMock()
    due_feed.id = "feed-1"

    due_feeds_result = MagicMock()
    due_feeds_result.scalars.return_value.all.return_value = [due_feed]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=due_feeds_result)
    mock_session.add = MagicMock()

    run = FeedFetchRun(id="run-new", feed_id="feed-1", trigger_type="scheduled", status="queued")
    stage_event = MagicMock()
    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id=run.id)

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 1}
    redis.enqueue_job.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_all_feeds_defers_only_rsshub_feeds_while_circuit_is_open():
    rsshub_feed = MagicMock()
    rsshub_feed.id = "feed-rsshub"
    rsshub_feed.url = "http://rsshub:1200/x/user/karpathy"
    rsshub_feed.source_type = "rsshub"
    rsshub_feed.next_fetch_at = None

    direct_feed = MagicMock()
    direct_feed.id = "feed-direct"
    direct_feed.url = "https://example.com/feed.xml"
    direct_feed.source_type = "feed"
    direct_feed.next_fetch_at = None

    due_feeds_result = MagicMock()
    due_feeds_result.scalars.return_value.all.return_value = [rsshub_feed, direct_feed]

    mock_session = AsyncMock()
    mock_session.execute.return_value = due_feeds_result
    mock_session.add = MagicMock()

    run = FeedFetchRun(id="run-direct", feed_id="feed-direct", trigger_type="scheduled", status="queued")
    stage_event = MagicMock()
    blocked_until = datetime.now(UTC) + timedelta(minutes=10)
    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id=run.id)

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ) as mock_create_run,
        patch(
            "glean_worker.tasks.feed_fetcher._get_rsshub_blocked_until",
            new=AsyncMock(return_value=blocked_until),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 1}
    assert rsshub_feed.next_fetch_at == blocked_until
    mock_create_run.assert_awaited_once()
    assert mock_create_run.await_args.kwargs["feed_id"] == "feed-direct"
    redis.enqueue_job.assert_awaited_once()


def test_worker_settings_default_to_twelve_hour_refresh_interval():
    settings = Settings()

    assert settings.feed_refresh_interval_minutes == 720


def test_worker_settings_allow_refresh_interval_override():
    settings = Settings(feed_refresh_interval_minutes=360)

    assert settings.feed_refresh_interval_minutes == 360


def test_get_oss_cron_jobs_uses_twelve_hour_feed_schedule():
    cron_jobs = get_oss_cron_jobs()

    feed_job = cron_jobs[0]

    assert feed_job.minute == 0
    assert feed_job.hour == {0, 12}


def test_midnight_guard_window_is_clamped_to_one_to_three_hours():
    assert _midnight_guard_minutes(120) == 60
    assert _midnight_guard_minutes(360) == 180
    assert _midnight_guard_minutes(1440) == 180


def test_midnight_supplement_skips_feed_attempted_within_guard_window():
    now = datetime(2026, 4, 6, 0, 0, tzinfo=UTC)
    feed = MagicMock()
    feed.status = FeedStatus.ACTIVE
    feed.last_fetch_success_at = datetime(2026, 4, 5, 12, 0, tzinfo=UTC)
    feed.last_fetch_attempt_at = now - timedelta(minutes=59)

    should_queue = _should_queue_midnight_supplemental_feed(
        feed,
        now_utc=now,
        day_start_utc=now,
        guard_minutes=60,
    )

    assert should_queue is False


def test_midnight_supplement_includes_feed_missing_success_since_day_start():
    now = datetime(2026, 4, 6, 0, 0, tzinfo=UTC)
    feed = MagicMock()
    feed.status = FeedStatus.ACTIVE
    feed.last_fetch_success_at = datetime(2026, 4, 5, 18, 0, tzinfo=UTC)
    feed.last_fetch_attempt_at = now - timedelta(hours=4)

    should_queue = _should_queue_midnight_supplemental_feed(
        feed,
        now_utc=now,
        day_start_utc=now,
        guard_minutes=180,
    )

    assert should_queue is True


def test_midnight_supplement_uses_configured_worker_timezone(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("glean_worker.tasks.feed_fetcher.settings.worker_timezone", "Asia/Shanghai")

    assert _should_run_midnight_supplement(datetime(2026, 4, 9, 16, 0, tzinfo=UTC)) is True
    assert _should_run_midnight_supplement(datetime(2026, 4, 9, 15, 0, tzinfo=UTC)) is False


def test_midnight_supplement_falls_back_to_utc_when_timezone_unavailable(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("glean_worker.tasks.feed_fetcher.settings.worker_timezone", "Mars/Olympus")

    assert _should_run_midnight_supplement(datetime(2026, 4, 10, 0, 0, tzinfo=UTC)) is True
    assert _should_run_midnight_supplement(datetime(2026, 4, 10, 1, 0, tzinfo=UTC)) is False


@pytest.mark.asyncio
async def test_fetch_all_feeds_midnight_supplement_queues_feed_without_success_today():
    midnight_feed = MagicMock()
    midnight_feed.id = "feed-midnight"
    midnight_feed.status = FeedStatus.ACTIVE
    midnight_feed.next_fetch_at = datetime(2026, 4, 6, 6, 0, tzinfo=UTC)
    midnight_feed.last_fetch_success_at = datetime(2026, 4, 5, 12, 0, tzinfo=UTC)
    midnight_feed.last_fetch_attempt_at = datetime(2026, 4, 5, 18, 0, tzinfo=UTC)

    active_result = MagicMock()
    active_result.scalars.return_value.all.return_value = [midnight_feed]

    mock_session = AsyncMock()
    mock_session.execute.return_value = active_result
    mock_session.add = MagicMock()

    run = FeedFetchRun(
        id="run-midnight",
        feed_id="feed-midnight",
        trigger_type="scheduled_midnight",
        status="queued",
    )
    stage_event = MagicMock()
    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id=run.id)

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_all_feeds(
            {"redis": redis},
            now_utc=datetime(2026, 4, 6, 0, 0, tzinfo=UTC),
            include_midnight_supplement=True,
            trigger_type="scheduled_midnight",
        )

    assert result == {"feeds_queued": 1}
    assert redis.enqueue_job.await_args.kwargs["trigger_type"] == "scheduled_midnight"


@pytest.mark.asyncio
async def test_scheduled_fetch_enables_midnight_supplement_only_at_midnight():
    with (
        patch(
            "glean_worker.tasks.feed_fetcher.fetch_all_feeds",
            new=AsyncMock(return_value={"feeds_queued": 0}),
        ) as mock_fetch,
        patch(
            "glean_worker.tasks.feed_fetcher._should_run_midnight_supplement",
            return_value=True,
        ),
    ):
        await scheduled_fetch({})

    assert mock_fetch.await_count == 1
    assert mock_fetch.await_args.kwargs["include_midnight_supplement"] is True
    assert mock_fetch.await_args.kwargs["trigger_type"] == "scheduled_midnight"
