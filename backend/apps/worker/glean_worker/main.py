"""
Glean Worker - arq task queue entry point.

This module configures the arq worker with task functions,
cron jobs, and Redis connection settings.
"""

from collections.abc import Awaitable, Callable
from typing import Any, cast

from arq import cron
from arq.connections import RedisSettings
from arq.cron import CronJob

from glean_core import get_logger, init_logging
from glean_database.session import init_database

from .config import settings
from .tasks import (
    bookmark_metadata,
    cleanup,
    content_backfill,
    embedding_rebuild,
    embedding_worker,
    feed_fetcher,
    subscription_cleanup,
    summarize_day,
    summarize_week,
    summary_scheduler,
    translation,
)
from .timezone import resolve_worker_timezone

# Initialize logging system
init_logging()

# Get logger instance
logger = get_logger(__name__)

TaskFunction = Callable[..., Awaitable[Any]]


def _group_refresh_schedule_hours(interval_minutes: int) -> dict[int, set[int]]:
    """Return one day of cron hour buckets grouped by minute."""
    if interval_minutes <= 0:
        raise ValueError("feed_refresh_interval_minutes must be positive")
    if 1440 % interval_minutes != 0:
        raise ValueError("feed_refresh_interval_minutes must evenly divide 1440")

    grouped_hours: dict[int, set[int]] = {}
    for minute_of_day in range(0, 1440, interval_minutes):
        hour, minute = divmod(minute_of_day, 60)
        grouped_hours.setdefault(minute, set()).add(hour)
    return grouped_hours


async def startup(ctx: dict[str, Any]) -> None:
    """
    Worker startup handler.

    Args:
        ctx: Worker context dictionary for shared resources.
    """
    logger.info("=" * 60)
    logger.info("Starting Glean Worker")
    logger.info(
        f"Database URL: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'configured'}"
    )
    logger.info(
        f"Redis URL: {settings.redis_url.split('@')[1] if '@' in settings.redis_url else 'configured'}"
    )
    init_database(settings.database_url)
    logger.info("Database initialized")
    logger.info("Vector storage: pgvector (uses existing PostgreSQL database)")
    logger.info(f"Worker job timeout: {settings.worker_job_timeout_seconds}s")
    logger.info(f"Worker max jobs: {settings.worker_max_jobs}")
    logger.info(f"Feed refresh interval: {settings.feed_refresh_interval_minutes}m")
    logger.info(f"Worker timezone: {settings.worker_timezone}")

    # Store Redis client for distributed locks (arq provides it via ctx['redis'])
    logger.info("Redis client available for distributed locks")

    # Dynamically log registered task functions
    logger.info("Registered task functions:")
    for func in WorkerSettings.functions:
        func_name = cast(str, getattr(func, "__name__", repr(func)))
        logger.info(f"  - {func_name}")

    # Dynamically log scheduled cron jobs
    logger.info("Scheduled cron jobs:")
    for job in WorkerSettings.cron_jobs:
        # Extract function name and cron schedule from job
        func_name = "unknown"
        if hasattr(job, "coroutine") and hasattr(job.coroutine, "__name__"):
            func_name = job.coroutine.__name__  # type: ignore[union-attr]
        minute = getattr(job, "minute", "unknown")
        logger.info(f"  - {func_name} (minute: {minute})")
    logger.info("=" * 60)


async def shutdown(ctx: dict[str, Any]) -> None:
    """
    Worker shutdown handler.

    Args:
        ctx: Worker context dictionary.
    """
    logger.info("=" * 60)
    logger.info("Shutting down Glean Worker")
    logger.info("=" * 60)


def get_oss_functions() -> list[TaskFunction]:
    """Return all OSS task functions."""
    return [
        feed_fetcher.fetch_feed_task,
        feed_fetcher.fetch_all_feeds,
        content_backfill.enqueue_feed_content_backfill,
        content_backfill.backfill_entry_content_task,
        cleanup.cleanup_read_later,
        bookmark_metadata.fetch_bookmark_metadata_task,
        # M3: Embedding tasks (triggered immediately after feed fetch)
        embedding_worker.generate_entry_embedding,
        embedding_worker.batch_generate_embeddings,
        embedding_worker.retry_failed_embeddings,
        embedding_worker.validate_and_rebuild_embeddings,
        embedding_worker.download_embedding_model,
        embedding_rebuild.rebuild_embeddings,
        # Subscription cleanup
        subscription_cleanup.cleanup_orphan_embeddings,
        # Translation
        translation.translate_entry_task,
        # AI daily/weekly summaries
        summarize_day.summarize_day_task,
        summarize_week.summarize_week_task,
        summary_scheduler.scheduled_daily_summaries,
    ]


def get_oss_cron_jobs() -> list[CronJob]:
    """Return all OSS cron jobs."""
    cron_jobs: list[CronJob] = []
    for minute, hours in sorted(_group_refresh_schedule_hours(settings.feed_refresh_interval_minutes).items()):
        cron_jobs.append(
            cron(
                feed_fetcher.scheduled_fetch,
                hour=hours if len(hours) < 24 else None,
                minute=minute,
            )
        )

    cron_jobs.append(
        # Read-later cleanup (hourly at minute 0)
        cron(cleanup.scheduled_cleanup, minute=0)
    )

    for hour in sorted(summary_scheduler.parse_cron_hours(settings.summary_cron_hours)):
        cron_jobs.append(cron(summary_scheduler.scheduled_daily_summaries, hour=hour, minute=15))
    return cron_jobs


class WorkerSettings:
    """
    arq Worker configuration.

    Defines task functions, cron jobs, and worker settings.
    """

    functions: list[TaskFunction] = get_oss_functions()
    cron_jobs: list[CronJob] = get_oss_cron_jobs()

    # Lifecycle handlers
    on_startup = startup
    on_shutdown = shutdown

    # Redis connection settings
    redis_settings = RedisSettings.from_dsn(settings.redis_url)

    # Worker settings
    max_jobs = settings.worker_max_jobs
    job_timeout = settings.worker_job_timeout_seconds
    keep_result = 3600
    log_results = False
    timezone = resolve_worker_timezone(settings.worker_timezone)
