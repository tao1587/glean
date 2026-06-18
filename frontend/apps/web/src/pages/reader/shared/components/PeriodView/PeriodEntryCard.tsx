import { format } from 'date-fns'
import { Bookmark, EyeOff } from 'lucide-react'
import { cn } from '@glean/ui'
import { stripHtmlTags } from '@/lib/html'
import { truncateTodayBoardSummary, type TodayBoardEntry } from '@/pages/reader/shared/todayBoard'

export function PeriodEntryCard({
  entry, onOpen, onHide, onToggleSave,
}: {
  entry: TodayBoardEntry
  onOpen: (e: TodayBoardEntry) => void
  onHide: (e: TodayBoardEntry) => void
  onToggleSave: (e: TodayBoardEntry) => void
}) {
  const summary = truncateTodayBoardSummary(stripHtmlTags(entry.summary || ''))
  return (
    <div className="border-border/70 flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <button type="button" onClick={() => onOpen(entry)} className="text-left">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{entry.title}</h3>
        {summary ? <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-slate-600">{summary}</p> : null}
      </button>
      <div className="flex items-center justify-between">
        <span className="text-xs tabular-nums text-stone-500">{format(entry.effective_timestamp, 'M/d HH:mm')}</span>
        <div className="flex items-center gap-3 text-stone-400">
          <button type="button" aria-label="不感兴趣" title="不感兴趣" onClick={() => onHide(entry)}>
            <EyeOff className="h-4 w-4 hover:text-stone-700" />
          </button>
          <button type="button" aria-label="保存" title="保存" onClick={() => onToggleSave(entry)}>
            <Bookmark className={cn('h-4 w-4 hover:text-primary', entry.read_later && 'text-primary')} />
          </button>
        </div>
      </div>
    </div>
  )
}
