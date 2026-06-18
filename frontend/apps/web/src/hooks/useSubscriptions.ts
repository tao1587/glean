import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { feedService } from '@glean/api-client'
import type {
  DiscoverFeedRequest,
  UpdateSubscriptionRequest,
  BatchDeleteSubscriptionsRequest,
  SubscriptionListParams,
  Subscription,
  SubscriptionListResponse,
  RefreshStatusRequest,
} from '@glean/types'
import { useCallback, useRef } from 'react'

const SUBSCRIPTIONS_CACHE_KEY = 'glean_subscriptions_cache_v2'
const SUBSCRIPTIONS_ETAG_KEY = 'glean_subscriptions_etag_v2'
const ENTRIES_QUERY_KEY = ['entries'] as const

// One-time cleanup of legacy cache keys from prior schema versions.
// Old caches may have stale shape (e.g. missing folder_id) and, combined
// with ETag 304 responses, cause subscriptions to render incorrectly.
try {
  localStorage.removeItem('glean_subscriptions_cache')
  localStorage.removeItem('glean_subscriptions_etag')
} catch {
  // ignore (e.g. SSR / storage disabled)
}

function isValidSubscriptionArray(value: unknown): value is Subscription[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'feed_id' in (item as Record<string, unknown>)
  )
}

function invalidateEntriesCache(queryClient: ReturnType<typeof useQueryClient>) {
  // Feed refresh runs asynchronously in the worker queue.
  // Invalidate now and again shortly after to pick up late-arriving entries.
  queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY })
  window.setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY })
  }, 3000)
  window.setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY })
  }, 10000)
}

function removeSubscriptionFromList(
  data: SubscriptionListResponse | undefined,
  subscriptionIds: Set<string>
): SubscriptionListResponse | undefined {
  if (!data) return data

  const items = data.items.filter((item) => !subscriptionIds.has(item.id))
  const removed = data.items.length - items.length
  if (removed === 0) return data

  const total = Math.max(0, data.total - removed)
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, data.per_page)))

  return {
    ...data,
    items,
    total,
    total_pages: totalPages,
    page: Math.min(data.page, totalPages),
  }
}

function removeSubscriptionFromSync(
  data: Subscription[] | undefined,
  subscriptionIds: Set<string>
): Subscription[] | undefined {
  if (!data) return data
  const items = data.filter((item) => !subscriptionIds.has(item.id))
  return items.length === data.length ? data : items
}

/**
 * Query key factory for subscriptions.
 */
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  lists: () => [...subscriptionKeys.all, 'list'] as const,
  list: (params: SubscriptionListParams) => [...subscriptionKeys.lists(), params] as const,
  sync: () => [...subscriptionKeys.all, 'sync'] as const,
  detail: (id: string) => [...subscriptionKeys.all, 'detail', id] as const,
}

/**
 * Hook to fetch paginated user subscriptions.
 */
export function useSubscriptions(params: SubscriptionListParams = {}) {
  return useQuery({
    queryKey: subscriptionKeys.list(params),
    queryFn: () => feedService.getSubscriptions(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * Hook to sync all subscriptions with ETag-based caching.
 * Uses localStorage to cache subscriptions and only fetches new data when changed.
 */
export function useAllSubscriptions() {
  const queryClient = useQueryClient()
  const etagRef = useRef<string | null>(null)

  // Initialize etag from localStorage
  if (etagRef.current === null) {
    etagRef.current = localStorage.getItem(SUBSCRIPTIONS_ETAG_KEY)
  }

  const query = useQuery({
    queryKey: subscriptionKeys.sync(),
    queryFn: async (): Promise<Subscription[]> => {
      // Get cached data from localStorage
      const cachedData = localStorage.getItem(SUBSCRIPTIONS_CACHE_KEY)
      const cachedEtag = etagRef.current

      try {
        const result = await feedService.syncAllSubscriptions(cachedEtag || undefined)

        if (result.data) {
          // Data changed, update cache
          localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify(result.data.items))
          if (result.etag) {
            localStorage.setItem(SUBSCRIPTIONS_ETAG_KEY, result.etag)
            etagRef.current = result.etag
          }
          return result.data.items
        } else {
          // Data unchanged (304), use cached data
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData) as unknown
              if (isValidSubscriptionArray(parsed)) {
                return parsed
              }
            } catch {
              // fallthrough to discard
            }
            // Malformed/stale shape — discard and force fresh fetch next time
            localStorage.removeItem(SUBSCRIPTIONS_CACHE_KEY)
            localStorage.removeItem(SUBSCRIPTIONS_ETAG_KEY)
            etagRef.current = null
          }
          // No cached data available, return empty array
          return []
        }
      } catch (error) {
        // On error, try to return cached data
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData) as unknown
            if (isValidSubscriptionArray(parsed)) {
              return parsed
            }
          } catch {
            // fallthrough
          }
        }
        throw error
      }
    },
    // Use cached data as initial data
    initialData: () => {
      const cachedData = localStorage.getItem(SUBSCRIPTIONS_CACHE_KEY)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData) as unknown
          if (isValidSubscriptionArray(parsed)) {
            return parsed
          }
        } catch {
          return undefined
        }
        // Malformed shape — discard so the query refetches fresh
        localStorage.removeItem(SUBSCRIPTIONS_CACHE_KEY)
        localStorage.removeItem(SUBSCRIPTIONS_ETAG_KEY)
      }
      return undefined
    },
    staleTime: 1000 * 60 * 5, // Consider data stale after 5 minutes
    refetchOnWindowFocus: false,
  })

  // Function to force refresh (clear cache and refetch)
  const forceRefresh = useCallback(() => {
    localStorage.removeItem(SUBSCRIPTIONS_CACHE_KEY)
    localStorage.removeItem(SUBSCRIPTIONS_ETAG_KEY)
    etagRef.current = null
    queryClient.invalidateQueries({ queryKey: subscriptionKeys.sync() })
  }, [queryClient])

  return {
    ...query,
    forceRefresh,
  }
}

/**
 * Hook to fetch a single subscription.
 */
export function useSubscription(subscriptionId: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(subscriptionId),
    queryFn: () => feedService.getSubscription(subscriptionId),
    enabled: !!subscriptionId,
  })
}

/**
 * Clear subscription cache to force fresh fetch on next sync.
 */
export function clearSubscriptionCache() {
  localStorage.removeItem(SUBSCRIPTIONS_CACHE_KEY)
  localStorage.removeItem(SUBSCRIPTIONS_ETAG_KEY)
}

/**
 * Hook to discover and subscribe to a feed.
 */
export function useDiscoverFeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: DiscoverFeedRequest) => feedService.discoverFeed(data),
    onSuccess: () => {
      // Clear cache and invalidate all subscription queries
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to update a subscription.
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      subscriptionId,
      data,
    }: {
      subscriptionId: string
      data: UpdateSubscriptionRequest
    }) => feedService.updateSubscription(subscriptionId, data),
    onSuccess: (_, variables) => {
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      queryClient.invalidateQueries({
        queryKey: subscriptionKeys.detail(variables.subscriptionId),
      })
    },
  })
}

/**
 * Hook to delete a subscription.
 */
export function useDeleteSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (subscriptionId: string) => feedService.deleteSubscription(subscriptionId),
    onMutate: async (subscriptionId: string) => {
      const deletedIds = new Set([subscriptionId])
      await queryClient.cancelQueries({ queryKey: subscriptionKeys.all })

      const previousLists = queryClient.getQueriesData<SubscriptionListResponse>({
        queryKey: subscriptionKeys.lists(),
      })
      const previousSync = queryClient.getQueryData<Subscription[]>(subscriptionKeys.sync())

      queryClient.setQueriesData<SubscriptionListResponse>(
        { queryKey: subscriptionKeys.lists() },
        (old) => removeSubscriptionFromList(old, deletedIds)
      )
      queryClient.setQueryData<Subscription[] | undefined>(subscriptionKeys.sync(), (old) => {
        const next = removeSubscriptionFromSync(old, deletedIds)
        if (next) {
          localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify(next))
        }
        return next
      })

      return { previousLists, previousSync }
    },
    onError: (_error, _subscriptionId, context) => {
      if (!context) return

      context.previousLists.forEach(([key, value]) => {
        queryClient.setQueryData(key, value)
      })
      queryClient.setQueryData(subscriptionKeys.sync(), context.previousSync)
      if (context.previousSync) {
        localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify(context.previousSync))
      }
    },
    onSuccess: () => {
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to batch delete subscriptions.
 */
export function useBatchDeleteSubscriptions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BatchDeleteSubscriptionsRequest) =>
      feedService.batchDeleteSubscriptions(data),
    onMutate: async (data: BatchDeleteSubscriptionsRequest) => {
      const deletedIds = new Set(data.subscription_ids)
      await queryClient.cancelQueries({ queryKey: subscriptionKeys.all })

      const previousLists = queryClient.getQueriesData<SubscriptionListResponse>({
        queryKey: subscriptionKeys.lists(),
      })
      const previousSync = queryClient.getQueryData<Subscription[]>(subscriptionKeys.sync())

      queryClient.setQueriesData<SubscriptionListResponse>(
        { queryKey: subscriptionKeys.lists() },
        (old) => removeSubscriptionFromList(old, deletedIds)
      )
      queryClient.setQueryData<Subscription[] | undefined>(subscriptionKeys.sync(), (old) => {
        const next = removeSubscriptionFromSync(old, deletedIds)
        if (next) {
          localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify(next))
        }
        return next
      })

      return { previousLists, previousSync }
    },
    onError: (_error, _data, context) => {
      if (!context) return

      context.previousLists.forEach(([key, value]) => {
        queryClient.setQueryData(key, value)
      })
      queryClient.setQueryData(subscriptionKeys.sync(), context.previousSync)
      if (context.previousSync) {
        localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify(context.previousSync))
      }
    },
    onSuccess: () => {
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to manually refresh a feed.
 */
export function useRefreshFeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (subscriptionId: string) => feedService.refreshFeed(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to manually refresh all user's subscribed feeds.
 */
export function useRefreshAllFeeds() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => feedService.refreshAllFeeds(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to query per-feed refresh job statuses.
 */
export function useRefreshStatus() {
  return useMutation({
    mutationFn: (data: RefreshStatusRequest) => feedService.getRefreshStatus(data),
  })
}

/**
 * Hook to import OPML file.
 */
export function useImportOPML() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => feedService.importOPML(file),
    onSuccess: () => {
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      invalidateEntriesCache(queryClient)
    },
  })
}

/**
 * Hook to export OPML file.
 */
export function useExportOPML() {
  return useMutation({
    mutationFn: () => feedService.exportOPML(),
    onSuccess: (blob) => {
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'glean-subscriptions.opml'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    },
  })
}
