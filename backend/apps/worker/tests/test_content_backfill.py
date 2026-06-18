"""Tests for entry content backfill worker tasks."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from glean_worker.tasks.content_backfill import (
    backfill_entry_content_task,
    enqueue_feed_content_backfill,
)


class TestBackfillEntryContentTask:
    """Test single-entry content backfill behavior."""

    @pytest.mark.asyncio
    async def test_rsshub_entry_backfill_job_is_skipped_without_extraction(self):
        """Stale queued jobs for RSSHub entries should not run full-text extraction."""
        mock_entry = MagicMock()
        mock_entry.id = "entry-rsshub"
        mock_entry.url = "https://example.com/article"
        mock_entry.content_backfill_status = "processing"
        mock_entry.content_backfill_attempts = 2
        mock_entry.content_backfill_error = "old_error"
        mock_entry.__dict__["feed"] = MagicMock(source_type="rsshub")

        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=entry_result)

        extract_mock = AsyncMock()

        with (
            patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.content_backfill.extract_entry_content_update",
                new=extract_mock,
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await backfill_entry_content_task({"redis": AsyncMock()}, "entry-rsshub")

        assert result == {
            "status": "skipped",
            "entry_id": "entry-rsshub",
            "reason": "rsshub_source",
        }
        assert mock_entry.content_backfill_status == "skipped"
        assert mock_entry.content_backfill_attempts == 0
        assert mock_entry.content_backfill_error is None
        extract_mock.assert_not_awaited()
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_successful_backfill_updates_entry_and_invalidates_translations(self):
        """Successful backfill should replace content and reset derivative state."""
        mock_entry = MagicMock()
        mock_entry.id = "entry-1"
        mock_entry.url = "https://example.com/article"
        mock_entry.content = "<p>Short summary</p>"
        mock_entry.summary = "<p>Short summary</p>"
        mock_entry.content_source = "feed_summary_only"
        mock_entry.content_backfill_status = "pending"
        mock_entry.content_backfill_attempts = 0
        mock_entry.embedding_status = "done"
        mock_entry.embedding_error = None
        mock_entry.embedding_at = object()

        mock_translation = MagicMock()
        mock_translation.status = "done"
        mock_translation.error = None
        mock_translation.translated_content = "<p>旧翻译</p>"
        mock_translation.paragraph_translations = {"a": "b"}

        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry
        translations_result = MagicMock()
        translations_result.scalars.return_value.all.return_value = [mock_translation]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[entry_result, translations_result])

        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.content_backfill.extract_entry_content_update",
                new=AsyncMock(
                    return_value=MagicMock(
                        content="<article><p>Long full article body</p></article>",
                        source="backfill_browser",
                    )
                ),
            ),
            patch(
                "glean_worker.tasks.content_backfill._is_vectorization_enabled",
                new=AsyncMock(return_value=True),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await backfill_entry_content_task({"redis": mock_redis}, "entry-1")

        assert result["status"] == "success"
        assert result["updated"] is True
        assert mock_entry.content_source == "backfill_browser"
        assert mock_entry.content_backfill_status == "done"
        assert mock_entry.embedding_status == "pending"
        assert mock_translation.status == "pending"
        assert mock_translation.translated_content is None
        mock_redis.enqueue_job.assert_awaited_once_with("generate_entry_embedding", "entry-1")

    @pytest.mark.asyncio
    async def test_failed_backfill_marks_entry_failed(self):
        """Extraction failure should mark the entry as failed."""
        mock_entry = MagicMock()
        mock_entry.id = "entry-2"
        mock_entry.feed_id = "feed-2"
        mock_entry.guid = "guid-2"
        mock_entry.url = "https://example.com/article"
        mock_entry.content = None
        mock_entry.summary = None
        mock_entry.content_source = None
        mock_entry.content_backfill_status = "pending"
        mock_entry.content_backfill_attempts = 0
        mock_entry.__dict__["feed"] = MagicMock(source_type="feed")

        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        conflicts_result = MagicMock()
        conflicts_result.scalars.return_value.all.return_value = ["entry-2"]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[entry_result, conflicts_result, entry_result])

        with (
            patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.content_backfill.extract_entry_content_update",
                new=AsyncMock(side_effect=RuntimeError("boom")),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await backfill_entry_content_task({"redis": AsyncMock()}, "entry-2")

        assert result["status"] == "error"
        assert mock_entry.content_backfill_status == "failed"
        assert mock_entry.content_backfill_error == "boom"

    @pytest.mark.asyncio
    async def test_duplicate_guid_conflict_skips_backfill_before_extraction(self):
        """Duplicate historical entries should skip backfill before mutating state."""
        mock_entry = MagicMock()
        mock_entry.id = "entry-dup"
        mock_entry.feed_id = "feed-dup"
        mock_entry.guid = "guid-dup"
        mock_entry.url = "https://example.com/article"
        mock_entry.content = "<p>Short summary</p>"
        mock_entry.summary = "<p>Short summary</p>"
        mock_entry.content_source = "feed_summary_only"
        mock_entry.content_backfill_status = "pending"
        mock_entry.content_backfill_attempts = 0
        mock_entry.__dict__["feed"] = MagicMock(source_type="feed")

        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        conflicts_result = MagicMock()
        conflicts_result.scalars.return_value.all.return_value = ["entry-dup", "entry-older"]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[entry_result, conflicts_result])

        extract_mock = AsyncMock()

        with (
            patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.content_backfill.extract_entry_content_update",
                new=extract_mock,
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await backfill_entry_content_task({"redis": AsyncMock()}, "entry-dup")

        assert result["status"] == "skipped"
        assert result["reason"] == "duplicate_entry_conflict"
        assert result["entry_id"] == "entry-dup"
        extract_mock.assert_not_awaited()
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_duplicate_guid_integrity_error_returns_skipped(self):
        """Duplicate guid write failures should degrade to a skipped backfill result."""
        mock_entry = MagicMock()
        mock_entry.id = "entry-3"
        mock_entry.feed_id = "feed-3"
        mock_entry.guid = "guid-3"
        mock_entry.url = "https://example.com/article"
        mock_entry.content = "<p>Short summary</p>"
        mock_entry.summary = "<p>Short summary</p>"
        mock_entry.content_source = "feed_summary_only"
        mock_entry.content_backfill_status = "pending"
        mock_entry.content_backfill_attempts = 0
        mock_entry.embedding_status = "done"
        mock_entry.embedding_error = None
        mock_entry.embedding_at = object()
        mock_entry.__dict__["feed"] = MagicMock(source_type="feed")

        entry_result = MagicMock()
        entry_result.scalar_one_or_none.return_value = mock_entry

        conflicts_result = MagicMock()
        conflicts_result.scalars.return_value.all.return_value = ["entry-3"]

        translations_result = MagicMock()
        translations_result.scalars.return_value.all.return_value = []

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[entry_result, conflicts_result, translations_result]
        )
        mock_session.commit = AsyncMock(
            side_effect=[
                None,
                IntegrityError(
                    "UPDATE entries ...",
                    {},
                    Exception('duplicate key value violates unique constraint "uq_feed_guid"'),
                ),
            ]
        )

        with (
            patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx,
            patch(
                "glean_worker.tasks.content_backfill.extract_entry_content_update",
                new=AsyncMock(
                    return_value=MagicMock(
                        content="<article><p>Long full article body</p></article>",
                        source="backfill_browser",
                    )
                ),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await backfill_entry_content_task({"redis": AsyncMock()}, "entry-3")

        assert result["status"] == "skipped"
        assert result["reason"] == "duplicate_entry_conflict"
        assert result["entry_id"] == "entry-3"


class TestEnqueueFeedContentBackfill:
    """Test feed-level content backfill enqueue behavior."""

    @pytest.mark.asyncio
    async def test_rsshub_feed_backfill_enqueue_is_skipped(self):
        """RSSHub feeds should not enqueue article full-text backfill jobs."""
        feed_result = MagicMock()
        feed_result.scalar_one_or_none.return_value = "rsshub"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=feed_result)

        mock_redis = AsyncMock()

        with patch("glean_worker.tasks.content_backfill.get_session_context") as mock_ctx:
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await enqueue_feed_content_backfill(
                {"redis": mock_redis},
                "feed-rsshub",
                force=True,
            )

        assert result == {
            "feed_id": "feed-rsshub",
            "matched": 0,
            "enqueued": 0,
            "entry_ids": [],
            "skipped": True,
            "reason": "rsshub_source",
        }
        mock_redis.enqueue_job.assert_not_awaited()
