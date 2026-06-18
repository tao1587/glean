import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react'
import {
  useAllSubscriptions,
  useDeleteSubscription,
  useBatchDeleteSubscriptions,
  useRefreshFeed,
  useRefreshAllFeeds,
  useRefreshStatus,
  useImportOPML,
  useExportOPML,
} from '../../hooks/useSubscriptions'
import { useEntries } from '../../hooks/useEntries'
import {
  useActiveFeedFetchRuns,
  useFeedFetchProgress,
  useFeedFetchProgressList,
} from '../../hooks/useFeedFetchProgress'
import { useFolderStore } from '../../stores/folderStore'
import { useAuthStore } from '../../stores/authStore'
import type {
  EntryWithState,
  FeedFetchLatestRunResponse,
  FeedFetchRun,
  FeedFetchStageEvent,
  FolderTreeNode,
  RefreshStatusItem,
  Subscription,
} from '@glean/types'
import { useTranslation } from '@glean/i18n'
import {
  Button,
  Checkbox,
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Skeleton,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
  FeedFetchProgress,
  FeedFetchInlineStatus,
  cn,
} from '@glean/ui'
import {
  Search,
  Trash2,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Rss,
  ExternalLink,
  AlertCircle,
  Upload,
  Download,
  Loader2,
  Folder,
  FolderOpen,
  Eye,
  CheckSquare,
  Square,
  ChevronRight,
  Activity,
  Wand2,
} from 'lucide-react'
import {
  buildFeedFetchQueueSummary,
  buildFeedFetchSummaryParts,
  findCurrentFeedFetchStage,
  formatFeedFetchDateTime,
  getFeedFetchStatusTone,
  entryService,
  mapFeedFetchRunToViewModel,
} from '@glean/api-client'
import { iconProxyUrl } from '../../lib/icon'
import { shouldAutoTranslate } from '../../lib/translationLanguagePolicy'
import { formatFeedQueueSummary } from './feedQueueSummary'
import { EditSubscriptionDialog } from '../../pages/SubscriptionsPage'

type FeedRefreshState = {
  jobId: string
  status: string
  resultStatus: string | null
  newEntries: number | null
  totalEntries: number | null
  message: string | null
  lastFetchAttemptAt: string | null
  lastFetchSuccessAt: string | null
  lastFetchedAt: string | null
  errorCount: number
  fetchErrorMessage: string | null
  updatedAt: string
}

const PANEL_CLASS = 'flex min-h-0 flex-1 flex-col overflow-hidden'
const TOOLBAR_CLASS = 'flex shrink-0 flex-wrap items-center gap-3'
const SEARCH_CLASS =
  'h-10 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-input'
const TREE_ROW_CLASS =
  'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors'
const ICON_BUTTON_CLASS = 'h-8 w-8'
const allFolderIds = (folders: FolderTreeNode[]): string[] =>
  folders.flatMap((folder) => [folder.id, ...allFolderIds(folder.children)])

function sortUnreadFirst(items: Subscription[]): Subscription[] {
  const unread = items.filter((sub) => sub.unread_count > 0)
  const fullyRead = items.filter((sub) => sub.unread_count === 0)
  return [...unread, ...fullyRead]
}

function matchesSubscription(
  subscription: Subscription,
  folderPath: string,
  query: string
) {
  if (!query) return true

  const text = [
    subscription.custom_title,
    subscription.feed.title,
    subscription.feed.url,
    folderPath,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes(query)
}

export function SubscriptionsTab() {
  const { t } = useTranslation('settings')
  const { fetchFolders, feedFolders } = useFolderStore()
  const deleteMutation = useDeleteSubscription()
  const batchDeleteMutation = useBatchDeleteSubscriptions()
  const refreshMutation = useRefreshFeed()
  const refreshAllMutation = useRefreshAllFeeds()
  const refreshStatusMutation = useRefreshStatus()
  const importMutation = useImportOPML()
  const exportMutation = useExportOPML()
  const { data: allSubscriptions = [], isLoading, error } = useAllSubscriptions()

  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [feedRefreshState, setFeedRefreshState] = useState<Record<string, FeedRefreshState>>({})
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchFolders('feed')
  }, [fetchFolders])

  useEffect(() => {
    if (feedFolders.length === 0) return
    setExpandedFolders((prev) => (prev.size > 0 ? prev : new Set(allFolderIds(feedFolders))))
  }, [feedFolders])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const folderPathMap = useMemo(() => {
    const map = new Map<string, string>()

    const walk = (nodes: FolderTreeNode[], parentNames: string[] = []) => {
      for (const node of nodes) {
        const names = [...parentNames, node.name]
        map.set(node.id, names.join(' / '))
        walk(node.children, names)
      }
    }

    walk(feedFolders)
    return map
  }, [feedFolders])

  const visibleSubscriptions = useMemo(
    () =>
      allSubscriptions.filter((subscription) =>
        matchesSubscription(
          subscription,
          subscription.folder_id ? (folderPathMap.get(subscription.folder_id) ?? '') : '',
          normalizedQuery
        )
      ),
    [allSubscriptions, folderPathMap, normalizedQuery]
  )

  const visibleIds = useMemo(
    () => new Set(visibleSubscriptions.map((subscription) => subscription.id)),
    [visibleSubscriptions]
  )
  const visibleFeedIds = useMemo(
    () => visibleSubscriptions.map((subscription) => subscription.feed_id),
    [visibleSubscriptions]
  )
  const { latestRunsByFeedId } = useFeedFetchProgressList(visibleFeedIds, visibleFeedIds.length > 0)
  const activeRunsQuery = useActiveFeedFetchRuns(allSubscriptions.length > 0)
  const activeQueueSummary = useMemo(
    () => buildFeedFetchQueueSummary(activeRunsQuery.data?.items ?? []),
    [activeRunsQuery.data?.items]
  )
  const activeQueueSummaryLabel = formatSettingsGlobalQueueSummary(t, activeQueueSummary)

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleIds])

  useEffect(() => {
    if (!normalizedQuery || feedFolders.length === 0) return
    setExpandedFolders(new Set(allFolderIds(feedFolders)))
  }, [normalizedQuery, feedFolders])

  const subscriptionsByFolder = useMemo(() => {
    const map = new Map<string, Subscription[]>()
    for (const subscription of visibleSubscriptions) {
      if (!subscription.folder_id) continue
      const group = map.get(subscription.folder_id) ?? []
      group.push(subscription)
      map.set(subscription.folder_id, group)
    }
    for (const items of map.values()) {
      const sorted = sortUnreadFirst(items)
      items.splice(0, items.length, ...sorted)
    }
    return map
  }, [visibleSubscriptions])

  const ungroupedSubscriptions = useMemo(
    () => sortUnreadFirst(visibleSubscriptions.filter((subscription) => !subscription.folder_id)),
    [visibleSubscriptions]
  )

  const folderStats = useMemo(() => {
    const countMap = new Map<string, number>()
    const idMap = new Map<string, string[]>()

    const walk = (nodes: FolderTreeNode[]): string[] => {
      const subtreeIds: string[] = []

      for (const node of nodes) {
        const ownIds = (subscriptionsByFolder.get(node.id) ?? []).map((subscription) => subscription.id)
        const childIds = walk(node.children)
        const allIdsForNode = [...ownIds, ...childIds]
        idMap.set(node.id, allIdsForNode)
        countMap.set(node.id, allIdsForNode.length)
        subtreeIds.push(...allIdsForNode)
      }

      return subtreeIds
    }

    walk(feedFolders)
    return { countMap, idMap }
  }, [feedFolders, subscriptionsByFolder])

  const selectedCount = selectedIds.size
  const visibleCount = visibleSubscriptions.length
  const isAllVisibleSelected = visibleCount > 0 && visibleSubscriptions.every((item) => selectedIds.has(item.id))
  const isSomeVisibleSelected = selectedCount > 0 && !isAllVisibleSelected

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id)
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleBatchDelete = async () => {
    const subscriptionIds = Array.from(selectedIds)
    if (subscriptionIds.length === 0) return

    await batchDeleteMutation.mutateAsync({ subscription_ids: subscriptionIds })
    setSelectedIds(new Set())
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleFolderSelection = (folderId: string) => {
    const folderIds = folderStats.idMap.get(folderId) ?? []
    if (folderIds.length === 0) return

    const allSelected = folderIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of folderIds) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    if (visibleSubscriptions.length === 0) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isAllVisibleSelected) {
        for (const subscription of visibleSubscriptions) {
          next.delete(subscription.id)
        }
      } else {
        for (const subscription of visibleSubscriptions) {
          next.add(subscription.id)
        }
      }
      return next
    })
  }

  const handleRefresh = async (id: string) => {
    setRefreshingId(id)
    setRefreshError(null)
    try {
      const result = await refreshMutation.mutateAsync(id)
      setFeedRefreshState((prev) => ({
        ...prev,
        [result.feed_id]: {
          jobId: result.job_id,
          status: 'queued',
          resultStatus: null,
          newEntries: null,
          totalEntries: null,
          message: null,
          lastFetchAttemptAt: null,
          lastFetchSuccessAt: null,
          lastFetchedAt: null,
          errorCount: 0,
          fetchErrorMessage: null,
          updatedAt: new Date().toISOString(),
        },
      }))
    } catch (err) {
      setRefreshError((err as Error).message)
    } finally {
      setRefreshingId(null)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshError(null)
    try {
      const result = await refreshAllMutation.mutateAsync()
      const now = new Date().toISOString()
      setFeedRefreshState((prev) => {
        const next = { ...prev }
        for (const job of result.jobs) {
          next[job.feed_id] = {
            jobId: job.job_id,
            status: 'queued',
            resultStatus: null,
            newEntries: null,
            totalEntries: null,
            message: null,
            lastFetchAttemptAt: null,
            lastFetchSuccessAt: null,
            lastFetchedAt: null,
            errorCount: 0,
            fetchErrorMessage: null,
            updatedAt: now,
          }
        }
        return next
      })
    } catch (err) {
      setRefreshError((err as Error).message)
    }
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await importMutation.mutateAsync(file)
      fetchFolders('feed')
    } catch {
      // Error is handled by the mutation
    }
  }

  const handleExport = () => {
    exportMutation.mutate()
  }

  const upsertRefreshStates = (items: RefreshStatusItem[]) => {
    const now = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const item of items) {
        next[item.feed_id] = {
          jobId: item.job_id,
          status: item.status,
          resultStatus: item.result_status,
          newEntries: item.new_entries,
          totalEntries: item.total_entries,
          message: item.message,
          lastFetchAttemptAt: item.last_fetch_attempt_at,
          lastFetchSuccessAt: item.last_fetch_success_at,
          lastFetchedAt: item.last_fetched_at,
          errorCount: item.error_count,
          fetchErrorMessage: item.fetch_error_message,
          updatedAt: now,
        }
      }
      return next
    })
  }

  const isPendingRefreshStatus = (statusValue: string) =>
    statusValue === 'queued' || statusValue === 'deferred' || statusValue === 'in_progress'

  useEffect(() => {
    const pendingItems = Object.entries(feedRefreshState)
      .filter(([, state]) => isPendingRefreshStatus(state.status))
      .map(([feedId, state]) => ({ feed_id: feedId, job_id: state.jobId }))

    if (pendingItems.length === 0) return

    const timer = window.setInterval(async () => {
      try {
        const statusResult = await refreshStatusMutation.mutateAsync({ items: pendingItems })
        upsertRefreshStates(statusResult.items)
      } catch {
        // Keep current state if poll fails
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [feedRefreshState, refreshStatusMutation])

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      {refreshError && (
        <div className="text-destructive flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{refreshError}</span>
          <button type="button" onClick={() => setRefreshError(null)} className="shrink-0">
            ✕
          </button>
        </div>
      )}

      <div className={TOOLBAR_CLASS}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder={t('manageFeeds.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={SEARCH_CLASS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isBatchMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsBatchMode((prev) => !prev)
              setSelectedIds(new Set())
            }}
            className="gap-1.5"
          >
            {isBatchMode ? (
              <CheckSquare className="h-4 w-4 shrink-0" />
            ) : (
              <Square className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isBatchMode ? t('manageFeeds.exitBatchMode') : t('manageFeeds.batchManage')}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshAllMutation.isPending}
            className="gap-1.5"
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0" />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden sm:inline">Refresh All</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('manageFeeds.importOPML')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="gap-1.5"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('manageFeeds.exportOPML')}</span>
          </Button>
        </div>

        {activeQueueSummary.totalCount > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">
              {t('manageFeeds.feedFetchProgress.globalQueueLabel')}
            </span>
            <span className="font-medium text-foreground">{activeQueueSummaryLabel}</span>
          </div>
        )}
      </div>

      {isBatchMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Checkbox
                checked={isAllVisibleSelected}
                indeterminate={isSomeVisibleSelected}
                aria-label={t('manageFeeds.selectAllVisible')}
              />
              <span>{t('manageFeeds.selectAllVisible')}</span>
            </button>
            <span className="text-sm text-muted-foreground">
              {t('manageFeeds.selectedCount', { count: selectedCount })}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBatchDelete}
            disabled={selectedCount === 0 || batchDeleteMutation.isPending}
            className="gap-1.5"
          >
            {batchDeleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0" />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" />
            )}
            <span>{t('manageFeeds.unsubscribeSelected')}</span>
          </Button>
        </div>
      )}

      {importMutation.isPending && (
        <div className="flex items-center gap-3 border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t('manageFeeds.importing')}</span>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/4 rounded-full bg-primary" />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className={PANEL_CLASS}>
        <div className="shrink-0 border-b bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {isLoading
            ? t('manageFeeds.loading')
            : t('manageFeeds.subscriptionCount', { count: visibleCount })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
                <div key={key} className="space-y-2 border p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{t('manageFeeds.failedToLoad')}</p>
            </div>
          )}

          {!isLoading && !error && visibleCount === 0 && (
            <div className="p-8 text-center">
              <Rss className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {t('manageFeeds.noSubscriptionsFound')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? t('manageFeeds.tryDifferentSearch') : t('manageFeeds.addFirstFeed')}
              </p>
            </div>
          )}

          {!isLoading && !error && visibleCount > 0 && (
            <div className="space-y-1">
              {feedFolders.map((folder) => {
                const count = folderStats.countMap.get(folder.id) ?? 0
                if (count === 0) return null

                return (
                  <FolderBranch
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    expandedFolders={expandedFolders}
                    onToggleExpand={toggleFolderExpand}
                    subscriptionsByFolder={subscriptionsByFolder}
                    folderStats={folderStats}
                    selectedIds={selectedIds}
                    isBatchMode={isBatchMode}
                    onToggleFolderSelection={toggleFolderSelection}
                    onToggleSelection={toggleSelection}
                    onDelete={handleDelete}
                    isDeletePending={deleteMutation.isPending}
                    onRefresh={handleRefresh}
                    refreshingId={refreshingId}
                    feedRefreshState={feedRefreshState}
                    latestRunsByFeedId={latestRunsByFeedId}
                  />
                )
              })}

              {ungroupedSubscriptions.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('manageFeeds.uncategorized')}
                  </div>
                  <div className="space-y-1">
                    {ungroupedSubscriptions.map((subscription) => (
                      <SubscriptionRow
                        key={subscription.id}
                        subscription={subscription}
                        depth={0}
                        isBatchMode={isBatchMode}
                        isSelected={selectedIds.has(subscription.id)}
                        onToggleSelection={toggleSelection}
                        onDelete={handleDelete}
                        isDeletePending={deleteMutation.isPending}
                        onRefresh={handleRefresh}
                        refreshingId={refreshingId}
                        refreshState={feedRefreshState[subscription.feed_id]}
                        latestRun={latestRunsByFeedId.get(subscription.feed_id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type FolderStats = {
  countMap: Map<string, number>
  idMap: Map<string, string[]>
}

interface FolderBranchProps {
  folder: FolderTreeNode
  depth: number
  expandedFolders: Set<string>
  onToggleExpand: (folderId: string) => void
  subscriptionsByFolder: Map<string, Subscription[]>
  folderStats: FolderStats
  selectedIds: Set<string>
  isBatchMode: boolean
  onToggleFolderSelection: (folderId: string) => void
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => Promise<void>
  isDeletePending: boolean
  onRefresh: (id: string) => Promise<void>
  refreshingId: string | null
  feedRefreshState: Record<string, FeedRefreshState>
  latestRunsByFeedId: Map<string, FeedFetchLatestRunResponse>
}

function FolderBranch({
  folder,
  depth,
  expandedFolders,
  onToggleExpand,
  subscriptionsByFolder,
  folderStats,
  selectedIds,
  isBatchMode,
  onToggleFolderSelection,
  onToggleSelection,
  onDelete,
  isDeletePending,
  onRefresh,
  refreshingId,
  feedRefreshState,
  latestRunsByFeedId,
}: FolderBranchProps) {
  const { t } = useTranslation('settings')
  const count = folderStats.countMap.get(folder.id) ?? 0
  const folderIds = folderStats.idMap.get(folder.id) ?? []
  const selectedCount = folderIds.filter((id) => selectedIds.has(id)).length
  const isExpanded = expandedFolders.has(folder.id)
  const hasChildren = folder.children.some((child) => (folderStats.countMap.get(child.id) ?? 0) > 0)
  const items = subscriptionsByFolder.get(folder.id) ?? []

  if (count === 0) return null

  return (
    <div>
      <div
        className={cn(TREE_ROW_CLASS, 'bg-muted/30 text-foreground', depth > 0 && 'mt-1')}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {isBatchMode && (
          <Checkbox
            checked={selectedCount > 0 && selectedCount === folderIds.length}
            indeterminate={selectedCount > 0 && selectedCount < folderIds.length}
            aria-label={t('manageFeeds.selectFolder')}
            onCheckedChange={() => onToggleFolderSelection(folder.id)}
          />
        )}
        <button
          type="button"
          onClick={() => onToggleExpand(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate font-medium">{folder.name}</span>
          <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-1">
          {folder.children.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              subscriptionsByFolder={subscriptionsByFolder}
              folderStats={folderStats}
              selectedIds={selectedIds}
              isBatchMode={isBatchMode}
              onToggleFolderSelection={onToggleFolderSelection}
              onToggleSelection={onToggleSelection}
              onDelete={onDelete}
              isDeletePending={isDeletePending}
              onRefresh={onRefresh}
              refreshingId={refreshingId}
              feedRefreshState={feedRefreshState}
              latestRunsByFeedId={latestRunsByFeedId}
            />
          ))}

          {items.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              depth={depth + 1}
              isBatchMode={isBatchMode}
              isSelected={selectedIds.has(subscription.id)}
              onToggleSelection={onToggleSelection}
              onDelete={onDelete}
              isDeletePending={isDeletePending}
              onRefresh={onRefresh}
              refreshingId={refreshingId}
              refreshState={feedRefreshState[subscription.feed_id]}
              latestRun={latestRunsByFeedId.get(subscription.feed_id)}
            />
          ))}

          {!hasChildren && items.length === 0 && (
            <div
              className="px-3 py-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${28 + (depth + 1) * 16}px` }}
            >
              {t('manageFeeds.emptyFolder')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SubscriptionRowProps {
  subscription: Subscription
  depth: number
  isBatchMode: boolean
  isSelected: boolean
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => Promise<void>
  isDeletePending: boolean
  onRefresh: (id: string) => Promise<void>
  refreshingId: string | null
  refreshState?: FeedRefreshState
  latestRun?: FeedFetchLatestRunResponse
}

function SubscriptionRow({
  subscription,
  depth,
  isBatchMode,
  isSelected,
  onToggleSelection,
  onDelete,
  isDeletePending,
  onRefresh,
  refreshingId,
  refreshState,
  latestRun,
}: SubscriptionRowProps) {
  const { t } = useTranslation('settings')
  const { feedFolders } = useFolderStore()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const isRefreshingRow = refreshState && isPendingRefreshStatus(refreshState.status)
  const latestViewModel = mapFeedFetchRunToViewModel(latestRun)
  const isError = refreshState?.resultStatus === 'error'
  const isDone = refreshState?.status === 'complete' || refreshState?.status === 'not_found'
  const rowLogMessage =
    refreshState?.message ||
    refreshState?.fetchErrorMessage ||
    (isDone && !isError ? null : subscription.feed.fetch_error_message)
  const effectiveLastFetchAttemptAt =
    refreshState?.lastFetchAttemptAt || subscription.feed.last_fetch_attempt_at || refreshState?.updatedAt
  const effectiveLastFetchSuccessAt =
    refreshState?.lastFetchSuccessAt || subscription.feed.last_fetch_success_at

  return (
    <div
      className={cn(TREE_ROW_CLASS, 'hover:bg-muted/40')}
      style={{ paddingLeft: `${28 + depth * 16}px` }}
    >
        {isBatchMode && (
          <Checkbox
            checked={isSelected}
            aria-label={t('manageFeeds.selectFeed')}
            onCheckedChange={() => onToggleSelection(subscription.id)}
          />
        )}

        {subscription.feed.icon_url ? (
          <img
            src={iconProxyUrl(subscription.feed.icon_url) ?? undefined}
            alt=""
            className="h-5 w-5 shrink-0 rounded"
          />
        ) : (
          <div className="h-5 w-5 shrink-0 rounded bg-muted" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">
              {subscription.custom_title || subscription.feed.title || t('manageFeeds.untitledFeed')}
            </h3>
            {subscription.unread_count > 0 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {subscription.unread_count}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{subscription.feed.url}</p>

          {refreshState && (
            <div className="mt-2 space-y-1">
              <RefreshMeta
                refreshState={refreshState}
                subscription={subscription}
                effectiveLastFetchAttemptAt={effectiveLastFetchAttemptAt}
                effectiveLastFetchSuccessAt={effectiveLastFetchSuccessAt}
                rowLogMessage={rowLogMessage}
              />
            </div>
          )}
          {latestViewModel && (
            <div className="mt-2">
              <FeedFetchInlineStatus
                statusLabel={localizeSettingsFeedFetchStatus(
                  t,
                  latestViewModel.statusKey ?? (latestRun?.next_fetch_at ? 'scheduled' : 'not_started'),
                  latestViewModel.statusLabel
                )}
                statusTone={latestViewModel.statusTone}
                stageLabel={localizeSettingsFeedFetchStage(
                  t,
                  latestViewModel.stageKey,
                  latestRun?.next_fetch_at
                    ? t('manageFeeds.feedFetchProgress.emptyStates.waitingWindow')
                    : t('manageFeeds.feedFetchProgress.emptyStates.noRunYet')
                )}
                stageProgressLabel={latestViewModel.stageProgressLabel}
                progressPercent={latestViewModel.progressPercent}
                summaryText={buildSettingsFeedFetchSummary(t, latestRun)}
                estimatedStartLabel={latestViewModel.estimatedStartLabel}
                estimatedFinishLabel={latestViewModel.estimatedFinishLabel}
                nextFetchLabel={latestViewModel.nextFetchLabel}
                stagePrefix={t('manageFeeds.feedFetchProgress.inline.stage')}
                estimatedStartPrefix={t('manageFeeds.feedFetchProgress.inline.etaStart')}
                estimatedFinishPrefix={t('manageFeeds.feedFetchProgress.inline.etaFinish')}
                nextFetchPrefix={t('manageFeeds.feedFetchProgress.inline.nextFetch')}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <HoverCard>
            <HoverCardTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t('manageFeeds.previewRecentArticles')}
                  className={ICON_BUTTON_CLASS}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              }
            />
            <HoverCardContent align="end" sideOffset={8} className="w-[420px] p-0">
              <RecentEntriesPreview feedId={subscription.feed_id} feedUrl={subscription.feed.url} />
            </HoverCardContent>
          </HoverCard>
          <SubscriptionFetchProgressButton
            subscription={subscription}
            refreshState={refreshState}
            initialLatestRun={latestRun}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.open(subscription.feed.url, '_blank')}
            title={t('manageFeeds.openFeed')}
            className={ICON_BUTTON_CLASS}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void onRefresh(subscription.id)}
            disabled={refreshingId === subscription.id || isRefreshingRow}
            title={t('manageFeeds.refreshFeed')}
            className={ICON_BUTTON_CLASS}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                (refreshingId === subscription.id || isRefreshingRow) && 'opacity-70'
              )}
            />
          </Button>
          <Menu>
            <MenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => setIsEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                {t('manageFeeds.edit')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                variant="destructive"
                onClick={() => void onDelete(subscription.id)}
                disabled={isDeletePending}
              >
                <Trash2 className="h-4 w-4" />
                {t('manageFeeds.unsubscribe')}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      {isEditOpen && (
        <EditSubscriptionDialog
          subscription={subscription}
          folders={feedFolders}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  )
}

function SubscriptionFetchProgressButton({
  subscription,
  refreshState,
  initialLatestRun,
}: {
  subscription: Subscription
  refreshState?: FeedRefreshState
  initialLatestRun?: FeedFetchLatestRunResponse
}) {
  const { t } = useTranslation('settings')
  const [open, setOpen] = useState(false)
  const { latestRunQuery, historyQuery, viewModel, loadHistory } = useFeedFetchProgress(subscription.feed_id, open)

  const latestRun = latestRunQuery.data ?? initialLatestRun
  const details = buildSettingsFeedFetchDetails(t, latestRun, subscription)
  const historyItems = buildSettingsFeedFetchHistoryItems(t, historyQuery.data?.items ?? [])
  const stageItems = buildSettingsFeedFetchStageItems(t, latestRun?.stages ?? [])
  const currentDiagnosticText = buildSettingsDiagnosticText(t, latestRun)
  const summaryText = buildSettingsFeedFetchSummary(t, latestRun)
  const statusLabel = localizeSettingsFeedFetchStatus(
    t,
    viewModel?.statusKey,
    latestRun?.next_fetch_at ? 'scheduled' : 'not_started'
  )
  const stageLabel = localizeSettingsFeedFetchStage(
    t,
    viewModel?.stageKey,
    latestRun?.next_fetch_at
      ? t('manageFeeds.feedFetchProgress.emptyStates.waitingWindow')
      : t('manageFeeds.feedFetchProgress.emptyStates.noRunYet')
  )

  const isActiveRefresh = !!refreshState && isPendingRefreshStatus(refreshState.status)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          void loadHistory()
        }
      }}
    >
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('manageFeeds.feedFetchProgress.button')}
            className={cn(ICON_BUTTON_CLASS, isActiveRefresh && 'text-primary')}
          >
            <Activity className={cn('h-4 w-4', isActiveRefresh && 'animate-pulse')} />
          </Button>
        }
      />
      <SheetPopup side="right" inset className="max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {subscription.custom_title || subscription.feed.title || t('manageFeeds.untitledFeed')}
          </SheetTitle>
          <SheetDescription>{t('manageFeeds.feedFetchProgress.description')}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-4">
          {latestRunQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : viewModel ? (
            <FeedFetchProgress
              title={t('manageFeeds.feedFetchProgress.currentRun')}
              statusLabel={statusLabel}
              statusTone={viewModel.statusTone}
              stageLabel={stageLabel}
              stageProgressLabel={viewModel.stageProgressLabel}
              progressPercent={viewModel.progressPercent}
              summaryText={summaryText}
              estimatedStartLabel={viewModel.estimatedStartLabel}
              estimatedFinishLabel={viewModel.estimatedFinishLabel}
              predictionLabel={
                viewModel.predictionLabel ? t('manageFeeds.feedFetchProgress.predictionLabel') : null
              }
              progressLabel={t('manageFeeds.feedFetchProgress.progressLabel')}
              estimatedStartPrefix={t('manageFeeds.feedFetchProgress.estimatedStart')}
              estimatedFinishPrefix={t('manageFeeds.feedFetchProgress.estimatedFinish')}
              stages={stageItems}
              stageTimingPrefixes={{
                start: t('manageFeeds.feedFetchProgress.stageTiming.start'),
                finish: t('manageFeeds.feedFetchProgress.stageTiming.finish'),
                duration: t('manageFeeds.feedFetchProgress.stageTiming.duration'),
              }}
              details={details}
              currentDiagnosticTitle={t('manageFeeds.feedFetchProgress.diagnosticTitle')}
              currentDiagnosticText={currentDiagnosticText}
              history={historyItems}
              historyTitle={t('manageFeeds.feedFetchProgress.historyTitle')}
              emptyHistoryLabel={t('manageFeeds.feedFetchProgress.historyEmpty')}
              historyLoading={historyQuery.isFetching && !historyQuery.data}
              historyLoadingLabel={t('manageFeeds.feedFetchProgress.historyLoading')}
            />
          ) : (
            <FeedFetchProgress
              title={t('manageFeeds.feedFetchProgress.currentRun')}
              statusLabel={statusLabel}
              statusTone={latestRun?.next_fetch_at ? 'info' : 'secondary'}
              stageLabel={stageLabel}
              progressPercent={0}
              summaryText={null}
              details={details}
              history={historyItems}
              historyTitle={t('manageFeeds.feedFetchProgress.historyTitle')}
              emptyHistoryLabel={t('manageFeeds.feedFetchProgress.historyEmpty')}
              historyLoading={historyQuery.isFetching && !historyQuery.data}
              historyLoadingLabel={t('manageFeeds.feedFetchProgress.historyLoading')}
            />
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  )
}

function localizeSettingsFeedFetchStatus(
  t: ReturnType<typeof useTranslation>['t'],
  statusKey: string | null | undefined,
  fallback: string
) {
  if (!statusKey) return fallback
  return t(`manageFeeds.feedFetchProgress.statuses.${statusKey}`, { defaultValue: fallback })
}

function localizeSettingsFeedFetchStage(
  t: ReturnType<typeof useTranslation>['t'],
  stageKey: string | null | undefined,
  fallback: string
) {
  if (!stageKey) return fallback
  return t(`manageFeeds.feedFetchProgress.stages.${stageKey}`, { defaultValue: fallback })
}

function localizeSettingsFeedFetchStageStatus(
  t: ReturnType<typeof useTranslation>['t'],
  statusKey: string
) {
  return t(`manageFeeds.feedFetchProgress.stageStatuses.${statusKey}`, { defaultValue: statusKey })
}

function buildSettingsFeedFetchSummary(
  t: ReturnType<typeof useTranslation>['t'],
  run: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined
) {
  const parts = buildFeedFetchSummaryParts(run)
  if (!parts.length) return null
  return parts
    .map((part) => {
      if (part.kind === 'new_entries') {
        return t('manageFeeds.feedFetchProgress.summary.newEntries', { count: part.value ?? 0 })
      }
      if (part.kind === 'total_entries') {
        return t('manageFeeds.feedFetchProgress.summary.totalEntries', { count: part.value ?? 0 })
      }
      if (part.kind === 'backfill_failed_count') {
        return t('manageFeeds.feedFetchProgress.summary.backfillFailed', { count: part.value ?? 0 })
      }
      return t('manageFeeds.feedFetchProgress.summary.fallbackUsed')
    })
    .join(' · ')
}

function buildSettingsFeedFetchFailureReason(
  t: ReturnType<typeof useTranslation>['t'],
  run: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined
) {
  const errorMessage =
    typeof run?.error_message === 'string' && run.error_message.trim().length > 0
      ? run.error_message.trim()
      : null
  if (!errorMessage) return null
  return t('manageFeeds.feedFetchProgress.failureReason', {
    reason: errorMessage,
    defaultValue: `Failure reason: ${errorMessage}`,
  })
}

function buildSettingsFeedFetchDetails(
  t: ReturnType<typeof useTranslation>['t'],
  latestRun: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined,
  subscription: Pick<Subscription, 'feed'>
) {
  const lastFinished =
    formatFeedFetchDateTime(latestRun?.finished_at) ??
    formatFeedFetchDateTime(subscription.feed.last_fetched_at) ??
    t('manageFeeds.feedFetchProgress.firstFetch')
  const lastSuccess =
    formatFeedFetchDateTime(
      latestRun?.last_fetch_success_at ?? subscription.feed.last_fetch_success_at
    ) ?? t('manageFeeds.feedFetchProgress.firstFetch')
  const nextFetch =
    formatFeedFetchDateTime(latestRun?.next_fetch_at) ??
    t('manageFeeds.feedFetchProgress.nextFetchAfterRun')
  const pathValueKey =
    latestRun?.path_kind === 'direct_feed'
      ? 'directFeed'
      : latestRun?.path_kind === 'rsshub_primary'
        ? 'rsshubPrimary'
        : latestRun?.path_kind === 'rsshub_fallback'
          ? 'rsshubFallback'
          : 'unknown'

  return [
    {
      label: t('manageFeeds.feedFetchProgress.path'),
      value: t(`manageFeeds.feedFetchProgress.pathValues.${pathValueKey}`),
    },
    {
      label: t('manageFeeds.feedFetchProgress.lastFinished'),
      value: lastFinished,
    },
    {
      label: t('manageFeeds.feedFetchProgress.lastSuccess'),
      value: lastSuccess,
    },
    {
      label: t('manageFeeds.feedFetchProgress.nextFetch'),
      value: nextFetch,
    },
  ]
}

function buildSettingsFeedFetchStageItems(
  t: ReturnType<typeof useTranslation>['t'],
  stages: FeedFetchStageEvent[]
) {
  return stages.map((stage) => ({
    stageKey: stage.stage_name,
    label: localizeSettingsFeedFetchStage(t, stage.stage_name, stage.stage_name),
    status: normalizeSettingsStageStatus(stage.status),
    statusLabel: localizeSettingsFeedFetchStageStatus(t, normalizeSettingsStageStatus(stage.status)),
    summary: stage.summary,
    startedLabel: formatFeedFetchDateTime(stage.started_at),
    finishedLabel: formatFeedFetchDateTime(stage.finished_at),
    durationLabel:
      stage.started_at && stage.finished_at
        ? formatSettingsDurationBetween(stage.started_at, stage.finished_at)
        : null,
  }))
}

function buildSettingsFeedFetchHistoryItems(
  t: ReturnType<typeof useTranslation>['t'],
  runs: FeedFetchRun[]
) {
  return runs.slice(0, 10).map((run) => {
    const statusLabel = localizeSettingsFeedFetchStatus(
      t,
      run.status,
      run.status ?? t('manageFeeds.feedFetchProgress.statuses.not_started')
    )
    const stageLabel = localizeSettingsFeedFetchStage(
      t,
      run.current_stage,
      run.current_stage ?? t('manageFeeds.feedFetchProgress.emptyStates.noRunYet')
    )
    const timestampLabel =
      formatFeedFetchDateTime(run.finished_at ?? run.started_at ?? run.queue_entered_at) ?? null
    const summaryText = buildSettingsFeedFetchSummary(t, run)
    const failureReason = run.status === 'error' ? buildSettingsFeedFetchFailureReason(t, run) : null

    return {
      id: run.id,
      title: `${statusLabel} · ${stageLabel}`,
      description: [timestampLabel, summaryText, failureReason].filter(Boolean).join(' · ') || null,
      statusLabel,
      statusTone: getFeedFetchStatusTone(run.status),
      durationLabel:
        run.started_at && run.finished_at
          ? formatSettingsDurationBetween(run.started_at, run.finished_at)
          : null,
    }
  })
}

function buildSettingsDiagnosticText(
  t: ReturnType<typeof useTranslation>['t'],
  latestRun: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined
) {
  const failureReason =
    latestRun?.status === 'error' ? buildSettingsFeedFetchFailureReason(t, latestRun) : null
  if (failureReason) return failureReason

  const stage = findCurrentFeedFetchStage(latestRun)
  if (!stage) return null
  const base =
    (stage.is_slow
      ? t(`manageFeeds.feedFetchProgress.slowDiagnostics.${stage.stage_name}`, {
          defaultValue: stage.public_diagnostic ?? '',
        })
      : null) || stage.public_diagnostic
  if (!base) return null
  const lastProgress = formatFeedFetchDateTime(stage.last_progress_at)
  return lastProgress
    ? `${base} · ${t('manageFeeds.feedFetchProgress.lastProgress')}: ${lastProgress}`
    : base
}

function formatSettingsGlobalQueueSummary(
  t: ReturnType<typeof useTranslation>['t'],
  summary: { runningCount: number; queuedCount: number; totalCount: number }
) {
  if (summary.totalCount <= 0) {
    return null
  }
  const localized = t('manageFeeds.feedFetchProgress.globalQueueSummary', {
    running: summary.runningCount,
    queued: summary.queuedCount,
  })
  return typeof localized === 'string'
    ? localized
    : formatFeedQueueSummary(summary.runningCount, summary.queuedCount)
}

function normalizeSettingsStageStatus(
  status: string
): 'pending' | 'running' | 'success' | 'error' | 'skipped' {
  if (status === 'running') return 'running'
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  if (status === 'skipped') return 'skipped'
  return 'pending'
}

function formatSettingsDurationBetween(startedAt: string, finishedAt: string) {
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function isPendingRefreshStatus(statusValue: string) {
  return statusValue === 'queued' || statusValue === 'deferred' || statusValue === 'in_progress'
}

function RefreshMeta({
  refreshState,
  subscription,
  effectiveLastFetchAttemptAt,
  effectiveLastFetchSuccessAt,
  rowLogMessage,
}: {
  refreshState: FeedRefreshState
  subscription: Subscription
  effectiveLastFetchAttemptAt: string | null | undefined
  effectiveLastFetchSuccessAt: string | null | undefined
  rowLogMessage: string | null
}) {
  const { t } = useTranslation('settings')
  const isError = refreshState.resultStatus === 'error'
  const isDone = refreshState.status === 'complete' || refreshState.status === 'not_found'
  const isPendingRow = isPendingRefreshStatus(refreshState.status)
  const statusLabelMap: Record<string, string> = {
    queued: t('manageFeeds.refreshStatus.queued'),
    deferred: t('manageFeeds.refreshStatus.deferred'),
    in_progress: t('manageFeeds.refreshStatus.refreshing'),
    complete: t('manageFeeds.refreshStatus.completed'),
    not_found: t('manageFeeds.refreshStatus.notFound'),
  }
  const resultStatusLabelMap: Record<string, string> = {
    success: t('manageFeeds.refreshResult.success'),
    not_modified: t('manageFeeds.refreshResult.notModified'),
    error: t('manageFeeds.refreshResult.failed'),
  }
  const statusLabel = statusLabelMap[refreshState.status] || refreshState.status
  const resultStatusLabel =
    refreshState.resultStatus &&
    (resultStatusLabelMap[refreshState.resultStatus] || refreshState.resultStatus)

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2 text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
        <span>
          {statusLabel}
          {resultStatusLabel ? ` · ${resultStatusLabel}` : ''}
          {refreshState.newEntries !== null
            ? ` · +${refreshState.newEntries}${refreshState.totalEntries !== null ? ` / ${refreshState.totalEntries}` : ''} ${t('manageFeeds.entriesSuffix')}`
            : ''}
        </span>
        <span>
          {new Date(effectiveLastFetchAttemptAt || subscription.feed.created_at).toLocaleString()}
        </span>
      </div>

      {effectiveLastFetchSuccessAt && (
        <p className="text-xs text-muted-foreground">
          {t('manageFeeds.lastSuccessLabel')}: {new Date(effectiveLastFetchSuccessAt).toLocaleString()}
        </p>
      )}

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {isPendingRow && (
          <div className="h-full w-1/4 rounded-full bg-primary" />
        )}
        {isDone && !isError && <div className="h-full w-full rounded-full bg-primary" />}
        {isError && <div className="h-full w-full rounded-full bg-destructive" />}
      </div>

      {rowLogMessage && (
        <div className={cn('flex items-start gap-1 text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
          {isError && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
          <p className="line-clamp-2">{rowLogMessage}</p>
        </div>
      )}
    </>
  )
}

function RecentEntriesPreview({ feedId, feedUrl }: { feedId: string; feedUrl: string }) {
  const { t } = useTranslation('settings')
  const { user } = useAuthStore()
  const { data, isLoading, error } = useEntries({
    feed_id: feedId,
    page: 1,
    per_page: 10,
    view: 'timeline',
  })

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({})
  const [previewEntry, setPreviewEntry] = useState<EntryWithState | null>(null)
  const listTranslationAutoEnabled = user?.settings?.list_translation_auto_enabled ?? false
  const preferredTargetLanguage = user?.settings?.translation_target_language ?? 'zh-CN'

  useEffect(() => {
    let cancelled = false

    if (!listTranslationAutoEnabled || items.length === 0) {
      setTranslatedTitles({})
      return
    }

    const titlesToTranslate = items
      .map((entry) => ({ id: entry.id, title: entry.title.trim() }))
      .filter(({ title }) => title.length > 0 && shouldAutoTranslate(title, preferredTargetLanguage))

    if (titlesToTranslate.length === 0) {
      setTranslatedTitles({})
      return
    }

    const uniqueTitles = [...new Set(titlesToTranslate.map(({ title }) => title))]

    void (async () => {
      try {
        const response = await entryService.translateTexts(uniqueTitles, preferredTargetLanguage, 'auto')
        if (cancelled) return

        const byTitle = new Map<string, string>()
        uniqueTitles.forEach((title, index) => {
          const translated = response.translations[index]?.trim()
          if (translated) byTitle.set(title, translated)
        })

        const next: Record<string, string> = {}
        titlesToTranslate.forEach(({ id, title }) => {
          const translated = byTitle.get(title)
          if (translated) next[id] = translated
        })
        setTranslatedTitles(next)
      } catch {
        if (!cancelled) setTranslatedTitles({})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items, listTranslationAutoEnabled, preferredTargetLanguage])

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-lg border bg-popover px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-sm font-medium">{t('manageFeeds.recentArticlesTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('manageFeeds.recentArticlesDescription')}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {t('manageFeeds.recentArticlesCount', { count: items.length })}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={`entry-skeleton-${index}`} className="space-y-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive">{t('manageFeeds.recentArticlesFailed')}</p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('manageFeeds.recentArticlesEmpty')}</p>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((entry: EntryWithState) => {
            const previewText = getEntryPreviewText(entry.summary)
            const backfillMeta = getBackfillStatusMeta(entry, t)

            return (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-background/80"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">
                    {translatedTitles[entry.id] || entry.title}
                  </p>
                  {previewText && (
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {previewText}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{entry.author || t('manageFeeds.unknownAuthor')}</span>
                    <span>•</span>
                    <span>{formatEntryDate(entry.published_at || entry.created_at)}</span>
                    {!entry.is_read && (
                      <>
                        <span>•</span>
                        <span>{t('manageFeeds.unread')}</span>
                      </>
                    )}
                  </div>
                  {backfillMeta && (
                    <div className="mt-2 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                            backfillMeta.toneClass
                          )}
                        >
                          <Wand2 className="h-3 w-3" />
                          {backfillMeta.label}
                        </span>
                        {typeof entry.content_backfill_attempts === 'number' && (
                          <span className="text-muted-foreground">
                            {t('manageFeeds.contentBackfill.attempts', {
                              count: entry.content_backfill_attempts,
                            })}
                          </span>
                        )}
                      </div>
                      {entry.content_backfill_status === 'failed' && entry.content_backfill_error && (
                        <p className="break-words text-xs leading-5 text-destructive">
                          {t('manageFeeds.contentBackfill.errorLog', {
                            message: entry.content_backfill_error,
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPreviewEntry(entry)}
                    title={t('manageFeeds.previewArticleDetails')}
                    className={ICON_BUTTON_CLASS}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => window.open(entry.url || feedUrl, '_blank')}
                    title={t('manageFeeds.openArticle')}
                    className={ICON_BUTTON_CLASS}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!previewEntry} onOpenChange={(open) => !open && setPreviewEntry(null)}>
        <DialogPopup className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewEntry ? translatedTitles[previewEntry.id] || previewEntry.title : ''}</DialogTitle>
            <DialogDescription>
              {previewEntry
                ? `${previewEntry.author || t('manageFeeds.unknownAuthor')} • ${formatEntryDate(
                    previewEntry.published_at || previewEntry.created_at
                  )}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              <div className="max-h-[52vh] overflow-y-auto rounded-lg border bg-muted/20 p-4">
                <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">
                  {previewEntry
                    ? getEntryPreviewText(previewEntry.summary, previewEntry.content) ||
                      t('manageFeeds.articlePreviewEmpty')
                    : ''}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (previewEntry) window.open(previewEntry.url || feedUrl, '_blank')
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('manageFeeds.openArticle')}
                </Button>
              </div>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

function formatEntryDate(value: string) {
  return new Date(value).toLocaleString()
}

function getBackfillStatusMeta(
  entry: Pick<EntryWithState, 'content_backfill_status'>,
  t: ReturnType<typeof useTranslation>['t']
) {
  switch (entry.content_backfill_status) {
    case 'pending':
      return {
        label: t('manageFeeds.contentBackfill.pending'),
        toneClass: 'bg-warning/10 text-warning ring-1 ring-warning/20',
      }
    case 'processing':
      return {
        label: t('manageFeeds.contentBackfill.processing'),
        toneClass: 'bg-info/10 text-info ring-1 ring-info/20',
      }
    case 'done':
      return {
        label: t('manageFeeds.contentBackfill.done'),
        toneClass: 'bg-success/10 text-success ring-1 ring-success/20',
      }
    case 'failed':
      return {
        label: t('manageFeeds.contentBackfill.failed'),
        toneClass: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
      }
    case 'skipped':
      return {
        label: t('manageFeeds.contentBackfill.skipped'),
        toneClass: 'bg-muted text-muted-foreground',
      }
    default:
      return null
  }
}

function getEntryPreviewText(summary: string | null, content?: string | null) {
  const source = summary || content || ''
  if (!source) return ''
  return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
