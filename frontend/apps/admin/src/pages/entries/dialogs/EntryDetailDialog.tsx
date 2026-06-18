import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  Badge,
  Button,
  Skeleton,
} from '@glean/ui'
import { ExternalLink, Rss, User, Calendar, FileText, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'
import { useEntry } from '../../../hooks/useEntries'

interface EntryDetailDialogProps {
  entryId: string
  onClose: () => void
  onDeleteRequest: (id: string) => void
}

export function EntryDetailDialog({ entryId, onClose, onDeleteRequest }: EntryDetailDialogProps) {
  const { t } = useTranslation(['admin'])
  const { data: entry, isLoading } = useEntry(entryId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="sm:max-w-4xl" showCloseButton>
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="line-clamp-2 text-xl leading-tight font-bold">
                {entry?.title ?? t('admin:common.loading')}
              </DialogTitle>
              {entry && (
                <DialogDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {entry.author && (
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {entry.author}
                    </span>
                  )}
                  {entry.published_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(entry.published_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  )}
                  <Badge variant="secondary" className="gap-1">
                    <Rss className="h-3 w-3" />
                    {entry.feed_title}
                  </Badge>
                </DialogDescription>
              )}
            </div>
            {entry && (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={(props) => (
                    <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>{t('admin:entries.open')}</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => onDeleteRequest(entry.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('admin:entries.delete')}</span>
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        <DialogPanel className="max-h-[60vh]">
          {isLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
              <div className="py-2" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : entry?.content ? (
            // Content is server-rendered HTML from trusted RSS feeds
            <article
              className="prose prose-invert prose-sm prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-blockquote:border-primary prose-blockquote:text-foreground/80 prose-code:text-foreground prose-pre:bg-muted max-w-none"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            />
          ) : entry?.summary ? (
            <article
              className="prose prose-invert prose-sm prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 max-w-none"
              dangerouslySetInnerHTML={{ __html: entry.summary }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="text-muted-foreground mb-4 h-12 w-12" />
              <p className="text-muted-foreground italic">{t('admin:entries.noContent')}</p>
              {entry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  render={(props) => (
                    <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('admin:entries.viewOriginal')}
                </Button>
              )}
            </div>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
