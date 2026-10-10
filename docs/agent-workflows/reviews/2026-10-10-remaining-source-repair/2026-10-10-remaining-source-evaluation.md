# Remaining-source repair independent evaluation

Date: 2026-10-10. Phase: **ACCEPTED — deployed parser/RSSHub repairs and seven controlled source recoveries verified**. Two externally unavailable sources remain documented in the private user report. This assessment does not claim every active source received a new HTTP probe or guarantee future provider availability.

## Rubric assessment

| Required check | Current result | Evidence |
|---|---|---|
| Contract compliance | Pass | Parser repair is narrow and preserves feed behavior. Initial four selected-source probes were read-only and limited to the single active account; later all-account inventory scope was explicitly authorized. No inactive activation/login or duplicate evaluator refresh wave was used. |
| Behavioral correctness | Pass | Independently reproduced prior-HEAD HTML false success and verified corrected boundaries. Seven controlled worker runs are successful terminal states; deployed RSSHub matches the corrected candidate and serves valid output. |
| Regression risk | Pass within tested scope | 103 backend tests and 18 supported RSSHub/CA/entry tests pass. Before-state associations, stateful services, prior application images and practical rollback are preserved. Two integration defects were rejected and fixed before production. |
| Repository fit | Pass | Contract, generator handoff and source-triage instructions are present. Private source inventories/addresses are not copied into this report. Docs validation and Git whitespace checks pass. |
| Verification quality | Pass with explicit coverage limits | Tests, prior/current parser comparisons, bounded NAS probes, exact runtime hashes, terminal-run/association checks and aggregate schema/account/source checks were executed independently. Valid XML and controlled worker results supplement HTTP status. |

## Parser verification

The old parser checked for HTML only after `bozo=True`. A real benign well-formed HTML fixture has `bozo=False`, no feed version and zero entries; prior HEAD returned an empty successful feed. The corrected code checks no-entry HTML independently of that flag.

The evaluator rejected the first candidate for three reproduced boundaries: empty RSS bytes raised `TypeError`, a valid Atom `html:feed` namespace prefix was mistaken for an HTML root, and comment-prefixed HTML bypassed the guard. The generator added five RED cases and corrected byte decoding, leading declaration/comment handling and complete HTML-root matching.

Independent checks after correction:

- Prior-HEAD/current isolated comparison proves the original well-formed HTML false success now fails with the existing HTML classification.
- Empty RSS bytes and valid namespaced Atom remain accepted; comment-prefixed HTML is rejected. Generator regressions also cover UTF-8/UTF-16 HTML bytes, empty RSS/Atom strings and both partial-salvage forms.
- `UV_CACHE_DIR=/private/tmp/glean-uv-cache TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test uv run --no-sync pytest --import-mode=importlib packages/rss/tests/test_parser.py packages/rss/tests/test_discoverer.py packages/rss/tests/test_fetch_retry_policy.py packages/rss/tests/test_synthetic.py apps/worker/tests/test_feed_fetcher.py apps/worker/tests/test_rsshub_reliability.py -o addopts=''`: **103 passed**; existing regex/AsyncMock warnings remain.
- Targeted Ruff and format checks: **passed**. `python3 scripts/validate-docs.py` and `git diff --check`: **passed**.

No speculative retry, scheduler, queue or provider changes were added to the parser repair. The [generator handoff](./2026-10-10-remaining-source-parser-handoff.md) records the implementation and verification.

## Focused RSSHub rate-limit patch review

Subsequent diagnosed podcast failures came from episode-detail HTTP 429 rejecting an unbounded `Promise.all`, while another source's transport reset was transient. The evaluator reviewed the narrow dependency patch and independently ran ten local executable/fixture tests and three benign loopback tests against the NAS's actual installed `ofetch` library. All passed; the loopback assertions verify one attempt for 429, three attempts recovering from 500 and two attempts recovering from a socket reset.

The code preserves ordered metadata and full-detail cache hits, bounds detail concurrency to two, stops further cache-miss detail requests after an invocation's first 429, and uses only existing nonempty overview descriptions for limited details. Missing overview bodies and other failures remain explicit. Fallbacks do not overwrite full-detail cache entries. The patcher removes only 429 from the inspected retry-status list, is idempotent, rejects unknown layouts and validates both targets/syntax before writing either file. Syntax/docs/whitespace checks pass.

This source is accepted for a derived-image canary, with `REQUEST_RETRY=2` restored to preserve bounded transport/server retries. The earlier temporary zero-retry configuration is not the final proposed behavior. Actual patched-helper transport tests and live route canaries remain required; see the [RSSHub handoff](./2026-10-10-remaining-rsshub-repair-handoff.md).

## CA chain-completion security differential review

### Executive summary

| Finding severity | Count |
|---|---:|
| Critical / High / Medium / Low | 0 / 0 / 0 / 0 |

Crypto/TLS changes were treated as HIGH risk for review. Recommendation: **APPROVE deployed revision 2441ce2**. No unchecked CA addition or TLS-verification removal was found. Scope: all eight certificate/preload/entry-patch/test/provenance files plus the Dockerfile delta were reviewed, with Node/CA primary documentation and baseline entrypoint metadata. Runtime failure/negative/preservation tests cover the new validation and trust-installation path. Two candidate-only functional blockers were caught and corrected: inherited-command clearing and actual-app certificate loading. The rebuilt candidate and deployed image pass metadata, runtime-source and default HTTP gates. The failed 002/4d images were never deployed and remain rejected.

### Change and baseline

Baseline `bc4cf6b` inherited the upstream RSSHub default CA store and `dumb-init --` / `npm run start`; git blame confirms the preceding Dockerfile changes concern the inspected route/retry patches. The delta adds one public cross-signed certificate, a pinned verifier, an optional preload and a shell wrapper. No existing security validation is removed. However, setting a new Docker `ENTRYPOINT` clears an inherited `CMD`: the root's candidate-002 inspection found `Cmd=null`, compared with the baseline `npm run start`. This is a confirmed startup blocker, not a CA-validation defect. Candidate 002 was never started or deployed. The evaluator reviewed the subsequent explicit `CMD ["npm", "run", "start"]` correction and accepts that source correction; a rebuild and default-startup canary are still required.

The publisher presented a leaf and YR1 but omitted the cross-signed bridge. [Let's Encrypt's official chain documentation](https://letsencrypt.org/certificates/) identifies the default YR1 chain through Root YR and ISRG Root X1; the [official certificate details](https://letsencrypt.org/certs/gen-y/root-yr-by-x1.txt) identify the public bridge and its validity period. This evidence supports chain completion, not an HTML-parser assumption or certificate-verification bypass.

### Critical findings and adversarial checks

No finding was identified. A substituted or wrong self-signed certificate fails the exact DER pin before trust mutation. A missing/expired issuer, expired or not-yet-valid bridge fails validation; the bridge must cryptographically verify against an already trusted CA with the expected X1 issuer identity. An untrusted remote endpoint has no input path to the fixed preload certificate file. Wrong hostname checks remain active; no `rejectUnauthorized=false`, check-server-identity replacement, host CA-store update or proxy change is introduced.

Independent HTTPS download of the official PEM is byte-identical to the vendored file. Its DER SHA-256 is `072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76`; CA=true, validity 2026-05-13 through 2032-09-02, and issuer signature verify against the existing trusted X1. Current-date verification used 2026-10-10; earlier-than-validity and future-expiry probes reject the certificate.

### Test coverage and evidence

- Independent combined RSSHub/CA executable suite: **16 passed**, including six CA positive/negative/preservation cases.
- Direct probes confirm every prior CA fingerprint remains after install, the extra-CA environment setting remains unchanged, hostname/minimum-TLS functions remain unchanged, a wrong hostname is rejected and an unsupported getter retains the existing trust set through the fixed-diagnostic fallback.
- The shell wrapper preserves the exact existing NODE_OPTIONS prefix, NODE_EXTRA_CA_CERTS setting and an argument containing spaces; shell syntax passes. Baseline image metadata independently confirms `dumb-init --` and `npm run start`. Wrapper tests alone did not establish candidate Docker command preservation; the later image inspection supplies the missing RED case.
- Public certificate verifier/build command and Node syntax checks pass. Official [Node TLS documentation](https://nodejs.org/api/tls.html) supports appending to the current default list, including configured extras. Existing extra certificate files are not modified.

An initial extra probe compared raw CA strings/order across the evaluator's explicit restore step and failed because Node canonicalizes that representation. The corrected check compares certificate fingerprints and snapshots immediately before the negative case; it passes. This was a probe issue, not evidence of changed trust identities.

### Blast radius and history

Production call graph: `verifyPublicBridge` has two callers (installer and build CLI), `installPublicBridge` one caller and `tryInstallPublicBridge` one installer caller. The installer has two startup import paths after correction: the wrapper option and patched common entry. Direct caller counts are small, but the setter intentionally affects subsequent HTTPS trust in each initialized RSSHub Node process. It is not limited to one hostname. Backend/worker Python, host/system trust stores and other services are outside this mutation. The reviewed pin/signature/default-preservation checks are therefore required even though direct caller counts are low.

No security fix/CVE guard was removed or reintroduced. The certificate is an existing X1-signed delegation; the implementation still makes a real process-scoped CA-list change and does not describe it as a host-only adjustment.

### Recommendation, method and limitations

Rebuild with the reviewed explicit baseline `CMD` alongside the new entrypoint. Require candidate metadata and an actual default-command startup canary to pass before production. Also verify the actual supported Node APIs, public fingerprint, preserved default/extra/proxy configuration, safe failed-preload continuity and the original publisher handler's live RSS output. Retain rollback. The chain helper does not promise availability after bridge expiry or during provider outages.

The corrected startup candidate, revision `4d33eb2162fad96d70b8a455d7cbbde308ffa970` and image `bb499ee3c1d6813ead0fa9b9d3c91e7d7b480c72f92cf8a948089d84b2cf86bf`, passes independent image metadata and default startup checks. Its exact baseline command and reviewed entrypoint run without an override. Private configuration matches production except the intended retry restoration to two; default/extra CA settings and proxy configuration are retained. An isolated child using the primary app environment confirms supported APIs, the pinned bridge, all previous CA fingerprints and unchanged trust after invalid-certificate rejection.

The evaluator then broadened the bounded metadata check to both process command lines containing `dist/index.mjs`. One Node context contains the exact preload option; its Node-child context contains neither an environment nor command-line preload marker. An isolated diagnostic using the child's initial environment likewise lacks the pinned bridge. This alone was treated as a loading uncertainty rather than direct introspection of its trust state. Root's actual default HTTP canary subsequently returned 503, with six fixed TLS-issuer error classifications and zero expiry/numeric-length/null-body classifications.

The generator traced the exact cause to the upstream package start command: `cross-env NODE_ENV=production NODE_OPTIONS='--max-http-header-size=32768' node dist/index.mjs`. An independent public-source shape check confirms it overwrites the wrapper preload before the actual app starts. The first matching Node context can be the cross-env control process; the evaluator's initial executable/parent-role classification did not distinguish that control process. The compiled entry has a cluster path, but neither cluster nor dotenv was shown to remove the option. Candidate 4d33eb2 remains rejected for production; the original publisher parser remains unchanged.

The evaluator accepts the subsequent narrow source correction: an inspected-layout patch prepends a static import of the existing guarded installer to the common entry; synchronous certificate loading completes before dependency TLS-context initialization. The package start command/header setting, Docker command, wrapper, cluster and proxy behavior are unchanged. Independent supported local suite: **18 passed**, including a real parent/cluster-child fixture that clears `NODE_OPTIONS`, checks the bridge and existing X1 before a proxy context, and preserves arguments/options. Unknown-layout rejection and idempotence pass. The installer receives one additional common-entry import path; trust mutation remains process-local and guarded by the same certificate pin/signature/date/default-preservation validation. Rebuild and fresh default HTTP verification remain required.

An initial broader local invocation also included the existing Cheerio-dependent adapter test, which could not load because Cheerio is not installed at the repository root. That environment error is separate from the clean supported 18-test suite; earlier actual-NAS parser/adapter checks and candidate route evidence remain the appropriate verification for that dependency.

Final candidate revision `2441ce28394084ee7efbf41485a6267f5bc085eb`, image `ecf388898a68e93ca70b2a6083d63bf5e73040abeba66eea2d636702122ee698`, passes independent exact-image/revision/default-command checks. All nine reviewed runtime file hashes match; the common entry's first synchronous installer import and patch marker are present. Retry count is two; original header option and private configuration/default-extra CA settings remain intact. Diagnostic contexts using both actual process environments load the real common installer and retain the pinned bridge, every prior CA fingerprint and unchanged trust on invalid-certificate failure, even when the package script omits the wrapper preload option. This is complemented by root's cold default route evidence and one independent bounded default request: HTTP 200, valid XML, five items, five dates and five nonempty bodies.

Root's candidate regression requests also returned valid output for the research route, a note-card route and two previously rate-limited podcast representatives. Note-card descriptions are legitimately empty; the report does not treat every feed item as requiring an article body. Production subsequently runs the same reviewed image and passes the final checks recorded below.

Method: focused security differential review using baseline git history/blame, complete new-file review, one-hop call graph/counts, negative attacker scenarios, primary provenance comparison and fresh tests. Confidence is HIGH for the reviewed source and current certificate; candidate/production behavior remains a separate gate. No private inventory or certificate-store content is copied into this public report.

## Independent bounded NAS evidence

The evaluator adapted the supplied helper in memory to remove file writes, explicitly restrict ownership to the single active account and probe only the four selected sources serially with bounded timeouts/pacing. No refresh was enqueued. Source contents, IDs, credentials and inventories stayed on the NAS; this public repository record uses generic labels and aggregate evidence.

| Selected case | Independent result before recovery |
|---|---|
| Publisher A | Configured and direct paths both returned 200/valid RSS/15 entries/title match. The earlier reported proxy timeout is intermittent and was not reproduced on this later probe; direct response was faster. |
| Publisher B | Configured path raised `ConnectError`; direct returned 200/valid Atom/20 entries/title match. |
| Existing video route | Persisted ERROR/source type feed, while configured route returned 200/valid RSS/30 entries/title match. This is positive recovery evidence, not proof the persisted state has already been repaired. |
| Legacy aggregator | Persisted ERROR; configured endpoint returned 200 with 114-byte HTML, no format version, zero entries and `bozo=False`. The old deployed parser still accepted it; HTTP success is not feed availability. |

Source names/clean addresses belong in the private user-facing report, not a public subscription inventory. At the initial checkpoint, optional inactive-account authorization was unanswered and no such inventory was accessed. The user subsequently explicitly authorized source inventory/listing across all accounts. This expands read/list coverage without activating or authenticating as an inactive account; raw logs, contents and credentials remain private.

## Runtime and recovery progress

Backend/worker parser release `a6ccf99` runs with image prefixes `57d209c3c06c` / `9b175687e249`. Independent checks on both actual runtimes match the reviewed parser hash, reject benign HTML and preserve empty RSS bytes/namespaced Atom. Both original target host exclusions are present in uppercase/lowercase variants with matching sets, while proxy settings remain configured. PostgreSQL/Redis retain their original container IDs.

Three selected tracked refreshes independently reached success/complete, active state and zero errors. The fourth initially failed at the actual worker XML-fetch boundary despite a successful standalone direct probe. The root traced an authoritative HTTPS redirect whose destination was not excluded from the proxy, then demonstrated a temporary worker-process success with only that verified host added; TLS verification was retained. After the correction, independent fresh tracking shows the fourth run `not_modified` / complete, no error, active state and zero errors. All four controlled recoveries therefore have actual terminal worker evidence.

Independent before/after preservation checks pass for all 438 existing entry associations, 107 user read-state rows, original selected subscriptions and bookmarks. A proposed promotion was guarded against job/score/lease/run-ID mismatches but found no eligible jobs and promoted zero; jobs progressed naturally and the queue was not changed by that operation. No evaluator refresh enqueue or database/configuration mutation occurred.

The active-account aggregate at the initial checkpoint was 177 subscribed sources, 171 ACTIVE, six nonactive and zero ACTIVE feeds carrying error counters/messages. A later paced 23-route snapshot exposed intermittent failures which recovered on reprobe; these must be classified as transient snapshots rather than dead-source claims. Standalone availability and persisted status are reported separately.

The intermediate authorized all-account checkpoint reported 255 subscriptions and 223 distinct sources, with 219 ACTIVE and four ERROR sources; the original active-account catalog contains 177. Two additional controlled source refreshes independently reached success/complete, active state, no run error and zero error counters. A read-only aggregate helper confirms all 10,656 previous entry associations and both selected subscriptions are preserved. The final RSSHub source also independently reached success/complete, active state and zero errors after its positively verified local URL replacement; all 249 prior entry associations, its original subscription association and zero prior state rows remain preserved. These are time-specific counts: concurrent subscription activity can change global totals and must not be misattributed to the targeted repairs. Existing-association comparisons provide the stronger preservation evidence.

A fresh initial-snapshot comparison confirms five original user-edited files remain byte-identical. `ReaderCore.tsx` equals its original snapshot except for exactly six authorized summary-line removals; the user's `detailOpen` addition remains present. No evaluator modified production code or either source-recovery before-state record.

## Final live gates — verified

| Component | Verified source/image |
|---|---|
| Backend | `a6ccf992fca644c3a147e7cf404664cfa903f73b` / `57d209c3c06cc2ceddf33e558ad44d132f9ce8a255b77a0f0e97bd0bfa5e9327` |
| Worker | Same source / `9b175687e24911a139cb92815b57eb5c31fa0c337335b765e1f54c2c570caa5d` |
| RSSHub | `2441ce28394084ee7efbf41485a6267f5bc085eb` / `ecf388898a68e93ca70b2a6083d63bf5e73040abeba66eea2d636702122ee698` |
| Web/admin | Previously verified `7f7f90f` images and full revision labels, unchanged |

1. **Runtime/source:** independent production checks match the exact RSSHub image/revision and all nine reviewed runtime hashes, including first synchronous entry import and original header option. Backend/worker remain on the independently checked parser images; their summary-free translation/scheduler implementation is unchanged by this RSS-only rollout.
2. **Configuration/TLS:** all three proven exact host exclusions are present in both variants with matching sets; existing proxy settings remain configured. Production RSSHub environment matches the approved candidate. Certificate pin, prior trust/default-extra settings and failed-validation continuity pass. The image retains its reviewed wrapper/CMD; production deliberately preserves the original Compose `dumb-init --` override and `npm run start`, confirmed against the saved Compose configuration. Common-entry loading supplies the guarded certificate independently of that override.
3. **Data/worker:** seven controlled runs are terminal/complete/active/error-count zero: six success and one not-modified. Independent before-state checks pass for the original four targets' 438 entry associations/107 user states, the additional two targets' 10,656 entries/two subscriptions, and the final target's 249 entries/one subscription/zero prior states. URL changes used collision checks, kept Feed IDs and cleared old validators; counters followed successful worker behavior. No evaluator enqueue, database mutation or queue reset occurred.
4. **Stateful/rollback:** original PostgreSQL/Redis IDs remain running; schema is still `94af7ef02eb9`. Account aggregate remains two users, one active. Migrations/admin recreation remain disabled. The prior RSSHub image and private original rollback configurations exist; current source/configuration backups are recorded in the deployment handoff. The earlier guarded priority operation promoted zero jobs. Six original user edits remain preserved outside task changes.
5. **RSS behavior:** the independent candidate default request is valid XML with five items/dates/bodies; root's cold candidate and production default probes confirm the corrected path. Production research, note-card and representative podcast outputs also pass. Actual compiled-helper tests retain one 429 attempt and bounded 500/reset recovery; retry count is two. No certificate bypass, challenge bypass or speculative publisher-parser change was introduced.
6. **Inventory/report:** an independent final read-only aggregate checkpoint confirms 255 subscriptions, 223 distinct subscribed sources, 221 ACTIVE and two ERROR, with zero ACTIVE error-field/latest-failed-run counts. Root's final bounded probes identify the remaining two as HTTP 404 with no verified official replacement and HTTP 403/CDN challenge with no verified trusted mirror. The incidental 429-like body text was not used to override the actual 404 classification. The private report contains two unresolved sources, seven repairs and explicit coverage limits; local verification confirms mode 600, outside Git, two credential-free URL fields, no private ID/token fields and no UUID strings. It is not copied into this public artifact.

Final disposition: **ACCEPTED / APPROVE** for the controlled repairs and deployed revision. No controlled repair blocker remains. External 404/challenge failures remain explicitly unresolved; ACTIVE counts are a checkpoint rather than proof of universal fresh availability. The owned canary, cloned runtime environment and temporary probe/tracking files are no longer needed by the evaluator. Retain restricted source before-state and practical rollback records. Root may clean up owned temporary artifacts and archive this workflow.
