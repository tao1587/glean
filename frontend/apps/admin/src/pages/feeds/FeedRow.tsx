import React, { useMemo } from 'react'
import { Button, Skeleton } from '@glean/ui'
import {
  ExternalLink,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Trash2,
  Loader2,
  CheckSquare,
  Square,
  Wand2,
} from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'
import { mapFeedFetchRunToViewModel } from '@glean/api-client'
import { FeedFetchInlineStatus } from '@glean/ui'
import type { AdminFeed } from '../../hooks/useFeeds'
import type { FeedFetchActiveRunItem, FeedFetchLatestRunResponse } from '@glean/types'
import type { FeedRefreshState } from './hooks/useFeedRefreshPolling'
import { isPendingRefreshStatus } from './hooks/useFeedRefreshPolling'
import FeedStatusBadge from './FeedStatusBadge'
import FeedFetchProgressCell from './FeedFetchProgressCell'
import {
  localizeAdminFeedFetchStatus,
  localizeAdminFeedFetchStage,
  buildAdminFeedFetchSummary,
} from './feedFetchHelpers'

type StatusLabelKey = 'queued' | 'deferred' | 'in_progress' | 'complete' | 'not_found'

export interface FeedRowHandlers {
  onToggleSelect: (id: string) => void
  onResetError: (id: string) => void
  onToggleStatus: (id: string, currentStatus: 'active' | 'error' | 'disabled') => void
  onDelete: (id: string) => void
  onRefresh: (id: string) => void
  onOpenBackfill: (feed: AdminFeed) => void
}

interface FeedRowProps {
  feed: AdminFeed
  latestRun: FeedFetchLatestRunResponse | undefined
  activeRuns: FeedFetchActiveRunItem[]
  refreshState: FeedRefreshState | undefined
  selected: boolean
  pendingFeedId: string | null
  isResetErrorPending: boolean
  isRefreshNowPending: boolean
  isDeletePending: boolean
  isBackfillPending: boolean
  isBackfillActiveFeed: boolean
  handlers: FeedRowHandlers
}

const FeedRow = React.memo(function FeedRow({
  feed,
  latestRun,
  activeRuns,
  refreshState,
  selected,
  pendingFeedId,
  isResetErrorPending,
  isRefreshNowPending,
  isDeletePending,
  isBackfillPending,
  isBackfillActiveFeed,
  handlers,
}: FeedRowProps) {
  const { t } = useTranslation(['admin', 'feeds'])

  const statusLabelMap = useMemo(
    () =>
      ({
        queued: t('admin:feeds.refreshStatus.queued'),
        deferred: t('admin:feeds.refreshStatus.deferred'),
        in_progress: t('admin:feeds.refreshStatus.refreshing'),
        complete: t('admin:feeds.refreshStatus.completed'),
        not_found: t('admin:feeds.refreshStatus.notFound'),
      }) satisfies Record<StatusLabelKey, string>,
    [t],
  )

  const resultStatusLabelMap = useMemo(
    () => ({
      success: t('admin:feeds.refreshResult.success'),
      not_modified: t('admin:feeds.refreshResult.notModified'),
      error: t('admin:feeds.refreshResult.failed'),
    }),
    [t],
  )

  const isRefreshing = !!refreshState && isPendingRefreshStatus(refreshState.status)

  const effectiveLastFetchAttemptAt =
    refreshState?.lastFetchAttemptAt ??
    feed.last_fetch_attempt_at ??
    refreshState?.lastFetchedAt ??
    feed.last_fetched_at

  const effectiveLastFetchSuccessAt = refreshState?.lastFetchSuccessAt ?? feed.last_fetch_success_at

  const isRowError = refreshState?.resultStatus === 'error'
  const isRowDone =
    refreshState?.status === 'complete' || refreshState?.status === 'not_found'
  const isRowPending = !!refreshState && isPendingRefreshStatus(refreshState.status)
  const effectiveLastFetchDisplayAt =
    effectiveLastFetchAttemptAt ??
    (isRowPending ? (refreshState?.updatedAt ?? null) : null)

  const rowLogMessage =
    refreshState?.message ||
    refreshState?.fetchErrorMessage ||
    (isRowDone && !isRowError ? null : feed.fetch_error_message)

  const statusText = useMemo(() => {
    if (!refreshState) return null
    const baseStatusText =
      refreshState.status in statusLabelMap
        ? statusLabelMap[refreshState.status as StatusLabelKey]
        : refreshState.status
    const resultStatusText =
      refreshState.resultStatus &&
      (refreshState.resultStatus in resultStatusLabelMap
        ? resultStatusLabelMap[refreshState.resultStatus as keyof typeof resultStatusLabelMap]
        : refreshState.resultStatus)
    return `${baseStatusText}${resultStatusText ? ` · ${resultStatusText}` : ''}${refreshState.newEntries !== null ? ` · +${refreshState.newEntries}` : ''}`
  }, [refreshState, statusLabelMap, resultStatusLabelMap])

  const refreshTimestamp = useMemo(() => {
    if (!refreshState) return null
    const ts =
      refreshState.lastFetchAttemptAt || refreshState.lastFetchedAt || refreshState.updatedAt
    return format(new Date(ts), 'MMM d, yyyy HH:mm:ss')
  }, [refreshState])

  const lastFetchSuccessTimestamp = useMemo(() => {
    if (!effectiveLastFetchSuccessAt) return null
    return format(new Date(effectiveLastFetchSuccessAt), 'MMM d, yyyy HH:mm:ss')
  }, [effectiveLastFetchSuccessAt])

  const lastFetchDisplayTimestamp = useMemo(() => {
    if (!effectiveLastFetchDisplayAt) return null
    return format(new Date(effectiveLastFetchDisplayAt), 'MMM d, yyyy HH:mm')
  }, [effectiveLastFetchDisplayAt])

  const createdAtTimestamp = useMemo(
    () => format(new Date(feed.created_at), 'MMM d, yyyy'),
    [feed.created_at],
  )

  const latestViewModel = useMemo(() => mapFeedFetchRunToViewModel(latestRun), [latestRun])

  const inlineStatusLabel = useMemo(
    () =>
      localizeAdminFeedFetchStatus(
        t,
        latestViewModel?.statusKey ?? (latestRun?.next_fetch_at ? 'scheduled' : 'not_started'),
        latestViewModel?.statusLabel ?? '',
      ),
    [t, latestViewModel, latestRun],
  )

  const inlineStageLabel = useMemo(
    () =>
      localizeAdminFeedFetchStage(
        t,
        latestViewModel?.stageKey,
        latestRun?.next_fetch_at
          ? t('feeds.feedFetchProgress.emptyStates.waitingWindow')
          : t('feeds.feedFetchProgress.emptyStates.noRunYet'),
      ),
    [t, latestViewModel, latestRun],
  )

  const inlineSummaryText = useMemo(
    () => buildAdminFeedFetchSummary(t, latestRun),
    [t, latestRun],
  )

  return (
    <tr
      className={`hover:bg-muted/50 transition-colors ${selected ? 'bg-primary/5' : ''}`}
    >
      <td className="w-10 px-4 py-4">
        <button
          onClick={() => handlers.onToggleSelect(feed.id)}
          className="text-muted-foreground hover:text-foreground flex items-center"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">{feed.title}</p>
            <a
              href={feed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary mt-1 flex items-center gap-1 truncate text-xs"
            >
              {feed.url}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
            {refreshState && (
              <div className="mt-2 space-y-1">
                <div
                  className={`flex items-center gap-2 text-xs ${isRowError ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  <span>{statusText}</span>
                  <span>{refreshTimestamp}</span>
                </div>
                {lastFetchSuccessTimestamp && (
                  <div className="text-muted-foreground text-xs">
                    {t('admin:feeds.lastSuccessLabel')}: {lastFetchSuccessTimestamp}
                  </div>
                )}
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  {isRowPending && (
                    <div className="bg-primary h-full w-1/4 animate-progress-indeterminate rounded-full" />
                  )}
                  {isRowDone && !isRowError && (
                    <div className="bg-primary h-full w-full rounded-full transition-all duration-500" />
                  )}
                  {isRowError && (
                    <div className="bg-destructive h-full w-full rounded-full" />
                  )}
                </div>
                {rowLogMessage && (
                  <div
                    className={`flex items-start gap-1 text-xs ${isRowError ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {isRowError && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                    <p className="line-clamp-2">{rowLogMessage}</p>
                  </div>
                )}
              </div>
            )}
            {latestViewModel && (
              <div className="mt-2">
                <FeedFetchInlineStatus
                  statusLabel={inlineStatusLabel}
                  statusTone={latestViewModel.statusTone}
                  stageLabel={inlineStageLabel}
                  stageProgressLabel={latestViewModel.stageProgressLabel}
                  progressPercent={latestViewModel.progressPercent}
                  summaryText={inlineSummaryText}
                  estimatedStartLabel={latestViewModel.estimatedStartLabel}
                  estimatedFinishLabel={latestViewModel.estimatedFinishLabel}
                  nextFetchLabel={latestViewModel.nextFetchLabel}
                  stagePrefix={t('feeds.feedFetchProgress.inline.stage')}
                  estimatedStartPrefix={t('feeds.feedFetchProgress.inline.etaStart')}
                  estimatedFinishPrefix={t('feeds.feedFetchProgress.inline.etaFinish')}
                  nextFetchPrefix={t('feeds.feedFetchProgress.inline.nextFetch')}
                />
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <FeedStatusBadge
          status={feed.status}
          errorCount={feed.error_count}
          errorMessage={feed.fetch_error_message}
        />
      </td>
      <td className="px-6 py-4">
        <p className="text-muted-foreground text-sm">{feed.subscriber_count}</p>
      </td>
      <td className="px-6 py-4">
        <p className="text-muted-foreground text-sm">
          {lastFetchDisplayTimestamp ?? t('admin:feeds.neverFetched')}
        </p>
      </td>
      <td className="px-6 py-4">
        <p className="text-muted-foreground text-sm">{createdAtTimestamp}</p>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <FeedFetchProgressCell
            feed={feed}
            refreshState={refreshState}
            initialLatestRun={latestRun}
            activeRuns={activeRuns}
          />
          {feed.error_count > 0 && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => handlers.onResetError(feed.id)}
              disabled={isResetErrorPending}
              title={t('admin:feeds.resetTooltip')}
            >
              {isResetErrorPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={() => handlers.onRefresh(feed.id)}
            disabled={isRefreshing || isRefreshNowPending}
            title={t('admin:feeds.refreshNowTooltip')}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => handlers.onOpenBackfill(feed)}
            disabled={isBackfillPending}
            title={t('admin:feeds.contentBackfill.open')}
          >
            {isBackfillActiveFeed && isBackfillPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant={feed.status === 'active' ? 'outline' : 'default'}
            onClick={() => handlers.onToggleStatus(feed.id, feed.status)}
            disabled={pendingFeedId === feed.id}
            title={
              feed.status === 'active'
                ? t('admin:feeds.disableTooltip')
                : t('admin:feeds.enableTooltip')
            }
          >
            {pendingFeedId === feed.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : feed.status === 'active' ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="destructive-outline"
            onClick={() => handlers.onDelete(feed.id)}
            disabled={isDeletePending}
            title={t('admin:feeds.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
})

export default FeedRow

export function FeedRowSkeleton() {
  return (
    <tr>
      <td className="w-10 px-4 py-4">
        <Skeleton className="h-4 w-4" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-1 h-3 w-64" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-6 w-20" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-8" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-6 py-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-6 py-4">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </td>
    </tr>
  )
}
