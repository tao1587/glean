# Engineering publication-date research handoff

## Outcome and scope

Read-only route-generator research for the [publication-date contract](2026-10-11-feed-date-and-source-recovery-contract.md). No NAS requests, database/cache/queue mutations, runtime changes or commits were performed. Existing route repairs and the six pre-existing user edits are preserved. Production reproduction and the installed bundle remain with the operator.

The public publisher provides real publication dates. Current official RSSHub source contains an article-header fallback that should resolve the featured article's missing listing date. A producer regression has not yet been reproduced against the installed runtime; an older implementation, cached date-less item or existing database row must be distinguished before a fix.

## Public evidence

On 2026-10-11, the official engineering index and one featured article both returned HTTP 200. The index contained 25 anchors matching current RSSHub's card selector, with 24 matching nonempty listing dates. The featured card had no listing date. Its article provided a visible publication date, a `time` machine-readable date, Open Graph publication time and matching `BlogPosting.datePublished`; `dateModified` was different and must not replace the publication date. These were inspected from public HTML without executing page scripts. [Official index](https://www.anthropic.com/engineering), [featured article](https://www.anthropic.com/engineering/how-we-contain-claude).

Public samples establish the publisher's intended dates, not the identity of the user's four stored articles:

| Official article | Published date |
| --- | --- |
| [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) | 2026-05-25 |
| [An update on recent Claude Code quality reports](https://www.anthropic.com/engineering/april-23-postmortem) | 2026-04-23 |
| [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents) | 2026-04-08 |
| [How we built Claude Code auto mode: a safer way to skip permissions](https://www.anthropic.com/engineering/claude-code-auto-mode) | 2026-03-25 |

## Official implementation and relevant history

The current [Engineering route](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/anthropic/engineering.ts) selects card links and dates, parses the listing text, then caches the complete enriched item by article URL. Its article extraction reads `p[class$="date"]`, removes the publication label and fills `item.pubDate` only when missing. Both current selectors matched the inspected public markup. Canonical links and publication metadata can be retained without changing article identity or content extraction.

- [2025-12-13 page-parsing change](https://github.com/DIYgod/RSSHub/commit/9f09c37c30a47207f1b74a29f39b6ef713d5f3b7) replaced the older article-header date lookup with listing dates alone. Featured cards without a listing date could consequently remain undated.
- [2026-07-27 housekeeping change](https://github.com/DIYgod/RSSHub/commit/a1a21b59de9e75ff0b53b98ba1f2f805c54ee6a1) added date parsing and restored the missing-date article-header fallback. Its title obscures a material date correction; pulling another image is not necessary if the deployed bundle already includes it.

A cache hit returns the previously cached entire item, bypassing the article callback. A previously cached missing date therefore needs specific runtime verification; this is a source-supported candidate explanation, not an observed NAS cache result. A later valid producer date also does not alone repair a Glean row skipped by GUID conflict. The operator must compare XML, parser output, cached item and stored `published_at` independently.

## Next reproduction and repair gates

1. Identify the affected public canonical article URLs from the protected baseline and verify their actual publication metadata, separately from modification/ingestion dates.
2. Inspect the installed compiled Engineering handler for the article-header fallback and original imported date helper. Replay that whole handler against the exact relevant public markup with fresh cache and a date-less cache-hit fixture.
3. Only after a failing case is established, implement the narrow supported date correction. Preserve links/GUIDs, content, non-null dates, cache/proxy behavior and prior route repairs. Meaningful fixtures must cover featured cards, machine-readable publication dates versus different modification dates, a date-less cached item, invalid/missing dates and preservation of an existing date.
4. Verify the actual candidate image's default feed and producer dates, then separately validate the minimal existing-row repair and date-filtered API inclusion. Keep private inventories and fingerprints on the NAS.

## Verification and review focus

Public source/history reads and an HTML selector inspection were completed; no provider write APIs or NAS were contacted. Repository documentation validation and whitespace verification are recorded in the generator report. The evaluator should verify the precise installed implementation and cache behavior before approving any producer patch; current public HTML alone supports no claim of a reproduced current route bug.
