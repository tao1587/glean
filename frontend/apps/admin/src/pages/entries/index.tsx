import { useCallback, useMemo } from 'react'
import { Badge } from '@glean/ui'
import { FileText } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { useEntries, useDeleteEntry } from '../../hooks/useEntries'
import { useFeeds } from '../../hooks/useFeeds'
import { useEntriesTableState } from './hooks/useEntriesTableState'
import { EntriesToolbar } from './EntriesToolbar'
import { EntriesList } from './EntriesList'
import { DeleteEntryDialog } from './dialogs/DeleteEntryDialog'
import { EntryDetailDialog } from './dialogs/EntryDetailDialog'

const ENTRIES_PER_PAGE = 20
const FEEDS_PER_PAGE = 100

export default function EntriesPage() {
  const { t } = useTranslation(['admin', 'common'])
  const {
    page,
    search,
    searchInput,
    feedFilter,
    selectedEntryId,
    deleteEntryId,
    setPage,
    setSearch,
    setSearchInput,
    setFeedFilter,
    setSelectedEntryId,
    setDeleteEntryId,
  } = useEntriesTableState()

  const queryParams = useMemo(
    () => ({
      page,
      per_page: ENTRIES_PER_PAGE,
      feed_id: feedFilter || undefined,
      search: search || undefined,
      sort: 'created_at',
      order: 'desc',
    }),
    [page, feedFilter, search],
  )

  const { data } = useEntries(queryParams)
  const { data: feedsData } = useFeeds({ per_page: FEEDS_PER_PAGE })
  const deleteMutation = useDeleteEntry()

  const isLoading = !data

  const feeds = useMemo(() => feedsData?.items ?? [], [feedsData])

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setSearch(searchInput)
      setPage(1)
    },
    [setSearch, searchInput, setPage],
  )

  const handleSearchClear = useCallback(() => {
    setSearch('')
    setSearchInput('')
    setPage(1)
  }, [setSearch, setSearchInput, setPage])

  const handleFeedFilterChange = useCallback(
    (feedId: string) => {
      setFeedFilter(feedId)
      setPage(1)
    },
    [setFeedFilter, setPage],
  )

  const handleOpenEntry = useCallback(
    (id: string) => {
      setSelectedEntryId(id)
    },
    [setSelectedEntryId],
  )

  const handleCloseEntry = useCallback(() => {
    setSelectedEntryId(null)
  }, [setSelectedEntryId])

  const handleDeleteRequest = useCallback(
    (id: string) => {
      setDeleteEntryId(id)
    },
    [setDeleteEntryId],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteEntryId) return
    await deleteMutation.mutateAsync(deleteEntryId)
    if (selectedEntryId === deleteEntryId) {
      setSelectedEntryId(null)
    }
    setDeleteEntryId(null)
  }, [deleteEntryId, selectedEntryId, deleteMutation, setSelectedEntryId, setDeleteEntryId])

  const handleDeleteOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setDeleteEntryId(null)
    },
    [setDeleteEntryId],
  )

  const hasActiveFilter = !!(search || feedFilter)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-border bg-card border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-foreground text-2xl font-bold">
              {t('admin:entries.title')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{t('admin:entries.subtitle')}</p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <FileText className="h-3.5 w-3.5" />
                <span className="font-medium">{data.total.toLocaleString()}</span>
                <span className="text-muted-foreground">{t('admin:entries.badge')}</span>
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <EntriesToolbar
          searchInput={searchInput}
          search={search}
          feedFilter={feedFilter}
          feeds={feeds}
          onSearchInputChange={setSearchInput}
          onSearchSubmit={handleSearchSubmit}
          onSearchClear={handleSearchClear}
          onFeedFilterChange={handleFeedFilterChange}
        />

        <EntriesList
          items={data?.items ?? []}
          total={data?.total ?? 0}
          totalPages={data?.total_pages ?? 0}
          page={data?.page ?? page}
          isLoading={isLoading}
          hasActiveFilter={hasActiveFilter}
          deletingId={deleteMutation.isPending ? deleteEntryId : null}
          onOpenEntry={handleOpenEntry}
          onDeleteEntry={handleDeleteRequest}
          onPageChange={setPage}
        />
      </div>

      {selectedEntryId && (
        <EntryDetailDialog
          entryId={selectedEntryId}
          onClose={handleCloseEntry}
          onDeleteRequest={handleDeleteRequest}
        />
      )}

      <DeleteEntryDialog
        open={!!deleteEntryId}
        isPending={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onOpenChange={handleDeleteOpenChange}
      />
    </div>
  )
}
