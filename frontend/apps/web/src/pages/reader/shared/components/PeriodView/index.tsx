import { useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@glean/ui'
import { useUpdateEntryState } from '@/hooks/useEntries'
import { useRangeEntries } from '@/hooks/useRangeEntries'
import { getPeriodRange, shiftPeriod, type PeriodKind } from '@/pages/reader/shared/periodRange'
import { buildTodayBoardEntries, buildTodayBoardGroups, type TodayBoardEntry } from '@/pages/reader/shared/todayBoard'
import { SourceSection } from './SourceSection'
import { useHiddenUndo } from './useHiddenUndo'

export function PeriodView({ periodKind, anchorDate, todayDateKey, onChangePeriod, onOpenEntry }: {
  periodKind: PeriodKind
  anchorDate: string
  todayDateKey: string
  onChangePeriod: (kind: 'day' | PeriodKind, anchor: string) => void
  onOpenEntry: (e: TodayBoardEntry) => void
}) {
  const range = useMemo(() => getPeriodRange(anchorDate, periodKind), [anchorDate, periodKind])
  const q = useRangeEntries({ ...range, enabled: true })
  const update = useUpdateEntryState()
  const undo = useHiddenUndo()

  const groups = useMemo(() => {
    const built = buildTodayBoardEntries(q.entries, { filterBySelectedDate: false })
    const hiddenIds = new Set(Object.values(undo.hidden).flat().map((e) => e.id))
    return buildTodayBoardGroups(built.filter((e) => !hiddenIds.has(e.id)))
  }, [q.entries, undo.hidden])

  const hide = (e: TodayBoardEntry) => { undo.add(e); update.mutate({ entryId: e.id, data: { is_hidden: true } }) }
  const unhide = (e: TodayBoardEntry) => { undo.remove(e); update.mutate({ entryId: e.id, data: { is_hidden: false } }) }
  const toggleSave = (e: TodayBoardEntry) => update.mutate({ entryId: e.id, data: { read_later: !e.read_later } })

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !q.hasNextPage) return
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting && !q.isFetchingNextPage) q.fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage, range.collected_after])

  const isCurrent = getPeriodRange(todayDateKey, periodKind).collected_after === range.collected_after

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--color-background-secondary,#f7f5f0)]">
      <div className="border-border/60 sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/95 px-[18px] py-3 backdrop-blur">
        <div className="text-base font-medium text-stone-800">
          {isCurrent ? (periodKind === 'week' ? '本周' : '本月') : range.label}
          {isCurrent && <span className="ml-2 text-xs font-normal text-stone-500">{range.label}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="border-border/60 inline-flex overflow-hidden rounded-md border text-xs">
            {(['day', 'week', 'month'] as const).map((k) => (
              <button key={k} type="button" onClick={() => onChangePeriod(k, anchorDate)}
                className={cn('px-2.5 py-1', k === periodKind ? 'bg-primary/10 text-primary font-medium' : 'text-stone-500')}>
                {k === 'day' ? '日' : k === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
          <button type="button" aria-label="上一期" onClick={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, -1))}>
            <ChevronLeft className="h-4 w-4 text-stone-500" />
          </button>
          <button type="button" aria-label="下一期" onClick={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, 1))}>
            <ChevronRight className="h-4 w-4 text-stone-500" />
          </button>
        </div>
      </div>

      {!q.isLoading && groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <Inbox className="mb-3 h-8 w-8 text-stone-400" />
          <p className="text-sm text-stone-500">这段时间没有未读内容</p>
        </div>
      ) : (
        groups.map((g) => (
          <SourceSection key={g.feedId} group={g} range={range} justHidden={undo.hidden[g.feedId] ?? []}
            onOpen={onOpenEntry} onHide={hide} onUndo={unhide} onToggleSave={toggleSave} />
        ))
      )}
      <div ref={sentinelRef} className="h-8" />
    </div>
  )
}
