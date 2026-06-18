import { format } from 'date-fns'
import { Edit3, ExternalLink, Trash2 } from 'lucide-react'
import type { Bookmark } from '@glean/types'
import type { SourceBookmarkGroup } from './bookmarkGrouping'
import { stripHtmlTags } from '../../lib/html'

interface SourceGroupBoardProps {
  groups: SourceBookmarkGroup[]
  onOpen: (bookmark: Bookmark) => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
}

export function SourceGroupBoard({ groups, onOpen, onEdit, onDelete }: SourceGroupBoardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <section key={group.source} className="border-border bg-card rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-foreground truncate text-sm font-semibold">{group.source}</h3>
            <span className="text-muted-foreground text-xs">{group.items.length}</span>
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto p-2">
            {group.items.map((bookmark) => (
              <div
                key={bookmark.id}
                className="hover:bg-accent/60 flex items-start justify-between gap-2 rounded-lg px-2 py-2"
              >
                <button
                  onClick={() => onOpen(bookmark)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-foreground line-clamp-2 text-sm">{bookmark.title}</p>
                  {bookmark.excerpt && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                      {stripHtmlTags(bookmark.excerpt)}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  {bookmark.url && (
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:bg-accent rounded p-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(bookmark)
                    }}
                    className="hover:bg-accent rounded p-1"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(bookmark)
                    }}
                    className="text-destructive hover:bg-destructive/10 rounded p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-muted-foreground shrink-0 pl-1 text-[11px]">
                  {format(new Date(bookmark.created_at), 'MM/dd')}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
