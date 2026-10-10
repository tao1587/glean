# NAS reliability independent evaluation

Date: 2026-10-10. Decision: **final deployment accepted**. All five production services run the reviewed release `7f7f90f93e0b395df30545c58ee2015761aa371a`. Required live gates passed; no implementation or deployment blocker remains. External-provider limitations below still apply.

## Rubric assessment

| Required check | Final result | Independent evidence |
|---|---|---|
| Contract compliance | Pass | Five immutable release image IDs/revision labels match. Summary routes/modules/metadata/tasks/bundles are absent; translation and RSSHub repairs are live. Original six edits remain outside the release. |
| Behavioral correctness | Pass | Fresh authenticated translation, direct Automatic translation, production RSSHub XML and tracked worker success pass. Browser settings retain explicit MTran, show Automatic and contain no AI tab or page errors. |
| Regression risk | Pass within verified scope | Existing translation/cache/scheduler/progress/timezone regressions pass. PostgreSQL/Redis identities, aggregate database counts and schema head are preserved. All five rollback images/tags and both configuration backups exist. |
| Repository fit | Pass | Contract and both handoffs exist; API/default-provider and RSSHub behavior are documented. Staged whitespace and docs validation pass. The derived RSSHub route patch fails closed on unsupported bundle layouts. |
| Verification quality | Pass with explicit limits | Evaluator independently reviewed source, ran meaningful tests/build/typechecks, and verified actual runtime hashes, images, API/browser/XML/queue/state/rollback evidence. Processing stayed on the NAS; only permitted status/count/boolean metadata was exported. |

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

### Final Automatic factory refinement

Before final rollout, the root identified that an unset/null preference could still reuse a stale per-user URL/key/model and redirect the automatic MTran request. The evaluator independently reproduced both new regression failures against the prior factory. The final narrow change resolves the provider first, then ignores provider-specific user fields for an automatic selection without modifying the original settings object. Explicit MTran retains its URL/key/model.

Independent provider/API/worker/service verification after this refinement: **74 passed**. Additional direct probes verify null, empty, whitespace and Pydantic automatic preferences use the server URL with empty key/model, preserve the original input, and retain all explicit MTran fields. The final backend/worker images were rebuilt with this corrected source; their live hashes match.

## Initial cleanup and candidate evidence (historical)

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

## Final independent production evidence

All five running container image IDs equal their immutable `release-7f7f90f` image IDs and carry the full reviewed revision label:

| Service | Image ID prefix |
|---|---|
| Backend | `2f0fddbdfa5b` |
| Worker | `a90a3fa17cac` |
| Web | `217f7f962da7` |
| Admin | `fa098b4682f2` |
| RSSHub | `fb1decfac127` |

The evaluator verified the following directly on the NAS, exporting only metadata:

- **Reviewed source:** 16 backend and six worker critical source-file hashes match the clean release archive. API health returns 200/version `7f7f90f`; Web returns 200 and both public Web/Admin release markers match the full revision.
- **Summary removal:** all eight retired REST cases return 404. Eleven deleted runtime module paths are absent; metadata has 15 ordinary tables and no summary/supplement table. The actual worker has 14 functions/two cron jobs with no summary registrations or modules, and uses `Asia/Shanghai`. Public Web/Admin scans cover 57/28 files with zero retired-feature symbol matches, including decompressed gzip assets.
- **Translation:** the active account's real `/api/auth/me` and `/api/entries/translate-texts` both return 200. Two ordered results contain changed/nonempty Chinese output and preserve the blank position. A second, unique non-private nonce input also passes, with `unique_fresh_input=true` and 102 ms combined smoke time; this is evidence of the live path, not a latency guarantee.
- **Automatic scope:** there is no active Automatic account. The inactive account was not enabled or used; the deployed factory was separately exercised with server-configured MTran and produced changed/nonempty output without changing preferences. Explicit active-account MTran selection remains intact.
- **Production RSSHub:** health is 200; public Anthropic limit-two XML contains two items/dates/article bodies/valid research links, and the default XML contains ten of each. The [deployment handoff](./2026-10-10-nas-deployment-handoff.md) additionally records the existing Twitter route returning 200 with eleven items/dates/bodies.
- **Queue completion:** independent status inspection of the already queued representative refresh reports `success` / `complete`, terminal true, no error, feed active and error count zero. No second refresh was enqueued by the evaluator.
- **Browser:** independent NAS-only browser execution passes authenticated settings, Automatic button presence, zero AI tabs including the former plain `AI` label, explicit MTran still selected, zero page errors and exit zero. No settings were saved. The deployment handoff additionally records normal reader authentication and its entries request returning 200.
- **State preservation:** database aggregates remain two users, 607 feeds and 252 subscriptions; Alembic head remains `94af7ef02eb9`. PostgreSQL `1732119ff759` and Redis `5ca16c71e2b9` retain their original container IDs and remain running. Runtime migration/admin recreation flags are disabled.
- **Rollback:** all five original image IDs and five `rollback-20261010` tags are retained. Both private NAS configuration backups exist. A rollback was not executed against the healthy production release; the handoff contains the app-only restoration commands.
- **User edits:** a final comparison with the saved initial tree confirms all six original changes remain preserved outside application commits/deployment.

## Limits and closure

Google's external limit was reproduced and is handled by explicit 429/cooldown behavior; no claim of bypassing that limit or silently switching an explicit provider is made. The root's bounded recent-log audit found no new backend/worker errors or translation 502s, but one production RSSHub rate-limit-classified match remains. Remote-origin outages and future markup changes remain possible. Historical migrations/storage are intentionally preserved; no schema/data reset, queue reset, account activation or preference rewrite was required.

The earlier full frontend baseline has ten pre-existing failures; only focused tests/builds/typechecks are claimed passing. No broad suite was rerun during final live acceptance. Raw logs, private response contents, tokens and user/subscription identifiers were not exported; automatic-review restrictions were respected by on-NAS aggregation.

No required rollout gate remains open. The root may remove owned temporary candidate/probe artifacts and archive these workflow records. Retain rollback images and restricted configuration backups for the observation period; cleanup must not remove PostgreSQL/Redis data or user-owned files.
