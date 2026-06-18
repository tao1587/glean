import { useCallback } from 'react'
import { Button } from '@glean/ui'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { EntryCard, type EntryRow } from './EntryCard'
import { EntryCardSkeleton } from './EntryCardSkeleton'

interface EntriesListProps {
  items: EntryRow[]
  total: number
  totalPages: number
  page: number
  isLoading: boolean
  hasActiveFilter: boolean
  deletingId: string | null
  onOpenEntry: (id: string) => void
  onDeleteEntry: (id: string) => void
  onPageChange: (page: number | ((p: number) => number)) => void
}

export function EntriesList({
  items,
  total,
  totalPages,
  page,
  isLoading,
  hasActiveFilter,
  deletingId,
  onOpenEntry,
  onDeleteEntry,
  onPageChange,
}: EntriesListProps) {
  const { t } = useTranslation(['admin'])

  const handlePrev = useCallback(() => onPageChange((p) => Math.max(1, p - 1)), [onPageChange])
  const handleNext = useCallback(() => onPageChange((p) => p + 1), [onPageChange])

  return (
    <div className="flex flex-col gap-6">
      <div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <EntryCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-xl border py-16">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <FileText className="text-muted-foreground h-8 w-8" />
            </div>
            <p className="text-muted-foreground">
              {hasActiveFilter ? t('admin:entries.emptyFilter') : t('admin:entries.empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((entry, index) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                index={index}
                onOpenEntry={onOpenEntry}
                onDeleteEntry={onDeleteEntry}
                isDeleting={deletingId === entry.id}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="border-border bg-card flex items-center justify-between rounded-xl border px-6 py-4">
          <p className="text-muted-foreground text-sm">
            {t('admin:entries.pagination.pageOf', { page, total: totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handlePrev} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
              <span>{t('admin:entries.pagination.previous')}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleNext} disabled={page === totalPages}>
              <span>{t('admin:entries.pagination.next')}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Show total count hint */}
      {!isLoading && total > 0 && (
        <p className="text-muted-foreground text-center text-xs">
          {total.toLocaleString()} {t('admin:entries.badge')}
        </p>
      )}
    </div>
  )
}
