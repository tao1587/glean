"""Tests for feed fetcher worker tasks."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from arq import Retry

from glean_database.models.feed import FeedStatus
from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent
from glean_worker.tasks.feed_fetcher import (
    ENTRY_TITLE_MAX_LENGTH,
    _truncate_entry_field,
    fetch_all_feeds,
    fetch_feed_task,
)


class TestTruncateEntryField:
    """Guards against StringDataRightTruncationError from over-long feed values."""

    def test_returns_none_unchanged(self):
        assert _truncate_entry_field(None, ENTRY_TITLE_MAX_LENGTH) is None

    def test_short_value_unchanged(self):
        assert _truncate_entry_field("hello", ENTRY_TITLE_MAX_LENGTH) == "hello"

    def test_over_long_value_truncated_to_limit(self):
        value = "x" * (ENTRY_TITLE_MAX_LENGTH + 50)
        result = _truncate_entry_field(value, ENTRY_TITLE_MAX_LENGTH)
        assert result is not None
        assert len(result) == ENTRY_TITLE_MAX_LENGTH

    def test_exact_length_unchanged(self):
        value = "y" * ENTRY_TITLE_MAX_LENGTH
        assert _truncate_entry_field(value, ENTRY_TITLE_MAX_LENGTH) == value


class TestFetchFeedTask:
    """Test fetch_feed_task worker function."""

    @staticmethod
    def _build_progress_run() -> FeedFetchRun:
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
    async def test_not_modified_clears_previous_error_state(self):
        """304 response should clear prior error status and message."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = "old-etag"
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ERROR
        mock_feed.error_count = 3
        mock_feed.fetch_error_message = "Failed to fetch feed: timeout"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result == {"status": "not_modified", "new_entries": 0}
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.error_count == 0
        assert mock_feed.fetch_error_message is None
        assert mock_feed.last_fetch_attempt_at is not None
        assert mock_feed.last_fetch_success_at is not None
        assert mock_feed.last_fetched_at is not None

    @pytest.mark.asyncio
    async def test_duplicate_guid_in_single_feed_payload_is_skipped(self):
        """Duplicate guid in one fetch run should be skipped instead of failing."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.source_type = "feed"
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        duplicate_guid = "https://huggingface.co/blog/transformersjs-v4"
        entry_1 = MagicMock()
        entry_1.guid = duplicate_guid
        entry_1.url = duplicate_guid
        entry_1.title = "Transformers.js v4 Preview"
        entry_1.author = None
        entry_1.content = "<p>content</p>"
        entry_1.summary = None
        entry_1.published_at = None
        entry_1.has_full_content = True

        entry_2 = MagicMock()
        entry_2.guid = duplicate_guid
        entry_2.url = duplicate_guid
        entry_2.title = "Transformers.js v4 Preview (dup)"
        entry_2.author = None
        entry_2.content = "<p>content dup</p>"
        entry_2.summary = None
        entry_2.published_at = None
        entry_2.has_full_content = True

        parsed_feed = MagicMock()
        parsed_feed.title = "Hugging Face Blog"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://huggingface.co/blog"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry_1, entry_2]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        # 1x select feed + 1x insert (duplicate payload row skipped before DB write)
        assert mock_session.execute.await_count == 2


class TestSyntheticFeedRefresh:
    """Synthetic feeds re-synthesize (not fetch) on each worker refresh."""

    @pytest.mark.asyncio
    async def test_synthetic_jsonld_feed_uses_fetch_or_synthesize(self):
        mock_feed = MagicMock()
        mock_feed.id = "feed-syn"
        mock_feed.url = "https://example.com/"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.source_type = "synthetic_jsonld"
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        fetch_feed_mock = AsyncMock(return_value=None)
        fetch_or_synth_mock = AsyncMock(return_value=None)  # returns None -> "not_modified" path

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=fetch_feed_mock),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_or_synthesize_feed",
                new=fetch_or_synth_mock,
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            await fetch_feed_task({}, feed_id="feed-syn")

        fetch_or_synth_mock.assert_awaited_once()
        args = fetch_or_synth_mock.await_args
        assert args.args[0] == "https://example.com/"
        assert args.args[1] == "synthetic_jsonld"
        assert fetch_feed_mock.await_count == 0


@pytest.mark.asyncio
async def test_fetch_all_feeds_creates_scheduled_runs_with_queue_depth():
    due_feed_one = MagicMock()
    due_feed_one.id = "feed-1"
    due_feed_one.url = "https://example.com/feed-1.xml"
    due_feed_two = MagicMock()
    due_feed_two.id = "feed-2"
    due_feed_two.url = "https://example.com/feed-2.xml"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [due_feed_one, due_feed_two]

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.commit = AsyncMock()

    redis = AsyncMock()
    observed_commit_counts: list[int] = []

    async def enqueue_job_side_effect(*args, **kwargs):
        observed_commit_counts.append(mock_session.commit.await_count)
        return MagicMock(job_id=kwargs["_job_id"])

    redis.enqueue_job.side_effect = enqueue_job_side_effect

    run_one = FeedFetchRun(id="run-1", feed_id="feed-1", trigger_type="scheduled", status="queued")
    run_two = FeedFetchRun(id="run-2", feed_id="feed-2", trigger_type="scheduled", status="queued")
    stage_one = FeedFetchStageEvent(
        run=run_one,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )
    stage_two = FeedFetchStageEvent(
        run=run_two,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(side_effect=[(run_one, stage_one), (run_two, stage_two)]),
        ) as mock_create_run,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(side_effect=[None, None]),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 2}
    assert mock_create_run.await_args_list[0].kwargs["queue_depth_ahead"] == 0
    assert mock_create_run.await_args_list[1].kwargs["queue_depth_ahead"] == 1
    assert redis.enqueue_job.await_args_list[0].kwargs["run_id"] == "run-1"
    assert redis.enqueue_job.await_args_list[1].kwargs["run_id"] == "run-2"
    assert redis.enqueue_job.await_args_list[0].kwargs["_job_id"] == "run-1"
    assert redis.enqueue_job.await_args_list[1].kwargs["_job_id"] == "run-2"
    assert run_one.job_id == "run-1"
    assert run_two.job_id == "run-2"
    assert observed_commit_counts == [1, 3]


@pytest.mark.asyncio
async def test_fetch_all_feeds_finalizes_run_when_enqueue_fails():
    due_feed = MagicMock()
    due_feed.id = "feed-1"
    due_feed.url = "https://example.com/feed-1.xml"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [due_feed]

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()

    redis = AsyncMock()
    redis.enqueue_job.side_effect = RuntimeError("redis down")

    run = FeedFetchRun(id="run-1", feed_id="feed-1", trigger_type="scheduled", status="queued")
    stage = FeedFetchStageEvent(
        run=run,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage)),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.finalize_feed_fetch_run",
            new=AsyncMock(),
        ) as finalize_run,
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 0}
    finalize_run.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_run_id_reuses_active_queued_run():
    """Jobs without run_id should still bind to the newest active queued run."""
    progress_run = TestFetchFeedTask._build_progress_run()
    progress_run.job_id = "job-1"

    mock_feed = MagicMock()
    mock_feed.id = "feed-1"
    mock_feed.url = "https://example.com/feed.xml"
    mock_feed.site_url = None
    mock_feed.etag = "etag-1"
    mock_feed.last_modified = None
    mock_feed.status = FeedStatus.ERROR
    mock_feed.error_count = 4
    mock_feed.fetch_error_message = "old error"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_feed

    mock_progress_result = MagicMock()
    mock_progress_result.scalar_one_or_none.return_value = progress_run

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_progress_result, mock_result])

    mock_rsshub_service = MagicMock()
    mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
        patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        patch(
            "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=progress_run),
        ) as mock_find_active_run,
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_feed_task({"job_id": "job-1"}, feed_id="feed-1")

    assert result == {"status": "not_modified", "new_entries": 0}
    mock_find_active_run.assert_not_awaited()
    assert progress_run.status == "not_modified"
    assert progress_run.current_stage == "complete"
    assert progress_run.path_kind == "direct_feed"


@pytest.mark.asyncio
async def test_missing_run_id_and_job_id_falls_back_to_active_run_by_feed():
    """Legacy jobs without run metadata should still update the newest active run."""
    progress_run = TestFetchFeedTask._build_progress_run()

    mock_feed = MagicMock()
    mock_feed.id = "feed-1"
    mock_feed.url = "https://example.com/feed.xml"
    mock_feed.site_url = None
    mock_feed.etag = "etag-1"
    mock_feed.last_modified = None
    mock_feed.status = FeedStatus.ERROR
    mock_feed.error_count = 4
    mock_feed.fetch_error_message = "old error"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_feed

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_rsshub_service = MagicMock()
    mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
        patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        patch(
            "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=progress_run),
        ) as mock_find_active_run,
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_feed_task({}, feed_id="feed-1")

    assert result == {"status": "not_modified", "new_entries": 0}
    mock_find_active_run.assert_awaited_once_with(mock_session, "feed-1")
    assert progress_run.status == "not_modified"
    assert progress_run.current_stage == "complete"
    assert progress_run.path_kind == "direct_feed"


class TestFetchFeedTaskProgress:
    """Additional feed fetch progress coverage."""

    _build_progress_run = staticmethod(TestFetchFeedTask._build_progress_run)

    @pytest.mark.asyncio
    async def test_short_content_field_queues_background_backfill_for_new_entry(self):
        """Summary-only entries should be stored immediately and backfilled asynchronously."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.source_type = "feed"
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://openai.com/index/conde-nast/"
        entry.title = "OpenAI partners with Condé Nast"
        entry.author = None
        entry.content = "<p>We’re enhancing AI-driven news discovery and delivery.</p>"
        entry.summary = "We’re enhancing AI-driven news discovery and delivery."
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "OpenAI News"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://openai.com/news/"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({"redis": mock_redis}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        mock_redis.enqueue_job.assert_any_await(
            "backfill_entry_content_task", "entry-1", force=False
        )

    @pytest.mark.asyncio
    async def test_rsshub_summary_only_entry_skips_content_backfill_for_new_entry(self):
        """RSSHub entries should not enqueue full-text extraction for summary-only content."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "http://192.168.31.19:46169/twitter/user/openai"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None
        mock_feed.source_type = "rsshub"

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://x.com/openai/status/1"
        entry.title = "OpenAI on X"
        entry.author = None
        entry.content = "<p>short social update</p>"
        entry.summary = "short social update"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "OpenAI on X"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://x.com/openai"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({"redis": mock_redis}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        mock_redis.enqueue_job.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_rsshub_route_url_with_feed_source_type_still_queues_backfill(self):
        """RSSHub-looking URLs only skip backfill when the stored feed source type is rsshub."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "http://192.168.31.19:46169/twitter/user/openai"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None
        mock_feed.source_type = "feed"

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://x.com/openai/status/1"
        entry.title = "OpenAI on X"
        entry.author = None
        entry.content = "<p>short social update</p>"
        entry.summary = "short social update"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "OpenAI on X"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://x.com/openai"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({"redis": mock_redis}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        mock_redis.enqueue_job.assert_any_await(
            "backfill_entry_content_task", "entry-1", force=False
        )

    @pytest.mark.asyncio
    async def test_summary_only_entry_without_redis_skips_sync_extraction(self):
        """The main fetch path should not block on extraction even without a Redis client."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None
        mock_feed.source_type = "rsshub"

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>short</p>"
        entry.summary = "short"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_manual_refresh_enqueues_backfill_for_existing_summary_only_entry(self):
        """Manual refresh should enqueue content backfill for duplicate teaser-only entries."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>short</p>"
        entry.summary = "short"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        existing_entry = MagicMock()
        existing_entry.id = "existing-entry-1"
        existing_entry.content = "<p>short</p>"
        existing_entry.summary = "short"
        existing_entry.content_source = "feed_summary_only"
        existing_entry.content_backfill_status = "failed"

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = None

        mock_existing_result = MagicMock()
        mock_existing_result.scalars.return_value.all.return_value = [existing_entry]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[mock_feed_result, mock_insert_result, mock_existing_result]
        )

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task(
                {"redis": mock_redis}, feed_id="feed-1", backfill_existing_entries=True
            )

        assert result["status"] == "success"
        assert result["new_entries"] == 0
        mock_redis.enqueue_job.assert_awaited_once_with(
            "backfill_entry_content_task", "existing-entry-1", force=False
        )

    @pytest.mark.asyncio
    async def test_manual_refresh_skips_backfill_for_existing_rsshub_summary_only_entry(self):
        """RSSHub manual refresh should not backfill duplicate teaser-only entries."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "http://192.168.31.19:46169/twitter/user/openai"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None
        mock_feed.source_type = "rsshub"

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://x.com/openai/status/1"
        entry.title = "OpenAI on X"
        entry.author = None
        entry.content = "<p>short social update</p>"
        entry.summary = "short social update"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "OpenAI on X"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://x.com/openai"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task(
                {"redis": mock_redis}, feed_id="feed-1", backfill_existing_entries=True
            )

        assert result["status"] == "success"
        assert result["new_entries"] == 0
        mock_redis.enqueue_job.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_manual_refresh_tolerates_duplicate_existing_guid_rows(self):
        """Manual refresh should not fail when historical duplicate rows already exist."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>short</p>"
        entry.summary = "short"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = None

        existing_entry_needs_backfill = MagicMock()
        existing_entry_needs_backfill.id = "existing-entry-1"
        existing_entry_needs_backfill.content = "<p>short</p>"
        existing_entry_needs_backfill.summary = "short"
        existing_entry_needs_backfill.content_source = "feed_summary_only"
        existing_entry_needs_backfill.content_backfill_status = "failed"

        existing_entry_complete = MagicMock()
        existing_entry_complete.id = "existing-entry-2"
        existing_entry_complete.content = "<p>" + ("full content " * 50) + "</p>"
        existing_entry_complete.summary = "short summary"
        existing_entry_complete.content_source = "article_html"
        existing_entry_complete.content_backfill_status = "success"

        mock_existing_result = MagicMock()
        mock_existing_result.scalars.return_value.all.return_value = [
            existing_entry_complete,
            existing_entry_needs_backfill,
        ]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[mock_feed_result, mock_insert_result, mock_existing_result]
        )

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task(
                {"redis": mock_redis}, feed_id="feed-1", backfill_existing_entries=True
            )

        assert result["status"] == "success"
        assert result["new_entries"] == 0
        mock_redis.enqueue_job.assert_awaited_once_with(
            "backfill_entry_content_task", "existing-entry-1", force=False
        )

    @pytest.mark.asyncio
    async def test_success_log_is_feed_level_summary(self):
        """Successful fetch logs should be a single feed-level summary message."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>full</p>"
        entry.summary = None
        entry.published_at = None
        entry.has_full_content = True

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch("glean_worker.tasks.feed_fetcher.logger.info") as mock_info,
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            await fetch_feed_task({}, feed_id="feed-1")

        mock_info.assert_any_call(
            "Feed fetch complete: "
            "feed_id=feed-1 url=https://example.com/feed.xml "
            "status=success new_entries=1 total_entries=1"
        )

    @pytest.mark.asyncio
    async def test_top_level_duplicate_guid_error_does_not_increment_error_count(self):
        """Duplicate guid at task boundary should be treated as non-fatal."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 4
        mock_feed.fetch_error_message = "previous"
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        duplicate_error = Exception('duplicate key value violates unique constraint "uq_feed_guid"')
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, duplicate_error, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = ""
        parsed_feed.language = None
        parsed_feed.icon_url = None
        parsed_feed.entries = [
            MagicMock(
                guid="dup",
                url="u",
                title="t",
                author=None,
                content="",
                summary=None,
                published_at=None,
                has_full_content=True,
            )
        ]

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert mock_feed.error_count == 0
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.fetch_error_message is None
        assert mock_session.commit.await_count >= 2

    @pytest.mark.asyncio
    async def test_index_corruption_error_keeps_feed_active_without_retry(self):
        """Index corruption should not disable feed or trigger Retry storm."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 6
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        corrupted_error = Exception('IndexCorruptedError: ... in index "ix_entries_url"')
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, corrupted_error, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = ""
        parsed_feed.language = None
        parsed_feed.icon_url = None
        parsed_feed.entries = [
            MagicMock(
                guid="a",
                url="u",
                title="t",
                author=None,
                content="",
                summary=None,
                published_at=None,
                has_full_content=True,
            )
        ]

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result == {"status": "error", "message": "database_index_corrupted"}
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.error_count == 0
        assert "ix_entries_url is corrupted" in mock_feed.fetch_error_message
        assert mock_session.commit.await_count >= 2

    @pytest.mark.asyncio
    async def test_rsshub_infrastructure_error_opens_short_retry_without_incrementing_feed_failure(
        self,
    ):
        """RSSHub outages should defer retries without counting against the feed."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "http://rsshub:1200/x/user/karpathy"
        mock_feed.site_url = "https://x.com/karpathy"
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 4
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.source_type = "rsshub"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        blocked_until = datetime.now(UTC) + timedelta(minutes=5)

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(
                    side_effect=ValueError(
                        "Failed to fetch feed: ConnectError('[Errno -5] No address associated with hostname')"
                    )
                ),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._open_rsshub_circuit",
                new=AsyncMock(return_value=blocked_until),
            ) as mock_open_circuit,
            patch(
                "glean_worker.tasks.feed_fetcher._probe_rsshub_health",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            with pytest.raises(Retry) as excinfo:
                await fetch_feed_task({"redis": AsyncMock()}, feed_id="feed-1", run_id="run-1")

        mock_open_circuit.assert_awaited_once()
        assert mock_feed.error_count == 4
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.next_fetch_at == blocked_until
        assert "RSSHub is temporarily unavailable" in mock_feed.fetch_error_message
        assert progress_run.error_message == "rsshub_temporarily_unavailable"
        assert progress_run.summary_json["retry_minutes"] == 5
        assert excinfo.value.defer_score == int(timedelta(minutes=5).total_seconds() * 1000)

    @pytest.mark.asyncio
    async def test_rsshub_infrastructure_error_does_not_read_stale_run_path_kind_after_rollback(
        self,
    ):
        """Rollback-expired runs must be rebound before RSSHub error finalization."""

        class ExplodingPathKindRun:
            def __init__(self):
                self.id = "run-1"
                self.feed_id = "feed-1"
                self.profile_key = None
                self.assigned_path_kind = None

            @property
            def path_kind(self):
                raise AssertionError("path_kind should not be read after rollback")

            @path_kind.setter
            def path_kind(self, value):
                self.assigned_path_kind = value

        stale_run = ExplodingPathKindRun()
        live_run = FeedFetchRun(
            id="run-1",
            feed_id="feed-1",
            trigger_type="manual_user",
            status="in_progress",
            current_stage="resolve_attempt_urls",
            started_at=datetime.now(UTC),
        )

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "http://rsshub:1200/anthropic/research"
        mock_feed.site_url = "https://www.anthropic.com/research"
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 2
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        blocked_until = datetime.now(UTC) + timedelta(minutes=5)

        async def _finalize_side_effect(_session, run, _active_stage, **_kwargs):
            assert run is live_run
            assert run.started_at is not None
            return None

        finalize_run = AsyncMock(side_effect=_finalize_side_effect)

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher._load_persisted_run_for_job",
                new=AsyncMock(side_effect=[stale_run, live_run]),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.start_feed_fetch_run",
                new=AsyncMock(return_value=MagicMock(stage_name="resolve_attempt_urls")),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.advance_feed_fetch_stage",
                new=AsyncMock(return_value=MagicMock(stage_name="fetch_xml")),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=ValueError("Failed to fetch feed: ReadTimeout('')")),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._open_rsshub_circuit",
                new=AsyncMock(return_value=blocked_until),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_rsshub_infrastructure_error",
                return_value=True,
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._probe_rsshub_health",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.finalize_feed_fetch_run",
                new=finalize_run,
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            with pytest.raises(Retry):
                await fetch_feed_task({"redis": AsyncMock()}, feed_id="feed-1", run_id="run-1")

        assert stale_run.assigned_path_kind is None
        assert live_run.path_kind == "rsshub_primary"
        finalize_run.assert_awaited_once()
        assert finalize_run.await_args.kwargs["fallback_active_stage_name"] == "fetch_xml"

    @pytest.mark.asyncio
    async def test_cancelled_feed_logs_timeout_summary(self):
        """Cancelled feed fetches should emit a concise timeout summary."""
        mock_session = AsyncMock()
        mock_session.execute.side_effect = asyncio.CancelledError()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.logger.error") as mock_error,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            with pytest.raises(asyncio.CancelledError):
                await fetch_feed_task({}, feed_id="feed-timeout")

        mock_error.assert_called_once()
        assert "Feed fetch timed out: feed_id=feed-timeout" in mock_error.call_args.args[0]

    @pytest.mark.asyncio
    async def test_run_id_success_records_stage_transitions_and_summary(self):
        """Persisted runs should track worker stages, path kind, and summary counters."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = "https://example.com"
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry_full = MagicMock()
        entry_full.guid = "entry-1"
        entry_full.url = "https://example.com/posts/1"
        entry_full.title = "Entry 1"
        entry_full.author = None
        entry_full.content = "<p>full</p>"
        entry_full.summary = None
        entry_full.published_at = None
        entry_full.has_full_content = True

        entry_summary = MagicMock()
        entry_summary.guid = "entry-2"
        entry_summary.url = "https://example.com/posts/2"
        entry_summary.title = "Entry 2"
        entry_summary.author = None
        entry_summary.content = "<p>short</p>"
        entry_summary.summary = "short"
        entry_summary.published_at = None
        entry_summary.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry_full, entry_summary]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result_1 = MagicMock()
        mock_insert_result_1.scalar_one_or_none.return_value = "entry-1"

        mock_insert_result_2 = MagicMock()
        mock_insert_result_2.scalar_one_or_none.return_value = "entry-2"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[mock_feed_result, mock_insert_result_1, mock_insert_result_2]
        )

        fallback_url = "https://rsshub.example.com/github/release/openai/openai-python"
        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[fallback_url])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=[RuntimeError("primary failed"), ("<xml />", {})]),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.parse_feed",
                new=AsyncMock(return_value=parsed_feed),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher._is_vectorization_enabled",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            mock_redis = AsyncMock()
            result = await fetch_feed_task(
                {"redis": mock_redis}, feed_id="feed-1", run_id="run-1", trigger_type="manual_user"
            )

        assert result["status"] == "success"
        mock_redis.enqueue_job.assert_any_await(
            "backfill_entry_content_task", "entry-2", force=False
        )
        assert progress_run.status == "success"
        assert progress_run.current_stage == "complete"
        assert progress_run.path_kind == "rsshub_fallback"
        assert progress_run.profile_key == "rsshub_fallback:github_release"
        assert progress_run.summary_json == {
            "new_entries": 2,
            "total_entries": 2,
            "summary_only_count": 1,
            "backfill_attempted_count": 0,
            "backfill_success_http_count": 0,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": True,
            "used_url": fallback_url,
            "retry_minutes": None,
        }
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert all(stage.status == "success" for stage in progress_run.stage_events)

    @pytest.mark.asyncio
    async def test_run_id_not_modified_finalizes_run(self):
        """Not-modified runs should persist completion and skip downstream stages."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = "etag-1"
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ERROR
        mock_feed.error_count = 4
        mock_feed.fetch_error_message = "old error"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1", run_id="run-1")

        assert result == {"status": "not_modified", "new_entries": 0}
        assert progress_run.status == "not_modified"
        assert progress_run.current_stage == "complete"
        assert progress_run.path_kind == "direct_feed"
        assert progress_run.summary_json == {
            "new_entries": 0,
            "total_entries": 0,
            "summary_only_count": 0,
            "backfill_attempted_count": 0,
            "backfill_success_http_count": 0,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": False,
            "used_url": "https://example.com/feed.xml",
            "retry_minutes": None,
        }
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert progress_run.stage_events[3].status == "skipped"
        assert progress_run.stage_events[4].status == "skipped"
        assert progress_run.stage_events[5].status == "skipped"
        assert progress_run.stage_events[6].status == "skipped"
        assert progress_run.stage_events[7].status == "success"

    @pytest.mark.asyncio
    async def test_run_id_retry_persists_error_state(self):
        """Retrying runs should persist final error details before raising Retry."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=RuntimeError("network timeout")),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            with pytest.raises(Retry) as excinfo:
                await fetch_feed_task({}, feed_id="feed-1", run_id="run-1")

        assert progress_run.status == "error"
        assert progress_run.current_stage == "complete"
        assert progress_run.error_message == "network timeout"
        assert progress_run.finished_at is not None
        assert progress_run.summary_json["retry_minutes"] == 15
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert progress_run.stage_events[2].status == "error"
        assert progress_run.stage_events[3].status == "skipped"
        assert progress_run.stage_events[4].status == "skipped"
        assert progress_run.stage_events[5].status == "skipped"
        assert progress_run.stage_events[6].status == "skipped"
        assert progress_run.stage_events[7].status == "error"
        assert excinfo.value.defer_score == int(timedelta(minutes=15).total_seconds() * 1000)

    @pytest.mark.asyncio
    async def test_run_id_timeout_finalizes_run(self):
        """Timed out runs should be finalized instead of staying in progress."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-timeout"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=asyncio.CancelledError()),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
            patch("glean_worker.tasks.feed_fetcher.logger.error") as mock_error,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            with pytest.raises(asyncio.CancelledError):
                await fetch_feed_task({}, feed_id="feed-timeout", run_id="run-1")

        mock_error.assert_called_once()
        assert progress_run.status == "error"
        assert progress_run.current_stage == "complete"
        assert progress_run.finished_at is not None
        assert progress_run.stage_events[-1].stage_name == "complete"
        assert progress_run.stage_events[-1].status == "error"
