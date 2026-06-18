import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePageVisible, conditionalInterval } from './usePollingEnabled'
import type {
  FeedFetchActiveRunsResponse,
  FeedFetchLatestRunResponse,
  FeedFetchRun,
  FeedFetchRunBatchLatestResponse,
  FeedFetchRunHistoryResponse,
  FeedRefreshJob,
  RefreshStatusItem,
} from '@glean/types'

interface Feed {
  id: string
  url: string
  title: string
  source_type: 'feed' | 'rsshub'
  status: 'active' | 'error' | 'disabled'
  subscriber_count: number
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  error_count: number
  fetch_error_message: string | null
  created_at: string
}

interface FeedDetail extends Feed {
  description: string | null
  icon_url: string | null
  last_error_message: string | null
}

interface FeedListResponse {
  items: Feed[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

interface FeedListParams {
  page?: number
  per_page?: number
  status?: 'active' | 'error' | 'disabled'
  search?: string
  sort?: string
  order?: string
}

export type AdminFeedRefreshJob = FeedRefreshJob
export type AdminFeedRefreshStatusItem = RefreshStatusItem
export type AdminFeed = Feed
export type AdminFeedFetchRun = FeedFetchRun

export interface AdminContentBackfillCandidate {
  id: string
  feed_id: string
  url: string
  title: string
  published_at: string | null
  content_backfill_status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  content_source: 'feed_fulltext' | 'feed_summary_only' | 'backfill_http' | 'backfill_browser' | null
  content_backfill_attempts: number
  content_length: number
  summary_length: number
}

export interface AdminContentBackfillRequest {
  limit?: number
  published_after?: string
  published_before?: string
  force?: boolean
  missing_only?: boolean
  dry_run?: boolean
}

export interface AdminContentBackfillResponse {
  feed_id: string
  matched: number
  enqueued: number
  skipped: number
  dry_run: boolean
  candidates: AdminContentBackfillCandidate[]
}

/** Patches a single feed's row across all cached feed list variants. */
function patchFeedInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updatedFeed: Feed,
): void {
  queryClient.setQueriesData<FeedListResponse>(
    { queryKey: ['admin', 'feeds'] },
    (old) => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map((f) => (f.id === updatedFeed.id ? { ...f, ...updatedFeed } : f)),
      }
    },
  )
}

export function useFeeds(params: FeedListParams = {}) {
  return useQuery<FeedListResponse>({
    queryKey: ['admin', 'feeds', params],
    queryFn: async () => {
      const response = await api.get('/feeds', { params })
      return response.data
    },
  })
}

/** Thin wrapper returning only { items, total, isLoading } — use instead of useFeeds when the full response is not needed. */
export function useFeedList(params: FeedListParams = {}) {
  return useQuery<FeedListResponse, Error, { items: Feed[]; total: number }>({
    queryKey: ['admin', 'feeds', params],
    queryFn: async () => {
      const response = await api.get('/feeds', { params })
      return response.data
    },
    select: (data) => ({ items: data.items, total: data.total }),
  })
}

export function useFeed(feedId: string | null) {
  return useQuery<FeedDetail>({
    queryKey: ['admin', 'feed', feedId],
    queryFn: async () => {
      const response = await api.get(`/feeds/${feedId}`)
      return response.data
    },
    enabled: !!feedId,
  })
}

export function useResetFeedError() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (feedId: string) => {
      const response = await api.post(`/feeds/${feedId}/reset-error`)
      return response.data as Feed
    },
    onSuccess: (updatedFeed: Feed) => {
      patchFeedInCache(queryClient, updatedFeed)
      queryClient.invalidateQueries({ queryKey: ['admin', 'feed'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'feed'] })
    },
  })
}

export function useUpdateFeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      feedId,
      data,
    }: {
      feedId: string
      data: { url?: string; title?: string; status?: 'active' | 'error' | 'disabled' }
    }) => {
      const response = await api.patch(`/feeds/${feedId}`, data)
      return response.data as Feed
    },
    onSuccess: (updatedFeed: Feed) => {
      patchFeedInCache(queryClient, updatedFeed)
      queryClient.invalidateQueries({ queryKey: ['admin', 'feed'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'feed'] })
    },
  })
}

export function useDeleteFeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (feedId: string) => {
      await api.delete(`/feeds/${feedId}`)
      return feedId
    },
    onSuccess: (feedId: string) => {
      queryClient.setQueriesData<FeedListResponse>(
        { queryKey: ['admin', 'feeds'] },
        (old) => {
          if (!old) return old
          const items = old.items.filter((f) => f.id !== feedId)
          const removed = old.items.length - items.length
          return { ...old, items, total: old.total - removed }
        },
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
    },
  })
}

export function useBatchFeedOperation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ action, feedIds }: { action: string; feedIds: string[] }) => {
      const response = await api.post('/feeds/batch', { action, feed_ids: feedIds })
      return { affected: response.data as { affected: number }, action, feedIds }
    },
    onSuccess: ({ action }: { affected: { affected: number }; action: string; feedIds: string[] }) => {
      if (action === 'delete') {
        // Invalidate to get authoritative totals across all pages after bulk delete
        queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
      } else {
        // enable/disable/reset_error: API returns only a count, must refetch for updated row data
        queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feeds'] })
    },
  })
}

export function useRefreshFeedNow() {
  return useMutation({
    mutationFn: async (feedId: string) => {
      const response = await api.post(`/feeds/${feedId}/refresh`)
      return response.data as {
        status: string
        feed_id: string
        job_id: string
        feed_title?: string
      }
    },
  })
}

export function useRefreshAllFeedsNow() {
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/feeds/refresh/all')
      return response.data as {
        status: string
        queued_count: number
        jobs: AdminFeedRefreshJob[]
      }
    },
  })
}

export function useRefreshErroredFeedsNow() {
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/feeds/refresh-errored')
      return response.data as {
        status: string
        queued_count: number
        jobs: AdminFeedRefreshJob[]
      }
    },
  })
}

export function useRefreshFeedStatus() {
  return useMutation({
    mutationFn: async (items: Array<{ feed_id: string; job_id: string }>) => {
      const response = await api.post('/feeds/refresh/status', { items })
      return response.data as { items: AdminFeedRefreshStatusItem[] }
    },
  })
}

export function useLatestFeedFetchRun(feedId: string, enabled = true) {
  return useQuery<FeedFetchLatestRunResponse>({
    queryKey: ['admin', 'feed-fetch-progress', 'latest', feedId],
    queryFn: async () => {
      const response = await api.get(`/feeds/${feedId}/fetch-runs/latest`)
      return response.data
    },
    enabled: enabled && !!feedId,
    refetchInterval: enabled ? 15000 : false,
  })
}

/**
 * Polls only when page is visible AND hasPending is true.
 * Wave 3: pass hasPending={true} from FeedsPage when there are queued/running jobs.
 * Until then polling is off by default (hasPending defaults to false).
 */
export function useLatestFeedFetchRuns(feedIds: string[], enabled = true, hasPending = false) {
  const pageVisible = usePageVisible()
  const normalizedFeedIds = Array.from(new Set(feedIds)).sort()

  return useQuery<FeedFetchRunBatchLatestResponse>({
    queryKey: ['admin', 'feed-fetch-progress', 'latest-batch', ...normalizedFeedIds],
    queryFn: async () => {
      const response = await api.post('/feeds/fetch-runs/latest', { feed_ids: normalizedFeedIds })
      return response.data
    },
    enabled: enabled && normalizedFeedIds.length > 0,
    refetchInterval: conditionalInterval(hasPending && pageVisible, 15000),
  })
}

export function useFeedFetchRunHistory(feedId: string, enabled = true) {
  return useQuery<FeedFetchRunHistoryResponse>({
    queryKey: ['admin', 'feed-fetch-progress', 'history', feedId],
    queryFn: async () => {
      const response = await api.get(`/feeds/${feedId}/fetch-runs/history`)
      return response.data
    },
    enabled: enabled && !!feedId,
  })
}

/**
 * Polls only when page is visible AND hasPending is true.
 * Wave 3: pass hasPending={true} from FeedsPage when there are queued/running jobs.
 * Until then polling is off by default (hasPending defaults to false).
 */
export function useActiveFeedFetchRuns(enabled = true, hasPending = false) {
  const pageVisible = usePageVisible()

  return useQuery<FeedFetchActiveRunsResponse>({
    queryKey: ['admin', 'feed-fetch-progress', 'active'],
    queryFn: async () => {
      const response = await api.get('/feeds/fetch-runs/active')
      return response.data
    },
    enabled,
    refetchInterval: conditionalInterval(hasPending && pageVisible, 15000),
  })
}

export function useFeedContentBackfillCandidates() {
  return useMutation({
    mutationFn: async ({
      feedId,
      params,
    }: {
      feedId: string
      params: AdminContentBackfillRequest
    }) => {
      const response = await api.get(`/feeds/${feedId}/backfill-content/candidates`, {
        params,
      })
      return response.data as AdminContentBackfillResponse
    },
  })
}

export function useEnqueueFeedContentBackfill() {
  return useMutation({
    mutationFn: async ({
      feedId,
      data,
    }: {
      feedId: string
      data: AdminContentBackfillRequest
    }) => {
      const response = await api.post(`/feeds/${feedId}/backfill-content`, data)
      return response.data as AdminContentBackfillResponse
    },
  })
}
