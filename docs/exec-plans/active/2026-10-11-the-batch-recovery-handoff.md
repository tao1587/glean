# Weekly publication CMS recovery handoff

Contract: [publication-date and source recovery](2026-10-11-feed-date-and-source-recovery-contract.md).

## Public evidence and diagnosed cause

The operator supplied the actual old compiled weekly route. It unconditionally parses `script#__NEXT_DATA__`, then requests obsolete build-specific JSON detail URLs. The current public site uses App Router HTML without that script. Replaying the actual old module against the downloaded current official index produced `SyntaxError: Unexpected end of JSON input`, matching the operator's route failure. This is a parser incompatibility, not proof the publication stopped.

The official trailing-slash index responded with an ordinary 308 redirect; its canonical slashless page returned 200 through a normal public request. The official latest weekly issue also returned 200, with canonical self-reference and `NewsArticle` schema, explicit publication timestamp and a complete public article body. No credentials, browser challenge solving, NAS requests or production mutations were used. [Official index](https://www.deeplearning.ai/the-batch), [verified issue](https://www.deeplearning.ai/the-batch/issue-374).

The verified latest issue was published on 2026-10-09 at `07:00:25-07:00` (`14:00:25Z`), later than the old stale source sample. Its public body contained 39 paragraphs. No stale-source unsubscribe is justified by this parser failure; the operator must separately verify any proposed subscription action.

## Current upstream and selected correction

An initially retrieved web source was cached older code. A subsequent direct official GitHub API/immutable-source check established current revision `a7d400051d8dc73c0a0a60197920df9d3f80b75c`. The [2026-08-30 upstream fix](https://github.com/DIYgod/RSSHub/commit/2d9925c537847beb24b0862937c18a732e6ad036) parses Flight listing rows and RSC article responses; current upstream defaults to 16 items and uses concurrent `Promise.all` detail fetching. [Verified current source](https://github.com/DIYgod/RSSHub/blob/a7d400051d8dc73c0a0a60197920df9d3f80b75c/lib/routes/deeplearning/the-batch.ts).

This candidate adapts only the existing weekly/default route using its already publicly rendered HTML and article schema. It keeps the installed default of one item, explicit caller limit slicing and concurrency two; it does not change the entire service or introduce an RSC transport dependency. Tag parameters delegate directly to the original compiled handler. The original tagged parser may still fail on changed upstream tag pages; those routes are outside this correction.

The adapter selects current weekly cards by the verified featured/ordinary heading structure and the card's direct overlay article anchor. A clickable date-tag link precedes that overlay in the real DOM; choosing the first nested link would miss every weekly issue. Popular sidebar cards, foreign links, tag links and duplicate canonical issues are excluded before applying the limit. Input weekly order is retained.

Each detail requires an exact same-publication canonical issue URL, matched `NewsArticle` schema, valid explicit publication timestamp and the known complete article body container. Modification timestamps are kept separately. Declared inaccessible content, absent metadata and missing/teaser body layouts remain explicit failures. No current/ingestion date or invented body is substituted.

GUID and ID remain `the-batch-${slug}`, including `the-batch-issue-374`; they are not replaced with URL identities. The adapter preserves the compiled Hono description renderer, image/intro/body formatting and tracking-parameter cleanup. It reuses actual imported RSSHub fetch/cache/date/Cheerio bindings, successful full-article caching and normal proxy/TLS behavior. The new HTML source uses route-owned `glean-the-batch-weekly-v1:<canonical article URL>` cache keys instead of obsolete build-specific JSON URLs or shared unqualified article keys; no global cache is cleared or overwritten. Existing Glean rows and associations remain untouched.

Every returned cache value is checked again for the expected canonical URL, GUID/ID, nonempty title, valid publication date and complete description/content body shape. A malformed route-owned cache record fails explicitly without mutation or a speculative refetch; its existing cache expiry remains unchanged. Unrelated global article-cache values are ignored. Serialized complete route-owned records remain usable, avoiding unnecessary detail requests.

Root authorized a route-local publication-clock policy: a weekly publication at or beyond the runtime's current time plus one hour is rejected. A smaller offset is tolerated for clock skew. This validates both fresh and cached publication dates; it does not substitute current time or change the global date parser, and `dateModified` remains only the separate `updated` field.

## Files and patch gate

- `scripts/rsshub/the-batch-adapter.mjs`
- `scripts/rsshub/patch-the-batch.mjs`
- `scripts/rsshub/the-batch-adapter.test.mjs`
- `scripts/rsshub/patch-the-batch.test.mjs`
- `scripts/rsshub/the-batch-test-utils.mjs` (test-only HTTP/cache fixture harness)
- `scripts/rsshub/fixtures/deeplearning-the-batch-legacy.mjs` (public upstream RSSHub MIT compiled source)
- `docs/operations/rsshub-route-repairs.md` and this handoff

The actual legacy fixture SHA-256 is `0435596729e8a2177023643670e32899d23eb79632343fda16f1fbf798dff97c`. The patcher discovers only the known compiled weekly module, validates its route/export/import/template-renderer layout, reuses the real renderer binding, and repairs both the route and exported handler. Unknown/ambiguous layouts, false prior markers and syntax errors abort before write. Dry-run is non-mutating and the patch is idempotent. Dockerfile/image integration, canary and rollout belong to root; this generator did not edit Dockerfile, commit or contact the NAS. Prior Engineering/research/podcast/retry/CA/CDP changes and the six user WIP files are preserved.

## RED / GREEN and executable evidence

The initial actual-module fixture suite produced six expected failures and one passing original-tag control. Real downloaded current index HTML independently reproduced the same empty-JSON error with one fixture HTTP read. A later real-HTML replay caught the first-nested-anchor error before acceptance; the minimal DOM fixture was corrected to contain the actual preceding date-tag anchor, observed RED, then the adapter selected the direct overlay anchor and passed.

Independent evaluation rejected the initial 12-test candidate because shared article-cache hits bypassed identity guards and a valid ISO timestamp could still be far in the future. Four concrete RED failures were observed before correction: unrelated global cache content entering the feed, bad route-owned cache not failing, good serialized route-owned cache not being reused and a 2099 publication being accepted. The final weekly adapter/patcher suites pass 17 tests, including those repairs and an explicit one-hour clock-skew boundary control. They also cover default one-item behavior, stable GUID/canonical date/content, prior tag delegation, sidebar/foreign/tag/duplicate rejection, missing/paid/teaser/invalid-identity/invalid-date failures, body caching, order/concurrency, both handler exports, patch idempotence/syntax and CLI refusal without mutation. Dependencies match the operator-confirmed Cheerio 1.2.0/Hono 4.12.30; test dependencies are isolated under `/private/tmp` with no repository manifest changes.

```bash
RSSHUB_CHEERIO_MODULE=file:///private/tmp/glean-rsshub-engineering-node/node_modules/cheerio/dist/esm/index.js \
RSSHUB_HONO_ROOT=file:///private/tmp/glean-rsshub-engineering-node/node_modules/hono/ \
node --test scripts/rsshub/the-batch-adapter.test.mjs scripts/rsshub/patch-the-batch.test.mjs
```

Set `RSSHUB_BATCH_BASELINE=1` for the adapter suite only to replay the old compiled behavior; never use it for acceptance. This is test-only configuration.

Patched actual-module replay with the downloaded current official index/detail, without further publisher HTTP requests: one default item, expected issue GUID, matching canonical URL, real `2026-10-09T14:00:25Z` publication, 37,416 rendered body characters/39 paragraphs and two fixture reads. This proves local artifact behavior; it is not a live candidate-image result.

The initial combined Engineering/weekly/research/podcast/CA/entrypoint fixture regression passed 50 tests. After the cache/future-date corrections, the final combined regression passed all 55 tests. A further replay of the saved current official HTML retained the same dated full weekly item, with a successful route-owned cache hit and only three fixture reads across two feed requests. Documentation validation, `git diff --check` and new-module Node syntax checks passed. No prior production repair module was edited for the weekly correction.

## Required remaining acceptance

Independent review must verify the scope, metadata identity, real body and compiled bindings. Root must build the combined retained-base image and verify default weekly RSS with its ordinary transport/cache, one dated full-body item, expected GUID and canonical link; separately verify Engineering dates and existing repaired routes/default command/CA/CDP settings. Preserve rollback and protected evidence.

Only after live canary acceptance should the operator adjust the existing source in place and enqueue one tracked refresh, retaining old entries/subscription identities/reading state/bookmarks. Default one item does not backfill all missed historical weeks. No change to source status or unsubscribe policy is made by this candidate, and no permanent provider availability is promised.
