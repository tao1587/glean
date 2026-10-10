# Reader cleanup sprint contract

## Goal

Update the repository links, remove the AI summary workflow, integrate the GitHub MTran request-size fix, and document the actual API surface.

## Scope

- Update both README files from `GoToBoy/glean` to the current `tao1587/glean` repository, including raw download and clone URLs.
- Remove the AI summary UI, API routes, admin/user controls, dedicated worker tasks and cron registration, summary-only services, schemas, client SDK methods, and runtime configuration.
- Preserve historical database migrations and stored summary data. Do not drop tables or run database migrations as part of this cleanup.
- Preserve translation providers (including OpenAI and MTran), discovery, embeddings, and the current week/month reading behavior.
- Integrate the MTran payload sizing and oversized-text splitting from GitHub `personal-main` commit `8a54c34a333d74db6f1f7be092674edf5081632d`, without copying unrelated upstream changes.
- Audit registered HTTP/MCP routes, authentication requirements, and documentation availability; add an API reference and retire stale AI API instructions.
- Preserve the six pre-existing modified files and their user changes. Do not configure a Git remote, publish, or deploy.

## Done means

- No live summary routes, tasks, cron jobs, UI controls, or summary-only runtime configuration remain.
- Existing summary URLs return 404; normal application imports and API schema generation succeed.
- Actual MTran request bodies fit the configured byte limit, including UTF-8 and JSON escaping. Oversized single inputs are split without losing text, language resolution, or batch ordering.
- Relevant backend regression tests pass; frontend tests/build/type checks verify the removed summary dependencies do not break reader/settings flows.
- README links and current API documentation match the implementation. Documentation distinguishes configured application routes from externally reachable services.
- A generator handoff and an independent evaluator assessment record commands, results, and any verification limits.

## Risks

- Summary config and types cross backend, web, admin, and shared SDK boundaries.
- Historical AI tables/migrations remain inert for compatibility; their presence must not be mistaken for an enabled pipeline.
- MCP has its own OAuth/API-token authentication and must be included separately from the REST OpenAPI schema.
- Local dependency availability may limit verification; record exact failures rather than claiming checks passed.

## Evaluator focus

- Verify route/worker/UI removal independently, including admin and system endpoints.
- Verify translation and existing week/month changes survive the cleanup.
- Review MTran byte-limit boundary cases and fallback paths.
- Check the API reference against registered routes and authentication code.
