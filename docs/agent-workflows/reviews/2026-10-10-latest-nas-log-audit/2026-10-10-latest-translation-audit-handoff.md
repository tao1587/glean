# Latest translation audit handoff

## Observed result

No translation HTTP 502/429 recurrence was observed in the current visible post-repair window. This conclusion is limited to **one existing logged translation request**, plus **two new bounded diagnostic API calls**; it is not a guarantee that every language/provider/future request succeeds.

No controllable translation logic bug was reproduced, so this pass changes no application code, provider preference, deployment configuration or production state.

## Current-runtime evidence

- Backend version is `a6ccf99`; current backend started at `2026-10-10T13:55:06.818570886Z`.
- Web access snapshot covers `14:00:20.774331778Z`–`21:56:24.110928870Z`, 1,213 timestamped lines. Exactly one `/api/entries/translate-texts` POST appears: **HTTP 200 at `20:20:08.504585465Z`**. It occurred after this backend started. No translation 502/429 appears in that snapshot.
- Backend snapshot covers `14:42:54.111345092Z`–`21:11:32.061288428Z`, 249 timestamped headers: **242 INFO, 7 WARNING, 0 ERROR**. The first classifier missed colored WARNING levels because it did not remove ANSI escapes; the helper and evidence were corrected and the same snapshot rechecked. No translation failure record was found. Routine successful access is not fully logged, so Web/nginx provides the effective request count.
- The seven backend warnings are **five slow HTTP 200 responses**, **one HTTP 401 response**, and **one HTTP 404 response**. The translation-related warning at `20:20:08.504002764Z` is a slow **HTTP 200** completion (1.921 seconds), correlating with the Web success; it is not a provider failure or translation 502.
- Runtime introspection confirms configured MTran, Automatic → MTran, stale-user-field isolation, no silent Google fallback, typed rate-limit 429 handling, result validation and guarded threaded factory/translation execution.
- Settings counts remain one Automatic account and one explicitly selected MTran account. The Automatic account is inactive; the explicit MTran account is active. A preliminary lookup sent no HTTP call when it found no active Automatic account. The live probes therefore use the active account while leaving all statuses/settings unchanged.

## Two bounded formal API probes

Both probes call the actual authenticated `/api/entries/translate-texts` endpoint **directly at the backend**, bypassing Web/nginx and browser UI. They use only fixed non-sensitive English, do not provide `entry_id`, and thus do not request paragraph-cache persistence. JWT/user identity and all translated payloads remain inside the NAS process; only status/count/timing/boolean results are exported. They verify the authenticated backend translation flow, not a fresh browser/proxy flow.

| Probe | UTC interval | HTTP | Inputs/results | Checks | Time |
|---|---|---:|---|---|---:|
| Small request plus empty input | 22:01:01.712290–22:01:02.203082 | 200 | 2 / 2 | First result changed/nonempty/Chinese; empty input remains empty at index 1 | 491 ms |
| Normal English batch | 22:01:46.700265–22:01:52.007309 | 200 | 25 / 25 | All results changed/nonempty/Chinese | 5,307 ms |

The normal batch contains 11,741 English characters and 25 items, exceeding the runtime's 24-item provider batch limit. It exercises normal chunked translation without an invalid-limit or intentional-failure probe. Internal subrequest counts were not separately logged, and numeric ordering markers were not examined in this live batch; previous provider/API regressions cover ordering. The live small request verifies the preserved empty position.

## Limits and handoff

- MTran's empty container logs cannot prove successful use; the two formal API responses above provide direct operational evidence.
- Only en → zh-CN is exercised here. Explicit Google, paid providers, other language pairs, the 100 KiB payload boundary and intentionally failing rate limits were not probed again.
- The existing access event's origin is not inferred. The two new probes are direct-backend diagnostics and are not added to the earlier snapshot's single Web event; this audit does not claim three Web/browser translation requests.
- No raw logs, article text, private URL inventory, user IDs or credentials were exported; no queue reset, account activation, cache clear, source refresh, deployment or config mutation was performed.
- Sanitized evidence is `/private/tmp/glean-latest-translation-audit-evidence.json`. Root owns overall RSS/database audit and any subsequent production mutation. An independent evaluator can review the already captured evidence without duplicating API calls.
