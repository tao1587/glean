'use client'

import { Badge } from './Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './Card'
import { Progress, ProgressIndicator, ProgressTrack } from './progress'

export interface FeedFetchProgressStageItem {
  stageKey?: string | null
  label: string
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  statusLabel?: string
  summary?: string | null
  startedLabel?: string | null
  finishedLabel?: string | null
  durationLabel?: string | null
}

export interface FeedFetchProgressDetailItem {
  label: string
  value: string
}

export interface FeedFetchProgressHistoryItem {
  id: string
  title: string
  description?: string | null
  statusLabel?: string | null
  durationLabel?: string | null
  statusTone?: 'success' | 'error' | 'secondary' | 'info'
}

export interface FeedFetchQueueItem {
  id: string
  title: string
  statusLabel: string
  statusTone: 'success' | 'error' | 'secondary' | 'info'
  stageLabel: string
  metaLabel?: string | null
  summary?: string | null
}

export interface FeedFetchQueueSection {
  key: string
  title: string
  items: FeedFetchQueueItem[]
}

export interface FeedFetchProgressProps {
  title: string
  statusLabel: string
  statusTone?: 'success' | 'error' | 'secondary' | 'info'
  stageLabel: string
  stageProgressLabel?: string | null
  progressPercent: number
  summaryText?: string | null
  estimatedStartLabel?: string | null
  estimatedFinishLabel?: string | null
  predictionLabel?: string | null
  progressLabel?: string
  estimatedStartPrefix?: string
  estimatedFinishPrefix?: string
  stages?: FeedFetchProgressStageItem[]
  stageTimingPrefixes?: {
    start: string
    finish: string
    duration: string
  }
  details?: FeedFetchProgressDetailItem[]
  currentDiagnosticTitle?: string
  currentDiagnosticText?: string | null
  history?: FeedFetchProgressHistoryItem[]
  historyTitle?: string
  emptyHistoryLabel?: string
  historyLoading?: boolean
  historyLoadingLabel?: string
  queueTitle?: string
  queueSections?: FeedFetchQueueSection[]
  emptyQueueLabel?: string
}

export interface FeedFetchInlineStatusProps {
  statusLabel: string
  statusTone?: 'success' | 'error' | 'secondary' | 'info'
  stageLabel: string
  stageProgressLabel?: string | null
  progressPercent: number
  summaryText?: string | null
  estimatedStartLabel?: string | null
  estimatedFinishLabel?: string | null
  nextFetchLabel?: string | null
  stagePrefix?: string
  estimatedStartPrefix?: string
  estimatedFinishPrefix?: string
  nextFetchPrefix?: string
}

export function FeedFetchProgress({
  title,
  statusLabel,
  statusTone = 'info',
  stageLabel,
  stageProgressLabel,
  progressPercent,
  summaryText,
  estimatedStartLabel,
  estimatedFinishLabel,
  predictionLabel,
  progressLabel = 'Stage progress',
  estimatedStartPrefix = 'Estimated start',
  estimatedFinishPrefix = 'Estimated finish',
  stages = [],
  stageTimingPrefixes = {
    start: 'Start',
    finish: 'Finish',
    duration: 'Duration',
  },
  details = [],
  currentDiagnosticTitle,
  currentDiagnosticText,
  history = [],
  historyTitle = 'Recent runs',
  emptyHistoryLabel = 'No fetch history yet.',
  historyLoading = false,
  historyLoadingLabel = 'Loading recent runs…',
  queueTitle,
  queueSections = [],
  emptyQueueLabel = 'No queued or running tasks ahead.',
}: FeedFetchProgressProps) {
  return (
    <Card className="border-border/80">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{stageLabel}</CardDescription>
            {stageProgressLabel ? (
              <p className="text-muted-foreground text-xs">{progressLabel}: {stageProgressLabel}</p>
            ) : null}
          </div>
          <Badge variant={statusTone}>{statusLabel}</Badge>
        </div>
        <Progress aria-label={title} value={progressPercent}>
          <ProgressTrack>
            <ProgressIndicator style={{ width: `${progressPercent}%` }} />
          </ProgressTrack>
        </Progress>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {summaryText ? <p className="text-foreground/80">{summaryText}</p> : null}
        {estimatedStartLabel || estimatedFinishLabel ? (
          <div className="text-muted-foreground grid gap-1">
            {estimatedStartLabel ? <p>{estimatedStartPrefix}: {estimatedStartLabel}</p> : null}
            {estimatedFinishLabel ? <p>{estimatedFinishPrefix}: {estimatedFinishLabel}</p> : null}
            {predictionLabel ? <p>{predictionLabel}</p> : null}
          </div>
        ) : null}
        {currentDiagnosticTitle && currentDiagnosticText ? (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
            <p className="text-xs font-semibold uppercase tracking-wide">{currentDiagnosticTitle}</p>
            <p className="mt-1">{currentDiagnosticText}</p>
          </div>
        ) : null}
        {details.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="rounded-lg border px-3 py-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">{detail.label}</p>
                <p className="mt-1 font-medium">{detail.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {stages.length > 0 ? (
          <div className="space-y-2">
            {stages.map((stage) => (
              <div
                key={`${stage.label}-${stage.status}`}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="font-medium">{stage.label}</p>
                  {stage.summary ? (
                    <p className="text-muted-foreground text-xs">{stage.summary}</p>
                  ) : null}
                  {(stage.startedLabel || stage.finishedLabel || stage.durationLabel) ? (
                    <p className="text-muted-foreground text-xs">
                      {[
                        stage.startedLabel ? `${stageTimingPrefixes.start} ${stage.startedLabel}` : null,
                        stage.finishedLabel ? `${stageTimingPrefixes.finish} ${stage.finishedLabel}` : null,
                        stage.durationLabel ? `${stageTimingPrefixes.duration} ${stage.durationLabel}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <Badge size="sm" variant={stageVariant(stage.status)}>
                  {stage.statusLabel ?? stage.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">{historyTitle}</p>
          {historyLoading ? (
            <p className="text-muted-foreground text-sm">{historyLoadingLabel}</p>
          ) : history.length > 0 ? (
            history.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="font-medium">{item.title}</p>
                  {item.description ? (
                    <p className="text-muted-foreground text-xs">{item.description}</p>
                  ) : null}
                  {item.durationLabel ? (
                    <p className="text-muted-foreground text-xs">Duration {item.durationLabel}</p>
                  ) : null}
                </div>
                {item.statusLabel ? (
                  <Badge size="sm" variant={item.statusTone ?? statusVariant(item.statusLabel)}>
                    {item.statusLabel}
                  </Badge>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">{emptyHistoryLabel}</p>
          )}
        </div>
        {queueTitle ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">{queueTitle}</p>
            {queueSections.length > 0 ? (
              <div data-testid="feed-fetch-queue-scroll" className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {queueSections.map((section) => (
                  <div key={section.key} className="space-y-2">
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wide">{section.title}</p>
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{item.title}</p>
                          <p className="text-muted-foreground text-xs">
                            {[item.stageLabel, item.metaLabel].filter(Boolean).join(' · ')}
                          </p>
                          {item.summary ? <p className="text-muted-foreground text-xs">{item.summary}</p> : null}
                        </div>
                        <Badge size="sm" variant={item.statusTone}>
                          {item.statusLabel}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{emptyQueueLabel}</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function FeedFetchInlineStatus({
  statusLabel,
  statusTone = 'info',
  stageLabel,
  stageProgressLabel,
  progressPercent,
  summaryText,
  estimatedStartLabel,
  estimatedFinishLabel,
  nextFetchLabel,
  stagePrefix = 'Stage',
  estimatedStartPrefix = 'ETA start',
  estimatedFinishPrefix = 'ETA finish',
  nextFetchPrefix = 'Next fetch',
}: FeedFetchInlineStatusProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" variant={statusTone}>
          {statusLabel}
        </Badge>
        <span className="text-muted-foreground text-xs">{stageLabel}</span>
        {stageProgressLabel ? (
          <span className="text-muted-foreground text-xs">{stagePrefix} {stageProgressLabel}</span>
        ) : null}
        {estimatedStartLabel ? (
          <span className="text-muted-foreground text-xs">{estimatedStartPrefix}: {estimatedStartLabel}</span>
        ) : null}
        {estimatedFinishLabel ? (
          <span className="text-muted-foreground text-xs">{estimatedFinishPrefix}: {estimatedFinishLabel}</span>
        ) : null}
        {nextFetchLabel ? (
          <span className="text-muted-foreground text-xs">{nextFetchPrefix}: {nextFetchLabel}</span>
        ) : null}
      </div>
      {summaryText ? <p className="text-xs text-foreground/80">{summaryText}</p> : null}
      <Progress aria-label="Feed fetch progress" value={progressPercent}>
        <ProgressTrack className="h-1.5">
          <ProgressIndicator style={{ width: `${progressPercent}%` }} />
        </ProgressTrack>
      </Progress>
    </div>
  )
}

function statusVariant(statusLabel: string) {
  if (statusLabel === 'Completed' || statusLabel === 'No changes') return 'success'
  if (statusLabel === 'Failed') return 'error'
  if (statusLabel === 'Queued') return 'secondary'
  return 'info'
}

function stageVariant(status: FeedFetchProgressStageItem['status']) {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  if (status === 'running') return 'info'
  if (status === 'skipped') return 'outline'
  return 'secondary'
}
