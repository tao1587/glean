# NAS cleanup and reliability deployment handoff

Date: 2026-10-10. Runtime release: `7f7f90f93e0b395df30545c58ee2015761aa371a` on `feature/week-month-views`. Documentation completion may follow in a later commit; the deployed application source is this release.

The [preceding seven-day log audit](./2026-10-10-nas-log-audit.md) records the original failure counts, translation 502 correlation and coverage limits.

## What changed online

- Deployed the summary-free backend, worker, web and admin, plus the repaired RSSHub Anthropic route. README/API documentation and MTran request-byte fixes are included from `7c5a7e7`; translation and RSSHub reliability fixes are included from `3b5de3d` and `7f7f90f`.
- Built from a clean Git archive, excluding the six pre-existing unstaged edits. Reused the NAS's installed backend runtimes after checking the required dependency closure against the lockfile; removed all old application directories before copying reviewed source. Frontend builds used archived workspace source and replaced the entire nginx document root.
- All five final immutable tags were pushed successfully to the NAS registry. Production Compose files reference `release-7f7f90f` with `pull_policy: never`; backend/worker set `APP_VERSION=7f7f90f`, `RUN_MIGRATIONS=false`, and `CREATE_ADMIN=false`.
- PostgreSQL and Redis were not recreated. No schema upgrade, user-setting rewrite, feed mass reactivation, queue reset or account activation was performed. Historical summary migrations and existing database history remain intentionally preserved.

## Release images

| Service | NAS registry tag | Image SHA-256 |
|---|---|---|
| Backend | `127.0.0.1:5000/glean-backend:release-7f7f90f` | `2f0fddbdfa5b019cd6c162a760f149d9b79cc507c44d6cb697a91bfe5a68a70e` |
| Worker | `127.0.0.1:5000/glean-worker:release-7f7f90f` | `a90a3fa17cac7fe1ccf868d4bd50ecc310477c2b8c724a036f1c49a5e38cf33c` |
| Web | `127.0.0.1:5000/glean-web:release-7f7f90f` | `217f7f962da7b1ddf39c8a82afe730817ea83ae8e69b5f43a5cb0471319ea08a` |
| Admin | `127.0.0.1:5000/glean-admin:release-7f7f90f` | `fa098b4682f2bea68b702f859ad267fbd8264852dd33c2e2956588eb7a0b4d9c` |
| RSSHub | `127.0.0.1:5000/rsshub:release-7f7f90f` | `fb1decfac127e5ea9e67b224e4c63dabac8742038afdc3a53a1f9c1b0b958b5a` |

## Live verification

All probes processed credentials, subscription identifiers, tokens and response payloads on the NAS; only fixed labels, status codes, counts and booleans were exported.

- Authenticated active account: `/api/auth/me` returned 200; `/api/entries/translate-texts` returned 200 for a fixed non-sensitive text plus an empty item. Two ordered results, changed/nonempty Chinese output and the blank position were verified. The account explicitly uses MTran and its existing custom endpoint remains intact.
- There is no active account with an unset preference. Automatic was therefore verified directly against the deployed factory and server-configured MTran, without enabling the inactive account or rewriting user settings. The result was changed/nonempty. The initial combined authenticated/direct canary took 71 ms. A separate request with a fresh non-sensitive sentence and a unique nonce also returned 200, with the same two-result/CJK/blank-position checks, in 423 ms including the direct Automatic probe; this avoids relying solely on cached output. These are smoke measurements, not latency guarantees.
- Production RSSHub `/anthropic/research`: HTTP 200, valid XML, ten items with ten dates and ten nonempty article bodies. `?limit=2`: two items/dates/bodies. An existing local Twitter route returned 200 and eleven items/dates/bodies.
- Existing Anthropic subscription refresh: authenticated API returned 202; its tracked worker run reached `success` / `complete`, with no error message. The feed remains active with zero errors.
- Real headless browser verification through the published production Web port passed: authenticated settings page, Automatic button visible, explicit MTran still selected, zero AI tabs (including the former plain `AI` label), and zero page script errors. The normal authenticated reader also loaded and its entries request returned HTTP 200. No settings were saved.
- Final independent image/module/bundle/API/stateful-service verification is recorded in the [evaluator assessment](./2026-10-10-nas-reliability-evaluation.md).
- Recent 20-minute logs from the new backend and worker had zero error-level matches, translation 502 matches or retired-summary-task failure matches. RSSHub had one rate-limit-classified error match; no timeout/network/empty-route/5xx categories matched that line. This short observation window does not prove all providers or historical logs are error-free.

## Rollback

Retained image tags for all five services: `127.0.0.1:5000/glean-{backend,worker,web,admin}:rollback-20261010` and `127.0.0.1:5000/rsshub:rollback-20261010`. Keep these until the release has had a suitable observation period.

Private configuration backups remain on the NAS with restrictive permissions:

- `/volume2/docker/glean/deploy-backups/20261010-cleanup-7c5a7e7/docker-compose.before.yaml`
- `/volume2/docker/glean-proxy/deploy-backups/20261010-rsshub/rsshub.compose.before.json`

For application rollback, set only the four image references in the live Glean Compose to the retained rollback tags, keep migrations/admin recreation disabled, then run `docker compose -p glean -f /volume2/docker/glean/docker-compose.yaml up -d --no-deps --force-recreate --pull never backend worker web admin`. Roll back RSSHub's image reference separately and run `docker compose -p glean-rsshub -f /volume2/docker/glean-proxy/rsshub.compose.json up -d --no-deps --force-recreate --pull never rsshub`. Verify running image IDs/health afterward. Do not include PostgreSQL or Redis in an application rollback.

## Limits and reviewer focus

- Google rate limiting was reproduced as the earlier translation failure. It is now a controlled 429/cooldown; explicit provider choices do not silently fall back. External Google limits, inaccessible remote RSSHub instances and upstream 429/521/522/525 responses remain possible.
- Transient RSSHub route failures now retain active feeds with capped backoff and only open per-origin circuits after confirming an origin outage. These repairs do not remove external-provider outages.
- The initial full frontend test baseline has ten pre-existing failures reproduced against the original HEAD; focused reader/settings tests, types and builds passed. No full-suite success is claimed.
- Automatic approval review disallowed exporting raw logs and detailed per-feed/domain diagnostics. Diagnosis stayed on the NAS and used aggregates; no credential or article export was needed.
- The independent assessment confirmed release identities, summary retirement, preserved database counts/settings/schema, and all five rollback tags plus both configuration backups. Original six user changes remain outside task commits.
- After all live gates finished, the owned temporary RSSHub canary was removed successfully. Its private environment clone, NAS probe script and container-side probe/refresh marker were deleted; production services and rollback artifacts were retained.
