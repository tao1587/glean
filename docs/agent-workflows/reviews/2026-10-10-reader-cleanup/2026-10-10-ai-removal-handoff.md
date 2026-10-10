# AI summary retirement implementation handoff

## What changed

- Removed the daily/weekly summary UI, summary hooks, user AI settings tab, Digest settings shortcut, and admin summary settings card/request flow.
- Removed `/api/today/ai/summary:*`, the obsolete `/api/ai` router, `/api/system/ai-integration`, and admin `/settings/ai-integration` routes.
- Removed summary services, payload schemas, LLM client/prompts/sanitization/smoke-check modules, worker functions, cron registration, and summary-only API/worker/environment/Compose settings.
- Removed the shared summary SDK/type exports and retired English/Chinese summary labels. Dedicated tests for removed code were replaced with retirement regressions.
- Preserved translation (OpenAI/MTran and other providers), feeds, embedding workers, read-later cleanup, day/week/month reading, and existing database data.
- Retained `AIDailySummary` solely as an inert SQLAlchemy table mapping so metadata/Alembic compatibility remains intact. Its module explicitly documents retirement. No historical migration was edited, no table was dropped, and no migration was run. Existing user/system JSON preferences remain stored but have no runtime summary consumers.

## Files touched

- API: `backend/apps/api/glean_api/{config.py,dependencies.py,main.py,routers/__init__.py,routers/admin.py,routers/system.py}`; deleted `routers/{ai.py,today_ai.py}`.
- Worker: `backend/apps/worker/glean_worker/{config.py,main.py,tasks/__init__.py}`; deleted `tasks/{summarize_day.py,summarize_week.py,summary_scheduler.py}`.
- Core: `backend/packages/core/glean_core/{schemas/__init__.py,schemas/config.py,schemas/user.py,services/__init__.py}`; deleted summary-only schemas/services and `services/llm/*.py`.
- Compatibility: `backend/packages/database/glean_database/models/ai_summary.py` (documentation only).
- Web: `SettingsPage.tsx`, `ReaderCore.tsx`, `TodayBoard.tsx`, `DigestView/SettingsPanel.tsx`; deleted `AIIntegrationTab.tsx`, summary hooks/cards.
- Admin: `RegistrationSettingsPage.tsx`.
- Shared frontend: API-client exports/system service, summary SDK deletion, shared API/models types, six English/Chinese locale JSON files.
- Configuration: `.env.example`, `docker-compose.yml`, `docker-compose.lite.yml`, and the existing ignored local `docker-compose.personal.yml` (summary env removal only).
- Tests: new API/worker retirement tests; reader/TodayBoard retirement regressions; retired dedicated summary tests; system SDK test removal.

## Verification run

Backend commands use `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test`, `UV_CACHE_DIR=/private/tmp/glean-uv-cache`, and `uv run --no-sync`.

- Before implementation: `pytest apps/api/tests/test_ai_summary_retirement.py apps/worker/tests/test_worker_summary_retirement.py -o addopts='' --import-mode=importlib` produced **9 expected failures / 2 passes**: live URLs returned 401/500, OpenAPI exposed summary routes/types, and worker functions/cron still included summaries.
- The same retirement command after implementation: **11 passed**; obsolete summary URLs return 404 without opening database sessions.
- `pytest apps/api/tests/test_feed_fetch_progress.py apps/api/tests/test_feeds_router_active_runs.py apps/worker/tests/test_feed_refresh_scheduler.py -o addopts='' --import-mode=importlib`: **17 passed**, covering active-run reconciliation, terminal-stage race handling, feed cadence, named timezone and UTC fallback.
- Targeted Ruff check on all changed backend runtime files and both retirement tests: **passed**.
- Direct API/worker import and schema smoke check: **86 HTTP paths, 14 worker functions, 2 cron registrations**; UTC and Asia/Shanghai timezone resolution both succeed.
- `docker compose -f <file> config --quiet` for main/lite/personal Compose files: **all passed**.
- Frontend RED: real TodayBoard rendered a summary section when legacy AI props were supplied; ReaderCore propagated `aiEnabled=true`. Both retirement regressions failed before the UI edits and passed afterward.
- `TZ=Asia/Shanghai pnpm --filter @glean/web exec vitest run` on ReaderCore/TodayBoard/calendar/period groups/ranges/sorting/density/SourceSection/SparseSourceGrid/range-query/hidden-undo suites: **75 passed across 12 files**.
- `pnpm --filter @glean/api-client test`: **105 passed across 11 files**.
- `pnpm typecheck`: **7 packages passed** (five fresh executions; two unchanged dependency-package cache hits).
- `pnpm --filter @glean/web build` and `pnpm --filter @glean/admin build`: **both passed**.
- Targeted frontend ESLint: **0 errors**, one existing ReaderCore Fast Refresh export warning.
- Prettier checks pass for changed settings/SDK/types/i18n files after formatting the two settings pages. Digest SettingsPanel and ReaderCore test formatting warnings predate this change; user-owned ReaderCore source formatting was preserved.
- Runtime-reference search finds no summary routes/flags/SDK/hooks/config left. RSS `summary`/excerpt handling and `truncateTodayBoardSummary` remain because they are normal feed previews.
- `git diff --check`: **passed**.

## Known gaps and baseline evidence

- Full web suite under the host's America/Los_Angeles timezone: **249 passed / 21 failed**. Eleven failures come from existing fixtures that assume Asia/Shanghai local dates.
- With `TZ=Asia/Shanghai`, full web suite: **260 passed / 10 failed**. The ten remaining failures occur in unchanged authStore, entry mark-all-read, subscription cache/optimistic-delete, bilingual markup, digest grouping and mobile Layout tests.
- Confirmed these ten failures on an isolated `git archive HEAD frontend` baseline, reusing installed third-party dependencies while aliasing workspace packages to the archived sources: **49 passed / 10 failed** across the six affected suites (59 tests). Exact failed test names are recorded in `/private/tmp/glean-summary-head-baseline/results.json`; none is introduced by summary retirement.
- No live browser/deployed Docker/database integration session was run. The Docker daemon is unavailable; configuration parsing, imports, ASGI route behavior and builds were verified.
- OpenAPI emits existing duplicate-operation warnings for admin feed refresh aliases and an existing deprecated query-regex warning. Vite reports existing large-chunk warnings.

## Reviewer focus

- Verify all runtime summary entry points are gone while the historical mapping/migrations remain inert.
- Verify removing the admin summary request allows registration/RSSHub settings to load normally.
- Confirm legacy stored user preferences cannot re-enable summary UI or jobs.
- Inspect the surgical ReaderCore diff: the pre-existing `detailOpen={!!selectedEntryId}` change is preserved, and all other pre-existing dirty PeriodView/SourceSection/SparseSourceGrid/DigestArticleCard files were left untouched by this generator.
- Compare full-suite failure names with the HEAD baseline before attributing existing failures to this cleanup.
