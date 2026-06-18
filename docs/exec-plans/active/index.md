# Active Plans

This directory is reserved for in-flight agent-first execution plans (contract / handoff / evaluation triads).

## Active

- [Daily & Weekly Summary](../../superpowers/plans/2026-06-13-daily-weekly-summary.md) — replaces per-article supplement flow with a single daily LLM call over raw articles + weekly reduce. Cron-driven, always-on card at the top of Today Board.

## Superseded (historical, do not follow)

The per-article supplement plans below were superseded by the daily/weekly summary design (2026-06-12) and the corresponding implementation (Tasks 1–17). The `AIEntrySupplement` table and all related backend/frontend code were removed.

- `2026-04-28-ai-entry-supplement-per-article.md`
- `2026-04-28-ai-entry-supplement-synthesis.md`

Source spec (historical): [`docs/product/2026-04-28-ai-entry-supplement-design.md`](../../product/2026-04-28-ai-entry-supplement-design.md).
Current spec: [`docs/superpowers/specs/2026-06-12-daily-weekly-summary-design.md`](../../superpowers/specs/2026-06-12-daily-weekly-summary-design.md).

Completed plans are not retained; the code is the source of truth once work lands. Historical context for past changes lives in [`../../product/feature-change-log.md`](../../product/feature-change-log.md).
