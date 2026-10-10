# Latest NAS worker deployment handoff

## Outcome and exact release

Worker-only rollout completed at `2026-10-10T22:37:47.950724Z`. Source revision: `854034857d444096c60592dee0dd7c1e1415330d`; image/tag: `127.0.0.1:5000/glean-worker:release-8540348`, SHA-256 `8e981bc4dac8d7a7b3202613f4184f330bc71cb5c054c19563d7261f412b708e`. The native build and NAS registry push both exit zero. Actual deployed source hash is `70e607ec1f8f15356da4f548329c48c9f0d8d8edcaa0882cc01c63de1db6a73c`, with Python/UV_PYTHON 3.14.6 and APP_VERSION 8540348.

Backend remains a6ccf99, RSSHub 2441ce2, and web/admin 7f7f90f. Other application/stateful container identities remain unchanged. Main private Compose changes only the worker image and its version field; runtime environment equality is verified excluding only version and the interpreter pin. Migrations/admin recreation remain disabled. The queue was empty with no in-progress jobs before the graceful worker swap; no job was canceled/reset and no full-source refresh was triggered.

## Live acceptance

At 22:40:11 UTC, the real deployed worker's SELECT-only checks return 211 currently due subscribed feeds and 222 in the projected supplemental checkpoint. All 46 active inactive-account-only feeds remain eligible; no active orphan is selected. Existing cadence/timezone/due/attempt guards are retained. This checks the live selector rather than claiming a future scheduled batch has already happened.

All pre-rollout row IDs remain present across 610 feeds, 182,372 entries, 255 subscriptions, 9,647 reading-state rows, 34 bookmarks and two users. They remain in restricted on-NAS baseline evidence rather than this artifact. The actual worker is running, its health record is later than its start time, Redis heartbeat TTL is positive, queue/in-progress counts are zero and startup ERROR count is zero. The candidate-only startup wrapper test intercepted task consumption; actual deployed heartbeat checks are independent evidence of the real worker process.

Source acceptance includes six real PostgreSQL eligibility cases plus 17 scheduler/progress guards, independently repeated, and 12 RSSHub/backoff/HTTP retry regressions: 35 focused checks passed. The interpreter packaging RED/GREEN and byte/semantic lock distinction are recorded in the [build handoff](./2026-10-10-worker-build-pin-handoff.md). No unrelated full frontend/backend suite claim is made.

## Latest log coverage and remaining limitations

Initial Docker snapshots cover 14:00–21:56:46 UTC; separate deltas cover through 22:47:46. The removed worker's interval between 22:04:30 and its 22:37:47 replacement is retained in its persistent file log, with three INFO headers and no warnings/errors in that interval. Persistent worker coverage through 22:46:06 contains four ERROR headers at the same known upstream-522 times. Actual post-swap file logs have 30 INFO headers and no ERROR. API/RSSHub/PostgreSQL's final delta contains no new ERROR headers.

The old audit errors are not erased: four unused-source 522 failures later have same-source success; three episode transport failures have current valid podcast probes; two provider-verification metadata errors are distinct. The subscribed video source's recorded scheduled task succeeds using its dynamic fallback, while its primary video endpoint remains subject to provider verification. No bypass or primary-address substitution was performed. The original unavailable personal publication remains on its user-selected old address. Empty/silent logs and final successful task states are not generalized to every unlogged upstream attempt.

## Rollback, privacy and cleanup

Protected rollback directory: `/volume2/docker/glean/deploy-backups/20261010-scheduled-source-eligibility`, mode 700; files mode 600. It retains original Compose, old component identities/environment hashes, row-ID baseline, exact rollout/result metadata and startup raw logs. The previous `release-a6ccf99` worker image remains retained. Roll back only worker image/version references and recreate that service without dependencies; keep migration flags disabled and never delete data or reset queues for rollback.

The successful draft and final readonly canaries used no production volumes, task consumers or provider requests; their containers exit/remove automatically. After final evaluator acceptance, root verified the owned canary container is absent, removed its cloned private environment file and removed the exact owned draft image tag. The deployed formal image, previous rollback image and restricted baseline/configuration/report records remain. Only the owned local test PostgreSQL service was stopped; its test volume remains retained. Original six user-edited files stay outside these commits; the historical unrelated discovery plan remains untouched.

The [independent final assessment](./2026-10-10-latest-nas-log-audit-evaluation.md) is ACCEPTED; temporary-environment cleanup is complete.
