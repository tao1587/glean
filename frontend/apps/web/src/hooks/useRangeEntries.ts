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
  collected_after: string
  collected_before: string
  enabled: boolean
}) {
  const { collected_after, collected_before, enabled } = params
  const query = useInfiniteQuery({
    queryKey: ['range-entries', collected_after, collected_before],
    queryFn: ({ pageParam = 1, signal }) =>
      entryService.getEntries(
        {
          collected_after,
          collected_before,
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

export function useRangeReadEntries(
  feedId: string,
  range: { collected_after: string; collected_before: string },
  enabled: boolean
) {
  const query = useInfiniteQuery({
    queryKey: [
      'range-read-entries',
      feedId,
      range.collected_after,
      range.collected_before,
    ],
    queryFn: ({ pageParam = 1, signal }) =>
      entryService.getEntries(
        {
          feed_id: feedId,
          collected_after: range.collected_after,
          collected_before: range.collected_before,
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
