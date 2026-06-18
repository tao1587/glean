"""Unit tests for feed refresh enqueue helpers."""

from unittest.mock import AsyncMock, MagicMock, patch

from glean_api.feed_refresh import enqueue_feed_refresh_job
from glean_database.models.feed_fetch_run import FeedFetchRun


async def test_enqueue_feed_refresh_job_reuses_existing_active_run() -> None:
    session = AsyncMock()
    redis = AsyncMock()
    existing_run = FeedFetchRun(
        id="run-existing",
        feed_id="feed-1",
        job_id="job-existing",
        trigger_type="manual_user",
        status="queued",
        current_stage="queue_wait",
    )

    with patch(
        "glean_api.feed_refresh.find_reusable_active_feed_fetch_run",
        new=AsyncMock(return_value=existing_run),
    ):
        payload = await enqueue_feed_refresh_job(
            session=session,
            redis=redis,
            feed_id="feed-1",
            feed_title="Feed 1",
            trigger_type="manual_user",
        )

    assert payload == {
        "run_id": "run-existing",
        "feed_id": "feed-1",
        "job_id": "job-existing",
        "feed_title": "Feed 1",
    }
    redis.enqueue_job.assert_not_called()
    session.add.assert_not_called()


async def test_enqueue_feed_refresh_job_creates_new_run_when_no_active_run() -> None:
    session = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    redis = AsyncMock()
    run = FeedFetchRun(id="run-new", feed_id="feed-1", trigger_type="manual_user", status="queued")
    stage_event = MagicMock()

    async def enqueue_job_side_effect(*args, **kwargs):
        assert session.commit.await_count == 1
        assert kwargs["_job_id"] == "run-new"
        assert kwargs["run_id"] == "run-new"
        return MagicMock(job_id="run-new")

    redis.enqueue_job.side_effect = enqueue_job_side_effect

    with (
        patch(
            "glean_api.feed_refresh.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_api.feed_refresh.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
    ):
        payload = await enqueue_feed_refresh_job(
            session=session,
            redis=redis,
            feed_id="feed-1",
            feed_title="Feed 1",
            trigger_type="manual_user",
        )

    assert payload == {
        "run_id": "run-new",
        "feed_id": "feed-1",
        "job_id": "run-new",
        "feed_title": "Feed 1",
    }
    redis.enqueue_job.assert_awaited_once()
    assert run.job_id == "run-new"


async def test_enqueue_feed_refresh_job_marks_run_stale_when_enqueue_fails() -> None:
    session = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    redis = AsyncMock()
    redis.enqueue_job.side_effect = RuntimeError("redis down")
    run = FeedFetchRun(id="run-new", feed_id="feed-1", trigger_type="manual_user", status="queued")
    stage_event = MagicMock()

    with (
        patch(
            "glean_api.feed_refresh.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_api.feed_refresh.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
        patch("glean_api.feed_refresh.mark_active_run_as_stale", new=AsyncMock()) as mark_stale,
    ):
        try:
            await enqueue_feed_refresh_job(
                session=session,
                redis=redis,
                feed_id="feed-1",
                feed_title="Feed 1",
                trigger_type="manual_user",
            )
        except RuntimeError as exc:
            assert str(exc) == "redis down"
        else:
            raise AssertionError("enqueue_feed_refresh_job should re-raise enqueue failures")

    mark_stale.assert_awaited_once()
    assert session.commit.await_count == 1


async def test_enqueue_feed_refresh_job_requeues_when_active_run_is_stale() -> None:
    session = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id="run-fresh")
    run = FeedFetchRun(id="run-fresh", feed_id="feed-1", trigger_type="manual_user", status="queued")
    stage_event = MagicMock()

    with (
        patch(
            "glean_api.feed_refresh.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_api.feed_refresh.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
    ):
        payload = await enqueue_feed_refresh_job(
            session=session,
            redis=redis,
            feed_id="feed-1",
            feed_title="Feed 1",
            trigger_type="manual_user",
        )

    assert payload["run_id"] == "run-fresh"
    assert payload["job_id"] == "run-fresh"
    redis.enqueue_job.assert_awaited_once()
