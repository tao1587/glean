import React, { useState } from 'react'
import {
  Button,
  Skeleton,
  Sheet,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  FeedFetchProgress,
} from '@glean/ui'
import { Activity } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { mapFeedFetchRunToViewModel } from '@glean/api-client'
import { useLatestFeedFetchRun, useFeedFetchRunHistory } from '../../hooks/useFeeds'
import type { AdminFeed } from '../../hooks/useFeeds'
import type { FeedFetchActiveRunItem, FeedFetchLatestRunResponse } from '@glean/types'
import type { FeedRefreshState } from './hooks/useFeedRefreshPolling'
import {
  localizeAdminFeedFetchStatus,
  localizeAdminFeedFetchStage,
  buildAdminFeedFetchDetails,
  buildAdminFeedFetchHistoryItems,
  buildAdminFeedFetchStageItems,
  buildAdminFeedFetchQueueSections,
  buildAdminDiagnosticText,
  buildAdminFeedFetchSummary,
} from './feedFetchHelpers'

interface FeedFetchProgressCellProps {
  feed: AdminFeed
  refreshState?: FeedRefreshState
  initialLatestRun?: FeedFetchLatestRunResponse
  activeRuns: FeedFetchActiveRunItem[]
}

const FeedFetchProgressCell = React.memo(function FeedFetchProgressCell({
  feed,
  refreshState,
  initialLatestRun,
  activeRuns,
}: FeedFetchProgressCellProps) {
  const { t } = useTranslation('admin')
  const [open, setOpen] = useState(false)
  const latestRunQuery = useLatestFeedFetchRun(feed.id, open)
  const historyQuery = useFeedFetchRunHistory(feed.id, open)
  const latestRun = latestRunQuery.data ?? initialLatestRun
  const viewModel = mapFeedFetchRunToViewModel(latestRun)
  const details = buildAdminFeedFetchDetails(t, latestRun, feed)
  const historyItems = buildAdminFeedFetchHistoryItems(t, historyQuery.data?.items ?? [])
  const stageItems = buildAdminFeedFetchStageItems(t, latestRun?.stages ?? [])
  const queueSections = buildAdminFeedFetchQueueSections(t, activeRuns, latestRun?.id ?? null)
  const currentDiagnosticText = buildAdminDiagnosticText(t, latestRun)
  const summaryText = buildAdminFeedFetchSummary(t, latestRun)
  const statusLabel = localizeAdminFeedFetchStatus(
    t,
    viewModel?.statusKey,
    latestRun?.next_fetch_at ? 'scheduled' : 'not_started',
  )
  const stageLabel = localizeAdminFeedFetchStage(
    t,
    viewModel?.stageKey,
    latestRun?.next_fetch_at
      ? t('feeds.feedFetchProgress.emptyStates.waitingWindow')
      : t('feeds.feedFetchProgress.emptyStates.noRunYet'),
  )

  const isActiveRefresh =
    !!refreshState &&
    (refreshState.status === 'queued' ||
      refreshState.status === 'deferred' ||
      refreshState.status === 'in_progress')

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="icon"
            variant="outline"
            title={t('feeds.feedFetchProgress.button')}
            className={isActiveRefresh ? 'border-primary/50 text-primary' : undefined}
          >
            <Activity className={`h-4 w-4 ${isActiveRefresh ? 'animate-pulse' : ''}`} />
          </Button>
        }
      />
      <SheetPopup side="right" inset className="max-w-2xl">
        <SheetHeader>
          <SheetTitle>{feed.title || feed.url}</SheetTitle>
          <SheetDescription>{t('feeds.feedFetchProgress.description')}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-4">
          {latestRunQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : viewModel ? (
            <FeedFetchProgress
              title={t('feeds.feedFetchProgress.currentRun')}
              statusLabel={statusLabel}
              statusTone={viewModel.statusTone}
              stageLabel={stageLabel}
              stageProgressLabel={viewModel.stageProgressLabel}
              progressPercent={viewModel.progressPercent}
              summaryText={summaryText}
              estimatedStartLabel={viewModel.estimatedStartLabel}
              estimatedFinishLabel={viewModel.estimatedFinishLabel}
              predictionLabel={
                viewModel.predictionLabel ? t('feeds.feedFetchProgress.predictionLabel') : null
              }
              progressLabel={t('feeds.feedFetchProgress.progressLabel')}
              estimatedStartPrefix={t('feeds.feedFetchProgress.estimatedStart')}
              estimatedFinishPrefix={t('feeds.feedFetchProgress.estimatedFinish')}
              stages={stageItems}
              stageTimingPrefixes={{
                start: t('feeds.feedFetchProgress.stageTiming.start'),
                finish: t('feeds.feedFetchProgress.stageTiming.finish'),
                duration: t('feeds.feedFetchProgress.stageTiming.duration'),
              }}
              details={details}
              currentDiagnosticTitle={t('feeds.feedFetchProgress.diagnosticTitle')}
              currentDiagnosticText={currentDiagnosticText}
              history={historyItems}
              historyTitle={t('feeds.feedFetchProgress.historyTitle')}
              emptyHistoryLabel={t('feeds.feedFetchProgress.historyEmpty')}
              historyLoading={historyQuery.isFetching && !historyQuery.data}
              historyLoadingLabel={t('feeds.feedFetchProgress.historyLoading')}
              queueTitle={t('feeds.feedFetchProgress.queueSectionTitle')}
              queueSections={queueSections}
              emptyQueueLabel={t('feeds.feedFetchProgress.queueEmpty')}
            />
          ) : (
            <FeedFetchProgress
              title={t('feeds.feedFetchProgress.currentRun')}
              statusLabel={statusLabel}
              statusTone={latestRun?.next_fetch_at ? 'info' : 'secondary'}
              stageLabel={stageLabel}
              progressPercent={0}
              summaryText={null}
              details={details}
              history={historyItems}
              historyTitle={t('feeds.feedFetchProgress.historyTitle')}
              emptyHistoryLabel={t('feeds.feedFetchProgress.historyEmpty')}
              historyLoading={historyQuery.isFetching && !historyQuery.data}
              historyLoadingLabel={t('feeds.feedFetchProgress.historyLoading')}
              queueTitle={t('feeds.feedFetchProgress.queueSectionTitle')}
              queueSections={queueSections}
              emptyQueueLabel={t('feeds.feedFetchProgress.queueEmpty')}
            />
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  )
})

export default FeedFetchProgressCell
