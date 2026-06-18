import { format } from 'date-fns'
import { Edit3, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import type { Bookmark } from '@glean/types'
import { stripHtmlTags } from '../../lib/html'

interface BookmarkSearchResultsProps {
  bookmarks: Bookmark[]
  onOpen: (bookmark: Bookmark) => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
}

export function BookmarkSearchResults({
  bookmarks,
  onOpen,
  onEdit,
  onDelete,
}: BookmarkSearchResultsProps) {
  return (
    <div className="space-y-2">
      {bookmarks.map((bookmark) => (
        <div key={bookmark.id} className="border-border bg-card rounded-lg border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => onOpen(bookmark)} className="min-w-0 flex-1 text-left">
              <h3 className="text-foreground line-clamp-1 text-sm font-medium">{bookmark.title}</h3>
              {bookmark.excerpt && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {stripHtmlTags(bookmark.excerpt)}
                </p>
              )}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              {bookmark.url && (
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-accent rounded p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button onClick={() => onEdit(bookmark)} className="hover:bg-accent rounded p-1">
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(bookmark)}
                className="text-destructive hover:bg-destructive/10 rounded p-1"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>{format(new Date(bookmark.created_at), 'yyyy-MM-dd')}</span>
            {bookmark.folders.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                {bookmark.folders.length}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
