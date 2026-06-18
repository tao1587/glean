import { useQuery } from '@tanstack/react-query'
import {
  feedService,
  mapFeedFetchRunToViewModel,
  type FeedFetchProgressViewModel,
} from '@glean/api-client'
import type { FeedFetchLatestRunResponse, FeedFetchRunBatchLatestResponse, FeedFetchRunHistoryResponse } from '@glean/types'
import type { FeedFetchActiveRunsResponse } from '@glean/types'

export const feedFetchProgressKeys = {
  all: ['feed-fetch-progress'] as const,
  latest: (feedId: string) => [...feedFetchProgressKeys.all, 'latest', feedId] as const,
  latestBatch: (feedIds: string[]) => [...feedFetchProgressKeys.all, 'latest-batch', ...feedIds] as const,
  history: (feedId: string) => [...feedFetchProgressKeys.all, 'history', feedId] as const,
  active: () => [...feedFetchProgressKeys.all, 'active'] as const,
}

export function useActiveFeedFetchRuns(enabled = true) {
  return useQuery({
    queryKey: feedFetchProgressKeys.active(),
    queryFn: () => feedService.getActiveFeedFetchRuns(),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  })
}

export function useFeedFetchProgress(feedId: string, enabled = true) {
  const latestRunQuery = useQuery({
    queryKey: feedFetchProgressKeys.latest(feedId),
    queryFn: () => feedService.getLatestFeedFetchRun(feedId),
    enabled: enabled && !!feedId,
    refetchInterval: enabled ? 15000 : false,
  })

  const historyQuery = useQuery({
    queryKey: feedFetchProgressKeys.history(feedId),
    queryFn: () => feedService.getFeedFetchRunHistory(feedId),
    enabled: false,
  })

  return {
    latestRunQuery,
    historyQuery,
    viewModel: mapFeedFetchRunToViewModel(latestRunQuery.data),
    loadHistory: () => historyQuery.refetch(),
  }
}

export function useFeedFetchProgressList(feedIds: string[], enabled = true) {
  const normalizedFeedIds = Array.from(new Set(feedIds)).sort()
  const latestRunsQuery = useQuery({
    queryKey: feedFetchProgressKeys.latestBatch(normalizedFeedIds),
    queryFn: () => feedService.getLatestFeedFetchRuns(normalizedFeedIds),
    enabled: enabled && normalizedFeedIds.length > 0,
    refetchInterval: enabled ? 15000 : false,
  })

  const latestRunsByFeedId = new Map<string, FeedFetchLatestRunResponse>()
  for (const item of latestRunsQuery.data?.items ?? []) {
    latestRunsByFeedId.set(item.feed_id, item)
  }

  return {
    latestRunsQuery,
    latestRunsByFeedId,
  }
}
export { mapFeedFetchRunToViewModel, type FeedFetchProgressViewModel }
export type { FeedFetchRunBatchLatestResponse, FeedFetchRunHistoryResponse }
export type { FeedFetchActiveRunsResponse }
