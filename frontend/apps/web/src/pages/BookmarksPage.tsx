import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useBookmarkStore } from '../stores/bookmarkStore'
import { useFolderStore } from '../stores/folderStore'
import { useEntry } from '../hooks/useEntries'
import { useTranslation } from '@glean/i18n'
import { ArticleReader, ArticleReaderSkeleton } from '../components/ArticleReader'
import { SourceGroupBoard } from '../components/bookmarks/SourceGroupBoard'
import { BookmarkSearchResults } from '../components/bookmarks/BookmarkSearchResults'
import { groupBookmarksBySource } from '../components/bookmarks/bookmarkGrouping'
import type { Bookmark, FolderTreeNode, EntryWithState } from '@glean/types'
import {
  Bookmark as BookmarkIcon,
  FolderOpen,
  Plus,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Loader2,
  X,
  FileText,
  BookOpen,
} from 'lucide-react'
import {
  Button,
  Input,
  Skeleton,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  buttonVariants,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
} from '@glean/ui'

/**
 * Convert a Bookmark to EntryWithState format for use with ArticleReader component.
 * This allows bookmarks to be displayed using the same reader as feed entries.
 */
function convertBookmarkToEntry(bookmark: Bookmark): EntryWithState {
  return {
    // Required Entry fields
    id: bookmark.id,
    feed_id: '', // Bookmarks don't have feed_id
    guid: bookmark.id,
    url: bookmark.url || '',
    title: bookmark.title,
    author: null,
    content: bookmark.content,
    summary: bookmark.excerpt,
    published_at: bookmark.created_at,
    created_at: bookmark.created_at,

    // User state fields
    is_read: true, // Bookmarks are considered read
    read_later: false,
    read_later_until: null,
    read_at: bookmark.created_at,
    is_bookmarked: true, // Already a bookmark
    bookmark_id: bookmark.id,

    // Feed info (not applicable for bookmarks)
    feed_title: null,
    feed_icon_url: null,
  }
}

/**
 * Bookmarks page.
 *
 * Displays bookmarked content with folder filtering.
 */
export default function BookmarksPage() {
  const { t } = useTranslation('bookmarks')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    bookmarks,
    total,
    page,
    pages,
    loading,
    fetchBookmarks,
    deleteBookmark,
    filters,
  } = useBookmarkStore()

  const { bookmarkFolders } = useFolderStore()

  // Get filters from URL params
  const selectedFolder = searchParams.get('folder') || null
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [showCreateBookmark, setShowCreateBookmark] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)

  // Reader panel state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null)
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId || '')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const hasActiveFilters = Boolean(selectedFolder || searchQuery)
  const displayMode: 'source' | 'results' = hasActiveFilters ? 'results' : 'source'

  const sourceGroups = useMemo(() => groupBookmarksBySource(bookmarks), [bookmarks])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Handle filter changes from URL
  useEffect(() => {
    const params: Parameters<typeof fetchBookmarks>[0] = {
      page: 1,
      folder_id: selectedFolder ?? undefined,
      search: debouncedSearchQuery || undefined,
    }

    fetchBookmarks(params)
  }, [selectedFolder, debouncedSearchQuery, fetchBookmarks])

  // Clear filter helper
  const clearFilter = (type: 'folder' | 'search') => {
    if (type === 'folder') {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('folder')
      navigate(`/bookmarks${newParams.toString() ? `?${newParams.toString()}` : ''}`)
    } else {
      setSearchQuery('')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await deleteBookmark(deleteConfirmId)
      setDeleteConfirmId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    fetchBookmarks({ ...filters, page: newPage })
  }

  // Handle bookmark click - open reader panel for feed entries or URL bookmarks with content
  const handleBookmarkClick = (bookmark: Bookmark) => {
    if (bookmark.entry_id) {
      // Open reader panel for feed-saved bookmarks
      setSelectedEntryId(bookmark.entry_id)
      setSelectedBookmark(null)
    } else if (bookmark.content) {
      // Open reader panel for URL bookmarks with extracted content
      setSelectedBookmark(bookmark)
      setSelectedEntryId(null)
    } else if (bookmark.url) {
      // Open external URL for bookmarks without content
      window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    }
  }

  // Show list OR reader (not both) - single-panel navigation
  const hasActiveReader = !!selectedEntryId || !!selectedBookmark

  return (
    <div className="flex h-full">
      {/* Bookmark List - Hidden when reader is active */}
      {!hasActiveReader && (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="border-border bg-card border-b px-4 py-3 sm:px-6 sm:py-4">
            {/* Title row */}
            <div className="mb-3 flex items-center justify-between gap-3 md:mb-0">
              <h1 className="font-display text-foreground shrink-0 text-xl font-bold">
                {t('title')}
              </h1>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                {displayMode === 'source' ? t('displayMode.source') : t('displayMode.results')}
              </span>
            </div>

            {/* Search and actions row */}
            <div className="flex items-center gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative min-w-0 flex-1 md:max-w-64">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder={t('placeholders.searchBookmarks')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full [&_input]:pl-9"
                />
              </div>
              <Button
                onClick={() => setShowCreateBookmark(true)}
                className="h-10 shrink-0 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('actions.addBookmark')}</span>
              </Button>
            </div>

            {/* Active filters */}
            {(selectedFolder || searchQuery) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">{t('filters.label')}</span>
                {selectedFolder && (
                  <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2 text-xs">
                    <FolderOpen className="h-3 w-3" />
                    <span className="max-w-24 truncate">
                      {findFolderName(bookmarkFolders, selectedFolder)}
                    </span>
                    <button
                      onClick={() => clearFilter('folder')}
                      className="touch-target-none hover:bg-accent hover:text-foreground rounded p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {searchQuery && (
                  <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2 text-xs">
                    <Search className="h-3 w-3" />
                    <span className="max-w-24 truncate">&quot;{searchQuery}&quot;</span>
                    <button
                      onClick={() => clearFilter('search')}
                      className="touch-target-none hover:bg-accent hover:text-foreground rounded p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </header>

          {/* Bookmarks Grid/List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div
              key={`${selectedFolder || 'all'}-${displayMode}`}
              className="feed-content-transition"
            >
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <BookmarkListItemSkeleton key={i} />
                  ))}
                </div>
              ) : bookmarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                    <BookmarkIcon className="text-muted-foreground h-8 w-8" />
                  </div>
                  <p className="text-muted-foreground">{t('empty.noBookmarks')}</p>
                  <p className="text-muted-foreground/60 mt-1 text-xs">
                    {t('empty.noBookmarksDescription')}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowCreateBookmark(true)}
                  >
                    <Plus className="h-4 w-4" />
                    {t('empty.addFirstBookmark')}
                  </Button>
                </div>
              ) : displayMode === 'source' ? (
                <SourceGroupBoard
                  groups={sourceGroups}
                  onOpen={handleBookmarkClick}
                  onEdit={(bookmark) => setEditingBookmark(bookmark)}
                  onDelete={(bookmark) => setDeleteConfirmId(bookmark.id)}
                />
              ) : (
                <BookmarkSearchResults
                  bookmarks={bookmarks}
                  onOpen={handleBookmarkClick}
                  onEdit={(bookmark) => setEditingBookmark(bookmark)}
                  onDelete={(bookmark) => setDeleteConfirmId(bookmark.id)}
                />
              )}
            </div>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="border-border bg-card flex items-center justify-between border-t px-4 py-3 sm:px-6 sm:py-4">
              <span className="text-muted-foreground hidden text-sm sm:block">
                {t('pagination.showing', { count: bookmarks.length, total })}
              </span>
              <span className="text-muted-foreground text-sm sm:hidden">
                {page} / {pages}
              </span>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('pagination.previous')}</span>
                </Button>
                <span className="text-muted-foreground hidden text-sm sm:block">
                  {page} / {pages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === pages}
                  className="gap-1"
                >
                  <span className="hidden sm:inline">{t('pagination.next')}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Bookmark Dialog */}
      <CreateBookmarkDialog open={showCreateBookmark} onOpenChange={setShowCreateBookmark} />

      {/* Edit Bookmark Dialog */}
      <EditBookmarkDialog
        bookmark={editingBookmark}
        onClose={() => setEditingBookmark(null)}
        folders={bookmarkFolders}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.removeBookmark')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('delete.confirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('common.cancel')}
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: 'destructive' })}
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('delete.deleting')}
                </>
              ) : (
                t('delete.delete')
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Reader Panel - Entry from feed */}
      {selectedEntryId && (
        <div key={selectedEntryId} className="reader-transition flex min-w-0 flex-1 flex-col">
          {isLoadingEntry ? (
            <ArticleReaderSkeleton />
          ) : selectedEntry ? (
            <ArticleReader
              entry={selectedEntry}
              onClose={() => {
                setSelectedEntryId(null)
                setIsFullscreen(false)
              }}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              showCloseButton
              hideReadStatus
            />
          ) : (
            <div className="bg-background flex flex-1 flex-col items-center justify-center">
              <div className="text-center">
                <div className="bg-muted mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl">
                  <BookOpen className="text-muted-foreground h-10 w-10" />
                </div>
                <h3 className="font-display text-foreground text-lg font-semibold">
                  {t('emptyState.articleNotFound')}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('emptyState.articleNotFoundDescription')}
                </p>
                <Button variant="ghost" className="mt-4" onClick={() => setSelectedEntryId(null)}>
                  {t('emptyState.close')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reader Panel - URL bookmark with extracted content */}
      {selectedBookmark && (
        <div key={selectedBookmark.id} className="reader-transition flex min-w-0 flex-1 flex-col">
          <ArticleReader
            entry={convertBookmarkToEntry(selectedBookmark)}
            onClose={() => {
              setSelectedBookmark(null)
              setIsFullscreen(false)
            }}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            showCloseButton
            hideReadStatus
          />
        </div>
      )}
    </div>
  )
}

function BookmarkListItemSkeleton() {
  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-lg border px-4 py-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="mb-1 h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="hidden gap-1 sm:flex">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="hidden h-4 w-20 sm:block" />
    </div>
  )
}

interface CreateBookmarkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateBookmarkDialog({ open, onOpenChange }: CreateBookmarkDialogProps) {
  const { t } = useTranslation('bookmarks')
  const { createBookmark } = useBookmarkStore()
  const { bookmarkFolders } = useFolderStore()

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url && !title) {
      setError(t('dialogs.createBookmark.error.urlOrTitleRequired'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await createBookmark({
        url: url || undefined,
        title: title || url,
        excerpt: excerpt || undefined,
        folder_ids: selectedFolders.length > 0 ? selectedFolders : undefined,
      })
      // Reset form
      setUrl('')
      setTitle('')
      setExcerpt('')
      setSelectedFolders([])
      onOpenChange(false)
    } catch (err) {
      setError(t('dialogs.createBookmark.error.failedToCreate'))
      console.error('Failed to create bookmark:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleFolder = (folderId: string) => {
    setSelectedFolders((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('dialogs.createBookmark.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.createBookmark.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                {t('dialogs.createBookmark.url')}
              </label>
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                {t('dialogs.createBookmark.title')}
              </label>
              <Input
                type="text"
                placeholder={t('placeholders.articleTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                {t('dialogs.createBookmark.notes')}
              </label>
              <textarea
                placeholder={t('placeholders.addNote')}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                className="border-input bg-background text-foreground placeholder:text-muted-foreground/64 focus:border-ring focus:ring-ring/24 h-24 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm focus:ring-[3px] focus:outline-none"
              />
            </div>

            {/* Folder selection */}
            {bookmarkFolders.length > 0 && (
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  {t('dialogs.createBookmark.folders')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bookmarkFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        selectedFolders.includes(folder.id)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <DialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('dialogs.createBookmark.cancel')}
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('dialogs.createBookmark.saving')}
                </>
              ) : (
                t('dialogs.createBookmark.save')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

function findFolderName(folders: FolderTreeNode[], id: string): string {
  for (const folder of folders) {
    if (folder.id === id) return folder.name
    if (folder.children) {
      const found = findFolderName(folder.children, id)
      if (found) return found
    }
  }
  return 'Unknown'
}

interface EditBookmarkDialogProps {
  bookmark: Bookmark | null
  onClose: () => void
  folders: FolderTreeNode[]
}

function EditBookmarkDialog({ bookmark, onClose, folders }: EditBookmarkDialogProps) {
  const { t } = useTranslation('bookmarks')
  const { updateBookmark, addFolder, removeFolder } = useBookmarkStore()
  const { createFolder } = useFolderStore()

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Track which folders are selected
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([])

  // Search state for folder selection
  const [folderSearch, setFolderSearch] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  // Initialize form when bookmark changes
  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title)
      setExcerpt(bookmark.excerpt || '')
      setSelectedFolderIds(bookmark.folders.map((f) => f.id))
      setError('')
    }
  }, [bookmark])

  const handleSave = async () => {
    if (!bookmark) return
    if (!title.trim()) {
      setError(t('dialogs.editBookmark.error.titleRequired'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // Update title and excerpt
      await updateBookmark(bookmark.id, {
        title: title.trim(),
        excerpt: excerpt.trim() || undefined,
      })

      // Handle folder changes
      const currentFolderIds = bookmark.folders.map((f) => f.id)
      const foldersToAdd = selectedFolderIds.filter((id) => !currentFolderIds.includes(id))
      const foldersToRemove = currentFolderIds.filter((id) => !selectedFolderIds.includes(id))

      for (const folderId of foldersToAdd) {
        await addFolder(bookmark.id, folderId)
      }
      for (const folderId of foldersToRemove) {
        await removeFolder(bookmark.id, folderId)
      }

      onClose()
    } catch (err) {
      setError(t('dialogs.editBookmark.error.failedToUpdate'))
      console.error('Failed to update bookmark:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleFolder = (folderId: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    )
  }

  // Flatten folders for selection
  const flattenFolders = (
    nodes: FolderTreeNode[],
    level = 0
  ): Array<FolderTreeNode & { level: number }> => {
    const result: Array<FolderTreeNode & { level: number }> = []
    for (const node of nodes) {
      result.push({ ...node, level })
      if (node.children?.length) {
        result.push(...flattenFolders(node.children, level + 1))
      }
    }
    return result
  }

  const flatFolders = flattenFolders(folders)

  // Filtered folders based on search
  const filteredFolders = flatFolders.filter((folder) =>
    folder.name.toLowerCase().includes(folderSearch.toLowerCase())
  )

  // Check for exact matches
  const folderExactMatch = flatFolders.some(
    (folder) => folder.name.toLowerCase() === folderSearch.toLowerCase()
  )

  // Handle creating new folder
  const handleCreateNewFolder = async () => {
    if (!folderSearch.trim() || folderExactMatch) return
    setIsCreatingFolder(true)
    try {
      const newFolder = await createFolder({
        name: folderSearch.trim(),
        type: 'bookmark',
        parent_id: null,
      })
      if (newFolder) {
        setSelectedFolderIds((prev) => [...prev, newFolder.id])
      }
      setFolderSearch('')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  return (
    <Dialog open={!!bookmark} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dialogs.editBookmark.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.editBookmark.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {/* Title */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              {t('dialogs.editBookmark.title')}
            </label>
            <Input
              type="text"
              placeholder={t('placeholders.bookmarkTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Excerpt / Notes */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              {t('dialogs.editBookmark.notes')}
            </label>
            <textarea
              placeholder={t('placeholders.bookmarkNotes')}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground/64 focus:border-ring focus:ring-ring/24 h-24 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm focus:ring-[3px] focus:outline-none"
            />
          </div>

          {/* Source info */}
          {bookmark && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">
                {bookmark.entry_id ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {t('dialogs.editBookmark.source.savedFromFeed')}
                  </span>
                ) : bookmark.url ? (
                  <span className="flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                    >
                      {bookmark.url}
                    </a>
                  </span>
                ) : (
                  t('dialogs.editBookmark.source.noSource')
                )}
              </p>
            </div>
          )}

          {/* Folders */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              {t('dialogs.editBookmark.folders')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Selected folders */}
              {selectedFolderIds.map((folderId) => {
                const folder = flatFolders.find((f) => f.id === folderId)
                if (!folder) return null
                return (
                  <span
                    key={folder.id}
                    className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium"
                  >
                    <FolderOpen className="h-3 w-3" />
                    {folder.name}
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className="hover:bg-accent ml-0.5 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}

              {/* Folder Combobox */}
              <Menu>
                <MenuTrigger className="border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs transition-colors">
                  <FolderOpen className="h-3 w-3" />
                  <Plus className="h-3 w-3" />
                </MenuTrigger>
                <MenuPopup align="start" sideOffset={4} className="w-56">
                  {/* Search Input */}
                  <div className="p-2">
                    <div className="relative">
                      <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={t('placeholders.searchFolder')}
                        value={folderSearch}
                        onChange={(e) => setFolderSearch(e.target.value)}
                        className="border-input placeholder:text-muted-foreground/60 focus:border-primary h-8 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm focus-visible:!shadow-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && folderSearch.trim() && !folderExactMatch) {
                            e.preventDefault()
                            handleCreateNewFolder()
                          }
                        }}
                      />
                    </div>
                  </div>

                  <MenuSeparator />

                  {/* Folder List */}
                  <div className="max-h-48 overflow-y-auto py-1">
                    {filteredFolders.length === 0 && !folderSearch.trim() && (
                      <div className="text-muted-foreground px-2 py-3 text-center text-xs">
                        No folders yet. Type to create one.
                      </div>
                    )}

                    {filteredFolders.map((folder) => {
                      const isSelected = selectedFolderIds.includes(folder.id)
                      return (
                        <MenuCheckboxItem
                          key={folder.id}
                          checked={isSelected}
                          onClick={(e) => {
                            e.preventDefault()
                            toggleFolder(folder.id)
                          }}
                          className="cursor-pointer"
                          style={{ paddingLeft: `${12 + folder.level * 12}px` }}
                        >
                          <span className="flex items-center gap-2">
                            <FolderOpen className="h-3.5 w-3.5" />
                            {folder.name}
                          </span>
                        </MenuCheckboxItem>
                      )
                    })}

                    {/* Create New Folder Option */}
                    {folderSearch.trim() && !folderExactMatch && (
                      <>
                        {filteredFolders.length > 0 && <MenuSeparator />}
                        <MenuItem
                          onClick={(e) => {
                            e.preventDefault()
                            handleCreateNewFolder()
                          }}
                          disabled={isCreatingFolder}
                          className="text-primary cursor-pointer"
                        >
                          {isCreatingFolder ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Create &quot;{folderSearch.trim()}&quot;
                            </>
                          )}
                        </MenuItem>
                      </>
                    )}
                  </div>
                </MenuPopup>
              </Menu>
            </div>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: 'ghost' })}>
            {t('dialogs.editBookmark.cancel')}
          </DialogClose>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('dialogs.editBookmark.saving')}
              </>
            ) : (
              t('dialogs.editBookmark.save')
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
