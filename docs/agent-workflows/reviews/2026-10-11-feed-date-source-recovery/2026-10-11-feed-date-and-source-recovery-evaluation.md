# Feed date and source recovery independent evaluation

Date: 2026-10-11. Phase: **FINAL ACCEPTED — producer deployment, scoped recovery, owned subscriptions and preservation independently verified**.

Contract: [feed publication-date and source recovery](2026-10-11-feed-date-and-source-recovery-contract.md). Initial local source baseline: `ddb4b153c90887d08d449821d4997b8ed7a5e920`. The early review below was local-only; missing replacement links were later resolved under the user's explicit authorization for official-address research. Final evaluation independently reads protected NAS evidence/runtime metadata, executes read-only SQL and four authenticated internal date-search GETs, and parses existing candidate/production XML. It makes no publisher/browser request, mutation or enqueue. Private inventories, identifiers, fingerprints, content and credentials stay outside this public record. Earlier pending/rejected phases below are historical; final verified gates at the end supersede them.

## Date producer, persistence and consumer boundaries

`ParsedEntry` uses feedparser's publication timestamp, then its update timestamp if publication is absent, otherwise stores null. That existing fallback is not proof that an update date is an article's first publication date. Publisher evidence must distinguish first publication, modification and collection time; do not manufacture a date from the current clock or ingestion timestamp.

Worker insertion uses `(feed_id, guid)` uniqueness and `ON CONFLICT DO NOTHING`. A corrected feed producer therefore supplies dates for new entries but leaves existing null-date rows unchanged. The existing conflict path can enqueue non-RSSHub content backfill; it does not repair publication dates. A valid existing GUID keeps its ID, original content and reading/bookmark associations.

The following consumers have materially different meanings:

| Consumer | Existing time semantics |
|---|---|
| `/entries` collected bounds, server-local week/month period, `/entries/today` | Filter by `coalesce(ingested_at, created_at, published_at)`; collection views remain collection-based |
| Timeline ordering | Order by publication time; PostgreSQL descending-null behavior is not a publication date |
| Search `scope=date`/`scope=week` | Filter directly on `published_at`; null dates fail those comparisons |
| Reader date label | Render only when publication date is present |
| Today-board effective display timestamp | Prefer publication, then ingestion/creation; collection grouping uses ingestion/creation first |

A Today/period response containing the four items does not prove publication-date search works. After repair, root must test the actual authenticated date-search path, correct server-day/timezone bounds and ownership, preserving collection-view semantics and the six pre-existing frontend edits. No frontend filter change is necessary merely to make missing publication dates look present.

### Is automatic missing-date repair necessary?

**Some persistence repair is necessary for the verified existing rows; a universal automatic policy is not yet justified.** A producer-only correction cannot satisfy the existing-article requirement. Choose either a bounded, independently verified null-only data repair or a tested monotonic update path with trustworthy publication provenance. Never overwrite a non-null date or copy an unrelated modification time. Matching must include the same Feed, stable GUID and canonical article identity; a shared/reused identifier must not authorize an unrelated article update.

If implementation updates conflicts automatically, a broad `DO UPDATE ... RETURNING Entry.id` is unsafe with the current worker control flow: the returned old ID would be treated as a new insert, affecting `new_entries`, backfill/embedding jobs and latest-entry handling. Separate the update outcome from insertion, use an atomic null guard, keep ingestion/creation timestamps and all content fields, and make repeated/concurrent repair idempotent. Required regression cases include old-null/new-valid, old-valid/new-different, absent incoming date, wrong Feed/GUID/URL, publication-versus-modification provenance, and existing-row updates counted as zero new entries.

Producer validation must also separate a new item from an old cached item. Public article/card metadata alone is not a deployed reproduction. Verify actual route output, article/feed cache behavior and parsed timestamps, then old-row persistence independently. The [engineering research handoff](2026-10-11-engineering-date-research-handoff.md) supplies current publisher/history evidence; it does not replace those runtime checks.

## Full-text and backfill boundaries

Ordinary entries retain feed summary content when full text is unavailable. Parser/worker fullness heuristics are length/content comparisons, not proof of article identity. The extractor detects common error/challenge/shell responses and can use HTTP/browser readability, but a sufficiently long marketing page can still pass generic extraction. `extract_entry_content_update` accepts nonempty extracted content; a short-content repair must therefore verify the real canonical article, title/author where available, body sections and public availability. A redirected homepage, paywall teaser or different publication is not full text for the old article.

Both RSSHub feed-wide enqueue and entry backfill intentionally skip RSSHub sources even with `force=true`. Do not change source typing merely to bypass this rule. An RSSHub producer correction or narrowly authorized verified existing-body repair must preserve the source contract. Ordinary non-RSSHub backfill may update content when forced, summary-like or longer; that heuristic alone does not establish factual correctness.

When content changes, the normal backfill path invalidates translation body/paragraph caches and embedding state while preserving Entry and read/bookmark identity. A manual full-text repair must address that cache consistency too, or bilingual reading can continue displaying the old teaser. Only verified target content and necessary associated cache state may change; unrelated articles and non-null publication dates remain intact. If the original article is unavailable or restricted, report that limit and preserve old content.

## Subscription discovery, ownership and replacement

`POST /feeds/discover` is a mutation: it discovers/validates, commits a Subscription, then enqueues `subscription_bootstrap`. It is not a read-only candidate probe. Direct/manual RSSHub-path mode bypasses automatic discovery validation. Automatic fallback selects the first parseable configured RSSHub candidate; `_validate_feed_url` requires parsing, not nonempty entries or same-publisher proof. JSON-LD/sitemap synthesis follows separate source typing and may select a different content scope unless checked explicitly.

`create_subscription` reuses globally shared Feed rows by URL and checks duplicates by current user plus Feed. RSSHub creation can upgrade a reused row's source typing, affecting other owners. New subscription acceptance requires the existing active account only, exact folder/alias intentions, no duplicate subscription, correct source typing, verified intended publisher/canonical articles/dates and one converged bootstrap. No inactive-account login or activation is implied.

Existing subscriptions share the underlying Feed. Generic `update_subscription` defaults an omitted alias to null, changes plain `feed_url` typing to `feed`, and does not clear validators. It is not a sufficient safe replacement procedure. Use a controlled in-place operation with current-URL/row-state guards, collision checks, no active competing run, explicit typing and validators when the URL changes. Preserve Feed/Entry/Subscription/folder/read/bookmark IDs and fields. All owners of a shared row must be accounted for; do not delete/recreate or wholesale reassign history.

GUID changes can produce duplicate articles even if URLs overlap, because uniqueness is Feed plus GUID, not URL. Before changing a route/address, compare parsed GUIDs and normalized canonical article identities with old rows. Same author alone is insufficient when the proposed address is a different channel. User confirmation or unambiguous official same-publication evidence is required before a candidate replacement; unresolved identity/link questions remain pending.

## Required acceptance matrix

| Area | Evidence required before acceptance |
|---|---|
| Date producer | Actual deployed failing output/cache case; corrected candidate output with authoritative publication dates and stable canonical GUIDs; non-null/invalid/cache regressions |
| Existing date persistence | Null-only correction of verified rows, zero non-null overwrites or other-content changes, no new-entry count/job side effects; repeat/concurrency tests if automatic logic changes |
| Date consumer | Real owned publication-date search returns repaired old items within the expected server-local date/week; collection filters remain unchanged |
| Four new subscriptions | Four unambiguous official identities and nonempty valid intended content, correct source types/folders/current-account ownership, no duplicates, converged bounded bootstraps |
| Old address recovery | Exact confirmed same-publication links, collision/active-run guards, canonical overlap, same row/associations and appropriate validator clearing |
| Full-text repair | Real public same-article body, explicit teaser/paywall/redirect limits; narrow old-content/cache update only; old IDs/read/bookmarks preserved |
| Deployment/regression | Actual isolated image canaries, frozen source/configuration, preserved prior RSSHub research/podcast/CA/CDP repairs, parser and worker scheduler/retry/circuit rules; meaningful targeted tests |
| Preservation/privacy | Protected before/after all-field comparisons with a precise change allowlist, original six local fingerprints, other/stateful components and rollback; no private inventory/body/credentials in Git |

Initial baseline disposition: no implementation, candidate publication, automatic-date policy, full-text result or production mutation was accepted. The later user authorization permits independent same-publication address research, not a different-author substitution.

Root's later live baseline reports 24 existing engineering articles, four null dates, 21 reading states and one owned subscription, with authoritative publisher dates available for the four. Root selects bounded atomic null-only repair rather than global worker conflict updates; that is consistent with the provenance/preservation boundaries above, pending exact evidence and final verification. Existing subscriptions identified for possible replacement currently fetch successfully; successful status does not decide a user-requested address change, but it is not evidence of obsolescence. Confirm the exact intended links and same-publication identity before acting.

Independent local verification confirms all six original edit fingerprints match the task's private baseline. Those fingerprints hash per-file Git diffs, not complete file bytes. Documentation validation and whitespace checks pass; no runtime test or live acceptance is claimed at this baseline stage.

## Independent Engineering candidate review

The evaluator reads the actual legacy fixture/test harness, adapter and fail-closed patcher, then independently executes the supplied Node suites with real Cheerio 1.2.0/p-map 7.0.5 from the isolated test directory. No NAS/provider request occurs.

- Current candidate suite: **15 passed**. Cache-hit missing-date enrichment, retained frozen body, valid cached date, metadata merge, article Updated rejection, invalid/foreign schema, UTC/Asia-Shanghai equality, order/limit/concurrency and patcher controls pass.
- Current adapter suite against the actual unpatched module: **nine failed/three controls passed**. This replays today's expanded 12-case suite; it is distinct from the generator's earlier seven-case RED result. Missing dates, cache behavior, navigation limit, timezone and concurrency differences are reproduced.
- Two additional benign fixtures against the current candidate: **both fail**. These expose remaining provenance errors not covered by the passing suite.

| Issue | Concrete location and reproduced result | Required correction |
|---|---|---|
| Listing modification datetime overrides real publication | `anthropic-engineering-adapter.mjs` listing extraction, lines 80–82: an `Updated` date container with machine time 2026-06-06 overrides the article's valid 2026-05-25 publication metadata. Actual feed date is June 6. | Reject listing modification/Updated signals before using machine datetime; preserve ordinary publication listing times and use the real article fallback. Add failing/passing listing-level regression. |
| Unidentified schema outranks matching article | `schemaPublicationDate`, lines 32–41: first Article node without URL/identity and date 1999-01-01 is accepted before a later BlogPosting explicitly matching the current article with date 2026-05-25. Actual date is 1999. | Require trustworthy current-article identity/selection, support `mainEntityOfPage` string/object forms, and ensure absent/foreign identities cannot outrank a matched article. Add failing/passing ambiguous-schema regression. |

Initial review disposition: **REJECT source freeze/deployment until both cases pass.** This did not reject the overall producer/persistence plan or block independent source investigation. Cached body preservation and existing fetch/cache bindings did not compensate for false publication dates. The correction and independent rerun below resolve this source rejection.

At the first source review, the RSSHub Dockerfile did not yet copy/run Engineering. Root's later integration is verified below. Retain every existing research/podcast/retry/CA/common-entry/CDP repair and unchanged startup command, and test the default candidate image rather than claiming unit-only deployment. Require fresh and cached candidate route dates, default/item limits, canonical GUID/body counts, representative prior-route regressions, actual runtime markers and the separate four-row null-only repair plus publication-date API acceptance.

## Updated ownership/removal scope

The user now authorizes independent address research and removal of publications that have stopped updating. The amended contract uses at least 180 days plus official publication corroboration. A failed/empty delivery channel is insufficient. Remove only the current owner's Subscription association, preserving shared Feed/history/read-state/bookmark rows; generic `delete_subscription` also deletes that owner's read states and orphan Feed/entries, so it must not be used for this preservation requirement. Retain the exact removed association fields privately for recovery, and leave other owners unchanged.

The public research generator reports official recent activity in a programme whose old audio RSS is stale. That is a reason to verify the current official publication/channel rather than unsubscribe on the audio timestamp alone. Likewise recent publication evidence with empty XML or a broken local route calls for source repair, not a false stopped-publication classification. These source candidates and any removal still need independent final evidence.

## Engineering correction and source approval

The generator reproduces both evaluator fixtures before correcting them. Current listing extraction rejects Updated/Modified text and `dateModified` machine fields; article fallback still supplies the true publication date. JSON-LD now requires identity matching the current article and supports string/object `mainEntityOfPage`, so unrelated or absent identities cannot take precedence.

Independent verification after those changes:

- Engineering adapter/patcher: **17 passed**, including both new provenance guards and original cache/date/timezone/order behavior.
- Evaluator's original two adversarial fixtures: **both pass**, with actual publication date 2026-05-25 rather than June 6 or 1999.
- Engineering plus existing research adapter/patcher, podcast adapter/patcher and public-CA/common-entry suites: **38 passed**, exit zero. No provider/NAS request is used by these fixture tests.

**APPROVE Engineering source freeze and controlled candidate build.** Production and overall task acceptance remain pending. Integrate its production files into Dockerfile COPY/RUN, inspect the actual default candidate image and preserve prior route patches, CA/common entry, command/proxy/CDP 90-second setting. Verify fresh and cached Engineering dates/bodies/canonical GUIDs under normal transport, then separately execute the guarded four-null-date repair, preserving 20 old non-null dates and all old fields/associations except the exact approved date allowlist. Publication-date search must retrieve the repaired rows; Today/collection-only success is insufficient.

Other subscription bootstraps, the additional weekly-route implementation, full-text repair, current-address choices and any justified owner-only unsubscribe have their own pending evidence. This source approval does not accept them or imply deployment.

## Independent weekly CMS recovery review

The candidate deliberately adapts the currently public HTML rather than upgrading the whole service to newer upstream Flight/RSC code. Preserving installed default one, old `the-batch-${slug}` GUIDs, exact Hono renderer bindings, original tag delegation and concurrency two is an inspectable narrow tradeoff. Tagged pages retain the old parser and are not claimed repaired. Unsupported Flight-only markup fails explicitly. Current upstream already has an RSC fix with different default/concurrency behavior; this work is not presented as an unfixed upstream problem.

Independent local checks, without new provider/NAS requests:

- Adapter/patcher suite: **12 passed**.
- Previously downloaded official index/detail replay through actual legacy module: `SyntaxError` from empty Next-data JSON, one fixture read.
- Same saved HTML through patched compiled module: one default item, original issue GUID, real 2026-10-09T14:00:25Z date, 37,416 rendered characters/39 paragraphs, two fixture reads.
- Sidebar/date-tag/direct-overlay, canonical identity, malformed dates, original tag behavior, renderer, default/explicit limits and both exported handlers pass existing cases.
- Flight-only unsupported layout fails closed; an explicit year-2099 timestamp is currently accepted. The latter is an observed policy boundary requiring root's weekly-publication decision, not proof of the current live CMS failure.

Initial weekly disposition: **REJECT source freeze for cache identity.** Canonical/schema/date/body validation was inside the cache-fill callback. An existing globally shared canonical-key value bypassed every guard. The evaluator seeded that key with a benign foreign full-item fixture: foreign link/GUID returned without a detail fetch. This violated the publisher/old-GUID contract despite all 12 supplied cases passing. The correction below resolves that rejection.

Required correction: isolate the route's cache identity and/or validate cached output against the expected issue link/GUID/shape before returning it, refusing or safely rebuilding foreign/incompatible cache values without clearing unrelated keys. Add a failing/passing fixture for this cache hit. Decide and test the future-publication boundary explicitly if used to select already published weekly items; do not change the global date parser.

The real 39-paragraph replay establishes current full-text availability. Structural two-paragraph/heading checks are not a universal completeness or paywall guarantee and should be described as known-layout checks. Image integration, normal-route canary, old source in-place change and all protected old-row comparisons remain pending after source approval. No stopped-publication unsubscribe is justified by this CMS parsing failure.

## Independent fixed daily recipe review

The evaluator reviews the adapter, exact-source-pinned patcher, actual compiled generic-transform fixture and [implementation handoff](2026-10-11-ainews-date-implementation-handoff.md). Independent executable result: **18 passed**. Replaying today's expanded 15-case adapter suite against the actual old module yields **13 failures/two passing controls**, distinct from the generator's earlier ten-case RED evidence. No NAS/provider/browser request occurs.

Scope and behavior reviewed:

- Dispatch requires one exact homepage/recipe pair. Every other pair delegates to the original handler. The generic weekly fixture produces exactly the same output and requests as the original.
- Requests use the existing transport with redirect refusal; only fixed-origin, credential-free date-shaped article paths are selected. Caller query/CSS/header/auth values do not broaden this recipe.
- Article identity must match one exact `og:url`; one explicit valid publication timestamp supplies the date. Modification/listing/path/current time are not publication fallbacks. UTC-offset normalization passes.
- One active prose panel supplies sanitized body text; inactive panels, navigation/forms/scripts and tiny teasers are excluded in fixtures. This is a known-layout test plus later public-body verification, not a universal paywall guarantee.
- Route-owned success cache validates identity/date/body on hits, retains old generic cache keys and keeps listing titles/future discovery outside body caching. Failed metadata can retry without a fabricated successful cache record.
- Twenty-item cap, concurrency two and stop-new-dispatch-on-failure pass. Strict compiled-source identity, unknown/duplicate-module refusal, dry-run, syntax check and idempotence pass.

A deliberate boundary is recorded: the fixed allowlisted recipe works even when the generic arbitrary-domain flag is false; other generic pairs continue to use their original gate. This is an explicit fixed-publication exception, not a statement that the old gate governs this new recipe. The deployed generic flag is already true and remains unchanged. No arbitrary-domain expansion, global setting change or caller-controlled fetch option is introduced by the fixed wrapper.

**APPROVE daily recipe source freeze and controlled candidate integration.** Final acceptance still requires actual normal-route XML formatting, publication dates/body/canonical URL GUIDs, overlap with old daily rows, unchanged generic weekly output and global settings, protected in-place address/association preservation and a converged owned refresh. At this review point the weekly rejection remained unresolved; the later correction follows. No live/source mutation is approved by these unit checks alone.

## Weekly correction and combined packaging approval

The corrected weekly adapter uses its own publication cache namespace. Every fresh/hit item must match the expected link, old GUID and ID, have a nonempty title and valid publication timestamp, and retain matching complete description/content HTML structure. Foreign global cache values are ignored; malformed owned-cache records fail without mutation/refetch. Serialized valid records remain usable.

Root also authorizes a route-local clock policy: reject publication times at or beyond current runtime time plus one hour, while tolerating smaller clock skew. It checks fresh and cached dates, leaves modification time separate and changes no global date parser.

Independent post-correction results:

- Weekly adapter/patcher: **17 passed**, including foreign/global/owned cache cases, serialization, year-2099 refusal and just-below/exact/above one-hour boundaries.
- Original global-cache adversarial fixture: **PASS**, expected issue/GUID returned and the unrelated global cache value unchanged.
- Original future-date observation: now explicitly rejected under the authorized policy.
- Saved official HTML repeat: one default issue, old GUID, real publication date, 39 paragraphs and three fixture reads across two requests.
- Combined Engineering/weekly/daily plus prior research/podcast/retry-patcher/CA/common-entry fixture suites: **73 passed**, zero failures, exit zero. This does not claim a fresh transport/provider canary.

Dockerfile review confirms only the three new production adapter/patcher pairs are copied and run in addition to the existing repairs. Research, podcast/retry, public bridge, synchronous common entry and wrapper files remain in the build. `ENTRYPOINT` retains `dumb-init` plus the existing CA wrapper; `CMD` remains `npm run start`. No package manifest, dependency runtime, application worker or global environment policy changes are introduced by this packaging delta.

**APPROVE combined source freeze and isolated actual-image build.** Source rejections are resolved. Production acceptance still requires the default candidate image's real XML/cache/formatting and prior-route/CA/CDP markers, four authoritative null-only dates and owned publication-date API results, all four new bootstrap/ownership outcomes, verified old-address changes and justified association-only unsubscribe with protected all-field comparisons. Root owns those canaries/mutations; the evaluator has not issued NAS/provider requests at this stage.

## Operator scripts: rejected stale-object guard, corrected before data apply

The evaluator locally reviews the protected data/image operation scripts without executing apply, enqueues or NAS/provider requests. Image handling retains an immutable old-image tag and protected original Compose/runtime baseline, asserts the current container/configuration hash, clones the exact environment for an owned canary, validates revision/default command and recreates only RSSHub. Resolved Compose may differ only in its image; other component identities/environment and owned cleanup are checked. Source/image review is not substituted for final runtime inspection.

The first data script was **rejected before apply**: preflight populated ORM objects, but subsequent `FOR UPDATE` queries did not refresh that identity-map state. A concurrent null-date fill or URL/association change could therefore remain invisible to the cached comparison; the original date write lacked an SQL null predicate. This is a source-review finding grounded in SQLAlchemy's documented normal object-loading behavior, not a claimed executed NAS race. [SQLAlchemy populate-existing reference](https://docs.sqlalchemy.org/en/20/orm/queryguide/api.html#populate-existing).

Root corrects the script, and independent local re-review confirms:

- Ordered Feed and individual Entry/Subscription locks use `populate_existing`; full before rows are revalidated after locking.
- Four date Core updates require exact ID/Feed/GUID/URL and `published_at IS NULL`, each affecting exactly one row. No global worker/parser date policy changes.
- Source Core updates require old ID/URL/type, after-lock destination collision checks and one affected row; validators are cleared explicitly.
- Unsubscribe uses only the owned Subscription table row with owner/Feed predicates and one affected row. No ORM orphan cascade or read-state deletion occurs; the deleted instance is detached before fresh checks.
- All preservation reads use fresh objects. Remaining subscription IDs, old fields and the exact four-date allowlist are checked before one commit. Current-owner subscription guards cover refresh/source targets before and after locking and before enqueuing.
- Helpers are mode 600; raw operational evidence/rollback remains protected. The applied marker is written after commit, so an evidence-write failure must trigger read-only outcome inspection, not a blind retry; old-state/null guards independently prevent a second write.

**APPROVE the corrected bounded transaction plan** for four authoritative null dates, three confirmed in-place addresses and one justified current-owner association removal. Actual commit, old-field/date/association preservation and owned publication-date retrieval remain final gates. Root's preview reports 809 old entries/805 non-null dates/120 reading states/eight target subscriptions; those figures have not yet been independently read from the NAS by this evaluator.

The four tracked Feed refreshes disable existing-entry backfill. Native-feed newly inserted articles can still enqueue normal content backfill, so this does not mean four total jobs or zero other transport calls. Root explicitly accepts/monitors that normal pipeline; no queue reset or fabricated quiescence is an acceptance method.

## GUID/content interpretation corrected before final assessment

Weekly GUID checks distinguish producer XML, feedparser and Glean: the producer preserves its literal issue GUID, while Glean's long-standing relative-identifier resolution can make the stored GUID absolute. Root reports historical mixed literal/resolved rows and verifies the recent stored issue is compatible; the new default issue has no old collision. Do not attribute this behavior to the recent HTML guard, rewrite old GUIDs or alter the global parser. Default-one verification does not establish safe replay of every old literal row under a wider limit; final checks must retain all old mixed identities and detect new duplicate canonical articles.

The existing daily article's short body is preserved; the corrected producer's long body does not overwrite a GUID-conflicting old row. Root separately reports the specifically requested short-content publication has obtained full text through the existing normal backfill pipeline. Final reporting must distinguish that target's actual stored body from the daily producer-only improvement; no blanket old-fulltext repair is claimed.

## Final independent runtime and saved-XML verification

Actual running RSSHub image is `53379de86ff9a963fe2ad0275ba073aef4c5a8fcc0e756cc493a3e0cdc5f702d`, revision `33aa4c81c49379062aa24fe3b4a22c24a0e02471`, started 2026-10-11 14:48:49.201304 UTC, restart count zero. Its environment equals the protected before snapshot exactly; fifteen other running component IDs/images remain identical. All fifteen checked production adapter/patcher/CA/certificate/wrapper files match frozen repository bytes. Correct Engineering, weekly, daily, research, podcast-detail, no-429-retry and synchronous CA-entry markers are present.

CDP session 90 seconds, legacy WS, Browserless global 30 seconds, two configured HTTP retries and generic-domain setting are retained. Image default `ENTRYPOINT` retains the CA wrapper. The actual production container retains its existing Compose `dumb-init --` override, equal to the old container; command remains `npm run start`. A first evaluator comparison incorrectly expected the image default on the container, then an explicit before/image/container comparison resolved the distinction. The common app entry still imports the synchronous verified CA installer. No startup regression or override change is inferred.

The evaluator parses the already captured eight candidate and eight production XML samples inside the NAS, without exporting bodies or refetching routes:

| Saved route evidence | Independent result |
|---|---|
| Engineering first/repeat | 20 items/20 parsed dates/20 existing GUID overlaps; all four repaired old articles appear with the authoritative dates; repeated identity/date/body equal |
| Weekly publication first/repeat | Default one item, original raw issue GUID, actual Glean relative-GUID resolution, real 2026-10-09T14:00:25Z publication and 39 body paragraphs; repeated identity/date/body equal |
| Daily publication first/repeat | One dated existing-GUID item, full producer body over 10,000 stripped characters; repeated identity/date/body equal |
| Generic weekly | Four dated items with canonical links; fixed daily wrapper does not intercept this recipe |
| Prior research repair | Two dated items with canonical links |

Raw files are mode 600 in a mode-700 directory. These limited normal-cache samples prove observed compatibility, not perpetual availability. The separate actual-image ofetch receipt has exit zero, three tests passed/zero failed; its program SHA matches the frozen repository test, and the deployed package is independently read as 1.5.1. The evaluator reads that existing loopback receipt rather than running another transport/provider test. Protected original Compose/image and runtime snapshots remain available for rollback.

## Final independent data, ownership and consumer gates

At 2026-10-11 15:07:19 UTC the evaluator opens an explicit read-only transaction and rechecks every protected old row. No operator `apply`, `enqueue` or artifact-writing `check` mode is executed by the evaluator.

| Gate | Verified result |
|---|---|
| Old articles | 809 distinct rows retained; zero field differences outside four `published_at`/corresponding `updated_at` changes |
| Date preservation | All 805 old non-null dates identical; four null dates equal exact publisher evidence; Engineering now 24 dated stored articles |
| State/bookmarks | 120 old reading-state rows and the empty target bookmark set unchanged |
| Subscriptions | Seven of eight target associations retained unchanged; only the authorized current-owner association removed; all global remaining IDs and fields equal the protected before set minus that one |
| Retired source history | Same Feed/URL/type retained, with all fifty old articles and three reading states; no orphan cascade |
| Existing source recovery | Three confirmed current URLs/types on the same Feed IDs; no delete/recreate or article reassociation |
| Four new subscriptions | Four unique receipts owned by the sole active account; each bootstrap success/complete with no stored error, dated nonempty content; payload counts 20/15/182/4 |
| Actual publication-date API | Four independent authenticated internal GETs all HTTP 200 and each repaired old ID found in its true publication-day search; these are not collection-time-only checks |
| Four maintenance runs | Owned Feed/job match, manual-admin success/complete, no error, original/current primary URL and `fallback_used=false`, one complete stage and all stages terminal |
| Queue/schema | Zero active target runs, queue zero/in-progress zero, positive worker-health TTL (1,836 seconds at the independent check), schema `94af7ef02eb9` |

The maintenance payloads are 20/one/one/fifteen with zero/one/zero/fifteen new entries. No new canonical article duplicates any old URL. The recovered weekly source now has 31 articles and the latest issue's true date/full body. Its seventeen old literal and thirteen resolved GUIDs remain unchanged. The native programme source has 77 articles, preserving its 62 audio-history rows and adding fifteen confirmed current official videos. Old-channel staleness did not cause a false programme unsubscribe.

For the requested short-content publication, all fifteen new article rows are `done`, dated and outside the old 809-row set. Independently stripped stored bodies exceed 8,000 characters each; root's stricter whitespace-normalized count has minimum 8,533. Normal extraction rather than a marketing/teaser substitution supplies these bodies. The daily producer's long XML body is distinct: its 126 existing rows, including the short old body, remain unchanged. No broad old-content overwrite or date policy was introduced.

## Bounded operational recovery and remaining limits

Root correlates three new native-video body jobs returning `EntryNotFound` with the pre-existing enqueue-before-final-commit visibility race. Four precisely tracked new-body jobs, including one failed short-content target, receive one normal `force=false` retry. The evaluator independently reads that protected receipt and verifies four targets all outside the old 809 IDs and the false force flag. No old row is retried or forced, no queue is reset and no global worker/parser race fix is claimed.

The requested article publication finishes fifteen of fifteen bodies. Native-video body statuses finish eleven done/four failed/zero pending or processing; one failed job had partial content before a browser-context-close error. These extraction statuses do not certify transcripts. Its primary RSS titles, dates and media summaries work; four body-extraction failures remain honestly recorded, and the already failed video jobs are not repeatedly probed. The general pre-commit worker race can recur outside this bounded recovery and remains an explicit limitation.

Other limits remain: tagged weekly pages still delegate to their old parser; a wider historical weekly replay is not proven deduplicated against old literal GUIDs; saved/repeated cache samples do not guarantee future provider behavior; the daily fixed allowlist exception does not enable arbitrary generic domains; ordinary unsubscribe views need not keep listing the retained database history. No paywall or provider-verification bypass is used.

## Final disposition and artifact closure

| Evaluator rubric | Result |
|---|---|
| Contract compliance | PASS: requested date retrieval, four owned subscriptions, three verified same-publication recoveries, justified association-only removal and requested current full text |
| Behavioral correctness | PASS within measured scope: actual deployed XML/worker results and independent publication-date API; body/transcript and historic replay limits disclosed |
| Regression/preservation | PASS: 809 old rows/805 dates/120 states/global remaining subscriptions unchanged outside the exact allowlist; prior patches/startup/environment/component identities preserved |
| Repository fit | PASS: source/contract/handoffs/evaluation recorded; public aggregates and private evidence separated; original six edits and unrelated plan preserved |
| Verification quality | PASS: reproduced/fixed provenance and cache failures, independent 73 fixtures, saved actual XML/transport receipt, frozen runtime source, fresh read-only SQL and real consumer GETs |

**FINAL ACCEPTED.** All required controlled gates are verified; material extraction/worker limitations above are not hidden or presented as globally fixed. Documentation validation, whitespace verification and final six original Git-diff fingerprint checks pass.

Root reports the owned canary/environment clone already removed while protected XML/runtime/transport receipts and rollback remain. The evaluator no longer needs temporary runtime services or diagnostic helpers. This evaluation is frozen for root's task-only archival and documentation commit/push. Keep the private user report, evidence/before state and rollback; do not touch the unrelated active plan or six original working-tree edits.
