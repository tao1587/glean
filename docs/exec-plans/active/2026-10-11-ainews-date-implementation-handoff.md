# AI daily publication-date implementation handoff

## What changed

The official [AI developer daily homepage](https://ainews.liduos.com/) links a substantial public edition, while its native RSS currently supplies no items. The existing RSSHub HTML-transform recipe can fetch the linked article body, but its `itemContent` step does not merge the article's publication metadata. A homepage-based recipe therefore cannot supply a verified publication date on its own.

The [adapter](../../../scripts/rsshub/ainews-transform-adapter.mjs) wraps only the exact existing route parameter pair:

- `url=https://ainews.liduos.com/`
- `routeParams=glean-ainews-v1`

The deployment candidate is `/rsshub/transform/html/https%3A%2F%2Fainews.liduos.com%2F/glean-ainews-v1`. All other pairs, including the weekly recipe, call the original handler unchanged. Root verified that the pre-existing generic unsafe-domain gate is already enabled; this code does not read, change or enable that setting.

The homepage is fetched on each invocation so future editions remain discoverable. Only title-bearing links under `main` are candidates; navigation/aside cards, foreign origins, credentials, query/hash suffixes, unrelated paths and invalid calendar-day paths are excluded. Canonical requests are restricted to `https://ainews.liduos.com/post/YYYY-MM-DD`. Duplicates are removed before the twenty-item cap. A small two-worker loop retains index order and stops new detail dispatch after the first failure, while waiting for in-flight requests to settle.

For each article, `og:url` must exactly match its requested public article URL. A single valid ISO `article:published_time` is required and normalized to UTC. Neither modification dates, listing/URL dates, ingestion time nor current time supply a fallback. The [September 14 official edition](https://ainews.liduos.com/post/2026-09-14) advertises `2026-09-14T00:00:00.000Z`; that is publisher metadata, not independent evidence of a precise editorial clock time.

The body is the verified active prose panel, `main .prose[role="tabpanel"][data-state="active"]`. Inactive podcast content and navigation/forms/scripts are excluded. The adapter reuses the actual compiled sanitizer binding and the upstream default allowed-tag policy plus `img`; sanitized visible body text must exceed 100 characters. Missing or ambiguous body/date/identity fails the invocation rather than creating an empty or misleading successful feed. Item `guid` and `link` are the canonical public article URL, preserving the existing daily URL-based identity convention.

Successful article bodies, identity and verified publication dates use an independent recipe cache key. Whole-item legacy generic cache records are neither reused nor mutated; current listing titles are applied outside this cache. Invalid cached records fail closed. Failed extraction does not fill the success cache. Existing cache lifetime/backend configuration remains unchanged.

The adapter calls the existing RSSHub got binding with `responseType=arrayBuffer` and per-request `redirect=error` for this fixed publisher. It supplies no caller-selected URL/CSS/header/auth options, does not follow provider redirects, and leaves global proxy, TLS, retry and other route policies intact. It has no dependency imports of its own; Cheerio, sanitizer, HTTP and cache bindings are injected from the real compiled module.

## Files touched

- [adapter](../../../scripts/rsshub/ainews-transform-adapter.mjs)
- [behavior tests](../../../scripts/rsshub/ainews-transform-adapter.test.mjs)
- [fixture boundary utilities](../../../scripts/rsshub/ainews-transform-test-utils.mjs)
- [compiled module fixture](../../../scripts/rsshub/fixtures/rsshub-html-transform-legacy.mjs)
- [compiled-route patcher](../../../scripts/rsshub/patch-html-ainews.mjs)
- [patcher tests](../../../scripts/rsshub/patch-html-ainews.test.mjs)

The fixture is the public compiled upstream HTML-transform handler captured by Root from the installed image. The patcher pins its trimmed source SHA-256, `96c70122e4b10d62c14867a135b6021474eaa2976e66205f68de9ac59358f03b`, and reuses its known got/cache/Cheerio/sanitizer bindings. Unknown modules/layouts, changed source, duplicate candidate modules and false patch markers abort before writing. The CLI verifies generated JavaScript syntax and supports `--dry-run`; a correct repeat invocation is idempotent.

No Dockerfile, dependency manifest/lockfile, NAS state/configuration, subscription, source row, historical article or any of the six original user files was changed by this generator. Engineering and Batch generator files are separate work and were not edited. The broader weekly+daily wrapper was stopped before any code existed; this implementation was separately authorized for the single necessary daily recipe only.

## Verification run

The executable tests use real **Cheerio 1.2.0** and **sanitize-html 2.17.6**, installed with lifecycle scripts disabled into an isolated temporary test runtime. Only external HTTP, cache storage and benign configuration are substituted; the original compiled route executes unchanged in the baseline.

```bash
RSSHUB_AINEWS_BASELINE=1 \
RSSHUB_CHEERIO_MODULE=file:///private/tmp/glean-rsshub-ainews-node/node_modules/cheerio/dist/esm/index.js \
RSSHUB_SANITIZE_MODULE=file:///private/tmp/glean-rsshub-ainews-node/node_modules/sanitize-html/index.js \
node --test scripts/rsshub/ainews-transform-adapter.test.mjs
```

Before implementation, the ten-test initial baseline produced **nine failures and one passing legacy characterization**: the original body-only recipe had no usable publisher date, and the new fixed marker lacked verified dates/identities, correct selection, bounded dispatch and fail-closed extraction. These were observed before writing adapter/patcher code. The patcher CLI test also failed before the patcher existed.

```bash
RSSHUB_CHEERIO_MODULE=file:///private/tmp/glean-rsshub-ainews-node/node_modules/cheerio/dist/esm/index.js \
RSSHUB_SANITIZE_MODULE=file:///private/tmp/glean-rsshub-ainews-node/node_modules/sanitize-html/index.js \
node --test scripts/rsshub/ainews-transform-adapter.test.mjs scripts/rsshub/patch-html-ainews.test.mjs
```

Initial GREEN: **13/13**. After five supplemental behavior checks: **18/18**, including publisher timezone normalization, retry after uncached metadata failure, invalid cache rejection, dispatch stop after failure and exact original-versus-wrapped weekly output/request equality. The final tests also cover real sanitization, navigation/foreign/malformed child exclusion, duplicate identities, twenty-item cap, concurrency two, current listing title/future edition discovery and CLI refusal/idempotence.

`node --check` passed for both production modules. `git diff --check` passed. Repository documentation validation is run after this handoff is saved.

## Known gaps

- This generator has not queried the NAS, probed native/provider feeds, built an image, mutated subscriptions or deployed anything. Root owns candidate image integration, actual existing route transport, HTTP/XML output and retained data/identity validation before rollout.
- Local tests validate executable handler data, not RSSHub's complete production XML formatter. Root must confirm the candidate's actual XML contains the expected nonempty body, publisher date, canonical URL GUID and future-homepage selection behavior.
- The patcher's strict source pin intentionally requires a fresh reviewed fixture if the upstream compiled bundle changes. A build refusal is preferable to silently wrapping an unrecognized handler.
- The original generic route, including its existing arbitrary-domain setting and article request behavior, remains unchanged for non-matching recipes. This patch is not a new generic sanitization or global security policy.

## Reviewer focus

Review the exact parameter boundary, source pin and original-handler delegation; strict canonical origin/path/redirect handling; publisher metadata identity and failure caching; body/date separation from listing titles; and the real compiled fixture tests. Compare emitted XML/GUIDs against existing daily entries before Root changes the delivery URL. Keep the weekly recipe on its existing generic implementation and preserve all historical rows.
