# Bilibili video reliability contract

## Scope and completion criteria

Investigate the remaining video-provider business code `-352` on the NAS. Trace the actual RSSHub route, runtime configuration and Glean fallback behavior before proposing a change. Research current primary RSSHub documentation/source and compare supported public alternatives with the affected publisher's video output. Use bounded probes, with private source identifiers, response bodies, credentials and verification vouchers retained outside Git.

Change production only after a candidate demonstrably returns the intended video items with valid identity, links and dates. Distinguish a cached response, fresh upstream result and a limited repeat sample; do not promise permanent upstream availability. If no suitable candidate can be verified, retain the existing working fallback and report the specific limit instead of installing a speculative replacement.

Preserve Feed identity, Subscription ownership, all existing Entry IDs/GUIDs, reading state and bookmarks. Do not delete/recreate a subscription or feed, rewrite old articles, reset queues, alter unrelated routes or perform a full-source refresh. Preserve existing scheduler, retry, circuit, terminal-stage and inactive-account rules. Do not bypass a provider verification challenge or export account secrets. Supported authentication configuration may be evaluated only within existing authorization.

## Workflow

- Planner/root: capture baseline, control NAS probes and any rollout, choose the smallest validated correction, retain protected rollback, commit/push only this task's files.
- Research generator: inspect current official RSSHub route documentation/source and provide supported alternatives and concrete content/identity limitations; do not issue NAS/upstream probes independently.
- Implementation generator, if justified: first reproduce the selected defect with a meaningful failing test, implement the narrow correction and record handoff evidence.
- Independent evaluator: verify evidence, behavior, regression risk and preservation against this contract. Production acceptance must check the actual deployed configuration/image and the existing row associations.

Repository references: [feed fetch flow](../../../architecture/feed-fetch-flow.md), [guardrails](../../../operations/feed-fetch-guardrails.md), [route repair operations](../../../operations/rsshub-route-repairs.md), [prior audit](../2026-10-10-latest-nas-log-audit/index.md).

## Initial constraints

The prior snapshot showed a successful scheduled dynamic fallback with 12 items/two new articles while the requested video route remained subject to verification. That evidence does not establish video-only content or current primary-route recovery. The six pre-existing user edits and unrelated historical active plan remain outside this task.

## Reproduced configuration hypothesis

The current image already includes upstream API/browser video fallback. Its configured legacy browser endpoint resolves to Playwright's native `connect` method, but the Browserless `/chromium` endpoint speaks CDP. A normal primary request reports API `-352`, starts browser fallback and exceeds the consumer's 110-second limit before returning RSS. A separate single existing-cookie nav check returns `-101`/not logged in; this does not prove that all provider verification errors are caused by that cookie.

First verify the protocol mismatch with an explicit short bounded connection, then test the same installed helper with `PLAYWRIGHT_CDP_ENDPOINT` pointing to the existing private endpoint. Use only local fulfilled browser content for the protocol/context/interception check. If it passes, an isolated RSSHub canary uses the unchanged production image/route with that single configuration correction and independent memory cache. Verify actual nonempty video RSS, dates/GUID overlap, proxy selection and bounded behavior before rolling out the configuration. No token, Cookie, primary URL or route semantics change is planned; no provider-verification bypass is introduced.

The shared Browserless service has `TIMEOUT=30000`, which terminated an isolated session before the handler's 45-second response wait. Its server log directly records that session's 30-second termination. The candidate adds `timeout=90000` only to RSSHub's new CDP endpoint URL; global Browserless settings remain unchanged. Two ordinary cold/expired-cache video samples return 30 existing videos each, and a separately labeled local native-failure fixture triggers a real browser response with business code zero and 40 existing videos. The latter verifies the actual proxy socket and session closure; fixture metadata is never represented as a real upstream API failure.
