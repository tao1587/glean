# Daily & Weekly Summary — Design

**Date:** 2026-06-12
**Status:** Approved (pending implementation plan)
**Area:** Today Board AI digest (`frontend/apps/web/src/pages/reader/shared`, `backend` today-AI stack)

## Problem

The current Today Board AI experience is a two-stage map→reduce:

- **Map** — `TodayBoardDigest` renders one AI summary *per article* (TL;DR, key
  points, tags, priority). Generation is lazy and scroll-driven
  (`useEntrySupplements`): each article is summarized only as it scrolls into
  view. Backed by `AIEntrySupplement` rows.
- **Reduce** — `TodayBoardSynthesisPanel` ("今日综述") builds a daily synthesis
  **by reducing over the per-article summaries**, and explicitly requires the
  user to "read at least one article first" before it can run.

Two problems:

1. **Bad interaction.** To get any AI value the user must switch into the AI
   view and scroll each article into view to trigger its summary one by one.
2. **The per-article stage is also the expensive one.** It feeds up to 6000
   chars × N articles/day to the LLM (~¥12–25/month at N≈50–100), while the
   daily synthesis it feeds is comparatively trivial.

## Goal

Replace per-article summaries with **directly generated daily and weekly
summaries**, produced automatically in the background, surfaced through
always-present entry points — no manual per-article generation.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Per-article summaries | **Removed** entirely (UI + backend + table) |
| Daily source | Raw article content: title + **~1500 chars** body per article, **one** LLM call/day |
| Weekly source | Aggregate (reduce over) the week's **daily** summaries |
| Week period | **Natural week, Mon–Sun**; rolling "本周至今", seals Sunday midnight |
| Generation timing | **Background scheduled** (arq cron), multi-run/day with hash dedup |
| Daily entry point | **Always-present card** pinned at top of Today Board list, follows the date selector |
| Weekly entry point | **Conditional** "本周综述" link on the daily card — shown only when this week has ≥1 daily |
| Sparkles AI-view toggle | **Removed** (daily card is always-on; no separate AI view) |
| Weekly storage | **Reuse `AIDailySummary`** + a `period` discriminator (no new table) |

## Cost estimate

Token model: ~3 chars/token (input), DeepSeek standard pricing as a
conservative upper bound (input ~$0.27/M, output ~$1.10/M; `deepseek-v4-flash`
is likely cheaper — confirm against the live billing page).

- Daily (A-加强, ~1500 chars/article): ~¥0.03–0.11/day depending on N=20–100.
- Weekly (reduce over 7 dailies): ~¥0.03/week.
- **Total daily+weekly ≈ ¥2–3/month** at N≈50–100/day, down from ¥12–25/month
  for the removed per-article stage.

Cost is not the constraint; this redesign is both cheaper and better UX.

## What gets removed

**Frontend**

- `TodayBoardDigest.tsx`
- `hooks/useEntrySupplements.ts`
- `hooks/useEntrySupplementVisibility.ts`
- The `isAISummaryView` branch and the Sparkles list/summary view toggle in
  `TodayBoard.tsx` (and `aiView`/`onAIViewChange` plumbing through
  `useReaderController` / callers).
- Per-article supplement client methods in `@glean/api-client`
  (`summarize`, `lookupSupplements`, `retryEntry`).

**Backend**

- Endpoints in `routers/today_ai.py`: `entries:summarize`,
  `entries/supplements:lookup`, `entries/{id}:retry`.
- `AISupplementService` (`services/ai_supplement_service.py`).
- `summarize_entry_task` worker task.
- `AIEntrySupplement` model — dropped via Alembic migration.
- `ENTRY_SUMMARY_PROMPT_VERSION` / `build_entry_summary_messages` and the
  per-article prompt in `services/llm/prompts.py`.
- `today_ai` schemas tied to supplements (`SummarizeRequest/Response`,
  `SupplementsLookupRequest`, `SupplementView`).
- Config: `allow_today_summarize` removed; daily/weekly gated by
  `allow_today_synthesis` + `llm_synthesis_enabled`.

## What gets built / changed

### Data model — `AIDailySummary` (repurposed)

Add a period discriminator so one table holds both daily and weekly rows:

- `period`: `"day" | "week"` (default `"day"`).
- `period_start` / `period_end` (date): for `day`, both = the date; for
  `week`, Monday/Sunday of the natural week.
- `source_ids`: replaces `source_supplement_ids`. For a daily row it holds the
  day's **entry ids**; for a weekly row it holds the contributing **daily
  summary ids**.
- `source_set_hash`: `sha256(sorted(source_ids))` — unchanged mechanism, new
  inputs. Different article/daily sets ⇒ different hash ⇒ regenerate.
- Cache key tuple stays `(user, period, period_start, tz, model,
  prompt_version, target_language, source_set_hash)`.

Kept rich fields: `title`, `summary` (narrative), `topics` (clusters with
`entry_ids`), `highlights`, `recommended_entry_ids`, `model`, `generated_at`,
`status`, `error_code/message`, `attempt_count`.

### Service — daily generation (`AISummaryService`, evolved from `AISynthesisService`)

- `list_day_entries(user, date)` — entries collected on the local day (reuse
  `AIIntegrationService.get_server_day_range`).
- Build LLM input per entry: `title` + HTML-stripped body truncated to
  `LLM_MAX_INPUT_CHARS_DAILY` (new setting, default 1500).
- New prompt `build_daily_summary_messages(items, target_language)` producing
  the same JSON shape the reduce stage already emits
  (`title/summary/topics/highlights/recommended_entry_ids`); bump a new
  `DAILY_SUMMARY_PROMPT_VERSION`.
- `enqueue(user, date)` reserves a placeholder row + enqueues
  `summarize_day_task`. **No "read one first" precondition.** If the day has no
  entries, return a `no_entries` status (UI shows empty state, no spend).
- Idempotency via `source_set_hash`: if a `done` row already matches the
  current hash, skip (no spend).

### Service — weekly generation

- `enqueue_week(user, week_start)` collects the week's `done` daily rows,
  hashes their ids, reserves/refreshes the weekly row, enqueues
  `summarize_week_task`.
- `summarize_week_task` reduces over the daily rows' `title/summary/topics`
  (cheap) into the same JSON shape; `DAILY_SUMMARY_PROMPT_VERSION` reused or a
  sibling `WEEKLY_SUMMARY_PROMPT_VERSION`.
- Rolling: regenerated whenever a contributing daily completes (see
  scheduling); hash dedup prevents repeat spend.

### Scheduling (arq)

- **Daily cron** (e.g., every 3h): iterate users with AI enabled; enqueue
  `summarize_day_task` for "today" (local). Hash dedup → no-op when the day's
  article set is unchanged. A post-midnight run seals the previous day.
- **Weekly trigger**: when `summarize_day_task` produces a *new* daily result,
  chain-enqueue `summarize_week_task` for that day's week. A once-daily safety
  cron backstops missed chains.
- Cadence values are config-tunable; defaults chosen so an idle day costs
  nothing (hash dedup) and an active day refreshes a few times.

### API (`routers/today_ai.py`)

Replace the supplement + synthesis endpoints with period-aware summary
endpoints:

- `POST /api/today/ai/summary:lookup` — body `{ period, date }`; returns the
  cached summary (if any) + `current_set_hash` + `is_stale`
  (`current_done_count`-style freshness for daily).
- `POST /api/today/ai/summary:generate` — on-demand generation for a given
  `{ period, date }` (used by the historical-date "生成综述" button); normal
  flow relies on the scheduler.
- `POST /api/today/ai/summary:retry` — retry a failed row.

Weekly lookup returns `null` when the week has no daily yet (drives the
conditional entry point).

### Frontend

- **`useDailySummary({ date })`** — lookup + poll while `pending/processing`;
  exposes `generate()` (for historical on-demand) and `retry()`.
  **`useWeeklySummary({ weekStart, enabled })`** — same shape; `enabled` gated
  on the daily card knowing a weekly exists.
- **`SummaryCard`** — shared presentational component rendering
  `title / summary / topics / recommended` with clickable entries
  (`onSelectEntry`). Used for both daily (pinned) and weekly (expanded/popover).
  Footer: "自动生成 · {generated_at}". Stale hint: "有 N 篇新增,综述更新中".
- **Daily placement** — render `SummaryCard` (daily) above `TodayBoardEntries`,
  bound to the selected date. For a past date with no cached summary but with
  articles, show a one-click "生成综述" button (calls `generate()`).
- **Weekly placement** — a "本周综述" link in the daily card's top-right,
  rendered only when `useWeeklySummary` reports an existing row; click toggles
  an expanded `SummaryCard` (weekly) / popover.

## Component boundaries

- `AISummaryService` (backend) — owns period-aware lookup/enqueue/hash; no HTTP
  or LLM-call concerns leak in.
- `summarize_day_task` / `summarize_week_task` (worker) — own the LLM call +
  row finalization; idempotent on `source_set_hash`.
- `SummaryCard` (frontend) — pure presentation; no data fetching.
- `useDailySummary` / `useWeeklySummary` — own fetch/poll/generate lifecycle;
  return data + actions only.

## Error handling

- LLM failure → row `status=failed` with `error_code`; card shows a retry
  affordance (manual `retry()`), scheduler also retries on next run.
- No entries for a day → `no_entries`; card shows empty state, no spend.
- Lookup/poll transient errors → keep last state, retry on next poll tick.
- Hash mismatch mid-generation → next scheduled run regenerates against the new
  set.

## Testing

- **Backend unit** — hash stability/ordering; daily enqueue idempotency (same
  hash = no new job); weekly aggregation over daily rows; `no_entries` path;
  period discriminator round-trips.
- **Backend integration** — `summary:lookup/generate/retry` for both periods;
  conditional weekly null; migration drops `AIEntrySupplement` cleanly.
- **Worker** — `summarize_day_task` truncates to `LLM_MAX_INPUT_CHARS_DAILY`;
  weekly chain enqueued only on a *new* daily result.
- **Frontend** — `SummaryCard` rendering of all states (loading/done/failed/
  empty/stale); conditional weekly entry visibility; historical on-demand
  generate; removal of the Sparkles toggle does not break list view.

## Migration / rollout

- Alembic: add `period`/`period_start`/`period_end`, rename
  `source_supplement_ids`→`source_ids`; drop `AIEntrySupplement`.
- Existing `AIDailySummary` rows (old supplement-based syntheses) are stale
  under the new `prompt_version`/hash and will be regenerated by the scheduler;
  no data backfill required.
- Removing per-article endpoints is a breaking client change — ship frontend
  and backend together.

## Out of scope

- Per-feed or per-topic summaries.
- User-configurable schedule UI (cadence stays config/env).
- Email/push delivery of summaries.
- Re-reading full week raw articles for weekly (explicitly rejected on cost).
