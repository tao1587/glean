import { format } from 'date-fns'
import { EyeOff } from 'lucide-react'
import { stripHtmlTags } from '@/lib/html'
import { truncateTodayBoardSummary, type TodayBoardEntry } from '@/pages/reader/shared/todayBoard'

export type CardAction = 'hide' | 'restore' | 'none'

export function PeriodEntryCard({ entry, action, onOpen, onAction, translated }: {
  entry: TodayBoardEntry
  action: CardAction
  onOpen: (e: TodayBoardEntry) => void
  onAction: (e: TodayBoardEntry) => void
  translated?: { title?: string; summary?: string }
}) {
  const title = translated?.title ?? entry.title
  const summary = truncateTodayBoardSummary(translated?.summary ?? stripHtmlTags(entry.summary || ''))
  return (
    <div data-entry-id={entry.id} className="group relative rounded-lg border" style={{ background: 'var(--digest-bg-card)', borderColor: 'var(--digest-divider)', padding: '18px 20px' }}>
      {action === 'hide' ? (
        <button type="button" aria-label="隐藏" title="隐藏" onClick={(e) => { e.stopPropagation(); onAction(entry) }}
          className="absolute right-4 top-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100" style={{ color: 'var(--digest-text-tertiary)' }}>
          <EyeOff className="h-[18px] w-[18px]" />
        </button>
      ) : action === 'restore' ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAction(entry) }}
          className="absolute right-4 top-4 text-xs underline" style={{ color: 'var(--digest-accent)' }}>恢复</button>
      ) : null}
      <button type="button" onClick={() => onOpen(entry)} className="block w-full text-left">
        <div className="pr-8 text-[17px] font-medium leading-[1.45]" style={{ fontFamily: "'Noto Serif SC', Georgia, serif", color: 'var(--digest-text)' }}>{title}</div>
        {summary ? <div className="mt-2 line-clamp-2 text-[14px] leading-[1.65]" style={{ color: 'var(--digest-text-secondary)' }}>{summary}</div> : null}
        <div className="mt-3 text-xs tabular-nums" style={{ color: 'var(--digest-text-tertiary)' }}>{format(entry.effective_timestamp, 'M/d HH:mm')}</div>
      </button>
    </div>
  )
}
