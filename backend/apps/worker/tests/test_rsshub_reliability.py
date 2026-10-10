"""Regression coverage for RSSHub route failures and independent origins."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from arq import Retry

from glean_database.models import Feed, FeedFetchRun, FeedStatus
from glean_worker.tasks.feed_fetcher import (
    _get_rsshub_blocked_until,
    fetch_all_feeds,
    fetch_feed_task,
)


class MemoryRedis:
    """Persist circuit state without replacing the production circuit logic."""

    def __init__(self):
        self.values = {}
        self.expirations = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, *, ex):
        self.values[key] = value
        self.expirations[key] = ex

    async def delete(self, key):
        self.values.pop(key, None)

    async def enqueue_job(self, _name, _feed_id, *, _job_id, **_kwargs):
        return MagicMock(job_id=_job_id)


@pytest.mark.asyncio
async def test_unreachable_instance_does_not_defer_healthy_instance():
    redis = MemoryRedis()
    now = datetime.now(UTC)

    async def health(urls):
        return urls[0].startswith("http://healthy-rsshub")

    with patch("glean_worker.tasks.feed_fetcher._probe_rsshub_health", new=health):
        blocked = await _get_rsshub_blocked_until(
            redis, now=now, rsshub_urls=["http://down-rsshub:1200/anthropic/research"]
        )
        healthy_blocked = await _get_rsshub_blocked_until(
            redis, now=now, rsshub_urls=["http://healthy-rsshub:1200/twitter/user/example"]
        )

    assert blocked == now + timedelta(minutes=2)
    assert healthy_blocked is None


@pytest.mark.asyncio
async def test_unhealthy_instance_retains_backoff_after_unblock():
    redis = MemoryRedis()
    now = datetime.now(UTC)
    url = "http://rsshub:1200/anthropic/research"

    with patch(
        "glean_worker.tasks.feed_fetcher._probe_rsshub_health", new=AsyncMock(return_value=False)
    ):
        first = await _get_rsshub_blocked_until(redis, now=now, rsshub_urls=[url])
        assert first == now + timedelta(minutes=2)
        # Redis must keep the failure counter after the health window ends.
        assert min(redis.expirations.values()) > 120
        second = await _get_rsshub_blocked_until(
            redis, now=first + timedelta(seconds=1), rsshub_urls=[url]
        )

    assert second == first + timedelta(minutes=5, seconds=1)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected_status"),
    [
        (429, FeedStatus.ACTIVE),
        (503, FeedStatus.ACTIVE),
        (522, FeedStatus.ACTIVE),
        (403, FeedStatus.ERROR),
    ],
)
async def test_wrapped_http_failure_only_disables_permanently_unavailable_feed(
    status, expected_status
):
    feed = Feed(
        id="feed-1",
        url="http://rsshub:1200/anthropic/research",
        title="Example",
        source_type="rsshub",
        status=FeedStatus.ACTIVE,
        error_count=9,
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = feed
    session = AsyncMock()
    session.execute.return_value = result
    service = MagicMock()
    service.convert_for_fetch = AsyncMock(return_value=[])
    redis = MemoryRedis()
    request = httpx.Request("GET", feed.url)
    response = httpx.Response(status, request=request)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as cause:
        try:
            raise ValueError(f"Failed to fetch feed: {cause!r}") from cause
        except ValueError as error:
            wrapped_error = error

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as context,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=service),
        patch(
            "glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(side_effect=wrapped_error)
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher._probe_rsshub_health", new=AsyncMock(return_value=True)
        ),
    ):
        context.return_value.__aenter__.return_value = session
        with pytest.raises(Retry) as retried:
            await fetch_feed_task({"redis": redis}, feed_id=feed.id)

    assert feed.status == expected_status
    assert feed.error_count == 10
    assert feed.next_fetch_at > datetime.now(UTC) + timedelta(minutes=59)
    assert retried.value.defer_score == 60 * 60 * 1000
    assert redis.values == {}


@pytest.mark.asyncio
async def test_scheduler_only_defers_the_unreachable_rsshub_origin():
    now = datetime.now(UTC)
    feeds = [
        Feed(id="down", title="Down", url="http://down-rsshub:1200/route", source_type="rsshub"),
        Feed(
            id="healthy",
            title="Healthy",
            url="http://healthy-rsshub:1200/route",
            source_type="rsshub",
        ),
    ]
    session = AsyncMock()
    session.add = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = feeds
    session.execute.return_value = result
    redis = MemoryRedis()

    async def health(urls):
        return urls[0].startswith("http://healthy-rsshub")

    async def create_run(_session, *, feed_id, **_kwargs):
        return FeedFetchRun(id="run-" + feed_id, feed_id=feed_id), MagicMock()

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as context,
        patch("glean_worker.tasks.feed_fetcher._probe_rsshub_health", new=health),
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run", new=create_run
        ),
    ):
        context.return_value.__aenter__.return_value = session
        queued = await fetch_all_feeds({"redis": redis}, now_utc=now)

    assert queued == {"feeds_queued": 1}
    assert feeds[0].next_fetch_at == now + timedelta(minutes=2)
    assert feeds[1].next_fetch_at is None
    assert feeds[1].last_fetch_attempt_at == now


@pytest.mark.asyncio
async def test_cross_origin_fallback_outage_does_not_block_primary_instance():
    primary = "http://healthy-rsshub:1200/route"
    fallback = "http://down-rsshub:1200/fallback"
    feed = Feed(id="feed-1", url=primary, title="Example", source_type="rsshub", error_count=4)
    result = MagicMock()
    result.scalar_one_or_none.return_value = feed
    session = AsyncMock()
    session.execute.return_value = result
    service = MagicMock()
    service.convert_for_fetch = AsyncMock(return_value=[fallback])
    redis = MemoryRedis()
    responses = [
        httpx.HTTPStatusError(
            "503", request=httpx.Request("GET", primary), response=httpx.Response(503)
        ),
        httpx.ConnectError("unreachable", request=httpx.Request("GET", fallback)),
    ]

    async def health(urls):
        return urls[0].startswith("http://healthy-rsshub")

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as context,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=service),
        patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(side_effect=responses)),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch("glean_worker.tasks.feed_fetcher._probe_rsshub_health", new=health),
    ):
        context.return_value.__aenter__.return_value = session
        with pytest.raises(Retry):
            await fetch_feed_task({"redis": redis}, feed_id=feed.id)
        primary_blocked = await _get_rsshub_blocked_until(
            redis, now=datetime.now(UTC), rsshub_urls=[primary]
        )
        fallback_blocked = await _get_rsshub_blocked_until(
            redis, now=datetime.now(UTC), rsshub_urls=[fallback]
        )

    assert primary_blocked is None
    assert fallback_blocked is not None
    assert feed.error_count == 4
    assert feed.status == FeedStatus.ACTIVE
