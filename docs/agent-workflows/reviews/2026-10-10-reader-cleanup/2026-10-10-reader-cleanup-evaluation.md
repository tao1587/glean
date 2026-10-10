# Reader cleanup independent evaluation

Date: 2026-10-10. Decision: **accepted with the verification limits below**. No new functional defect was found in the scoped changes. The full web suite is not green; its ten failures were independently reproduced on the pre-cleanup HEAD baseline.

## Rubric assessment

| Required check | Result | Evidence |
|---|---|---|
| Contract compliance | Pass | Both README clone/download URLs use `tao1587/glean`. Summary routes, UI/settings/admin controls, SDK/types, services, worker jobs/cron and dedicated configuration are removed. Historical migrations and table definitions remain unchanged. |
| Behavioral correctness | Pass | Retired URLs return 404; imports and schema generation succeed. Actual HTTPX request probes verify the MTran byte boundary, splitting, headers, fallback and ordering. Reader retirement regressions pass with legacy summary preferences/props. |
| Regression risk | Pass within tested scope | Translation service/worker and feed scheduler/active-run tests pass. Reader period, density, grouping, sorting, hidden-undo and source sections pass. All six initial dirty changes are preserved against the saved initial tree. |
| Repository fit | Pass | Contract and both generator handoffs exist. API reference and retirement notices match the registered implementation; product history records the change. Docs validation and targeted Ruff pass. |
| Verification quality | Pass with limits | The evaluator independently ran backend tests, frontend tests, forced typechecks and both production builds, and compared exact failing test names against an independently executed archived HEAD baseline. No live deployment/browser/database integration is claimed. |

## Independent verification

Backend commands ran from `backend/` with `UV_CACHE_DIR=/private/tmp/glean-uv-cache`, `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test`, and `uv run --no-sync`. Pytest used `--import-mode=importlib -o addopts=''` because default collection across multiple `tests` packages collides.

- `pytest packages/core/tests/test_translation_providers.py apps/api/tests/test_ai_summary_retirement.py apps/worker/tests/test_worker_summary_retirement.py`: **35 passed**.
- `pytest apps/worker/tests/test_feed_refresh_scheduler.py apps/worker/tests/test_translation_worker.py packages/core/tests/test_translation_service.py`: **45 passed**.
- `pytest apps/api/tests/test_feed_fetch_progress.py apps/api/tests/test_feeds_router_active_runs.py apps/worker/tests/test_feed_refresh_scheduler.py`: **17 passed**, including scheduler tests already counted above.
- Targeted Ruff on all modified backend runtime files and new/modified tests: **passed**.

MTran probes used a real `httpx.Client` with `httpx.MockTransport`, independently of the generator's fake clients:

- A request body of exactly **102,400 bytes** is sent once; one byte less remains one request; one byte more splits into two requests.
- UTF-8 text and JSON escapes are counted in the actual transmitted bytes. All requests remain within the limit and carry the JSON content type and configured Bearer header.
- A 413 or malformed batch response falls back to single requests without changing result order or losing text.
- A `No model found` error fails after the batch request without redundant singles.
- Provider source SHA-256 is byte-identical to GitHub commit `8a54c34a333d74db6f1f7be092674edf5081632d`: `81a49b0d2929680c4d801eaef99782cfe367b0a20935b88e6a218bf20e1da53c`.

Frontend commands ran from `frontend/`:

- `pnpm exec turbo run typecheck --force`: **7 packages passed, zero cache hits**.
- `pnpm --filter @glean/api-client test`: **105 passed**.
- `TZ=Asia/Shanghai pnpm --filter @glean/web exec vitest run` on ReaderCore/TodayBoard interaction: **29 passed**.
- The same command on nine period/source/hidden-undo/reader-controller/TodayBoard helper suites: **43 passed**.
- `pnpm --filter @glean/web build` and `pnpm --filter @glean/admin build`: **passed**.
- Independent full web run with JSON reporting: **260 passed / 10 failed** under `TZ=Asia/Shanghai`.
- Independent archived pre-cleanup HEAD run of the six failing suites: **49 passed / 10 failed**. The exact failed full-name sets match; zero new failures. Archived and current test files are byte-identical to HEAD, and the baseline workspace aliases point to archived package sources.

Other checks:

- `python3 scripts/validate-docs.py` and `git diff --check`: **passed**.
- `docker compose -f <file> config --quiet` for main/lite/personal configurations: **passed**, without starting containers.
- Targeted Prettier is clean except Digest `SettingsPanel.tsx`; that warning was independently reproduced on its archived HEAD version. Its scoped diff only removes the AI shortcut/import.

## API reference verification

ASGI probes were repeated with `DEBUG=false` and `DEBUG=true`. The complete set of public operations from generated OpenAPI matches `docs/references/api-surface.md`.

- Public health/time endpoints and `/openapi.json` return 200. OpenAPI remains unprotected when debug is disabled.
- `/api/docs` and `/api/redoc` return 200 only with debug enabled, otherwise 404.
- Entries, feeds, bookmarks, folders, tokens, user account and admin account routes reject missing credentials.
- The mounted MCP app contains a `/mcp` subroute: `/mcp/mcp` rejects an unauthenticated protocol request with 401. Its public protected-resource metadata path returns 200.
- Authentication source separates REST user/admin JWTs from MCP API Tokens. The mounted protocol and its metadata are not part of REST OpenAPI.
- nginx forwards `/api` and `/mcp`; Vite forwards `/api`. The root OpenAPI proxy mismatch is accurately documented. Registered/proxied surfaces do not establish external Internet reachability.

## Preservation and verification limits

Compared the six pre-existing modified files with initial tree `09bb34c4aabcd40422e146d8e58fa490cfed1b16` in `/private/tmp/glean-github-compare.h19Ate/repo.git`. Five are byte-identical to that snapshot. ReaderCore differs only by the four exact summary-specific removals; its initial `detailOpen` change remains. The only database-package diff is a retirement docstring on the retained ORM; no migration or table definition changed. No Git remote was added.

The ten pre-existing web failures concern authStore error handling, mark-all-read, subscription cache/delete, bilingual line breaks, digest grouping and mobile Layout expectations. Current and baseline reports are at `/private/tmp/glean-evaluator-web-current.json` and `/private/tmp/glean-evaluator-web-baseline.json`. The generator also observed eleven extra date-fixture failures under America/Los_Angeles; the focused evaluator comparisons use the same Asia/Shanghai timezone on both sides.

Docker was not running; there was no deployment or live browser session. The broader core run's two database-backed OIDC setup errors were reported by the primary generator and were excluded from its unit-only run; the evaluator did not claim those tests passed. Existing duplicate OpenAPI operation IDs, deprecated regex/AsyncMock warnings and Vite chunk warnings remain outside this task.

No implementation revision is required by this evaluation. Retain these limitations in the user-facing completion report.
