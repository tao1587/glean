import { Bookmark } from 'lucide-react'
import { useEntries } from '@/hooks/useEntries'
import { getFeedColor } from './digestHelpers'
import { Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState } from '@glean/types'

interface SavedPanelProps {
  onSelectEntry: (entry: EntryWithState) => void
}

export function SavedPanel({ onSelectEntry }: SavedPanelProps) {
  const { t } = useTranslation('digest')
  const { data, isLoading } = useEntries({ read_later: true, per_page: 20 })
  const items = data?.items ?? []

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-start justify-between border-b px-4 pb-3 pt-4"
        style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
      >
        <div>
          <div
            className="text-[15px] font-semibold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text, #1A1A1A)',
            }}
          >
            {t('saved.title')}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
            {t('saved.subtitleCount', { count: data?.total ?? 0 })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <div className="space-y-2 px-2 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bookmark className="mb-3 h-8 w-8" style={{ color: 'var(--digest-divider-strong, #B8B3A5)' }} />
            <p className="text-sm" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
              {t('saved.empty')}
            </p>
          </div>
        )}

        {items.map((entry) => {
          const feedColor = getFeedColor(entry.feed_id)
          return (
            <button
              key={entry.id}
              onClick={() => onSelectEntry(entry)}
              className="mb-1 w-full rounded-md px-3 py-2.5 text-left transition-colors"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ''
              }}
            >
              <div
                className="mb-1 line-clamp-2 text-[13px] font-medium leading-snug"
                style={{
                  fontFamily: "'Noto Serif SC', Georgia, serif",
                  color: 'var(--digest-text, #1A1A1A)',
                }}
              >
                {entry.title}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
                <span
                  className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-sm"
                  style={{ background: feedColor }}
                />
                <span>{entry.feed_title || t('saved.unknownSource')}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
