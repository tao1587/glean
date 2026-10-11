# Bilibili video reliability review

Completed on 2026-10-10 PDT; runtime checks occurred on 2026-10-11 UTC. Independent final assessment is ACCEPTED. The original video Feed/URL/type and all historical article/subscription/read-state associations are retained.

- [Contract](./2026-10-10-bilibili-video-reliability-contract.md)
- [Official-source research](./2026-10-10-bilibili-video-research-handoff.md)
- [Configuration and behavior evidence](./2026-10-10-bilibili-video-implementation-handoff.md)
- [Actual deployment and preservation](./2026-10-10-bilibili-video-deployment-handoff.md)
- [Independent assessment](./2026-10-10-bilibili-video-reliability-evaluation.md)

The unchanged RSSHub image now selects the correct CDP connection and a scoped 90-second session duration. The shared Browserless default, credentials, proxy and other environment values are unchanged. No route/parser/GUID/dependency change, alternate-publication substitution or data migration is introduced.

Two ordinary samples separated by normal cache expiry return 30 existing videos each; a separately labeled native-failure fixture triggers a real browser response with 40 matching videos and verified proxy socket/session cleanup. Actual production maintenance succeeds on the primary video URL with 40 items and zero new articles. Every old field of 78 article rows, one subscription and six reading states is preserved; other component identities and schema remain unchanged.

Provider restrictions remain visible: two native `-352` warnings, one browser business `-403` and an initial HTTP 503 occur during that production job, followed by 200 under the existing bounded retry. Four actual RSS ERROR headers are retained in the evidence. Successful task completion does not imply all upstream attempts succeeded or permanent provider availability. Private identifiers, credentials, responses and raw logs remain outside Git.

Root removed the owned canary/environment clone after acceptance and retained protected audit/rollback material. Original six local user edits and unrelated active work remain untouched. Configuration guidance is in [RSSHub route repairs](../../../operations/rsshub-route-repairs.md).
