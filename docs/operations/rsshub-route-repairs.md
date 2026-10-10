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

The pre-deployment in-memory canary found ten valid publication cards with dates. The default handler returned all ten with valid research links, dates and article bodies in 4.24 seconds using the deployed helpers/cache. A patched-image HTTP canary and final live verification remain required before claiming the route restored online. The adapter does not remove third-party rate limits or remote-instance outages; worker backoff and per-origin circuits handle those independently.
