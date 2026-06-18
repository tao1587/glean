import { Link, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  ChevronLeft,
  Menu as MenuIcon,
  X,
  Languages,
  ChevronDown,
  Inbox,
  Clock,
  Circle,
  CalendarDays,
} from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import {
  buttonVariants,
  cn,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@glean/ui'
import type { Subscription, FolderTreeNode } from '@glean/types'
import { useAuthStore } from '../stores/authStore'
import { useBookmarkStore } from '../stores/bookmarkStore'
import { useFolderStore } from '../stores/folderStore'
import { useThemeStore } from '../stores/themeStore'
import { DIGEST_LIGHT_VARS, DIGEST_DARK_VARS } from '../styles/digestTokens'
import {
  useAllSubscriptions,
  useRefreshAllFeeds,
  useImportOPML,
  useExportOPML,
  clearSubscriptionCache,
} from '../hooks/useSubscriptions'
import { entryKeys, getInfiniteEntriesQueryOptions } from '../hooks/useEntries'
import { entryService } from '@glean/api-client'
import { SidebarFeedsSection } from './sidebar/SidebarFeedsSection'
import { SidebarBookmarksSection } from './sidebar/SidebarBookmarksSection'
import { SidebarUserSection } from './sidebar/SidebarUserSection'
import { MobileSidebarDrawer } from './sidebar/MobileSidebarDrawer'
import { AddFeedDialog } from './dialogs/AddFeedDialog'
import { CreateFolderDialog } from './dialogs/CreateFolderDialog'
import { LogoutConfirmDialog } from './dialogs/LogoutConfirmDialog'

/**
 * Main application layout.
 *
 * Provides navigation sidebar and header for authenticated pages.
 * Includes integrated feed list for unified navigation experience.
 */
// Constants for sidebar resize
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_DEFAULT_WIDTH = 256
const SIDEBAR_COLLAPSED_WIDTH = 72
const SIDEBAR_STORAGE_KEY = 'glean-sidebar-width'

export function Layout() {
  const { t } = useTranslation(['feeds', 'reader'])
  const { user, logout } = useAuthStore()
  const { resolvedTheme } = useThemeStore()
  const { reset: resetBookmarks } = useBookmarkStore()
  const { reset: resetFolders } = useFolderStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const readerViewParam = searchParams.get('view')
  const isDigestReaderView =
    location.pathname === '/reader' &&
    readerViewParam !== 'timeline' &&
    readerViewParam !== 'today-board'
  const isDigestSettings = location.pathname === '/settings'
  const isDigestTheme = isDigestReaderView || isDigestSettings
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobileListTranslationActive, setIsMobileListTranslationActive] = useState(false)
  const [isMobileListTranslationLoading, setIsMobileListTranslationLoading] = useState(false)
  const [mobileListTranslationLoadingPhase, setMobileListTranslationLoadingPhase] = useState<
    'idle' | 'start' | 'settled'
  >('idle')

  // Fetch all subscriptions for sidebar (with ETag-based caching)
  const { data: subscriptions = [] } = useAllSubscriptions()

  // Detect if running on macOS Electron
  const [isMacElectron, setIsMacElectron] = useState(false)

  useEffect(() => {
    const checkPlatform = async () => {
      const electron = window.electronAPI
      if (electron?.isElectron) {
        try {
          const platformInfo = await electron.getPlatform?.()
          if (platformInfo) {
            setIsMacElectron(platformInfo.platform === 'darwin')
          }
        } catch (error) {
          console.error('Failed to get platform info:', error)
        }
      }
    }
    checkPlatform()
  }, [])

  useEffect(() => {
    const handleReaderListTranslationState = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { active?: boolean; loading?: boolean; phase?: 'idle' | 'start' | 'settled' }
        | undefined
      setIsMobileListTranslationActive(Boolean(detail?.active))
      setIsMobileListTranslationLoading(Boolean(detail?.loading))
      setMobileListTranslationLoadingPhase(detail?.phase ?? 'idle')
    }

    window.addEventListener('readerMobileListActions:state', handleReaderListTranslationState)
    return () => {
      window.removeEventListener('readerMobileListActions:state', handleReaderListTranslationState)
    }
  }, [])

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? Number.parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  })
  const sidebarWidthRef = useRef(sidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // Folder state
  const { feedFolders, bookmarkFolders, fetchFolders, createFolder, updateFolder, deleteFolder } =
    useFolderStore()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedBookmarkFolders, setExpandedBookmarkFolders] = useState<Set<string>>(new Set())
  const [isFeedsSectionExpanded, setIsFeedsSectionExpanded] = useState(true)
  const [isBookmarkSectionExpanded, setIsBookmarkSectionExpanded] = useState(true)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const isCreatingFolderRef = useRef(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [createFolderType, setCreateFolderType] = useState<'feed' | 'bookmark'>('feed')

  // Add Feed dialog state
  const [showAddFeedDialog, setShowAddFeedDialog] = useState(false)

  // Drag and drop state
  const [draggedFeed, setDraggedFeed] = useState<Subscription | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // OPML Import/Export state
  const importMutation = useImportOPML()
  const exportMutation = useExportOPML()
  const refreshAllMutation = useRefreshAllFeeds()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    total: number
    folders_created: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const currentFeedId = searchParams.get('feed') || undefined
  const currentFolderId = searchParams.get('folder') || undefined
  const currentView = searchParams.get('view') || undefined
  const currentTab = searchParams.get('tab') || undefined
  const currentEntryId = searchParams.get('entry') || undefined
  const isReaderPage = location.pathname === '/reader'
  const isTodayBoardView = isReaderPage && currentView === 'today-board'
  const isMobileListMode = isReaderPage && !currentEntryId && !isTodayBoardView
  const currentFilter: 'all' | 'unread' | 'read-later' =
    currentTab === 'all' || currentTab === 'read-later'
      ? currentTab
      : 'unread'
  const currentFilterLabel =
    isTodayBoardView
      ? t('feeds:sidebar.todayBoard')
      : currentFilter === 'unread'
      ? '未读'
      : currentFilter === 'all'
        ? '全部'
        : '稍后'
  const filterIcon =
    isTodayBoardView ? (
      <CalendarDays className="h-3 w-3" />
    ) : currentFilter === 'unread' ? (
      <Circle className="h-2.5 w-2.5 fill-current" />
    ) : currentFilter === 'all' ? (
      <Inbox className="h-3 w-3" />
    ) : (
      <Clock className="h-3 w-3" />
    )
  const isBookmarksPage = location.pathname === '/bookmarks'
  const currentBookmarkFolderId = isBookmarksPage ? searchParams.get('folder') : undefined

  // Refresh sidebar data when authenticated user changes.
  // Do not depend on the full user object to avoid refetch storms when
  // user settings are updated frequently (e.g. reader scroll position sync).
  useEffect(() => {
    if (!user?.id) return

    clearSubscriptionCache()
    queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    fetchFolders('feed')
    fetchFolders('bookmark')
  }, [user?.id, queryClient, fetchFolders])

  // Handle sidebar resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
        sidebarWidthRef.current = newWidth
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarWidthRef.current.toString())
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleLogout = async () => {
    await logout()
    resetBookmarks()
    resetFolders()
    clearSubscriptionCache()
    queryClient.clear()
    navigate('/login')
  }

  const handleFeedSelect = (feedId?: string, folderId?: string) => {
    const nextParams = new URLSearchParams()
    if (currentView && currentView !== 'today-board') nextParams.set('view', currentView)
    if (currentTab) nextParams.set('tab', currentTab)

    if (folderId) {
      nextParams.set('folder', folderId)
      navigate(`/reader?${nextParams.toString()}`)
    } else if (feedId) {
      nextParams.set('feed', feedId)
      navigate(`/reader?${nextParams.toString()}`)
    } else {
      navigate(nextParams.toString() ? `/reader?${nextParams.toString()}` : '/reader')
    }
  }

  const handleTodayBoardViewSelect = () => {
    navigate('/reader?view=today-board')
  }

  const prefetchReaderData = async (feedId?: string, folderId?: string) => {
    const isReadLater = currentTab === 'read-later'
    const isUnreadLike = currentView !== 'today-board' && (currentTab === 'unread' || !currentTab)
    const filters = {
      feed_id: feedId,
      folder_id: folderId,
      is_read: isUnreadLike ? false : undefined,
      read_later: isReadLater ? true : undefined,
      view: 'timeline' as const,
    }

    const listOptions = getInfiniteEntriesQueryOptions(filters)
    await queryClient.prefetchInfiniteQuery(listOptions)

    const cached = queryClient.getQueryData<{
      pages?: Array<{ items?: Array<{ id: string }> }>
    }>(listOptions.queryKey)
    const firstEntryId = cached?.pages?.[0]?.items?.[0]?.id
    if (!firstEntryId) return

    await queryClient.prefetchQuery({
      queryKey: entryKeys.detail(firstEntryId),
      queryFn: () => entryService.getEntry(firstEntryId),
      staleTime: 2 * 60 * 1000,
    })
  }

  const toggleFolder = (folderId: string) => {
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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || isCreatingFolderRef.current) return

    isCreatingFolderRef.current = true
    setIsCreatingFolder(true)
    try {
      await createFolder({
        name: newFolderName.trim(),
        type: createFolderType,
        parent_id: createFolderParentId,
      })
      setNewFolderName('')
      setIsCreateFolderOpen(false)
      setCreateFolderParentId(null)
    } finally {
      isCreatingFolderRef.current = false
      setIsCreatingFolder(false)
    }
  }

  const openCreateFolderDialog = (
    parentId: string | null = null,
    type: 'feed' | 'bookmark' = 'feed'
  ) => {
    setCreateFolderParentId(parentId)
    setCreateFolderType(type)
    setIsCreateFolderOpen(true)
  }

  const handleBookmarkFolderSelect = (folderId?: string) => {
    if (folderId) {
      navigate(`/bookmarks?folder=${folderId}`)
    } else {
      navigate('/bookmarks')
    }
  }

  const toggleBookmarkFolder = (folderId: string) => {
    setExpandedBookmarkFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await importMutation.mutateAsync(file)
      setImportResult(result)
      setFileInputKey((prev) => prev + 1)
      fetchFolders('feed')
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  const handleExport = () => {
    exportMutation.mutate()
  }

  const sortUnreadFirst = (items: Subscription[]): Subscription[] => {
    const unread = items.filter((sub) => sub.unread_count > 0)
    const fullyRead = items.filter((sub) => sub.unread_count === 0)
    return [...unread, ...fullyRead]
  }

  const rawSubscriptionsByFolder = subscriptions.reduce<Record<string, Subscription[]>>(
    (acc, sub) => {
      const key = sub.folder_id || '__ungrouped__'
      if (!acc[key]) acc[key] = []
      acc[key].push(sub)
      return acc
    },
    {}
  )

  const subscriptionsByFolder = Object.fromEntries(
    Object.entries(rawSubscriptionsByFolder).map(([key, items]) => [key, sortUnreadFirst(items)])
  ) as Record<string, Subscription[]>

  const ungroupedSubscriptions = subscriptionsByFolder['__ungrouped__'] || []

  // Calculate mobile header title based on current route and params
  const mobileHeaderTitle = useMemo(() => {
    // Only apply to /reader route
    if (!location.pathname.includes('/reader')) {
      return 'Glean'
    }

    const feedId = searchParams.get('feed')
    const folderId = searchParams.get('folder')
    const readerView = searchParams.get('view')

    if (readerView === 'today-board') {
      return 'Glean'
    }

    // Priority: folder > feed > default
    if (folderId) {
      const findFolder = (folders: FolderTreeNode[], id: string): FolderTreeNode | null => {
        for (const folder of folders) {
          if (folder.id === id) return folder
          if (folder.children.length > 0) {
            const found = findFolder(folder.children, id)
            if (found) return found
          }
        }
        return null
      }
      const folder = findFolder(feedFolders, folderId)
      if (folder) return folder.name
    }

    if (feedId) {
      const subscription = subscriptions.find((sub) => sub.feed_id === feedId)
      if (subscription) {
        return subscription.custom_title || subscription.feed.title || 'Glean'
      }
    }

    return 'Glean'
  }, [location.pathname, searchParams, feedFolders, subscriptions])

  // Close mobile sidebar on navigation
  const searchParamsString = searchParams.toString()
  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [location.pathname, searchParamsString])

  // Listen for custom event to open mobile sidebar from ArticleReader
  useEffect(() => {
    const handleOpenSidebar = () => {
      setIsMobileSidebarOpen(true)
    }
    window.addEventListener('openMobileSidebar', handleOpenSidebar)
    return () => {
      window.removeEventListener('openMobileSidebar', handleOpenSidebar)
    }
  }, [])

  // Track if we're reading an article (hide Layout header when ArticleReader is shown)
  const [isReadingArticle, setIsReadingArticle] = useState(false)

  useEffect(() => {
    const handleShowArticle = () => setIsReadingArticle(true)
    const handleHideArticle = () => setIsReadingArticle(false)

    window.addEventListener('showArticleReader', handleShowArticle)
    window.addEventListener('hideArticleReader', handleHideArticle)

    return () => {
      window.removeEventListener('showArticleReader', handleShowArticle)
      window.removeEventListener('hideArticleReader', handleHideArticle)
    }
  }, [])

  useEffect(() => {
    // Fallback sync for gesture/back navigation:
    // if there's no selected entry in URL, the mobile list header must be visible.
    const hasEntryParam = new URLSearchParams(searchParamsString).has('entry')
    if (!isReaderPage || !hasEntryParam) {
      setIsReadingArticle(false)
    }
  }, [isReaderPage, searchParamsString])

  const renderSidebarContent = (isMobileDrawer: boolean) => {
    const isSidebarExpanded = isMobileDrawer ? true : isSidebarOpen

    return (
      <>
        {/* Logo */}
        <div
          className={`flex items-center justify-between p-2 md:p-4 ${
            isMacElectron ? 'md:pt-12' : ''
          }`}
          style={{ borderBottom: '1px solid var(--digest-divider)' }}
        >
          <Link to="/" className="flex items-center gap-2 overflow-hidden md:gap-3">
            {isSidebarExpanded ? (
              <span
                className="text-base font-bold md:text-xl"
                style={{
                  fontFamily: "'Noto Serif SC', Georgia, serif",
                  color: 'var(--digest-text)',
                  letterSpacing: '-0.02em',
                }}
              >
                <span style={{ color: 'var(--digest-accent)' }}>◆ </span>Glean
              </span>
            ) : (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center text-base font-bold md:h-9 md:w-9"
                style={{
                  fontFamily: "'Noto Serif SC', Georgia, serif",
                  color: 'var(--digest-accent)',
                }}
              >
                ◆
              </span>
            )}
          </Link>
          {isMobileDrawer && (
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--digest-text-secondary)' }}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Toggle button - desktop only */}
        {!isMobileDrawer && (
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-16 -right-3 z-10 hidden h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors md:flex"
            style={{
              background: 'var(--digest-bg-card)',
              borderColor: 'var(--digest-divider)',
              color: 'var(--digest-text-secondary)',
            }}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${isSidebarOpen ? '' : 'rotate-180'}`}
            />
          </button>
        )}

        {/* Resize handle - desktop only, when sidebar is expanded */}
        {!isMobileDrawer && isSidebarOpen && (
          <button
            type="button"
            aria-label="Resize sidebar"
            className="absolute top-0 -right-1 bottom-0 hidden w-2 cursor-col-resize border-none bg-transparent p-0 md:block"
            onMouseDown={handleResizeStart}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                setSidebarWidth((prev) => Math.max(SIDEBAR_MIN_WIDTH, prev - 10))
              } else if (e.key === 'ArrowRight') {
                setSidebarWidth((prev) => Math.min(SIDEBAR_MAX_WIDTH, prev + 10))
              }
            }}
          >
            <div
              className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors"
              style={{
                background: isResizing ? 'var(--digest-accent)' : 'transparent',
              }}
            />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-1.5 md:p-3" style={{ color: 'var(--digest-text)' }}>
          <SidebarFeedsSection
            isSidebarOpen={isSidebarExpanded}
            isMobileSidebarOpen={isMobileDrawer}
            isFeedsSectionExpanded={isFeedsSectionExpanded}
            onToggleFeedsSection={() => setIsFeedsSectionExpanded((prev) => !prev)}
            onAddFeed={() => setShowAddFeedDialog(true)}
            onCreateFolder={(parentId) => openCreateFolderDialog(parentId, 'feed')}
            onRefreshAll={() => refreshAllMutation.mutate()}
            refreshAllPending={refreshAllMutation.isPending}
            onImportOPML={handleImportClick}
            importPending={importMutation.isPending}
            onExportOPML={handleExport}
            exportPending={exportMutation.isPending}
            onFeedSelect={handleFeedSelect}
            onFeedHover={prefetchReaderData}
            onFolderHover={(folderId) => prefetchReaderData(undefined, folderId)}
            onTodayBoardViewSelect={handleTodayBoardViewSelect}
            isTodayBoardView={isTodayBoardView}
            isReaderPage={isReaderPage}
            currentFeedId={currentFeedId}
            currentFolderId={currentFolderId}
            feedFolders={feedFolders}
            subscriptionsByFolder={subscriptionsByFolder}
            ungroupedSubscriptions={ungroupedSubscriptions}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            draggedFeed={draggedFeed}
            setDraggedFeed={setDraggedFeed}
            dragOverFolderId={dragOverFolderId}
            setDragOverFolderId={setDragOverFolderId}
          />

          <div
            className={cn('my-1.5 border-t md:my-3', isMobileDrawer && 'my-2 border-dashed opacity-70')}
            style={{ borderColor: 'var(--digest-divider)' }}
          />

          <SidebarBookmarksSection
            isSidebarOpen={isSidebarExpanded}
            isMobileSidebarOpen={isMobileDrawer}
            isBookmarkSectionExpanded={isBookmarkSectionExpanded}
            onToggleBookmarkSection={() => setIsBookmarkSectionExpanded((prev) => !prev)}
            onCreateFolder={(parentId) => openCreateFolderDialog(parentId, 'bookmark')}
            onSelectFolder={handleBookmarkFolderSelect}
            isBookmarksPage={isBookmarksPage}
            currentBookmarkFolderId={currentBookmarkFolderId || undefined}
            bookmarkFolders={bookmarkFolders}
            expandedBookmarkFolders={expandedBookmarkFolders}
            toggleBookmarkFolder={toggleBookmarkFolder}
            onRenameFolder={updateFolder}
            onDeleteFolder={deleteFolder}
          />
        </nav>

        <SidebarUserSection
          user={user}
          isSidebarOpen={isSidebarExpanded}
          isMobileSidebarOpen={isMobileDrawer}
          isSettingsActive={location.pathname === '/settings'}
          onLogoutClick={() => setShowLogoutConfirm(true)}
        />
      </>
    )
  }

  const digestVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  if (isDigestTheme) {
    return (
      <div
        className={cn(
          'w-screen',
          isDigestSettings ? 'flex h-screen flex-col overflow-hidden' : 'min-h-screen'
        )}
        style={{
          ...digestVars,
          background: 'var(--digest-bg)',
          color: 'var(--digest-text)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
        }}
      >
        {isDigestSettings && (
          <div
            className="flex h-12 shrink-0 items-center justify-between px-4 md:px-6"
            style={{
              background: 'var(--digest-bg)',
              borderBottom: '1px solid var(--digest-divider)',
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/reader')}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
              style={{ color: 'var(--digest-text-secondary)' }}
              aria-label="Back to digest"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>返回</span>
            </button>
            <span
              className="text-base font-bold"
              style={{
                fontFamily: "'Noto Serif SC', Georgia, serif",
                color: 'var(--digest-text)',
                letterSpacing: '-0.02em',
              }}
            >
              <span style={{ color: 'var(--digest-accent)' }}>◆ </span>Glean
            </span>
          </div>
        )}
        {isDigestSettings ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    )
  }

  return (
    <div
      className="flex h-screen flex-col md:flex-row"
      style={{
        ...digestVars,
        background: 'var(--digest-bg)',
        color: 'var(--digest-text)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
      }}
    >
      {/* Mobile Header - animate visibility when entering/leaving article reader */}
      <header
        className={`flex shrink-0 items-center justify-between px-4 transition-all duration-300 ease-out md:hidden ${
          isReadingArticle
            ? 'pointer-events-none h-0 min-h-0 translate-y-[-100%] opacity-0'
            : 'h-14 min-h-14 translate-y-0 opacity-100'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--digest-bg) 88%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--digest-divider)',
        }}
      >
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--digest-text-secondary)' }}
          aria-label="Open sidebar"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-lg font-bold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text)',
              letterSpacing: '-0.02em',
            }}
          >
            ◆ {mobileHeaderTitle}
          </span>
        </Link>
        {isMobileListMode ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('readerMobileListActions:toggleTranslation'))
              }
              className={cn(
                'list-translation-toggle hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                isMobileListTranslationActive ? 'text-primary' : 'text-muted-foreground',
                isMobileListTranslationLoading && 'list-translation-toggle-loading',
                mobileListTranslationLoadingPhase === 'start' &&
                  'list-translation-toggle-loading-start',
                mobileListTranslationLoadingPhase === 'settled' &&
                  'list-translation-toggle-loading-settled'
              )}
              aria-label={
                isMobileListTranslationLoading
                  ? t('reader:translation.translating')
                  : isMobileListTranslationActive
                    ? t('reader:translation.hideTranslation')
                    : t('reader:translation.translate')
              }
              title={
                isMobileListTranslationLoading
                  ? t('reader:translation.translating')
                  : isMobileListTranslationActive
                    ? t('reader:translation.hideTranslation')
                    : t('reader:translation.translate')
              }
            >
              <span className="list-translation-toggle__icon-wrap">
                <span className="list-translation-toggle__ring" aria-hidden="true" />
                <Languages className="list-translation-toggle__icon h-4 w-4" />
              </span>
            </button>
            {isTodayBoardView ? (
              <div className="text-primary flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium">
                <span className="opacity-90">{filterIcon}</span>
                <span>{currentFilterLabel}</span>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="text-primary hover:bg-accent flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors"
                  aria-label="Select filter"
                >
                  <span className="opacity-90">{filterIcon}</span>
                  <span>{currentFilterLabel}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="[&_[data-slot='menu-item']]:!gap-1.5 [&_[data-slot='menu-item']]:!py-1 [&_[data-slot='menu-item']]:!text-sm"
                >
                  <DropdownMenuItem
                    className={currentFilter === 'unread' ? 'bg-accent' : ''}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('readerMobileListActions:setFilter', {
                          detail: { filter: 'unread' },
                        })
                      )
                    }
                  >
                    <span className="mr-2 inline-flex items-center">
                      <Circle className="h-2.5 w-2.5 fill-current" />
                    </span>
                    未读
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={currentFilter === 'all' ? 'bg-accent' : ''}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('readerMobileListActions:setFilter', {
                          detail: { filter: 'all' },
                        })
                      )
                    }
                  >
                    <span className="mr-2 inline-flex items-center">
                      <Inbox className="h-3.5 w-3.5" />
                    </span>
                    全部
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={currentFilter === 'read-later' ? 'bg-accent' : ''}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('readerMobileListActions:setFilter', {
                          detail: { filter: 'read-later' },
                        })
                      )
                    }
                  >
                    <span className="mr-2 inline-flex items-center">
                      <Clock className="h-3.5 w-3.5" />
                    </span>
                    稍后
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <MobileSidebarDrawer
        open={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      >
        {renderSidebarContent(true)}
      </MobileSidebarDrawer>

      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        className={`relative z-10 hidden flex-col border-r md:flex ${isResizing ? 'sidebar-no-transition' : 'sidebar-transition'}`}
        style={{
          width: isSidebarOpen ? `${sidebarWidth}px` : `${SIDEBAR_COLLAPSED_WIDTH}px`,
          background: 'var(--digest-bg-sidebar)',
          borderColor: 'var(--digest-divider)',
        }}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Main content */}
      <main
        className="min-h-0 min-w-0 flex-1 overflow-auto"
        style={{ background: 'var(--digest-bg)' }}
      >
        <div key={location.pathname} className="page-transition h-full w-full">
          <Outlet />
        </div>
      </main>

      <CreateFolderDialog
        open={isCreateFolderOpen}
        parentId={createFolderParentId}
        type={createFolderType}
        name={newFolderName}
        isSubmitting={isCreatingFolder}
        onNameChange={setNewFolderName}
        onSubmit={handleCreateFolder}
        onOpenChange={(open) => {
          setIsCreateFolderOpen(open)
          if (!open) {
            setCreateFolderParentId(null)
          }
        }}
      />

      {showAddFeedDialog && <AddFeedDialog onClose={() => setShowAddFeedDialog(false)} />}

      {/* Hidden file input for OPML import */}
      <input
        ref={fileInputRef}
        key={fileInputKey}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Import result dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('opml.importCompleted')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('opml.feedsImported')}: {importResult?.success} · {t('opml.foldersCreated')}:{' '}
              {importResult?.folders_created} · {t('opml.failed')}: {importResult?.failed} ·{' '}
              {t('opml.total')}: {importResult?.total}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants()}>{t('common.ok')}</AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Import error dialog */}
      <AlertDialog open={!!importError} onOpenChange={() => setImportError(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('opml.importFailed')}</AlertDialogTitle>
            <AlertDialogDescription>{importError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants()}>{t('common.ok')}</AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        onConfirm={handleLogout}
      />
    </div>
  )
}
