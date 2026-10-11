# Feed date/source recovery runtime handoff

Contract: [requested outcomes and preservation](./2026-10-11-feed-date-and-source-recovery-contract.md). Independent source review: [evaluation](./2026-10-11-feed-date-and-source-recovery-evaluation.md).

## Frozen candidate

Root integrates the approved Engineering, weekly CMS and fixed daily-recipe modules in the RSSHub Dockerfile. Existing research, podcast, HTTP 429 retry exclusion, CA bridge, common entrypoint, `dumb-init` and `npm run start` remain unchanged. The production base image is retained by exact image identity; the next candidate uses that base rather than fetching a newer upstream service.

Fresh root verification passed all 73 targeted adapter/patcher/CA tests, documentation validation, whitespace checks and all six original local-edit fingerprints. An attempted wider wildcard run also selected the old ofetch transport test, whose local dependency was absent; this is a test-environment failure. Its three transport controls must run with the candidate's actual dependency before live acceptance. No core API/worker/frontend behavior is changed.

The four new sources were validated and subscribed through normal current-account APIs. All four bootstrap runs completed. The weekly column uses the existing generic HTML route with official publication `time[datetime]` and four full weekly bodies; the general blog RSS contains none of those editions. Equivalent compact CSS combinators keep the normal discovery URL below the existing temporary-title storage limit. A prior longer discovery request failed before creating either Feed or Subscription; the compact request did not create a duplicate. The fixed daily recipe leaves the deployed generic unsafe-domain setting unchanged.

The developer publication's RSS is a teaser, but the existing Glean browser backfill obtained the same public article's full text. Its official Markdown endpoint also supplies direct public text. Paid newsletter entries and podcast show notes have explicit availability limits; they are not represented as full paid articles or transcripts.

## Pending controlled operations

1. Build an immutable RSSHub image tied to the frozen source commit. Run a separate canary with the same protected production environment, no volumes and the default command. Validate real XML, fresh/cache dates, canonical identities, original weekly GUID, full public bodies, generic weekly output and representative previous route repairs.
2. Replace only the RSSHub image in the existing Compose JSON after canary acceptance; retain protected original configuration/image/runtime snapshots. Verify unchanged environment, CDP 90-second session timeout, other component IDs/images and schema.
3. Repair exactly four old null Engineering publication dates from matching publisher metadata. Preserve all non-null dates, content, collection timestamps, Entry/Feed IDs and associations. Verify actual authenticated publication-date search before/after.
4. Change three existing Feed URLs in place to verified official/native or repaired local sources, clear obsolete conditional validators and explicitly retain source typing. Account for both owners of shared rows. One tracked refresh per target, with old-entry backfill disabled; no global fetch wave.
5. Remove only the active owner's association with the officially stagnant publication (over 180 days). Keep its Feed, all old articles, reading state and bookmarks; capture the association privately for recovery. Do not use the normal orphan-cascade deletion service.
6. Independently verify protected all-field preservation and converged refreshes, remove only the owned canary/environment clone, archive this completed workflow and retain rollback evidence.

Deployment and data/source operations are not yet accepted at this source-freeze checkpoint. Protected evidence resides on NAS; public review artifacts intentionally contain no account identifiers, inventory, credentials or article bodies.
