"""Shared helpers for feed refresh enqueue/status APIs."""

from typing import cast

from arq.connections import ArqRedis
from arq.jobs import Job
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models import Feed

from .feed_fetch_progress import (
    create_estimated_queued_feed_fetch_run,
    find_reusable_active_feed_fetch_run,
    mark_active_run_as_stale,
)


async def enqueue_feed_refresh_job(
    session: AsyncSession,
    redis: ArqRedis,
    feed_id: str,
    feed_title: str,
    trigger_type: str,
    subscription_id: str | None = None,
    backfill_existing_entries: bool = False,
    queue_depth_ahead: int = 0,
) -> dict[str, str]:
    """Enqueue one feed refresh job and return unified payload."""
    existing_run = await find_reusable_active_feed_fetch_run(session, redis, feed_id)
    if existing_run is not None and existing_run.job_id:
        payload: dict[str, str] = {
            "run_id": existing_run.id,
            "feed_id": feed_id,
            "job_id": existing_run.job_id,
            "feed_title": feed_title,
        }
        if subscription_id:
            payload["subscription_id"] = subscription_id
        return payload

    run, stage_event = await create_estimated_queued_feed_fetch_run(
        session,
        feed_id=feed_id,
        trigger_type=trigger_type,
        queue_depth_ahead=queue_depth_ahead,
    )
    session.add(run)
    session.add(stage_event)
    await session.flush()

    job_id = run.id
    run.job_id = job_id
    # Persist the queued run before enqueueing so the worker can always reload it.
    await session.commit()

    try:
        job = await redis.enqueue_job(
            "fetch_feed_task",
            feed_id,
            backfill_existing_entries=backfill_existing_entries,
            _job_id=job_id,
            run_id=run.id,
            trigger_type=trigger_type,
        )
        returned_job_id = getattr(job, "job_id", None) if job is not None else None
        if returned_job_id != job_id:
            raise RuntimeError("Failed to enqueue feed refresh job")
    except Exception as exc:
        await mark_active_run_as_stale(
            session,
            run,
            reason="enqueue_failed",
            summary="Feed refresh job could not be enqueued.",
            public_diagnostic="Worker job could not be created.",
            error_message=str(exc),
        )
        raise

    payload: dict[str, str] = {
        "run_id": run.id,
        "feed_id": feed_id,
        "job_id": job_id,
        "feed_title": feed_title,
    }
    if subscription_id:
        payload["subscription_id"] = subscription_id
    return payload


async def build_refresh_status_item(
    redis: ArqRedis, feed_id: str, job_id: str, feed: Feed | None
) -> dict[str, str | int | None]:
    """Build a single feed refresh status item from arq job + feed row."""
    job = Job(job_id, redis)
    status_value = "unknown"
    result_status: str | None = None
    result_message: str | None = None
    result_new_entries: int | None = None
    result_total_entries: int | None = None

    try:
        status_info = await job.status()
        status_value = status_info.value
    except Exception as e:
        result_status = "error"
        result_message = str(e)

    if status_value == "not_found":
        result_status = "error"
        result_message = "Worker job is no longer available."
    elif status_value == "complete":
        try:
            job_result = await job.result(timeout=0)
            if isinstance(job_result, dict):
                result_payload = cast(dict[str, object], job_result)
                status_raw = result_payload.get("status")
                if isinstance(status_raw, str):
                    result_status = status_raw
                message_raw = result_payload.get("message")
                if message_raw:
                    result_message = str(message_raw)
                new_entries_raw = result_payload.get("new_entries")
                if isinstance(new_entries_raw, int):
                    result_new_entries = new_entries_raw
                total_entries_raw = result_payload.get("total_entries")
                if isinstance(total_entries_raw, int):
                    result_total_entries = total_entries_raw
            elif job_result is not None and not result_message:
                result_message = str(job_result)
        except Exception as e:
            result_status = "error"
            result_message = str(e)

    return {
        "feed_id": feed_id,
        "job_id": job_id,
        "status": status_value,
        "result_status": result_status,
        "new_entries": result_new_entries,
        "total_entries": result_total_entries,
        "message": result_message,
        "last_fetch_attempt_at": feed.last_fetch_attempt_at.isoformat()
        if feed and feed.last_fetch_attempt_at
        else None,
        "last_fetch_success_at": feed.last_fetch_success_at.isoformat()
        if feed and feed.last_fetch_success_at
        else None,
        # Backward compatibility for old clients.
        "last_fetched_at": feed.last_fetched_at.isoformat() if feed and feed.last_fetched_at else None,
        "error_count": int(feed.error_count) if feed else 0,
        "fetch_error_message": feed.fetch_error_message if feed else None,
    }


async def build_refresh_status_items(
    redis: ArqRedis, request_items: list[tuple[str, str]], feed_map: dict[str, Feed]
) -> list[dict[str, str | int | None]]:
    """Build refresh status payload for multiple feeds."""
    items: list[dict[str, str | int | None]] = []
    for feed_id, job_id in request_items:
        items.append(await build_refresh_status_item(redis, feed_id, job_id, feed_map.get(feed_id)))
    return items
