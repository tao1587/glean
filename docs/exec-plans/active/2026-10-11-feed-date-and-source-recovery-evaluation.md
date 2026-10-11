# Feed date and source recovery independent evaluation

Date: 2026-10-11. Phase: **COMBINED SOURCES/PACKAGING APPROVED — isolated image, data and source-operation verification pending**.

Contract: [feed publication-date and source recovery](./2026-10-11-feed-date-and-source-recovery-contract.md). Local source baseline: `ddb4b153c90887d08d449821d4997b8ed7a5e920`. This phase inspects local code only; the evaluator makes no NAS/provider/browser request, account mutation or refresh enqueue. Private inventories, identifiers, fingerprints, content and credentials stay outside the public record. Exact user-referenced replacement links are pending; ambiguity cannot be resolved by changing author or publication.

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

Producer validation must also separate a new item from an old cached item. Public article/card metadata alone is not a deployed reproduction. Verify actual route output, article/feed cache behavior and parsed timestamps, then old-row persistence independently. The [engineering research handoff](./2026-10-11-engineering-date-research-handoff.md) supplies current publisher/history evidence; it does not replace those runtime checks.

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

The evaluator reviews the adapter, exact-source-pinned patcher, actual compiled generic-transform fixture and [implementation handoff](./2026-10-11-ainews-date-implementation-handoff.md). Independent executable result: **18 passed**. Replaying today's expanded 15-case adapter suite against the actual old module yields **13 failures/two passing controls**, distinct from the generator's earlier ten-case RED evidence. No NAS/provider/browser request occurs.

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
