import type { TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'

export function orderGroupsByAffinity(
  groups: TodayBoardFeedGroup[],
  sort: 'time' | 'interest',
  affinity: Record<string, number>
): TodayBoardFeedGroup[] {
  if (sort !== 'interest') return groups
  return groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => {
      const d = (affinity[y.g.feedId] ?? 0) - (affinity[x.g.feedId] ?? 0)
      return d !== 0 ? d : x.i - y.i
    })
    .map((x) => x.g)
}
