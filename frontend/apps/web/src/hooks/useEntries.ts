import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entryService } from '@glean/api-client'
import type { EntryListResponse, UpdateEntryStateRequest, EntryWithState } from '@glean/types'
import { subscriptionKeys } from './useSubscriptions'

type UpdateEntryStateVariables = {
  entryId: string
  data: UpdateEntryStateRequest
  updateListCache?: boolean
}

/**
 * Query key factory for entries.
 */
export const entryKeys = {
  all: ['entries'] as const,
  lists: () => [...entryKeys.all, 'list'] as const,
  list: (filters: EntryFilters) => [...entryKeys.lists(), filters] as const,
  detail: (id: string) => [...entryKeys.all, 'detail', id] as const,
}

/**
 * Entry list filters.
 */
export interface EntryFilters {
  feed_id?: string
  folder_id?: string
  is_read?: boolean
  read_later?: boolean
  collected_after?: string
  collected_before?: string
  collected_date?: string
  page?: number
  per_page?: number
  view?: 'timeline' | 'today-board'
}

export type InfiniteEntryFilters = Omit<EntryFilters, 'page'>

type InfiniteEntryQueryOptions = {
  enabled?: boolean
}

function getPagedEntryFilters(
  { per_page: _perPage, ...filters }: InfiniteEntryFilters = {},
  page: number,
  perPage: number
): EntryFilters {
  return { ...filters, page, per_page: perPage }
}

export function getInfiniteEntriesQueryOptions(
  filters?: InfiniteEntryFilters,
  options: InfiniteEntryQueryOptions = {}
) {
  const perPage = filters?.per_page ?? 20
  const isTodayBoard = filters?.view === 'today-board'

  return {
    queryKey: entryKeys.list(filters || {}),
    queryFn: ({ pageParam = 1, signal }: { pageParam?: number; signal?: AbortSignal }) => {
      if (isTodayBoard) {
        return entryService.getTodayEntries(
          {
            date: filters.collected_date,
            feed_id: filters.feed_id,
            folder_id: filters.folder_id,
            limit: perPage,
          },
          { signal }
        )
      }

      return entryService.getEntries(getPagedEntryFilters(filters, pageParam, perPage), { signal })
    },
    getNextPageParam: (lastPage: { page: number; total_pages: number }) => {
      if (isTodayBoard) return undefined
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1
      }
      return undefined
    },
    initialPageParam: 1,
    staleTime: 45 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: options.enabled ?? true,
  }
}

/**
 * Hook to fetch entries with filters.
 */
export function useEntries(filters?: EntryFilters) {
  return useQuery({
    queryKey: entryKeys.list(filters || {}),
    queryFn: ({ signal }) => entryService.getEntries(filters, { signal }),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook to fetch entries with infinite scroll support.
 */
export function useInfiniteEntries(
  filters?: InfiniteEntryFilters,
  options: InfiniteEntryQueryOptions = {}
) {
  return useInfiniteQuery(getInfiniteEntriesQueryOptions(filters, options))
}

/**
 * Hook to fetch a single entry.
 */
export function useEntry(entryId: string) {
  return useQuery({
    queryKey: entryKeys.detail(entryId),
    queryFn: ({ signal }) => entryService.getEntry(entryId, { signal }),
    enabled: !!entryId,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}

/**
 * Hook to update entry state.
 *
 * Uses optimistic cache updates to prevent the entry list from refreshing
 * and causing the currently selected entry to disappear from the list.
 * Only invalidates subscription counts for accurate unread counts.
 */
export function useUpdateEntryState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ entryId, data }: UpdateEntryStateVariables) =>
      entryService.updateEntryState(entryId, data),
    onSuccess: (updatedEntry, variables) => {
      // Update the specific entry detail in cache
      queryClient.setQueryData(entryKeys.detail(variables.entryId), updatedEntry)

      if (variables.updateListCache === false) {
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
        return
      }

      // Update the entry in all cached lists directly (optimistic update)
      // This prevents the list from refreshing and the entry from disappearing
      queryClient.setQueriesData<{
        pages: { items: EntryWithState[] }[]
        pageParams: number[]
      }>({ queryKey: entryKeys.lists() }, (oldData) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === variables.entryId ? { ...item, ...updatedEntry } : item
            ),
          })),
        }
      })

      queryClient.setQueriesData<EntryListResponse>(
        { queryKey: ['digest-entries'] },
        (oldData) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            items: oldData.items.map((item) =>
              item.id === variables.entryId ? { ...item, ...updatedEntry } : item
            ),
          }
        }
      )

      // Invalidate subscription queries to update unread counts
      // This is needed for accurate sidebar counts
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
    },
  })
}

/**
 * Hook to mark all entries as read.
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ feedId, folderId }: { feedId?: string; folderId?: string }) =>
      entryService.markAllRead(feedId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['digest-entries'] })
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
    },
  })
}
