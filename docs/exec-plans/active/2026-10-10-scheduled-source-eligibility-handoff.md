# Scheduled source eligibility handoff

## Reproduced cause

The scheduled selector included every ACTIVE catalog feed, including rows with no current subscription. Four observed upstream-522 task failures came from such an orphan source. Subscription cleanup cannot guarantee that historical/imported orphan catalog rows never exist, so automatic selection must enforce current subscription eligibility itself.

## What changed

- `_load_scheduled_feeds` now shares one base query requiring ACTIVE status plus correlated `EXISTS Subscription(feed_id = Feed.id)` across regular due selection and midnight supplemental selection.
- Subscription ownership is not joined to user activation state: inactive-account subscriptions still qualify. EXISTS avoids duplicate feeds when multiple accounts subscribe.
- Due timestamps, local-day boundaries, recent-attempt guards, cadence/timezone, origin circuits, progress reconciliation and terminalization are unchanged.
- Selection performs no deletion/status reset. Historical feed/article/bookmark/reading-state rows remain intact, and adding a subscription makes an eligible catalog feed selectable again.
- Explicit manual/admin refresh routes and `fetch_feed_task` execution are unchanged. Previously queued tasks are neither canceled nor altered.
- Updated the architecture flow to document subscribed-only automatic selection and retained catalog data.

## Files touched

- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`: Subscription import and the narrow selector query only.
- `backend/apps/worker/tests/test_scheduled_source_eligibility.py`: six real PostgreSQL selection regressions.
- `docs/architecture/feed-fetch-flow.md`: automatic-selection rule and diagram.

No original user-owned dirty file, translation audit handoff, deployment configuration or NAS state was changed by this generator.

## Verification

Root started the repository's isolated local test infrastructure (`docker-compose.test.yml`, PostgreSQL 16, `glean-test-postgres`, localhost port 5433, fresh test volume). Tests use actual SQLAlchemy AsyncSession/ORM rows and execute the selector against PostgreSQL, rather than asserting a compiled SQL string or supplying mocked selected rows. The repository fixture creates/drops only the explicitly named `glean_test` tables.

Command environment: `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test`, `UV_CACHE_DIR=/private/tmp/glean-uv-cache`; cwd `backend/`. Localhost DB access requires the allowed elevated test execution in this sandbox.

- RED: `uv run --no-sync pytest apps/worker/tests/test_scheduled_source_eligibility.py -o addopts='' --import-mode=importlib --tb=short --show-capture=no`: **5 expected failures / 1 pass**. Regular and midnight selectors returned actual orphan rows; resubscription and retained-orphan selection cases also reproduced the issue. The due/status rule test already passed before the implementation.
- GREEN: same six real database tests: **6 passed**. The shared-feed fixture was strengthened to include an inactive-only subscribed feed in both regular/midnight paths, alongside a multi-account subscribed feed checked for exactly one result.
- Final combined command adds `apps/api/tests/test_feed_fetch_progress.py apps/api/tests/test_feeds_router_active_runs.py apps/worker/tests/test_feed_refresh_scheduler.py`: **23 passed**. Covers terminal-stage/reconciliation guards, queue reuse, RSSHub circuit deferral, cadence, named timezone and unavailable-timezone fallback.
- Real database cases verify: orphan exclusion on both paths, inactive-only eligibility, shared subscription deduplication, due-at-exact-boundary inclusion, future/disabled/error exclusion, Asia/Shanghai midnight local-day/attempt cutoff preservation, due precedence, no feed/article/bookmark/UserEntry deletion or reassociation, and resubscription eligibility without a status reset.
- Targeted Ruff lint/format checks: **passed**.
- Targeted Pyright on `feed_fetcher.py`: **0 errors, 0 warnings**.
- `git diff --check`: **passed**.

An existing entry-router deprecated-regex warning remains in test imports; it is unrelated to this selector change.

## Remaining acceptance

- Independent evaluator review and real-database rerun; do not point test fixtures at production because their test setup drops/recreates tables.
- Root alone commits/builds/deploys the necessary worker image with rollback protection and checks production selector eligibility/read-only row counts.
- Live deployed worker behavior is not yet claimed by this generator. No full source refresh or queue cancellation was triggered as a probe.
