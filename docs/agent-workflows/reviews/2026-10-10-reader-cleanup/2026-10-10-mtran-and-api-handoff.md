# MTran, README, and API documentation handoff

## What changed

- Updated both README files to the current `tao1587/glean` clone and raw-download URLs.
- Integrated the MTran request-size fix from GitHub `personal-main` commit `8a54c34a333d74db6f1f7be092674edf5081632d`. The provider source matches that upstream version; tests additionally accept both HTTPX JSON requests and explicit byte bodies so the old implementation fails on behavior rather than transport-argument shape.
- Added `docs/references/api-surface.md` and changed `local-ai-api.md` into a retirement notice. Documented JWT vs MCP API Token authentication, public routes, effective `/mcp/mcp`, and unconditional `/openapi.json` registration.
- Updated product history and marked the old summary plan/spec as retired.
- The AI-removal generator owns the separate backend/frontend cleanup and its handoff.

## Verification

- Meaningful RED: 8 failing MTran cases before the source fix; the UTF-8 batch emitted 240,047 bytes against a 102,400-byte limit. JSON escaping, oversized single inputs, empty-prefix language resolution, and mixed-item ordering also failed.
- GREEN: `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test UV_CACHE_DIR=/private/tmp/glean-uv-cache uv run --no-sync pytest packages/core/tests/test_translation_providers.py -o addopts='' -q --tb=short --show-capture=no`: 24 passed.
- Core unit verification: the same pytest command on `packages/core/tests`, excluding the two database-backed OIDC tests by name: 94 passed, 2 deselected. Existing regex/AsyncMock warnings remain.
- Targeted `uv run --no-sync ruff check` on the MTran provider/tests: all checks passed.
- Targeted Pyright on modified API/worker config, registration/dependencies, schemas, and translation provider: 0 errors, 29 warnings from existing partially unknown third-party/JSON types.
- `python3 scripts/validate-docs.py` and `git diff --check`: passed.
- Actual app schema generation after summary removal: 86 REST paths / 103 operations. MCP subapp inspection confirms `/mcp` protocol subroute and protected-resource metadata; mounted protocol URL is `/mcp/mcp`.
- Dependency installation used existing lockfiles: backend `uv sync --all-packages`, frontend `pnpm install --frozen-lockfile`; lockfiles and historical migrations were not changed.

## Verification limits

- A broad core run gave 94 passed / 2 setup errors: `test_login_with_provider_creates_user_and_mapping` and `test_find_or_create_oauth_user_links_existing_email` require PostgreSQL. The test socket was unavailable; an independent Docker check confirmed the daemon is not running. These were subsequently excluded from the unit run, not claimed passing.
- API exposure conclusions concern registered/proxied application surfaces and ASGI behavior. No externally deployed host or live container was verified; no deployment was performed.
- Frontend full-suite results and baseline comparison are recorded in the AI-removal generator's handoff and independent evaluation.

## Reviewer focus

- Preserve the initial six dirty files. Their original working-tree state is saved as tree `09bb34c4aabcd40422e146d8e58fa490cfed1b16` in `/private/tmp/glean-github-compare.h19Ate/repo.git`; `local-compare` is the original HEAD.
- Check byte-size limits at the wire boundary, including fallback requests, language resolution, and batch ordering.
- Check the API reference against actual auth dependencies; do not equate registered routes with Internet reachability.
