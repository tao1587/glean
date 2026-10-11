# RSSHub route repairs

## Anthropic research markup, 2026-10-10

The NAS RSSHub instance returned HTTP 503 for `/anthropic/research` while `/` and `/healthz` returned 200. Its error page reported an empty route. The worker preserved the real HTTP 503 as `ValueError.__cause__ = httpx.HTTPStatusError`; the shared circuit previously treated that route failure as an outage of every RSSHub source.

The deployed Anthropic parser found one Next.js script payload and 53 array records, but none had `page.sections`, so its `Publications` section yielded zero posts. Anthropic's public research page still had usable publication cards. The repository adapter reads only `PublicationList` article cards, excludes topic navigation and other origins/paths, deduplicates tracking URLs, and preserves title/date/article extraction. The original Next.js handler remains available when publication-card markup is absent.

Implementation:

- [adapter](../../scripts/rsshub/anthropic-research-adapter.mjs)
- [fixture tests](../../scripts/rsshub/anthropic-research-adapter.test.mjs)
- [compiled-route patcher](../../scripts/rsshub/patch-anthropic-research.mjs)
- [patcher tests](../../scripts/rsshub/patch-anthropic-research.test.mjs)
- [Dockerfile](../../scripts/rsshub/Dockerfile)

The patcher discovers the installed `anthropic-research-*.mjs` bundle and reuses its existing hashed fetch/cache/date imports and Cheerio/p-map bindings. It rejects unknown import/export layouts before writing and checks generated JavaScript syntax. Only that route is wrapped. Keep the deployed upstream image pinned: a future bundle layout must be inspected and reverified before rebuilding this patch.

## Build and verify

Build on the NAS with its current RSSHub image ID retained under an immutable rollback tag:

```bash
docker build -f scripts/rsshub/Dockerfile \
  --build-arg RSSHUB_BASE_IMAGE=<retained-rsshub-base-tag> \
  -t <immutable-repaired-rsshub-tag> scripts/rsshub
```

Run patcher tests with `node --test scripts/rsshub/patch-anthropic-research.test.mjs`. Run adapter fixtures with RSSHub's own Node/Cheerio runtime: `node --test scripts/rsshub/anthropic-research-adapter.test.mjs`, setting `RSSHUB_CHEERIO_MODULE` to the installed Cheerio module if the tests reside outside `/app`. The handler imports are injected from the actual bundle, preserving RSSHub proxy settings, article caching and date parsing. Article extraction uses concurrency two and a default limit of 20, with positive caller limits capped at 100.

Before swapping the live instance, start a temporary container from the repaired image on the existing network with the existing non-exported environment. Check `/healthz`, `/anthropic/research?limit=2`, and one known working route. Export only status/XML/item/date/content counts; keep credentials, subscription identifiers and response payloads on the NAS. Replace the live container only after those canaries pass. Retain its prior image/configuration for rollback and leave stateful Glean volumes unchanged.

Release `7f7f90f` passed both an isolated patched-image HTTP canary and production verification on 2026-10-10. The production default route returned HTTP 200 with ten items, ten dates and ten nonempty article bodies; `limit=2` returned two of each. An existing Twitter route remained healthy. A tracked Glean refresh of the existing Anthropic subscription reached `success` / `complete`, with the feed active and zero errors. The adapter does not remove third-party rate limits or remote-instance outages; worker backoff and per-origin circuits handle those independently.

The [completed deployment record](../agent-workflows/reviews/2026-10-10-nas-reliability/index.md) contains the exact deployed image IDs, independent live acceptance and rollback steps.

## Bounded retries and podcast detail rate limits

A later controlled audit found intermittent 503 responses caused by episode-detail HTTP 429 errors and a separate upstream transport reset. Disabling all RSSHub request retries suppressed limit amplification but exposed transient transport failures. The repository now patches only HTTP 429 out of the compiled `ofetch` retry status list; configured network/server retry behavior remains available. Set `REQUEST_RETRY=2` only after the patched image passes its canaries.

The podcast route previously fetched all episode-detail JSON concurrently with `Promise.all`, allowing one limited detail to fail the entire feed. [podcast-detail-enrichment.mjs](../../scripts/rsshub/podcast-detail-enrichment.mjs) uses two workers, preserves item order and existing feed/audio metadata, and stops new cache-miss detail requests within that invocation after the first HTTP 429. In-flight requests remain bounded at two. Available overview descriptions can fill limited details; missing descriptions and unrelated failures still surface as errors. Overview fallbacks stay outside successful detail caching, so they do not overwrite full article bodies. Existing full-detail cache hits remain usable after a limit.

[patch-source-reliability.mjs](../../scripts/rsshub/patch-source-reliability.mjs) rewrites only the installed known `ofetch` policy and podcast detail-enrichment block. It reuses the original fetch/cache imports and leaves parsing, feed formatting, dates, links and audio fields intact. It validates both generated modules and their syntax before writing either file; unfamiliar layouts abort the build. The same Dockerfile applies this patch alongside the Anthropic research repair.

Verification:

- Local `node --test scripts/rsshub/podcast-detail-enrichment.test.mjs scripts/rsshub/patch-source-reliability.test.mjs scripts/rsshub/patch-anthropic-research.test.mjs` exercises bounded concurrency, invocation cooldown, sufficient/missing metadata, cache preservation and executable compiled-route patching.
- Run `ofetch-retry-policy.test.mjs` with the deployed real dependency, setting `RSSHUB_OFETCH_MODULE=file:///app/node_modules/ofetch/dist/node.mjs` when needed. Its temporary loopback server verifies a 429 receives one request with two configured retries, a 500 recovers on the third attempt and a transport reset recovers on the second.
- Before rollout, repeat loopback checks using the actual patched compiled helper and verify representative podcast RSS responses plus healthy existing routes. Retain the previous RSSHub image and runtime configuration for rollback. No proxy-routing bypass is justified by the healthy direct/proxy overview comparison.

## Publisher certificate chain completion

A publisher's server omitted the Root YR cross-signed bridge from its Let's Encrypt chain. The deployed clients rejected the certificate issuer before reaching HTTP. The official [Root YR certificate signed by ISRG Root X1](https://letsencrypt.org/certs/gen-y/root-yr-by-x1.pem), verified against the already trusted issuer, completed the chain with full hostname/certificate validation and restored the known public APIs. See [CA provenance and pin](../../scripts/rsshub/certs/README.md).

The RSSHub image imports a verified synchronous installer first from the trusted application entrypoint, appending this single public bridge to the existing default CA list in both the app parent and cluster children. The upstream npm start script replaces application `NODE_OPTIONS`, so an environment-only preload is insufficient. The common entrypoint patch rejects unfamiliar app layouts; its installer and verification dependency have no top-level await, preventing another dependency from creating TLS contexts before initialization.

The image preserves configured extra certificates, `NODE_EXTRA_CA_CERTS`, upstream Node-option behavior, `dumb-init`, explicit upstream command and cluster/proxy/cache behavior. It never changes host/system certificate stores or disables TLS validation. Build verification rejects unsupported runtimes or an invalid bridge; optional runtime verification failure retains original trust and emits a fixed diagnostic so RSSHub remains startable.

The original publisher handler completed in a verified isolated probe, so no speculative route/parser patch was applied. Run `node --test scripts/rsshub/public-ca-chain.test.mjs scripts/rsshub/patch-ca-entrypoint.test.mjs`; the latter uses a real cluster child with cleared Node options and checks trust initialization before TLS-context construction. Include default startup and publisher RSS canaries before deploying the image.

## Browserless protocol and session lifetime

RSSHub's current Playwright helper maps `PLAYWRIGHT_WS_ENDPOINT` (or legacy `PUPPETEER_WS_ENDPOINT`) to native `chromium.connect`. Browserless `/chromium` speaks CDP; configure that private URL with `PLAYWRIGHT_CDP_ENDPOINT` so RSSHub selects `connectOverCDP`. Keep tokens in the private NAS configuration. The native alternative requires a `/chromium/playwright` endpoint and compatible client/server versions. [Browserless protocol reference](https://docs.browserless.io/baas/advanced-configurations/playwright-customizations), [RSSHub configuration](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/config.ts).

The deployed video handler waits up to 45 seconds for the upload API response, but the shared Browserless service default was 30 seconds. Use the supported `timeout=90000` connection-URL parameter for this RSSHub CDP connection, preserving the handler's own 90-second lifetime and leaving other Browserless consumers/global settings unchanged. [Per-connection timeout reference](https://docs.browserless.io/enterprise/private-deployment/timeouts).

Validate using the actual pinned RSSHub image and helper. First use local fulfilled content to test context creation/interception without provider traffic. Use an independent memory-cache canary for one ordinary video sample and one later sample after the normal 300-second expiry. An API success does not test browser fallback: separately label any local native-failure fixture and verify that the browser response is real, belongs to the requested publisher, produces canonical video identities/dates, traverses the configured proxy and closes its session. Do not seed a video-list/feed response or claim a local fixture reproduces a new live provider error.

This configuration keeps the original video route and parsed GUID/date semantics. Compare existing video IDs and old row fingerprints before a single tracked refresh; preserve all historical dynamic articles as well. A login-state check returning `-101` proves that request was unauthenticated, not that every `-352` has that cause. No provider-verification bypass, Cookie replacement, global retry increase or mixed-timeline substitution is justified by the protocol repair.

## Engineering publication dates

An older compiled Engineering route uses listing dates only and caches complete items. Featured cards without listing dates remain undated, and legacy date-less cache hits can bypass later date extraction. The [Engineering adapter](../../scripts/rsshub/anthropic-engineering-adapter.mjs) merges current publication-list metadata over cached bodies and obtains missing dates from the official article's publication metadata. It never substitutes modification, ingestion or current time. Publication dates are normalized to UTC independently of the container timezone; valid cached dates remain usable when the listing has none.

The existing article URL/body cache remains intact. Only a cache hit with no usable publication date and no listing date needs a separate metadata request, whose result uses a route-specific publication cache key. Requests use the existing fetch/proxy/cache helpers, with concurrency two. Card/body selectors, canonical links, titles, image extraction, limits and item order are retained; navigation/foreign cards cannot consume the article limit.

The [Engineering patcher](../../scripts/rsshub/patch-anthropic-engineering.mjs) binds the known compiled Engineering module and refuses unfamiliar import/route/selector layouts before writing. The [executable adapter fixtures](../../scripts/rsshub/anthropic-engineering-adapter.test.mjs) replay the actual old compiled handler; [patcher tests](../../scripts/rsshub/patch-anthropic-engineering.test.mjs) verify idempotence, syntax and refusal without mutation. Set `RSSHUB_CHEERIO_MODULE` and `RSSHUB_PMAP_MODULE` to the installed dependency URLs when running outside RSSHub's package root. See the [implementation handoff](../agent-workflows/reviews/2026-10-11-feed-date-source-recovery/2026-10-11-engineering-date-implementation-handoff.md) for baseline/acceptance commands and image gates.

Integrate this patch into a retained-base candidate image alongside existing repairs and verify default Engineering RSS metadata before rollout. A producer correction does not repair stored rows skipped by GUID conflict: separately confirm the publisher's real dates, update only missing database publication dates, preserve non-null dates/identities/content/associations, and test date-filtered API inclusion. Keep protected evidence and rollback on the NAS.

## Weekly newsletter CMS recovery

The installed The Batch route expects `__NEXT_DATA__` and build-specific detail JSON. The publisher's App Router HTML lacks that script, causing an empty-JSON parse failure despite newer public weekly issues. The [weekly adapter](../../scripts/rsshub/the-batch-adapter.mjs) uses the verified weekly-card overlay anchors and matched article schema/full body; popular sidebar cards and date-tag navigation are not treated as weekly articles. It retains default one item, caller limits, ordered output and at most two detail requests in flight. Any tag parameter uses the unchanged original handler.

Successful full bodies remain cached through RSSHub's existing helpers under route-owned `glean-the-batch-weekly-v1:<canonical URL>` keys. Every cache hit must match the expected canonical URL, GUID/ID, valid publication date and complete body/content shape. Malformed route-owned cache records fail explicitly without mutation/refetch; unrelated global article-cache values cannot enter the weekly feed. Existing fetch/proxy/TLS/date helpers and compiled Hono description rendering are reused. Producer GUID/ID remain `the-batch-${slug}`. Glean's existing parser resolves opaque relative IDs against the feed site URL, and historical stored entries may contain both literal and URL-resolved forms. Validate raw XML, feedparser ID and final parsed GUID separately against the latest existing record. Preserve historical GUIDs and the default one-item limit; do not infer that a wider historical replay would deduplicate every legacy record. Missing/foreign publication metadata, invalid dates, inaccessible content and missing/teaser body layouts fail explicitly. Publication and modification timestamps remain distinct. The weekly route rejects publication timestamps at or beyond the runtime clock plus one hour, tolerating smaller clock skew without changing the global parser or fabricating dates.

The [compiled patcher](../../scripts/rsshub/patch-the-batch.mjs) validates the known module's imports, route exports and renderer binding, then syntax-checks before writing; unfamiliar layouts abort. [Adapter tests](../../scripts/rsshub/the-batch-adapter.test.mjs) execute the actual legacy module with benign HTML fixtures and real Cheerio/Hono, while [patcher tests](../../scripts/rsshub/patch-the-batch.test.mjs) exercise idempotence, CLI dry-run and rejection without mutation. Set `RSSHUB_CHEERIO_MODULE` and `RSSHUB_HONO_ROOT` when fixtures run outside the RSSHub package tree. See [handoff](../agent-workflows/reviews/2026-10-11-feed-date-source-recovery/2026-10-11-the-batch-recovery-handoff.md) for source provenance, commands and remaining image/live gates.

Current upstream separately has a Flight/RSC parser with a different default limit; do not silently enlarge this deployment's feed or replace the whole pinned service to pick it up. Build the route-scoped patch alongside existing repairs, validate default XML/body/date/GUID behavior, then refresh only the existing affected source under the protected baseline. A parser failure or stale remote cache does not establish a stopped publication.
