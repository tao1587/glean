# Summary implementation purge handoff

## What changed

- Deleted `backend/packages/database/glean_database/models/ai_summary.py` and removed its package import/export, following the user's explicit request to remove feature code too. This supersedes the previous compatibility-mapping decision.
- Application metadata no longer creates summary tables. Ordinary user/feed/entry/translation storage remains registered.
- Added a regression that executes `Base.metadata.create_all` against a mock PostgreSQL engine and inspects emitted table DDL. This verifies schema-creation behavior without connecting to or changing a database.
- Removed 15 orphaned bytecode files for known deleted summary routers, schemas, services, workers and LLM modules, and removed the resulting empty LLM directory. Current retirement-test bytecode and third-party provider SDKs were preserved.
- Scanned the six installed editable Glean distributions' metadata directories; no summary-specific stale references were found, so valid environment metadata was preserved.
- Removed the temporary archived frontend source used for the previous HEAD failure comparison because it contained old feature code. Its verification report remains at `/private/tmp/glean-summary-head-baseline/results.json`.

## Files touched

- Deleted `backend/packages/database/glean_database/models/ai_summary.py`.
- Updated `backend/packages/database/glean_database/models/__init__.py`.
- Added `backend/packages/database/tests/test_summary_metadata_retirement.py`.
- Generated artifacts only: known deleted-feature `__pycache__/*.pyc` files and temporary archived baseline source.

## Verification run

Commands ran from `backend/` with `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test` and `UV_CACHE_DIR=/private/tmp/glean-uv-cache`.

- RED: `uv run --no-sync pytest packages/database/tests/test_summary_metadata_retirement.py -o addopts='' --import-mode=importlib` failed because schema creation emitted `ai_daily_summaries`.
- GREEN: `uv run --no-sync pytest packages/database/tests/test_summary_metadata_retirement.py apps/api/tests/test_ai_summary_retirement.py apps/worker/tests/test_worker_summary_retirement.py packages/core/tests/test_translation_providers.py -o addopts='' --import-mode=importlib`: **36 passed**. Three existing warnings remain (deprecated entry-query regex and duplicate admin refresh operation IDs).
- `uv run --no-sync ruff check packages/database/glean_database/models/__init__.py packages/database/tests/test_summary_metadata_retirement.py`: **passed**.
- `uv run --no-sync pyright packages/database/glean_database/models/__init__.py`: **0 errors, 0 warnings**.
- Direct application/database imports and OpenAPI generation succeed; package has no summary model export and metadata has no summary table.
- Search found no known orphaned summary-module bytecode remaining and no `AIDailySummary`/`models.ai_summary` runtime references.
- `git diff --check`: **passed**.

## Known gaps

- Historical migration files remain unchanged. The user subsequently confirmed this scope explicitly: remove implementation and obsolete design documents, preserve migration records.
- No database was connected, migrated, dropped or cleaned. Previously stored rows remain untouched.
- The parent owns removal of obsolete feature design documents, current documentation corrections and frontend generated-bundle inspection.

## Reviewer focus

- Confirm the metadata regression proves emitted table behavior rather than merely checking a removed symbol.
- Confirm no ordinary entry/translation model was removed, and MTran tests still pass.
- Review migration history separately against the user's final scope decision; application-model removal does not itself remove historical Alembic operations or existing database data.

## Primary-agent completion evidence

- Deleted six obsolete summary-specific documents: the supplement design, both supplement implementation plans, daily/weekly design and implementation plan, and obsolete local AI API reference. Their live links/index entries were removed or corrected.
- Updated the current API reference, product history and earlier review index to state that the retained ORM has now been removed.
- Re-ran the combined metadata/API/worker/MTran suite: 36 passed. Documentation validator and Git whitespace checks pass.
- Alembic ScriptDirectory graph inspection succeeds: 28 revisions, single head `94af7ef02eb9`, no missing parents. The three historical summary migrations remain unchanged.
- Runtime source search excluding historical migrations and deletion regressions has no summary-feature matches. Regenerated web/admin build artifacts have no obsolete summary entry-point symbols.
- Key-name-only inspection of workspace `.env*` files found no dedicated summary variables; no secrets or running database data were read out or altered.
- The user subsequently confirmed migration-history retention. This is not a claim that a search including historical migrations or negative regression tests will return zero matches.
