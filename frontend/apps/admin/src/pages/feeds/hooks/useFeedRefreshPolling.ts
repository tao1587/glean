import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  useActiveFeedFetchRuns,
  useLatestFeedFetchRuns,
  useRefreshFeedStatus,
} from '../../../hooks/useFeeds'
import { usePageVisible } from '../../../hooks/usePollingEnabled'
import type { FeedFetchActiveRunItem, FeedFetchLatestRunResponse } from '@glean/types'

export type FeedRefreshState = {
  jobId: string
  status: string
  resultStatus: string | null
  newEntries: number | null
  message: string | null
  lastFetchAttemptAt: string | null
  lastFetchSuccessAt: string | null
  lastFetchedAt: string | null
  errorCount: number
  fetchErrorMessage: string | null
  updatedAt: string
}

export function isPendingRefreshStatus(status: string) {
  return status === 'queued' || status === 'deferred' || status === 'in_progress'
}

interface UseFeedRefreshPollingResult {
  activeRuns: FeedFetchActiveRunItem[]
  latestRunsByFeedId: Map<string, FeedFetchLatestRunResponse>
  feedRefreshState: Record<string, FeedRefreshState>
  handleRefreshFeed: (feedId: string, jobId: string) => void
  applyRefreshJobs: (jobs: Array<{ feed_id: string; job_id: string }>) => void
  upsertFeedRefreshStatus: (
    items: Array<{
      feed_id: string
      job_id: string
      status: string
      result_status: string | null
      new_entries: number | null
      message: string | null
      last_fetch_attempt_at: string | null
      last_fetch_success_at: string | null
      last_fetched_at: string | null
      error_count: number
      fetch_error_message: string | null
    }>,
  ) => void
}

export function useFeedRefreshPolling(
  feedIds: string[],
  onRefetchNeeded: () => void,
): UseFeedRefreshPollingResult {
  const pageVisible = usePageVisible()
  const [feedRefreshState, setFeedRefreshState] = useState<Record<string, FeedRefreshState>>({})

  const hasPendingRefresh = Object.values(feedRefreshState).some((s) =>
    isPendingRefreshStatus(s.status),
  )

  const activeRunsQuery = useActiveFeedFetchRuns(feedIds.length > 0, hasPendingRefresh && pageVisible)
  const latestRunsQuery = useLatestFeedFetchRuns(feedIds, feedIds.length > 0, hasPendingRefresh && pageVisible)
  const refreshFeedStatusMutation = useRefreshFeedStatus()

  // Stash latest callbacks so the interval never captures stale closures.
  const callbacksRef = useRef({ onRefetchNeeded, mutateAsync: refreshFeedStatusMutation.mutateAsync })
  callbacksRef.current = { onRefetchNeeded, mutateAsync: refreshFeedStatusMutation.mutateAsync }

  const latestRunsByFeedId = useMemo(
    () => new Map((latestRunsQuery.data?.items ?? []).map((i) => [i.feed_id, i])),
    [latestRunsQuery.data?.items],
  )

  const upsertFeedRefreshStatus = useCallback(
    (
      items: Array<{
        feed_id: string
        job_id: string
        status: string
        result_status: string | null
        new_entries: number | null
        message: string | null
        last_fetch_attempt_at: string | null
        last_fetch_success_at: string | null
        last_fetched_at: string | null
        error_count: number
        fetch_error_message: string | null
      }>,
    ) => {
      const nowIso = new Date().toISOString()
      setFeedRefreshState((prev) => {
        const next = { ...prev }
        for (const item of items) {
          next[item.feed_id] = {
            jobId: item.job_id,
            status: item.status,
            resultStatus: item.result_status,
            newEntries: item.new_entries,
            message: item.message,
            lastFetchAttemptAt: item.last_fetch_attempt_at,
            lastFetchSuccessAt: item.last_fetch_success_at,
            lastFetchedAt: item.last_fetched_at,
            errorCount: item.error_count,
            fetchErrorMessage: item.fetch_error_message,
            updatedAt: nowIso,
          }
        }
        return next
      })
    },
    [],
  )

  const applyRefreshJobs = useCallback((jobs: Array<{ feed_id: string; job_id: string }>) => {
    const nowIso = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const job of jobs) {
        next[job.feed_id] = {
          jobId: job.job_id,
          status: 'queued',
          resultStatus: null,
          newEntries: null,
          message: null,
          lastFetchAttemptAt: null,
          lastFetchSuccessAt: null,
          lastFetchedAt: null,
          errorCount: 0,
          fetchErrorMessage: null,
          updatedAt: nowIso,
        }
      }
      return next
    })
  }, [])

  const handleRefreshFeed = useCallback((feedId: string, jobId: string) => {
    setFeedRefreshState((prev) => ({
      ...prev,
      [feedId]: {
        jobId,
        status: 'queued',
        resultStatus: null,
        newEntries: null,
        message: null,
        lastFetchAttemptAt: null,
        lastFetchSuccessAt: null,
        lastFetchedAt: null,
        errorCount: 0,
        fetchErrorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    }))
  }, [])

  // Stable key that only changes when the set of pending feed IDs changes.
  const pendingIds = Object.entries(feedRefreshState)
    .filter(([, s]) => isPendingRefreshStatus(s.status))
    .map(([feedId]) => feedId)
  const pendingItemsKey = pendingIds.join(',')

  useEffect(() => {
    if (!pendingItemsKey) return

    const timer = window.setInterval(async () => {
      const items = Object.entries(feedRefreshState)
        .filter(([, s]) => isPendingRefreshStatus(s.status))
        .map(([feedId, s]) => ({ feed_id: feedId, job_id: s.jobId }))
      if (items.length === 0) return
      try {
        const result = await callbacksRef.current.mutateAsync(items)
        upsertFeedRefreshStatus(result.items)
        if (result.items.some((item) => item.status === 'complete')) {
          callbacksRef.current.onRefetchNeeded()
        }
      } catch {
        // Keep previous status on polling failures
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [pendingItemsKey, feedRefreshState, upsertFeedRefreshStatus])

  return {
    activeRuns: activeRunsQuery.data?.items ?? [],
    latestRunsByFeedId,
    feedRefreshState,
    handleRefreshFeed,
    applyRefreshJobs,
    upsertFeedRefreshStatus,
  }
}
