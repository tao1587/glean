"""Helpers for persisted feed fetch run lifecycle management."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from heapq import heapify, heappop, heappush
from typing import Any, TypedDict, cast
from urllib.parse import urlparse

from arq.connections import ArqRedis
from arq.jobs import Job
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_database.models import Feed, FeedFetchRun, FeedFetchStageEvent

from .config import settings

DEFAULT_INITIAL_QUEUE_DELAY = timedelta(seconds=30)
DEFAULT_INITIAL_RUN_DURATION = timedelta(minutes=2)
COMPLETED_JOB_GRACE_PERIOD = timedelta(minutes=2)
QUEUE_STAGE_NAME = "queue_wait"
QUEUE_STAGE_STATUS = "running"
COMPLETED_RUN_STATUSES = {"success", "not_modified", "error"}
ACTIVE_RUN_STATUSES = {"queued", "in_progress"}
ACTIVE_ARQ_JOB_STATUSES = {"deferred", "queued", "in_progress"}
DEFAULT_STAGE_SLOW_THRESHOLDS = {
    "queue_wait": timedelta(minutes=3),
    "resolve_attempt_urls": timedelta(seconds=20),
    "fetch_xml": timedelta(minutes=2),
    "parse_feed": timedelta(seconds=30),
    "process_entries": timedelta(minutes=2),
    "backfill_content": timedelta(minutes=5),
    "store_results": timedelta(minutes=1),
    "complete": timedelta(seconds=30),
}


class RunDurationEstimate(TypedDict):
    source: str
    path_kind: str | None
    predicted_run_duration: timedelta


def compute_initial_eta_fields(
    queued_at: datetime,
    queue_depth_ahead: int = 0,
    predicted_run_duration: timedelta = DEFAULT_INITIAL_RUN_DURATION,
    predicted_wait_duration: timedelta | None = None,
) -> tuple[datetime, datetime]:
    """Compute lightweight initial ETA values for a newly queued run."""
    if predicted_wait_duration is None:
        wait_seconds = max(queue_depth_ahead, 0) * int(DEFAULT_INITIAL_QUEUE_DELAY.total_seconds())
        predicted_wait_duration = timedelta(seconds=wait_seconds)
    predicted_start_at = queued_at + predicted_wait_duration
    predicted_finish_at = predicted_start_at + predicted_run_duration
    return predicted_start_at, predicted_finish_at


def create_queued_feed_fetch_run(
    feed_id: str,
    trigger_type: str,
    queue_depth_ahead: int = 0,
    path_kind: str | None = None,
    profile_key: str | None = None,
    predicted_run_duration: timedelta = DEFAULT_INITIAL_RUN_DURATION,
    predicted_wait_duration: timedelta | None = None,
) -> tuple[FeedFetchRun, FeedFetchStageEvent]:
    """Build a queued run and its initial queue stage event."""
    now = datetime.now(UTC)
    predicted_start_at, predicted_finish_at = compute_initial_eta_fields(
        queued_at=now,
        queue_depth_ahead=queue_depth_ahead,
        predicted_run_duration=predicted_run_duration,
        predicted_wait_duration=predicted_wait_duration,
    )
    run = FeedFetchRun(
        feed_id=feed_id,
        trigger_type=trigger_type,
        status="queued",
        current_stage=QUEUE_STAGE_NAME,
        path_kind=path_kind,
        profile_key=profile_key,
        queue_entered_at=now,
        predicted_start_at=predicted_start_at,
        predicted_finish_at=predicted_finish_at,
    )
    stage_event = FeedFetchStageEvent(
        run=run,
        stage_order=0,
        stage_name=QUEUE_STAGE_NAME,
        status=QUEUE_STAGE_STATUS,
        started_at=now,
    )
    return run, stage_event


async def create_estimated_queued_feed_fetch_run(
    session: AsyncSession,
    *,
    feed_id: str,
    trigger_type: str,
    queue_depth_ahead: int = 0,
) -> tuple[FeedFetchRun, FeedFetchStageEvent]:
    """Build a queued run using lightweight history-calibrated ETA defaults."""
    feed = await session.get(Feed, feed_id)
    path_kind, profile_key = await infer_eta_bucket(session, feed_id, feed.url if feed else None)
    duration_estimate = await estimate_run_duration_for_feed(
        session,
        feed_id=feed_id,
        path_kind=path_kind,
        profile_key=profile_key,
    )
    predicted_wait_duration = await estimate_queue_wait_duration(
        session,
        predicted_run_duration=duration_estimate["predicted_run_duration"],
        queue_depth_ahead=queue_depth_ahead,
    )
    run, stage_event = create_queued_feed_fetch_run(
        feed_id=feed_id,
        trigger_type=trigger_type,
        queue_depth_ahead=queue_depth_ahead,
        path_kind=path_kind,
        profile_key=profile_key,
        predicted_run_duration=duration_estimate["predicted_run_duration"],
        predicted_wait_duration=predicted_wait_duration,
    )
    await trim_feed_fetch_run_history(session, feed_id, keep_last=9)
    return run, stage_event


async def find_active_feed_fetch_run(
    session: AsyncSession,
    feed_id: str,
) -> FeedFetchRun | None:
    """Return the newest queued or in-progress run for one feed."""
    result = await session.execute(
        select(FeedFetchRun)
        .where(
            FeedFetchRun.feed_id == feed_id,
            FeedFetchRun.status.in_(ACTIVE_RUN_STATUSES),
        )
        .order_by(FeedFetchRun.created_at.desc())
        .limit(1)
        .options(selectinload(FeedFetchRun.stage_events))
    )
    return result.scalar_one_or_none()


async def find_reusable_active_feed_fetch_run(
    session: AsyncSession,
    redis: ArqRedis,
    feed_id: str,
) -> FeedFetchRun | None:
    """Return an active run only when its backing arq job still exists."""
    active_run = await find_active_feed_fetch_run(session, feed_id)
    if active_run is None:
        return None
    return await _reconcile_active_run_with_job_status(session, redis, active_run)


async def mark_active_run_as_stale(
    session: AsyncSession,
    run: FeedFetchRun,
    *,
    reason: str,
    summary: str,
    public_diagnostic: str | None = None,
    error_message: str | None = None,
) -> None:
    """Close an orphaned queued/running run so it no longer blocks fresh work."""
    refreshed_run = await reload_feed_fetch_run(
        session,
        run.id,
        include_stages=True,
        for_update=True,
    )
    if refreshed_run is not None:
        run = refreshed_run

    if run.status not in ACTIVE_RUN_STATUSES:
        return

    stage_events = await _load_stage_events_for_run(session, run, for_update=True)
    now = datetime.now(UTC)

    active_stage = next(
        (stage for stage in reversed(stage_events) if stage.finished_at is None),
        None,
    )
    if active_stage is not None:
        active_stage.status = "error"
        active_stage.finished_at = now
        active_stage.summary = summary
        active_stage.metrics_json = {
            **(active_stage.metrics_json or {}),
            "last_progress_at": now.isoformat(),
            "admin_diagnostic": f"Persisted run reconciled as stale: {reason}",
            "public_diagnostic": public_diagnostic or "Worker job is no longer available.",
        }
        session.add(active_stage)

    completion_stage = next(
        (stage for stage in reversed(stage_events) if stage.stage_name == "complete"),
        None,
    )
    if completion_stage is None:
        completion_stage = FeedFetchStageEvent(
            run_id=run.id,
            stage_order=_next_stage_order(stage_events),
            stage_name="complete",
            status="error",
            started_at=now,
            finished_at=now,
            summary=summary,
            metrics_json={"last_progress_at": now.isoformat()},
        )
        stage_events.append(completion_stage)
        session.add(completion_stage)
    else:
        completion_stage.status = "error"
        completion_stage.started_at = completion_stage.started_at or now
        completion_stage.finished_at = now
        completion_stage.summary = summary
        completion_stage.metrics_json = {
            **(completion_stage.metrics_json or {}),
            "last_progress_at": now.isoformat(),
        }
        session.add(completion_stage)

    run.status = "error"
    run.current_stage = "complete"
    run.finished_at = now
    run.predicted_finish_at = now
    run.summary_json = run.summary_json or {}
    run.error_message = error_message or run.error_message or reason
    session.add(run)
    await _commit_reconciled_active_run(session, run.id)


async def reconcile_completed_active_run(
    session: AsyncSession,
    run: FeedFetchRun,
    *,
    result_status: str | None,
    result_message: str | None,
    summary_json: dict[str, Any] | None,
) -> None:
    """Finalize an active persisted run using an arq job that already completed."""
    refreshed_run = await reload_feed_fetch_run(
        session,
        run.id,
        include_stages=True,
        for_update=True,
    )
    if refreshed_run is not None:
        run = refreshed_run

    if run.status not in ACTIVE_RUN_STATUSES:
        return

    stage_events = await _load_stage_events_for_run(session, run, for_update=True)
    now = datetime.now(UTC)
    normalized_status = _normalize_job_result_status(result_status)
    summary = _build_completed_job_summary(normalized_status, result_message)

    active_stage = next(
        (stage for stage in reversed(stage_events) if stage.finished_at is None),
        None,
    )
    if active_stage is not None:
        active_stage.status = "error" if normalized_status == "error" else "success"
        active_stage.finished_at = now
        active_stage.summary = summary
        active_stage.metrics_json = {
            **(active_stage.metrics_json or {}),
            "last_progress_at": now.isoformat(),
            "public_diagnostic": result_message or summary,
        }
        session.add(active_stage)

    completion_stage = next(
        (stage for stage in reversed(stage_events) if stage.stage_name == "complete"),
        None,
    )
    if completion_stage is None:
        completion_stage = FeedFetchStageEvent(
            run_id=run.id,
            stage_order=_next_stage_order(stage_events),
            stage_name="complete",
            status="error" if normalized_status == "error" else "success",
            started_at=now,
            finished_at=now,
            summary=summary,
            metrics_json={"last_progress_at": now.isoformat()},
        )
        stage_events.append(completion_stage)
        session.add(completion_stage)
    else:
        completion_stage.status = "error" if normalized_status == "error" else "success"
        completion_stage.started_at = completion_stage.started_at or now
        completion_stage.finished_at = now
        completion_stage.summary = summary
        completion_stage.metrics_json = {
            **(completion_stage.metrics_json or {}),
            "last_progress_at": now.isoformat(),
        }
        session.add(completion_stage)

    run.status = normalized_status
    run.current_stage = "complete"
    run.finished_at = now
    run.predicted_finish_at = now
    if summary_json is not None:
        run.summary_json = summary_json
    else:
        run.summary_json = run.summary_json or {}
    run.error_message = result_message if normalized_status == "error" else None
    session.add(run)
    await _commit_reconciled_active_run(session, run.id)


async def _load_completed_job_result(job: Job) -> dict[str, Any]:
    try:
        result = await job.result(timeout=0)
    except Exception as exc:
        return {"status": "error", "message": str(exc), "summary_json": None}

    if isinstance(result, dict):
        result_dict = cast(dict[str, Any], result)
        return {
            "status": result_dict.get("status"),
            "message": result_dict.get("message"),
            "summary_json": result_dict,
        }

    return {
        "status": "success",
        "message": str(result) if result is not None else None,
        "summary_json": None,
    }


def _normalize_job_result_status(result_status: str | None) -> str:
    if result_status == "not_modified":
        return "not_modified"
    if result_status == "success":
        return "success"
    return "error"


def _build_completed_job_summary(result_status: str, result_message: str | None) -> str:
    if result_status == "success":
        return "Persisted run was finalized from a completed worker job."
    if result_status == "not_modified":
        return "Persisted run was finalized from a completed worker job with no content changes."
    if result_message:
        return result_message
    return "Persisted run was finalized from a completed worker job that reported an error."


async def estimate_run_duration_for_feed(
    session: AsyncSession,
    *,
    feed_id: str,
    path_kind: str | None,
    profile_key: str | None,
) -> RunDurationEstimate:
    """Estimate one run duration from feed history, profile history, or global default."""
    feed_runs_result = await session.execute(
        select(FeedFetchRun)
        .where(
            FeedFetchRun.feed_id == feed_id,
            FeedFetchRun.status.in_(COMPLETED_RUN_STATUSES),
            FeedFetchRun.started_at.is_not(None),
            FeedFetchRun.finished_at.is_not(None),
            FeedFetchRun.path_kind == path_kind,
        )
        .order_by(FeedFetchRun.created_at.desc())
        .limit(10)
    )
    feed_runs = feed_runs_result.scalars().all()
    if path_kind and len(feed_runs) >= 3:
        return {
            "source": "feed",
            "path_kind": path_kind,
            "predicted_run_duration": _weighted_average_run_duration(feed_runs),
        }

    profile_runs: Sequence[FeedFetchRun] = ()
    if profile_key:
        profile_runs_result = await session.execute(
            select(FeedFetchRun)
            .where(
                FeedFetchRun.profile_key == profile_key,
                FeedFetchRun.status.in_(COMPLETED_RUN_STATUSES),
                FeedFetchRun.started_at.is_not(None),
                FeedFetchRun.finished_at.is_not(None),
            )
            .order_by(FeedFetchRun.created_at.desc())
            .limit(10)
        )
        profile_runs = profile_runs_result.scalars().all()
        if profile_runs:
            return {
                "source": "profile",
                "path_kind": path_kind,
                "predicted_run_duration": _weighted_average_run_duration(profile_runs),
            }

    return {
        "source": "global",
        "path_kind": path_kind,
        "predicted_run_duration": DEFAULT_INITIAL_RUN_DURATION,
    }


async def estimate_queue_wait_duration(
    session: AsyncSession,
    *,
    predicted_run_duration: timedelta,
    queue_depth_ahead: int = 0,
) -> timedelta:
    """Estimate queue wait using active runs and worker concurrency."""
    now = datetime.now(UTC)
    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(
            FeedFetchRun.started_at.is_(None),
            FeedFetchRun.queue_entered_at.asc().nulls_last(),
            FeedFetchRun.created_at.asc(),
        )
    )
    active_runs = result.scalars().all()
    remaining_durations = [_remaining_run_duration(run, now) for run in active_runs]

    if queue_depth_ahead > len(active_runs):
        default_duration = max(predicted_run_duration, DEFAULT_INITIAL_QUEUE_DELAY)
        remaining_durations.extend([default_duration] * (queue_depth_ahead - len(active_runs)))

    if not remaining_durations:
        return timedelta(0)

    worker_slots = max(settings.worker_max_jobs, 1)
    slot_available_seconds = [0.0] * worker_slots
    heapify(slot_available_seconds)

    for duration in remaining_durations:
        available_at = heappop(slot_available_seconds)
        heappush(slot_available_seconds, available_at + max(duration.total_seconds(), 0.0))

    return timedelta(seconds=min(slot_available_seconds))


async def infer_eta_bucket(
    session: AsyncSession,
    feed_id: str,
    feed_url: str | None,
) -> tuple[str | None, str | None]:
    """Infer the best available path/profile bucket for a newly queued run."""
    latest_result = await session.execute(
        select(FeedFetchRun)
        .where(
            FeedFetchRun.feed_id == feed_id,
            FeedFetchRun.path_kind.is_not(None),
        )
        .order_by(FeedFetchRun.created_at.desc())
        .limit(1)
    )
    latest_run = latest_result.scalar_one_or_none()
    if latest_run and latest_run.path_kind:
        return latest_run.path_kind, latest_run.profile_key

    if not feed_url:
        return None, None

    host = (urlparse(feed_url).hostname or "").lower()
    if "rsshub" in host:
        route_family = _derive_rsshub_route_family(urlparse(feed_url).path)
        return "rsshub_primary", f"rsshub_primary:{route_family}" if route_family else None
    return "direct_feed", f"direct:{host}" if host else None


def serialize_feed_fetch_stage_event(
    stage_event: FeedFetchStageEvent,
    *,
    include_admin_diagnostic: bool = False,
) -> dict[str, Any]:
    """Serialize one persisted stage event for API responses."""
    diagnostics = _build_stage_diagnostics(stage_event)
    if not include_admin_diagnostic:
        diagnostics["admin_diagnostic"] = None
    return {
        "id": stage_event.id,
        "stage_order": stage_event.stage_order,
        "stage_name": stage_event.stage_name,
        "status": stage_event.status,
        "started_at": stage_event.started_at.isoformat() if stage_event.started_at else None,
        "finished_at": stage_event.finished_at.isoformat() if stage_event.finished_at else None,
        "summary": stage_event.summary,
        "metrics_json": stage_event.metrics_json,
        **diagnostics,
    }


def serialize_feed_fetch_run(
    run: FeedFetchRun,
    *,
    next_fetch_at: datetime | None = None,
    last_fetch_attempt_at: datetime | None = None,
    last_fetch_success_at: datetime | None = None,
    last_fetched_at: datetime | None = None,
    include_admin_diagnostic: bool = False,
    include_stages: bool = True,
) -> dict[str, Any]:
    """Serialize one persisted feed fetch run for API responses."""
    payload: dict[str, Any] = {
        "id": run.id,
        "feed_id": run.feed_id,
        "job_id": run.job_id,
        "trigger_type": run.trigger_type,
        "status": run.status,
        "current_stage": run.current_stage,
        "path_kind": run.path_kind,
        "profile_key": run.profile_key,
        "queue_entered_at": run.queue_entered_at.isoformat() if run.queue_entered_at else None,
        "predicted_start_at": run.predicted_start_at.isoformat() if run.predicted_start_at else None,
        "predicted_finish_at": run.predicted_finish_at.isoformat() if run.predicted_finish_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "summary_json": run.summary_json,
        "error_message": run.error_message,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "next_fetch_at": next_fetch_at.isoformat() if next_fetch_at else None,
        "last_fetch_attempt_at": last_fetch_attempt_at.isoformat() if last_fetch_attempt_at else None,
        "last_fetch_success_at": last_fetch_success_at.isoformat() if last_fetch_success_at else None,
        "last_fetched_at": last_fetched_at.isoformat() if last_fetched_at else None,
    }
    if include_stages:
        payload["stages"] = [
            serialize_feed_fetch_stage_event(
                stage_event,
                include_admin_diagnostic=include_admin_diagnostic,
            )
            for stage_event in run.stage_events
        ]
    else:
        payload["stages"] = []
    return payload


async def load_latest_feed_fetch_runs(
    session: AsyncSession,
    feed_ids: Sequence[str],
) -> dict[str, FeedFetchRun]:
    """Load the latest persisted run snapshot for each requested feed."""
    if not feed_ids:
        return {}

    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.feed_id.in_(feed_ids))
        .order_by(FeedFetchRun.feed_id, FeedFetchRun.created_at.desc())
    )
    latest_by_feed: dict[str, FeedFetchRun] = {}
    for run in result.scalars().all():
        latest_by_feed.setdefault(run.feed_id, run)
    return latest_by_feed


async def reload_feed_fetch_run(
    session: AsyncSession,
    run_id: str,
    *,
    include_stages: bool = False,
    for_update: bool = False,
) -> FeedFetchRun | None:
    """Reload one persisted run to avoid serializing expired ORM state."""
    stmt = (
        select(FeedFetchRun)
        .where(FeedFetchRun.id == run_id)
        .execution_options(populate_existing=True)
    )
    if for_update:
        stmt = stmt.with_for_update()
    if include_stages:
        stmt = stmt.options(selectinload(FeedFetchRun.stage_events))
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def _next_stage_order(stage_events: Sequence[FeedFetchStageEvent]) -> int:
    """Allocate stage order from persisted values instead of collection length."""
    if not stage_events:
        return 0
    return max(stage.stage_order for stage in stage_events) + 1


async def _load_stage_events_for_run(
    session: AsyncSession,
    run: FeedFetchRun,
    *,
    for_update: bool = False,
) -> list[FeedFetchStageEvent]:
    stmt = (
        select(FeedFetchStageEvent)
        .where(FeedFetchStageEvent.run_id == run.id)
        .order_by(FeedFetchStageEvent.stage_order.asc())
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _commit_reconciled_active_run(session: AsyncSession, run_id: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        refreshed_run = await reload_feed_fetch_run(session, run_id, include_stages=False)
        if refreshed_run is None or refreshed_run.status not in ACTIVE_RUN_STATUSES:
            return
        raise


async def _reconcile_active_run_with_job_status(
    session: AsyncSession,
    redis: ArqRedis,
    active_run: FeedFetchRun,
) -> FeedFetchRun | None:
    if not active_run.job_id:
        await mark_active_run_as_stale(
            session,
            active_run,
            reason="missing_job_id",
            summary="Persisted run was missing a worker job id.",
        )
        return None

    try:
        status_info = await Job(active_run.job_id, redis).status()
        status_value = status_info.value
    except Exception:
        # Avoid clearing active runs when Redis status cannot be checked.
        return active_run

    if status_value in ACTIVE_ARQ_JOB_STATUSES:
        return active_run

    if status_value == "not_found":
        await mark_active_run_as_stale(
            session,
            active_run,
            reason="job_not_found",
            summary="Persisted run was reconciled after arq reported not_found.",
            public_diagnostic="Worker job is no longer available.",
        )
        return None

    if status_value == "complete":
        last_update_at = active_run.updated_at or active_run.started_at or active_run.created_at
        if datetime.now(UTC) - last_update_at < COMPLETED_JOB_GRACE_PERIOD:
            return active_run

        result_payload = await _load_completed_job_result(Job(active_run.job_id, redis))
        await reconcile_completed_active_run(
            session,
            active_run,
            result_status=result_payload.get("status"),
            result_message=result_payload.get("message"),
            summary_json=result_payload.get("summary_json"),
        )
        return None

    return active_run


async def load_active_feed_fetch_runs(
    session: AsyncSession,
    *,
    feed_ids: Sequence[str] | None = None,
) -> list[tuple[FeedFetchRun, Feed]]:
    """Load queued or running fetch runs with feed metadata."""
    stmt = (
        select(FeedFetchRun, Feed)
        .join(Feed, Feed.id == FeedFetchRun.feed_id)
        .options(selectinload(FeedFetchRun.stage_events))
        .where(FeedFetchRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(
            FeedFetchRun.started_at.is_(None),
            FeedFetchRun.queue_entered_at.asc().nulls_last(),
            FeedFetchRun.created_at.asc(),
        )
    )
    if feed_ids is not None:
        if not feed_ids:
            return []
        stmt = stmt.where(FeedFetchRun.feed_id.in_(feed_ids))
    result = await session.execute(stmt)
    return [(cast(FeedFetchRun, run), cast(Feed, feed)) for run, feed in result.all()]


async def reconcile_active_feed_fetch_runs(
    session: AsyncSession,
    redis: ArqRedis,
    *,
    feed_ids: Sequence[str] | None = None,
) -> None:
    """Reconcile stale queued/running runs against Redis before serializing queue state."""
    active_runs = await load_active_feed_fetch_runs(session, feed_ids=feed_ids)
    for run, _feed in active_runs:
        await _reconcile_active_run_with_job_status(session, redis, run)


def _weighted_average_run_duration(runs: Sequence[FeedFetchRun]) -> timedelta:
    durations = [
        (run.finished_at - run.started_at).total_seconds()
        for run in runs
        if run.started_at is not None and run.finished_at is not None
    ]
    if not durations:
        return DEFAULT_INITIAL_RUN_DURATION
    weighted_total = 0.0
    total_weight = 0.0
    for index, duration in enumerate(durations):
        weight = len(durations) - index
        weighted_total += duration * weight
        total_weight += weight
    return timedelta(seconds=weighted_total / total_weight)


def _remaining_run_duration(run: FeedFetchRun, now: datetime) -> timedelta:
    if run.status == "in_progress":
        if run.predicted_finish_at and run.predicted_finish_at > now:
            return run.predicted_finish_at - now
        if run.started_at and run.predicted_start_at and run.predicted_finish_at:
            predicted_total = run.predicted_finish_at - run.predicted_start_at
            elapsed = max(now - run.started_at, timedelta(0))
            return max(predicted_total - elapsed, timedelta(seconds=5))
        return DEFAULT_INITIAL_RUN_DURATION

    if run.predicted_start_at and run.predicted_finish_at:
        return max(run.predicted_finish_at - run.predicted_start_at, DEFAULT_INITIAL_QUEUE_DELAY)
    return DEFAULT_INITIAL_RUN_DURATION


def _derive_rsshub_route_family(path: str) -> str | None:
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return None
    if segments[0] == "bilibili" and len(segments) >= 3 and segments[1] == "user":
        return "_".join(segments[:3])
    if len(segments) >= 2:
        return "_".join(segments[:2])
    return segments[0]


def _build_stage_diagnostics(stage_event: FeedFetchStageEvent) -> dict[str, Any]:
    metrics = stage_event.metrics_json or {}
    now = datetime.now(UTC)
    threshold = DEFAULT_STAGE_SLOW_THRESHOLDS.get(stage_event.stage_name, timedelta(minutes=2))
    if stage_event.started_at is None:
        elapsed_seconds: int | None = None
        is_slow = False
    else:
        effective_end = stage_event.finished_at or now
        elapsed_seconds = max(int((effective_end - stage_event.started_at).total_seconds()), 0)
        is_slow = stage_event.status == "running" and elapsed_seconds > int(threshold.total_seconds())

    public_diagnostic = metrics.get("public_diagnostic")
    admin_diagnostic = metrics.get("admin_diagnostic")
    if not isinstance(public_diagnostic, str) or not public_diagnostic:
        public_diagnostic = _default_public_diagnostic(stage_event.stage_name, is_slow)
    if not isinstance(admin_diagnostic, str) or not admin_diagnostic:
        admin_diagnostic = _default_admin_diagnostic(
            stage_event.stage_name,
            is_slow,
            elapsed_seconds,
            int(threshold.total_seconds()),
        )

    return {
        "last_progress_at": _coerce_iso_datetime(metrics.get("last_progress_at")),
        "is_slow": is_slow,
        "slow_threshold_seconds": int(threshold.total_seconds()),
        "elapsed_seconds": elapsed_seconds,
        "public_diagnostic": public_diagnostic,
        "admin_diagnostic": admin_diagnostic,
    }


def _coerce_iso_datetime(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _default_public_diagnostic(stage_name: str, is_slow: bool) -> str | None:
    if not is_slow:
        return None
    return {
        "queue_wait": "Waiting for worker capacity.",
        "resolve_attempt_urls": "Resolving feed source paths.",
        "fetch_xml": "Waiting for the feed source to respond.",
        "parse_feed": "Parsing the feed payload.",
        "process_entries": "Processing feed entries.",
        "backfill_content": "Backfilling article content.",
        "store_results": "Writing feed updates to storage.",
        "complete": "Finalizing the fetch run.",
    }.get(stage_name, "This stage is taking longer than expected.")


def _default_admin_diagnostic(
    stage_name: str,
    is_slow: bool,
    elapsed_seconds: int | None,
    threshold_seconds: int,
) -> str | None:
    if not is_slow:
        return None
    elapsed_suffix = f" elapsed={elapsed_seconds}s threshold={threshold_seconds}s" if elapsed_seconds is not None else ""
    return f"Stage {stage_name} is running longer than expected.{elapsed_suffix}"


async def trim_feed_fetch_run_history(
    session: AsyncSession,
    feed_id: str,
    *,
    keep_last: int = 10,
) -> None:
    """Delete older persisted runs beyond the configured per-feed retention window."""
    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.feed_id == feed_id)
        .order_by(FeedFetchRun.created_at.desc())
    )
    runs = result.scalars().all()
    for run in runs[keep_last:]:
        await session.delete(run)
