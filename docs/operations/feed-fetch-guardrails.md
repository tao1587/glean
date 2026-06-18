# Feed Fetch Guardrails

Last updated: 2026-04-10

This document captures the recent RSS/feed fetching failures seen during real NAS deployments and the guardrails that future code changes must preserve.

It is not a full architecture walkthrough. For the end-to-end pipeline, see `docs/architecture/feed-fetch-flow.md`.

## 1. Recent Failure Modes

### 1.1 Active queue rows survived after their Redis jobs disappeared

Observed on 2026-04-08 and 2026-04-10.

Symptoms:

- UI showed `0 in progress` but multiple feeds remained in `queued`
- individual feeds stayed in `queue_wait` far longer than the configured threshold
- adding a new manual refresh could also remain stuck in `queued`

What actually happened:

- the database still had active `feed_fetch_run` rows with `status in ('queued', 'in_progress')`
- the backing ARQ job was already gone from Redis
- the UI was showing persisted active rows, not proof that a worker was still consuming the queue

Guardrail:

- any read path that surfaces "active" feed fetch runs must reconcile persisted active rows against Redis job state before returning queue status

### 1.2 Stale-run reconciliation raced and hit the stage-order unique constraint

Observed in NAS API logs on 2026-04-08.

Symptoms:

- reconciliation tried to convert a stale queued run into a terminal state
- API logs showed `sqlalchemy.exc.IntegrityError`
- the violated constraint was `uq_feed_fetch_stage_events_run_order`
- the same run kept looking active because reconciliation itself failed

What actually happened:

- two paths attempted to append or finalize the terminal `complete` stage for the same run
- stage ordering is unique per run, so duplicate terminal-stage insertion failed

Guardrails:

- stale-run reconciliation must be idempotent
- terminal-stage writes must tolerate concurrent completion
- if a duplicate terminal stage already exists, the reconciler should reload and accept the run as already converged instead of crashing

### 1.3 `queue_wait` does not prove the worker is healthy

Observed on 2026-04-10 for feeds like `a16z`.

Symptoms:

- a run entered `queue_wait`
- the UI still showed predicted start/end timestamps
- the worker was already down, so the job never started

What actually happened:

- ETA is history-based UI prediction, not a liveness signal
- the worker had already stopped, so no consumer existed for newly enqueued jobs

Guardrails:

- when diagnosing a long `queue_wait`, check worker liveness first
- do not treat queue ETA as evidence that the job is actually progressing

### 1.4 Midnight supplemental scheduling depended on container timezone

Observed during mixed-update mode debugging on 2026-04-10.

Symptoms:

- regular fetches still ran
- midnight supplemental refresh appeared not to fire

What actually happened:

- the worker previously relied on the process-local timezone
- if the container timezone differed from the expected local timezone, midnight detection drifted

Guardrails:

- cron scheduling and midnight supplement logic must use the same explicit `WORKER_TIMEZONE`
- do not rely on implicit container-local timezone for scheduling behavior

### 1.5 Named timezones require tzdata in the worker image

Observed on 2026-04-10 after enabling `WORKER_TIMEZONE=Asia/Shanghai`.

Symptoms:

- worker failed at startup with `ModuleNotFoundError: No module named 'tzdata'`
- then raised `ZoneInfoNotFoundError: No time zone found with key Asia/Shanghai`

What actually happened:

- `zoneinfo.ZoneInfo("Asia/Shanghai")` needs IANA timezone data
- the worker image had neither a usable system timezone database nor the Python `tzdata` package

Guardrails:

- do not remove `tzdata` from worker dependencies unless the image guarantees timezone data another way
- timezone resolution must fail safe; a bad or unavailable timezone must not prevent the worker from starting
- the fallback must remain `UTC`

### 1.6 Feed fetch timeouts are different from queue failures

Observed repeatedly in worker logs.

Symptoms:

- worker logs showed `httpx.ConnectTimeout` or other upstream fetch failures
- some feeds retried or were disabled after repeated failures

What actually happened:

- the worker was alive and executing jobs
- the failures were per-feed upstream/network problems, not queue infrastructure problems

Guardrail:

- keep queue-health debugging separate from feed-source debugging
- worker fetch failures should not be mistaken for scheduler or queue deadlocks

## 2. Invariants Future Changes Must Preserve

1. Persisted active runs and Redis jobs can diverge; queue views must reconcile them.
2. Feed fetch terminalization must be idempotent and concurrency-safe.
3. `queue_wait` is a persisted state, not a liveness guarantee.
4. Scheduled refresh cadence is controlled by `FEED_REFRESH_INTERVAL_MINUTES`, not a hard-coded cron.
5. Midnight supplementation must use the same explicit timezone as the worker cron.
6. Named timezones require timezone data; worker startup must still succeed if that data is missing.
7. Feed-source failures such as RSSHub or direct-feed timeouts must not strand runs in active states.

## 3. Required Checks Before Changing Feed Fetch Code

Before merging any change touching feed fetch queueing, progress, or scheduling:

1. Verify active-run reconciliation tests still pass.
2. Verify scheduler tests still cover `FEED_REFRESH_INTERVAL_MINUTES` and midnight supplementation.
3. Verify worker startup still succeeds when `WORKER_TIMEZONE=UTC`.
4. Verify named timezone behavior still works with `WORKER_TIMEZONE=Asia/Shanghai`.
5. Verify unavailable-timezone fallback still keeps the worker startable.
6. Verify duplicate terminal-stage insertion cannot leave a run permanently active.

Recommended test targets:

```bash
cd backend
uv run pytest apps/api/tests/test_feed_fetch_progress.py apps/api/tests/test_feeds_router_active_runs.py apps/worker/tests/test_feed_refresh_scheduler.py
```

## 4. Fast Debugging Checklist

When the UI shows feeds stuck in `queue_wait`:

1. Check whether the worker is actually running.
2. Check worker startup logs for timezone or dependency failures.
3. Check API logs for reconciliation errors, especially `uq_feed_fetch_stage_events_run_order`.
4. Check whether the problematic run still has a real ARQ job in Redis.
5. Only after queue health is confirmed should you debug the feed source itself.

When midnight refresh looks wrong:

1. Confirm the deployed `WORKER_TIMEZONE`.
2. Confirm the worker image includes `tzdata` support.
3. Confirm the worker startup log prints the intended timezone.
4. Confirm the scheduled cadence from `FEED_REFRESH_INTERVAL_MINUTES`.
