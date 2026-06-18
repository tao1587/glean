import { useEffect, useRef } from 'react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { stripHtmlTags } from '@/lib/html'
import { FeedIcon } from './FeedIcon'
import type { ListEntryTranslation } from '@/hooks/useListEntriesTranslation'

interface DigestReadingListProps {
  entries: EntryWithState[]
  selectedId: string | null
  onSelect: (entry: EntryWithState) => void
  translations?: Record<string, ListEntryTranslation>
}

interface RowProps {
  entry: EntryWithState
  isSelected: boolean
  onClick: () => void
  translation?: ListEntryTranslation
}

function Row({ entry, isSelected, onClick, translation }: RowProps) {
  const { t } = useTranslation('digest')
  const feedName = entry.feed_title || t('card.unknownSource')
  const title = translation?.title || entry.title
  const summary = translation?.summary || stripHtmlTags(entry.summary)

  return (
    <button
      type="button"
      onClick={onClick}
      data-entry-id={entry.id}
      className="group/row flex w-full cursor-pointer flex-col gap-1 border-b px-4 py-3 text-left transition-colors"
      style={{
        borderColor: 'var(--digest-divider, #E5E0D2)',
        background: isSelected ? 'var(--digest-accent-soft, #F5E6E5)' : undefined,
        boxShadow: isSelected
          ? 'inset 3px 0 0 var(--digest-accent, #B8312F)'
          : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = ''
        }
      }}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]"
        style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
      >
        <FeedIcon
          feedId={entry.feed_id}
          feedIconUrl={entry.feed_icon_url}
          feedTitle={entry.feed_title}
          className="h-3.5 w-3.5 rounded-[3px]"
          fallback="letter"
        />
        <span className="truncate">{feedName}</span>
      </div>
      <div
        className="text-[14px] leading-snug"
        style={{
          fontFamily: "'Noto Serif SC', Georgia, serif",
          fontWeight: entry.is_read ? 400 : 600,
          color: 'var(--digest-text, #1A1A1A)',
        }}
      >
        {title}
      </div>
      {summary && (
        <div
          className="line-clamp-2 text-[12.5px] leading-relaxed"
          style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
        >
          {summary}
        </div>
      )}
    </button>
  )
}

export function DigestReadingList({
  entries,
  selectedId,
  onSelect,
  translations,
}: DigestReadingListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedId) return
    const el = containerRef.current?.querySelector(`[data-entry-id="${selectedId}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }, [selectedId])

  return (
    <div ref={containerRef} className="flex flex-col">
      {entries.map((entry) => (
        <Row
          key={entry.id}
          entry={entry}
          isSelected={selectedId === entry.id}
          onClick={() => onSelect(entry)}
          translation={translations?.[entry.id]}
        />
      ))}
    </div>
  )
}
