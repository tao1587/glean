# Latest NAS log audit independent evaluation

Date: 2026-10-10. Phase: **FINAL ACCEPTED — audit evidence, narrow repairs and worker-only production deployment verified**.

The [contract](./2026-10-10-latest-nas-log-audit-contract.md) includes the reproduced orphan-scheduling repair. Source names, addresses, log bodies, voucher values and private identifiers remain in protected NAS/private evidence rather than this repository record.

## Coverage and counting method

| Evidence | Exact scope |
|---|---|
| Main Docker snapshot | Requested 14:00:00–21:56:46.165151 UTC; nine captured services include one stopped legacy proxy container |
| Current RSSHub effective main coverage | Current `2441ce2` container started at 14:46:27.693633 UTC; no preceding removed-container history is inferred |
| Followup snapshot | Separate 21:56:46–22:04:30 UTC capture of backend/worker/web/RSSHub/PostgreSQL |
| Persisted-state checkpoint | 21:58:27.314699 UTC; run window is based on `created_at`, not every attempt timestamp |
| Independent Redis check | 22:09:40 UTC: queue zero, in-progress keys zero, worker health key present with positive TTL |
| New translation samples | Two diagnostic direct-backend API calls at 22:01; distinct from the earlier nginx snapshot |
| Persistent worker file | Protected summary through 22:46:06 UTC retains the removed worker's history; UTC offset zero, 688 INFO/9 WARNING/four ERROR since 14:00 |
| Worker swap observation | Started 22:37:47.950725 UTC; persistent file records 30 INFO/no ERROR after the swap; final root delta through 22:47:46 has no new backend/worker/RSSHub/PostgreSQL ERROR |
| Final independent runtime check | 22:47:54 UTC: frozen image/selector/interpreter match, queue/in-progress zero, positive health TTL and heartbeat after worker start |

The evaluator independently processed fixed private logs on the NAS, stripping ANSI before recognizing actual log headers and grouping traceback lines under their events. Raw files/directories have modes 600/700. SQL text, repeated exceptions and arbitrary status-code strings are not counted as additional failed requests. Backend/worker were `a6ccf99`, RSSHub `2441ce2`, web/admin `7f7f90f`, with zero restart counters at the original capture. Only worker subsequently changed to `8540348`.

The evaluator independently read the protected persistent-worker summary; root generated its counts from the shared log volume. Its four ERROR timestamps match the four previously independently parsed 522 events. The old-worker interval between saved stdout at 22:04:30 and replacement at 22:37:47 contains three INFO/no WARNING or ERROR. The persistent file therefore preserves that removed-container interval; the evaluator does not claim to have independently reparsed every line of that file. Later root observations and independent runtime checks have their separate times above.

## Independent findings

### Translation and API

The original nginx snapshot has exactly one translation POST, HTTP 200 at 20:20:08.504585 UTC. Independent replay of the corrected classifier confirms this count and zero translation ERROR headers. Backend main records are 242 INFO, seven WARNING and zero ERROR. The initial translation helper missed ANSI-colored warnings; the evaluator rejected that evidence claim, the generator corrected it with a failing/passing fixture, and independent replay confirms seven warnings. They are five slow HTTP-200 requests, one HTTP 401 and one HTTP 404; the translation-specific warning is a slow successful request, not a provider failure.

Two separate formal API samples return 200: two inputs/results with the empty item retained at index one in 491 ms, and 25 inputs/results/11,741 characters in 5,307 ms. Changed/nonempty/Chinese checks pass. These samples call the authenticated backend directly; they are not browser/nginx requests and do not turn the original one-event nginx count into three. Numeric ordering was not inspected in the live 25-item sample; previous regression guards cover ordering. No 502/429 was observed in this limited set. Empty MTran logs and this small language/provider sample do not prove universal success, uncached upstream use or boundary-limit behavior.

### Worker and RSSHub

Four actual worker failed-feed ERROR headers occur at 16:05:05.712768, 16:20:37.607359, 16:51:19.059517 and 17:52:00.799048 UTC. Independent correlation replay confirms HTTPStatusError/522 and the same external source for all four. Its subscription count is zero. The same feed's latest midnight-created row completes `not_modified` at 18:52:02 with active/zero-error state. Log identifiers do not establish that all four failures belong to one exact run/job; temporal correspondence is not presented as such proof. HTTP 522 denotes an upstream connection timeout in Cloudflare's documented semantics; no exact network-hop cause is invented from this status alone. [Cloudflare 522 documentation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/).

The combined snapshots contain **five actual RSSHub ERROR headers**, with two distinct causes:

- Three episode-detail `ECONNRESET`/fetch-failed records at 15:46:50.108322, 19:07:22.055033 and 21:06:26.264736 UTC. Independent replay confirms their phase/cause and no final route-error line in the main capture. Old successful source rows do not prove those requests succeeded. Three separately labeled bounded current route checks return valid XML with 15, 15 and 14 items; they establish availability at their probe times, not permanent removal of resets.
- Two provider risk-voucher records with nearby API business code `-352`, at 22:00:03.342794 and 22:01:02.616956 UTC. Independent delta replay confirms voucher presence without exporting its value. They are not additional podcast resets or HTTP 429 events. Video requests lack a video completion in this finite capture; a different dynamic route returns 200. Root's later persisted-stage check records a subscribed source's scheduled run created at 22:00 and completing at 22:01:02 through that dynamic fallback, with 12 items and two new entries. That row falls after the 21:58 state checkpoint; its metrics complement the earlier 602-row interval. This is fallback operation, not proof that the requested video route recovered or direct attribution of every log record to a job. Original source URL/subscription are retained; no CAPTCHA bypass or route replacement is proposed.

No explicitly logged HTTP 429 in these records does not establish that none occurred upstream: overview/stale-cache fallback can avoid a terminal rate-limit failure without a separate counter. Source ACTIVE/zero-error state also does not prove primary-route health when a fallback succeeded.

### PostgreSQL and state

Independent header parsing finds zero PostgreSQL ERROR/FATAL/PANIC/WARNING records in both captured windows. Fourteen status/SQL mentions are not fourteen database or article-extraction errors. The main snapshot has 16 actual duration logs over one second, nine over ten seconds, maximum 16,842.865 ms. These are performance observations; no causal link to translation 502 was reproduced. They do not justify an unrelated production change.

Independent PostgreSQL aggregation reproduces 602 rows created during the main/state interval, with current final states 495 success and 107 not-modified, from 598 midnight and four manual-admin triggers. Those final row counts do not erase logged intermediate failures, prove exact event/job attribution, or cover every older-created run. The state checkpoint has 255 subscriptions/223 distinct subscribed sources, 222 ACTIVE and one ERROR original publication retained by the user's choice. Active error fields are zero at that checkpoint; primary-video degradation remains separately documented.

## Scheduled eligibility repair source review

The controllable defect is automatic selection of ACTIVE rows with no subscriptions. Root's later catalog check reports 609 ACTIVE rows, only 222 subscribed and 387 orphan rows. The observed 522 source is one such orphan. Existing subscription deletion already treats no-subscriber feeds as orphaned, but historical/imported leftovers remain; automatic eligibility must enforce current ownership independently.

The reviewed delta imports Subscription and reuses one ACTIVE plus correlated EXISTS base query in regular and midnight selection. It preserves due timestamps, local-day/attempt guards, cadence/timezone, origin circuits, reconciliation and terminal writes. EXISTS selects shared feeds once and counts inactive-account subscriptions without joining account activation. The private loader's only production caller is scheduled `fetch_all_feeds`; manual/admin/bootstrap enqueue and `fetch_feed_task` remain unchanged. No Feed/Entry/Bookmark/UserEntry deletion or status reset is added. Existing queued/manual work is not canceled; this repair limits future automatic selection rather than promising that every orphan request becomes impossible immediately.

After independently verifying the local Unix Docker context, running isolated PostgreSQL test container, port 5433 and `glean_test` database, the evaluator serially ran:

`TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test UV_CACHE_DIR=/private/tmp/glean-uv-cache uv run --no-sync pytest apps/worker/tests/test_scheduled_source_eligibility.py apps/api/tests/test_feed_fetch_progress.py apps/api/tests/test_feeds_router_active_runs.py apps/worker/tests/test_feed_refresh_scheduler.py -o addopts='' --import-mode=importlib --tb=short --show-capture=no`

Result: **23 passed**, one existing deprecated-regex warning. Six cases use real PostgreSQL rows/selection, covering both orphan paths, inactive-only ownership, multi-owner deduplication, exact due/attempt/day boundaries, preserved rows/state and resubscription. The evaluator requested and verified the stronger inactive-only midnight case. The remaining 17 guardrails cover queue reuse/reconciliation, origin deferral, cadence and timezone fallback. Test setup drops/recreates only the verified isolated test tables; no NAS test writes occurred. Root separately reports 12 additional RSS/backoff/HTTP guardrails passed; those are not presented as an independent evaluator run.

## Necessary packaging correction

The first native worker build failed before producing a deployable image: fresh uv selected CPython 3.15.0 for the existing `>=3.11` project range, and the locked hiredis build called the removed loader method. The inspected lockfile still selects hiredis 3.3.0; Python's primary documentation confirms that removal in 3.15. [Python importlib documentation](https://docs.python.org/3.15/library/importlib.html).

The separately contracted two-line worker Dockerfile change adds configurable `PYTHON_VERSION=3.14.6` and `UV_PYTHON` selection, using the exact independently verified live interpreter. Official uv documentation establishes that setting's interpreter-selection role. [uv environment documentation](https://docs.astral.sh/uv/reference/environment/#uv_python). Package manifests/repository lock, API/RSS images, entrypoint and no-sync command are unchanged. The failed build is RED evidence; no failed image was deployed. The formal native build succeeds, uses Python 3.14.6 and passes the actual startup-wrapper interception without running a consumer. An earlier `--help` probe failed because the wrapper expects a settings path; the corrected probe exercises that path and does not require an application change.

The image-generated lock differs from the repository/previous live lock in **registry/artifact URLs and format revision**, not merely formatting: the existing mirror changes to Dockerfile's default official PyPI, and uv normalizes revision three to five. Independent parsed comparison, normalizing only those URL fields and the format revision, finds all 146 package records/dependency edges and all 1,830 artifact hash/size records identical. All 94 installed distribution versions match the previous live worker. No repository lock or dependency versions changed; this distinction is recorded in the [pin handoff](./2026-10-10-worker-build-pin-handoff.md).

## Final production gates

| Gate | Verified result |
|---|---|
| Frozen release and actual image | Revision `854034857d444096c60592dee0dd7c1e1415330d`; image `8e981bc4dac8d7a7b3202613f4184f330bc71cb5c054c19563d7261f412b708e`; running, restart count zero |
| Runtime implementation | Selector SHA-256 `70e607ec1f8f15356da4f548329c48c9f0d8d8edcaa0882cc01c63de1db6a73c`; Python/UV selection 3.14.6; actual wrapper intercepted before consumer execution |
| Read-only production selection | 211 currently due; 222 within the supplemental future window; 387 orphans excluded; all 46 inactive-only subscribed feeds retained; no duplicates or unexpected selection |
| Existing records retained | Protected before-ID sets all present: 610 feeds, 182,372 entries, 255 subscriptions, 9,647 user-entry states, 34 bookmarks and two users; no test refresh or queue mutation |
| Other services and schema | Seven other running service identities/images preserved, including PostgreSQL/Redis; schema remains `94af7ef02eb9` |
| Configuration | Actual environment equals the reviewed predeployment clone, derived from the old worker with only release version/interpreter selection changed; migrations/admin creation remain disabled |
| Worker health/queue | Heartbeat 22:37:52 follows startup; positive TTL at independent final check; queued and in-progress counts zero |
| Rollback | Previous worker image and private compose backup retained; backup directory protected |
| Privacy and local work | Raw evidence/vouchers/identifiers remain private; user report outside Git; original six working-tree edits retained |

The evaluator independently replayed the read-only runtime program against the deployed worker, verified startup interception, selected-feed invariants, preserved baseline IDs, image/version/hash, schema and heartbeat. Metadata reads also confirm protected modes and practical rollback. The [deployment handoff](./2026-10-10-latest-nas-worker-deployment-handoff.md) records root's native build, registry push and controlled worker swap. Local final comparison verifies the original six changes remain intact, allowing only the already authorized summary-line removals in ReaderCore.

Final disposition: **ACCEPTED**. The controlled orphan-selection defect and interpreter build failure are repaired and deployed with independently verified gates. The primary video route remains subject to external provider verification; its successful dynamic fallback is reported separately. The original publication's external 404 remains preserved by user choice. No translation code repair, video-verification bypass or unrelated slow-query repair is justified by this evidence, and no universal future/provider-success claim is made.

The evaluator no longer needs the owned temporary candidate/environment clone or diagnostic helpers. Root may clean up those temporary items and archive this completed workflow; retain private audit evidence, rollback material and the user report according to the existing retention policy. This closes this audit only and does not close unrelated active plans.
