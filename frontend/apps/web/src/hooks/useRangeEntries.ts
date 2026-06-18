import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { entryService } from '@glean/api-client'
import type { EntryWithState } from '@glean/types'
import {
  buildTodayBoardEntries,
  type TodayBoardEntry,
} from '@/pages/reader/shared/todayBoard'

const PER_PAGE = 50

export function useRangeEntries(params: {
  period: 'week' | 'month'
  anchorDate: string
  enabled: boolean
}) {
  const { period, anchorDate, enabled } = params
  const query = useInfiniteQuery({
    queryKey: ['range-entries', period, anchorDate],
    queryFn: ({ pageParam = 1, signal }) =>
      entryService.getEntries(
        {
          period,
          period_anchor: anchorDate,
          is_read: false,
          is_hidden: false,
          page: pageParam as number,
          per_page: PER_PAGE,
        },
        { signal }
      ),
    getNextPageParam: (last) =>
      last.page < last.total_pages ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 45 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
  const entries: EntryWithState[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )
  return { ...query, entries }
}

export function useRangeHiddenEntries(
  feedId: string,
  params: { period: 'week' | 'month'; anchorDate: string },
  enabled: boolean
) {
  const query = useInfiniteQuery({
    queryKey: ['range-hidden-entries', feedId, params.period, params.anchorDate],
    queryFn: ({ pageParam = 1, signal }) =>
      entryService.getEntries(
        {
          feed_id: feedId,
          period: params.period,
          period_anchor: params.anchorDate,
          is_hidden: true,
          page: pageParam as number,
          per_page: PER_PAGE,
        },
        { signal }
      ),
    getNextPageParam: (last) =>
      last.page < last.total_pages ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 45 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
  const entries: TodayBoardEntry[] = useMemo(() => {
    const raw = query.data?.pages.flatMap((p) => p.items) ?? []
    return buildTodayBoardEntries(raw, { filterBySelectedDate: false })
  }, [query.data])
  return { ...query, entries }
}

export function useRangeReadEntries(
  feedId: string,
  params: { period: 'week' | 'month'; anchorDate: string },
  enabled: boolean
) {
  const query = useInfiniteQuery({
    queryKey: [
      'range-read-entries',
      feedId,
      params.period,
      params.anchorDate,
    ],
    queryFn: ({ pageParam = 1, signal }) =>
      entryService.getEntries(
        {
          feed_id: feedId,
          period: params.period,
          period_anchor: params.anchorDate,
          is_read: true,
          is_hidden: false,
          page: pageParam as number,
          per_page: PER_PAGE,
        },
        { signal }
      ),
    getNextPageParam: (last) =>
      last.page < last.total_pages ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 45 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
  const entries: TodayBoardEntry[] = useMemo(() => {
    const raw = query.data?.pages.flatMap((p) => p.items) ?? []
    return buildTodayBoardEntries(raw, { filterBySelectedDate: false })
  }, [query.data])
  return { ...query, entries }
}
