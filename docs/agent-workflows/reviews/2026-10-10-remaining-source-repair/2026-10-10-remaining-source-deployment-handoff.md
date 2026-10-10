# Remaining source repair deployment handoff

Date: 2026-10-10. Scope: all-account source inventory after explicit user authorization; personal source names, URLs, identifiers and response contents remain outside the public repository.

## Deployed components

| Component | Source revision | Image SHA-256 |
|---|---|---|
| Backend | `a6ccf992fca644c3a147e7cf404664cfa903f73b` | `57d209c3c06cc2ceddf33e558ad44d132f9ce8a255b77a0f0e97bd0bfa5e9327` |
| Worker | `a6ccf992fca644c3a147e7cf404664cfa903f73b` | `9b175687e24911a139cb92815b57eb5c31fa0c337335b765e1f54c2c570caa5d` |
| RSSHub | `2441ce28394084ee7efbf41485a6267f5bc085eb` | `ecf388898a68e93ca70b2a6083d63bf5e73040abeba66eea2d636702122ee698` |

Web/admin remain on the previously verified `7f7f90f` images because their source did not change. Backend/worker retain migration and administrator recreation disabled. PostgreSQL/Redis were not recreated or reset.

## Repairs and proof

- Parser rejects well-formed HTML with no salvageable entries even when `bozo=False`; empty RSS/Atom, namespace prefixes, bytes and salvage remain valid. Independent focused backend suite: 103 tests; root's parser/discovery check: 41 tests. No unrelated full-suite claim is made.
- Exact proven publisher hosts, including one authoritative HTTPS redirect destination, were added to both proxy-exclusion variants. Existing exclusions/settings were preserved. Normal TLS verification remained enabled. The initial-host-only repair was insufficient; a temporary actual-worker redirect-host canary proved the correction before rollout.
- Three source URL replacements and a separate imported-source type correction preserve their original Feed IDs and source associations. Old endpoint validators were cleared on URL changes. Seven controlled recoveries reached actual terminal worker states: six `success`, one `not_modified`, all complete/active/error-count zero. Counters were cleared by successful worker behavior, not a mass reset.
- Existing footprints remain preserved: original four targets have 438 old entry associations and 107 prior user states; the additional two targets have 10,656 old entry associations and two subscriptions; the final target has 249 old entry associations, one subscription and zero prior state rows. Private before-state/rollback records remain restricted on the NAS.
- RSSHub transport removes only 429 from its retry list and runs with `REQUEST_RETRY=2`. Actual compiled-helper loopback probes verify 429 one attempt, 500 recovery in three and reset recovery in two. Podcast details have concurrency two and stop additional misses after the first 429, preserving order/cache and sufficient overview fallback. Other failures remain explicit.
- Official public cross-signed CA bridge is pinned and verified against already trusted X1, with CA/date/signature checks. Existing defaults/extra CAs, hostname verification and proxy behavior remain. A synchronous first application-entry import covers the upstream script's Node-option override and cluster workers before TLS contexts.
- Two failed integration candidates were rejected before production: overriding ENTRYPOINT removed inherited CMD, then the npm start script overwrote the option-based preload. Explicit baseline CMD and real common-entry initialization corrected them. The final image passed default startup and fresh publisher HTTP/XML, not only isolated helper tests.
- Source patch suite: 18 focused tests; installed real ofetch transport suite: three. Fail-closed transforms validate known layouts and syntax before writes. The independent assessment includes differential security review of CA trust boundaries and preserved checks.
- Fresh production probes return healthy RSSHub, publisher default XML with five items/dates/bodies, prior research XML with two, note-card XML with 21 dates, and representative previously limited podcast XML with 15 items/dates/bodies. Note-card routes intentionally have no article descriptions.

## All-account disposition

Checkpoint at `2026-10-10T14:50:29Z`: 255 subscriptions, 223 distinct subscribed sources, 221 active and two error sources. Recent failures and active-source error metadata were included in triage; active state alone was not treated as availability proof. The previously transient routes were classified from associated on-NAS causes and actual reprobes. Two remaining sources freshly return 404 (retired/unavailable publishing endpoint) and 403 with a CDN challenge. No trusted replacement endpoint was verified for them; account activation, human-verification bypass and deleting historical subscriptions were not used.

The private user-facing report contains names, sanitized addresses, current reasons and recovery results. It is outside Git. This inventory/checkpoint is not a claim that every active direct source received a new independent HTTP request or that future external limits cannot occur. The count differs from the preceding task's 252-subscription baseline; current checkpoints and preserved targeted associations are reported without attributing unrelated activity to our repairs.

## Rollback and preservation

Immutable deployed tags: `127.0.0.1:5000/glean-{backend,worker}:release-a6ccf99` and `127.0.0.1:5000/rsshub:release-2441ce2`. The prior summary-free `release-7f7f90f` images remain available; original `rollback-20261010` images also remain.

Restricted backups:

- `/volume2/docker/glean/deploy-backups/20261010-remaining-sources/docker-compose.before.yaml`
- `/volume2/docker/glean/deploy-backups/20261010-remaining-sources/docker-compose.before-redirect-host.yaml`
- `/volume2/docker/glean-proxy/deploy-backups/20261010-remaining-sources/rsshub-compose.before-final.json`
- Private selected-feed before-state records under the restricted NAS audit directory, with original URLs/types/validators and associations.

For an application rollback, restore only the affected image/environment references and recreate backend/worker or RSSHub with their original Compose projects. Keep migrations/admin recreation disabled; do not include PostgreSQL/Redis, clear queues or revert source data without consulting its restricted before-state. Four verification jobs were considered for guarded priority promotion, but eligibility had already ended; zero were promoted and the queue remained untouched.

The independent evaluator's final production/rollback assessment is **ACCEPTED / APPROVE**. After its probes finished, the exact owned RSSHub test container and cloned runtime environment file were removed; a fresh check confirmed both absent. Retained rollback images, private configurations and source before-state records remain protected. The final private report is mode 600 and outside Git; no personal source inventory was published.
