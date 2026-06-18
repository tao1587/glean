import { memo, useMemo } from 'react'
import { Badge, Button } from '@glean/ui'
import { ExternalLink, Trash2, Loader2, Rss, User, Calendar, Wand2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'

export interface EntryRow {
  id: string
  feed_id: string
  feed_title: string
  url: string
  title: string
  author: string | null
  content_backfill_status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | null
  content_backfill_attempts: number
  content_backfill_error: string | null
  content_source: string | null
  published_at: string | null
  created_at: string
}

interface EntryCardProps {
  entry: EntryRow
  index: number
  onOpenEntry: (id: string) => void
  onDeleteEntry: (id: string) => void
  isDeleting: boolean
}

const BACKFILL_ICONS = {
  pending: <Wand2 className="h-3 w-3" />,
  processing: <Wand2 className="h-3 w-3" />,
  done: <Wand2 className="h-3 w-3" />,
  failed: <AlertCircle className="h-3 w-3" />,
  skipped: <AlertCircle className="h-3 w-3" />,
} as const

const BACKFILL_VARIANTS = {
  pending: 'secondary',
  processing: 'default',
  done: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
} as const satisfies Record<string, 'secondary' | 'default' | 'destructive' | 'outline'>

export const EntryCard = memo(function EntryCard({
  entry,
  index,
  onOpenEntry,
  onDeleteEntry,
  isDeleting,
}: EntryCardProps) {
  const { t } = useTranslation(['admin'])

  const formattedDate = useMemo(
    () => (entry.published_at ? format(new Date(entry.published_at), 'MMM d, yyyy HH:mm') : null),
    [entry.published_at],
  )

  const backfillMeta = useMemo(() => {
    const status = entry.content_backfill_status
    if (!status) return null
    return {
      icon: BACKFILL_ICONS[status],
      variant: BACKFILL_VARIANTS[status],
      label: t(`admin:entries.contentBackfill.${status}`),
    }
  }, [entry.content_backfill_status, t])

  return (
    <div
      className="group animate-fadeIn border-border bg-card hover:border-border/80 hover:bg-card/80 rounded-xl border p-4 transition-all duration-200"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onOpenEntry(entry.id)}
            className="mb-2 block text-left transition-colors"
          >
            <h3 className="text-foreground group-hover:text-primary line-clamp-2 font-medium transition-colors">
              {entry.title}
            </h3>
          </button>

          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary mb-3 flex items-center gap-1 truncate text-xs transition-colors"
          >
            <span className="truncate">{entry.url}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>

          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Rss className="h-3 w-3" />
              {entry.feed_title || 'Unknown'}
            </Badge>

            {entry.author && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {entry.author}
              </span>
            )}

            {formattedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formattedDate}
              </span>
            )}
          </div>

          {backfillMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={backfillMeta.variant} className="gap-1">
                {backfillMeta.icon}
                {backfillMeta.label}
              </Badge>
              <span className="text-muted-foreground">
                {t('admin:entries.contentBackfill.attempts', {
                  count: entry.content_backfill_attempts,
                })}
              </span>
              {entry.content_source && (
                <span className="text-muted-foreground">
                  {t('admin:entries.contentBackfill.source', { source: entry.content_source })}
                </span>
              )}
              {entry.content_backfill_error && entry.content_backfill_status === 'failed' && (
                <span className="text-destructive max-w-full break-words">
                  {t('admin:entries.contentBackfill.errorLog', {
                    message: entry.content_backfill_error,
                  })}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="icon-sm"
            variant="ghost"
            render={(props) => (
              <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
            )}
            title="Open in new tab"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onDeleteEntry(entry.id)}
            disabled={isDeleting}
            title="Delete entry"
            className="text-muted-foreground hover:text-destructive"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
})
