import { useState, useEffect } from 'react'
import { useTranslation } from '@glean/i18n'
import {
  Button,
  Badge,
  Checkbox,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  cn,
} from '@glean/ui'
import {
  ChevronRight,
  Inbox,
  Plus,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Upload,
  Download,
  CalendarDays,
  FolderInput,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  MoreHorizontal as MoreIcon,
  CheckCheck,
  Loader2,
} from 'lucide-react'
import type { FolderTreeNode, Subscription } from '@glean/types'
import {
  useBatchDeleteSubscriptions,
  useDeleteSubscription,
  useRefreshFeed,
  useUpdateSubscription,
} from '../../hooks/useSubscriptions'
import { useMarkAllRead } from '../../hooks/useEntries'
import { iconProxyUrl } from '../../lib/icon'
import { useFolderStore } from '../../stores/folderStore'
import { SidebarItem } from './SidebarItem'
import {
  buildSiblingFolderOrders,
  getFolderDropPlacement,
  isFolderDropAreaActive,
  type FolderDropPlacement,
} from './SidebarFeedsSection.dnd'

interface SidebarFeedsSectionProps {
  readonly isSidebarOpen: boolean
  readonly isMobileSidebarOpen: boolean
  readonly isFeedsSectionExpanded: boolean
  readonly onToggleFeedsSection: () => void
  readonly onAddFeed: () => void
  readonly onCreateFolder: (parentId: string | null) => void
  readonly onRefreshAll: () => void
  readonly refreshAllPending: boolean
  readonly onImportOPML: () => void
  readonly importPending: boolean
  readonly onExportOPML: () => void
  readonly exportPending: boolean
  readonly onFeedSelect: (feedId?: string, folderId?: string) => void
  readonly onFeedHover?: (feedId?: string, folderId?: string) => void
  readonly onFolderHover?: (folderId: string) => void
  readonly onTodayBoardViewSelect: () => void
  readonly isTodayBoardView: boolean
  readonly isReaderPage: boolean
  readonly currentFeedId?: string
  readonly currentFolderId?: string
  readonly feedFolders: FolderTreeNode[]
  readonly subscriptionsByFolder: Record<string, Subscription[]>
  readonly ungroupedSubscriptions: Subscription[]
  readonly expandedFolders: Set<string>
  readonly toggleFolder: (folderId: string) => void
  readonly draggedFeed: Subscription | null
  readonly setDraggedFeed: (feed: Subscription | null) => void
  readonly dragOverFolderId: string | null
  readonly setDragOverFolderId: (id: string | null) => void
}

export function SidebarFeedsSection({
  isSidebarOpen,
  isMobileSidebarOpen,
  isFeedsSectionExpanded,
  onToggleFeedsSection,
  onAddFeed,
  onCreateFolder,
  onRefreshAll,
  refreshAllPending,
  onImportOPML,
  importPending,
  onExportOPML,
  exportPending,
  onFeedSelect,
  onFeedHover,
  onFolderHover,
  onTodayBoardViewSelect,
  isTodayBoardView,
  isReaderPage,
  currentFeedId,
  currentFolderId,
  feedFolders,
  subscriptionsByFolder,
  ungroupedSubscriptions,
  expandedFolders,
  toggleFolder,
  draggedFeed,
  setDraggedFeed,
  dragOverFolderId,
  setDragOverFolderId,
}: SidebarFeedsSectionProps) {
  const { t } = useTranslation('feeds')
  const updateMutation = useUpdateSubscription()
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<Set<string>>(new Set())
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [folderDropIndicator, setFolderDropIndicator] = useState<{
    folderId: string
    placement: FolderDropPlacement
  } | null>(null)
  const batchDeleteMutation = useBatchDeleteSubscriptions()

  useEffect(() => {
    // Clean up drag and drop state when the component unmounts.
    // This prevents visual state from persisting across page navigations.
    return () => {
      setDraggedFeed(null)
      setDragOverFolderId(null)
      setDraggedFolderId(null)
      setFolderDropIndicator(null)
    }
  }, [setDragOverFolderId, setDraggedFeed]) // Setter identities are expected to be stable.

  const getSubscriptionsForFolder = (folderId: string) => subscriptionsByFolder[folderId] || []
  const selectedCount = selectedSubscriptionIds.size

  const toggleFeedSelection = (subscriptionId: string) => {
    setSelectedSubscriptionIds((prev) => {
      const next = new Set(prev)
      if (next.has(subscriptionId)) {
        next.delete(subscriptionId)
      } else {
        next.add(subscriptionId)
      }
      return next
    })
  }

  const exitSelectionMode = () => {
    setIsSelectionMode(false)
    setSelectedSubscriptionIds(new Set())
  }

  const handleBatchUnsubscribe = async () => {
    const subscriptionIds = Array.from(selectedSubscriptionIds)
    if (subscriptionIds.length === 0) return

    await batchDeleteMutation.mutateAsync({ subscription_ids: subscriptionIds })
    exitSelectionMode()
  }

  return (
    <>
      {(isSidebarOpen || isMobileSidebarOpen) && (
        <div
          className={cn(
            'mb-1 flex items-center justify-between md:mb-2',
            isMobileSidebarOpen &&
              'bg-card/95 sticky top-0 z-20 -mx-1.5 mb-1 px-1.5 py-1 backdrop-blur-sm'
          )}
        >
          <button
            onClick={onToggleFeedsSection}
            className={cn(
              'text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors md:px-3 md:text-xs',
              isMobileSidebarOpen && 'rounded-md bg-muted/60 px-2.5 py-1 text-[11px] text-current'
            )}
            aria-label={isFeedsSectionExpanded ? 'Collapse feeds section' : 'Expand feeds section'}
          >
            <ChevronRight
              className={cn('h-3 w-3 transition-transform', isFeedsSectionExpanded && 'rotate-90')}
            />
            {t('sidebar.feeds')}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={onAddFeed}
              className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
              title={t('actions.addFeed')}
              aria-label={t('actions.addFeed')}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => onCreateFolder(null)}
              className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
              title={t('actions.createFolder')}
              aria-label={t('actions.createFolder')}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <Menu>
              <MenuTrigger
                className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                aria-label="Feed management menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={onRefreshAll} disabled={refreshAllPending}>
                  <RefreshCw className={`h-4 w-4 ${refreshAllPending ? 'animate-spin' : ''}`} />
                  <span>
                    {refreshAllPending ? t('states.refreshing') : t('actions.refreshAll')}
                  </span>
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={onImportOPML} disabled={importPending}>
                  <Upload className="h-4 w-4" />
                  <span>{importPending ? t('states.importing') : t('actions.importOPML')}</span>
                </MenuItem>
                <MenuItem onClick={onExportOPML} disabled={exportPending}>
                  <Download className="h-4 w-4" />
                  <span>{exportPending ? t('states.exporting') : t('actions.exportOPML')}</span>
                </MenuItem>
                {isSidebarOpen && !isMobileSidebarOpen && (
                  <>
                    <MenuSeparator />
                    <MenuItem onClick={() => setIsSelectionMode(true)} disabled={isSelectionMode}>
                      <CheckCheck className="h-4 w-4" />
                      <span>{t('actions.selectFeeds')}</span>
                    </MenuItem>
                  </>
                )}
              </MenuPopup>
            </Menu>
          </div>
        </div>
      )}

      {!isSidebarOpen && !isMobileSidebarOpen && (
        <button
          onClick={onAddFeed}
          className="group text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
          title={t('actions.addFeed')}
          aria-label={t('actions.addFeed')}
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      {isFeedsSectionExpanded && (
        <>
          <SidebarItem
            icon={<CalendarDays />}
            label={t('sidebar.todayBoard')}
            isActive={isTodayBoardView}
            onClick={onTodayBoardViewSelect}
            isSidebarCollapsed={!isSidebarOpen && !isMobileSidebarOpen}
            compact={isMobileSidebarOpen}
            title={t('sidebar.todayBoard')}
            className="mt-0.5"
          />

          <SidebarItem
            icon={<Inbox />}
            label={t('sidebar.allFeeds')}
            isActive={isReaderPage && !currentFeedId && !currentFolderId && !isTodayBoardView}
            onClick={() => onFeedSelect(undefined)}
            onMouseEnter={() => onFeedHover?.(undefined, undefined)}
            onTouchStart={() => onFeedHover?.(undefined, undefined)}
            isSidebarCollapsed={!isSidebarOpen && !isMobileSidebarOpen}
            compact={isMobileSidebarOpen}
            title={t('sidebar.allFeeds')}
            className="mt-0.5"
          />

          {isSidebarOpen && !isMobileSidebarOpen && isSelectionMode && (
            <div className="border-border bg-muted/30 mt-2 rounded-lg border px-3 py-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  {t('common.selectedCount', { count: selectedCount })}
                </span>
                <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                  {t('common.cancel')}
                </Button>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="w-full gap-1.5"
                onClick={() => void handleBatchUnsubscribe()}
                disabled={selectedCount === 0 || batchDeleteMutation.isPending}
              >
                {batchDeleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('actions.unsubscribeSelected')}
              </Button>
            </div>
          )}

          {(isSidebarOpen || isMobileSidebarOpen) && feedFolders.length > 0 && (
            <div className="space-y-0.5">
              {feedFolders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  siblingFolders={feedFolders}
                  isExpanded={expandedFolders.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  onSelect={(folderId) => onFeedSelect(undefined, folderId)}
                  onHoverFolder={onFolderHover}
                  isActive={currentFolderId === folder.id}
                  subscriptions={getSubscriptionsForFolder(folder.id)}
                  subscriptionsByFolder={subscriptionsByFolder}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  currentFeedId={currentFeedId}
                  currentFolderId={currentFolderId}
                  onFeedSelect={(feedId) => onFeedSelect(feedId)}
                  onFeedHover={(feedId) => onFeedHover?.(feedId)}
                  allFolders={feedFolders}
                  onCreateSubfolder={() => onCreateFolder(folder.id)}
                  draggedFeed={draggedFeed}
                  setDraggedFeed={setDraggedFeed}
                  dragOverFolderId={dragOverFolderId}
                  setDragOverFolderId={setDragOverFolderId}
                  draggedFolderId={draggedFolderId}
                  setDraggedFolderId={setDraggedFolderId}
                  folderDropIndicator={folderDropIndicator}
                  setFolderDropIndicator={setFolderDropIndicator}
                  isSelectionMode={isSidebarOpen && !isMobileSidebarOpen && isSelectionMode}
                  isCompact={isMobileSidebarOpen}
                  selectedSubscriptionIds={selectedSubscriptionIds}
                  onToggleFeedSelection={toggleFeedSelection}
                />
              ))}
            </div>
          )}

          {(isSidebarOpen || isMobileSidebarOpen) &&
            !(isSidebarOpen && !isMobileSidebarOpen && isSelectionMode) &&
            draggedFeed !== null &&
            draggedFeed.folder_id !== null && (
              <section
                aria-label={t('common.removeFromFolder')}
                className={`mt-2 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-all ${
                  dragOverFolderId === '__uncategorized__'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground'
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverFolderId('__uncategorized__')
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedFeed) {
                    updateMutation.mutate({
                      subscriptionId: draggedFeed.id,
                      data: { folder_id: null },
                    })
                  }
                  setDraggedFeed(null)
                  setDragOverFolderId(null)
                }}
              >
                <FolderInput className="h-4 w-4" />
                <span>{t('common.removeFromFolder')}</span>
              </section>
            )}

          {(isSidebarOpen || isMobileSidebarOpen) && ungroupedSubscriptions.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {ungroupedSubscriptions.map((sub) => (
                <SidebarFeedItem
                  key={sub.id}
                  subscription={sub}
                  isActive={isReaderPage && currentFeedId === sub.feed_id}
                  onClick={() => onFeedSelect(sub.feed_id)}
                  onHover={() => onFeedHover?.(sub.feed_id)}
                  allFolders={feedFolders}
                  isDragging={
                    !(isSidebarOpen && !isMobileSidebarOpen && isSelectionMode) &&
                    draggedFeed?.id === sub.id
                  }
                  onDragStart={() => setDraggedFeed(sub)}
                  onDragEnd={() => {
                    setDraggedFeed(null)
                    setDragOverFolderId(null)
                  }}
                  isSelectionMode={isSidebarOpen && !isMobileSidebarOpen && isSelectionMode}
                  isCompact={isMobileSidebarOpen}
                  isSelected={selectedSubscriptionIds.has(sub.id)}
                  onToggleSelect={toggleFeedSelection}
                />
              ))}
            </div>
          )}
        </>
      )}

    </>
  )
}

interface SidebarFolderItemProps {
  readonly folder: FolderTreeNode
  readonly siblingFolders: FolderTreeNode[]
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly onSelect: (folderId: string) => void
  readonly isActive: boolean
  readonly subscriptions: Subscription[]
  readonly subscriptionsByFolder: Record<string, Subscription[]>
  readonly expandedFolders: Set<string>
  readonly toggleFolder: (folderId: string) => void
  readonly currentFeedId?: string
  readonly currentFolderId?: string
  readonly onFeedSelect: (feedId: string) => void
  readonly onFeedHover?: (feedId: string) => void
  readonly onHoverFolder?: (folderId: string) => void
  readonly allFolders: FolderTreeNode[]
  readonly onCreateSubfolder: () => void
  readonly draggedFeed: Subscription | null
  readonly setDraggedFeed: (feed: Subscription | null) => void
  readonly dragOverFolderId: string | null
  readonly setDragOverFolderId: (id: string | null) => void
  readonly draggedFolderId: string | null
  readonly setDraggedFolderId: (id: string | null) => void
  readonly folderDropIndicator: { folderId: string; placement: FolderDropPlacement } | null
  readonly setFolderDropIndicator: (
    indicator: { folderId: string; placement: FolderDropPlacement } | null
  ) => void
  readonly isSelectionMode: boolean
  readonly isCompact: boolean
  readonly selectedSubscriptionIds: Set<string>
  readonly onToggleFeedSelection: (subscriptionId: string) => void
}

function SidebarFolderItem({
  folder,
  siblingFolders,
  isExpanded,
  onToggle,
  onSelect,
  isActive,
  subscriptions,
  subscriptionsByFolder,
  expandedFolders,
  toggleFolder,
  currentFeedId,
  currentFolderId,
  onFeedSelect,
  onFeedHover,
  onHoverFolder,
  allFolders,
  onCreateSubfolder,
  draggedFeed,
  setDraggedFeed,
  dragOverFolderId,
  setDragOverFolderId,
  draggedFolderId,
  setDraggedFolderId,
  folderDropIndicator,
  setFolderDropIndicator,
  isSelectionMode,
  isCompact,
  selectedSubscriptionIds,
  onToggleFeedSelection,
}: SidebarFolderItemProps) {
  const { t } = useTranslation('feeds')
  const { deleteFolder, updateFolder, reorderFolders } = useFolderStore()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFolderName, setRenameFolderName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  const totalUnread = subscriptions.reduce((sum, sub) => sum + sub.unread_count, 0)
  const folderSubscriptionIds = collectFolderSubscriptionIds(folder, subscriptionsByFolder)
  const selectedCount = folderSubscriptionIds.filter((subscriptionId) =>
    selectedSubscriptionIds.has(subscriptionId)
  ).length
  const isFullySelected = folderSubscriptionIds.length > 0 && selectedCount === folderSubscriptionIds.length
  const isPartiallySelected = selectedCount > 0 && selectedCount < folderSubscriptionIds.length

  const isFeedDropTarget = isFolderDropAreaActive({
    dragOverFolderId,
    folderId: folder.id,
    draggedFeedFolderId: draggedFeed?.folder_id ?? null,
    draggedFolderId,
  })
  const canReceiveFeedDrop = draggedFeed && draggedFeed.folder_id !== folder.id
  const canReceiveFolderDrop =
    draggedFolderId !== null &&
    draggedFolderId !== folder.id &&
    siblingFolders.some((sibling) => sibling.id === draggedFolderId)
  const isFolderDropTarget = folderDropIndicator?.folderId === folder.id && canReceiveFolderDrop
  const isDropBefore = isFolderDropTarget && folderDropIndicator?.placement === 'before'
  const isDropAfter = isFolderDropTarget && folderDropIndicator?.placement === 'after'

  const handleDragOver = (e: React.DragEvent) => {
    if (isSelectionMode) return
    if (draggedFolderId) {
      if (!canReceiveFolderDrop) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolderId(null)
      setFolderDropIndicator({
        folderId: folder.id,
        placement: getFolderDropPlacement(e.currentTarget.getBoundingClientRect(), e.clientY),
      })
      return
    }

    if (draggedFeed) {
      e.preventDefault()
      e.dataTransfer.dropEffect = canReceiveFeedDrop ? 'move' : 'none'
      setFolderDropIndicator(null)
      setDragOverFolderId(folder.id)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const nextTarget = e.relatedTarget
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
      return
    }

    if (dragOverFolderId === folder.id) {
      setDragOverFolderId(null)
    }
    if (folderDropIndicator?.folderId === folder.id) {
      setFolderDropIndicator(null)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    if (isSelectionMode) return
    e.preventDefault()
    if (draggedFolderId && canReceiveFolderDrop) {
      const placement =
        folderDropIndicator?.folderId === folder.id
          ? folderDropIndicator.placement
          : getFolderDropPlacement(e.currentTarget.getBoundingClientRect(), e.clientY)
      const orders = buildSiblingFolderOrders(siblingFolders, draggedFolderId, folder.id, placement)
      if (orders.length > 0) {
        await reorderFolders(orders)
      }
    } else if (draggedFeed && draggedFeed.folder_id !== folder.id) {
      await updateMutation.mutateAsync({
        subscriptionId: draggedFeed.id,
        data: { folder_id: folder.id },
      })
    }
    setDraggedFolderId(null)
    setFolderDropIndicator(null)
    setDraggedFeed(null)
    setDragOverFolderId(null)
  }

  const handleDissolveFolder = async () => {
    await deleteFolder(folder.id)
    setIsMenuOpen(false)
  }

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim() || renameFolderName === folder.name) {
      setShowRenameDialog(false)
      return
    }
    setIsRenaming(true)
    try {
      await updateFolder(folder.id, renameFolderName.trim())
      setShowRenameDialog(false)
    } finally {
      setIsRenaming(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsMenuOpen(true)
  }

  const handleFolderSelectionToggle = () => {
    if (folderSubscriptionIds.length === 0) return

    const shouldSelect = !isFullySelected
    folderSubscriptionIds.forEach((subscriptionId) => {
      if (shouldSelect) {
        if (!selectedSubscriptionIds.has(subscriptionId)) {
          onToggleFeedSelection(subscriptionId)
        }
        return
      }

      if (selectedSubscriptionIds.has(subscriptionId)) {
        onToggleFeedSelection(subscriptionId)
      }
    })
  }

  const getContainerClasses = () => {
    if (isFeedDropTarget && canReceiveFeedDrop) {
      return 'bg-primary/10 ring-primary/30 ring-2'
    }
    if (isActive) {
      return isCompact
        ? 'bg-primary/15 text-primary font-semibold shadow-sm ring-1 ring-primary/25 border-l-2 border-primary'
        : 'bg-primary/10 text-primary scale-[1.01] font-medium shadow-sm'
    }
    return 'text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-[1.01]'
  }

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center rounded-lg text-sm transition-all duration-200',
          isCompact ? 'gap-2 px-2 py-1.5 text-[13px]' : 'gap-3 px-3 py-2',
          !isSelectionMode && 'cursor-grab active:cursor-grabbing',
          isDropBefore && 'border-primary border-t-2',
          isDropAfter && 'border-primary border-b-2',
          getContainerClasses()
        )}
        draggable={!isSelectionMode}
        onDragStart={(e) => {
          if (isSelectionMode) return
          e.dataTransfer.effectAllowed = 'move'
          setDraggedFeed(null)
          setDraggedFolderId(folder.id)
        }}
        onDragEnd={() => {
          setDraggedFolderId(null)
          setFolderDropIndicator(null)
          setDragOverFolderId(null)
        }}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={() => onHoverFolder?.(folder.id)}
        onTouchStart={() => onHoverFolder?.(folder.id)}
      >
        {isSelectionMode && (
          <Checkbox
            checked={isFullySelected}
            indeterminate={isPartiallySelected}
            aria-label={t('common.selectFolder')}
            disabled={folderSubscriptionIds.length === 0}
            onCheckedChange={handleFolderSelectionToggle}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          type="button"
          onClick={onToggle}
          className="touch-target-none flex h-5 items-center gap-2.5"
        >
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Folder
              className={cn(
                'absolute h-4 w-4 transition-all duration-300 ease-out',
                isExpanded ? 'scale-50 -rotate-[15deg] opacity-0' : 'scale-100 rotate-0 opacity-100'
              )}
            />
            <FolderOpen
              className={cn(
                'absolute h-4 w-4 transition-all duration-300 ease-out',
                isExpanded ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-[15deg] opacity-0'
              )}
            />
          </span>
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className="touch-target-none h-5 min-w-0 flex-1 truncate text-left"
        >
          {folder.name}
        </button>
        {!isExpanded && totalUnread > 0 && (
          <Badge size="sm" className="bg-muted text-muted-foreground shrink-0 text-[10px]">
            {totalUnread}
          </Badge>
        )}

        <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <MenuTrigger className="touch-target-none text-muted-foreground hover:bg-accent hover:text-foreground h-5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <MoreIcon className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              onClick={() => markAllReadMutation.mutate({ folderId: folder.id })}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck
                className={cn('h-4 w-4', markAllReadMutation.isPending && 'animate-pulse')}
              />
              <span>
                {markAllReadMutation.isPending ? t('common.marking') : t('actions.markAllAsRead')}
              </span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onCreateSubfolder}>
              <FolderPlus className="h-4 w-4" />
              <span>{t('actions.createSubfolder')}</span>
            </MenuItem>
            <MenuItem onClick={() => setShowRenameDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span>{t('common.rename')}</span>
            </MenuItem>
            <MenuSeparator />
            <MenuSub>
              <MenuSubTrigger className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive">
                <Trash2 className="h-4 w-4" />
                <span>{t('actions.dissolveFolder')}</span>
              </MenuSubTrigger>
              <MenuSubPopup>
                <p className="text-muted-foreground px-2 py-1 text-xs">
                  {t('dialogs.dissolveFolder.description', { name: folder.name })}
                </p>
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={() => void handleDissolveFolder()}>
                  <Trash2 className="h-4 w-4" />
                  <span>{t('dialogs.dissolveFolder.confirm')}</span>
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          </MenuPopup>
        </Menu>
      </div>

      {isExpanded && (
        <div
          className={cn(
            'border-border mt-0.5 ml-4 space-y-0.5 border-l pl-2',
            isFeedDropTarget && canReceiveFeedDrop && 'bg-primary/5 ring-primary/20 rounded-r-md ring-1'
          )}
          onDragOver={(e) => {
            if (isSelectionMode || !draggedFeed || draggedFolderId) return
            e.preventDefault()
            e.dataTransfer.dropEffect = canReceiveFeedDrop ? 'move' : 'none'
            setDragOverFolderId(folder.id)
          }}
          onDragLeave={(e) => {
            const nextTarget = e.relatedTarget
            if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
              return
            }
            if (dragOverFolderId === folder.id) {
              setDragOverFolderId(null)
            }
          }}
          onDrop={async (e) => {
            if (isSelectionMode || !draggedFeed || draggedFeed.folder_id === folder.id || draggedFolderId) {
              return
            }
            e.preventDefault()
            await updateMutation.mutateAsync({
              subscriptionId: draggedFeed.id,
              data: { folder_id: folder.id },
            })
            setDraggedFeed(null)
            setDragOverFolderId(null)
          }}
        >
          {folder.children.map((child) => (
            <SidebarFolderItem
              key={child.id}
              folder={child}
              siblingFolders={folder.children}
              isExpanded={expandedFolders.has(child.id)}
              onToggle={() => toggleFolder(child.id)}
              onSelect={onSelect}
              isActive={currentFolderId === child.id}
              subscriptions={subscriptionsByFolder[child.id] || []}
              subscriptionsByFolder={subscriptionsByFolder}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              currentFeedId={currentFeedId}
              currentFolderId={currentFolderId}
              onFeedSelect={onFeedSelect}
              onFeedHover={onFeedHover}
              onHoverFolder={onHoverFolder}
              allFolders={allFolders}
              onCreateSubfolder={() => {}}
              draggedFeed={draggedFeed}
              setDraggedFeed={setDraggedFeed}
              dragOverFolderId={dragOverFolderId}
              setDragOverFolderId={setDragOverFolderId}
              draggedFolderId={draggedFolderId}
              setDraggedFolderId={setDraggedFolderId}
              folderDropIndicator={folderDropIndicator}
              setFolderDropIndicator={setFolderDropIndicator}
              isSelectionMode={isSelectionMode}
              isCompact={isCompact}
              selectedSubscriptionIds={selectedSubscriptionIds}
              onToggleFeedSelection={onToggleFeedSelection}
            />
          ))}

          {subscriptions.map((sub) => (
            <SidebarFeedItem
              key={sub.id}
              subscription={sub}
              isActive={currentFeedId === sub.feed_id}
              onClick={() => onFeedSelect(sub.feed_id)}
              onHover={() => onFeedHover?.(sub.feed_id)}
              allFolders={allFolders}
              isDragging={!isSelectionMode && draggedFeed?.id === sub.id}
              onDragStart={() => setDraggedFeed(sub)}
              onDragEnd={() => {
                setDraggedFeed(null)
                setDragOverFolderId(null)
              }}
              isSelectionMode={isSelectionMode}
              isCompact={isCompact}
              isSelected={selectedSubscriptionIds.has(sub.id)}
              onToggleSelect={onToggleFeedSelection}
            />
          ))}

          {subscriptions.length === 0 && folder.children.length === 0 && (
            <p className="text-muted-foreground/60 px-3 py-2 text-xs">{t('common.emptyFolder')}</p>
          )}
        </div>
      )}

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.renameFolder.title')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder">{t('dialogs.createFolder.name')}</Label>
              <Input
                id="rename-folder"
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameFolder()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRenameDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim() || isRenaming}>
              {isRenaming ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

function collectFolderSubscriptionIds(
  folder: FolderTreeNode,
  subscriptionsByFolder: Record<string, Subscription[]>
): string[] {
  return [
    ...(subscriptionsByFolder[folder.id] || []).map((subscription) => subscription.id),
    ...folder.children.flatMap((child) => collectFolderSubscriptionIds(child, subscriptionsByFolder)),
  ]
}

interface SidebarFeedItemProps {
  readonly subscription: Subscription
  readonly isActive: boolean
  readonly onClick: () => void
  readonly onHover?: () => void
  readonly allFolders: FolderTreeNode[]
  readonly isDragging?: boolean
  readonly onDragStart?: () => void
  readonly onDragEnd?: () => void
  readonly isSelectionMode?: boolean
  readonly isCompact?: boolean
  readonly isSelected?: boolean
  readonly onToggleSelect?: (subscriptionId: string) => void
}

function SidebarFeedItem({
  subscription,
  isActive,
  onClick,
  onHover,
  allFolders,
  isDragging = false,
  onDragStart,
  onDragEnd,
  isSelectionMode = false,
  isCompact = false,
  isSelected = false,
  onToggleSelect,
}: SidebarFeedItemProps) {
  const { t } = useTranslation('feeds')
  const deleteMutation = useDeleteSubscription()
  const refreshMutation = useRefreshFeed()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editTitle, setEditTitle] = useState(subscription.custom_title || '')
  const [editUrl, setEditUrl] = useState(subscription.feed.url || '')
  const [rsshubPath, setRsshubPath] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsMenuOpen(true)
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(subscription.id)
    setIsMenuOpen(false)
  }

  const handleRefresh = async () => {
    await refreshMutation.mutateAsync(subscription.id)
  }

  const handleFolderChange = async (folderId: string | null) => {
    await updateMutation.mutateAsync({
      subscriptionId: subscription.id,
      data: { folder_id: folderId },
    })
  }

  const handleSaveEdit = async () => {
    setIsSaving(true)
    try {
      const updateData: { custom_title: string | null; feed_url?: string; rsshub_path?: string } = {
        custom_title: editTitle || null,
      }
      if (editUrl && editUrl !== subscription.feed.url) {
        updateData.feed_url = editUrl
      }
      if (rsshubPath.trim()) {
        updateData.rsshub_path = rsshubPath.trim()
      }
      await updateMutation.mutateAsync({
        subscriptionId: subscription.id,
        data: updateData,
      })
      setShowEditDialog(false)
    } finally {
      setIsSaving(false)
    }
  }

  const flattenFolders = (
    nodes: FolderTreeNode[],
    depth = 0
  ): { id: string; name: string; depth: number }[] => {
    return nodes.flatMap((node) => [
      { id: node.id, name: node.name, depth },
      ...flattenFolders(node.children, depth + 1),
    ])
  }
  const flatFolders = flattenFolders(allFolders)

  const getFeedItemClasses = () => {
    if (isDragging) {
      return 'opacity-50 border-2 border-dashed border-primary/50 bg-primary/5'
    }
    if (isActive) {
      return isCompact
        ? 'bg-primary/15 text-primary font-semibold shadow-sm ring-1 ring-primary/25 border-l-2 border-primary'
        : 'bg-primary/10 text-primary scale-[1.01] font-medium shadow-sm'
    }
    return 'text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-[1.01]'
  }

  const handleClick = () => {
    onClick()
  }

  return (
    <>
      <div
        className={cn(
          'group flex w-full items-center rounded-lg text-sm transition-all duration-200',
          isCompact ? 'gap-2 px-2 py-1.5 text-[13px]' : 'gap-3 px-3 py-2',
          !isSelectionMode && 'cursor-grab active:cursor-grabbing',
          getFeedItemClasses()
        )}
        draggable={!isSelectionMode}
        onDragStart={(e) => {
          if (isSelectionMode) return
          e.dataTransfer.effectAllowed = 'move'
          onDragStart?.()
        }}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
        onMouseEnter={onHover}
        onTouchStart={onHover}
      >
        {isSelectionMode && (
          <Checkbox
            checked={isSelected}
            aria-label={t('actions.selectFeeds')}
            onCheckedChange={() => onToggleSelect?.(subscription.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            'touch-target-none flex h-5 min-w-0 flex-1 items-center',
            isCompact ? 'gap-2' : 'gap-3'
          )}
        >
          {subscription.feed.icon_url ? (
            <img
              src={iconProxyUrl(subscription.feed.icon_url) ?? undefined}
              alt=""
              className="h-4 w-4 shrink-0 rounded object-cover"
              draggable={false}
            />
          ) : (
            <div className="bg-muted h-4 w-4 shrink-0 rounded" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {subscription.custom_title || subscription.feed.title || subscription.feed.url}
          </span>
        </button>
        {subscription.unread_count > 0 && (
          <Badge size="sm" className="bg-muted text-muted-foreground shrink-0 text-[10px]">
            {subscription.unread_count}
          </Badge>
        )}

        {!isSelectionMode && (
          <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <MenuTrigger className="touch-target-none text-muted-foreground hover:bg-accent hover:text-foreground h-5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <MoreIcon className="h-3.5 w-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                onClick={() => markAllReadMutation.mutate({ feedId: subscription.feed_id })}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck
                  className={cn('h-4 w-4', markAllReadMutation.isPending && 'animate-pulse')}
                />
                <span>
                  {markAllReadMutation.isPending ? t('common.marking') : t('actions.markAllAsRead')}
                </span>
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-4 w-4" />
                <span>{t('common.edit')}</span>
              </MenuItem>
              <MenuItem onClick={handleRefresh} disabled={refreshMutation.isPending}>
                <RefreshCw
                  className={cn('h-4 w-4', refreshMutation.isPending && 'animate-spin')}
                />
                <span>{t('common.refresh')}</span>
              </MenuItem>
              {allFolders.length > 0 && (
                <MenuSub>
                  <MenuSubTrigger>
                    <FolderInput className="h-4 w-4" />
                    <span>{t('common.moveToFolder')}</span>
                  </MenuSubTrigger>
                  <MenuSubPopup>
                    <MenuItem onClick={() => handleFolderChange(null)}>
                      <span className="text-muted-foreground">{t('common.noFolder')}</span>
                    </MenuItem>
                    <MenuSeparator />
                    {flatFolders.map((folder) => (
                      <MenuItem key={folder.id} onClick={() => handleFolderChange(folder.id)}>
                        <span style={{ paddingLeft: `${folder.depth * 12}px` }}>{folder.name}</span>
                      </MenuItem>
                    ))}
                  </MenuSubPopup>
                </MenuSub>
              )}
              <MenuSeparator />
              <MenuItem
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('actions.unsubscribe')}</span>
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
      </div>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.editFeed.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.editFeed.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('manageSubscriptions.customTitle')}</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={subscription.feed.title || subscription.feed.url}
              />
              <p className="text-muted-foreground text-xs">{t('manageSubscriptions.leaveEmpty')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">{t('manageSubscriptions.feedUrl')}</Label>
              <Input
                id="edit-url"
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit()
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t('manageSubscriptions.rssUrlDescription')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rsshub-path">RSSHub Path (Optional)</Label>
              <Input
                id="edit-rsshub-path"
                value={rsshubPath}
                onChange={(e) => setRsshubPath(e.target.value)}
                placeholder="/bilibili/user/dynamic/946974"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}
