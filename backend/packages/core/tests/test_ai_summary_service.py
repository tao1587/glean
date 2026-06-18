"""Unit + DB tests for AISummaryService (Task 5).

The full pytest conftest is intentionally broken mid-refactor, so this file is
designed to run under ``--noconftest`` and builds its own engine/session
fixtures (mirroring the global conftest's ``test_engine`` / ``db_session``
pattern) against the live test Postgres.

Run:
    uv run pytest packages/core/tests/test_ai_summary_service.py --noconftest -v
"""

import os
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, date

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from glean_core.server_time import get_server_now
from glean_core.services.ai_summary_service import (
    AISummaryService,
    EnqueueOutcome,
    LookupResult,
    week_bounds,
)
from glean_database import Base
from glean_database.models.ai_summary import AIDailySummary
from glean_database.models.entry import Entry
from glean_database.models.feed import Feed
from glean_database.models.subscription import Subscription
from glean_database.models.user import User

pytestmark = pytest.mark.asyncio

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test",
    ),
)


# --------------------------------------------------------------------------- #
# Pure-logic tests (no DB) — always runnable.
# --------------------------------------------------------------------------- #


class TestHashSet:
    def test_order_independent(self):
        assert AISummaryService.hash_set(["a", "b", "c"]) == AISummaryService.hash_set(
            ["c", "a", "b"]
        )

    def test_stable_across_calls(self):
        ids = ["x1", "x2", "x3"]
        assert AISummaryService.hash_set(ids) == AISummaryService.hash_set(ids)

    def test_empty_is_fixed_sentinel(self):
        # sha256 of empty string
        assert (
            AISummaryService.hash_set([])
            == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )

    def test_different_sets_differ(self):
        assert AISummaryService.hash_set(["a"]) != AISummaryService.hash_set(["b"])


class TestValidatePayloadSubset:
    def test_ok(self):
        AISummaryService.validate_payload_subset(
            input_entry_ids=["a", "b", "c"],
            recommended=["a"],
            topics_entry_ids=["b", "c"],
        )

    def test_rejects_duplicate_recommendation(self):
        with pytest.raises(ValueError, match="duplicate"):
            AISummaryService.validate_payload_subset(
                input_entry_ids=["a"], recommended=["a", "a"], topics_entry_ids=[]
            )

    def test_rejects_unknown_recommendation(self):
        with pytest.raises(ValueError, match="recommendations"):
            AISummaryService.validate_payload_subset(
                input_entry_ids=["a"], recommended=["z"], topics_entry_ids=[]
            )

    def test_rejects_unknown_topic(self):
        with pytest.raises(ValueError, match="topics"):
            AISummaryService.validate_payload_subset(
                input_entry_ids=["a"], recommended=[], topics_entry_ids=["z"]
            )


def test_period_stored_on_construct():
    svc = AISummaryService(
        None, model="m", prompt_version="v1", target_language="en", period="week"
    )
    assert svc._period == "week"


def test_period_defaults_to_day():
    svc = AISummaryService(None, model="m", prompt_version="v1", target_language="en")
    assert svc._period == "day"


# --------------------------------------------------------------------------- #
# DB fixtures (self-contained — do not depend on the broken conftest).
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture(scope="module")
async def engine() -> AsyncGenerator[AsyncEngine, None]:
    eng = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        maker = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with maker() as s:
            yield s
            await transaction.rollback()


@pytest_asyncio.fixture
async def subscribed_user(session: AsyncSession):
    """A user subscribed to one feed. Returns (user_id, feed_id)."""
    user = User(email=f"u-{uuid.uuid4().hex}@example.com", is_active=True)
    feed = Feed(
        url=f"https://example.com/feed-{uuid.uuid4().hex}.xml",
        title="Test Feed",
        description="d",
        status="active",
    )
    session.add_all([user, feed])
    await session.commit()
    session.add(Subscription(user_id=user.id, feed_id=feed.id))
    await session.commit()
    return user.id, feed.id


def _make(session, period="day") -> AISummaryService:
    return AISummaryService(
        session,
        model="m1",
        prompt_version="v1",
        target_language="en",
        period=period,
    )


async def _add_entry(session, feed_id, *, title, content, summary=None, when=None):
    entry = Entry(
        feed_id=feed_id,
        title=title,
        url=f"https://example.com/a-{uuid.uuid4().hex}",
        content=content,
        summary=summary,
        ingested_at=when or get_server_now().astimezone(UTC),
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


class TestListDayItems:
    async def test_returns_title_and_truncated_content(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(
            session,
            feed_id,
            title="Hello",
            content="<p>" + ("x" * 100) + "</p>",
        )
        svc = _make(session)
        items, tz = svc and await svc.list_day_items(
            user_id=user_id, summary_date=today, max_chars=20
        )
        assert tz
        assert len(items) == 1
        assert items[0]["title"] == "Hello"
        assert "entry_id" in items[0]
        # truncated to budget (head + marker + tail) — shorter than the raw 100 chars
        assert len(items[0]["content"]) < 100
        assert "[...truncated...]" in items[0]["content"]

    async def test_title_only_entry_included(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(session, feed_id, title="Title only", content=None)
        svc = _make(session)
        items, _ = await svc.list_day_items(
            user_id=user_id, summary_date=today, max_chars=6000
        )
        assert len(items) == 1
        assert items[0]["title"] == "Title only"
        assert items[0]["content"] == ""

    async def test_falls_back_to_summary_when_no_content(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(
            session, feed_id, title="T", content=None, summary="fallback summary"
        )
        svc = _make(session)
        items, _ = await svc.list_day_items(
            user_id=user_id, summary_date=today, max_chars=6000
        )
        assert items[0]["content"] == "fallback summary"

    async def test_no_subscriptions_returns_empty(self, session):
        user = User(email=f"u-{uuid.uuid4().hex}@example.com", is_active=True)
        session.add(user)
        await session.commit()
        svc = _make(session)
        items, tz = await svc.list_day_items(
            user_id=user.id, summary_date=get_server_now().date(), max_chars=10
        )
        assert items == []
        assert tz


class TestComputeCurrentSetHash:
    async def test_hashes_entry_ids(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        e1 = await _add_entry(session, feed_id, title="A", content="<p>a</p>")
        e2 = await _add_entry(session, feed_id, title="B", content="<p>b</p>")
        svc = _make(session)
        h, ids, tz = await svc.compute_current_set_hash(
            user_id=user_id, summary_date=today
        )
        assert sorted(ids) == sorted([e1.id, e2.id])
        assert h == AISummaryService.hash_set(ids)
        assert tz


class TestEnqueue:
    async def test_empty_day_returns_no_entries(self, session, subscribed_user):
        user_id, _ = subscribed_user
        svc = _make(session)
        outcome = await svc.enqueue(
            user_id=user_id, summary_date=get_server_now().date()
        )
        assert isinstance(outcome, EnqueueOutcome)
        assert outcome.status == "no_entries"
        assert outcome.summary_id is None
        assert outcome.source_count == 0

    async def test_queues_and_is_idempotent(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(session, feed_id, title="A", content="<p>a</p>")
        svc = _make(session)
        first = await svc.enqueue(user_id=user_id, summary_date=today)
        assert first.status == "queued"
        assert first.summary_id is not None
        assert first.source_count == 1
        # Second enqueue with same set → existing row, in_flight (still pending)
        second = await svc.enqueue(user_id=user_id, summary_date=today)
        assert second.status == "in_flight"
        assert second.summary_id == first.summary_id


class TestLookup:
    async def test_no_entries_returns_empty_result(self, session, subscribed_user):
        user_id, _ = subscribed_user
        svc = _make(session)
        result = await svc.lookup(
            user_id=user_id, summary_date=get_server_now().date()
        )
        assert isinstance(result, LookupResult)
        assert result.summary is None
        assert result.current_count == 0
        assert result.is_stale is False

    async def test_fresh_after_enqueue(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(session, feed_id, title="A", content="<p>a</p>")
        svc = _make(session)
        await svc.enqueue(user_id=user_id, summary_date=today)
        result = await svc.lookup(user_id=user_id, summary_date=today)
        assert result.summary is not None
        assert result.current_count == 1
        assert result.is_stale is False

    async def test_stale_when_entry_added(self, session, subscribed_user):
        user_id, feed_id = subscribed_user
        today = get_server_now().date()
        await _add_entry(session, feed_id, title="A", content="<p>a</p>")
        svc = _make(session)
        await svc.enqueue(user_id=user_id, summary_date=today)
        # New entry changes the set hash
        await _add_entry(session, feed_id, title="B", content="<p>b</p>")
        result = await svc.lookup(user_id=user_id, summary_date=today)
        assert result.summary is not None
        assert result.is_stale is True
        assert result.current_count == 2


class TestLoadDayItems:
    async def test_empty_ids(self, session):
        svc = _make(session)
        assert await svc.load_day_items(entry_ids=[], max_chars=10) == []

    async def test_reads_by_id(self, session, subscribed_user):
        _, feed_id = subscribed_user
        e = await _add_entry(session, feed_id, title="X", content="<p>body</p>")
        svc = _make(session)
        items = await svc.load_day_items(entry_ids=[e.id], max_chars=6000)
        assert len(items) == 1
        assert items[0]["entry_id"] == e.id
        assert items[0]["title"] == "X"
        assert items[0]["content"] == "body"


# --------------------------------------------------------------------------- #
# Weekly summary tests (Task 6).
# --------------------------------------------------------------------------- #


def test_week_bounds_monday_sunday():
    # 2026-06-13 is a Saturday → week is Mon 2026-06-08 .. Sun 2026-06-14.
    assert week_bounds(date(2026, 6, 13)) == (date(2026, 6, 8), date(2026, 6, 14))


async def _add_daily_done(session, user_id, *, summary_date, title="T", summary="", topics=None):
    row = AIDailySummary(
        user_id=user_id,
        period="day",
        summary_date=summary_date,
        timezone="UTC",
        model="m1",
        prompt_version="v1",
        target_language="en",
        source_set_hash=AISummaryService.hash_set([str(uuid.uuid4())]),
        source_ids=[],
        status="done",
        title=title,
        summary=summary,
        topics=topics or [],
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


class TestEnqueueWeek:
    async def test_queues_from_dailies_then_in_flight(self, session, subscribed_user):
        user_id, _ = subscribed_user
        week_start = date(2026, 6, 8)  # Monday
        await _add_daily_done(session, user_id, summary_date=date(2026, 6, 8))
        await _add_daily_done(session, user_id, summary_date=date(2026, 6, 10))
        svc = _make(session, period="week")
        first = await svc.enqueue_week(user_id=user_id, week_start=week_start)
        assert first.status == "queued"
        assert first.summary_id is not None
        assert first.source_count == 2
        second = await svc.enqueue_week(user_id=user_id, week_start=week_start)
        assert second.status == "in_flight"
        assert second.summary_id == first.summary_id

    async def test_no_dailies_returns_no_entries(self, session, subscribed_user):
        user_id, _ = subscribed_user
        svc = _make(session, period="week")
        outcome = await svc.enqueue_week(user_id=user_id, week_start=date(2026, 6, 8))
        assert outcome.status == "no_entries"
        assert outcome.summary_id is None
        assert outcome.source_count == 0


class TestLookupWeek:
    async def test_no_dailies_returns_empty_result(self, session, subscribed_user):
        user_id, _ = subscribed_user
        svc = _make(session, period="week")
        result = await svc.lookup_week(user_id=user_id, week_start=date(2026, 6, 8))
        assert isinstance(result, LookupResult)
        assert result.summary is None
        assert result.current_count == 0
        assert result.is_stale is False

    async def test_returns_week_row_fresh(self, session, subscribed_user):
        user_id, _ = subscribed_user
        week_start = date(2026, 6, 8)  # Monday
        await _add_daily_done(session, user_id, summary_date=date(2026, 6, 8))
        svc = _make(session, period="week")
        # Enqueue a week row over the current set of dailies.
        outcome = await svc.enqueue_week(user_id=user_id, week_start=week_start)
        assert outcome.status == "queued"
        result = await svc.lookup_week(user_id=user_id, week_start=week_start)
        assert result.summary is not None
        assert result.summary.period == "week"
        assert result.current_count == 1
        assert result.is_stale is False

    async def test_stale_when_new_daily_added(self, session, subscribed_user):
        user_id, _ = subscribed_user
        week_start = date(2026, 6, 8)
        await _add_daily_done(session, user_id, summary_date=date(2026, 6, 8))
        svc = _make(session, period="week")
        await svc.enqueue_week(user_id=user_id, week_start=week_start)
        # A new done daily within the week changes the source set.
        await _add_daily_done(session, user_id, summary_date=date(2026, 6, 10))
        result = await svc.lookup_week(user_id=user_id, week_start=week_start)
        assert result.summary is not None
        assert result.is_stale is True
        assert result.current_count == 2


class TestLoadWeekItems:
    async def test_empty_ids(self, session):
        svc = _make(session, period="week")
        assert await svc.load_week_items(daily_ids=[]) == []

    async def test_load_week_items_shapes_rows(self, session, subscribed_user):
        user_id, _ = subscribed_user
        row = await _add_daily_done(
            session,
            user_id,
            summary_date=date(2026, 6, 9),
            title="Daily title",
            summary="Daily summary",
            topics=[{"name": "X", "entry_ids": []}],
        )
        svc = _make(session, period="week")
        items = await svc.load_week_items(daily_ids=[row.id])
        assert len(items) == 1
        assert items[0] == {
            "date": "2026-06-09",
            "title": "Daily title",
            "summary": "Daily summary",
            "topics": ["X"],
        }
