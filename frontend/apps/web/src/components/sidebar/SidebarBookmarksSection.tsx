import { useState } from 'react'
import { useTranslation } from '@glean/i18n'
import {
  Button,
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
  DialogFooter,
  Input,
  Label,
  cn,
} from '@glean/ui'
import {
  ChevronRight,
  Bookmark,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { FolderTreeNode } from '@glean/types'
import { SidebarItem } from './SidebarItem'

interface SidebarBookmarksSectionProps {
  isSidebarOpen: boolean
  isMobileSidebarOpen: boolean
  isBookmarkSectionExpanded: boolean
  onToggleBookmarkSection: () => void
  onCreateFolder: (parentId: string | null) => void
  onSelectFolder: (folderId?: string) => void
  isBookmarksPage: boolean
  currentBookmarkFolderId?: string
  bookmarkFolders: FolderTreeNode[]
  expandedBookmarkFolders: Set<string>
  toggleBookmarkFolder: (folderId: string) => void
  onRenameFolder: (id: string, name: string) => Promise<unknown>
  onDeleteFolder: (id: string) => Promise<boolean>
}

export function SidebarBookmarksSection({
  isSidebarOpen,
  isMobileSidebarOpen,
  isBookmarkSectionExpanded,
  onToggleBookmarkSection,
  onCreateFolder,
  onSelectFolder,
  isBookmarksPage,
  currentBookmarkFolderId,
  bookmarkFolders,
  expandedBookmarkFolders,
  toggleBookmarkFolder,
  onRenameFolder,
  onDeleteFolder,
}: SidebarBookmarksSectionProps) {
  const { t } = useTranslation(['feeds', 'bookmarks'])

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
            onClick={onToggleBookmarkSection}
            className={cn(
              'text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors md:px-3 md:text-xs',
              isMobileSidebarOpen && 'rounded-md bg-muted/60 px-2.5 py-1 text-[11px] text-current'
            )}
            aria-label={
              isBookmarkSectionExpanded ? 'Collapse bookmarks section' : 'Expand bookmarks section'
            }
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${
                isBookmarkSectionExpanded ? 'rotate-90' : ''
              }`}
            />
            {t('sidebar.bookmarks')}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCreateFolder(null)}
              className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
              title={t('actions.createFolder')}
              aria-label={t('actions.createFolder')}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isBookmarkSectionExpanded && (
        <>
          <SidebarItem
            icon={<Bookmark />}
            label={t('bookmarks.allBookmarks')}
            isActive={isBookmarksPage && !currentBookmarkFolderId}
            onClick={() => onSelectFolder(undefined)}
            isSidebarCollapsed={!isSidebarOpen && !isMobileSidebarOpen}
            compact={isMobileSidebarOpen}
            title={t('bookmarks.allBookmarks')}
          />

          {(isSidebarOpen || isMobileSidebarOpen) && bookmarkFolders.length > 0 && (
            <div className="space-y-0.5">
              {bookmarkFolders.map((folder) => (
                <SidebarBookmarkFolderItem
                  key={folder.id}
                  folder={folder}
                  isExpanded={expandedBookmarkFolders.has(folder.id)}
                  onToggle={() => toggleBookmarkFolder(folder.id)}
                  onSelect={onSelectFolder}
                  isActive={currentBookmarkFolderId === folder.id}
                  expandedFolders={expandedBookmarkFolders}
                  toggleFolder={toggleBookmarkFolder}
                  currentFolderId={currentBookmarkFolderId}
                  onCreateSubfolder={() => onCreateFolder(folder.id)}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  isCompact={isMobileSidebarOpen}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

interface SidebarBookmarkFolderItemProps {
  folder: FolderTreeNode
  isExpanded: boolean
  onToggle: () => void
  onSelect: (folderId: string) => void
  isActive: boolean
  expandedFolders: Set<string>
  toggleFolder: (folderId: string) => void
  currentFolderId?: string
  onCreateSubfolder: () => void
  onRename: (id: string, name: string) => Promise<unknown>
  onDelete: (id: string) => Promise<boolean>
  isCompact: boolean
}

function SidebarBookmarkFolderItem({
  folder,
  isExpanded,
  onToggle,
  onSelect,
  isActive,
  expandedFolders,
  toggleFolder,
  currentFolderId,
  onCreateSubfolder,
  onRename,
  onDelete,
  isCompact,
}: SidebarBookmarkFolderItemProps) {
  const { t } = useTranslation('bookmarks')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFolderName, setRenameFolderName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  const hasChildren = folder.children && folder.children.length > 0

  const handleDeleteFolder = async () => {
    await onDelete(folder.id)
    setIsMenuOpen(false)
  }

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim() || renameFolderName === folder.name) {
      setShowRenameDialog(false)
      return
    }
    setIsRenaming(true)
    try {
      await onRename(folder.id, renameFolderName.trim())
      setShowRenameDialog(false)
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center rounded-lg text-sm transition-all duration-200',
          isCompact ? 'gap-2 px-2 py-1.5 text-[13px]' : 'gap-3 px-3 py-2',
          isActive
            ? isCompact
              ? 'bg-primary/15 text-primary font-semibold shadow-sm ring-1 ring-primary/25 border-l-2 border-primary'
              : 'bg-primary/10 text-primary scale-[1.01] font-medium shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-[1.01]'
        )}
      >
        <button onClick={onToggle} className="touch-target-none flex h-5 items-center gap-2.5">
          {hasChildren ? (
            <ChevronRight
              className={cn(
                'h-3 w-3 shrink-0 transition-transform duration-200',
                isExpanded && 'rotate-90'
              )}
            />
          ) : (
            <span className="w-3" />
          )}
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

        <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <MenuTrigger className="touch-target-none text-muted-foreground hover:bg-accent hover:text-foreground h-5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
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
                <span>{t('common.delete')}</span>
              </MenuSubTrigger>
              <MenuSubPopup>
                <p className="text-muted-foreground px-2 py-1 text-xs">
                  {t('dialogs.deleteFolder.description', { name: folder.name })}
                </p>
                <MenuSeparator />
                <MenuItem onClick={() => setIsMenuOpen(false)}>
                  <span>{t('common.cancel')}</span>
                </MenuItem>
                <MenuItem variant="destructive" onClick={() => void handleDeleteFolder()}>
                  <Trash2 className="h-4 w-4" />
                  <span>{t('common.delete')}</span>
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          </MenuPopup>
        </Menu>
      </div>

      {isExpanded && hasChildren && (
        <div className="border-border mt-0.5 ml-4 space-y-0.5 border-l pl-2">
          {folder.children.map((child) => (
            <SidebarBookmarkFolderItem
              key={child.id}
              folder={child}
              isExpanded={expandedFolders.has(child.id)}
              onToggle={() => toggleFolder(child.id)}
              onSelect={onSelect}
              isActive={currentFolderId === child.id}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              currentFolderId={currentFolderId}
              onCreateSubfolder={onCreateSubfolder}
              onRename={onRename}
              onDelete={onDelete}
              isCompact={isCompact}
            />
          ))}
        </div>
      )}

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.renameFolder.title')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-bookmark-folder">{t('dialogs.createFolder.name')}</Label>
              <Input
                id="rename-bookmark-folder"
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
