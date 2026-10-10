# Source address recovery handoff

## What changed

One protected publisher's original Feed URL now uses an Atom file published in the author's own public build repository. This is a source-data change; application code, images, proxy/TLS configuration and scheduler policy did not change. The Feed ID and source type are retained, old endpoint validators are cleared, and one maintenance refresh used the existing enqueue helper with existing-entry backfill disabled. Status/error counters were repaired by the worker's successful fetch rather than manual resets.

The second publisher's identity chain leads to an official parallel channel. Its working 14-item RSS does not overlap the original 80 articles and its latest publication predates the original personal channel's later material. The author's own homepage explicitly distinguishes their personal and research channels. The user reviewed this concrete alternative and chose to retain the original subscription while searching for the same publication. No parallel-channel address is saved.

The author's original-publication archive has 55 files in a public notes repository. A complete recursive-tree check contains 426 files, zero RSS/Atom/XML/feed-JSON publishing artifacts and zero website publishing workflows. Official repository mirrors show the same archive. An author-controlled Markdown archive is useful provenance but is not a working article RSS. The other official publication profile's apparent `/feed` redirects to HTML with zero feed entries; no original-publication migration is verified. No commit/activity feed or unreviewed draft synthesis is substituted for articles.

A reputable web archive holds a fixed original RSS snapshot from 2026-06-24. One actual NAS worker fetch succeeds and parses 80 articles under the existing network/TLS configuration. All 80 original URLs, titles, GUIDs and dates match the 80 stored articles; there are zero missing extra article URLs. Its latest publication is 2025-12-01. This verifies a historical preservation reference, not a live new-publication endpoint. It is retained in the private report and is not silently substituted for the original publishing source.

## Provenance and live verification

- The author's public profile identifies the original blog. Its public non-fork repository is neither archived nor disabled, has a known default branch, and publishes both the canonical-domain file and Atom XML.
- The domain file matches the original publisher. All 20 Atom items have dates and original publisher links; all 20 links overlap the existing stored articles. The latest published item matches the public site index. A maintained branch is used as a rolling publishing endpoint; this does not imply recent new posts.
- The old endpoint freshly returns 403 with CDN challenge metadata. The repository Atom returns 200 with valid XML via the configured NAS path. The actual deployed worker fetch function separately parses the expected publisher and 20 items under its normal network environment.
- An independent evaluator approved provenance, practical worker access, URL uniqueness and the proposed in-place preservation guards before mutation.
- The replacement transaction locks the original Feed row, asserts its original URL/type, requires an existing subscription, checks URL uniqueness and absence of active runs, then changes only the URL and validators. One `manual_admin` task follows through the existing enqueue helper with `backfill_existing_entries=false`.
- The tracked worker run reached `success` / `complete`, no error, ACTIVE/error-count zero. The recovered source still has exactly 20 articles; no duplicate imports were introduced.

## Preservation and rollback

Before-state is restricted on the NAS under `/app/logs/source-address-recovery-20261010`, directory mode 700 and JSON mode 600. It records original source metadata, hashes for 100 old articles across both targets, two subscription hashes and 81 user-state hashes; no prior bookmarks existed. Article fingerprints cover IDs/feed association, URL, title, author, content, summary, GUID and publication timestamp. Subscription/state fingerprints cover all persisted fields.

The root's first after-state check confirms every original article fingerprint, subscription and state unchanged. The unverified source's address/type are retained. Practical rollback restores only the changed source's original URL/type/validators from the restricted record, after confirming no current run; it does not delete new data, change account state, reset queues or roll back stateful services.

Private user-facing evidence contains permitted names and sanitized public addresses, including the verified fixed historical RSS reference and its limits. No personal source inventory, private IDs, tokens or article payloads belong in this public handoff. The bounded second-publisher investigation is complete: no current same-publication replacement is established, the user excluded the parallel channel, and the original address plus 80 old articles remain retained. The independent evaluator's final overall disposition is **ACCEPTED / APPROVE** for the feasible recovery, bounded search and honest external limitation. Restricted before-state, tracking and report evidence remain retained; no temporary container or cloned credential environment was created for this follow-up.
