# Remaining NAS source repair review

Completed on 2026-10-10. Backend/worker parser release `a6ccf99` and RSSHub release `2441ce2` are deployed on the NAS. Seven controlled source recoveries reached successful terminal worker states; two external publishing/access failures remain in the private authorized source report.

- [Repair contract](./2026-10-10-remaining-source-repair-contract.md)
- [Parser generator handoff](./2026-10-10-remaining-source-parser-handoff.md)
- [RSSHub retry and podcast handoff](./2026-10-10-remaining-rsshub-repair-handoff.md)
- [Verified certificate chain handoff](./2026-10-10-latepost-chain-repair-handoff.md)
- [Deployment evidence and rollback](./2026-10-10-remaining-source-deployment-handoff.md)
- [Independent final assessment](./2026-10-10-remaining-source-evaluation.md)

The final all-account checkpoint contains 255 subscriptions and 223 distinct subscribed sources: 221 active and two error sources. Historical associations, original user edits, stateful service identities, schema and queues are preserved. Live checks cover the diagnosed candidates and deployed RSSHub behavior; these counts do not imply a fresh HTTP probe of every active direct source or permanent freedom from third-party limits.

Personal source names, sanitized addresses and current external failure reasons stay outside the public repository. Protected rollback images, configuration and targeted source before-state records remain on the NAS. Operational guidance is in [source failure triage](../../../operations/source-failure-triage.md) and [RSSHub route repairs](../../../operations/rsshub-route-repairs.md).
