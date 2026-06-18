"""Unit tests for active feed fetch run router behavior."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from glean_api.routers.feeds import get_active_feed_fetch_runs
from glean_database.models.feed import Feed
from glean_database.models.feed_fetch_run import FeedFetchRun


async def test_get_active_feed_fetch_runs_reconciles_stale_runs_before_serializing() -> None:
    current_user = type("CurrentUser", (), {"id": "user-1"})()
    session = AsyncMock()
    ownership_result = MagicMock()
    ownership_result.scalars.return_value.all.return_value = ["feed-1"]
    session.execute = AsyncMock(return_value=ownership_result)

    feed = Feed(
        id="feed-1",
        url="https://example.com/feed.xml",
        title="Example Feed",
        status="active",
    )
    run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        job_id="job-1",
        trigger_type="manual_user",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    redis = MagicMock()

    with (
        patch(
            "glean_api.routers.feeds.reconcile_active_feed_fetch_runs",
            new=AsyncMock(),
        ) as reconcile_active_runs,
        patch(
            "glean_api.routers.feeds.load_active_feed_fetch_runs",
            new=AsyncMock(return_value=[(run, feed)]),
        ),
    ):
        result = await get_active_feed_fetch_runs(
            current_user=current_user,
            session=session,
            redis=redis,
        )

    reconcile_active_runs.assert_awaited_once_with(session, redis, feed_ids=["feed-1"])
    assert result["items"][0]["feed_id"] == "feed-1"
    assert result["items"][0]["feed_title"] == "Example Feed"
