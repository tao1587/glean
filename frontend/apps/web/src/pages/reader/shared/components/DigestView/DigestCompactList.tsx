import { useState, useCallback } from 'react'
import { Bookmark, Check } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { FeedIcon } from './FeedIcon'
import { useUpdateEntryState } from '@/hooks/useEntries'
import type { ListEntryTranslation } from '@/hooks/useListEntriesTranslation'

interface DigestCompactListProps {
  entries: EntryWithState[]
  onSelectEntry: (entry: EntryWithState) => void
  focusedEntryId?: string | null
  translations?: Record<string, ListEntryTranslation>
}

const DEFAULT_VISIBLE_COUNT = 8

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${mins}`
  } catch {
    return ''
  }
}

interface CompactItemProps {
  entry: EntryWithState
  onSelect: () => void
  isFocused?: boolean
  translation?: ListEntryTranslation
}

function CompactItem({ entry, onSelect, isFocused = false, translation }: CompactItemProps) {
  const { t } = useTranslation('digest')
  const updateMutation = useUpdateEntryState()

  const handleMarkRead = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void updateMutation.mutateAsync({
        entryId: entry.id,
        data: { is_read: !entry.is_read },
      })
    },
    [entry.id, entry.is_read, updateMutation]
  )

  const handleSaveLater = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void updateMutation.mutateAsync({
        entryId: entry.id,
        data: { read_later: !entry.read_later },
      })
    },
    [entry.id, entry.read_later, updateMutation]
  )

  const timeStr = formatTime(entry.published_at)

  return (
    <div
      data-entry-id={entry.id}
      onClick={onSelect}
      className="group/compact grid cursor-pointer items-center gap-4 border-b border-r px-5 py-4 transition-colors"
      style={{
        gridTemplateColumns: '1fr auto',
        borderColor: 'var(--digest-divider, #E5E0D2)',
        background: isFocused ? 'var(--digest-bg-hover, #F1EDE2)' : undefined,
        boxShadow: isFocused ? 'inset 3px 0 0 var(--digest-accent, #B8312F)' : undefined,
        opacity: entry.is_read ? 0.75 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isFocused ? 'var(--digest-bg-hover, #F1EDE2)' : ''
      }}
    >
      {/* Title + meta */}
      <div className="min-w-0">
        <div
          className="mb-1 text-[15px] font-medium leading-snug transition-colors group-hover/compact:[color:var(--digest-accent,#B8312F)]"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            color: 'var(--digest-text, #1A1A1A)',
          }}
        >
          {!entry.is_read && (
            <span
              className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: 'var(--digest-accent, #B8312F)' }}
            />
          )}
          {translation?.title || entry.title}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
          <FeedIcon
            feedId={entry.feed_id}
            feedIconUrl={entry.feed_icon_url}
            feedTitle={entry.feed_title}
            className="h-3.5 w-3.5 rounded-[3px]"
            fallback="letter"
          />
          <span className="font-medium" style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}>
            {entry.feed_title || t('card.unknownSource')}
          </span>
          {timeStr && (
            <>
              <span
                className="inline-block h-[3px] w-[3px] rounded-full"
                style={{ background: 'var(--digest-text-tertiary, #9A968C)' }}
              />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/compact:opacity-100 max-sm:hidden">
        <button
          onClick={handleMarkRead}
          title={entry.is_read ? t('card.markUnread') : t('card.markRead')}
          className="flex h-7 w-7 items-center justify-center rounded transition-colors"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          onClick={handleSaveLater}
          title={entry.read_later ? t('card.unsave') : t('card.save')}
          className="flex h-7 w-7 items-center justify-center rounded transition-colors"
          style={{
            color: entry.read_later
              ? 'var(--digest-accent, #B8312F)'
              : 'var(--digest-text-tertiary, #9A968C)',
          }}
        >
          <Bookmark className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

export function DigestCompactList({ entries, onSelectEntry, focusedEntryId, translations }: DigestCompactListProps) {
  const { t } = useTranslation('digest')
  const [expanded, setExpanded] = useState(false)

  const visibleEntries = expanded ? entries : entries.slice(0, DEFAULT_VISIBLE_COUNT)
  const remaining = entries.length - DEFAULT_VISIBLE_COUNT

  return (
    <div>
      <div
        className="grid border-l"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          borderColor: 'var(--digest-divider, #E5E0D2)',
        }}
      >
        {visibleEntries.map((entry) => (
          <CompactItem
            key={entry.id}
            entry={entry}
            onSelect={() => onSelectEntry(entry)}
            isFocused={focusedEntryId === entry.id}
            translation={translations?.[entry.id]}
          />
        ))}
      </div>

      {!expanded && remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setExpanded(true)}
            className="rounded-md px-4 py-2 text-sm transition-colors"
            style={{
              color: 'var(--digest-text-secondary, #5E5A52)',
              border: '1px solid var(--digest-divider, #E5E0D2)',
            }}
          >
            {t('section.viewAll', { count: entries.length })}
          </button>
        </div>
      )}
    </div>
  )
}
