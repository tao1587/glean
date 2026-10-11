# Engineering publication-date implementation handoff

Contract: [publication-date and source recovery](2026-10-11-feed-date-and-source-recovery-contract.md). Public source investigation: [research handoff](2026-10-11-engineering-date-research-handoff.md).

## Proven cause and change

The operator supplied the actual deployed compiled Engineering source. It has no date-parser import or article publication-date fallback; it caches whole items by article URL. The publisher's featured card has no listing date. An unchanged GUID also prevents a later valid feed date from automatically repairing an existing database row. Existing rows and all NAS mutations remain the operator's responsibility.

The route-scoped adapter retains the original card/body selectors, feed metadata, canonical links, image normalization, default limit/caller slice semantics and input order. It filters navigation and foreign/non-engineering card links before applying the limit. It does not replace the route with a different publication channel or expand the card selector. The featured card is already selected; its missing date causes RSSHub's date sorting to move it after dated items.

Current listing `time[datetime]` or validated listing publication text supplies UTC dates independently of cached bodies. For a fresh undated article, the existing body request also obtains publication metadata in this order: Open Graph `article:published_time`, matching article JSON-LD `datePublished`, publication-labelled/itemprop publication `time[datetime]`, then visible `Published` date text. Invalid calendar dates, modification/Updated timestamps, unrelated schema identities and current/ingestion time are never substituted.

Legacy full-item cache objects remain usable and are not mutated. Their cached bodies are merged with current listing title/link/date metadata. If both listing and cached publication date are missing, one additional article request verifies the date, with the result cached under `glean-anthropic-engineering-publication-v1:<article URL>`; later cache hits do not repeatedly fetch that page. A valid cached date survives when the listing has no date. Article/date requests use the existing injected RSSHub fetch/cache helpers and concurrency two. No proxy, retry, scheduler or other route behavior changes.

## Files touched

- `scripts/rsshub/anthropic-engineering-adapter.mjs`
- `scripts/rsshub/patch-anthropic-engineering.mjs`
- `scripts/rsshub/anthropic-engineering-adapter.test.mjs`
- `scripts/rsshub/patch-anthropic-engineering.test.mjs`
- `scripts/rsshub/engineering-date-test-utils.mjs` (test-only harness)
- `scripts/rsshub/fixtures/anthropic-engineering-legacy.mjs` (public deployed route code, upstream RSSHub MIT; no private source data)
- `docs/operations/rsshub-route-repairs.md` and this handoff

The fixture is the actual old compiled module, not a rewritten approximation; SHA-256 `887d967bf59196e742d00b7264a74aa60bd8e3321f1d7ce423ef653e1d5be844` matches the supplied deployed source. The harness substitutes only HTTP/cache boundaries and executes real Cheerio/p-map plus the compiled route/wrapper. Cheerio 1.2.0 and p-map 7.0.5 match the operator-confirmed runtime. Test dependencies are isolated under `/private/tmp`; repository package manifests/lockfiles are unchanged. Dockerfile changes, image builds, independent image canary, deployment and date repair are owned by root; this generator did not modify Dockerfile or contact the NAS.

## RED / GREEN evidence

Before production implementation, running the actual unpatched module against benign fixtures produced five expected failures out of seven: fresh featured date missing, old date-less full-item cache date missing, current dated listing blocked by an old cache record, JSON-LD-only publication missing and publication datetime-only missing. Existing valid-date preservation and refusal to invent a publication date passed.

Two further failing cases were observed before their corrections: navigation consuming the limit, and an `Updated` machine-readable time being incorrectly accepted. Independent evaluator fixtures then reproduced two additional failures: a listing `Updated`/`dateModified` time taking precedence, and an unidentified schema node taking the matched article's date. Both were observed RED before correction. The adapter now ignores listing modification signals and requires schema identity to match the current article, including string/object `mainEntityOfPage` forms. The final adapter/patcher suite has 17 passing tests, including UTC versus Asia/Shanghai child-process equality, cached-body preservation, repeated request budget, invalid/unrelated dates, metadata/cache merge, order/limit/concurrency, patch idempotence and unknown-layout refusal without writing the input.

Replay using previously downloaded public official index/article HTML and the actual old module, without further HTTP requests:

| Handler | Featured article included | Dates / items | Nonempty body | HTTP fixture reads |
| --- | --- | --- | --- | --- |
| Old compiled module | Yes | 0 / 1 | Yes | 2 |
| Patched compiled module | Yes | 1 / 1, real publication date | Yes | 2 |

Command for final executable fixtures (set dependency paths for the chosen test runtime):

```bash
RSSHUB_CHEERIO_MODULE=file:///private/tmp/glean-rsshub-engineering-node/node_modules/cheerio/dist/esm/index.js \
RSSHUB_PMAP_MODULE=file:///private/tmp/glean-rsshub-engineering-node/node_modules/p-map/index.js \
node --test scripts/rsshub/anthropic-engineering-adapter.test.mjs \
  scripts/rsshub/patch-anthropic-engineering.test.mjs
```

Set `RSSHUB_ENGINEERING_BASELINE=1` for the adapter suite only to replay the pre-fix compiled module. Do not use this baseline switch for acceptance. It is test-only and is not imported by production code.

The initial regression run of the Engineering suites plus existing research adapter/patcher, podcast adapter/patcher and public-CA/entrypoint suites passed 36 tests. After the evaluator corrections, the focused Engineering suites passed all 17 tests; the combined candidate's final regression is recorded by its operator. `python3 scripts/validate-docs.py`, `git diff --check` and Node syntax checks for the new production modules passed. These are local checks; no candidate image or live NAS result is implied.

## Candidate gate and known limits

The patcher reuses the installed hashed fetch/cache and Cheerio/p-map bindings, wraps only the exported Engineering handler, and checks the recognized old route/import/selector layout. Unknown layouts, ambiguous bindings, malformed prior markers or syntax errors abort before write. Rebuild on the retained known upstream image; do not assume compatibility with an arbitrary future bundle.

Before acceptance, the operator/evaluator must run the actual candidate image's default Engineering RSS route with normal transport/cache, verify item/date/body/canonical-GUID counts and preserve the existing healthy repaired routes. Keep CDP configuration, upstream command, cluster, CA completion, research/podcast/retry patches and rollback image intact. No claim of deployment or live recovery is made by this handoff.

The producer only fixes emitted metadata. Root must separately verify official publication dates for the existing affected rows, update only missing `published_at`, preserve every non-null date and existing identity/association/body, and prove inclusion through the date-filtered API. Cache publication verification still depends on the public publisher being reachable; failures remain explicit rather than becoming fabricated dates.
