# Source-address recovery independent evaluation

Date: 2026-10-10. Phase: **ACCEPTED — publisher A recovered; publisher B original subscription preserved with a verified historical reference**. No current same-publication replacement was established for B within the bounded search. That external limitation remains explicit rather than being hidden by an unrelated or frozen feed.

Scope follows the [contract](./2026-10-10-source-address-recovery-contract.md). Publisher names, source addresses, private IDs and article lists are intentionally kept in the private user-facing evidence rather than this repository artifact. No application code or deployment change is required for this address-only recovery.

## Rubric and current disposition

| Criterion | Result | Independent evidence |
|---|---|---|
| Publisher identity | Pass for A | Author-controlled profile associates the account with the original publishing domain; public repository ownership, non-fork status and domain file match. Feed title and all 20 canonical article addresses match the original publisher. |
| Practical access | Pass for A | Actual deployed worker `fetch_feed` and parser succeed under the existing configured network path, with 20 entries and dates. Normal TLS verification and proxy settings remain. |
| Scope/persistence | Pass for A | Original Feed identity/type retained; collision check found zero other targets. Old endpoint validators were cleared, followed by one maintenance refresh with existing-entry backfill disabled. |
| Behavior/data preservation | Pass for A | Actual run success/complete, no error, active/zero errors. Recovered source still has exactly 20 articles. All before-state fingerprints pass. |
| Publisher B | Search/disposition accepted; current-source failure unresolved | The user excluded the parallel research channel and chose to retain the original subscription. A trustworthy historical RSS snapshot matches the stored publication, but does not supply future updates. No current equivalent feed was verified; original address/type and 80 old articles remain unchanged. |

## Provenance and preapproval

The evaluator independently checked the author-controlled profile and public website index through primary sources, then checked public repository metadata/domain declaration on the NAS. The repository is public, not a fork, not archived/disabled and uses the expected default branch. Its last push checkpoint is 2026-01-04. The declared custom domain matches the original publishing domain.

One bounded actual-worker candidate request independently yields the expected publisher title, 20 entries, 20 dates and canonical publisher links. All 20 addresses overlap the original stored article addresses. The latest article date, 2025-11-02, agrees with the publisher's public index. This establishes a currently reachable author-controlled publishing mirror; it does not infer unpublished newer articles or promise future updates from repository activity alone.

The evaluator gave preapproval for an in-place replacement, with original-URL/row-lock, uniqueness and no-active-run guards; original Feed ID/type, existing subscriptions and article rows retained; old validators cleared; no manual status/error-counter reset; and exactly one controlled refresh. The restricted before-state file has mode 600 and records both targets' 100 article fingerprints and two subscription footprints. No evaluator database mutation, refresh enqueue or dense probe wave occurred.

## Independent final check for publisher A

The reviewed aggregate status helper was executed read-only against the deployed backend after the root's authorized mutation. It confirms:

- The actual maintenance run is `success` / `complete`, has no error and the feed is `active` with error count zero.
- The saved address is the approved official mirror; source article total remains 20, so this recovery did not duplicate its existing articles.
- All 100 original articles across both targets retain their ID/feed/URL/title/author/content/summary/GUID/publication fingerprints.
- Both subscription fingerprints and all 81 user-entry fingerprints are unchanged; the before-state contains zero bookmarks and bookmark checks pass.
- The unapproved publisher's original source address/type remains unchanged.

The worker's inspected persistence path inserts with the existing feed/GUID conflict constraint and does not overwrite conflicting article rows. Existing-entry backfill is disabled for this maintenance operation. The final fingerprint/count check supplies live confirmation rather than relying only on that implementation reading.

## Publisher B identity and channel boundary

A primary public profile uses the old publisher name and links the author's personal homepage and notes repository. The evaluator independently found that primary profile through web retrieval; a separate bounded NAS request timed out through the configured proxy, so no new live availability claim is made for that profile. Root/generator's further author-owned homepage/archive evidence connects the same author to the proposed site.

The homepage identifies parallel personal and scientific/research publications. The proposed 14-item feed belongs to the latter, with latest date 2024-01-15, while the original personal-source archive includes newer 2024-11-15 material. No old-path overlap and the different stated channel prevent treating this as an established migration of the original publication. Same-author evidence can support a new-channel option, but does not authorize silently substituting that channel for the user's original subscription.

## Completed bounded search and historical reference

The user explicitly chose to retain the original subscription and look for the same personal publication; the alternate research channel is excluded. The [research handoff](./2026-10-10-source-address-research-handoff.md) and [recovery handoff](./2026-10-10-source-address-recovery-handoff.md) distinguish the checked evidence:

- The author-linked publishing-platform root/feed/About endpoints redirect to account HTML. The apparent feed has no RSS/Atom version and zero entries, so HTTP 200 does not establish a usable publication feed.
- Three author-owned notes mirrors contain the 55-file personal-writing archive. Root's complete 426-file repository tree has no publishing-feed artifacts or publishing workflows. Article/draft archives and commit/social activity are not substituted for the original article channel.
- The original configured publishing address still returns 404. No equivalent current same-publication migration was verified within those primary-source paths.
- The official web archive provides a fixed 2026-06-24 original RSS snapshot with 80 items. Generator independently checked three identity samples; root subsequently ran the actual NAS worker fetch/parser and compared all 80 stored URL/title/GUID/date identities, with all 80 matching and zero extra article URLs. Its latest publication is 2025-12-01. Those are separate checks with different coverage; no full article-body equality with the archive is claimed.

The snapshot is a trustworthy historical preservation reference, with no future-update guarantee. It is recorded in the private report and does not replace the active source address. The user's original-source preference, 80 old articles and associated subscription remain intact. The search is complete within the documented scope; this does not assert that no alternative can ever exist.

Root's read-only checkpoint at 20:28:12 UTC reports 255 subscriptions, 223 distinct sources, 222 active and one error source, with zero active-source error fields. This is a persisted-state checkpoint after A's recovery, not a fresh all-source HTTP availability claim.

## Final acceptance and limits

The private user-facing report independently passes metadata checks: mode 600, outside the repository, five credential-free public URL fields, no private ID/token fields and no UUID strings. It records the successful replacement, preserved-source disposition, the user's rejection of the alternate channel, the historical snapshot/full-identity comparison and limitations. Personal names, addresses and inventories are not copied into this public document.

Original source/article/subscription/state snapshots remain restricted for rollback. Application code/images, proxy/TLS settings, scheduler and account state were unchanged; no broad refresh, queue reset or challenge bypass occurred. The six original local edits remain preserved outside this task. Repository docs validation and whitespace checks pass.

Final disposition: **ACCEPTED / APPROVE** for the authorized feasible repair, bounded provenance search and honest unresolved-source handling. A is recovered with actual worker/data-preservation proof. B remains on its original address with its history preserved; the excluded parallel channel and fixed historical snapshot are not silently substituted. No controlled repair blocker remains, and the workflow may be archived. Retain private before-state/rollback evidence and the user report.
