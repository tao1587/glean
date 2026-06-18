import { useState } from 'react'
import { ChevronRight, Plus, FolderInput, FolderPlus, MoreHorizontal } from 'lucide-react'
import type { FolderTreeNode, Subscription } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { useFolders } from '../../../../../hooks/useFolders'
import { iconProxyUrl } from '../../../../../lib/icon'
import {
  useAllSubscriptions,
  useUpdateSubscription,
} from '../../../../../hooks/useSubscriptions'
import { useFolderStore } from '../../../../../stores/folderStore'
import {
  buildSiblingFolderOrders,
  getFolderDropPlacement,
  type FolderDropPlacement,
} from '../../../../../components/sidebar/SidebarFeedsSection.dnd'
import { getFeedColor } from './digestHelpers'

interface FeedsPanelProps {
  onAddFeed: () => void
  onSelectFeed?: (feedId: string) => void
  onSelectFolder?: (folderId: string) => void
  selectedFeedId?: string | null
  selectedFolderId?: string | null
}

interface DragState {
  draggedFeed: Subscription | null
  draggedFolderId: string | null
  dragOverFolderId: string | null
  folderDropIndicator: { folderId: string; placement: FolderDropPlacement } | null
}

const INITIAL_DRAG: DragState = {
  draggedFeed: null,
  draggedFolderId: null,
  dragOverFolderId: null,
  folderDropIndicator: null,
}

/** Sort siblings by position ascending — folders API does not guarantee order. */
function sortByPosition(nodes: FolderTreeNode[]): FolderTreeNode[] {
  return [...nodes].sort((a, b) => a.position - b.position)
}

function FolderItem({
  folder,
  siblings,
  subscriptions,
  onSelectFeed,
  onSelectFolder,
  selectedFeedId,
  selectedFolderId,
  initialCollapsed = false,
  dragState,
  setDragState,
}: {
  folder: FolderTreeNode
  siblings: FolderTreeNode[]
  subscriptions: Subscription[]
  onSelectFeed?: (feedId: string) => void
  onSelectFolder?: (folderId: string) => void
  selectedFeedId?: string | null
  selectedFolderId?: string | null
  initialCollapsed?: boolean
  dragState: DragState
  setDragState: React.Dispatch<React.SetStateAction<DragState>>
}) {
  const { t } = useTranslation('digest')
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [menuOpen, setMenuOpen] = useState(false)
  const { updateFolder, deleteFolder, reorderFolders } = useFolderStore()
  const updateMutation = useUpdateSubscription()

  const folderSubs = subscriptions.filter((s) => s.folder_id === folder.id)
  const totalUnread = folderSubs.reduce((sum, s) => sum + (s.unread_count || 0), 0)

  const canReceiveFeedDrop =
    dragState.draggedFeed !== null && dragState.draggedFeed.folder_id !== folder.id
  const canReceiveFolderDrop =
    dragState.draggedFolderId !== null &&
    dragState.draggedFolderId !== folder.id &&
    siblings.some((s) => s.id === dragState.draggedFolderId)

  const isFeedDropTarget =
    dragState.dragOverFolderId === folder.id && canReceiveFeedDrop
  const isFolderDropTarget =
    dragState.folderDropIndicator?.folderId === folder.id && canReceiveFolderDrop
  const isDropBefore =
    isFolderDropTarget && dragState.folderDropIndicator?.placement === 'before'
  const isDropAfter =
    isFolderDropTarget && dragState.folderDropIndicator?.placement === 'after'

  const handleDragOver = (e: React.DragEvent) => {
    if (dragState.draggedFolderId) {
      if (!canReceiveFolderDrop) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragState((prev) => ({
        ...prev,
        dragOverFolderId: null,
        folderDropIndicator: {
          folderId: folder.id,
          placement: getFolderDropPlacement(
            e.currentTarget.getBoundingClientRect(),
            e.clientY
          ),
        },
      }))
      return
    }
    if (dragState.draggedFeed) {
      e.preventDefault()
      e.dataTransfer.dropEffect = canReceiveFeedDrop ? 'move' : 'none'
      setDragState((prev) => ({
        ...prev,
        folderDropIndicator: null,
        dragOverFolderId: folder.id,
      }))
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const next = e.relatedTarget
    if (next instanceof Node && e.currentTarget.contains(next)) return
    setDragState((prev) => ({
      ...prev,
      dragOverFolderId: prev.dragOverFolderId === folder.id ? null : prev.dragOverFolderId,
      folderDropIndicator:
        prev.folderDropIndicator?.folderId === folder.id ? null : prev.folderDropIndicator,
    }))
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const { draggedFolderId, draggedFeed, folderDropIndicator } = dragState
    if (draggedFolderId && canReceiveFolderDrop) {
      const placement =
        folderDropIndicator?.folderId === folder.id
          ? folderDropIndicator.placement
          : getFolderDropPlacement(e.currentTarget.getBoundingClientRect(), e.clientY)
      const orders = buildSiblingFolderOrders(siblings, draggedFolderId, folder.id, placement)
      if (orders.length > 0) {
        await reorderFolders(orders)
      }
    } else if (draggedFeed && draggedFeed.folder_id !== folder.id) {
      await updateMutation.mutateAsync({
        subscriptionId: draggedFeed.id,
        data: { folder_id: folder.id },
      })
    }
    setDragState(INITIAL_DRAG)
  }

  const handleRename = async () => {
    setMenuOpen(false)
    const next = window.prompt(t('feeds.renamePrompt'), folder.name)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === folder.name) return
    await updateFolder(folder.id, trimmed)
  }

  const handleDelete = async () => {
    setMenuOpen(false)
    if (!window.confirm(t('feeds.deleteConfirm', { name: folder.name }))) return
    await deleteFolder(folder.id)
  }

  const children = sortByPosition(folder.children)
  const isSelected = selectedFolderId === folder.id

  return (
    <div className="mb-0.5">
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          setDragState({
            ...INITIAL_DRAG,
            draggedFolderId: folder.id,
          })
        }}
        onDragEnd={() => setDragState(INITIAL_DRAG)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="group relative flex cursor-grab items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs font-semibold transition-colors active:cursor-grabbing"
        style={{
          color: 'var(--digest-text-secondary, #5E5A52)',
          background: isFeedDropTarget
            ? 'var(--digest-accent-soft, #F5E6E5)'
            : isSelected
              ? 'var(--digest-accent-soft, #F5E6E5)'
              : undefined,
          boxShadow: isDropBefore
            ? 'inset 0 2px 0 var(--digest-accent, #B8312F)'
            : isDropAfter
              ? 'inset 0 -2px 0 var(--digest-accent, #B8312F)'
              : isSelected
                ? 'inset 2px 0 0 var(--digest-accent, #B8312F)'
                : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isFeedDropTarget && !isSelected) {
            e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isFeedDropTarget && !isSelected) {
            e.currentTarget.style.background = ''
          }
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setCollapsed((v) => !v)
          }}
          aria-label={collapsed ? 'Expand folder' : 'Collapse folder'}
          className="flex items-center justify-center"
        >
          <ChevronRight
            className="h-3 w-3 flex-shrink-0 transition-transform"
            style={{ transform: collapsed ? undefined : 'rotate(90deg)' }}
          />
        </button>
        <button
          type="button"
          onClick={() => onSelectFolder?.(folder.id)}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          <span className="flex-1 truncate">{folder.name}</span>
          {totalUnread > 0 && (
            <span
              className="text-[10px]"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
            >
              {totalUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          aria-label={t('feeds.folderMenu')}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="absolute right-2 top-7 z-[61] w-32 rounded-md border py-1 shadow-md"
              style={{
                background: 'var(--digest-bg-card, #FFFFFF)',
                borderColor: 'var(--digest-divider, #E5E0D2)',
              }}
            >
              <button
                onClick={() => void handleRename()}
                className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--digest-bg-hover,#F1EDE2)]"
                style={{ color: 'var(--digest-text, #1A1A1A)' }}
              >
                {t('feeds.rename')}
              </button>
              <button
                onClick={() => void handleDelete()}
                className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--digest-bg-hover,#F1EDE2)]"
                style={{ color: 'var(--digest-accent, #B8312F)' }}
              >
                {t('feeds.delete')}
              </button>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <div>
          {folderSubs.map((sub) => (
            <SourceItem
              key={sub.id}
              subscription={sub}
              onSelect={onSelectFeed}
              isSelected={selectedFeedId === sub.feed_id}
              dragState={dragState}
              setDragState={setDragState}
            />
          ))}
          {children.map((child) => (
            <div key={child.id} className="ml-3">
              <FolderItem
                folder={child}
                siblings={children}
                subscriptions={subscriptions}
                onSelectFeed={onSelectFeed}
                onSelectFolder={onSelectFolder}
                selectedFeedId={selectedFeedId}
                selectedFolderId={selectedFolderId}
                initialCollapsed={true}
                dragState={dragState}
                setDragState={setDragState}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SourceItem({
  subscription,
  onSelect,
  isSelected = false,
  dragState,
  setDragState,
}: {
  subscription: Subscription
  onSelect?: (feedId: string) => void
  isSelected?: boolean
  dragState: DragState
  setDragState: React.Dispatch<React.SetStateAction<DragState>>
}) {
  const [iconFailed, setIconFailed] = useState(false)
  const feedColor = getFeedColor(subscription.feed_id)
  const name = subscription.custom_title || subscription.feed.title || subscription.feed.url
  const iconUrl = subscription.feed.icon_url
  const isDragging = dragState.draggedFeed?.id === subscription.id
  const showIcon = iconUrl && !iconFailed

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        setDragState({ ...INITIAL_DRAG, draggedFeed: subscription })
      }}
      onDragEnd={() => setDragState(INITIAL_DRAG)}
      onClick={() => onSelect?.(subscription.feed_id)}
      className="flex w-full cursor-grab items-center gap-2 rounded-[5px] py-1.5 pl-6 pr-2.5 text-[12.5px] transition-colors active:cursor-grabbing"
      style={{
        color: 'var(--digest-text, #1A1A1A)',
        opacity: isDragging ? 0.5 : 1,
        background: isSelected ? 'var(--digest-accent-soft, #F5E6E5)' : undefined,
        boxShadow: isSelected ? 'inset 2px 0 0 var(--digest-accent, #B8312F)' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = ''
      }}
    >
      {showIcon ? (
        <img
          src={iconProxyUrl(iconUrl) ?? undefined}
          alt=""
          className="h-3.5 w-3.5 flex-shrink-0 rounded-[2px] object-cover"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-[2px]"
          style={{ background: feedColor }}
        />
      )}
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
        {name}
      </span>
      {subscription.unread_count > 0 && (
        <span
          className="ml-auto text-[10px]"
          style={{
            color: 'var(--digest-text-tertiary, #9A968C)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {subscription.unread_count}
        </span>
      )}
    </button>
  )
}

/** Drop zone shown only while a foldered feed is being dragged — drops it out of its folder. */
function UncategorizedDropZone({
  dragState,
  setDragState,
}: {
  dragState: DragState
  setDragState: React.Dispatch<React.SetStateAction<DragState>>
}) {
  const { t } = useTranslation('digest')
  const updateMutation = useUpdateSubscription()
  const { draggedFeed } = dragState

  if (!draggedFeed || draggedFeed.folder_id === null) return null

  const isActive = dragState.dragOverFolderId === '__uncategorized__'

  return (
    <section
      className="mb-1 flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-[11px] transition-colors"
      style={{
        borderColor: isActive
          ? 'var(--digest-accent, #B8312F)'
          : 'var(--digest-divider, #E5E0D2)',
        background: isActive ? 'var(--digest-accent-soft, #F5E6E5)' : undefined,
        color: isActive
          ? 'var(--digest-accent, #B8312F)'
          : 'var(--digest-text-tertiary, #9A968C)',
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragState((prev) => ({ ...prev, dragOverFolderId: '__uncategorized__' }))
      }}
      onDragLeave={() =>
        setDragState((prev) => ({
          ...prev,
          dragOverFolderId:
            prev.dragOverFolderId === '__uncategorized__' ? null : prev.dragOverFolderId,
        }))
      }
      onDrop={async (e) => {
        e.preventDefault()
        if (dragState.draggedFeed) {
          await updateMutation.mutateAsync({
            subscriptionId: dragState.draggedFeed.id,
            data: { folder_id: null },
          })
        }
        setDragState(INITIAL_DRAG)
      }}
    >
      <FolderInput className="h-3.5 w-3.5" />
      {t('feeds.removeFromFolder')}
    </section>
  )
}

export function FeedsPanel({
  onAddFeed,
  onSelectFeed,
  onSelectFolder,
  selectedFeedId,
  selectedFolderId,
}: FeedsPanelProps) {
  const { t } = useTranslation('digest')
  const { folders } = useFolders('feed')
  const { data: subscriptions = [] } = useAllSubscriptions()
  const { createFolder } = useFolderStore()
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG)

  const topLevelFolders = sortByPosition(folders)
  const unfolderedSubs = subscriptions.filter((s) => !s.folder_id)

  const handleCreateFolder = async () => {
    const name = window.prompt(t('feeds.createFolderPrompt'))
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    await createFolder({ name: trimmed, type: 'feed' })
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Panel header */}
      <div
        className="flex shrink-0 items-start justify-between gap-2 border-b px-4 pb-3 pt-4"
        style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
      >
        <div className="min-w-0">
          <div
            className="text-[15px] font-semibold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text, #1A1A1A)',
            }}
          >
            {t('feeds.title')}
          </div>
          <div
            className="mt-0.5 text-[11px]"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            {t('feeds.subtitleCount', { count: subscriptions.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCreateFolder()}
          title={t('feeds.createFolder')}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = ''
          }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        <UncategorizedDropZone dragState={dragState} setDragState={setDragState} />

        {topLevelFolders.map((folder, index) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            siblings={topLevelFolders}
            subscriptions={subscriptions}
            onSelectFeed={onSelectFeed}
            onSelectFolder={onSelectFolder}
            selectedFeedId={selectedFeedId}
            selectedFolderId={selectedFolderId}
            initialCollapsed={index > 0}
            dragState={dragState}
            setDragState={setDragState}
          />
        ))}

        {unfolderedSubs.length > 0 && (
          <div className="mb-0.5 mt-1">
            {unfolderedSubs.map((sub) => (
              <SourceItem
                key={sub.id}
                subscription={sub}
                onSelect={onSelectFeed}
                isSelected={selectedFeedId === sub.feed_id}
                dragState={dragState}
                setDragState={setDragState}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Add feed button */}
      <div
        className="shrink-0 border-t p-3"
        style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
      >
        <button
          onClick={onAddFeed}
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors"
          style={{
            background: 'var(--digest-text, #1A1A1A)',
            color: 'var(--digest-bg, #FAF8F3)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('feeds.addFeed')}
        </button>
      </div>
    </div>
  )
}
