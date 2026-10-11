# Video reliability deployment handoff

## Actual deployed configuration

Local review date: 2026-10-10 PDT. Runtime observations below are on 2026-10-11 UTC.

At 01:47:54.757183 UTC, root recreated only the RSSHub service using unchanged image `sha256:ecf388898a68e93ca70b2a6083d63bf5e73040abeba66eea2d636702122ee698` / `release-2441ce2`. The only resolved Compose/environment addition is `PLAYWRIGHT_CDP_ENDPOINT`, pointing to the existing private CDP endpoint/token with `timeout=90000`. Actual container environment equals the reviewed private candidate exactly; legacy WS, Cookie, proxy, cache and all other values remain intact. Both root and `/healthz` return 200, effective CDP path/session duration are verified, restart count is zero and startup has no ERROR headers.

All other Glean application/stateful container identities/images, plus Browserless and its configured proxy, are unchanged. Browserless's global `TIMEOUT=30000` is retained. No image build, dependency change, database migration, queue reset, Feed URL/identity change or full-source refresh occurs in this rollout.

## Single production maintenance result

One job is enqueued through the existing feed-refresh helper with `backfill_existing_entries=false`, on the existing Feed. It completes `success` / `complete` at 01:49:00.832784 UTC with `fallback_used=false`, the original primary video URL, 40 total items and zero new entries. The Feed remains active with error count zero. This is an actual worker result on the intended video stream, not a substitute dynamic route or a direct diagnostic response.

The same job makes two normal RSS HTTP attempts under the unchanged retry policy. The first returns 503 at 01:48:56.103275 UTC; the browser branch's error reports provider business code `-403`, distinct from HTTP 403. The second returns 200 at 01:49:00.663190 UTC and supplies 40 videos. Two native API-to-browser warnings report `-352`. The RSS log window contains four actual ERROR headers: two native risk-metadata records, one browser-data diagnostic and one terminal route error from the first attempt. No dynamic response is observed. Worker/backend ERROR header counts are zero in the same window.

This proves the corrected video browser path and existing bounded retry recover this observed task. It does not prove that native `-352`, browser restrictions or future upstream failures are eliminated. The separately labeled isolated fixture and the two ordinary spaced API samples are recorded in the [implementation handoff](./2026-10-10-bilibili-video-implementation-handoff.md).

## Data preservation and operational gates

At 01:49:11 UTC, protected before/after comparisons confirm every old field of all 78 article rows, one subscription, six reading-state rows and the empty bookmark set is unchanged. Feed ID, original URL and RSSHub source type remain intact; article count is still 78. Existing dynamic articles are retained. The normal worker may update feed metadata/timestamps/validators, while subscription ownership/aliases/folder fields and old article content remain unchanged.

Queued/in-progress counts are zero, worker health TTL is positive, no active run remains for the target, and database revision remains `94af7ef02eb9`. Existing zero-subscription eligibility, inactive-account inclusion, scheduling, circuit, backoff, terminal and content-backfill rules remain untouched. Private identifiers, responses and credentials remain outside Git.

## Rollback and closing gates

Protected directory `/volume2/docker/glean-proxy/deploy-backups/20261010-bilibili-cdp` retains original/candidate Compose, component/runtime baseline, exact rollout metadata, effective configuration and postmaintenance raw/aggregate logs. Directory mode is 700; files are 600. Restore the original Compose and recreate only RSSHub without dependencies to roll back the environment addition. Keep the same image and stateful volumes; do not delete history or reset queues.

The [final independent runtime/SQL assessment](./2026-10-10-bilibili-video-reliability-evaluation.md) is ACCEPTED. Root removed only the owned isolated RSSHub canary and its verified temporary environment clone after acceptance; baseline, audit, rollback and user report remain retained. Original six local user edits and the unrelated discovery plan remain outside this task.
