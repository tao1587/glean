# Source address research handoff

## Scope and privacy

This generator performed bounded public provenance research under the [source address recovery contract](./2026-10-10-source-address-recovery-contract.md). It made no NAS requests, source changes or application-code changes. Author names, account identifiers, subscribed-source URLs, title samples and private reader inventories remain outside this public repository artifact.

## Methods and evidence

1. Check the original publisher endpoint and author-controlled account/repository metadata before treating a directory entry as a current address. Legacy endpoints and their publishing account/repository were unavailable; third-party directories still advertised the old address and did not establish a migration.
2. Follow author-controlled profile links to an official homepage, and inspect the homepage's explicit channel descriptions. The author distinguished a personal channel from a parallel research channel. A valid 14-item feed for the other channel was excluded after the user chose to retain the original personal subscription. Same-author ownership alone does not prove that a feed represents the requested channel.
3. Inspect author-owned repository README, article frontmatter and published-feed artifacts. Three author-linked code-host mirrors contained a 55-file personal-writing archive, including a supplied old title/date identity sample, but no published RSS/Atom/OPML artifact or feed-publishing workflow. These are article archives, not article feeds. No draft-derived or commit-activity feed was invented.
4. Inspect a linked publishing-platform profile and its exposed publication endpoint, feed and About page. The candidate feed returned HTTP 200 after redirecting to an account HTML page; the parser found no RSS/Atom version and no entries. HTTP 200 alone is insufficient evidence of a usable feed, and the profile did not establish a personal-blog migration.
5. Query the official web-archive availability API once, then retrieve exactly its reported historical RSS snapshot. The returned body was HTTP 200, `application/xml`, valid RSS 2.0 with 80 items. All three supplied historical identity samples were present, and their checked links/GUIDs retained the original publisher origin. This verified the reported historical feed/sample correspondence without synthesizing posts; all 80 article identities were not independently compared.

## Disposition and limits

- A fixed-date archive snapshot is distinct from a current publisher feed. It can support historical preservation or a one-time completeness comparison; it cannot promise future author updates and was not installed as the active source address.
- No currently available equivalent personal-blog RSS migration was established within the bounded search. The user's preference is to keep the original subscription and existing history, so the parallel channel, social timeline and commit feeds were not substituted.
- Root owns the separate verified publisher-address repair, any NAS preservation/runtime checks and the private user-facing report. This generator preserved the six original local edits and performed no database, queue or production mutations.

## Verification and reviewer focus

Public endpoints were checked with normal HTTPS verification, bounded timeouts and conservative request counts. No challenge bypass, broad source refresh or unbounded archive crawl was used. Verify the distinction among publisher ownership, channel continuity, valid XML, archival availability and future update capability. Actual source-address changes require root's positive worker verification and association-preservation checks; research success alone does not authorize treating another channel or a historical archive as the current feed.

Repository docs validation and `git diff --check` passed. Independent evaluation accepted the historical snapshot only within the reported 80-item and three-sample limits; all 80 article identities were not independently compared by this generator. No live address change is claimed from the archive probe.
