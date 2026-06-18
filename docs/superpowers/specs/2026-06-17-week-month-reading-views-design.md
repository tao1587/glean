# Week & Month Reading Views — Design

**Date:** 2026-06-17
**Status:** Draft (pending user review)
**Revised:** 2026-06-17 — added an optional, non-destructive preference **sort** to v1.
**Superseded (2026-06-17):** the `按兴趣` sort shipped as a **transparent per-source affinity** ranking (`reads + saves − hides` per feed) with **no embeddings/vectors and no new tables** — the embedding-similarity design described under "Sort & preference scoring" below is superseded (the embedding subsystem was found dormant: no ORM models, 0 rows). See plan [`2026-06-17-preference-sort.md`](../plans/2026-06-17-preference-sort.md).
**Area:** Reader views — `frontend/apps/web/src/pages/reader/shared` (reuses `DigestView`, `TodayBoard` components and `todayBoard.ts` helpers); backend entry list, a new per-entry "hidden" state, and a transparent source-affinity sort.

## Overview

The reader's homepage today is a **per-day** surface (the digest-today view). Its
limitation is structural: to look at anything other than today you step **one day at
a time**, so catching up across several days means repeated switching — and good
articles quietly slip past in the gaps.

The need this addresses is **not** clearing a backlog and **not** a productivity
metric. It is a *safety net so genuinely good content isn't missed*. That framing
drives every decision below:

- **Ranking may use models; filtering may not.** This is the core safety line. A
  preference **score** (built from your own read / save / hide signals) may
  **reorder** entries — that is non-destructive, so an imperfect score only changes
  *order*, it never hides anything. **Hiding/filtering stays manual and explicit.**
  Inaccuracy can therefore never block your reading.
- **No pressure metrics.** Unread counts and progress bars reframe reading as a KPI
  ("38 unread, go clear them") and create false achievement and anxiety. They are
  deliberately absent.
- **Show everything unread.** A week/month view lays out **all** unread entries and
  you scroll. Nothing is hidden behind "show more", pagination clicks, or a collapsed
  "+N sources" row. Sorting changes order, never membership.
- **You prune the noise.** A one-tap **Hide** removes an item you don't care about
  (the canonical example: a Claude News feed is useful, but its "we're opening a
  Dublin office" post is not). What remains, over time, is what you actually want.
- **Reading is the interest signal.** Opening and reading an entry is the positive
  signal: read items **sink** into a per-source "看过的" box, *and* reads/saves feed
  the preference score. There is no separate "interested" button.

Week and month are the **same view** at two date ranges. The existing daily view is
left unchanged; week/month are two new options on a `日 / 周 / 月` toggle.

## Goals

- Add **Week** and **Month** views beside the existing daily homepage, via a
  `日 / 周 / 月` toggle plus a prev/next period stepper.
- **Source-grouped card layout**: entries grouped by subscription source; each card =
  title, its **own summary excerpt** (the feed's description text, not AI), timestamp,
  and two actions — **Hide** and **Save**.
- **One-tap Hide** (not-interested) with **undo**, persisted per entry.
- **All unread visible by scrolling**; read items folded away per source; **no counts**.
- An **optional, non-destructive `按兴趣` sort** driven by your read / save / hide
  signals. Default sort is **time**; `按兴趣` only reorders and is always one tap from
  reverting — it never hides or filters.

## Non-goals (explicitly out)

- AI/LLM **summarization or topic clustering** in these views.
- Using **any model output to hide, filter, or remove** content. Models may only
  **reorder** (sort), never subtract.
- "Learning" from hides to **auto-hide** similar items. Hides may inform **ranking**,
  never **hiding**.
- Unread counts, progress indicators, or achievement/streak framing.
- Per-source capping or click-to-expand to reveal unread entries.
- Any change to the existing daily (digest-today) homepage behavior.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Views added | **Week** and **Month**, sharing one component; **Day** = current digest-today homepage, **unchanged** |
| Navigation | `日 / 周 / 月` segmented toggle + prev/next period stepper |
| Primary grouping | **By subscription source** (not by day); each entry card shows its own date |
| Entry card | Title + **own summary excerpt** (feed description, 2-line clamp) + timestamp + Hide + Save |
| Unread display | **All unread shown**, scrollable; no capping, no "show more", no pagination clicks |
| Counts / metrics | **None** — no unread counts, no progress, no read-count labels |
| Read items | Sink into a per-source **"看过的"** collapsed box (no number); expandable to revisit |
| Hide (not-interested) | **Hide this one entry**, **undoable**; one-off, **no learning / no cascade** for hiding |
| Save | Reuse existing **`read_later`** |
| Interested signal | **Reading** the entry (reuse auto-mark-read); no button; reading also feeds the score |
| **Sort** | Non-destructive control: **时间 (default)** ↔ **按兴趣**; sort **never hides/filters**, always revertible |
| **Preference score** | `similarity(entry embedding, per-user preference vector)`; revives a **minimal** version of the removed M3 infra, used **for sort only** |
| **Signals → score** | read + saved = **positive**; hidden = **negative** |
| **Cold start** | `按兴趣` degrades gracefully to time / source-affinity; `时间` is default so an empty model never blocks the view |
| **M3 revival risk** | Prior preference system was built then removed; per decision we do **not** root-cause that first — accepted risk, contained by the sort-only + revertible framing |
| Month density | Same view; **all unread laid out**; density managed by read-sink + hide (+ optional sort) |

## Entry point & navigation

- A `日 / 周 / 月` segmented control in the view header.
  - **日** → the current digest-today homepage, behavior untouched.
  - **周 / 月** → the new aggregated view at week / month range.
- Prev/next stepper moves the anchor by one week / one month.
- URL state follows `useReaderController` (`?view=` + anchor `?date=`); add
  `view=week` / `view=month` (and optionally a `sort=` param). Reuse week-start (Mon)
  and range helpers in `todayBoard.ts`.

## View structure (week & month, one component)

- **Masthead** — period label (e.g. "本周") + date range; the `日/周/月` toggle;
  prev/next; the **sort control** (`时间` / `按兴趣`). **No counts.**
- **Body** — one section per source, in the active sort order:
  - **Source header**: favicon/initial + source name (no count).
  - **Card grid** of that source's **unread** entries. Card = title, summary excerpt
    (2-line clamp), timestamp (`M/D HH:mm`), and actions **Hide** (`eye-off` icon —
    deliberately not a thumbs-down; it removes from view, it does not "rate") and
    **Save** (bookmark → `read_later`).
  - **"看过的"** collapsed toggle (no number) holding that source's read entries.
- **All sources are rendered in the scroll** — there is no "+N more sources" collapse.
- **Hidden entries** leave the grid and are replaced by a single undoable line
  ("已隐藏 ·「title」· 撤销"); the hidden state persists across reloads.

## Sort & preference scoring (v1)

- **The sort control is non-destructive.** It only reorders; it never hides or
  filters. Because `时间` is the default and `按兴趣` is one tap from reverting, an
  inaccurate score can never block reading — worst case is a less-ideal order with
  every entry still present.
- **What each mode does** (source grouping + cards preserved in both):
  - `时间` (default): entries within each source newest-first; sources by most-recent
    unread.
  - `按兴趣`: entries within each source ordered by preference score (likely-good
    first); source sections ordered by aggregate affinity (your favored sources rise).
- **Signals → score**: positive = read (esp. deep read) + saved (`read_later`);
  negative = hidden (`is_hidden`). These maintain a per-user **preference vector**; an
  entry's score = similarity between its **embedding** (existing `EmbeddingService`)
  and that vector.
- **Cold start / graceful degradation**: with little or no signal, `按兴趣` falls back
  toward time order and/or a transparent **source-affinity** heuristic (your per-source
  read/hide ratio, which accrues quickly). Since `时间` is default, day-one emptiness
  never blocks the view.
- **Optional transparency**: may show a light "为什么靠前" hint (e.g. 常读此源 / 与你
  读过的相似). Nice-to-have, not required.

## Month view specifics

- Same component and layout; range = the whole month; **all unread laid out**.
- No extra density mechanism beyond read-sink, hide, and the optional sort — seeing
  every unread item is the intent. Volume is handled at the **fetch** layer (see
  Performance), not by hiding UI behind clicks.

## Interactions & states

- **Hide (not-interested)** — sets a per-`(user, entry)` **hidden** state; the entry
  leaves the unread grid immediately; **undo** restores it; also counts as a negative
  signal for the score. v1: no auto-hiding of similar items. **Hidden = hidden
  everywhere** (week, month, daily) for consistency — confirm in plan.
- **Save** — toggles existing `read_later`; positive signal.
- **Read / interested** — opening marks read (reuse Digest auto-mark-read); sinks to
  "看过的"; positive signal. No explicit control.

## Data model & API

- **New per-entry user state: `is_hidden`** (working name; alt `not_interested`) —
  boolean parallel to `is_read` / `read_later`. Needs: Alembic migration, entry-service
  filter (exclude hidden from unread), API field + toggle endpoint (mirror
  `read_later`), `@glean/types` + `@glean/api-client` + hook additions.
- **Preference score (revived, minimal)** — revive a minimal `user_preference_vectors`
  (per-user vector) and a per-entry `preference_score` (stored on `user_entries` or
  computed on read), used **only** to order the `按兴趣` sort. A worker job updates the
  user vector from accumulated read/save/hide signals and scores in-range entries.
  Reuses existing entry embeddings. (See the M3 migrations
  `28d8c85cf1a4_m3_preference_system` and the later removal
  `b6c7d8e9f0a1_remove_reader_mode_preference_storage` for the prior shape.)
- **Entry list query** — list service already supports `collected_after` /
  `collected_before` and `page` / `per_page`. Extend usage to: fetch a week/month
  range, **exclude hidden**, support an **unread vs read split** (read fetched lazily
  for "看过的"), **paginate** for large months, and return/accept the sort order.

## Performance / large volume

A month of unread can be hundreds–thousands of entries. Strategy:

- Fetch range **unread** via paginated requests (existing `page`/`per_page`),
  **auto-appended on scroll** (infinite scroll, no click) so first paint is fast. This
  is a fetch optimization only — every unread entry still appears by scrolling;
  pagination is never a manual "show more".
- **Precompute** `preference_score` in the worker so the `按兴趣` sort is a cheap
  ordered read, not an on-request vector computation.
- **Defer** each source's "看过的" (read) fetch until the box is opened.
- Add **list virtualization** if a single source's unread set is very large (flag for
  the plan).
- Reuse existing **server day-range / timezone** logic for consistent boundaries.

## Reuse map (existing → new)

| Need | Reuse |
|---|---|
| Group entries by source | `buildTodayBoardGroups` (`todayBoard.ts`) |
| Entry card (title + summary + meta) | `TodayBoard` `FeedCardGroup` / Digest card patterns |
| Date keys, week start, range | `todayBoard.ts` helpers |
| Range fetch | `useEntries` + `collected_after`/`collected_before` |
| Entry embeddings (for score) | `EmbeddingService` (`glean_vector`) |
| Auto mark-read on read | `DigestView` IntersectionObserver logic |
| List translation | `useListEntriesTranslation` |
| URL `view`/`date`/`sort` state | `useReaderController` |

## Edge cases

- **Empty period** (no unread): friendly empty state; offer "看过的" or jump to prev period.
- **Source with only read/hidden items**: omitted from the unread flow; reachable via "看过的".
- **No preference signal yet**: `按兴趣` behaves per the cold-start rule above.
- **Undo lifetime**: the inline "已隐藏 · 撤销" line persists; hidden items must also be
  restorable later (a "隐藏的" access point) — exact affordance in plan.
- **Translation**: card title/summary respect the existing list-translation setting.

## Open questions (resolve in the implementation plan)

- "看过的" box scope: **per-source** (proposed) vs one global box.
- Hidden state name (`is_hidden` vs `not_interested`); confirm **global hide** vs week/month-only.
- A third **flat cross-source "重点" sort mode** (best regardless of source) — include or defer?
- Preference vector recompute cadence (per signal, batched, scheduled) and the exact
  cold-start blend (pure time vs source-affinity).
- Undo lifetime + a dedicated view/restore for hidden items.
- Month sub-navigation: none / pure scroll (proposed) vs an optional jump-to-week strip.
- Pagination page size and the virtualization threshold.

## Out of scope (YAGNI)

AI/LLM summaries or topic clustering for these views; using model output to hide or
filter (models may only sort); auto-hiding similar items or keyword muting; unread
counts and progress UI; any change to the daily view.
