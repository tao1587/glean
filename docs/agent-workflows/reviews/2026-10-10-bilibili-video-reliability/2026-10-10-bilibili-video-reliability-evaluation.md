# Bilibili video reliability independent evaluation

Date: 2026-10-10 PDT. Phase: **FINAL ACCEPTED — configuration repair, production maintenance and preservation verified**.

Live timestamps in this record are on 2026-10-11 UTC, corresponding to 2026-10-10 PDT. Acceptance concerns the reproduced protocol/session defects and bounded observed recovery; permanent provider availability is not asserted.

Contract: [Bilibili video reliability](./2026-10-10-bilibili-video-reliability-contract.md). Source baseline: `839de30ccfa011e1b97c6e5d6a2b1fc5aad50199`. Initial review used repository code. The later configuration review reads protected NAS metadata and public primary documentation/source only; the evaluator makes no provider/browser requests, database mutations or refresh enqueues. Personal source names, addresses, identifiers, payloads and verification vouchers remain outside this record.

## Candidate order and successful fallback semantics

`RSSHubService` checks conversion/fallback enablement, generates configured custom routes first, then builtins, and deduplicates exact URL strings while retaining order. The Bilibili-space builtin generates dynamic before video; its existing test checks membership, not exact ordering or video-only contents. It does not match a raw RSSHub route as a publisher-space URL.

The worker begins with the stored Feed URL, then appends conversion results from `feed.site_url or feed.url`. Thus a video primary followed by a publisher-space conversion can fall back to dynamic before any remaining video candidate. Successful fallback does not rewrite the primary URL, but feed title/description/site URL metadata comes from the returned feed; a changed site URL can affect later conversion. Custom configuration can change this order and must be examined in the actual deployment rather than inferred from builtin defaults.

The attempt loop accepts the first fetched payload, then parses it outside the loop. A transport-successful HTML/invalid payload can therefore fail parsing without trying the next URL. A valid empty RSS feed can complete without proving that video output was obtained. This is a current boundary to verify, not authorization to broaden this task with an unrelated fallback refactor.

`fallback_used`/`used_url` identify the selected request path. ACTIVE/zero-error or a terminal success proves neither video-only content nor recovery of the failed video provider. The prior dynamic fallback's success remains distinct from primary video availability.

## Identity and preservation boundaries

| Mechanism | Consequence for a route or option change |
|---|---|
| Feed URL is globally unique; Feed rows are shared by subscriptions | Change the existing row only after checking URL collision and all owners; deleting/recreating would risk cascades and sever associations |
| Parser derives GUID from feed `id`, otherwise link, then resolves relative values | Changing route, channel base URL, query options or emitted identifiers can change GUIDs even when video URLs are the same |
| Entry uniqueness is `(feed_id, guid)`; URL is indexed but not unique | The same video with a new GUID can be inserted again; URL equality alone provides no duplicate protection |
| Worker uses `ON CONFLICT DO NOTHING` for existing GUIDs | Stable existing GUIDs preserve old rows/content but do not enrich or replace old articles automatically |
| Primary conditional headers are used only on the first attempt | A primary URL/semantic option change must clear old validators; fallback responses do not overwrite primary validators |
| RSSHub behavior depends on `source_type`, not only the URL host | Preserve RSSHub typing to keep content-backfill and transient circuit/retry semantics |

The generic `FeedService.update_subscription` is not a sufficient preservation procedure for this repair: `feed_url` selects plain-feed typing, validators are not cleared, and omitted `custom_title` defaults to clearing the alias. The RSSHub-path option supplies RSSHub typing but still does not implement the contract's full snapshot/locking/validator checks. A controlled repair must preserve every subscription's existing fields and the Feed's identity, use row-state/collision/active-run guards, and limit changed fields to the validated route/typing/validators. Scheduler state, retries and terminal counters must converge through the actual worker rather than manual status resets.

Old article ID/feed/GUID/URL/title/author/content/summary/date fingerprints, all subscription fields, read-state fields and bookmarks require protected before/after comparison. Counts alone cannot establish content preservation. New candidate entries should be compared with existing entries by stable video identity as well as parsed GUID, including duplicate-video detection across the primary and fallback outputs. Existing nonvideo dynamic articles must remain intact even if future ingestion becomes video-only.

Relevant implementation: core `rsshub_service.py`; worker `tasks/feed_fetcher.py` candidate resolution/fetch/parse/insert paths; RSS `parser.py` GUID resolution; database `Feed`/`Entry` constraints; core `FeedService.update_subscription`. Manual/admin enqueue, subscribed-only regular/midnight selection, all-account eligibility and feed-fetch guardrails remain outside the intended change.

## Baseline verification

Independent local command, with no production database access:

`UV_CACHE_DIR=/private/tmp/glean-uv-cache uv run --no-sync pytest packages/core/tests/test_rsshub_service.py -o addopts='' --tb=short --show-capture=no`

Result: **eight passed**, one existing deprecated-regex warning. This verifies the existing conversion tests only; it provides no live provider or video-content proof. Source inspection establishes the ordering, parsing and persistence boundaries above.

## Minimal configuration candidate

Root reports a protected baseline of 78 old entries (50 video and 28 dynamic), one subscription, six reading states, no bookmarks and no active run. The evaluator independently reads the baseline on the NAS and confirms counts 78/one/six/zero and that every old GUID equals its URL. Those mixed historical contents must all remain intact. A single existing-cookie check reports not logged in; this does not establish that every provider `-352` is caused by that cookie.

Independent reading of pinned official RSSHub configuration/helper source confirms CDP selection has priority, while the legacy Puppeteer variable supplies the native-WS field. Browserless documents `/chromium` as CDP and `/chromium/playwright` as the native protocol. Playwright's native connection default has no timeout; CDP defaults to 30 seconds. These distinguish a handshake problem from provider business-code failure. [RSSHub configuration](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/config.ts), [RSSHub helper](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/utils/playwright.ts), [Browserless protocols](https://docs.browserless.io/baas/advanced-configurations/playwright-customizations), [Playwright connection reference](https://playwright.dev/docs/api/class-browsertype#browser-type-connect).

The evaluator independently reads the two protected local-content evidence records and current Docker metadata:

| Evidence | Observed metadata |
|---|---|
| Old native connection | 2026-10-11 01:34:22–01:34:26 UTC; not connected, 3,510 ms, error class `Error`, timeout flag false, zero external page requests |
| Actual installed helper with process-only CDP setting | 01:34:26–01:34:27 UTC; connected in 758 ms, context/page created, one local fulfillment interception, expected content matched, zero external page requests |
| Current production | CDP variable absent; existing legacy endpoint uses a CDP path; unchanged image `ecf38889`, restart count zero |
| Evidence protection | Files mode 600, parent directory mode 700; private endpoint/token values not exported |

This is meaningful RED/GREEN for protocol/context/interception, not a live-video success. The recorded error must not be mislabeled `TimeoutError`. The smallest candidate sets `PLAYWRIGHT_CDP_ENDPOINT` to the existing private endpoint while keeping the image, legacy alias, token, Cookie, Feed URL, route and content semantics unchanged. It avoids a structured timeline adapter and its GUID/date/authorship risks.

CDP selection affects the shared browser helper, not only this Feed. The pinned helper adds selected proxy launch arguments but creates a separate context. Browserless cautions that a new context may not inherit launch proxy settings; its general capability table also limits CDP interception, so actual installed-helper proof is required and already exists for this local fulfillment. Root must still establish the effective proxy behavior through safe metadata and the bounded video canary, retain the complete environment/configuration rollback, and assert no unrelated endpoint/options/trust changes. Protocol correction does not bypass or resolve a provider challenge by itself.

**Initial plan assessment:** the isolated same-image CDP canary was reasonable and within the contract. Production approval was withheld until video output, cache provenance, the later sample, proxy behavior and preservation were verified. The completed evidence and final gates below resolve those requirements without duplicating root's provider budget.

### Root-reported bounded canary progress

The evaluator independently reads the protected first/repeat records from an isolated memory-cache canary using the unchanged route/image: 2026-10-11 01:35:48–01:35:51 UTC, HTTP 200 in 3,247 ms, then 01:41:03–01:41:04 UTC, HTTP 200 in 861 ms. The second begins 312.04 seconds after the first completed, exceeding the configured 300-second cache interval. Both contain 30 canonical video entries with dates/GUID-equals-link, all 30 matching existing video GUIDs/dates, with no unmatched items. These limited samples establish recorded route compatibility and repeat availability. Neither ordinary sample proves that CDP recovered a live provider challenge, because the successful path was the native API.

A separate isolated diagnostic fixtures only the initial native API failure, then uses the unchanged compiled handler for its real browser branch. Root reports one browser connection with no matching video response before Browserless's 30,000-ms server lifetime ends at approximately 30.5 seconds. This is shorter than the handler's 45-second response wait. The evidence supports investigating session lifetime separately from protocol selection, not declaring the provider itself fixed or still returning a particular business code. An error-directory omission prevented a complete structured diagnostic result; that missing record must be disclosed, not inferred from ordinary successful samples.

The final bounded diagnostic sets `timeout=90000` on that isolated CDP connection only. Browserless's primary reference defines this URL parameter as session duration. Keep global timeout, existing token, handler response wait and lifecycle behavior unchanged; the effective server duration is separate from Playwright's connection deadline and the route's response wait. [Browserless launch parameters](https://docs.browserless.io/baas/launch-options).

The final diagnostic uses an outer deadline and cleanup, fixtures only native failure, and seeds no video-list/response/XML cache. Metadata seeding is restricted to existing public name/icon information and unused native signing fields. Root captures the real browser response through the unchanged compiled handler. The evaluator independently reads its protected metadata and captured output; no extra provider/browser request is made:

| Gate | Independent read/check result |
|---|---|
| Runtime branch | 01:43:04.767–01:43:07.694 UTC, 2,927 ms; one native fixture hit, zero native provider requests, one real browser connection and one video response |
| Real response | Document HTTP 200; video API HTTP 200/business code zero; requested publisher matches the target |
| Effective proxy | Selected launch proxy matches existing configuration; observed response socket IP and port match that configured proxy after root's DNS comparison |
| Lifetime/cleanup | Effective session limit 90,000 ms; browser closed; global 30,000-ms setting retained |
| Captured handler output | 40 items/40 canonical video links/40 unique links/40 dates |
| Independent content reproduction | Evaluator recomputes comparison entirely on NAS: 40 old GUID matches, 40 title matches, 40 date matches, zero new GUIDs; no body/identifiers leave NAS |
| Evidence protection | Browser output/result and backend comparisons mode 600, directories 700 |

This proves that the existing browser branch can produce compatible videos with the corrected protocol/session setting in the controlled sample. It does not prove every naturally occurring future `-352` will recover, and the two ordinary API successes remain separately labeled. No timeline adapter, video identity/date rewrite or verification bypass is introduced.

### Approved rollout scope and actual deployment

The evaluator approved the controlled RSSHub-only configuration rollout: retain the current image and add `PLAYWRIGHT_CDP_ENDPOINT` using the existing private endpoint/token plus `timeout=90000`. Root deployed that scope at 01:47:54.757183 UTC. The evaluator independently compares the private before/candidate Compose documents and actual Docker configuration: the sole difference is that environment addition, actual environment equals the reviewed candidate, and removing its timeout query restores the prior endpoint/token/other query fields exactly. The legacy alias remains unchanged. Because the variable selects the shared browser helper, this is a shared configuration correction, not a route-local implementation change.

The running image is still `ecf388898a68e93ca70b2a6083d63bf5e73040abeba66eea2d636702122ee698` / `release-2441ce2`, restart count zero. Actual CDP path is correct and per-session timeout is 90,000 ms; Browserless global `TIMEOUT=30000` is unchanged. Eight other component identities/images independently match the protected baseline, covering backend, worker, web, admin, PostgreSQL, Redis, Browserless and the configured proxy. Protected postconfiguration evidence records both health paths HTTP 200 and zero startup ERROR headers. No image build, source/dependency change or Feed URL replacement occurs.

### Production failures and recovered maintenance

The evaluator independently reads the captured maintenance classifications for 01:47:54.757183–01:50:01.049846 UTC. RSSHub contains **four actual ERROR headers**, two native API-to-browser warnings and two browser starts. Two risk-metadata records and a browser business-code `-403` record are explicitly identified; the other browser diagnostic is retained in root's classification. Business `-403` is distinct from HTTP 403. Worker/backend records have zero ERROR headers in this bounded window.

The primary video route responds HTTP 503 at 01:48:56.103276, then HTTP 200 at 01:49:00.663190. These are two attempts by one maintenance job under the unchanged existing HTTP retry policy, not two refresh enqueues. Root's [deployment handoff](./2026-10-10-bilibili-video-deployment-handoff.md) records native `-352` warnings on both attempts and the first browser failure; no dynamic response occurs. A zero browser-352 regex count does not prove those restrictions are universally absent. The final success does not erase the first failure or four ERROR events.

At 01:52:45 UTC the evaluator executes an explicit read-only SQL transaction against the deployed application, reading the protected before snapshot and tracking internally. No raw identities/content leave the NAS. It independently confirms:

| Final gate | Result |
|---|---|
| Owned tracked maintenance | Feed/job match protected tracking; `manual_admin`, content backfill disabled; `success`/`complete` at 01:49:00.832784 UTC, no run error |
| Actual selected content path | Original primary video URL, `fallback_used=false`, 40 total items/zero new; three persisted path-metric records all agree with primary/no fallback |
| Stage convergence | One `complete` stage, all recorded stages terminal, zero active target runs |
| Existing articles | 78 before/78 now; zero missing rows and zero old rows with any field mismatch |
| Subscription/read state/bookmarks | One subscription, six reading states and empty bookmark set; all old fields/associations unchanged |
| Feed | ID, URL and RSSHub source type unchanged; ACTIVE, error count zero and no stored fetch error |
| Database/queue | Schema `94af7ef02eb9`; queued/in-progress counts zero; worker heartbeat TTL positive (2,709 seconds at independent check) |
| Operational preservation | Actual image/environment, all eight other component identities and practical same-image Compose rollback verified |

Normal Feed timestamps/validators/metadata may advance through the worker; old article fields and subscription ownership/aliases/folders do not change. Existing dynamic history is retained. Zero new entries is observed from this particular current window, not forced by rewriting data or deleting duplicates.

### Verification method and closing disposition

The evaluator ran the existing eight conversion tests, independently read official configuration/protocol references, recomputed the captured 40-item content comparison, and reran full old-row comparisons through a read-only SQL transaction. It did not reconnect a browser, call a provider, enqueue work, reset a queue or mutate NAS data. The local generic data-check runner initially selected the system Python without application dependencies; rerunning through the existing application virtual environment resolves that probe setup issue, with no runtime change.

One exploratory schema listing included an account-bearing environment-key name, without a credential value. This was reported to root and excluded from repository records; subsequent checks use explicit output whitelists instead of environment-key inventories. No credentialed endpoint, Cookie, voucher, source identifier or item list is copied into this report. Final local verification confirms the six original user edits remain intact, allowing only the previously authorized summary removals.

The owned isolated canary, temporary environment clone and diagnostic helpers are no longer required by the evaluator. Root may remove those owned temporary items and archive this completed workflow. Retain protected baseline/audit evidence, original/candidate Compose rollback and the private user report. This does not close the unrelated historical discovery plan.

## Contract acceptance criteria

| Rubric | Final assessment |
|---|---|
| Contract compliance | PASS: bounded research, smallest verified configuration correction, same publication/Feed/history and controlled maintenance |
| Behavioral correctness | PASS within observed scope: normal spaced video samples, real forced browser branch, then actual primary maintenance recovery; intermediate provider failures disclosed |
| Regression risk | PASS: only one environment addition, unchanged source/image/routes/retry/scheduler/ownership rules, actual proxy proof, preserved old fields and practical rollback |
| Repository fit | PASS: contract/research/implementation/deployment/evaluation records, generic public evidence, existing six edits preserved, unrelated plan untouched |
| Verification quality | PASS: protocol/lifetime failure evidence, actual installed helper and real provider output, independent 40-item comparison, deployed runtime/Compose and read-only full SQL preservation, bounded timestamps and limits |

Final conclusion: **ACCEPTED** for the configuration-only correction and controlled production maintenance. The reproduced protocol and session-lifetime defects are corrected; actual primary video ingestion succeeds with the existing retry, and all protected old fields/associations remain intact. Native `-352`, one browser business `-403` and one HTTP 503 remain observed facts. No Feed replacement, dynamic substitution, provider-verification bypass or permanent upstream reliability claim is made.
