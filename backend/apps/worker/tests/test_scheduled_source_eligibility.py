"""Real database selection preserves schedules while excluding unsubscribed catalog feeds."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models import Bookmark, Entry, Feed, FeedStatus, Subscription, User, UserEntry
from glean_worker.tasks.feed_fetcher import _load_scheduled_feeds


async def add_user(session: AsyncSession, *, active: bool = True) -> User:
    user = User(id=str(uuid4()), email=f"{uuid4()}@example.test", is_active=active)
    session.add(user)
    await session.flush()
    return user


async def add_feed(
    session: AsyncSession,
    *,
    next_fetch_at: datetime | None = None,
    status: FeedStatus = FeedStatus.ACTIVE,
    **timestamps: datetime,
) -> Feed:
    feed = Feed(
        id=str(uuid4()),
        url=f"https://example.test/{uuid4()}/feed",
        status=status,
        next_fetch_at=next_fetch_at,
        **timestamps,
    )
    session.add(feed)
    await session.flush()
    return feed


async def subscribe(session: AsyncSession, user: User, feed: Feed) -> Subscription:
    subscription = Subscription(user_id=user.id, feed_id=feed.id)
    session.add(subscription)
    await session.flush()
    return subscription


@pytest.mark.asyncio
@pytest.mark.parametrize("include_midnight_supplement", [False, True])
async def test_orphan_is_excluded_but_inactive_account_subscription_remains_eligible(
    db_session: AsyncSession,
    include_midnight_supplement: bool,
) -> None:
    now = datetime(2026, 10, 11, 0, 0, tzinfo=UTC)
    inactive = await add_user(db_session, active=False)
    active = await add_user(db_session)
    orphan = await add_feed(db_session)
    subscribed = await add_feed(db_session)
    inactive_only = await add_feed(db_session)
    await subscribe(db_session, inactive, subscribed)
    await subscribe(db_session, active, subscribed)
    await subscribe(db_session, inactive, inactive_only)

    selected = await _load_scheduled_feeds(
        db_session, now_utc=now, include_midnight_supplement=include_midnight_supplement
    )

    assert {feed.id for feed in selected} == {subscribed.id, inactive_only.id}
    assert len(selected) == 2
    assert await db_session.get(Feed, orphan.id) is orphan
    assert orphan.status == FeedStatus.ACTIVE


@pytest.mark.asyncio
async def test_regular_schedule_preserves_due_time_and_active_status_rules(
    db_session: AsyncSession,
) -> None:
    now = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    user = await add_user(db_session, active=False)
    feeds = [
        await add_feed(db_session),
        await add_feed(db_session, next_fetch_at=now - timedelta(seconds=1)),
        await add_feed(db_session, next_fetch_at=now),
        await add_feed(db_session, next_fetch_at=now + timedelta(seconds=1)),
        await add_feed(db_session, status=FeedStatus.DISABLED),
        await add_feed(db_session, status=FeedStatus.ERROR),
    ]
    for feed in feeds:
        await subscribe(db_session, user, feed)

    selected = await _load_scheduled_feeds(
        db_session, now_utc=now, include_midnight_supplement=False
    )

    assert {feed.id for feed in selected} == {feed.id for feed in feeds[:3]}


@pytest.mark.asyncio
async def test_midnight_supplement_preserves_local_day_and_recent_attempt_guards(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("glean_worker.tasks.feed_fetcher.settings.worker_timezone", "Asia/Shanghai")
    monkeypatch.setattr(
        "glean_worker.tasks.feed_fetcher.settings.feed_refresh_interval_minutes", 720
    )
    now = datetime(2026, 10, 10, 16, 0, tzinfo=UTC)  # Local midnight on October 11.
    future = now + timedelta(hours=6)
    user = await add_user(db_session)
    supplemental = await add_feed(
        db_session,
        next_fetch_at=future,
        last_fetch_success_at=now - timedelta(seconds=1),
        last_fetch_attempt_at=now - timedelta(hours=4),
    )
    succeeded_today = await add_feed(
        db_session,
        next_fetch_at=future,
        last_fetch_success_at=now,
        last_fetch_attempt_at=now - timedelta(hours=4),
    )
    guard_boundary = await add_feed(
        db_session, next_fetch_at=future, last_fetch_attempt_at=now - timedelta(hours=3)
    )
    outside_guard = await add_feed(
        db_session, next_fetch_at=future, last_fetch_attempt_at=now - timedelta(hours=3, seconds=1)
    )
    due_even_after_recent_attempt = await add_feed(
        db_session, next_fetch_at=now, last_fetch_success_at=now, last_fetch_attempt_at=now
    )
    orphan_supplemental = await add_feed(
        db_session, next_fetch_at=future, last_fetch_attempt_at=now - timedelta(hours=4)
    )
    for feed in (
        supplemental,
        succeeded_today,
        guard_boundary,
        outside_guard,
        due_even_after_recent_attempt,
    ):
        await subscribe(db_session, user, feed)

    selected = await _load_scheduled_feeds(
        db_session, now_utc=now, include_midnight_supplement=True
    )

    assert {feed.id for feed in selected} == {
        supplemental.id,
        outside_guard.id,
        due_even_after_recent_attempt.id,
    }
    assert await db_session.get(Feed, orphan_supplemental.id) is orphan_supplemental


@pytest.mark.asyncio
async def test_filtering_preserves_orphan_feed_articles_bookmarks_and_reading_state(
    db_session: AsyncSession,
) -> None:
    now = datetime(2026, 10, 11, 0, 0, tzinfo=UTC)
    user = await add_user(db_session)
    orphan = await add_feed(db_session)
    entry = Entry(
        id=str(uuid4()),
        feed_id=orphan.id,
        url="https://example.test/old-article",
        title="Retained article",
        content="Original content",
    )
    db_session.add(entry)
    await db_session.flush()
    bookmark = Bookmark(user_id=user.id, entry_id=entry.id, title="Retained bookmark")
    state = UserEntry(user_id=user.id, entry_id=entry.id, is_read=True, read_later=True)
    db_session.add_all([bookmark, state])
    await db_session.flush()
    models = (Feed, Entry, Bookmark, UserEntry, Subscription)
    before = [await db_session.scalar(select(func.count()).select_from(model)) for model in models]

    for midnight in (False, True):
        selected = await _load_scheduled_feeds(
            db_session, now_utc=now, include_midnight_supplement=midnight
        )
        assert selected == []

    after = [await db_session.scalar(select(func.count()).select_from(model)) for model in models]
    assert before == after == [1, 1, 1, 1, 0]
    await db_session.refresh(orphan)
    await db_session.refresh(entry)
    await db_session.refresh(bookmark)
    await db_session.refresh(state)
    assert orphan.status == FeedStatus.ACTIVE and orphan.next_fetch_at is None
    assert entry.feed_id == orphan.id and entry.content == "Original content"
    assert bookmark.entry_id == entry.id
    assert state.entry_id == entry.id and state.is_read and state.read_later


@pytest.mark.asyncio
async def test_resubscription_restores_eligibility_without_resetting_catalog_feed(
    db_session: AsyncSession,
) -> None:
    now = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    user = await add_user(db_session)
    feed = await add_feed(db_session)
    assert (
        await _load_scheduled_feeds(db_session, now_utc=now, include_midnight_supplement=False)
        == []
    )

    await subscribe(db_session, user, feed)
    selected = await _load_scheduled_feeds(
        db_session, now_utc=now, include_midnight_supplement=False
    )

    assert [selected_feed.id for selected_feed in selected] == [feed.id]
    assert feed.status == FeedStatus.ACTIVE
