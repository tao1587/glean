import { useCallback, useMemo, useState } from 'react'
import { useFeeds, useResetFeedError, useUpdateFeed, useRefreshFeedNow, useRefreshAllFeedsNow, useRefreshErroredFeedsNow, useBatchFeedOperation, type AdminFeed } from '../../hooks/useFeeds'
import { buildFeedFetchQueueSummary } from '@glean/api-client'
import { useFeedsTableState } from './hooks/useFeedsTableState'
import { useFeedRefreshPolling } from './hooks/useFeedRefreshPolling'
import FeedsToolbar from './FeedsToolbar'
import FeedsTable from './FeedsTable'
import DeleteFeedDialog from './dialogs/DeleteFeedDialog'
import BatchDeleteDialog from './dialogs/BatchDeleteDialog'
import BackfillDialog from './dialogs/BackfillDialog'
import type { FeedRowHandlers } from './FeedRow'

export default function FeedsPage() {
  const {
    search,
    searchInput,
    statusFilter,
    page,
    perPage,
    selectedIds,
    setSearchInput,
    submitSearch,
    clearSearch,
    setStatusFilter,
    setPage,
    setPerPage,
    toggleSelected,
    selectAll,
    deselectPage,
    clearSelection,
  } = useFeedsTableState()

  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null)
  const [deleteConfirmFeedId, setDeleteConfirmFeedId] = useState<string | null>(null)
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [backfillFeed, setBackfillFeed] = useState<AdminFeed | null>(null)

  const { data, refetch } = useFeeds({
    page,
    per_page: perPage,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    sort: 'created_at',
    order: 'desc',
  })

  const resetErrorMutation = useResetFeedError()
  const updateFeedMutation = useUpdateFeed()
  const refreshFeedNowMutation = useRefreshFeedNow()
  const refreshAllFeedsNowMutation = useRefreshAllFeedsNow()
  const refreshErroredFeedsNowMutation = useRefreshErroredFeedsNow()
  const batchMutation = useBatchFeedOperation()

  const currentPageIds = useMemo(() => data?.items.map((f) => f.id) ?? [], [data?.items])

  const { activeRuns, latestRunsByFeedId, feedRefreshState, handleRefreshFeed, applyRefreshJobs } =
    useFeedRefreshPolling(currentPageIds, refetch)

  const activeQueueSummary = useMemo(
    () => buildFeedFetchQueueSummary(activeRuns),
    [activeRuns],
  )

  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id))

  const handleToggleSelectAll = useCallback(() => {
    if (allCurrentPageSelected) {
      deselectPage(currentPageIds)
    } else {
      selectAll(currentPageIds)
    }
  }, [allCurrentPageSelected, currentPageIds, deselectPage, selectAll])

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      submitSearch()
    },
    [submitSearch],
  )

  const handleBatchAction = useCallback(
    async (action: string) => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      if (action === 'refresh') {
        const jobs: Array<{ feed_id: string; job_id: string }> = []
        for (const feedId of ids) {
          try {
            const result = await refreshFeedNowMutation.mutateAsync(feedId)
            jobs.push({ feed_id: result.feed_id, job_id: result.job_id })
          } catch {
            // Continue with remaining feeds
          }
        }
        applyRefreshJobs(jobs)
      } else {
        await batchMutation.mutateAsync({ action, feedIds: ids })
        await refetch()
      }
      clearSelection()
    },
    [selectedIds, refreshFeedNowMutation, applyRefreshJobs, batchMutation, refetch, clearSelection],
  )

  const handlers: FeedRowHandlers = useMemo(
    () => ({
      onToggleSelect: toggleSelected,
      onResetError: async (id) => {
        await resetErrorMutation.mutateAsync(id)
      },
      onToggleStatus: async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
        setPendingFeedId(id)
        try {
          await updateFeedMutation.mutateAsync({ feedId: id, data: { status: newStatus } })
          await refetch()
        } finally {
          setPendingFeedId(null)
        }
      },
      onDelete: (id) => setDeleteConfirmFeedId(id),
      onRefresh: async (id) => {
        const result = await refreshFeedNowMutation.mutateAsync(id)
        handleRefreshFeed(result.feed_id, result.job_id)
      },
      onOpenBackfill: (feed) => setBackfillFeed(feed),
    }),
    [toggleSelected, resetErrorMutation, updateFeedMutation, refetch, refreshFeedNowMutation, handleRefreshFeed],
  )

  const handleRefreshAll = useCallback(async () => {
    const result = await refreshAllFeedsNowMutation.mutateAsync()
    applyRefreshJobs(result.jobs)
  }, [refreshAllFeedsNowMutation, applyRefreshJobs])

  const handleRefreshErrored = useCallback(async () => {
    const result = await refreshErroredFeedsNowMutation.mutateAsync()
    applyRefreshJobs(result.jobs)
  }, [refreshErroredFeedsNowMutation, applyRefreshJobs])

  const pagination = data
    ? { page: data.page, total_pages: data.total_pages, total: data.total }
    : null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-border bg-card border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">Feeds</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage RSS feeds</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
        <FeedsToolbar
          searchInput={searchInput}
          search={search}
          statusFilter={statusFilter}
          selectedCount={selectedIds.size}
          queueSummary={activeQueueSummary}
          isRefreshAllPending={refreshAllFeedsNowMutation.isPending}
          isRefreshErroredPending={refreshErroredFeedsNowMutation.isPending}
          isBatchPending={batchMutation.isPending}
          isRefreshNowPending={refreshFeedNowMutation.isPending}
          onSearchInputChange={setSearchInput}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={clearSearch}
          onStatusFilterChange={setStatusFilter}
          onRefreshAll={handleRefreshAll}
          onRefreshErrored={handleRefreshErrored}
          onBatchAction={handleBatchAction}
          onBatchDeleteRequest={() => setBatchDeleteConfirm(true)}
          onClearSelection={clearSelection}
        />

        <FeedsTable
          feeds={data?.items ?? []}
          isLoading={!data}
          pagination={pagination}
          perPage={perPage}
          page={page}
          selectedIds={selectedIds}
          allCurrentPageSelected={allCurrentPageSelected}
          latestRunsByFeedId={latestRunsByFeedId}
          activeRuns={activeRuns}
          feedRefreshState={feedRefreshState}
          pendingFeedId={pendingFeedId}
          isResetErrorPending={resetErrorMutation.isPending}
          isRefreshNowPending={refreshFeedNowMutation.isPending}
          isDeletePending={false}
          isBackfillPending={false}
          backfillActiveFeedId={backfillFeed?.id ?? null}
          search={search}
          statusFilter={statusFilter}
          handlers={handlers}
          onToggleSelectAll={handleToggleSelectAll}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      </div>

      {deleteConfirmFeedId && (
        <DeleteFeedDialog
          feedId={deleteConfirmFeedId}
          onClose={() => setDeleteConfirmFeedId(null)}
        />
      )}

      {batchDeleteConfirm && (
        <BatchDeleteDialog
          count={selectedIds.size}
          isPending={batchMutation.isPending}
          onConfirm={() => handleBatchAction('delete')}
          onClose={() => setBatchDeleteConfirm(false)}
        />
      )}

      {backfillFeed && (
        <BackfillDialog feed={backfillFeed} onClose={() => setBackfillFeed(null)} />
      )}
    </div>
  )
}
