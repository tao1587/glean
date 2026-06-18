import {
  buildFeedFetchQueueSections,
  buildFeedFetchSummaryParts,
  findCurrentFeedFetchStage,
  formatFeedFetchDateTime,
  getFeedFetchStatusTone,
} from '@glean/api-client'
import type {
  FeedFetchLatestRunResponse,
  FeedFetchRun,
  FeedFetchStageEvent,
  FeedFetchActiveRunItem,
} from '@glean/types'
import type { useTranslation } from '@glean/i18n'
import type { AdminFeed } from '../../hooks/useFeeds'

type TFn = ReturnType<typeof useTranslation>['t']

export function localizeAdminFeedFetchStatus(t: TFn, statusKey: string | null | undefined, fallback: string) {
  if (!statusKey) return fallback
  return t(`feeds.feedFetchProgress.statuses.${statusKey}`, { defaultValue: fallback })
}

export function localizeAdminFeedFetchStage(t: TFn, stageKey: string | null | undefined, fallback: string) {
  if (!stageKey) return fallback
  return t(`feeds.feedFetchProgress.stages.${stageKey}`, { defaultValue: fallback })
}

export function localizeAdminFeedFetchStageStatus(t: TFn, statusKey: string) {
  return t(`feeds.feedFetchProgress.stageStatuses.${statusKey}`, { defaultValue: statusKey })
}

export function buildAdminFeedFetchSummary(
  t: TFn,
  run: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined,
) {
  const parts = buildFeedFetchSummaryParts(run)
  if (!parts.length) return null
  return parts
    .map((part) => {
      if (part.kind === 'new_entries') {
        return t('feeds.feedFetchProgress.summary.newEntries', { count: part.value ?? 0 })
      }
      if (part.kind === 'total_entries') {
        return t('feeds.feedFetchProgress.summary.totalEntries', { count: part.value ?? 0 })
      }
      if (part.kind === 'backfill_failed_count') {
        return t('feeds.feedFetchProgress.summary.backfillFailed', { count: part.value ?? 0 })
      }
      return t('feeds.feedFetchProgress.summary.fallbackUsed')
    })
    .join(' · ')
}

export function buildAdminFeedFetchDetails(
  t: TFn,
  latestRun: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined,
  feed: Pick<AdminFeed, 'last_fetched_at' | 'last_fetch_success_at'>,
) {
  const lastFinished =
    formatFeedFetchDateTime(latestRun?.finished_at) ??
    formatFeedFetchDateTime(feed.last_fetched_at) ??
    t('feeds.feedFetchProgress.firstFetch')
  const lastSuccess =
    formatFeedFetchDateTime(latestRun?.last_fetch_success_at ?? feed.last_fetch_success_at) ??
    t('feeds.feedFetchProgress.firstFetch')
  const nextFetch =
    formatFeedFetchDateTime(latestRun?.next_fetch_at) ??
    t('feeds.feedFetchProgress.nextFetchAfterRun')
  const pathValueKey =
    latestRun?.path_kind === 'direct_feed'
      ? 'directFeed'
      : latestRun?.path_kind === 'rsshub_primary'
        ? 'rsshubPrimary'
        : latestRun?.path_kind === 'rsshub_fallback'
          ? 'rsshubFallback'
          : 'unknown'

  return [
    { label: t('feeds.feedFetchProgress.path'), value: t(`feeds.feedFetchProgress.pathValues.${pathValueKey}`) },
    { label: t('feeds.feedFetchProgress.lastFinished'), value: lastFinished },
    { label: t('feeds.feedFetchProgress.lastSuccess'), value: lastSuccess },
    { label: t('feeds.feedFetchProgress.nextFetch'), value: nextFetch },
  ]
}

export function buildAdminFeedFetchStageItems(t: TFn, stages: FeedFetchStageEvent[]) {
  return stages.map((stage) => ({
    stageKey: stage.stage_name,
    label: localizeAdminFeedFetchStage(t, stage.stage_name, stage.stage_name),
    status: normalizeAdminStageStatus(stage.status),
    statusLabel: localizeAdminFeedFetchStageStatus(t, normalizeAdminStageStatus(stage.status)),
    summary: stage.summary,
    startedLabel: formatFeedFetchDateTime(stage.started_at),
    finishedLabel: formatFeedFetchDateTime(stage.finished_at),
    durationLabel:
      stage.started_at && stage.finished_at
        ? formatDurationBetween(stage.started_at, stage.finished_at)
        : null,
  }))
}

export function buildAdminFeedFetchHistoryItems(t: TFn, runs: FeedFetchRun[]) {
  return runs.slice(0, 10).map((run) => {
    const statusLabel = localizeAdminFeedFetchStatus(
      t,
      run.status,
      run.status ?? t('feeds.feedFetchProgress.statuses.not_started'),
    )
    const stageLabel = localizeAdminFeedFetchStage(
      t,
      run.current_stage,
      run.current_stage ?? t('feeds.feedFetchProgress.emptyStates.noRunYet'),
    )
    const timestampLabel =
      formatFeedFetchDateTime(run.finished_at ?? run.started_at ?? run.queue_entered_at) ?? null
    const summaryText = buildAdminFeedFetchSummary(t, run)
    return {
      id: run.id,
      title: `${statusLabel} · ${stageLabel}`,
      description: [timestampLabel, summaryText].filter(Boolean).join(' · ') || null,
      statusLabel,
      statusTone: getFeedFetchStatusTone(run.status),
      durationLabel:
        run.started_at && run.finished_at
          ? formatDurationBetween(run.started_at, run.finished_at)
          : null,
    }
  })
}

export function buildAdminFeedFetchQueueSections(
  t: TFn,
  activeRuns: FeedFetchActiveRunItem[],
  currentRunId: string | null,
) {
  return buildFeedFetchQueueSections({ currentRunId, activeRuns }).map((section) => ({
    key: section.key,
    title:
      section.key === 'running'
        ? t('feeds.feedFetchProgress.queueGroups.running', { count: section.count })
        : t('feeds.feedFetchProgress.queueGroups.queued', { count: section.count }),
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      statusLabel: localizeAdminFeedFetchStatus(t, item.statusKey, item.statusLabel),
      statusTone: item.statusTone,
      stageLabel: localizeAdminFeedFetchStage(t, item.stageKey, item.stageLabel),
      metaLabel: item.etaLabel
        ? `${t('feeds.feedFetchProgress.queueEta')}: ${item.etaLabel}`
        : null,
      summary: item.summary ?? null,
    })),
  }))
}

export function buildAdminDiagnosticText(
  t: TFn,
  latestRun: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined,
) {
  const stage = findCurrentFeedFetchStage(latestRun)
  if (!stage) return null
  const base =
    stage.admin_diagnostic ||
    (stage.is_slow
      ? t(`feeds.feedFetchProgress.slowDiagnostics.${stage.stage_name}`, {
          defaultValue: stage.public_diagnostic ?? '',
        })
      : null)
  if (!base) return null
  const lastProgress = formatFeedFetchDateTime(stage.last_progress_at)
  return lastProgress
    ? `${base} · ${t('feeds.feedFetchProgress.lastProgress')}: ${lastProgress}`
    : base
}

export function normalizeAdminStageStatus(
  status: string,
): 'pending' | 'running' | 'success' | 'error' | 'skipped' {
  if (status === 'running') return 'running'
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  if (status === 'skipped') return 'skipped'
  return 'pending'
}

export function formatDurationBetween(startedAt: string, finishedAt: string) {
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}
