# Latest NAS log audit and follow-up repair contract

## Goal

Inspect current NAS runtime logs after the preceding deployments and source-address repair. Determine whether translation HTTP 502, RSSHub HTTP 429 and source fetch failures still occur, repair reproduced controllable causes, and report remaining external limitations with precise time coverage.

## Scope and guards

- Compare current images/start times and successive post-repair windows. Distinguish old log history, deliberate diagnostic failures and new user/background failures. HTTP status strings or ERROR-line counts alone do not prove a live regression.
- Read relevant Glean API/worker/RSSHub/translation-service logs on the NAS. Keep raw logs, article payloads, tokens, credentialed URLs, user IDs and private subscription identifiers there. Export aggregate counts, timestamps, error categories and only authorized sanitized source metadata.
- Correlate current error categories with persisted runs and bounded serial probes. Do not trigger an all-source refresh, reset queues or clear errors without successful worker proof.
- Keep existing 429 backoff/concurrency, parser guards, translation request limits, explicit settings, TLS checks, source identities and original article/subscription/state associations. Preserve the six original local edits and the user's decision to retain the unavailable original personal-blog address.
- Find the cause before changing production behavior. Any logic fix requires a reproduced failing case, test-first implementation, independent evaluation and actual live acceptance before claiming recovery. Deploy only necessary validated services with protected rollback and stateful identities retained.
- If a source/provider problem is external or a repaired error no longer recurs, document observed evidence and limits without inventing a code change.

## Completion criteria

- Precise audit windows/current versions and translation/RSS error recurrence are established from actual logs and relevant state.
- Every feasible controlled fix has meaningful tests and live evidence; unresolved publisher/provider failures are listed with causes.
- Independent final assessment passes; protected rollback and original work/data remain intact.
- Repository records contain sanitized aggregate evidence; the private user report contains authorized source-level findings and verification limits.

## Reproduced follow-up repair: scheduled orphan feeds

The four real upstream-522 task failures concern a Feed with zero current subscriptions. The scheduled selector currently polls every ACTIVE catalog row, including orphan rows; subscription deletion is designed to clean up feeds with no remaining subscribers, but historical or imported orphan rows still exist. Recurring automatic requests for those rows add avoidable provider load without updating a subscription.

Narrow the due and midnight-supplement selectors to ACTIVE feeds with at least one Subscription. Count subscriptions across all accounts without changing activation semantics. Preserve exact cadence/timezone/next-fetch guards, origin circuits, terminalization and queue reconciliation. Keep Feed/Entry/Bookmark/UserEntry rows intact, and leave explicit manual/admin refresh and resubscription behavior available. This is eligibility filtering, not data deletion or mass status resets. Already queued/manual tasks are not canceled or modified.

Require real selection regression tests showing unsubscribed rows excluded, subscribed rows (including inactive-account subscriptions) retained, due/midnight rules unchanged and no row deletion. Independently review the query and test evidence. Deploy only the necessary worker image with rollback; do not trigger a full source refresh merely to test the filter.

## Reproduced worker packaging drift

The first native candidate build failed before an image was produced: fresh uv automatically selected CPython 3.15.0, and the locked hiredis build used a removed loader API. The live worker independently reports Python 3.14.6. Pin the worker Docker build to that already verified interpreter through a configurable `PYTHON_VERSION` argument / `UV_PYTHON` setting. Keep package manifests, lockfile, API/RSS images and production environment intact. The failed real build is the RED case; require a successful rebuilt image, installed-runtime/source checks and readonly production-selection canary before rollout. No failed candidate is deployed.
