# NAS reliability and cleanup deployment contract

## Goal

Deploy the cleaned reader to the NAS, prove AI summary features are absent online, and fix the observed translation 502 and RSSHub/feed-fetch failures using reproduced evidence.

## Scope

- Investigate selected translation provider, MTran connectivity, Google rate limits and API handling; preserve explicit user choices and cached translation semantics.
- Investigate RSSHub route/configuration/connectivity and upstream status errors; implement justified reliability fixes with failure-aware retry/circuit behavior, preserving feed-fetch guardrails.
- Use test-first backend changes and independent review. Preserve the six original unstaged reader/deployment-document changes.
- Build isolated application images for the NAS's native x86_64 Docker engine. Use immutable release tags and retain prior application images and deployment configuration for rollback.
- Update only necessary app/dependency services. Preserve PostgreSQL/Redis volumes, credentials, user settings unless a justified repair needs a targeted setting change, and historical database migrations/data.
- Live NAS Alembic head already equals local `94af7ef02eb9`; no schema upgrade is required. Avoid automatic migration/admin-user recreation during this application rollout.
- No raw log export or detailed payload export: inspect diagnostics on the NAS and return only permitted aggregates or targeted sanitized metadata. Document any automatic-review restrictions.

## Done means

- New backend/worker/web/admin image IDs and version markers match the reviewed release.
- Online summary REST paths return 404, worker registration/cron has no summary tasks, and served web/admin bundles have no summary UI/settings/SDK entry points.
- Normal reader/auth/translation flows work. The previously observed Google limit failure is handled deliberately and the configured healthy translation path returns correct translated output.
- RSSHub failures are reproduced, fixed where controlled locally, and verified on representative working/failing routes. External outages/rate limits are reported honestly and do not create uncontrolled retries or erroneous permanent feed disablement.
- Relevant regressions, scheduler/progress reconciliation, frontend checks/builds and live smoke probes pass. Any remaining external-provider limitations are explicit.
- Baseline database/user/feed counts and healthy stateful services remain intact. A practical application rollback path exists.
- Generator handoffs and an independent evaluator assessment record code, deployment and live evidence.

## Risks and evaluator focus

- Provider fallback may amplify rate limits; ensure user-facing retries cannot create a translation request storm.
- RSSHub upstream failures and true RSSHub infrastructure outages need different treatment; do not globally suppress healthy routes due to one blocked source.
- Removal of old task functions must not disturb feed queues or active-run terminalization.
- Docker build contexts must exclude secrets and local dependency/build caches; deployment must use reviewed source instead of user-owned unstaged edits.
- Browser/provider/infra errors cannot be declared fixed from a unit test alone; require live probes and classify external failures.
