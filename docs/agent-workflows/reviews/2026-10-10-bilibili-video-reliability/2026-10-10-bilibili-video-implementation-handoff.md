# Video reliability implementation handoff

Runtime timestamps below are on 2026-10-11 UTC, corresponding to the local review date 2026-10-10 PDT.

## Reproduced defects and smallest correction

The unchanged RSSHub video handler already has an API/browser fallback. Its legacy browser environment pointed native Playwright `connect` at Browserless's CDP endpoint. The primary normal request reported API `-352`, entered that path and exceeded the consumer's 110-second timeout. A bounded native-protocol probe failed in 3,510 ms; the actual installed helper with CDP configuration created a context/page, fulfilled one local intercepted page and verified its contents in 758 ms, with no external page requests.

The shared browser service separately terminated an isolated real session at its global 30-second limit, before the video handler's 45-second response wait. The scoped correction is only a new RSSHub `PLAYWRIGHT_CDP_ENDPOINT` using its existing private endpoint/token plus `timeout=90000`. Keep legacy WS, all other environment values, image/source, original Feed URL/type and all subscription/article fields. No application code or dependency change is required.

## Actual behavior evidence

- Ordinary isolated memory-cache sample, 01:35:48–51 UTC: HTTP 200, 3,247 ms, 30 videos/links/dates, all 30 GUIDs and dates already stored.
- Repeat after 312.04 seconds, greater than the normal 300-second cache lifetime, 01:41:03–04 UTC: HTTP 200, 861 ms, same 30 existing video GUIDs/dates, zero unmatched GUIDs. No cache purge/bypass or full-source refresh occurred. Both samples are native API successes, not browser-success evidence.
- Separate native-API failure fixture, 01:43:04–07 UTC: exactly one local failure response, no native provider request; the unmodified compiled handler opens one real browser session and receives one matching publisher video API response, HTTP 200/business code zero. It returns 40 videos with canonical links and valid dates. All 40 GUIDs, titles and dates match existing videos; no video-list/XML response was seeded.
- Actual response socket address/port matches the configured proxy, using DNS resolution rather than comparing a hostname to an IP. Browser disconnect is observed. The per-session lifetime is 90 seconds; Browserless's global 30-second default stays unchanged.
- A single existing-cookie nav check returns HTTP 200/business `-101`, not logged in. It does not prove the cause of all verification errors; the real browser result above succeeds without replacing that Cookie.

Native signatures/render-cache fields in the failure fixture are unused local metadata; username/icon seeds come from existing public source metadata. They cannot supply a video response. Fixture/native failures and real provider observations remain explicitly distinct. Original source names, identifiers, responses, credentials and verification vouchers stay in restricted private evidence.

## Diagnostic limitations and corrections

The first protocol runner used the wrong Node stdin argument index and made no connections; it was corrected before recording meaningful RED/GREEN. The first browser fixture used the actual 30-second default and failed before a video response. A subsequent 90-second diagnostic lost its structured result because its error-evidence directory was absent; that is a method failure, not a retrospectively inferred provider result. After creating the directory, the final identical scoped candidate produced the verified real browser result. These intermediate records remain private, with no fabricated completion claim.

Limited serial samples do not guarantee permanent Bilibili availability or a permanently authenticated account. Provider verification can recur. This work repairs the reachable protocol/lifetime problems and verifies the existing fallback contract rather than installing a different publication stream.

## Final acceptance

Root controls a protected Compose before/candidate comparison, changes only the RSSHub service after evaluator pre-rollout acceptance, and verifies actual image/configuration, health, other component identities and queue state. One tracked worker refresh uses the existing Feed with content backfill disabled, then all old article/subscription/read-state/bookmark fields are compared with the protected baseline. Keep rollback and remove only the owned canary/environment clone after final independent acceptance. The six original local edits remain outside this task.

The controlled rollout and real maintenance are complete; see the [deployment handoff](./2026-10-10-bilibili-video-deployment-handoff.md). The [final independent assessment](./2026-10-10-bilibili-video-reliability-evaluation.md) is ACCEPTED, and root removed the owned canary/environment clone. Production's first attempt returned 503 from a browser business-code `-403`; unchanged bounded HTTP retry obtained 200/40 videos on the primary path. Two native API `-352` warnings remain recorded. These observations must not be rewritten as universal provider recovery.
