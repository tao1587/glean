# NAS reliability independent evaluation

Date: 2026-10-10. Phase: **pre-deployment review accepted; final reliability rollout pending**. The reviewed code and repaired RSSHub candidate are ready for release. This is not final acceptance of the full NAS reliability deployment; update this assessment after the frozen release is deployed and the remaining live gates pass.

## Rubric assessment

| Required check | Pre-deployment result | Independent evidence |
|---|---|---|
| Contract compliance | Pass for source/candidate scope | Automatic translation uses configured MTran while explicit choices remain explicit. Google limits are bounded; RSSHub circuits distinguish origins from upstream routes. Initial six user edits remain outside the release. Final production reliability images are not deployed yet. |
| Behavioral correctness | Pass for tested code and candidate | 144 focused backend tests and 33 UI/reader tests pass. Real NAS Cheerio fixtures and candidate RSSHub HTTP/XML probes pass. Actual authenticated production translation and tracked worker fetch remain rollout gates. |
| Regression risk | Pass within verified scope | Existing MTran byte/UTF-8/splitting/language/order, cache, scheduler, reconciliation, terminal-stage and timezone regressions pass. PostgreSQL/Redis container IDs remain unchanged after the initial cleanup rollout. |
| Repository fit | Pass | Contract and both handoffs exist; API/default-provider and RSSHub behavior are documented. Staged whitespace and docs validation pass. The derived RSSHub route patch fails closed on unsupported bundle layouts. |
| Verification quality | Pass with explicit live limits | Evaluator independently reviewed staged blobs, reran meaningful tests/build/typechecks, checked the NAS runtime and candidate HTTP responses, and exported only permitted counts/booleans/status metadata. Final live acceptance is deferred. |

## Reviewed source and independent checks

- Reviewed all **30 staged files**. Every staged blob equals the reviewed working source; no historical migration, credential file or original user-edit file is staged. Added-line scans found no private key, GitHub token, AWS credential or OpenAI-style secret.
- Exactly the original six files remain unstaged with **+50/-31**. Compared with saved initial tree `09bb34c4aabcd40422e146d8e58fa490cfed1b16`: five remain byte-identical; ReaderCore retains its original `detailOpen` addition and only the earlier summary removals differ.
- Backend: `UV_CACHE_DIR=/private/tmp/glean-uv-cache TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test uv run --no-sync pytest --import-mode=importlib ... -o addopts=''` on translation providers/API/worker/service, RSSHub/HTTP retry/fetcher, required scheduler/API/worker progress guards, and summary route/task/metadata retirement: **144 passed**. Existing regex, duplicate OpenAPI IDs and AsyncMock warnings remain.
- Frontend: targeted Automatic settings plus ReaderCore/TodayBoard interaction: **33 passed**. `pnpm exec turbo run typecheck --force`: **7 packages passed, zero cache hits**. `pnpm --filter @glean/web build`: **passed**. Full web lint exits zero with five existing warnings; no quality gate was weakened.
- Targeted backend Ruff: **passed**. `python3 scripts/validate-docs.py` and staged/working `git diff --check`: **passed**.
- `node --test scripts/rsshub/patch-anthropic-research.test.mjs`: **2 passed**; both new JavaScript modules pass `node --check`.
- Three benign adapter fixtures independently ran through stdin against the NAS's actual Cheerio module, using adapter bytes verified identical to the reviewed repository source: **3 passed**, with no private logs/payloads or NAS file mutations.

Translation regression coverage includes serial/concurrent Google cooldown, provider-selection preservation, API factory failures and malformed result shapes, cache-only requests, duplicates/blanks/order, bounded MTran 429 handling and outage fanout prevention. Worker configuration errors now mark the existing translation record failed rather than leaving it pending. Automatic settings saves preserve a null preference; MTran saves do not accidentally insert an OpenAI model, and missing-key copy matches the explicit error behavior.

RSSHub coverage includes actual wrapped HTTP exception causes, healthy-root route errors, ten transient failures, permanent 403 behavior, per-origin scheduler isolation, cross-origin fallback attribution and retention of the circuit counter after unblock. HTTP 4xx no longer receive an immediate duplicate request. The Anthropic adapter extracts publication cards rather than obsolete Next.js sections, preserves the original parser fallback, limits concurrency to two and reuses the verified installed imports/cache/date helpers.

## Independent NAS and candidate evidence

The initial cleanup release `7c5a7e7` is online. Metadata-only inspection independently confirms running Glean image prefixes: backend `a39a69315f64`, worker `cb928c07baf6`, web `12a65fdeea74`, admin `d77b3f36b539`. The production RSSHub remains the original image `ce24662156d6` at this phase.

Independent requests to the running cleanup API return health HTTP 200/version `7c5a7e7`, and system/admin/summary-lookup retirement URLs return 404. Fresh imports inside its container confirm eight deleted summary module paths absent and no summary/supplement metadata among its 15 registered tables.

PostgreSQL container `1732119ff759` and Redis container `5ca16c71e2b9` match the evaluator's before-rollout IDs and remain running. The cleanup overlay Dockerfiles remove `/app/apps`, `/app/packages` and `/app/scripts` before copying reviewed source, preventing deleted summary files from surviving an overlay. The root reports equivalent nginx document-root cleanup and verified dependency-lock compatibility; final candidate image/source assertions must still be repeated for the reliability release.

Independent HTTP probes against the repaired RSSHub candidate on NAS loopback return:

| Probe | HTTP | Items | Dated | Nonempty article bodies | Valid research links |
|---|---:|---:|---:|---:|---:|
| Health | 200 | — | — | — | — |
| Research, limit 2 | 200 | 2 | 2 | 2 | 2 |
| Research, default limit | 200 | 10 | 10 | 10 | 10 |

Response payloads, article contents, credentials and subscription identifiers stayed on the NAS. The root reports the candidate image prefix `4eae6fd49397`; this candidate is not yet the production RSSHub service. Generator evidence also establishes the actual failure distinction: Google rate limits while configured MTran translates the same non-sensitive text; healthy RSSHub roots can coexist with one broken route and one unreachable instance.

## Required final rollout gates

1. Freeze and deploy the reviewed reliability source, excluding the original six edits. Confirm all four Glean image IDs/version/source markers and the repaired production RSSHub image match the release. The old cleanup archive alone does not contain these reliability changes.
2. Independently verify actual authenticated `/api/entries/translate-texts` for the automatic account: HTTP 200, correct result count/order, changed/nonempty Chinese output and preserved blank position. Verify account/settings preservation. Explicit Google limits should remain an honest controlled 429, not a claim that the external limit disappeared.
3. Verify production summary routes remain 404, worker functions/cron and importable modules remain free of summary implementation, and all served web/admin bundles lack retired feature symbols.
4. Verify production RSSHub default XML and a previously working representative route. Run a tracked representative Glean refresh through the queue to a terminal state; check worker liveness and Redis reconciliation rather than relying on ETA alone.
5. Compare baseline user/feed/settings/stateful-service metadata without exporting private data. Preserve database/schema/history and queue state; do not reset data or recreate PostgreSQL/Redis. Retain practical rollback images/configuration for all five updated application/dependency services.

No source revision is required by this pre-deployment review. Historical migrations remain intentionally unchanged. External rate limits, inaccessible remote origins and future upstream markup changes remain explicit limitations. No final live reliability completion claim is made at this phase.
