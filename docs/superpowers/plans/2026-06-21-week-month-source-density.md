# Week & Month Per-Source Density Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the week/month reader view, stop letting sources with only a few unread entries each consume a full-width band; pack the sparse long tail into one shared, width-aware card grid while substantial sources keep their full-width bands.

**Architecture:** `PeriodView` measures its scroll container width, derives how many cards fit one full row (`bandCols`), and partitions the already-sorted source groups into **bands** (`entries.length >= bandCols`) and a **sparse** tail. Bands render as today's `SourceSection`; the sparse tail renders in a new `SparseSourceGrid` that reuses the existing `DigestArticleCard`. The partition rule is a pure function (unit-tested); the grid is a presentational component (component-tested); the wiring in `PeriodView` is verified by typecheck/lint/existing tests + a manual visual pass.

**Tech Stack:** React + TypeScript (Vite SPA), Vitest + @testing-library/react, Tailwind. Frontend only — no API or data-model changes.

**Spec:** [`docs/superpowers/specs/2026-06-21-week-month-source-density-design.md`](../specs/2026-06-21-week-month-source-density-design.md)

---

## File Structure

All paths under `frontend/apps/web/`. Run all commands from `frontend/apps/web/`.

- **Create** `src/pages/reader/shared/components/PeriodView/density.ts` — pure helpers: `CARD_MIN_WIDTH`, `computeBandCols(usableWidth)`, `partitionGroupsByDensity(groups, bandCols)`. No React.
- **Create** `src/pages/reader/shared/components/PeriodView/SparseSourceGrid.tsx` — renders the packed grid of `DigestArticleCard` for the sparse groups + their hide-undo lines.
- **Modify** `src/pages/reader/shared/components/PeriodView/index.tsx` — measure width (ResizeObserver), compute `bandCols`, partition, render bands then `<SparseSourceGrid>`.
- **Create** `src/__tests__/pages/reader/periodViewDensity.test.ts` — unit tests for `density.ts`.
- **Create** `src/__tests__/pages/reader/SparseSourceGrid.test.tsx` — component tests for `SparseSourceGrid`.

`SourceSection.tsx` and `DigestArticleCard.tsx` are **not** modified.

---

## Task 1: Density partition helpers (pure, TDD)

**Files:**
- Create: `src/pages/reader/shared/components/PeriodView/density.ts`
- Test: `src/__tests__/pages/reader/periodViewDensity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/pages/reader/periodViewDensity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  computeBandCols,
  partitionGroupsByDensity,
} from '@/pages/reader/shared/components/PeriodView/density'
import type {
  TodayBoardFeedGroup,
  TodayBoardEntry,
} from '@/pages/reader/shared/todayBoard'

function makeGroup(feedId: string, count: number): TodayBoardFeedGroup {
  return {
    feedId,
    feedTitle: feedId,
    feedDescription: null,
    feedIconUrl: null,
    unreadCount: count,
    totalCount: count,
    entries: Array.from(
      { length: count },
      (_, i) => ({ id: `${feedId}-${i}` }) as TodayBoardEntry,
    ),
    visibleEntries: [],
    isExpanded: false,
    isCollapsible: false,
  }
}

describe('computeBandCols', () => {
  it('returns floor(width / 320), at least 1', () => {
    expect(computeBandCols(1280)).toBe(4)
    expect(computeBandCols(960)).toBe(3)
    expect(computeBandCols(640)).toBe(2)
    expect(computeBandCols(320)).toBe(1)
  })

  it('never drops below 1, even for tiny / non-finite widths', () => {
    expect(computeBandCols(100)).toBe(1)
    expect(computeBandCols(0)).toBe(1)
    expect(computeBandCols(-48)).toBe(1)
    expect(computeBandCols(Number.NaN)).toBe(1)
  })
})

describe('partitionGroupsByDensity', () => {
  it('keeps groups that fill a full row as bands, in order', () => {
    const groups = [
      makeGroup('a', 5),
      makeGroup('b', 1),
      makeGroup('c', 8),
      makeGroup('d', 3),
    ]
    const { bands, sparse } = partitionGroupsByDensity(groups, 4)
    expect(bands.map((g) => g.feedId)).toEqual(['a', 'c'])
    expect(sparse.map((g) => g.feedId)).toEqual(['b', 'd'])
  })

  it('moves more groups into bands as columns shrink', () => {
    const groups = [makeGroup('a', 5), makeGroup('b', 1), makeGroup('c', 3)]
    expect(partitionGroupsByDensity(groups, 2).bands.map((g) => g.feedId)).toEqual(['a', 'c'])
    expect(partitionGroupsByDensity(groups, 2).sparse.map((g) => g.feedId)).toEqual(['b'])
  })

  it('makes every group a band when only one column fits', () => {
    const groups = [makeGroup('a', 1), makeGroup('b', 2)]
    const { bands, sparse } = partitionGroupsByDensity(groups, 1)
    expect(bands).toHaveLength(2)
    expect(sparse).toHaveLength(0)
  })

  it('handles an empty group list', () => {
    const { bands, sparse } = partitionGroupsByDensity([], 3)
    expect(bands).toEqual([])
    expect(sparse).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/pages/reader/periodViewDensity.test.ts`
Expected: FAIL — cannot resolve `density` module (`Failed to load url .../density.ts`).

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/reader/shared/components/PeriodView/density.ts`:

```ts
import type { TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'

/** Min card width; matches the band grid's `minmax(320px, 1fr)` in SourceSection. */
export const CARD_MIN_WIDTH = 320

/**
 * How many cards fit across one full-width row at the given usable width.
 * Always at least 1 so a very narrow pane degrades to a single column.
 */
export function computeBandCols(usableWidth: number): number {
  if (!Number.isFinite(usableWidth)) return 1
  return Math.max(1, Math.floor(usableWidth / CARD_MIN_WIDTH))
}

export interface DensityPartition {
  /** Sources with enough entries to fill at least one full row → full-width bands. */
  bands: TodayBoardFeedGroup[]
  /** The sparse long tail → packed into one shared grid. */
  sparse: TodayBoardFeedGroup[]
}

/**
 * Split already-ordered source groups into full-width bands and the sparse tail.
 * A group is a band iff it can fill one full row at the current width
 * (`entries.length >= bandCols`). Order is preserved within each list.
 */
export function partitionGroupsByDensity(
  groups: TodayBoardFeedGroup[],
  bandCols: number,
): DensityPartition {
  const bands: TodayBoardFeedGroup[] = []
  const sparse: TodayBoardFeedGroup[] = []
  for (const group of groups) {
    if (group.entries.length >= bandCols) bands.push(group)
    else sparse.push(group)
  }
  return { bands, sparse }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/pages/reader/periodViewDensity.test.ts`
Expected: PASS (8 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/reader/shared/components/PeriodView/density.ts src/__tests__/pages/reader/periodViewDensity.test.ts
git commit -m "feat(reader): width-aware band/sparse partition helper for period view"
```

---

## Task 2: SparseSourceGrid component (TDD)

**Files:**
- Create: `src/pages/reader/shared/components/PeriodView/SparseSourceGrid.tsx`
- Test: `src/__tests__/pages/reader/SparseSourceGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/pages/reader/SparseSourceGrid.test.tsx`:

```tsx
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { SparseSourceGrid } from '@/pages/reader/shared/components/PeriodView/SparseSourceGrid'
import type {
  TodayBoardFeedGroup,
  TodayBoardEntry,
} from '@/pages/reader/shared/todayBoard'

vi.mock('@/pages/reader/shared/components/DigestView/DigestArticleCard', () => ({
  DigestArticleCard: ({
    entry,
    onClick,
    onAction,
    action,
  }: {
    entry: { id: string }
    onClick: () => void
    onAction: () => void
    action: string
  }) => (
    <div data-testid="card" data-action={action}>
      <button data-testid={`open-${entry.id}`} onClick={onClick}>
        {entry.id}
      </button>
      <button data-testid={`action-${entry.id}`} onClick={onAction}>
        act
      </button>
    </div>
  ),
}))

function makeEntry(id: string): TodayBoardEntry {
  return { id, title: `Title ${id}` } as TodayBoardEntry
}

function makeGroup(feedId: string, ids: string[]): TodayBoardFeedGroup {
  return {
    feedId,
    feedTitle: feedId,
    feedDescription: null,
    feedIconUrl: null,
    unreadCount: ids.length,
    totalCount: ids.length,
    entries: ids.map(makeEntry),
    visibleEntries: [],
    isExpanded: false,
    isCollapsible: false,
  }
}

afterEach(cleanup)

describe('SparseSourceGrid', () => {
  it('renders one card per entry across all sparse groups', () => {
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1', 'a-2']), makeGroup('b', ['b-1'])]}
        action="hide"
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('card')).toHaveLength(3)
  })

  it('renders nothing when there are no sparse groups', () => {
    const { container } = render(
      <SparseSourceGrid groups={[]} action="hide" onOpen={vi.fn()} onAction={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('wires onOpen and onAction to the matching entry', () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1'])]}
        action="hide"
        onOpen={onOpen}
        onAction={onAction}
      />,
    )
    fireEvent.click(screen.getByTestId('open-a-1'))
    fireEvent.click(screen.getByTestId('action-a-1'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
  })

  it('renders an undoable line for each just-hidden entry', () => {
    const onUndo = vi.fn()
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-2'])]}
        action="hide"
        justHidden={[makeEntry('a-1')]}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onUndo={onUndo}
      />,
    )
    fireEvent.click(screen.getByText('撤销'))
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
  })

  it('omits the 其余来源 separator when showSeparator is false', () => {
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1'])]}
        action="hide"
        showSeparator={false}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(screen.queryByText('其余来源')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/pages/reader/SparseSourceGrid.test.tsx`
Expected: FAIL — cannot resolve `SparseSourceGrid` module.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/reader/shared/components/PeriodView/SparseSourceGrid.tsx`:

```tsx
import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { DigestArticleCard } from '../DigestView/DigestArticleCard'
import type { CardAction } from './SourceSection'

export function SparseSourceGrid({
  groups,
  action,
  justHidden = [],
  showSeparator = true,
  onOpen,
  onAction,
  onUndo,
  translations,
  translateActive,
}: {
  groups: TodayBoardFeedGroup[]
  action: CardAction
  justHidden?: TodayBoardEntry[]
  showSeparator?: boolean
  onOpen: (e: TodayBoardEntry) => void
  onAction: (e: TodayBoardEntry) => void
  onUndo?: (e: TodayBoardEntry) => void
  translations?: Record<string, { title?: string; summary?: string }>
  translateActive?: boolean
}) {
  if (groups.length === 0) return null
  const entries = groups.flatMap((g) => g.entries)

  return (
    <section className="px-6">
      {showSeparator ? (
        <div className="mb-3 mt-8 flex items-center gap-2">
          <span className="text-[12px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
            其余来源
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--digest-divider, #E5E0D2)' }} />
        </div>
      ) : (
        <div className="mt-6" />
      )}

      <div
        className="grid border-l"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          borderColor: 'var(--digest-divider, #E5E0D2)',
        }}
      >
        {entries.map((e) => (
          <DigestArticleCard
            key={e.id}
            entry={e}
            onClick={() => onOpen(e)}
            action={action}
            onAction={() => onAction(e)}
            translation={translateActive ? translations?.[e.id] : undefined}
          />
        ))}
      </div>

      {justHidden.map((e) => (
        <div
          key={e.id}
          className="mt-2 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
        >
          <span className="truncate">已隐藏 ·「{e.title}」</span>
          {onUndo ? (
            <button
              type="button"
              className="underline"
              style={{ color: 'var(--digest-text, #1A1A1A)' }}
              onClick={() => onUndo(e)}
            >
              撤销
            </button>
          ) : null}
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/pages/reader/SparseSourceGrid.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/reader/shared/components/PeriodView/SparseSourceGrid.tsx src/__tests__/pages/reader/SparseSourceGrid.test.tsx
git commit -m "feat(reader): SparseSourceGrid packs sparse sources into one shared grid"
```

---

## Task 3: Wire density partition into PeriodView

**Files:**
- Modify: `src/pages/reader/shared/components/PeriodView/index.tsx`

- [ ] **Step 1: Add imports**

In `index.tsx`, change the React import (line 1) to add `useLayoutEffect`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
```

Add these two imports alongside the existing PeriodView-local imports (after the `orderGroupsByAffinity` import, ~line 16):

```tsx
import { SparseSourceGrid } from './SparseSourceGrid'
import { computeBandCols, partitionGroupsByDensity } from './density'
```

- [ ] **Step 2: Add the padding constant**

Directly above the `TABS` constant (~line 18), add:

```tsx
// px-6 (1.5rem) left + right padding on the source sections.
const SECTION_PADDING_X = 48
```

- [ ] **Step 3: Measure pane width and partition the groups**

In the component body, after the `groups` `useMemo` (it ends at ~line 58) and after `const scrollRef = useRef<HTMLDivElement>(null)` (line 67), add a width measurement effect and the partition. Place this block right after the `scrollRef` declaration:

```tsx
  const [paneWidth, setPaneWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setPaneWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bandCols = computeBandCols(paneWidth - SECTION_PADDING_X)
  const { bands, sparse } = useMemo(
    () => partitionGroupsByDensity(groups, bandCols),
    [groups, bandCols],
  )

  const sparseFeedIds = useMemo(() => new Set(sparse.map((g) => g.feedId)), [sparse])
  const sparseJustHidden =
    tab === 'unread'
      ? Object.entries(undo.hidden)
          .filter(([feedId]) => sparseFeedIds.has(feedId))
          .flatMap(([, list]) => list)
      : []
```

- [ ] **Step 4: Replace the groups render block**

Find the body render branch that maps `groups` (the `groups.map((g) => (...<SourceSection .../>...))` block, ~lines 177-190, the third arm of the `!hasValidAnchor ... ? ... : groups.length === 0 ? ... : ( ... )` ternary). Replace **only that third arm** (the `(` … `)` after the final `: `) with:

```tsx
        <>
          {bands.map((g) => (
            <SourceSection
              key={g.feedId}
              group={g}
              action={cardAction}
              justHidden={tab === 'unread' ? (undo.hidden[g.feedId] ?? []) : []}
              onOpen={onOpenEntry}
              onAction={onAction}
              onUndo={unhide}
              translations={translations}
              translateActive={translateActive}
            />
          ))}
          <SparseSourceGrid
            groups={sparse}
            action={cardAction}
            justHidden={sparseJustHidden}
            showSeparator={bands.length > 0}
            onOpen={onOpenEntry}
            onAction={onAction}
            onUndo={unhide}
            translations={translations}
            translateActive={translateActive}
          />
        </>
```

The `groups.length === 0` empty-state arm above it is unchanged — it still covers "both zones empty".

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `ResizeObserver` is flagged, it is part of the DOM lib already used elsewhere in this app — confirm `lib` includes `DOM` in `tsconfig`; it does, since `ReaderCore.tsx` uses `ResizeObserver`.)

- [ ] **Step 6: Lint**

Run: `npx eslint src/pages/reader/shared/components/PeriodView/index.tsx src/pages/reader/shared/components/PeriodView/SparseSourceGrid.tsx src/pages/reader/shared/components/PeriodView/density.ts`
Expected: no errors.

- [ ] **Step 7: Run the full reader test suite (no regressions)**

Run: `npx vitest run src/__tests__/pages/reader`
Expected: PASS — existing `ReaderCore.todayBoard.test.tsx` (PeriodView is mocked there, so unaffected) plus the two new test files.

- [ ] **Step 8: Manual visual verification**

Start the web app (per project: `pnpm --filter @glean/web dev` or the documented dev command) and open a week or month view with many sources of varying sizes. Confirm:
- Sources with few entries no longer each occupy a full-width band; they appear together under "其余来源" in one aligned grid, each card showing source tag + title + summary + time.
- Sources with many entries still render as full-width bands with the "还有 N 条" expand.
- Resize the window wider/narrower: the cutoff shifts (wider → more sources fall into the sparse grid; very narrow → everything becomes a single-column band).
- Hide a card in the sparse grid (unread tab) → it leaves and an "已隐藏 · 撤销" line appears; undo restores it.
- The `读过` and `隐藏` tabs render the same two-zone layout; restore works on sparse cards in the `隐藏` tab.

- [ ] **Step 9: Commit**

```bash
git add src/pages/reader/shared/components/PeriodView/index.tsx
git commit -m "feat(reader): period view packs sparse sources via width-aware density split"
```

---

## Self-Review

**Spec coverage:**
- Two zones (bands + packed grid) → Tasks 2–3. ✓
- Reuse `DigestArticleCard` unchanged → Task 2 (imported, not modified). ✓
- Width-aware cutoff `bandCols = max(1, floor(usableWidth / 320))`, `count >= bandCols` → Task 1. ✓
- ResizeObserver on `scrollRef`, recompute on resize → Task 3 Step 3. ✓
- Bands first, then packed grid, order preserved → Task 1 (preserves order) + Task 3 Step 4. ✓
- Card behaviors consistent (open/hide/restore/translate) → Task 2 props + Task 3 wiring. ✓
- Sparse-zone hide-undo lines (not in a `SourceSection`) → Task 2 (`justHidden`) + Task 3 (`sparseJustHidden`). ✓
- Separator only when both zones present → `showSeparator={bands.length > 0}`, Task 3 Step 4. ✓
- Edge cases: no sparse (SparseSourceGrid returns null), no bands (separator hidden), `bandCols === 1` (all bands), empty period (existing empty-state arm untouched). ✓
- Open questions in spec (affinity-promotion, separator wording, smaller CARD_MIN) are intentionally deferred — defaults implemented as specced.

**Placeholder scan:** none — every step has full code/commands/expected output.

**Type consistency:** `computeBandCols`/`partitionGroupsByDensity` signatures match between Task 1 definition and Task 3 usage. `SparseSourceGrid` prop names (`groups`, `action`, `justHidden`, `showSeparator`, `onOpen`, `onAction`, `onUndo`, `translations`, `translateActive`) match between Task 2 definition and Task 3 usage. `CardAction` is imported from `SourceSection` (already exported there). `translations` typed identically to `SourceSection` (`Record<string, { title?: string; summary?: string }>`).
