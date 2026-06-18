"""Tests for persisted feed fetch progress helpers."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent
from glean_worker.tasks.feed_fetch_progress import (
    FEED_FETCH_STAGE_SEQUENCE,
    advance_feed_fetch_stage,
    classify_feed_fetch_path_kind,
    estimate_run_duration,
    finalize_feed_fetch_run,
    get_profile_key_for_path,
    start_feed_fetch_run,
    trim_feed_fetch_run_history,
)


def _build_queued_run() -> FeedFetchRun:
    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
    )
    FeedFetchStageEvent(
        run=run,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )
    return run


@pytest.mark.asyncio
async def test_run_lifecycle_records_stage_sequence():
    session = MagicMock()
    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = [run := _build_queued_run()]
    session.execute = AsyncMock(return_value=execute_result)
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    active_stage = await start_feed_fetch_run(session, run)
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "fetch_xml",
        summary="resolved attempt URLs",
        metrics_json={"attempt_url_count": 2},
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "parse_feed",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "process_entries",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "backfill_content",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "store_results",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "complete",
        summary="stored feed results",
        metrics_json={"new_entries": 2},
    )
    await finalize_feed_fetch_run(
        session,
        run,
        active_stage,
        run_status="success",
        summary_json={
            "new_entries": 2,
            "total_entries": 3,
            "summary_only_count": 1,
            "backfill_attempted_count": 1,
            "backfill_success_http_count": 1,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": False,
            "used_url": "https://example.com/feed.xml",
            "retry_minutes": None,
        },
    )

    assert [stage.stage_name for stage in run.stage_events] == FEED_FETCH_STAGE_SEQUENCE
    assert run.stage_events[0].status == "success"
    assert run.stage_events[-1].status == "success"
    assert run.status == "success"
    assert run.current_stage == "complete"
    assert run.started_at is not None
    assert run.finished_at is not None


@pytest.mark.asyncio
async def test_start_feed_fetch_run_resets_completed_retry_lifecycle():
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    run = _build_queued_run()
    run.status = "error"
    run.current_stage = "complete"
    run.finished_at = datetime.now(UTC)
    run.summary_json = {"retry_minutes": 15}
    run.error_message = "network timeout"

    active_stage = await start_feed_fetch_run(session, run)

    assert active_stage is not None
    assert run.status == "in_progress"
    assert run.current_stage == "resolve_attempt_urls"
    assert run.finished_at is None
    assert run.summary_json is None
    assert run.error_message is None
    assert [stage.stage_name for stage in run.stage_events] == [
        "queue_wait",
        "resolve_attempt_urls",
    ]
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_advance_feed_fetch_stage_commits_progress_for_visibility():
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    run = _build_queued_run()

    with patch(
        "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
        new=AsyncMock(return_value=None),
    ):
        active_stage = await start_feed_fetch_run(session, run)
        session.commit.reset_mock()
        next_stage = await advance_feed_fetch_stage(
            session,
            run,
            active_stage,
            "fetch_xml",
            summary="Resolved candidate feed URLs.",
            metrics_json={"attempt_url_count": 1},
        )

    assert next_stage is not None
    assert next_stage.stage_name == "fetch_xml"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_start_feed_fetch_run_for_persisted_run_does_not_touch_relationship_loader():
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
    )
    queue_stage = FeedFetchStageEvent(
        id="stage-1",
        run_id="run-1",
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )

    with (
        patch(
            "glean_worker.tasks.feed_fetch_progress._should_use_explicit_stage_event_io",
            return_value=True,
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress._load_stage_events_for_run",
            new=AsyncMock(return_value=[queue_stage]),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
        patch.object(
            FeedFetchRun,
            "stage_events",
            new=property(
                lambda self: (_ for _ in ()).throw(
                    AssertionError("stage_events relationship should not be accessed")
                )
            ),
        ),
    ):
        active_stage = await start_feed_fetch_run(session, run)

    assert active_stage is not None
    assert active_stage.stage_name == "resolve_attempt_urls"
    assert run.status == "in_progress"


@pytest.mark.asyncio
async def test_start_feed_fetch_run_clears_deleted_stage_relationship_for_persisted_retry():
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()

    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="error",
        current_stage="complete",
        queue_entered_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
    )
    old_complete_stage = FeedFetchStageEvent(
        id="stage-old",
        run=run,
        stage_order=0,
        stage_name="complete",
        status="error",
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
    )

    with (
        patch(
            "glean_worker.tasks.feed_fetch_progress._should_use_explicit_stage_event_io",
            return_value=True,
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress._load_stage_events_for_run",
            new=AsyncMock(return_value=[old_complete_stage]),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
    ):
        active_stage = await start_feed_fetch_run(session, run)

    assert active_stage is not None
    assert active_stage.stage_name == "resolve_attempt_urls"
    assert old_complete_stage not in run.stage_events
    session.delete.assert_awaited_once_with(old_complete_stage)
    assert [call.args[0].stage_name for call in session.add.call_args_list if hasattr(call.args[0], "stage_name")] == [
        "queue_wait",
        "resolve_attempt_urls",
    ]


@pytest.mark.asyncio
async def test_finalize_feed_fetch_run_rebinds_stale_active_stage_after_rollback():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="in_progress",
        current_stage="resolve_attempt_urls",
        started_at=datetime.now(UTC),
    )
    stale_active_stage = FeedFetchStageEvent(
        id="stage-stale",
        run_id="run-1",
        stage_order=1,
        stage_name="resolve_attempt_urls",
        status="running",
        started_at=datetime.now(UTC),
    )
    live_active_stage = FeedFetchStageEvent(
        id="stage-live",
        run_id="run-1",
        stage_order=1,
        stage_name="resolve_attempt_urls",
        status="running",
        started_at=datetime.now(UTC),
    )

    with (
        patch(
            "glean_worker.tasks.feed_fetch_progress._load_stage_events_for_run",
            new=AsyncMock(return_value=[live_active_stage]),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        completion_stage = await finalize_feed_fetch_run(
            session,
            run,
            stale_active_stage,
            run_status="error",
            summary_json={"retry_minutes": 15},
            error_message="network timeout",
            active_stage_status="error",
            active_stage_summary="Worker stage failed and the run will be retried.",
            completion_summary="Feed fetch failed and was scheduled for retry.",
            skipped_stage_summary="Skipped after the worker stage failed.",
        )

    assert completion_stage is not None
    assert live_active_stage.status == "error"
    assert live_active_stage.finished_at is not None
    assert live_active_stage.summary == "Worker stage failed and the run will be retried."
    assert stale_active_stage.finished_at is None
    assert [call.args[0].stage_name for call in session.add.call_args_list if hasattr(call.args[0], "stage_name")] == [
        "resolve_attempt_urls",
        "fetch_xml",
        "parse_feed",
        "process_entries",
        "backfill_content",
        "store_results",
        "complete",
    ]
    assert run.status == "error"
    assert run.current_stage == "complete"
    assert run.error_message == "network timeout"


@pytest.mark.asyncio
async def test_finalize_feed_fetch_run_uses_live_open_stage_without_touching_stale_stage_name():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="in_progress",
        current_stage="resolve_attempt_urls",
        started_at=datetime.now(UTC),
    )
    live_active_stage = FeedFetchStageEvent(
        id="stage-live",
        run_id="run-1",
        stage_order=1,
        stage_name="resolve_attempt_urls",
        status="running",
        started_at=datetime.now(UTC),
    )

    class StaleActiveStage:
        id = "stage-stale"
        finished_at = None

        @property
        def stage_name(self):
            raise AssertionError("stale active stage name should not be accessed after rollback")

    with (
        patch(
            "glean_worker.tasks.feed_fetch_progress._load_stage_events_for_run",
            new=AsyncMock(return_value=[live_active_stage]),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        completion_stage = await finalize_feed_fetch_run(
            session,
            run,
            StaleActiveStage(),
            run_status="error",
            summary_json={"retry_minutes": 15},
            error_message="network timeout",
            active_stage_status="error",
            active_stage_summary="Worker stage failed and the run will be retried.",
            completion_summary="Feed fetch failed and was scheduled for retry.",
            skipped_stage_summary="Skipped after the worker stage failed.",
        )

    assert completion_stage is not None
    assert live_active_stage.status == "error"
    assert live_active_stage.finished_at is not None
    assert run.status == "error"
    assert run.current_stage == "complete"


@pytest.mark.asyncio
async def test_finalize_feed_fetch_run_rebuilds_fallback_stage_after_rollback():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        trigger_type="manual_user",
        status="error",
        current_stage="complete",
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
    )
    old_complete_stage = FeedFetchStageEvent(
        id="stage-complete-old",
        run_id="run-1",
        stage_order=0,
        stage_name="complete",
        status="error",
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
    )

    class DeletedActiveStage:
        finished_at = None
        id = None

        @property
        def stage_name(self):
            raise AssertionError("deleted active stage should not be reused")

    clear_stage_events = AsyncMock(return_value=[])

    with (
        patch(
            "glean_worker.tasks.feed_fetch_progress._load_stage_events_for_run",
            new=AsyncMock(return_value=[old_complete_stage]),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress._clear_stage_events_for_run",
            new=clear_stage_events,
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        completion_stage = await finalize_feed_fetch_run(
            session,
            run,
            DeletedActiveStage(),
            run_status="error",
            summary_json={"retry_minutes": 2},
            error_message="rsshub_temporarily_unavailable",
            active_stage_status="error",
            active_stage_summary="RSSHub was temporarily unavailable during fetch.",
            completion_summary="Feed fetch was deferred until RSSHub recovers.",
            completion_metrics_json={"retry_minutes": 2},
            skipped_stage_summary="Skipped while waiting for RSSHub to recover.",
            fallback_active_stage_name="resolve_attempt_urls",
        )

    clear_stage_events.assert_awaited_once()
    assert completion_stage is not None
    assert completion_stage.stage_name == "complete"
    assert run.status == "error"
    assert run.current_stage == "complete"
    assert run.finished_at is not None
    assert [call.args[0].stage_name for call in session.add.call_args_list if hasattr(call.args[0], "stage_name")] == [
        "resolve_attempt_urls",
        "fetch_xml",
        "parse_feed",
        "process_entries",
        "backfill_content",
        "store_results",
        "complete",
    ]


def test_path_classification_and_profile_key():
    fallback_url = "https://rsshub.example.com/github/release/openai/openai-python"

    assert (
        classify_feed_fetch_path_kind(
            feed_url="https://example.com/feed.xml",
            used_url="https://example.com/feed.xml",
            fallback_urls=[fallback_url],
        )
        == "direct_feed"
    )
    assert get_profile_key_for_path("direct_feed", "https://example.com/feed.xml") == "direct:example.com"

    assert (
        classify_feed_fetch_path_kind(
            feed_url="https://example.com/feed.xml",
            used_url=fallback_url,
            fallback_urls=[fallback_url],
        )
        == "rsshub_fallback"
    )
    assert (
        get_profile_key_for_path("rsshub_fallback", fallback_url)
        == "rsshub_fallback:github_release"
    )

    assert (
        classify_feed_fetch_path_kind(
            feed_url=fallback_url,
            used_url=fallback_url,
            fallback_urls=[],
        )
        == "rsshub_primary"
    )
    assert (
        get_profile_key_for_path("rsshub_primary", fallback_url)
        == "rsshub_primary:github_release"
    )


def test_eta_prefers_feed_history_then_profile_history_then_global_defaults():
    feed_runs = [
        FeedFetchRun(
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 12, 0, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 12, 2, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 12, 10, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 12, 13, tzinfo=UTC),
        ),
    ]
    profile_runs = [
        FeedFetchRun(
            feed_id="feed-x",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 0, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 8, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-y",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 10, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 18, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-z",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 20, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 28, tzinfo=UTC),
        ),
    ]

    estimate = estimate_run_duration(
        path_kind="rsshub_primary",
        feed_runs=feed_runs,
        profile_runs=profile_runs,
    )
    assert estimate["source"] == "profile"
    assert estimate["path_kind"] == "rsshub_primary"
    assert estimate["predicted_run_duration"].total_seconds() == 8 * 60

    estimate = estimate_run_duration(
        path_kind="rsshub_primary",
        feed_runs=feed_runs + [profile_runs[0]],
        profile_runs=profile_runs,
    )
    assert estimate["source"] == "feed"

    estimate = estimate_run_duration(path_kind="direct_feed", feed_runs=[], profile_runs=[])
    assert estimate["source"] == "global"


@pytest.mark.asyncio
async def test_trim_feed_fetch_run_history_keeps_latest_ten():
    session = MagicMock(spec=AsyncSession)
    session.delete = AsyncMock()
    recent_runs = [
        FeedFetchRun(
            id=f"run-{index}",
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
        )
        for index in range(12)
    ]
    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = recent_runs
    session.execute.return_value = execute_result

    await trim_feed_fetch_run_history(session, "feed-1", keep_last=10)

    deleted_ids = [call.args[0].id for call in session.delete.await_args_list]
    assert deleted_ids == ["run-10", "run-11"]
