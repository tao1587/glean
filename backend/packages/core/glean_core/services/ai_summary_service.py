"""AI summary service — daily (and weekly) summarization over raw entries.

A summary row is keyed by
    (user, period, date, tz, model, prompt_version, target_language, source_set_hash)
where source_set_hash = sha256(sorted(entry_id_list)). New entries naturally
produce a different hash; old summaries stay queryable for forensics or
comparison.
"""

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.services.ai_integration_service import AIIntegrationService
from glean_core.services.llm.content import extract_plain_text, truncate_for_llm
from glean_database.models import Entry
from glean_database.models.ai_summary import AIDailySummary

_EnqueueStatus = Literal["queued", "in_flight", "already_done", "no_entries"]


def week_bounds(d: date) -> tuple[date, date]:
    """Monday..Sunday of the natural week containing d."""
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


@dataclass(frozen=True)
class EnqueueOutcome:
    status: _EnqueueStatus
    summary_id: str | None
    source_set_hash: str | None
    source_count: int


@dataclass(frozen=True)
class LookupResult:
    summary: AIDailySummary | None
    current_set_hash: str | None
    current_count: int
    is_stale: bool


class AISummaryService:
    """Per-request facade — model/prompt/lang/period are fixed by config."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        model: str,
        prompt_version: str,
        target_language: str,
        period: str = "day",
    ) -> None:
        self._s = session
        self._model = model
        self._prompt_version = prompt_version
        self._target_language = target_language
        self._period = period

    @staticmethod
    def hash_set(ids: list[str]) -> str:
        """Return sha256 hex of sorted comma-joined ids. Empty set has a fixed sentinel."""
        joined = ",".join(sorted(ids))
        return hashlib.sha256(joined.encode()).hexdigest()

    @staticmethod
    def validate_payload_subset(
        *,
        input_entry_ids: list[str],
        recommended: list[str],
        topics_entry_ids: list[str],
    ) -> None:
        """Raise ValueError on hallucinated entry_ids or duplicate recommendations."""
        allowed = set(input_entry_ids)
        if len(set(recommended)) != len(recommended):
            raise ValueError("duplicate entry in recommended_entry_ids")
        for rid in recommended:
            if rid not in allowed:
                raise ValueError(f"unknown entry_id in recommendations: {rid!r}")
        for tid in topics_entry_ids:
            if tid not in allowed:
                raise ValueError(f"unknown entry_id in topics: {tid!r}")

    @staticmethod
    def _item_from_entry(entry: Entry, max_chars: int) -> dict:
        text = extract_plain_text(entry.content) or (entry.summary or "")
        return {
            "entry_id": entry.id,
            "title": entry.title or "",
            "content": truncate_for_llm(text, max_chars),
        }

    async def list_day_items(
        self, *, user_id: str, summary_date: date, max_chars: int
    ) -> tuple[list[dict], str]:
        """Return (items, server_timezone) for entries collected on this local day."""
        integration = AIIntegrationService(self._s)
        start_utc, end_utc, server_tz = integration.get_server_day_range(summary_date)
        feed_ids = await integration.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            return [], server_tz

        collection_ts = sa.func.coalesce(
            Entry.ingested_at, Entry.created_at, Entry.published_at
        )
        rows = await self._s.execute(
            sa.select(Entry)
            .where(
                Entry.feed_id.in_(feed_ids),
                collection_ts >= start_utc,
                collection_ts < end_utc,
            )
            .order_by(Entry.id)
        )
        items = [self._item_from_entry(e, max_chars) for e in rows.scalars()]
        return items, server_tz

    async def load_day_items(
        self, *, entry_ids: list[str], max_chars: int
    ) -> list[dict]:
        """Load entries by id, in the same item shape as list_day_items."""
        if not entry_ids:
            return []
        rows = await self._s.execute(
            sa.select(Entry).where(Entry.id.in_(entry_ids)).order_by(Entry.id)
        )
        return [self._item_from_entry(e, max_chars) for e in rows.scalars()]

    async def compute_current_set_hash(
        self, *, user_id: str, summary_date: date
    ) -> tuple[str, list[str], str]:
        """Return (hash, sorted_entry_ids, server_timezone) for this date."""
        integration = AIIntegrationService(self._s)
        start_utc, end_utc, server_tz = integration.get_server_day_range(summary_date)
        feed_ids = await integration.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            return self.hash_set([]), [], server_tz

        collection_ts = sa.func.coalesce(
            Entry.ingested_at, Entry.created_at, Entry.published_at
        )
        rows = await self._s.execute(
            sa.select(Entry.id)
            .where(
                Entry.feed_id.in_(feed_ids),
                collection_ts >= start_utc,
                collection_ts < end_utc,
            )
            .order_by(Entry.id)
        )
        ids = [str(r[0]) for r in rows]
        return self.hash_set(ids), ids, server_tz

    async def enqueue(self, *, user_id: str, summary_date: date) -> EnqueueOutcome:
        """Atomically reserve a placeholder summary row for the current set."""
        set_hash, ids, server_tz = await self.compute_current_set_hash(
            user_id=user_id, summary_date=summary_date
        )
        if not ids:
            return EnqueueOutcome("no_entries", None, None, 0)

        stmt = (
            pg_insert(AIDailySummary)
            .values(
                user_id=user_id,
                period=self._period,
                summary_date=summary_date,
                timezone=server_tz,
                model=self._model,
                prompt_version=self._prompt_version,
                target_language=self._target_language,
                source_set_hash=set_hash,
                source_ids=ids,
                status="pending",
                source="internal",
                period_start=summary_date,
                period_end=summary_date,
            )
            .on_conflict_do_nothing(constraint="uq_ai_daily_summary_tuple")
            .returning(AIDailySummary.id)
        )
        new_id = (await self._s.execute(stmt)).scalar_one_or_none()
        if new_id is not None:
            await self._s.commit()
            return EnqueueOutcome("queued", new_id, set_hash, len(ids))

        existing = (
            await self._s.execute(
                sa.select(AIDailySummary).where(
                    AIDailySummary.user_id == user_id,
                    AIDailySummary.period == self._period,
                    AIDailySummary.summary_date == summary_date,
                    AIDailySummary.timezone == server_tz,
                    AIDailySummary.model == self._model,
                    AIDailySummary.prompt_version == self._prompt_version,
                    AIDailySummary.target_language == self._target_language,
                    AIDailySummary.source_set_hash == set_hash,
                )
            )
        ).scalar_one()
        status: _EnqueueStatus = (
            "already_done" if existing.status == "done" else "in_flight"
        )
        return EnqueueOutcome(status, existing.id, set_hash, len(ids))

    async def lookup(self, *, user_id: str, summary_date: date) -> LookupResult:
        """Return the most-recent matching summary for this user+date+config.

        `is_stale=True` means the cached summary covers a different entry set
        than the current one (new entries arrived since generation).
        """
        current_hash, current_ids, server_tz = await self.compute_current_set_hash(
            user_id=user_id, summary_date=summary_date
        )
        if not current_ids:
            return LookupResult(None, None, 0, False)

        rows = await self._s.execute(
            sa.select(AIDailySummary)
            .where(
                AIDailySummary.user_id == user_id,
                AIDailySummary.period == self._period,
                AIDailySummary.summary_date == summary_date,
                AIDailySummary.timezone == server_tz,
                AIDailySummary.model == self._model,
                AIDailySummary.prompt_version == self._prompt_version,
                AIDailySummary.target_language == self._target_language,
            )
            .order_by(AIDailySummary.updated_at.desc())
            .limit(1)
        )
        row = rows.scalar_one_or_none()
        is_stale = bool(row and row.source_set_hash != current_hash)
        return LookupResult(
            summary=row,
            current_set_hash=current_hash,
            current_count=len(current_ids),
            is_stale=is_stale,
        )

    async def claim(self, *, summary_id: str) -> AIDailySummary | None:
        result = await self._s.execute(
            sa.update(AIDailySummary)
            .where(
                AIDailySummary.id == summary_id,
                AIDailySummary.status == "pending",
            )
            .values(
                status="processing",
                last_attempt_at=datetime.now(UTC),
                attempt_count=AIDailySummary.attempt_count + 1,
            )
            .returning(AIDailySummary)
        )
        await self._s.commit()
        return result.scalar_one_or_none()

    async def complete(
        self,
        *,
        summary_id: str,
        title: str,
        summary: str,
        topics: list[dict],
        highlights: list[dict],
        recommended_entry_ids: list[str],
        input_tokens: int | None,
        output_tokens: int | None,
    ) -> None:
        await self._s.execute(
            sa.update(AIDailySummary)
            .where(AIDailySummary.id == summary_id)
            .values(
                status="done",
                title=title,
                summary=summary,
                topics=topics,
                highlights=highlights,
                recommended_entry_ids=recommended_entry_ids,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                generated_at=datetime.now(UTC),
                error_code=None,
                error_message=None,
            )
        )
        await self._s.commit()

    async def fail(self, *, summary_id: str, error_code: str, message: str) -> None:
        await self._s.execute(
            sa.update(AIDailySummary)
            .where(AIDailySummary.id == summary_id)
            .values(
                status="failed",
                error_code=error_code,
                error_message=message[:500],
            )
        )
        await self._s.commit()

    async def retry(self, *, user_id: str, summary_date: date) -> str | None:
        """Reset the latest failed row for this date+config to pending."""
        _, _, server_tz = await self.compute_current_set_hash(
            user_id=user_id, summary_date=summary_date
        )
        result = await self._s.execute(
            sa.update(AIDailySummary)
            .where(
                AIDailySummary.user_id == user_id,
                AIDailySummary.period == self._period,
                AIDailySummary.summary_date == summary_date,
                AIDailySummary.timezone == server_tz,
                AIDailySummary.model == self._model,
                AIDailySummary.prompt_version == self._prompt_version,
                AIDailySummary.target_language == self._target_language,
                AIDailySummary.status == "failed",
            )
            .values(status="pending", error_code=None, error_message=None)
            .returning(AIDailySummary.id)
        )
        await self._s.commit()
        return result.scalar_one_or_none()

    async def get_by_id(self, summary_id: str) -> AIDailySummary | None:
        return await self._s.get(AIDailySummary, summary_id)

    # ----------------------------------------------------------------------- #
    # Weekly aggregation — reduces over the week's DONE daily summary rows.
    # ----------------------------------------------------------------------- #

    async def list_week_daily_rows(
        self, *, user_id: str, week_start: date
    ) -> list[AIDailySummary]:
        """Return the DONE daily summaries for this user within the natural week."""
        rows = await self._s.execute(
            sa.select(AIDailySummary)
            .where(
                AIDailySummary.user_id == user_id,
                AIDailySummary.period == "day",
                AIDailySummary.status == "done",
                AIDailySummary.summary_date >= week_start,
                AIDailySummary.summary_date <= week_start + timedelta(days=6),
                AIDailySummary.model == self._model,
                AIDailySummary.target_language == self._target_language,
            )
            .order_by(AIDailySummary.summary_date)
        )
        return list(rows.scalars())

    async def enqueue_week(
        self, *, user_id: str, week_start: date
    ) -> EnqueueOutcome:
        """Atomically reserve a weekly placeholder over the week's done dailies."""
        dailies = await self.list_week_daily_rows(
            user_id=user_id, week_start=week_start
        )
        ids = sorted(d.id for d in dailies)
        if not ids:
            return EnqueueOutcome("no_entries", None, None, 0)

        set_hash = self.hash_set(ids)
        _, _, server_tz = AIIntegrationService(self._s).get_server_day_range(week_start)

        stmt = (
            pg_insert(AIDailySummary)
            .values(
                user_id=user_id,
                period="week",
                summary_date=week_start,
                period_start=week_start,
                period_end=week_start + timedelta(days=6),
                timezone=server_tz,
                model=self._model,
                prompt_version=self._prompt_version,
                target_language=self._target_language,
                source_set_hash=set_hash,
                source_ids=ids,
                status="pending",
                source="internal",
            )
            .on_conflict_do_nothing(constraint="uq_ai_daily_summary_tuple")
            .returning(AIDailySummary.id)
        )
        new_id = (await self._s.execute(stmt)).scalar_one_or_none()
        if new_id is not None:
            await self._s.commit()
            return EnqueueOutcome("queued", new_id, set_hash, len(ids))

        existing = (
            await self._s.execute(
                sa.select(AIDailySummary).where(
                    AIDailySummary.user_id == user_id,
                    AIDailySummary.period == "week",
                    AIDailySummary.summary_date == week_start,
                    AIDailySummary.timezone == server_tz,
                    AIDailySummary.model == self._model,
                    AIDailySummary.prompt_version == self._prompt_version,
                    AIDailySummary.target_language == self._target_language,
                    AIDailySummary.source_set_hash == set_hash,
                )
            )
        ).scalar_one()
        status: _EnqueueStatus = (
            "already_done" if existing.status == "done" else "in_flight"
        )
        return EnqueueOutcome(status, existing.id, set_hash, len(ids))

    async def lookup_week(self, *, user_id: str, week_start: date) -> LookupResult:
        """Return the cached weekly summary + staleness vs. the week's dailies.

        Staleness is computed against the set of DONE daily rows in the week
        (not against raw entries, which is what `lookup` does for the day case).
        """
        dailies = await self.list_week_daily_rows(
            user_id=user_id, week_start=week_start
        )
        ids = sorted(d.id for d in dailies)
        if not ids:
            return LookupResult(None, None, 0, False)
        current_hash = self.hash_set(ids)
        rows = await self._s.execute(
            sa.select(AIDailySummary)
            .where(
                AIDailySummary.user_id == user_id,
                AIDailySummary.period == "week",
                AIDailySummary.summary_date == week_start,
                AIDailySummary.model == self._model,
                AIDailySummary.prompt_version == self._prompt_version,
                AIDailySummary.target_language == self._target_language,
            )
            .order_by(AIDailySummary.updated_at.desc())
            .limit(1)
        )
        row = rows.scalar_one_or_none()
        is_stale = bool(row and row.source_set_hash != current_hash)
        return LookupResult(row, current_hash, len(ids), is_stale)

    async def load_week_items(self, *, daily_ids: list[str]) -> list[dict]:
        """Load done daily rows by id into compact items for the weekly prompt."""
        if not daily_ids:
            return []
        rows = await self._s.execute(
            sa.select(AIDailySummary)
            .where(AIDailySummary.id.in_(daily_ids))
            .order_by(AIDailySummary.summary_date)
        )
        return [
            {
                "date": r.summary_date.isoformat(),
                "title": r.title or "",
                "summary": r.summary or "",
                "topics": [t.get("name", "") for t in (r.topics or [])],
            }
            for r in rows.scalars()
        ]
