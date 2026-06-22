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
    expect(partitionGroupsByDensity(groups, 2).bands.map((g) => g.feedId)).toEqual([
      'a',
      'c',
    ])
    expect(partitionGroupsByDensity(groups, 2).sparse.map((g) => g.feedId)).toEqual([
      'b',
    ])
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
