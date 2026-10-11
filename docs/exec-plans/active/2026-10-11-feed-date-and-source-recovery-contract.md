# Feed publication-date and source recovery contract

## Requested outcomes

Investigate and correct missing publication dates in the engineering publication feed, including verified existing articles so date-filtered reading can retrieve them. Verify the four named missing publications before subscribing them for the existing active account. Recover obsolete subscriptions using confirmed current addresses for the same publication. Investigate the short-content source and obtain real full text where publicly available; do not treat a short teaser or a marketing page as factual article content.

The user's referenced replacement addresses are absent from this message. An asynchronous question requests exact links while independent engineering/date investigation continues. Do not select an ambiguous publisher, unrelated publication, paywall bypass or invented replacement. Research verified official addresses where identification is unambiguous.

The user subsequently instructs root to find current addresses independently and remove subscriptions that no longer update. Use a conservative six-month threshold plus official-publication corroboration before removal; a transient fetch failure, empty RSS or an outdated delivery channel alone is insufficient. Remove only the current active account's subscription when justified. Preserve the shared Feed and all old Entry/read-state/bookmark rows even if no subscriber remains; do not invoke an orphan-cascade deletion as an unsubscribe shortcut. Other accounts' subscriptions remain intact. Capture exact removed association fields privately for recovery.

## Confirmed additional producer gaps

The weekly publication is current, but its advertised general-blog RSS contains zero weekly entries; subscribing that unrelated collection would not provide the requested fallback. The daily publication's advertised RSS currently returns zero entries despite a public recent edition. If existing safe methods cannot express these publications, a narrowly fixed-publisher recipe may be added to the existing HTML-transform route. It must accept only exact known publisher URL/recipe pairs, restrict child article URLs to that publisher's publication path, bound requests/concurrency, require real titles/content/publication or edition dates and leave the generic arbitrary-domain gate unchanged. All other requests delegate unchanged; never enable global unsafe-domain access for these two feeds. Retain existing daily Feed/GUIDs and use the verified fixed recipe for the new weekly subscription.

The local batch-publication route also reproducibly parses an absent legacy Next.js data script. A weekly-only adapter may read the current official main issue list and article data, retain its `the-batch-{slug}` GUID format and default limit, exclude popular/recommendation sidebar cards and leave tag routes unchanged. Do not treat this parser failure as publisher inactivity. The podcast publication remains active on its officially identified video series, so the obsolete audio channel must not be mistaken for whole-programme inactivity.

## Preservation and evidence

- Inspect the actual NAS RSSHub route, parsed feed dates, stored article dates and supported date-filter consumer behavior before proposing changes.
- Keep existing Feed, Entry, Subscription, folder, reading-state and bookmark identities/associations. Preserve all existing non-null publication dates and old content, except a narrowly verified explicit full-text repair. No delete/recreate, wholesale reassociation, queue reset or full-source fetch wave.
- A corrected producer cannot alone repair rows skipped by GUID conflict. Define and test any necessary missing-date update separately; use the publisher's real publication date, never current time, ingestion time or an unrelated modification date.
- Verify source identity, XML/nonempty content, dates, canonical URLs/GUID overlap and account ownership before adding or changing a subscription. Keep paywalled content limits explicit.
- Keep private source inventories, credentials, raw payloads and row fingerprints in restricted on-NAS evidence. Public review artifacts contain aggregate findings and public source references only.

## Workflow and completion

Root plans, controls bounded NAS requests/account mutations and any deployment, and owns protected baseline/rollback. The route generator researches/reproduces missing metadata, writes meaningful failing tests and implements the smallest supported correction. A source research generator verifies official identities/addresses/content limits without NAS mutations. An independent evaluator verifies producer/consumer behavior, preservation, runtime and contract compliance before completion.

Runtime code must pass relevant tests before committing/building. Preserve existing RSSHub research/podcast/CA/CDP repairs, parser, scheduling, retry/circuit and inactive-account rules. Use isolated canaries with the actual candidate image/normal transport before rollout, then bounded tracked refreshes and date-filter API verification. Preserve the six pre-existing local edits and unrelated active plans. Stop only the task's owned temporary services after acceptance and retain rollback/evidence.

References: [feed fetch flow](../../architecture/feed-fetch-flow.md), [feed guardrails](../../operations/feed-fetch-guardrails.md), [route operations](../../operations/rsshub-route-repairs.md), [agent workflow](../../agent-workflows/default-loop.md).
