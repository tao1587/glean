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
