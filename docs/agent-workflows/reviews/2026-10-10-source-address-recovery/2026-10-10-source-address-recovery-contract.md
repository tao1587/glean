# Source address recovery contract

## Goal

Find an official replacement feed or demonstrably trustworthy mirror for the two remaining unavailable subscribed publishers. Replace only positively verified addresses on the NAS while preserving existing articles, feed identity and subscription/user-state associations.

## Scope and constraints

- Use author-controlled sites, repositories, migration announcements and matching article identities to establish provenance. A similar name, HTTP 200 or an old third-party directory is insufficient.
- Verify candidate XML/format, publisher identity, article links/dates and practical access through the deployed worker's configured network path. Distinguish a current feed from a static archive or unrelated account/activity feed.
- Keep all-account authorization from the preceding task; export only permitted names, sanitized public addresses and results. Keep private inventories, IDs, credentials and article payloads outside Git.
- Before any change, save restricted source metadata and existing association footprints. Check URL uniqueness, retain original Feed IDs, change only verified source fields and clear validators belonging to an old URL.
- Use one controlled maintenance refresh per verified replacement and require terminal success plus before/after association checks. Preserve queues, accounts, stateful services and the six original local edits.
- Do not invent mirrors, disable TLS or bypass CDN verification. If no trustworthy working alternative is established, preserve the current subscription and explicitly report the evidence and remaining limitation.
- Same-author ownership is insufficient to substitute a separate publication channel. If an official profile identifies parallel channels with different topics/history, require the user's concrete preference before changing the original subscription to that channel; continue searching the original publication independently.

## Completion criteria

- Both publishers have a documented provenance search and bounded live candidate checks.
- Any replacement has actual worker success and preservation evidence; unsuccessful candidates are not saved as production source addresses.
- Independent evaluator verifies the evidence and final state. Repo artifacts contain aggregate evidence only; the user-facing private report lists source names, public addresses and disposition.

## Roles

Planner: root. Generator: dedicated author-migration research plus root's bounded NAS verification and source repair. Evaluator: independent provenance/runtime/data-preservation review. No application-code change is assumed; code changes, if needed, require a reproduced failure, test-first implementation and a separate reviewed scope update.
