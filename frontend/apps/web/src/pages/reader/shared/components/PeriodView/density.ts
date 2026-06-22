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
