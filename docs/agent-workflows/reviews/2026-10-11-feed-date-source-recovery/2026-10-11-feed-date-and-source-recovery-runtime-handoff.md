# Feed date/source recovery runtime handoff

Contract: [requested outcomes and preservation](2026-10-11-feed-date-and-source-recovery-contract.md). Independent source review: [evaluation](2026-10-11-feed-date-and-source-recovery-evaluation.md).

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


## Actual rollout and bounded data result

The combined source commit is `33aa4c81c49379062aa24fe3b4a22c24a0e02471`. Native NAS build succeeded against the exact retained base; candidate/production image identity is `sha256:53379de86ff9a963fe2ad0275ba073aef4c5a8fcc0e756cc493a3e0cdc5f702d`. Both isolated canary and production normal-route XML passed eight controlled checks: Engineering default 20 dated items and repeat-cache equality; one latest weekly issue with real date, old raw GUID and 39 paragraphs; one dated full daily edition matching an old GUID; unchanged generic four-edition weekly selection; and the prior research route. The candidate's real ofetch dependency passed all three transport controls, closing the local missing-dependency gap.

Production uses its unchanged Compose entrypoint override (`dumb-init --`) and `npm run start`. The image default retains the CA wrapper; the production common index synchronously imports the CA installer. These are distinct verified paths, not a claim that the Compose override invokes the wrapper. Existing research/podcast/no-429-retry/CA markers, CDP 90-second session timeout, generic-domain flag, environment and all 15 other running container IDs/images are preserved.

Independent operation pre-review caught identity-map stale values after acquiring locks. The operator corrected the ephemeral script before any data mutation: lock reads refresh existing objects; every date update also uses exact ID/Feed/GUID/URL plus `published_at IS NULL` and checks rowcount one. Source URL/type updates use exact old identity guards, collision checks and rowcount one; removal locks/revalidates the exact owner association. Postchecks read fresh database values. Any failed guard rolls back the single transaction.

One atomic transaction repaired exactly four publisher-verified null dates, changed three URLs/source types/validators in place and removed one current-owner subscription association for an officially corroborated publication inactive for over 180 days. All 809 baseline articles remain, 805 old non-null dates remain exact, 120 old reading states and all remaining subscription fields remain exact; no historical body/GUID/collection timestamp is rewritten. The removed association is privately recoverable and its shared Feed/history remain. Schema is unchanged. Eight actual authenticated searches return the same four old IDs in both all/date scopes; before repair, all four date scopes excluded them.

Four existing-source maintenance runs finish successfully on their current primary URLs without fallback/error, with existing-article backfill disabled. The recovered weekly latest issue is stored with real date/full body; the official programme playlist adds 15 distinct dated video items. Default one weekly item does not restore all missed historical weeks. Historical opaque/resolved GUID forms remain exact, and the latest old issue's resolved form matches the current parser. No wider historical replay is claimed safe.

All four new subscriptions have one converged owned bootstrap and correct publication scope. A final full-text check initially found one new developer article still at teaser length. A single normal `force=False` body retry succeeds; all 15 public developer articles now have done body status and at least 8,533 plain characters. Standard backfill invalidation handles translation/embedding caches for this new article; it is outside the 809 old-row baseline. The repaired daily producer supplies a full public body, but the old daily edition's original shorter stored body remains preserved; producer success is not represented as an old-body repair.

Normal native-source insertion can dispatch a new-entry body job before its final batch commit. Three new video rows had zero attempts and retained `pending` after matching ARQ results returned `Entry not found`. A one-time, entry-specific retry after commit repairs only these new rows; no old article is selected, no queue is reset and no global worker/parser change is introduced. The normal body retry checkpoint uses stable task-specific job IDs and excludes any already queued/in-progress target job. Two video retries succeed; one fails during browser-context cleanup. Final video body statuses are 11 done/four failed, with no pending target body task. The RSS itself is active/error-free and preserves all dates/links; extracted video page text is not promised as a transcript. This pre-existing enqueue/commit race and browser extraction limits remain recorded rather than presented as universally corrected.

Private exact rows, job IDs, raw XML, article content, account ownership and rollback/configuration snapshots remain protected on NAS. Independent final acceptance and owned-canary cleanup follow this checkpoint.


## Final closure

Independent final runtime/source/SQL/API/XML/transport checks are accepted in the evaluation. The owned isolated canary and temporary environment clone are removed; protected exact evidence, old configuration/image and association recovery snapshot remain. The accepted image is also published in the NAS private registry under its immutable source-commit release tag. Only this workflow is archived; the unrelated active plan and six original working-tree edits remain.
