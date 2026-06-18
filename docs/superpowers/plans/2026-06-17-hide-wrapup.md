# Hide Feature Wrap-up — Implementation Plan (Plan 3)

> Closes the spec's open questions for the hide feature (undo lifetime + a restore access point). Frontend-only — the backend `is_hidden` filter already exists.

**Goal:** Make hiding non-permanent and uncluttered: the inline "已隐藏 · 撤销" line **auto-dismisses after ~6s** (the entry stays hidden — only the undo affordance expires), and each source gains a lazy **「隐藏的」** box to **view + 恢复** its hidden items.

**Architecture:** `useHiddenUndo.add` schedules a timeout that removes the entry from the undo map (line disappears; the entry remains hidden because the API already excludes `is_hidden=true` and the range query was invalidated on hide). A new `useRangeHiddenEntries` hook fetches `is_hidden=true` entries per feed/period; `SourceSection` renders a "隐藏的" toggle mirroring "看过的", with a 恢复 action that flips `is_hidden=false`. `useUpdateEntryState` also invalidates `['range-hidden-entries']`.

**Tech Stack:** React/TS/TanStack Query/vitest.

---

## Task 1 — Undo line auto-dismiss (TDD)
- `frontend/apps/web/src/pages/reader/shared/components/PeriodView/useHiddenUndo.ts` — add a 6s timeout in `add` that calls `remove`; `remove` clears any pending timer; clear all timers on unmount. The entry stays hidden (this only governs the undo LINE).
- Test (`__tests__/pages/reader/useHiddenUndo.test.ts`, fake timers): after `add`, entry present; after `advanceTimersByTime(6000)`, absent; `remove` clears immediately.

## Task 2 — `useRangeHiddenEntries` hook
- `frontend/apps/web/src/hooks/useRangeEntries.ts` — add `useRangeHiddenEntries(feedId, { period, anchorDate }, enabled)` mirroring `useRangeReadEntries` but with `is_hidden: true` and NO `is_read` filter; map via `buildTodayBoardEntries(..., { filterBySelectedDate: false })`. Query key `['range-hidden-entries', feedId, period, anchorDate]`.

## Task 3 — `「隐藏的」` box + restore
- `frontend/apps/web/src/pages/reader/shared/components/PeriodView/SourceSection.tsx` — add an `onRestore: (e) => void` prop and a lazy "隐藏的" toggle (next to "看过的"); on open, `useRangeHiddenEntries`; render each hidden entry as a compact row (title + `恢复` button → `onRestore`); empty → "没有隐藏的内容".
- `frontend/apps/web/src/pages/reader/shared/components/PeriodView/index.tsx` — add `restore = (e) => update.mutate({ entryId: e.id, data: { is_hidden: false } })`; pass `onRestore={restore}` to `SourceSection`.
- `frontend/apps/web/src/hooks/useEntries.ts` — in `useUpdateEntryState().onSuccess`, also `invalidateQueries({ queryKey: ['range-hidden-entries'] })`.
- Test (`__tests__/pages/reader/SourceSectionRestore.test.tsx`, mock `@/hooks/useRangeEntries`): open "隐藏的", click `恢复` → `onRestore` called with the entry.

## Self-Review
- Undo line expires without un-hiding (Task 1); hidden items remain reachable + restorable (Tasks 2–3); restore returns the entry to the unread flow via cache invalidation. No backend change. Types consistent: `useRangeHiddenEntries` mirrors `useRangeReadEntries`; `onRestore` threaded PeriodView → SourceSection.
