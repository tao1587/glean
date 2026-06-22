# Week & Month — Per-Source Density Layout (D)

**Date:** 2026-06-21
**Status:** Draft (pending user review)
**Area:** Reader week/month views — `frontend/apps/web/src/pages/reader/shared/components/PeriodView` (`index.tsx`, `SourceSection.tsx`). Reuses `DigestArticleCard`. **Frontend-only**; no API/data-model change.
**Parent spec:** [`2026-06-17-week-month-reading-views-design.md`](./2026-06-17-week-month-reading-views-design.md) — this refines that view's body layout only.

## Problem

The week/month view groups all unread entries **by source**, rendering one full-width
band per source (`SourceSection`: a serif header + a `repeat(auto-fill, minmax(320px,1fr))`
card grid). Because the view shows **every** source, the long tail of sources with only
1–3 unread entries each claims a full-width band whose row is mostly empty to the right,
and many such sparse bands stack vertically. The result is poor information density — lots
of whitespace and scrolling for little content.

The goal is to let sparse sources **pack together** (occupy only the space their content
needs, side by side) while keeping the layout **tidy** (aligned, not ragged), keeping a
**summary on every card**, and without breaking sources that have **hundreds** of entries.

## Goals

- Sparse sources no longer each consume a full-width band; they share rows.
- Layout stays visually regular (aligned grid, no masonry zig-zag).
- Every card keeps title + summary excerpt + timestamp (no content loss).
- Sources with many entries are unaffected (no vertical "explosion").
- The "sparse" cutoff is **width-aware**, not a hardcoded count.

## Non-goals (explicitly out)

- Any change to the daily (digest-today) view.
- Any change to fetch/pagination, sort logic, hidden-state model, or counts (all owned by
  the parent spec).
- Masonry / variable-height column-flow layouts (see Rejected alternatives).
- A new article-card component — the existing `DigestArticleCard` is reused as-is.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Approach | **D — two zones**: substantial sources as today's full-width bands; the sparse long tail collected into one shared, uniform card grid |
| Card | **Reuse `DigestArticleCard` unchanged** — it already renders source name + icon, time, serif title, summary (3-line clamp), and the Hide/restore action |
| Sparse cutoff | **Width-aware**: a source is a band iff it can fill at least one full grid row at the current width; otherwise it joins the packed grid |
| Threshold value | `bandCols = max(1, floor(usableWidth / 320))`; source is substantial iff `group.entries.length >= bandCols`, else sparse |
| Width source | `ResizeObserver` on the existing `scrollRef`; recompute `bandCols` and re-partition on width change |
| Ordering | Bands first (in active sort order), then the packed grid (sparse sources in active sort order, cards kept source-contiguous) |
| Card min width | **320px everywhere** (bands and packed grid share `CARD_MIN`), for visual parity |
| Scope of split | Applies to all three tabs (`unread` / `read` / `hidden`) uniformly |
| Digest parity | Week/month **diverges** from the day view here — intentional, because only "show all sources" produces this density problem |

## Layout spec

The `PeriodView` body becomes two zones, rendered in order:

1. **Substantial zone** — sources with `entries.length >= bandCols`. Rendered exactly as
   today: one `SourceSection` each (serif header + `共 N 条` + `minmax(320px,1fr)` grid +
   the existing 5-item cap, incremental expand, and sticky collapse). Unchanged.

2. **Sparse zone** — every source with `entries.length < bandCols`. Rendered as **one
   shared grid** (`repeat(auto-fill, minmax(320px,1fr))`, mirroring `SourceSection`'s grid
   styling: `border-l` container + cards' own `border-b/border-r` grid lines). Each sparse
   source's entries are emitted in order so a source's cards stay contiguous; the source is
   identified by `DigestArticleCard`'s built-in header tag (icon + uppercase source name),
   so no per-source section header is needed. A subtle hairline separator (no count, not a
   collapse — all entries remain visible) sits above this zone when both zones are present.

Density comes from removing the per-source headers and partial-row waste of the long tail:
many sparse sources' cards now flow into a single aligned grid instead of N stacked bands.

## Adaptive threshold

```
CARD_MIN     = 320                                   // matches the band grid's minmax min
usableWidth  = containerWidth - horizontalPadding    // px-6 ⇒ 48px total
bandCols     = max(1, floor(usableWidth / CARD_MIN))
isSubstantial(group) = group.entries.length >= bandCols
```

- Measured via a `ResizeObserver` on `scrollRef`; `bandCols` is state, partition is
  `useMemo`'d on `[orderedGroups, bandCols]`.
- It adapts to width as intended:
  - Wide (~1280px ⇒ 4 cols): need ≥4 entries to earn a band; 1–3 pack. (This is the
    "≤3" case the hardcoded number was implicitly calibrated to.)
  - Medium (~960px ⇒ 3 cols): ≤2 pack; 3 stays a band.
  - Narrow (~640px ⇒ 2 cols): only 1-entry sources pack.
  - Very narrow (bandCols = 1): nothing packs → degrades to today's single-column bands
    (no horizontal space to reclaim anyway).
- The same source can move between zones across breakpoints; a reflow on resize is expected
  and acceptable.

## Card behaviors (must stay consistent across both zones)

- **Open**: card `onClick` → `onOpenEntry` (unchanged).
- **Hide** (`unread` tab) / **Restore** (`hidden` tab): `DigestArticleCard`'s `action` +
  `onAction` props, same handlers as bands.
- **Translation**: packed cards receive `translations` / `translateActive` like band cards.
- **Hide undo**: today the inline "已隐藏 ·「title」· 撤销" line lives inside `SourceSection`.
  Sparse-zone cards have no `SourceSection`, so pending-undo lines for sparse sources render
  in a small stack beneath the packed grid (exact placement → plan).

## Edge cases

- **No sparse sources** → no packed grid, no separator.
- **No substantial sources** → only the packed grid (separator optional/omitted).
- **bandCols === 1** → all sources are bands (current behavior).
- **Hiding drops a source below `bandCols` mid-session** → re-partitions on next render; the
  source moves into the packed zone. Acceptable.
- **`read` / `hidden` tabs** → same split; restore action works on packed cards.
- **Empty period** → unchanged empty state.

## Rejected alternatives

- **A — masonry/column-flow of source blocks**: a source with hundreds of entries collapses
  into one narrow column (or explodes it on expand); multi-column also breaks `position: sticky`
  (the collapse button) and forces column-major ordering. Rejected.
- **C — threshold + per-source blocks in a multi-column packed zone**: the packed zone is a
  mini-masonry; blocks of 1/2/3 cards give ragged column bottoms. Rejected (untidy).
- **C′ — uniform source tiles, titles only**: tidy but drops the summary. Rejected (user:
  "缺少 summary 不太好").
- **C″ — source "magazine" tiles (lead has summary, rest titles)**: keeps grouping but only
  the lead item shows a summary. Not chosen; D gives a summary on every card.

## Reuse map

| Need | Reuse |
|---|---|
| Article card (tag + title + summary + time + Hide/restore) | `DigestArticleCard` (unchanged) |
| Substantial-source band | `SourceSection` (unchanged) |
| Group + order sources | `buildTodayBoardGroups`, `orderGroupsByAffinity` |
| Container width | existing `scrollRef` + `ResizeObserver` |
| List translation | `useListEntriesTranslation` |

## Open questions (resolve in the plan)

- Exact affordance/placement for sparse-zone hide-undo (inline stack beneath grid vs toast).
- Under `按兴趣`, should a high-affinity but sparse source be promotable to a band (override
  the size threshold)? Default: **no** — size decides band-vs-packed; affinity orders within
  each zone.
- Separator above the packed zone: subtle "其余来源" hairline vs nothing.
- Whether the packed grid should use a smaller `CARD_MIN` for extra density. Default: **no**
  (320 everywhere for parity).
