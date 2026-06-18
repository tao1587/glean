import React from 'react'
import { Button, Input } from '@glean/ui'
import { Search, Filter, RefreshCw, Loader2, Activity, Play, Pause, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import type { FeedStatus } from './hooks/useFeedsTableState'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export { PAGE_SIZE_OPTIONS }

interface QueueSummary {
  totalCount: number
  runningCount: number
  queuedCount: number
}

interface FeedsToolbarProps {
  searchInput: string
  search: string
  statusFilter: FeedStatus
  selectedCount: number
  queueSummary: QueueSummary
  isRefreshAllPending: boolean
  isRefreshErroredPending: boolean
  isBatchPending: boolean
  isRefreshNowPending: boolean
  onSearchInputChange: (value: string) => void
  onSearchSubmit: (e: React.FormEvent) => void
  onClearSearch: () => void
  onStatusFilterChange: (value: FeedStatus) => void
  onRefreshAll: () => void
  onRefreshErrored: () => void
  onBatchAction: (action: string) => void
  onBatchDeleteRequest: () => void
  onClearSelection: () => void
}

const STATUS_FILTER_VALUES: FeedStatus[] = ['all', 'active', 'disabled', 'error']

const FeedsToolbar = React.memo(function FeedsToolbar({
  searchInput,
  search,
  statusFilter,
  selectedCount,
  queueSummary,
  isRefreshAllPending,
  isRefreshErroredPending,
  isBatchPending,
  isRefreshNowPending,
  onSearchInputChange,
  onSearchSubmit,
  onClearSearch,
  onStatusFilterChange,
  onRefreshAll,
  onRefreshErrored,
  onBatchAction,
  onBatchDeleteRequest,
  onClearSelection,
}: FeedsToolbarProps) {
  const { t } = useTranslation(['admin', 'feeds'])

  const statusFilters = STATUS_FILTER_VALUES.map((value) => ({
    value,
    label:
      value === 'all'
        ? t('admin:feeds.status.all')
        : value === 'active'
          ? t('admin:feeds.status.active')
          : value === 'disabled'
            ? t('admin:feeds.status.inactive')
            : t('admin:feeds.status.error'),
  }))

  return (
    <div className="mb-6 shrink-0 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder={t('admin:feeds.searchPlaceholder')}
              className="w-64 pl-10"
            />
          </div>
          <Button type="submit">{t('admin:feeds.search')}</Button>
          {search && (
            <Button type="button" variant="outline" onClick={onClearSearch}>
              {t('admin:feeds.clear')}
            </Button>
          )}
        </form>

        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">
            {t('feeds.feedFetchProgress.globalQueueLabel')}
          </span>
          <span className="font-medium text-foreground">
            {queueSummary.totalCount > 0
              ? t('feeds.feedFetchProgress.globalQueueSummary', {
                  running: queueSummary.runningCount,
                  queued: queueSummary.queuedCount,
                })
              : t('feeds.feedFetchProgress.globalQueueIdle')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <div className="flex gap-1">
            {statusFilters.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={statusFilter === filter.value ? 'default' : 'outline'}
                onClick={() => onStatusFilterChange(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <Button variant="outline" onClick={onRefreshAll} disabled={isRefreshAllPending}>
          {isRefreshAllPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('admin:feeds.refreshAll')}
        </Button>

        {statusFilter === 'error' && (
          <Button
            variant="outline"
            onClick={onRefreshErrored}
            disabled={isRefreshErroredPending}
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            {isRefreshErroredPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t('admin:feeds.retryErrored')}
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-lg border px-4 py-2">
          <span className="text-primary text-sm font-medium">
            {t('admin:feeds.batch.selected', { count: selectedCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBatchAction('refresh')}
              disabled={isBatchPending || isRefreshNowPending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('admin:feeds.batch.refresh')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBatchAction('enable')}
              disabled={isBatchPending}
            >
              <Play className="h-3.5 w-3.5" />
              {t('admin:feeds.batch.enable')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBatchAction('disable')}
              disabled={isBatchPending}
            >
              <Pause className="h-3.5 w-3.5" />
              {t('admin:feeds.batch.disable')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBatchAction('reset_error')}
              disabled={isBatchPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('admin:feeds.batch.resetError')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onBatchDeleteRequest}
              disabled={isBatchPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('admin:feeds.batch.delete')}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onClearSelection} className="ml-auto">
            {t('admin:feeds.batch.clearSelection')}
          </Button>
        </div>
      )}
    </div>
  )
})

export default FeedsToolbar
