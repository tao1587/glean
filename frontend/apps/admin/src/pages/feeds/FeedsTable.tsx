import React, { useMemo } from 'react'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@glean/ui'
import { CheckSquare, Square } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import type { AdminFeed } from '../../hooks/useFeeds'
import type { FeedFetchActiveRunItem, FeedFetchLatestRunResponse } from '@glean/types'
import type { FeedRefreshState } from './hooks/useFeedRefreshPolling'
import type { FeedRowHandlers } from './FeedRow'
import FeedRow, { FeedRowSkeleton } from './FeedRow'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
const EMPTY_ACTIVE_RUNS: FeedFetchActiveRunItem[] = []

interface PaginationData {
  page: number
  total_pages: number
  total: number
}

interface FeedsTableProps {
  feeds: AdminFeed[]
  isLoading: boolean
  pagination: PaginationData | null
  perPage: number
  page: number
  selectedIds: Set<string>
  allCurrentPageSelected: boolean
  latestRunsByFeedId: Map<string, FeedFetchLatestRunResponse>
  activeRuns: FeedFetchActiveRunItem[]
  feedRefreshState: Record<string, FeedRefreshState>
  pendingFeedId: string | null
  isResetErrorPending: boolean
  isRefreshNowPending: boolean
  isDeletePending: boolean
  isBackfillPending: boolean
  backfillActiveFeedId: string | null
  search: string
  statusFilter: string
  handlers: FeedRowHandlers
  onToggleSelectAll: () => void
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
}

const FeedsTable = React.memo(function FeedsTable({
  feeds,
  isLoading,
  pagination,
  perPage,
  page,
  selectedIds,
  allCurrentPageSelected,
  latestRunsByFeedId,
  activeRuns,
  feedRefreshState,
  pendingFeedId,
  isResetErrorPending,
  isRefreshNowPending,
  isDeletePending,
  isBackfillPending,
  backfillActiveFeedId,
  search,
  statusFilter,
  handlers,
  onToggleSelectAll,
  onPageChange,
  onPerPageChange,
}: FeedsTableProps) {
  const { t } = useTranslation(['admin'])

  const pageItems: Array<number | 'ellipsis'> = useMemo(() => {
    const totalPages = pagination?.total_pages ?? 1
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const items: Array<number | 'ellipsis'> = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    if (start > 2) items.push('ellipsis')
    for (let p = start; p <= end; p += 1) items.push(p)
    if (end < totalPages - 1) items.push('ellipsis')
    items.push(totalPages)
    return items
  }, [pagination?.total_pages, page])

  return (
    <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-border bg-muted/50 border-b">
              <th className="w-10 px-4 py-4">
                <button
                  onClick={onToggleSelectAll}
                  className="text-muted-foreground hover:text-foreground flex items-center"
                  title={
                    allCurrentPageSelected
                      ? t('admin:feeds.batch.deselectAll')
                      : t('admin:feeds.batch.selectAll')
                  }
                >
                  {allCurrentPageSelected ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </th>
              <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.feed')}
              </th>
              <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.status')}
              </th>
              <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.subscribers')}
              </th>
              <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.lastFetched')}
              </th>
              <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.created')}
              </th>
              <th className="text-muted-foreground px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider">
                {t('admin:feeds.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <FeedRowSkeleton key={i} />)
            ) : feeds.length > 0 ? (
              feeds.map((feed) => {
                const latestRun = latestRunsByFeedId.get(feed.id)
                return (
                  <FeedRow
                    key={feed.id}
                    feed={feed}
                    latestRun={latestRun}
                    activeRuns={activeRuns.length > 0 ? activeRuns : EMPTY_ACTIVE_RUNS}
                    refreshState={feedRefreshState[feed.id]}
                    selected={selectedIds.has(feed.id)}
                    pendingFeedId={pendingFeedId}
                    isResetErrorPending={isResetErrorPending}
                    isRefreshNowPending={isRefreshNowPending}
                    isDeletePending={isDeletePending}
                    isBackfillPending={isBackfillPending}
                    isBackfillActiveFeed={backfillActiveFeedId === feed.id}
                    handlers={handlers}
                  />
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-muted-foreground text-sm">
                    {search || statusFilter !== 'all'
                      ? t('admin:feeds.emptyFiltered')
                      : t('admin:feeds.empty')}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="border-border flex shrink-0 flex-col gap-3 border-t px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-muted-foreground text-sm">
              {t('admin:feeds.pagination.page', {
                page: pagination.page,
                totalPages: pagination.total_pages,
                total: pagination.total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {t('admin:feeds.pagination.rowsPerPage')}
              </span>
              <Select
                value={String(perPage)}
                onValueChange={(value) => onPerPageChange(Number(value))}
              >
                <SelectTrigger size="sm" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={pagination.page === 1}
            >
              {t('admin:feeds.pagination.previous')}
            </Button>
            {pageItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="text-muted-foreground px-1 text-sm"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  size="sm"
                  variant={item === page ? 'default' : 'outline'}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              ),
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(page + 1)}
              disabled={pagination.page === pagination.total_pages}
            >
              {t('admin:feeds.pagination.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})

export default FeedsTable
