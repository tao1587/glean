# Remaining NAS source failure repair contract

## Goal

Investigate the NAS's remaining RSSHub rate limits and subscribed-source fetch failures, repair causes under our control, and deliver a current list of unavailable subscribed sources with confirmed reasons.

## Scope and constraints

- Inventory current subscribed feeds, persisted failures and recent attempts on the NAS. Separate historical error state, live route responses, upstream limits, inaccessible RSSHub origins, removed feeds and queue faults.
- The user explicitly requests source names and reasons. Export only the necessary source title, public/sanitized address, status/category and timestamps; keep tokens, cookies, raw logs, request payloads, user IDs and subscription IDs on the NAS. Do not publish personal subscription inventories to the public repository.
- Probe suspected failures serially with conservative pacing and bounded timeouts; respect explicit Retry-After. Avoid an all-feed refresh storm or changing upstream account credentials.
- Follow test-first implementation and independent evaluation for logic changes. Preserve feed-fetch terminalization, per-origin circuits, Redis reconciliation, named timezone/startup and explicit settings. Keep six pre-existing dirty files untouched.
- Deploy validated local fixes to the existing NAS services when required, keeping rollback images/configuration, summary-free runtime and PostgreSQL/Redis data intact. Targeted feed URL repairs/reactivation require positive live proof and must preserve entry/subscription associations.

## Completion criteria

- Current failures have source-level explanations backed by persisted state and bounded live probes; stale failures that recover are identified separately.
- Every feasible controlled repair is verified via actual RSS/XML or relevant queue completion; remaining external/account/provider failures are stated without claiming universal availability.
- Relevant tests and independent contract evaluation pass; production version/image identities and stateful service identities are recorded after any rollout.
- A private user-facing source report lists unresolved failures and reasons without credentials. Repo-local handoff/evaluation records contain sanitized aggregate evidence and reproducible repair instructions.

## Confirmed RSSHub follow-up scope

Serial probes and directly associated on-NAS error classifications identified intermittent episode-detail HTTP 429 failures in the podcast provider and a transport reset in another provider. Representative overview pages remained healthy both directly and through the configured proxy; sufficient overview descriptions and audio metadata were available. This evidence authorizes only the following dependency repairs:

- Remove HTTP 429 from RSSHub's immediate retry status list while preserving bounded transport/5xx retries. Restore the runtime retry count to two only with the validated patched image.
- Bound podcast detail concurrency to two. On the first 429, stop further detail cache misses for that invocation while allowing existing full-detail cache entries and at most two in-flight requests to finish. Use available overview descriptions only for limited details; missing descriptions and other errors remain explicit failures.
- Preserve original feed metadata, item order, links/dates/audio fields and successful detail caching. Do not cache overview fallbacks as full details.
- Reject unfamiliar compiled module layouts before changing files. Require real dependency loopback tests, executable patcher tests and derived-image/live canaries before rollout.

Worker retries, source policy and user settings remain outside this focused patch. Private source names, identifiers and inventories must stay outside public repository artifacts.
