# Latest RSS and fetch audit handoff

## Scope

Read-only generator investigation under the [latest NAS log audit contract](./2026-10-10-latest-nas-log-audit-contract.md). Main snapshot coverage is 14:00–21:56:46 UTC on 2026-10-10, with a separately labeled RSSHub delta through 22:04:30 UTC and three bounded current route probes. Raw logs, request/source identifiers, voucher values and exact private source findings remain outside this public repository artifact.

## Findings

- Four actual worker `Failed to fetch feed` ERROR headers appeared at 16:05:05, 16:20:37, 16:51:19 and 17:52:00 UTC, all referencing one provider URL with HTTP 522. Repeated traceback/source text caused larger coarse failure/status counts; those counts are not HTTP request totals.
- That feed currently has zero subscriptions, is active with zero errors, and its latest tracked run was created at 16:00:10 UTC under the midnight scheduler. It later completed as `not_modified` at 18:52:02 UTC. Historical failure events are retained in this report rather than erased by the final success. The tracebacks do not provide exact run/job identifiers, so same-feed temporal correspondence is not presented as direct proof that all four events belong to the same job.
- Three RSSHub upstream episode-detail request failures occurred at 15:46:50, 19:07:22 and 21:06:26 UTC. Their `TypeError: fetch failed` cause is `ECONNRESET`, rather than a reproduced parser/numeric-length defect. The main snapshot did not contain a final route-error message for these attempts. Historical caller/response success is not inferred solely from old successful database rows.
- Exactly one normal XML probe was performed for each associated podcast source. At 22:01:15 and 22:04:00/02 UTC they returned HTTP 200 with 15, 15 and 14 valid entries and corresponding nonempty bodies. The latter two also had dates for every entry. No cache bypass, detail-only probe or refresh job was used. These checks establish current availability at their timestamps, not permanent removal of upstream resets.
- The delta contains two additional ERROR metadata records at 22:00:03 and 22:01:02 UTC. They contain the video platform's risk-voucher field with nearby business code `-352`; voucher values were never exported. These are distinct from the earlier episode transport resets and from HTTP 429.
- Delta access metadata shows two video-route requests, followed by a different dynamic-route HTTP 200. The video module already attempts browser fallback after its API fails. No video-response completion appears in this finite delta, so the dynamic response is not claimed as video-route recovery. The logs do not establish whether those calls came from a diagnostic or a normal scheduled client.

## Repair decision and limits

No new parser/transport regression was reproduced in this generator's scoped investigation. No code, source identity, scheduler policy, queue, feed error state or NAS production service was changed by this generator. The existing all-active scheduler can poll feeds with no subscribers; any separately approved scheduling-policy repair is owned and verified by its implementation handoff rather than inferred from this read-only investigation.

The absence of a newly logged failed HTTP 429 within the inspected windows does not prove that every upstream rate limit has disappeared. Successful overview fallback may avoid a terminal failure without a separate counter. The video-platform risk metadata demonstrates that provider-side verification restrictions still occur. Preserve normal TLS checks, current source decisions and existing retry/fallback behavior; do not bypass verification or invent recovery from another route's success.

## Independent verification artifacts

Restricted temporary helpers preserve exact read-only on-NAS event classification, source/run correspondence and delta parsing for independent review. Restricted local evidence contains only permitted names, clean source addresses, timestamps, classifications and bounded probe results. Raw logs and private identifiers remain on the NAS. The delta replay-output save was not executed because automatic approval review exceeded its deadline; its already completed classification observations are preserved separately and the read-only helper remains available for the evaluator to replay.

Repository docs validation and `git diff --check` passed. Root owns translation/state investigations, any separately scoped scheduler implementation, the complete private user report and the final independent assessment.
