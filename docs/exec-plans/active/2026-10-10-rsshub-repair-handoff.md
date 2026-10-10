# RSSHub reliability generator handoff

## What changed

- Confirmed separate failure classes: live local RSSHub healthy roots, Anthropic empty-route 503 from obsolete `page.sections` extraction, working Twitter XML, and mixed RSSHub origins including one unreachable root. No raw logs or subscription URLs were exported.
- Added per-origin circuit keys, root confirmation for suspected outages, actual failed-attempt attribution for fallback instances, and counter retention after unblock.
- Kept temporary RSSHub route limits/server/transport failures active with 15/30/60-minute retries; permanent client failures retain normal disablement behavior. HTTP 4xx no longer trigger an immediate duplicate request.
- Added a narrowly scoped Anthropic publication-card adapter with legacy parser fallback and an inspectable compiled-route patcher/Dockerfile preserving installed RSSHub imports/configuration.

## Files touched

- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `backend/apps/worker/tests/test_feed_fetcher.py`
- `backend/apps/worker/tests/test_rsshub_reliability.py`
- `backend/packages/rss/glean_rss/discoverer.py`
- `backend/packages/rss/tests/test_fetch_retry_policy.py`
- `scripts/rsshub/` adapter, patcher, tests and Dockerfile
- `docs/architecture/feed-fetch-flow.md`
- `docs/operations/feed-fetch-guardrails.md`
- `docs/operations/rsshub-route-repairs.md`
- `docs/operations/index.md`

## Verification run

- Test-first worker/HTTP regressions: eight intended assertion failures before repair; nine initial tests passed afterward.
- Required scheduler/progress/API reconciliation guardrails plus discoverer and regressions: final combined run passed all 70 tests, including permanent 403, cross-origin fallback and scheduler origin isolation.
- Ruff checks passed and changed production files passed strict Pyright with zero errors/warnings.
- Anthropic adapter: two intended test failures and one legacy-fallback pass before implementation; all three fixture tests pass with the real deployed Cheerio runtime via stdin, without NAS file/container mutations.
- Patcher: two intended failures before implementation; both tests pass after implementation, including executing the patched export and rejecting unsupported layouts.
- Real NAS in-memory adapter canary using installed RSSHub fetch/cache/date/Cheerio/p-map: ten posts with dates; two requested articles produced two valid research links, two dates and two article bodies. Patcher syntax check against the installed compiled route returned zero.
- Default-limit live in-memory handler: ten items, ten valid research links, ten dates and ten article bodies; 4.24 seconds using the installed helpers/cache. A deployed patched-image HTTP response is still a separate root-owned verification gate.

## Known gaps

- Root owns image creation, temporary canary containers and live replacement; this generator made no remote changes. Patched-image HTTP canary and final live evidence still required.
- Prior upstream 429/521/522/525, inaccessible remote instances and future provider changes remain external limitations; no universal outage/rate-limit fix is claimed.
- No database schema/data/feed settings changed. The inspected baseline has all 35 RSSHub feeds active, so no bulk reactivation/reset is needed.
- Existing tests emit Query-deprecation and `AsyncMock` session-add warnings; record them separately from regressions.

## Reviewer focus

- Healthy root plus failing route must never block other routes/instances; real `ValueError` cause chain, ten transient errors, retained backoff, permanent 403, scheduler and cross-origin fallback are covered.
- Retain active-run/terminalization/timezone invariants and source-specific failure semantics.
- Anthropic parser selection must exclude topic links; bundled-route patcher must preserve all existing imports and fail closed on an unfamiliar build.
- Treat NAS live HTTP/XML canaries as the final deployment gate, and retain a rollback image/configuration.
