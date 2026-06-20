import { EyeOff } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { FeedIcon } from './FeedIcon'
import type { ListEntryTranslation } from '../../../../../hooks/useListEntriesTranslation'
import { stripHtmlTags } from '@/lib/html'

interface DigestArticleCardProps {
  entry: EntryWithState
  onClick: () => void
  isFocused?: boolean
  translation?: ListEntryTranslation
  /** Optional action button rendered in the top-right corner of the card. */
  action?: 'hide' | 'restore' | 'none'
  onAction?: (entry: EntryWithState) => void
}

function formatPublishedAt(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${mins}`
  } catch {
    return ''
  }
}

export function DigestArticleCard({ entry, onClick, isFocused = false, translation, action = 'none', onAction }: DigestArticleCardProps) {
  const { t } = useTranslation('digest')

  const feedName = entry.feed_title || t('card.unknownSource')
  const timeStr = formatPublishedAt(entry.published_at)
  const isRead = entry.is_read
  const displayTitle = translation?.title || entry.title
  const displaySummary = translation?.summary || stripHtmlTags(entry.summary)

  return (
    <article
      id={`digest-card-${entry.id}`}
      data-entry-id={entry.id}
      data-focused={isFocused}
      onClick={onClick}
      className="group/card relative flex cursor-pointer flex-col gap-2 border-b border-r px-7 py-6 transition-colors hover:bg-[var(--digest-bg-hover,#F1EDE2)] data-[focused=true]:bg-[var(--digest-bg-hover,#F1EDE2)]"
      style={{
        borderColor: 'var(--digest-divider, #E5E0D2)',
        boxShadow: isFocused ? 'inset 3px 0 0 var(--digest-accent, #B8312F)' : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute left-0 top-6 h-[18px] w-[3px] rounded-sm opacity-0 transition-opacity group-hover/card:opacity-100"
        style={{ background: 'var(--digest-accent, #B8312F)' }}
      />

      {/* Action button: hide (hover-reveal) or restore (always visible) */}
      {action === 'hide' && (
        <button
          type="button"
          aria-label="隐藏"
          className="absolute right-2.5 top-2.5 z-10 rounded p-1 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)', background: 'var(--digest-bg-card, #FFFFFF)' }}
          onClick={(e) => { e.stopPropagation(); onAction?.(entry) }}
        >
          <EyeOff className="h-4 w-4" />
        </button>
      )}
      {action === 'restore' && (
        <button
          type="button"
          className="absolute right-2.5 top-2.5 z-10 rounded px-1.5 py-0.5 text-xs underline"
          style={{ color: 'var(--digest-text, #1A1A1A)', background: 'var(--digest-bg-card, #FFFFFF)' }}
          onClick={(e) => { e.stopPropagation(); onAction?.(entry) }}
        >
          恢复
        </button>
      )}

      {/* Header: feed name on left, time on right */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FeedIcon
            feedId={entry.feed_id}
            feedIconUrl={entry.feed_icon_url}
            feedTitle={entry.feed_title}
            className="h-4 w-4 rounded-[3px]"
            fallback="letter"
          />
          <span
            className="truncate text-[11px] font-medium uppercase tracking-[0.1em]"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            {feedName}
          </span>
        </div>
        {timeStr && (
          <span
            className="flex-shrink-0 text-[11px]"
            style={{
              color: 'var(--digest-text-tertiary, #9A968C)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeStr}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-[19px] font-semibold leading-snug tracking-[-0.01em] break-words [overflow-wrap:anywhere] transition-colors group-hover/card:[color:var(--digest-accent,#B8312F)]"
        style={{
          fontFamily: "'Noto Serif SC', Georgia, serif",
          color: 'var(--digest-text, #1A1A1A)',
          opacity: isRead ? 0.75 : 1,
        }}
      >
        {!isRead && (
          <span
            className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: 'var(--digest-accent, #B8312F)' }}
          />
        )}
        {displayTitle}
      </h3>

      {/* Excerpt */}
      {displaySummary && (
        <p
          className="line-clamp-3 flex-1 text-[13.5px] leading-relaxed break-words [overflow-wrap:anywhere]"
          style={{
            color: 'var(--digest-text-secondary, #5E5A52)',
            opacity: isRead ? 0.75 : 1,
          }}
        >
          {displaySummary}
        </p>
      )}
    </article>
  )
}
