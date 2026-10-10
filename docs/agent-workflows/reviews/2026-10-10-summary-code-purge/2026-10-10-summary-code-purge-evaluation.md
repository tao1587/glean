# Summary implementation purge independent evaluation

Date: 2026-10-10. Decision: **accepted for the current contract**, with historical migration operations deliberately preserved. This assessment confirms removal of application implementation; it does not claim every historical mention or database operation is gone.

## Rubric assessment

| Required check | Result | Independent evidence |
|---|---|---|
| Contract compliance | Pass | Retained summary ORM module and model export are deleted. Dedicated obsolete summary/supplement plans/specifications and the API tombstone are removed; current references are repaired. Translation and reader changes remain intact. |
| Behavioral correctness | Pass | Fresh application imports succeed. Runtime metadata has 15 ordinary tables and no summary/supplement table. Emitted PostgreSQL table-DDL regression passes; loading the original HEAD model in an isolated interpreter makes that same regression fail. |
| Regression risk | Pass within scope | Metadata/API/worker/MTran regression group passes all 36 tests. Six initial user changes are preserved against the saved initial tree. Historical migration files are unchanged and their revision graph resolves to one head. |
| Repository fit | Pass | Follow-up contract/handoff exist; current API reference accurately states ORM removal and historical migration retention. Docs validator and Git whitespace checks pass. |
| Verification quality | Pass with limits | Evaluator independently checked imports, model/export/metadata absence, emitted DDL, migration graph, bytecode and frontend bundles, and reran targeted tests/lint. No live database or deployment operation was performed. |

## Verification run

From `backend/`, with `UV_CACHE_DIR=/private/tmp/glean-uv-cache` and `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test`:

- `uv run --no-sync pytest --import-mode=importlib packages/core/tests/test_translation_providers.py apps/api/tests/test_ai_summary_retirement.py apps/worker/tests/test_worker_summary_retirement.py packages/database/tests/test_summary_metadata_retirement.py -o addopts=''`: **36 passed**. Three existing regex/OpenAPI warnings remain.
- `uv run --no-sync ruff check packages/database/glean_database/models/__init__.py packages/database/tests/test_summary_metadata_retirement.py`: **passed**.
- Independent RED proof loaded the original HEAD summary ORM into a separate interpreter and ran the current mock-PostgreSQL `Base.metadata.create_all` regression: it correctly failed. The current clean metadata passed in the test command above; no repository file or database was changed for the RED probe.
- Fresh `importlib.util.find_spec` checks show all eleven deleted feature module paths absent, including the ORM, summary services/schemas/routers/workers and the entire `services.llm` package. No summary export, registered API path or worker/cron function remains.

From `backend/packages/database/`, `uv run --no-sync alembic heads` and `alembic history` succeed with the single head **`94af7ef02eb9`** and no missing parent. These commands inspect the revision graph without connecting to a database.

Additional checks:

- Scanned all **26 web build files** and **27 admin build files**, including binary assets and any generated maps present, for removed UI/SDK/config/route symbols: no matches.
- Scanned backend application/package bytecode for the known removed implementation and deleted dedicated-test modules: none remains. The removed LLM directory is absent; fresh import checks also return no package.
- Compared the six initial modified files to saved tree `09bb34c4aabcd40422e146d8e58fa490cfed1b16`: five remain byte-identical and ReaderCore differs only by the prior four exact summary removals. Initial `detailOpen` behavior remains.
- `python3 scripts/validate-docs.py` and `git diff --check`: **passed**.

## Remaining matches and scope

The source audit classifies the remaining feature-name matches individually:

- Three historical Alembic revisions: `b7a9e2c4d8f1_add_ai_summary_tables.py`, `a1c5e2f9b0d3_ai_summary_schema_v2.py`, and `de4b367d4055_daily_weekly_summary.py`. Their summary-specific upgrade/downgrade operations remain unchanged under the current contract. Fresh migration-based database creation therefore still includes historical summary storage; application metadata-based creation does not. Their generated migration bytecode is historical, not an orphaned runtime feature module.
- API/worker/metadata/reader retirement regression tests: old route names, symbols and preferences are inputs or negative assertions proving deletion. Current test bytecode is valid.
- `truncateTodayBoardSummary` and its two TodayBoard call sites handle ordinary RSS article previews; they do not invoke an AI provider or summary pipeline.
- Audit/change-history documents record the deletion and the superseded earlier compatibility decision. They contain no working feature implementation.

The user subsequently confirmed retention of historical migration records while removing implementation and obsolete design documents. This agrees with the evaluated scope and preserves valid existing revision identifiers and history; do not describe this result as removal of historical migration code or stored rows. No running database data was modified.

No frontend source changed in this follow-up, so the prior independently accepted builds and focused frontend tests were reused; the unrelated full web suite was not rerun. Live database/browser/deployment verification remains unavailable. No implementation revision is required within the current scope.
