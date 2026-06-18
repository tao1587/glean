"""
Feed fetcher tasks.

Background tasks for fetching and parsing RSS feeds.
"""

import asyncio
import json
import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx
from arq import Retry
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from glean_api.feed_fetch_progress import (
    create_estimated_queued_feed_fetch_run,
    find_active_feed_fetch_run,
    find_reusable_active_feed_fetch_run,
)
from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
from glean_core.services import RSSHubService, TypedConfigService
from glean_database.models import Entry, Feed, FeedFetchRun, FeedStatus
from glean_database.session import get_session_context
from glean_rss import fetch_feed, fetch_or_synthesize_feed, parse_feed, postprocess_html

from ..config import settings
from ..timezone import resolve_worker_timezone
from .content_extraction import should_backfill_entry
from .feed_fetch_progress import (
    advance_feed_fetch_stage,
    build_feed_fetch_summary,
    classify_feed_fetch_path_kind,
    finalize_feed_fetch_run,
    get_profile_key_for_path,
    load_feed_fetch_run,
    refresh_running_eta,
    start_feed_fetch_run,
)

logger = get_logger(__name__)
MAX_FEED_ERROR_MESSAGE_LENGTH = 1000
# Column length limits for entries (see glean_database.models.entry.Entry).
# Upstream feeds occasionally emit values longer than these, which would
# otherwise raise asyncpg StringDataRightTruncationError and fail the whole feed.
ENTRY_TITLE_MAX_LENGTH = 1000
ENTRY_URL_MAX_LENGTH = 2000
ENTRY_AUTHOR_MAX_LENGTH = 200
ENTRY_GUID_MAX_LENGTH = 500
ENTRY_COMMIT_BATCH_SIZE = 20
RSSHUB_CIRCUIT_REDIS_KEY = "worker:rsshub:circuit"
RSSHUB_HEALTHCHECK_TIMEOUT_SECONDS = 5.0
RSSHUB_RETRY_BACKOFF_MINUTES = (2, 5, 10, 20, 30)


def _default_next_fetch_at() -> datetime:
    """Return the next scheduled refresh timestamp using worker settings."""
    return datetime.now(UTC) + timedelta(minutes=settings.feed_refresh_interval_minutes)


def _midnight_guard_minutes(interval_minutes: int) -> int:
    """Return the midnight supplemental guard window derived from the regular interval."""
    return max(60, min(180, interval_minutes // 2))


def _local_day_start_utc(now_utc: datetime) -> datetime:
    """Convert the current local midnight back to UTC for day-bounded comparisons."""
    local_now = now_utc.astimezone(resolve_worker_timezone(settings.worker_timezone))
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(UTC)


def _should_run_midnight_supplement(now_utc: datetime) -> bool:
    """Return True when the current scheduled tick is the local midnight batch."""
    local_now = now_utc.astimezone(resolve_worker_timezone(settings.worker_timezone))
    return local_now.hour == 0 and local_now.minute == 0


def _should_queue_midnight_supplemental_feed(
    feed: Feed,
    *,
    now_utc: datetime,
    day_start_utc: datetime,
    guard_minutes: int,
) -> bool:
    """Return True when midnight supplemental scheduling should include this feed."""
    if feed.status != FeedStatus.ACTIVE:
        return False
    if feed.last_fetch_success_at is not None and feed.last_fetch_success_at >= day_start_utc:
        return False

    guard_cutoff = now_utc - timedelta(minutes=guard_minutes)
    return not (
        feed.last_fetch_attempt_at is not None and feed.last_fetch_attempt_at >= guard_cutoff
    )


async def _load_scheduled_feeds(
    session: AsyncSession,
    *,
    now_utc: datetime,
    include_midnight_supplement: bool,
) -> list[Feed]:
    """Load the feeds eligible for the current scheduled batch."""
    if not include_midnight_supplement:
        result = await session.execute(
            select(Feed).where(
                Feed.status == FeedStatus.ACTIVE,
                (Feed.next_fetch_at.is_(None)) | (Feed.next_fetch_at <= now_utc),
            )
        )
        return list(result.scalars().all())

    result = await session.execute(select(Feed).where(Feed.status == FeedStatus.ACTIVE))
    active_feeds = result.scalars().all()
    day_start_utc = _local_day_start_utc(now_utc)
    guard_minutes = _midnight_guard_minutes(settings.feed_refresh_interval_minutes)

    eligible_feeds: list[Feed] = []
    for feed in active_feeds:
        is_due = feed.next_fetch_at is None or feed.next_fetch_at <= now_utc
        if is_due or _should_queue_midnight_supplemental_feed(
            feed,
            now_utc=now_utc,
            day_start_utc=day_start_utc,
            guard_minutes=guard_minutes,
        ):
            eligible_feeds.append(feed)

    return eligible_feeds


def _feed_uses_rsshub(feed: Feed) -> bool:
    """Return True when the feed was explicitly created as an RSSHub source."""
    return getattr(feed, "source_type", None) == "rsshub"


def _rsshub_retry_delay_minutes(failure_count: int) -> int:
    """Return capped backoff minutes for temporary RSSHub outages."""
    if failure_count <= 0:
        return RSSHUB_RETRY_BACKOFF_MINUTES[0]
    index = min(failure_count - 1, len(RSSHUB_RETRY_BACKOFF_MINUTES) - 1)
    return RSSHUB_RETRY_BACKOFF_MINUTES[index]


def _is_rsshub_infrastructure_error(error: Exception) -> bool:
    """Return True when the error indicates temporary RSSHub infrastructure failure."""
    error_text = str(error)
    transient_markers = (
        "No address associated with hostname",
        "Name or service not known",
        "Temporary failure in name resolution",
        "ConnectError",
        "ConnectTimeout",
        "ReadTimeout",
        "503 Service Unavailable",
        "502 Bad Gateway",
        "504 Gateway Timeout",
    )
    return any(marker in error_text for marker in transient_markers)


async def _load_rsshub_circuit_state(redis: Any) -> dict[str, Any]:
    """Load the shared RSSHub circuit breaker state from Redis."""
    if redis is None:
        return {"failure_count": 0, "blocked_until": None}

    raw_state = await redis.get(RSSHUB_CIRCUIT_REDIS_KEY)
    if not raw_state:
        return {"failure_count": 0, "blocked_until": None}

    if isinstance(raw_state, bytes):
        raw_state = raw_state.decode("utf-8")

    try:
        payload = json.loads(raw_state)
    except Exception:
        return {"failure_count": 0, "blocked_until": None}

    blocked_until_raw = payload.get("blocked_until")
    blocked_until = None
    if isinstance(blocked_until_raw, str):
        try:
            blocked_until = datetime.fromisoformat(blocked_until_raw)
        except ValueError:
            blocked_until = None
    return {
        "failure_count": int(payload.get("failure_count", 0) or 0),
        "blocked_until": blocked_until,
    }


async def _save_rsshub_circuit_state(
    redis: Any,
    *,
    failure_count: int,
    blocked_until: datetime | None,
) -> None:
    """Persist the shared RSSHub circuit breaker state to Redis."""
    if redis is None:
        return

    payload = json.dumps(
        {
            "failure_count": failure_count,
            "blocked_until": blocked_until.isoformat() if blocked_until else None,
        }
    )
    if blocked_until is None:
        await redis.delete(RSSHUB_CIRCUIT_REDIS_KEY)
        return

    ttl_seconds = max(int((blocked_until - datetime.now(UTC)).total_seconds()), 60)
    await redis.set(RSSHUB_CIRCUIT_REDIS_KEY, payload, ex=ttl_seconds)


async def _open_rsshub_circuit(redis: Any, *, now: datetime) -> datetime:
    """Advance the shared RSSHub circuit breaker and return the next unblock time."""
    state = await _load_rsshub_circuit_state(redis)
    failure_count = state["failure_count"] + 1
    delay_minutes = _rsshub_retry_delay_minutes(failure_count)
    blocked_until = now + timedelta(minutes=delay_minutes)
    await _save_rsshub_circuit_state(
        redis,
        failure_count=failure_count,
        blocked_until=blocked_until,
    )
    return blocked_until


async def _close_rsshub_circuit(redis: Any) -> None:
    """Clear the RSSHub circuit breaker after a healthy probe."""
    await _save_rsshub_circuit_state(redis, failure_count=0, blocked_until=None)


async def _probe_rsshub_health(urls: list[str]) -> bool:
    """Return True when the RSSHub origin responds successfully."""
    origins: list[str] = []
    for url in urls:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in origins:
            origins.append(origin)

    if not origins:
        return True

    try:
        async with httpx.AsyncClient(timeout=RSSHUB_HEALTHCHECK_TIMEOUT_SECONDS) as client:
            response = await client.get(origins[0])
            return response.status_code < 500
    except Exception:
        return False


async def _get_rsshub_blocked_until(
    redis: Any,
    *,
    now: datetime,
    rsshub_urls: list[str],
) -> datetime | None:
    """Return a temporary unblock time when RSSHub should be skipped for now."""
    if not rsshub_urls:
        return None

    state = await _load_rsshub_circuit_state(redis)
    blocked_until = state["blocked_until"]
    if isinstance(blocked_until, datetime) and blocked_until > now:
        return blocked_until

    if not await _probe_rsshub_health(rsshub_urls):
        return await _open_rsshub_circuit(redis, now=now)

    await _close_rsshub_circuit(redis)
    return None


def _is_duplicate_feed_guid_error(error: IntegrityError) -> bool:
    """Return True when IntegrityError is the entries(feed_id,guid) unique violation."""
    return "uq_feed_guid" in str(error.orig)


def _is_duplicate_feed_guid_exception(error: Exception) -> bool:
    """Return True when exception text indicates entries(feed_id,guid) duplicate violation."""
    error_text = str(error)
    return "uq_feed_guid" in error_text and "duplicate key value" in error_text


def _pick_existing_entry_for_backfill(existing_entries: Sequence[Entry]) -> Entry | None:
    """Return one deterministic existing entry that still needs content backfill."""
    for entry in existing_entries:
        if should_backfill_entry(
            content=entry.content,
            summary=entry.summary,
            content_source=entry.content_source,
            content_backfill_status=entry.content_backfill_status,
            force=False,
        ):
            return entry
    return None


def _is_entries_url_index_corrupted(error: Exception) -> bool:
    """Return True when PostgreSQL reports ix_entries_url index corruption."""
    error_text = str(error)
    return "IndexCorruptedError" in error_text and 'index "ix_entries_url"' in error_text


def _truncate_feed_error_message(
    message: str, max_length: int = MAX_FEED_ERROR_MESSAGE_LENGTH
) -> str:
    """Truncate long error messages to fit feeds.fetch_error_message column."""
    if len(message) <= max_length:
        return message
    suffix = "... [truncated]"
    return f"{message[: max_length - len(suffix)]}{suffix}"


def _truncate_entry_field(value: str | None, max_length: int) -> str | None:
    """Truncate an entry string field to its DB column limit.

    Upstream feeds (notably some WeChat-via-rsshub sources) occasionally emit
    over-long titles/guids; inserting them raw raises
    StringDataRightTruncationError and fails the entire feed fetch. Truncating
    keeps the entry instead of dropping the whole run.
    """
    if value is None:
        return None
    if len(value) <= max_length:
        return value
    return value[:max_length]


def _persist_run_path_metadata(
    run: FeedFetchRun | None,
    *,
    feed_url: str,
    used_url: str,
    fallback_urls: list[str],
) -> None:
    """Persist fetch path metadata without reading potentially stale ORM attributes."""
    if run is None:
        return

    path_kind = classify_feed_fetch_path_kind(
        feed_url=feed_url,
        used_url=used_url,
        fallback_urls=fallback_urls,
    )
    run.path_kind = path_kind
    run.profile_key = get_profile_key_for_path(path_kind, used_url)


async def _is_vectorization_enabled(session: AsyncSession) -> bool:
    """Check if vectorization is enabled and healthy."""
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)
    return config.enabled and config.status in (
        VectorizationStatus.IDLE,
        VectorizationStatus.REBUILDING,
    )


async def _load_persisted_run_for_job(
    session: AsyncSession,
    *,
    run_id: str | None,
    feed_id: str,
    job_id: str | None,
) -> FeedFetchRun | None:
    """Load the persisted progress run for the current worker job when possible."""
    persisted_run = await load_feed_fetch_run(session, run_id)
    if isinstance(persisted_run, FeedFetchRun):
        return persisted_run

    if job_id:
        result = await session.execute(
            select(FeedFetchRun)
            .where(
                FeedFetchRun.feed_id == feed_id,
                FeedFetchRun.job_id == job_id,
                FeedFetchRun.status.in_(("queued", "in_progress")),
            )
            .order_by(FeedFetchRun.created_at.desc())
            .limit(1)
        )
        persisted_run = result.scalar_one_or_none()
        if isinstance(persisted_run, FeedFetchRun):
            return persisted_run

    fallback_run = await find_active_feed_fetch_run(session, feed_id)
    return fallback_run if isinstance(fallback_run, FeedFetchRun) else None


async def fetch_feed_task(
    ctx: dict[str, Any],
    feed_id: str,
    backfill_existing_entries: bool = False,
    run_id: str | None = None,
    trigger_type: str | None = None,
) -> dict[str, str | int]:
    """
    Fetch and parse a single RSS feed.

    Args:
        ctx: Worker context.
        feed_id: Feed identifier to fetch.

    Returns:
        Dictionary with fetch results.
    """
    async with get_session_context() as session:
        effective_run_id = run_id or ctx.get("run_id")
        effective_trigger_type = trigger_type or ctx.get("trigger_type")
        persisted_run: FeedFetchRun | None = None
        active_stage = None
        active_stage_name: str | None = None
        run_summary = build_feed_fetch_summary()
        fallback_urls: list[str] = []
        used_url = ""
        retry_minutes = 5

        try:
            persisted_run = await _load_persisted_run_for_job(
                session,
                run_id=effective_run_id,
                feed_id=feed_id,
                job_id=ctx.get("job_id"),
            )
            active_stage = await start_feed_fetch_run(
                session,
                persisted_run,
                trigger_type=effective_trigger_type,
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)
            fetch_attempt_at = datetime.now(UTC)

            # Get feed from database
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if not feed:
                await finalize_feed_fetch_run(
                    session,
                    persisted_run,
                    active_stage,
                    run_status="error",
                    summary_json=run_summary,
                    error_message="Feed not found",
                    active_stage_status="error",
                    active_stage_summary="Feed row could not be loaded.",
                    completion_summary="Feed fetch failed before processing started.",
                    completion_metrics_json=run_summary,
                    skipped_stage_summary="Skipped because the feed no longer exists.",
                    fallback_active_stage_name=active_stage_name,
                )
                logger.error("Feed not found", extra={"feed_id": feed_id})
                return {"status": "error", "message": "Feed not found"}

            # Persist attempt timestamp early so long-running first syncs are visible in UI.
            feed.last_fetch_attempt_at = fetch_attempt_at
            await session.commit()

            # Build fallback sequence: source URL -> RSSHub converted URL (if available).
            rsshub_service = RSSHubService(session)
            fallback_source = feed.site_url or feed.url
            fallback_urls = await rsshub_service.convert_for_fetch(fallback_source)
            attempt_urls = [feed.url]
            for fallback_url in fallback_urls:
                if fallback_url not in attempt_urls:
                    attempt_urls.append(fallback_url)

            active_stage = await advance_feed_fetch_stage(
                session,
                persisted_run,
                active_stage,
                "fetch_xml",
                summary="Resolved candidate feed URLs.",
                metrics_json={"attempt_url_count": len(attempt_urls)},
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)

            parsed_feed = None
            feed_content: str | bytes | None = None
            cache_headers: dict[str, str] | None = None
            used_url = feed.url
            last_error: Exception | None = None

            for idx, attempt_url in enumerate(attempt_urls):
                try:
                    use_conditional = idx == 0  # ETag/Last-Modified only for primary source URL
                    primary_source_type = str(feed.source_type) if idx == 0 else None
                    if primary_source_type in (
                        "synthetic_jsonld",
                        "synthetic_sitemap",
                    ):
                        fetch_result = await fetch_or_synthesize_feed(
                            attempt_url,
                            primary_source_type,
                            None,
                            None,
                        )
                    else:
                        fetch_result = await fetch_feed(
                            attempt_url,
                            feed.etag if use_conditional else None,
                            feed.last_modified if use_conditional else None,
                        )

                    if fetch_result is None:
                        # Not modified (304) on primary URL.
                        # 304 means the feed was fetched successfully and unchanged.
                        # Clear previous fetch error state so admin "error" list is accurate.
                        feed.status = FeedStatus.ACTIVE
                        feed.error_count = 0
                        feed.fetch_error_message = None
                        feed.last_fetch_attempt_at = fetch_attempt_at
                        feed.last_fetch_success_at = fetch_attempt_at
                        feed.last_fetched_at = fetch_attempt_at
                        feed.next_fetch_at = _default_next_fetch_at()
                        run_summary["used_url"] = attempt_url
                        run_summary["fallback_used"] = attempt_url != feed.url
                        _persist_run_path_metadata(
                            persisted_run,
                            feed_url=feed.url,
                            used_url=attempt_url,
                            fallback_urls=fallback_urls,
                        )
                        if _feed_uses_rsshub(feed):
                            await _close_rsshub_circuit(ctx.get("redis"))
                        await finalize_feed_fetch_run(
                            session,
                            persisted_run,
                            active_stage,
                            run_status="not_modified",
                            summary_json=run_summary,
                            active_stage_summary="Feed returned 304 Not Modified.",
                            completion_summary="Feed fetch completed with no content changes.",
                            completion_metrics_json=run_summary,
                            skipped_stage_summary="Skipped because the feed was not modified.",
                            fallback_active_stage_name=active_stage_name,
                        )
                        return {"status": "not_modified", "new_entries": 0}

                    content, headers = fetch_result
                    feed_content = content
                    cache_headers = headers
                    used_url = attempt_url
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Feed fetch attempt failed",
                        extra={"feed_id": feed_id, "attempt_url": attempt_url, "error": str(e)},
                    )
                    continue

            if feed_content is None:
                if last_error:
                    raise last_error
                raise ValueError("Failed to fetch and parse feed")

            path_kind = classify_feed_fetch_path_kind(
                feed_url=feed.url,
                used_url=used_url,
                fallback_urls=fallback_urls,
            )
            run_summary["used_url"] = used_url
            run_summary["fallback_used"] = used_url != feed.url
            _persist_run_path_metadata(
                persisted_run,
                feed_url=feed.url,
                used_url=used_url,
                fallback_urls=fallback_urls,
            )
            if persisted_run is not None and active_stage is not None:
                await refresh_running_eta(session, persisted_run, active_stage)

            active_stage = await advance_feed_fetch_stage(
                session,
                persisted_run,
                active_stage,
                "parse_feed",
                summary="Fetched feed XML successfully.",
                metrics_json={"path_kind": path_kind},
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)
            parsed_feed = await parse_feed(feed_content, used_url)

            if used_url != feed.url:
                logger.info(
                    "Feed fetched via fallback source",
                    extra={"feed_id": feed_id, "source_url": feed.url, "fetched_url": used_url},
                )
            if _feed_uses_rsshub(feed):
                await _close_rsshub_circuit(ctx.get("redis"))
            uses_rsshub_subscription_source = _feed_uses_rsshub(feed)

            # Update feed metadata
            feed.title = parsed_feed.title or feed.title
            feed.description = parsed_feed.description or feed.description
            feed.site_url = parsed_feed.site_url or feed.site_url
            feed.language = parsed_feed.language or feed.language
            feed.icon_url = parsed_feed.icon_url or feed.icon_url
            feed.status = FeedStatus.ACTIVE
            feed.error_count = 0
            feed.fetch_error_message = None
            feed.last_fetch_attempt_at = fetch_attempt_at
            feed.last_fetch_success_at = fetch_attempt_at
            feed.last_fetched_at = fetch_attempt_at

            # Update cache headers
            if used_url == feed.url and cache_headers and "etag" in cache_headers:
                feed.etag = cache_headers["etag"]
            if used_url == feed.url and cache_headers and "last-modified" in cache_headers:
                feed.last_modified = cache_headers["last-modified"]

            run_summary["total_entries"] = len(parsed_feed.entries)
            active_stage = await advance_feed_fetch_stage(
                session,
                persisted_run,
                active_stage,
                "process_entries",
                summary="Parsed feed payload.",
                metrics_json={"total_entries": run_summary["total_entries"]},
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)

            # Process entries
            new_entries = 0
            latest_entry_time = feed.last_entry_at
            seen_guids: set[str] = set()
            queued_backfill_entry_ids: set[str] = set()
            queued_backfill_count = 0
            pending_inserts_since_commit = 0
            vectorization_enabled = await _is_vectorization_enabled(session)

            for parsed_entry in parsed_feed.entries:
                guid = (parsed_entry.guid or "").strip()
                # Truncate up front so dedup set, insert, and backfill lookup all agree.
                guid = _truncate_entry_field(guid, ENTRY_GUID_MAX_LENGTH) or ""
                if guid:
                    if guid in seen_guids:
                        continue
                    seen_guids.add(guid)

                # Determine content: fetch full text if feed only provides summary
                entry_content = parsed_entry.content
                content_source = (
                    "feed_fulltext" if parsed_entry.has_full_content else "feed_summary_only"
                )
                if not parsed_entry.has_full_content:
                    run_summary["summary_only_count"] += 1
                content_backfill_status = (
                    "done"
                    if parsed_entry.has_full_content
                    else "skipped"
                    if uses_rsshub_subscription_source
                    else "pending"
                )
                content_backfill_attempts = 0
                content_backfill_error = None
                content_backfill_at = None
                if parsed_entry.has_full_content and entry_content:
                    # Process content from feed to fix backtick formatting etc.
                    entry_content = await postprocess_html(entry_content, base_url=parsed_entry.url)

                # Insert atomically to avoid duplicate-key failures under concurrent fetches.
                insert_stmt = (
                    pg_insert(Entry)
                    .values(
                        feed_id=feed.id,
                        guid=guid,
                        url=_truncate_entry_field(parsed_entry.url, ENTRY_URL_MAX_LENGTH),
                        title=_truncate_entry_field(parsed_entry.title, ENTRY_TITLE_MAX_LENGTH),
                        author=_truncate_entry_field(parsed_entry.author, ENTRY_AUTHOR_MAX_LENGTH),
                        content=entry_content,
                        summary=parsed_entry.summary,
                        content_backfill_status=content_backfill_status,
                        content_backfill_attempts=content_backfill_attempts,
                        content_backfill_at=content_backfill_at,
                        content_backfill_error=content_backfill_error,
                        content_source=content_source,
                        published_at=parsed_entry.published_at,
                    )
                    .on_conflict_do_nothing(constraint="uq_feed_guid")
                    .returning(Entry.id)
                )
                try:
                    insert_result = await session.execute(insert_stmt)
                except IntegrityError as insert_error:
                    if _is_duplicate_feed_guid_error(insert_error):
                        continue
                    raise
                inserted_entry_id = insert_result.scalar_one_or_none()

                if not inserted_entry_id:
                    if (
                        not uses_rsshub_subscription_source
                        and backfill_existing_entries
                        and guid
                        and parsed_entry.url
                        and "redis" in ctx
                    ):
                        existing_entry_result = await session.execute(
                            select(Entry)
                            .where(Entry.feed_id == feed.id, Entry.guid == guid)
                            .order_by(Entry.created_at.desc(), Entry.id.desc())
                        )
                        existing_entry = _pick_existing_entry_for_backfill(
                            existing_entry_result.scalars().all()
                        )
                        if existing_entry and existing_entry.id not in queued_backfill_entry_ids:
                            await ctx["redis"].enqueue_job(
                                "backfill_entry_content_task", existing_entry.id, force=False
                            )
                            queued_backfill_entry_ids.add(existing_entry.id)
                            queued_backfill_count += 1
                    continue

                new_entries += 1
                pending_inserts_since_commit += 1
                run_summary["new_entries"] = new_entries

                requires_content_backfill = (
                    False
                    if uses_rsshub_subscription_source
                    else should_backfill_entry(
                        content=entry_content,
                        summary=parsed_entry.summary,
                        content_source=content_source,
                        content_backfill_status=content_backfill_status,
                        force=False,
                    )
                )
                if (
                    requires_content_backfill
                    and parsed_entry.url
                    and "redis" in ctx
                    and inserted_entry_id not in queued_backfill_entry_ids
                ):
                    await ctx["redis"].enqueue_job(
                        "backfill_entry_content_task", inserted_entry_id, force=False
                    )
                    queued_backfill_entry_ids.add(inserted_entry_id)
                    queued_backfill_count += 1

                # Only generate embeddings once the entry has full content or no backfill is needed.
                if vectorization_enabled and not requires_content_backfill:
                    await ctx["redis"].enqueue_job("generate_entry_embedding", inserted_entry_id)

                # Track latest entry time
                if parsed_entry.published_at and (
                    latest_entry_time is None or parsed_entry.published_at > latest_entry_time
                ):
                    latest_entry_time = parsed_entry.published_at

                if pending_inserts_since_commit >= ENTRY_COMMIT_BATCH_SIZE:
                    await session.commit()
                    pending_inserts_since_commit = 0

            active_stage = await advance_feed_fetch_stage(
                session,
                persisted_run,
                active_stage,
                "backfill_content",
                summary="Processed feed entries.",
                metrics_json=run_summary,
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)
            active_stage = await advance_feed_fetch_stage(
                session,
                persisted_run,
                active_stage,
                "store_results",
                summary="Queued background content backfill jobs.",
                metrics_json={"backfill_queued_count": queued_backfill_count},
            )
            active_stage_name = getattr(active_stage, "stage_name", active_stage_name)

            # Update last_entry_at and schedule next fetch
            if latest_entry_time:
                feed.last_entry_at = latest_entry_time

            # Schedule next fetch (15 minutes from now)
            feed.next_fetch_at = _default_next_fetch_at()

            await finalize_feed_fetch_run(
                session,
                persisted_run,
                active_stage,
                run_status="success",
                summary_json=run_summary,
                active_stage_summary="Stored feed updates.",
                active_stage_metrics_json=run_summary,
                completion_summary="Feed fetch completed successfully.",
                completion_metrics_json=run_summary,
                fallback_active_stage_name=active_stage_name,
            )

            logger.info(
                "Feed fetch complete: "
                f"feed_id={feed_id} url={feed.url} "
                f"status=success new_entries={new_entries} total_entries={len(parsed_feed.entries)}"
            )
            return {
                "status": "success",
                "feed_id": feed_id,
                "new_entries": new_entries,
                "total_entries": len(parsed_feed.entries),
            }

        except asyncio.CancelledError:
            # arq cancels the task when job_timeout is reached. Keep this to one
            # concise line instead of relying on the downstream traceback noise.
            logger.error(
                "Feed fetch timed out: "
                f"feed_id={feed_id} timeout_s={settings.worker_job_timeout_seconds} "
                f"cancelled_at_utc={datetime.now(UTC).isoformat()}"
            )
            if persisted_run is not None:
                await finalize_feed_fetch_run(
                    session,
                    persisted_run,
                    active_stage,
                    run_status="error",
                    summary_json=run_summary,
                    error_message="job_timeout",
                    active_stage_status="error",
                    active_stage_summary="Worker timed out while processing the feed.",
                    completion_summary="Feed fetch timed out.",
                    completion_metrics_json=run_summary,
                    skipped_stage_summary="Skipped after the worker timed out.",
                    fallback_active_stage_name=active_stage_name,
                )
                await session.commit()
            raise
        except Exception as e:
            logger.exception(
                "Failed to fetch feed",
                extra={"feed_id": feed_id, "failed_at_utc": datetime.now(UTC).isoformat()},
            )
            await session.rollback()
            if persisted_run is not None:
                persisted_run = await _load_persisted_run_for_job(
                    session,
                    run_id=effective_run_id,
                    feed_id=feed_id,
                    job_id=ctx.get("job_id"),
                )
            # Update feed error status
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if feed:
                fetch_attempt_at = datetime.now(UTC)
                feed.last_fetch_attempt_at = fetch_attempt_at
                feed.last_fetched_at = fetch_attempt_at

                # Duplicate guid is a benign idempotency race/path issue; do not count as feed failure.
                if _is_duplicate_feed_guid_exception(e):
                    feed.status = FeedStatus.ACTIVE
                    feed.error_count = 0
                    feed.fetch_error_message = None
                    feed.last_fetch_success_at = fetch_attempt_at
                    feed.next_fetch_at = _default_next_fetch_at()
                    _persist_run_path_metadata(
                        persisted_run,
                        feed_url=feed.url,
                        used_url=used_url or feed.url,
                        fallback_urls=fallback_urls,
                    )
                    await finalize_feed_fetch_run(
                        session,
                        persisted_run,
                        active_stage,
                        run_status="success",
                        summary_json=run_summary,
                        active_stage_status="error",
                        active_stage_summary="Duplicate guid race detected.",
                        completion_summary="Feed fetch finished after a duplicate-entry race.",
                        completion_metrics_json=run_summary,
                        skipped_stage_summary="Skipped after duplicate entry race.",
                        fallback_active_stage_name=active_stage_name,
                    )
                    await session.commit()
                    return {
                        "status": "success",
                        "feed_id": feed_id,
                        "new_entries": 0,
                        "total_entries": 0,
                    }

                # DB index corruption is an infrastructure incident, not a per-feed content failure.
                # Keep feed enabled and avoid incrementing error_count to prevent false disablement.
                if _is_entries_url_index_corrupted(e):
                    logger.error(
                        "Detected ix_entries_url corruption; preserving feed status",
                        extra={"feed_id": feed_id},
                    )
                    feed.status = FeedStatus.ACTIVE
                    feed.fetch_error_message = "Database index ix_entries_url is corrupted. Run REINDEX INDEX CONCURRENTLY ix_entries_url."
                    feed.next_fetch_at = _default_next_fetch_at()
                    _persist_run_path_metadata(
                        persisted_run,
                        feed_url=feed.url,
                        used_url=used_url or feed.url,
                        fallback_urls=fallback_urls,
                    )
                    await finalize_feed_fetch_run(
                        session,
                        persisted_run,
                        active_stage,
                        run_status="error",
                        summary_json=run_summary,
                        error_message="database_index_corrupted",
                        active_stage_status="error",
                        active_stage_summary="Database index corruption interrupted the run.",
                        completion_summary="Feed fetch failed due to database index corruption.",
                        completion_metrics_json=run_summary,
                        skipped_stage_summary="Skipped after the infrastructure error.",
                        fallback_active_stage_name=active_stage_name,
                    )
                    await session.commit()
                    return {"status": "error", "message": "database_index_corrupted"}

                if _feed_uses_rsshub(feed) and _is_rsshub_infrastructure_error(e):
                    blocked_until = await _open_rsshub_circuit(
                        ctx.get("redis"), now=fetch_attempt_at
                    )
                    retry_minutes = max(
                        math.ceil((blocked_until - fetch_attempt_at).total_seconds() / 60),
                        RSSHUB_RETRY_BACKOFF_MINUTES[0],
                    )
                    run_summary["retry_minutes"] = retry_minutes
                    feed.status = FeedStatus.ACTIVE
                    feed.fetch_error_message = "RSSHub is temporarily unavailable. Glean will retry automatically after the health window."
                    feed.next_fetch_at = blocked_until
                    _persist_run_path_metadata(
                        persisted_run,
                        feed_url=feed.url,
                        used_url=used_url or feed.url,
                        fallback_urls=fallback_urls,
                    )
                    await finalize_feed_fetch_run(
                        session,
                        persisted_run,
                        active_stage,
                        run_status="error",
                        summary_json=run_summary,
                        error_message="rsshub_temporarily_unavailable",
                        active_stage_status="error",
                        active_stage_summary="RSSHub was temporarily unavailable during fetch.",
                        completion_summary="Feed fetch was deferred until RSSHub recovers.",
                        completion_metrics_json=run_summary,
                        skipped_stage_summary="Skipped while waiting for RSSHub to recover.",
                        fallback_active_stage_name=active_stage_name,
                    )
                    await session.commit()
                    raise Retry(defer=timedelta(minutes=retry_minutes)) from None

                feed.error_count += 1
                feed.fetch_error_message = _truncate_feed_error_message(str(e))

                # Disable feed after 10 consecutive errors
                if feed.error_count >= 10:
                    logger.warning(
                        "Feed disabled after 10 consecutive errors",
                        extra={"feed_id": feed_id, "url": feed.url},
                    )
                    feed.status = FeedStatus.ERROR

                # Schedule retry with exponential backoff
                retry_minutes = min(60, 15 * (2 ** min(feed.error_count - 1, 5)))
                feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=retry_minutes)
                run_summary["retry_minutes"] = retry_minutes

                logger.warning(
                    "Feed fetch scheduled for retry",
                    extra={
                        "feed_id": feed_id,
                        "retry_minutes": retry_minutes,
                        "error_count": feed.error_count,
                    },
                )
                _persist_run_path_metadata(
                    persisted_run,
                    feed_url=feed.url,
                    used_url=used_url or feed.url,
                    fallback_urls=fallback_urls,
                )
                await finalize_feed_fetch_run(
                    session,
                    persisted_run,
                    active_stage,
                    run_status="error",
                    summary_json=run_summary,
                    error_message=str(e),
                    active_stage_status="error",
                    active_stage_summary="Worker stage failed and the run will be retried.",
                    completion_summary="Feed fetch failed and was scheduled for retry.",
                    completion_metrics_json=run_summary,
                    skipped_stage_summary="Skipped after the worker stage failed.",
                    fallback_active_stage_name=active_stage_name,
                )
                # Persist error status before raising Retry; otherwise context rollback
                # would discard these updates.
                await session.commit()

            # Retry the task
            raise Retry(defer=timedelta(minutes=retry_minutes if feed else 5)) from None


async def fetch_all_feeds(
    ctx: dict[str, Any],
    *,
    now_utc: datetime | None = None,
    include_midnight_supplement: bool = False,
    trigger_type: str = "scheduled",
) -> dict[str, int]:
    """
    Fetch all active feeds.

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    async with get_session_context() as session:
        now = now_utc or datetime.now(UTC)
        feeds = await _load_scheduled_feeds(
            session,
            now_utc=now,
            include_midnight_supplement=include_midnight_supplement,
        )
        rsshub_feeds = [feed for feed in feeds if _feed_uses_rsshub(feed)]
        rsshub_blocked_until = await _get_rsshub_blocked_until(
            ctx.get("redis"),
            now=now,
            rsshub_urls=[feed.url for feed in rsshub_feeds if getattr(feed, "url", None)],
        )

        # Queue tracked fetch tasks for each due feed so the UI can show ETA before
        # the worker starts processing.
        queued_count = 0
        deferred_rsshub_count = 0
        for feed in feeds:
            run: FeedFetchRun | None = None
            try:
                if rsshub_blocked_until is not None and _feed_uses_rsshub(feed):
                    feed.next_fetch_at = rsshub_blocked_until
                    deferred_rsshub_count += 1
                    continue

                if await find_reusable_active_feed_fetch_run(session, ctx["redis"], feed.id):
                    continue

                run, stage_event = await create_estimated_queued_feed_fetch_run(
                    session,
                    feed_id=feed.id,
                    trigger_type=trigger_type,
                    queue_depth_ahead=queued_count,
                )
                session.add(run)
                session.add(stage_event)
                await session.flush()
                run.job_id = run.id
                # Commit the queued run before enqueueing so worker execution can bind to it.
                await session.commit()

                job = await ctx["redis"].enqueue_job(
                    "fetch_feed_task",
                    feed.id,
                    _job_id=run.id,
                    run_id=run.id,
                    trigger_type=trigger_type,
                )
                job_id = getattr(job, "job_id", None) if job is not None else None
                if job_id != run.id:
                    raise RuntimeError("Failed to enqueue scheduled feed refresh job")

                feed.last_fetch_attempt_at = now
                await session.commit()
                queued_count += 1
            except Exception:
                if run is not None and getattr(run, "id", None):
                    await finalize_feed_fetch_run(
                        session,
                        run,
                        None,
                        run_status="error",
                        summary_json=build_feed_fetch_summary(),
                        error_message="Failed to enqueue scheduled feed refresh job",
                        active_stage_status="error",
                        active_stage_summary="Worker job could not be enqueued.",
                        completion_summary="Scheduled feed refresh failed before worker execution started.",
                        completion_metrics_json=build_feed_fetch_summary(),
                        skipped_stage_summary="Skipped because the worker job was never enqueued.",
                        fallback_active_stage_name="queue_wait",
                    )
                else:
                    await session.rollback()
                logger.exception("Failed to queue scheduled feed", extra={"feed_id": feed.id})

        if deferred_rsshub_count and queued_count == 0:
            await session.commit()

        logger.info(
            "Queued scheduled feeds for fetching",
            extra={
                "count": queued_count,
                "rsshub_deferred_count": deferred_rsshub_count,
                "trigger_type": trigger_type,
                "include_midnight_supplement": include_midnight_supplement,
            },
        )
        return {"feeds_queued": queued_count}


async def scheduled_fetch(ctx: dict[str, Any]) -> dict[str, int]:
    """
    Scheduled task to fetch all feeds.

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    now_utc = datetime.now(UTC)
    include_midnight_supplement = _should_run_midnight_supplement(now_utc)
    return await fetch_all_feeds(
        ctx,
        now_utc=now_utc,
        include_midnight_supplement=include_midnight_supplement,
        trigger_type="scheduled_midnight" if include_midnight_supplement else "scheduled",
    )


# Export task functions (arq uses the exported name)
fetch_feed_task_exported = fetch_feed_task
