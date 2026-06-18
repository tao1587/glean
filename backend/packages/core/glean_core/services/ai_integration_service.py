"""AI integration helpers shared between the supplement and synthesis flows.

Previously this module also hosted the external writeback paths
(list_today_entries / get_entry_detail / upsert_daily_summary /
upsert_entry_supplement). Those were retired when we adopted the
internal-trigger model; only the subscription/date helpers remain here.
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.server_time import get_server_day_range as build_server_day_range
from glean_database.models import Entry, Subscription


class AIIntegrationService:
    """Subscription + date-range helpers for AI flows."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def get_server_day_range(self, summary_date: date) -> tuple[datetime, datetime, str]:
        """Convert a server-local date to a UTC range using the server TZ setting."""
        return build_server_day_range(summary_date)

    async def get_subscribed_feed_ids(self, user_id: str) -> list[str]:
        """Return feed IDs subscribed by a user."""
        result = await self.session.execute(
            select(Subscription.feed_id).where(Subscription.user_id == user_id)
        )
        return [str(row[0]) for row in result.all()]

    async def ensure_entries_subscribed(self, user_id: str, entry_ids: set[str]) -> None:
        """Validate that all referenced entries belong to user subscriptions.

        Raises ValueError if any entry is not in a subscribed feed.
        """
        if not entry_ids:
            return

        feed_ids = await self.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            raise ValueError("Referenced entries are not in subscribed feeds")

        result = await self.session.execute(
            select(Entry.id).where(Entry.id.in_(entry_ids), Entry.feed_id.in_(feed_ids))
        )
        allowed_ids = {str(row[0]) for row in result.all()}
        missing = entry_ids - allowed_ids
        if missing:
            raise ValueError("Referenced entries are not in subscribed feeds")

    async def filter_subscribed_entries(
        self, *, user_id: str, entry_ids: list[str]
    ) -> list[str]:
        """Return the subset of entry_ids belonging to feeds the user subscribes to.

        Non-raising counterpart to ensure_entries_subscribed — used by the
        idempotent enqueue path which classifies the rejected ids back to the
        caller instead of erroring out the whole batch.
        """
        if not entry_ids:
            return []
        feed_ids = await self.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            return []
        result = await self.session.execute(
            select(Entry.id).where(
                Entry.id.in_(entry_ids), Entry.feed_id.in_(feed_ids)
            )
        )
        return [str(row[0]) for row in result.all()]
