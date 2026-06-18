import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useRangeReadEntries, useRangeHiddenEntries } from '@/hooks/useRangeEntries'
import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { PeriodEntryCard } from './PeriodEntryCard'

export function SourceSection({
  group, period, anchorDate, justHidden, onOpen, onHide, onUndo, onToggleSave, onRestore,
}: {
  group: TodayBoardFeedGroup
  period: 'week' | 'month'
  anchorDate: string
  justHidden: TodayBoardEntry[]
  onOpen: (e: TodayBoardEntry) => void
  onHide: (e: TodayBoardEntry) => void
  onUndo: (e: TodayBoardEntry) => void
  onToggleSave: (e: TodayBoardEntry) => void
  onRestore: (e: TodayBoardEntry) => void
}) {
  const [readOpen, setReadOpen] = useState(false)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const read = useRangeReadEntries(group.feedId, { period, anchorDate }, readOpen)
  const hiddenQ = useRangeHiddenEntries(group.feedId, { period, anchorDate }, hiddenOpen)
  return (
    <section className="border-border/60 border-t px-[18px] py-4 first:border-t-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-muted text-muted-foreground flex h-[22px] w-[22px] items-center justify-center rounded-md text-xs font-medium">
          {(group.feedTitle ?? '?').slice(0, 1)}
        </span>
        <span className="text-sm font-medium text-stone-800">{group.feedTitle ?? '未知来源'}</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {group.visibleEntries.map((e) => (
          <PeriodEntryCard key={e.id} entry={e} onOpen={onOpen} onHide={onHide} onToggleSave={onToggleSave} />
        ))}
      </div>
      {justHidden.map((e) => (
        <div key={e.id} className="mt-2 flex items-center gap-2 text-[11px] text-stone-400">
          <span className="truncate">已隐藏 ·「{e.title}」</span>
          <button type="button" className="text-primary underline" onClick={() => onUndo(e)}>撤销</button>
        </div>
      ))}
      <button type="button" onClick={() => setReadOpen((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
        {readOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        看过的
      </button>
      {readOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2.5 opacity-70 sm:grid-cols-2">
          {read.entries.map((e) => (
            <PeriodEntryCard key={e.id} entry={e} onOpen={onOpen} onHide={onHide} onToggleSave={onToggleSave} />
          ))}
        </div>
      ) : null}
      <button type="button" onClick={() => setHiddenOpen((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
        {hiddenOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        隐藏的
      </button>
      {hiddenOpen ? (
        <div className="mt-2 space-y-1">
          {hiddenQ.entries.length === 0 ? (
            <p className="text-xs text-stone-400">没有隐藏的内容</p>
          ) : (
            hiddenQ.entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[11px]">
                <span className="truncate text-stone-600">{e.title}</span>
                <button type="button" className="text-primary underline shrink-0" onClick={() => onRestore(e)}>恢复</button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}
