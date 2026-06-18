"""Persisted feed fetch progress helpers for worker execution."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, TypedDict
from urllib.parse import urlparse

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.exc import NoInspectionAvailable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_database.models import FeedFetchRun, FeedFetchStageEvent


class FeedFetchSummary(TypedDict):
    new_entries: int
    total_entries: int
    summary_only_count: int
    backfill_attempted_count: int
    backfill_success_http_count: int
    backfill_success_browser_count: int
    backfill_failed_count: int
    fallback_used: bool
    used_url: str | None
    retry_minutes: int | None


JsonObject = Mapping[str, Any]

FEED_FETCH_STAGE_SEQUENCE = [
    "queue_wait",
    "resolve_attempt_urls",
    "fetch_xml",
    "parse_feed",
    "process_entries",
    "backfill_content",
    "store_results",
    "complete",
]
_SUMMARY_KEYS = (
    "new_entries",
    "total_entries",
    "summary_only_count",
    "backfill_attempted_count",
    "backfill_success_http_count",
    "backfill_success_browser_count",
    "backfill_failed_count",
    "fallback_used",
    "used_url",
    "retry_minutes",
)
DEFAULT_STAGE_DURATIONS = {
    "resolve_attempt_urls": timedelta(seconds=5),
    "fetch_xml": timedelta(seconds=20),
    "parse_feed": timedelta(seconds=5),
    "process_entries": timedelta(seconds=20),
    "backfill_content": timedelta(seconds=60),
    "store_results": timedelta(seconds=10),
    "complete": timedelta(seconds=1),
}


def _with_progress_metrics(
    metrics_json: JsonObject | None,
    *,
    now: datetime,
) -> dict[str, Any]:
    payload: dict[str, Any] = dict(metrics_json or {})
    payload["last_progress_at"] = now.isoformat()
    return payload


def build_feed_fetch_summary(
    **overrides: int | bool | str | None,
) -> FeedFetchSummary:
    """Build a normalized run summary payload."""
    summary: FeedFetchSummary = {
        "new_entries": 0,
        "total_entries": 0,
        "summary_only_count": 0,
        "backfill_attempted_count": 0,
        "backfill_success_http_count": 0,
        "backfill_success_browser_count": 0,
        "backfill_failed_count": 0,
        "fallback_used": False,
        "used_url": None,
        "retry_minutes": None,
    }
    for key, value in overrides.items():
        if key in summary:
            summary[key] = value
    return summary


def estimate_run_duration(
    *,
    path_kind: str | None,
    feed_runs: Sequence[FeedFetchRun],
    profile_runs: Sequence[FeedFetchRun],
    default_duration: timedelta = timedelta(minutes=2),
) -> dict[str, object]:
    """Estimate one run duration using feed, then profile, then global history."""
    normalized_feed_durations = _extract_run_durations(feed_runs)
    if path_kind and len(normalized_feed_durations) >= 3:
        return {
            "source": "feed",
            "path_kind": path_kind,
            "predicted_run_duration": _average_duration(normalized_feed_durations),
        }

    normalized_profile_durations = _extract_run_durations(profile_runs)
    if path_kind and normalized_profile_durations:
        return {
            "source": "profile",
            "path_kind": path_kind,
            "predicted_run_duration": _average_duration(normalized_profile_durations),
        }

    return {
        "source": "global",
        "path_kind": path_kind,
        "predicted_run_duration": default_duration,
    }


async def load_feed_fetch_run(session: AsyncSession, run_id: str | None) -> FeedFetchRun | None:
    """Load one persisted run with stage events when a run id is available."""
    if not run_id:
        return None

    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.id == run_id)
        .options(selectinload(FeedFetchRun.stage_events))
    )
    return result.scalar_one_or_none()


def _should_use_explicit_stage_event_io(run: FeedFetchRun) -> bool:
    state = sa_inspect(run)
    return state.persistent or state.detached


async def _load_stage_events_for_run(
    session: AsyncSession,
    run: FeedFetchRun,
) -> list[FeedFetchStageEvent]:
    if not _should_use_explicit_stage_event_io(run):
        return list(run.stage_events)

    result = await session.execute(
        select(FeedFetchStageEvent)
        .where(FeedFetchStageEvent.run_id == run.id)
        .order_by(FeedFetchStageEvent.stage_order.asc())
    )
    return list(result.scalars().all())


async def _clear_stage_events_for_run(
    session: AsyncSession,
    run: FeedFetchRun,
    stage_events: list[FeedFetchStageEvent],
) -> list[FeedFetchStageEvent]:
    if _should_use_explicit_stage_event_io(run):
        for stage_event in stage_events:
            await session.delete(stage_event)
        if "stage_events" in run.__dict__:
            run.stage_events.clear()
        await session.flush()
        return []

    run.stage_events.clear()
    return list(run.stage_events)


def _new_stage_event(
    run: FeedFetchRun,
    *,
    stage_order: int,
    stage_name: str,
    status: str,
    started_at: datetime,
    finished_at: datetime | None = None,
    summary: str | None = None,
    metrics_json: JsonObject | None = None,
) -> FeedFetchStageEvent:
    payload = {
        "stage_order": stage_order,
        "stage_name": stage_name,
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "summary": summary,
        "metrics_json": _with_progress_metrics(metrics_json, now=started_at),
    }
    if _should_use_explicit_stage_event_io(run):
        return FeedFetchStageEvent(run_id=run.id, **payload)
    return FeedFetchStageEvent(run=run, **payload)


def classify_feed_fetch_path_kind(
    *, feed_url: str, used_url: str, fallback_urls: list[str]
) -> str:
    """Classify whether the successful fetch path was direct or RSSHub-based."""
    normalized_feed_url = _normalize_url(feed_url)
    normalized_used_url = _normalize_url(used_url)
    normalized_fallback_urls = {_normalize_url(url) for url in fallback_urls}

    if normalized_used_url in normalized_fallback_urls and normalized_used_url != normalized_feed_url:
        return "rsshub_fallback"

    if normalized_feed_url in normalized_fallback_urls or _looks_like_rsshub_host(normalized_feed_url):
        return "rsshub_primary"

    return "direct_feed"


def get_profile_key_for_path(path_kind: str | None, url: str | None) -> str | None:
    """Build a lightweight ETA profile key for the successful fetch path."""
    if not path_kind or not url:
        return None

    parsed = urlparse(url)
    if path_kind == "direct_feed":
        host = parsed.netloc.lower()
        return f"direct:{host}" if host else None

    if path_kind not in {"rsshub_primary", "rsshub_fallback"}:
        return None

    route_family = _derive_rsshub_route_family(parsed.path)
    if not route_family:
        return None
    return f"{path_kind}:{route_family}"


async def start_feed_fetch_run(
    session: AsyncSession,
    run: FeedFetchRun | None,
    *,
    trigger_type: str | None = None,
) -> FeedFetchStageEvent | None:
    """Close queue wait and open the first worker stage."""
    if run is None:
        return None

    now = datetime.now(UTC)
    stage_events = await _load_stage_events_for_run(session, run)
    if run.current_stage == "complete" or run.finished_at is not None:
        stage_events = await _clear_stage_events_for_run(session, run, stage_events)
        run.status = "queued"
        run.current_stage = "queue_wait"
        run.started_at = None
        run.finished_at = None
        run.summary_json = None
        run.error_message = None
        run.path_kind = None
        run.profile_key = None
        stage_events.append(
            _new_stage_event(
                run,
                stage_order=0,
                stage_name="queue_wait",
                status="running",
                started_at=now,
            )
        )

    queue_stage = next(
        (
            stage
            for stage in stage_events
            if stage.stage_name == "queue_wait" and stage.finished_at is None
        ),
        None,
    )
    if queue_stage is not None:
        queue_stage.status = "success"
        queue_stage.finished_at = now
        queue_stage.summary = "Worker started processing the queued run."
        queue_stage.metrics_json = _with_progress_metrics(queue_stage.metrics_json, now=now)

    if trigger_type:
        run.trigger_type = trigger_type
    run.status = "in_progress"
    run.started_at = run.started_at or now
    run.current_stage = "resolve_attempt_urls"
    run.error_message = None

    next_stage = _append_stage_event(
        run,
        stage_events,
        stage_name="resolve_attempt_urls",
        status="running",
        started_at=now,
    )
    await refresh_running_eta(session, run, next_stage, stage_events=stage_events)
    await _persist_run_progress(session, run, stage_events)
    return next_stage


async def advance_feed_fetch_stage(
    session: AsyncSession,
    run: FeedFetchRun | None,
    active_stage: FeedFetchStageEvent | None,
    next_stage_name: str,
    *,
    summary: str | None = None,
    metrics_json: JsonObject | None = None,
    close_status: str = "success",
) -> FeedFetchStageEvent | None:
    """Close the active stage and open the next one."""
    if run is None:
        return None

    now = datetime.now(UTC)
    stage_events = await _load_stage_events_for_run(session, run)
    if active_stage is not None and active_stage.finished_at is None:
        active_stage.status = close_status
        active_stage.finished_at = now
        if summary is not None:
            active_stage.summary = summary
        active_stage.metrics_json = _with_progress_metrics(metrics_json, now=now)

    run.current_stage = next_stage_name
    run.status = "in_progress"
    next_stage = _append_stage_event(
        run,
        stage_events,
        stage_name=next_stage_name,
        status="running",
        started_at=now,
    )
    await refresh_running_eta(session, run, next_stage, stage_events=stage_events)
    await _persist_run_progress(session, run, stage_events)
    return next_stage


async def finalize_feed_fetch_run(
    session: AsyncSession,
    run: FeedFetchRun | None,
    active_stage: FeedFetchStageEvent | None,
    *,
    run_status: str,
    summary_json: JsonObject | None,
    error_message: str | None = None,
    active_stage_status: str | None = None,
    active_stage_summary: str | None = None,
    active_stage_metrics_json: JsonObject | None = None,
    completion_summary: str | None = None,
    completion_metrics_json: JsonObject | None = None,
    skipped_stage_summary: str | None = None,
    fallback_active_stage_name: str | None = None,
) -> FeedFetchStageEvent | None:
    """Finalize the active stage, append completion stages, and persist the run outcome."""
    if run is None:
        return None

    now = datetime.now(UTC)
    stage_events = await _load_stage_events_for_run(session, run)
    final_active_stage = _resolve_active_stage_for_finalize(stage_events, active_stage)
    if final_active_stage is None and fallback_active_stage_name is not None:
        if run.current_stage == "complete" or run.finished_at is not None:
            stage_events = await _clear_stage_events_for_run(session, run, stage_events)
            run.status = "in_progress"
            run.current_stage = fallback_active_stage_name
            run.finished_at = None
            run.predicted_finish_at = None

        final_active_stage = _append_stage_event(
            run,
            stage_events,
            stage_name=fallback_active_stage_name,
            status="running",
            started_at=now,
        )

    if final_active_stage is not None and final_active_stage.finished_at is None:
        final_active_stage.status = active_stage_status or _status_for_run(run_status)
        final_active_stage.finished_at = now
        if active_stage_summary is not None:
            final_active_stage.summary = active_stage_summary
        final_active_stage.metrics_json = _with_progress_metrics(active_stage_metrics_json, now=now)

    if final_active_stage is not None and final_active_stage.stage_name != "complete":
        for stage_name in _remaining_stage_names_before_complete(final_active_stage.stage_name):
            skipped_stage = _append_stage_event(
                run,
                stage_events,
                stage_name=stage_name,
                status="skipped",
                started_at=now,
                finished_at=now,
                summary=skipped_stage_summary,
            )
            final_active_stage = skipped_stage

        final_active_stage = _append_stage_event(
            run,
            stage_events,
            stage_name="complete",
            status="running",
            started_at=now,
        )

    if final_active_stage is not None and final_active_stage.stage_name == "complete":
        final_active_stage.status = _status_for_run(run_status)
        final_active_stage.finished_at = now
        if completion_summary is not None:
            final_active_stage.summary = completion_summary
        final_active_stage.metrics_json = _with_progress_metrics(completion_metrics_json, now=now)

    run.status = run_status
    run.current_stage = "complete"
    run.finished_at = now
    run.predicted_start_at = run.predicted_start_at or run.started_at or now
    run.predicted_finish_at = now
    run.summary_json = dict(summary_json) if summary_json is not None else None
    run.error_message = error_message if run_status == "error" else None

    await _flush_run(session, run, stage_events)
    await trim_feed_fetch_run_history(session, run.feed_id)
    await session.commit()
    return final_active_stage


def _resolve_active_stage_for_finalize(
    stage_events: Sequence[FeedFetchStageEvent],
    active_stage: FeedFetchStageEvent | None,
) -> FeedFetchStageEvent | None:
    """Prefer the live session-backed active stage over a stale caller reference."""
    live_open_stage = next((stage for stage in reversed(stage_events) if stage.finished_at is None), None)

    if active_stage is None:
        return live_open_stage

    if active_stage in stage_events:
        return active_stage

    active_stage_id = getattr(active_stage, "id", None)
    if active_stage_id is not None:
        matched_by_id = next(
            (stage for stage in stage_events if getattr(stage, "id", None) == active_stage_id),
            None,
        )
        if matched_by_id is not None:
            return matched_by_id

    if live_open_stage is not None:
        return live_open_stage

    if _is_usable_stage_reference(active_stage):
        return active_stage

    return None


def _is_usable_stage_reference(stage: FeedFetchStageEvent | None) -> bool:
    if stage is None:
        return False

    try:
        state = sa_inspect(stage)
    except NoInspectionAvailable:
        return getattr(stage, "id", None) is not None

    if state.deleted:
        return False

    return not (state.transient and getattr(stage, "id", None) is None)


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


async def refresh_running_eta(
    session: AsyncSession,
    run: FeedFetchRun,
    active_stage: FeedFetchStageEvent | None,
    *,
    stage_events: list[FeedFetchStageEvent] | None = None,
) -> None:
    """Refresh ETA once a run is active using completed history and current stage progress."""
    if run.started_at is None:
        return

    now = datetime.now(UTC)
    run.predicted_start_at = run.predicted_start_at or run.started_at

    current_stage_events = stage_events or await _load_stage_events_for_run(session, run)
    stage_duration_estimates = await _load_stage_duration_estimates(session, run)
    remaining_duration = _estimate_remaining_duration(
        run,
        active_stage,
        now,
        stage_duration_estimates,
        stage_events=current_stage_events,
    )
    run.predicted_finish_at = now + remaining_duration


def _append_stage_event(
    run: FeedFetchRun,
    stage_events: list[FeedFetchStageEvent],
    *,
    stage_name: str,
    status: str,
    started_at: datetime,
    finished_at: datetime | None = None,
    summary: str | None = None,
    metrics_json: JsonObject | None = None,
) -> FeedFetchStageEvent:
    stage_event = _new_stage_event(
        run,
        stage_order=len(stage_events),
        stage_name=stage_name,
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        summary=summary,
        metrics_json=metrics_json,
    )
    stage_events.append(stage_event)
    return stage_event


async def _load_stage_duration_estimates(
    session: AsyncSession,
    run: FeedFetchRun,
) -> dict[str, timedelta]:
    history_runs: list[FeedFetchRun] = []

    if run.path_kind:
        same_feed_result = await session.execute(
            select(FeedFetchRun)
            .where(
                FeedFetchRun.feed_id == run.feed_id,
                FeedFetchRun.path_kind == run.path_kind,
                FeedFetchRun.status.in_(("success", "not_modified", "error")),
                FeedFetchRun.finished_at.is_not(None),
                FeedFetchRun.id != run.id,
            )
            .order_by(FeedFetchRun.created_at.desc())
            .limit(10)
            .options(selectinload(FeedFetchRun.stage_events))
        )
        history_runs = list(same_feed_result.scalars().all())

    if len(history_runs) < 3 and run.profile_key:
        profile_result = await session.execute(
            select(FeedFetchRun)
            .where(
                FeedFetchRun.profile_key == run.profile_key,
                FeedFetchRun.status.in_(("success", "not_modified", "error")),
                FeedFetchRun.finished_at.is_not(None),
                FeedFetchRun.id != run.id,
            )
            .order_by(FeedFetchRun.created_at.desc())
            .limit(10)
            .options(selectinload(FeedFetchRun.stage_events))
        )
        history_runs = list(profile_result.scalars().all())

    return _summarize_stage_duration_history(history_runs)


def _derive_rsshub_route_family(path: str) -> str | None:
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return None

    if segments[0] == "bilibili" and len(segments) >= 3 and segments[1] == "user":
        return "_".join(segments[:3])

    if segments[0] == "zhihu" and len(segments) >= 2 and segments[1] == "people":
        return "zhihu_people"

    if len(segments) >= 2:
        return "_".join(segments[:2])

    return segments[0]


def _looks_like_rsshub_host(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return "rsshub" in host


def _normalize_url(url: str) -> str:
    return url.strip().rstrip("/")


def _remaining_stage_names_before_complete(stage_name: str) -> list[str]:
    try:
        stage_index = FEED_FETCH_STAGE_SEQUENCE.index(stage_name)
    except ValueError:
        return []

    return FEED_FETCH_STAGE_SEQUENCE[stage_index + 1 : -1]


def _status_for_run(run_status: str) -> str:
    return "error" if run_status == "error" else "success"


async def _flush_run(
    session: AsyncSession,
    run: FeedFetchRun,
    stage_events: Sequence[FeedFetchStageEvent],
) -> None:
    session.add(run)
    for stage_event in stage_events:
        session.add(stage_event)
    await session.flush()


async def _persist_run_progress(
    session: AsyncSession,
    run: FeedFetchRun,
    stage_events: Sequence[FeedFetchStageEvent],
) -> None:
    await _flush_run(session, run, stage_events)
    await session.commit()


def _extract_run_durations(runs: Sequence[FeedFetchRun]) -> list[timedelta]:
    durations: list[timedelta] = []
    for run in runs:
        if run.started_at is None or run.finished_at is None:
            continue
        durations.append(run.finished_at - run.started_at)
    return durations


def _average_duration(durations: list[timedelta]) -> timedelta:
    total_seconds = sum(duration.total_seconds() for duration in durations)
    return timedelta(seconds=total_seconds / len(durations))


def _summarize_stage_duration_history(runs: Sequence[FeedFetchRun]) -> dict[str, timedelta]:
    per_stage: dict[str, list[timedelta]] = {}
    for run in runs:
        for stage in run.stage_events:
            if stage.stage_name == "queue_wait" or stage.started_at is None or stage.finished_at is None:
                continue
            per_stage.setdefault(stage.stage_name, []).append(stage.finished_at - stage.started_at)

    estimates: dict[str, timedelta] = {}
    for stage_name in FEED_FETCH_STAGE_SEQUENCE:
        if stage_name == "queue_wait":
            continue
        durations = per_stage.get(stage_name)
        estimates[stage_name] = _weighted_average_duration(durations) if durations else DEFAULT_STAGE_DURATIONS.get(
            stage_name,
            timedelta(seconds=5),
        )
    return estimates


def _estimate_remaining_duration(
    run: FeedFetchRun,
    active_stage: FeedFetchStageEvent | None,
    now: datetime,
    stage_duration_estimates: dict[str, timedelta],
    *,
    stage_events: Sequence[FeedFetchStageEvent],
) -> timedelta:
    remaining = timedelta(0)
    completed_stage_names = {
        stage.stage_name
        for stage in stage_events
        if stage.finished_at is not None
    }

    for stage_name in FEED_FETCH_STAGE_SEQUENCE:
        if stage_name == "queue_wait" or stage_name in completed_stage_names:
            continue

        expected_duration = stage_duration_estimates.get(
            stage_name,
            DEFAULT_STAGE_DURATIONS.get(stage_name, timedelta(seconds=5)),
        )
        if active_stage and active_stage.stage_name == stage_name and active_stage.started_at is not None:
            elapsed = max(now - active_stage.started_at, timedelta(0))
            remaining += max(expected_duration - elapsed, timedelta(seconds=1))
            continue
        remaining += expected_duration

    return max(remaining, timedelta(seconds=1))


def _weighted_average_duration(durations: list[timedelta]) -> timedelta:
    if not durations:
        return timedelta(seconds=5)
    weighted_total = 0.0
    total_weight = 0.0
    for index, duration in enumerate(durations):
        weight = len(durations) - index
        weighted_total += duration.total_seconds() * weight
        total_weight += weight
    return timedelta(seconds=weighted_total / total_weight)
