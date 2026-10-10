# Source failure triage on the NAS

## Diagnose before changing source state

Inventory current subscriptions separately from the global feed catalog and historical errors. Respect account scope: a request for current-user sources does not require exporting other accounts' subscription inventories. Keep tokens, query credentials, raw logs, feed IDs and user identifiers on the NAS; a user-facing source report can contain permitted names, sanitized addresses, status categories and probe timestamps. Do not commit personal source inventories to a public repository.

Probe suspected failures serially with bounded timeouts and pacing. Compare the configured network path with direct access only when diagnosing proxy failures. HTTP 200 alone does not prove RSS availability: check feed format, identity, entries and error-page/challenge indicators. Valid empty RSS/Atom differs from a well-formed HTML page which `feedparser` can report with `bozo=False`.

## Controlled repairs

- If an individual publisher works directly but fails through the proxy, add only that proven host to the backend/worker `NO_PROXY` exclusions. Preserve every existing exclusion and account for lowercase `no_proxy` precedence. Check positively verified publisher redirect destinations too: excluding only the initial host does not exclude a different redirect host. Keep normal TLS verification. Back up the private Compose configuration, validate the candidate, and recreate only affected application services.
- If a publisher's legacy URL no longer serves RSS and a verified equivalent route works, check target URL uniqueness, retain the original Feed ID/subscriptions/entry history, replace only the source URL/type, and clear validators belonging to the old endpoint.
- An author-controlled public build repository can supply the original Atom/RSS when the site itself has a CDN challenge. Establish ownership through the author's public profile, canonical-domain configuration and matching article identities; verify access from the real worker environment. Use a rolling publishing branch, distinguish it from a frozen archive, and check existing GUIDs/URLs for duplicate import risk. A same-name blog or a healthy XML response alone does not establish an author's migration. Separate an author's parallel publication channel from the original blog; changing to a different channel requires the user's concrete preference.
- If a disabled source now produces a valid feed, use a targeted authenticated refresh and require a terminal successful run before calling it restored. Do not reset every error counter or mass-enable historical failures.
- Imported RSSHub URLs should have the RSSHub source type so transient route failures use the existing retry policy. Changing an affected row's type is separate from proving that its route works.

After configuration/source repair, verify the deployed worker's actual fetch path and a tracked refresh, not just a standalone direct HTTP request. Preserve the Redis queue, stateful containers, schema and account preferences; normal queue counts can change as background jobs are consumed. Retain restricted before-state records and application rollback images.

## RSSHub immediate retries

The inspected RSSHub runtime used `REQUEST_RETRY=2`, a one-second retry delay and `PROXY_STRATEGY=all`. A loopback upstream returning 429 received three requests for one logical fetch. With a process-local `REQUEST_RETRY=0` canary it received one. That initial mitigation also removed retries needed for transient resets. The final dependency patch removes only 429 from the immediate retry status list and restores `REQUEST_RETRY=2`, retaining bounded network/server retries, proxy configuration and Glean's scheduled route backoff. Podcast episode detail enrichment has concurrency two and uses sufficient overview descriptions after a detail limit without replacing full caches. These changes reduce amplification without claiming that provider limits disappear.

Check the exact deployed upstream version: the installed build has no host-rate-limits configuration support, so setting a newer `REQUEST_RATE_LIMITS` variable would not prove throttling is active. Current upstream retry configuration is described in [RSSHub config](https://github.com/DIYgod/RSSHub/blob/master/lib/config.ts) and [ofetch setup](https://github.com/DIYgod/RSSHub/blob/master/lib/utils/ofetch.ts). Reverify transport and working routes after any dependency change.

## Remaining external failures

Separate a removed endpoint (404), a CDN challenge (403 plus challenge metadata), a provider/account rate limit (429), a network failure and an unavailable RSSHub instance. Do not label all failures as queue errors or manufacture an alternative source without verifying publisher identity. Sources requiring publisher-side recovery, approved access or valid account credentials should remain clearly listed with the observed reason.

The [2026-10-10 completed repair review](../agent-workflows/reviews/2026-10-10-remaining-source-repair/index.md) records deployed revisions, seven tracked recoveries, independent verification and rollback evidence. Personal source inventories remain outside public documentation.

The subsequent [source address recovery review](../agent-workflows/reviews/2026-10-10-source-address-recovery/index.md) records a verified author-controlled mirror, preserved article/state fingerprints and the distinction between a current publication and a fixed historical RSS snapshot.
