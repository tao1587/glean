"""API tests for /api/today/ai/summary:* endpoints (period-aware)."""

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.server_time import get_server_now


def _server_today_str():
    return get_server_now().date().isoformat()


@pytest_asyncio.fixture
async def ai_enabled_user(db_session: AsyncSession, test_user):
    from sqlalchemy import select, update

    from glean_core.schemas.config import AIIntegrationConfig
    from glean_core.services import TypedConfigService
    from glean_database.models.user import User

    await db_session.execute(
        update(User)
        .where(User.id == test_user.id)
        .values(settings={"ai_integration_enabled": True})
    )
    cfg_svc = TypedConfigService(db_session)
    await cfg_svc.set(
        AIIntegrationConfig,
        AIIntegrationConfig(
            enabled=True,
            allow_today_synthesis=True,
        ),
    )
    await db_session.commit()
    refreshed = (
        await db_session.execute(select(User).where(User.id == test_user.id))
    ).scalar_one()
    return refreshed


@pytest_asyncio.fixture
async def two_entries_today(
    db_session: AsyncSession, test_subscription, test_feed, test_user
):
    """Two entries collected today on the user's subscribed feed."""
    from glean_database.models.entry import Entry

    entries = []
    for i in range(2):
        entry = Entry(
            feed_id=test_feed.id,
            title=f"Article {i}",
            url=f"https://example.com/a-{uuid.uuid4().hex}",
            content=f"<p>Body {i}</p>",
            ingested_at=datetime.now(UTC),
        )
        db_session.add(entry)
        entries.append(entry)
    await db_session.commit()
    for e in entries:
        await db_session.refresh(e)
    return entries


class TestGenerateDay:
    @pytest.mark.asyncio
    async def test_returns_422_when_no_entries(
        self, client: AsyncClient, auth_headers, ai_enabled_user
    ):
        response = await client.post(
            "/api/today/ai/summary:generate",
            headers=auth_headers,
            json={"period": "day", "date": _server_today_str()},
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "no_entries"

    @pytest.mark.asyncio
    async def test_queues_when_entries_present(
        self,
        client: AsyncClient,
        auth_headers,
        ai_enabled_user,
        two_entries_today,
        test_mock_redis,
    ):
        response = await client.post(
            "/api/today/ai/summary:generate",
            headers=auth_headers,
            json={"period": "day", "date": _server_today_str()},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "queued"
        assert data["summary_id"]
        assert data["source_count"] == 2
        assert any(
            f == "summarize_day_task" for f, _args in test_mock_redis.enqueued_jobs
        )

    @pytest.mark.asyncio
    async def test_lookup_after_generate(
        self,
        client: AsyncClient,
        auth_headers,
        ai_enabled_user,
        two_entries_today,
        test_mock_redis,
    ):
        await client.post(
            "/api/today/ai/summary:generate",
            headers=auth_headers,
            json={"period": "day", "date": _server_today_str()},
        )
        response = await client.post(
            "/api/today/ai/summary:lookup",
            headers=auth_headers,
            json={"period": "day", "date": _server_today_str()},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["summary"] is not None
        assert data["summary"]["status"] == "pending"
        assert data["summary"]["period"] == "day"
        assert data["current_count"] == 2
        assert data["is_stale"] is False


class TestGenerateWeek:
    @pytest.mark.asyncio
    async def test_returns_422_when_no_dailies(
        self, client: AsyncClient, auth_headers, ai_enabled_user
    ):
        response = await client.post(
            "/api/today/ai/summary:generate",
            headers=auth_headers,
            json={"period": "week", "date": _server_today_str()},
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "no_entries"

    @pytest.mark.asyncio
    async def test_lookup_week_empty(
        self, client: AsyncClient, auth_headers, ai_enabled_user
    ):
        response = await client.post(
            "/api/today/ai/summary:lookup",
            headers=auth_headers,
            json={"period": "week", "date": _server_today_str()},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["summary"] is None
        assert data["current_count"] == 0
        assert data["is_stale"] is False


class TestSynthesisGate:
    @pytest.mark.asyncio
    async def test_returns_403_when_disabled(
        self, client: AsyncClient, auth_headers, db_session, test_user
    ):
        from sqlalchemy import update

        from glean_core.schemas.config import AIIntegrationConfig
        from glean_core.services import TypedConfigService
        from glean_database.models.user import User

        await db_session.execute(
            update(User)
            .where(User.id == test_user.id)
            .values(settings={"ai_integration_enabled": True})
        )
        cfg = TypedConfigService(db_session)
        await cfg.set(
            AIIntegrationConfig,
            AIIntegrationConfig(
                enabled=True,
                allow_today_synthesis=False,
            ),
        )
        await db_session.commit()

        for path in (
            "/api/today/ai/summary:lookup",
            "/api/today/ai/summary:generate",
            "/api/today/ai/summary:retry",
        ):
            response = await client.post(
                path,
                headers=auth_headers,
                json={"period": "day", "date": _server_today_str()},
            )
            assert response.status_code == 403, f"{path} -> {response.status_code}"


class TestRetry:
    @pytest.mark.asyncio
    async def test_returns_404_when_no_failed_row(
        self, client: AsyncClient, auth_headers, ai_enabled_user, two_entries_today
    ):
        response = await client.post(
            "/api/today/ai/summary:retry",
            headers=auth_headers,
            json={"period": "day", "date": _server_today_str()},
        )
        assert response.status_code == 404
