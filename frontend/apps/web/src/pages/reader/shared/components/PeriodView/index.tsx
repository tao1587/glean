import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useUpdateEntryState } from '@/hooks/useEntries'
import { useTabEntries, type PeriodTab } from '@/hooks/useRangeEntries'
import { getPeriodRange, shiftPeriod, type PeriodKind } from '@/pages/reader/shared/periodRange'
import { buildTodayBoardEntries, buildTodayBoardGroups, type TodayBoardEntry } from '@/pages/reader/shared/todayBoard'
import { useThemeStore } from '@/stores/themeStore'
import { DIGEST_LIGHT_VARS, DIGEST_DARK_VARS } from '../DigestView/digestTheme'
import { SourceSection } from './SourceSection'
import { useHiddenUndo } from './useHiddenUndo'
import { orderGroupsByAffinity } from './orderGroupsByAffinity'

const TABS: { key: PeriodTab; label: string }[] = [
  { key: 'unread', label: '未读' },
  { key: 'read', label: '读过' },
  { key: 'hidden', label: '隐藏' },
]

export function PeriodView({ periodKind, anchorDate, todayDateKey, onChangePeriod, onOpenEntry, sort, affinity, onChangeSort }: {
  periodKind: PeriodKind
  anchorDate: string
  todayDateKey: string
  onChangePeriod: (kind: 'day' | PeriodKind, anchor: string) => void
  onOpenEntry: (e: TodayBoardEntry) => void
  sort: 'time' | 'interest'
  affinity: Record<string, number>
  onChangeSort: (s: 'time' | 'interest') => void
}) {
  const { resolvedTheme } = useThemeStore()
  const digestVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  const [tab, setTab] = useState<PeriodTab>('unread')
  const range = useMemo(() => getPeriodRange(anchorDate, periodKind), [anchorDate, periodKind])
  const isCurrent = getPeriodRange(todayDateKey, periodKind).collected_after === range.collected_after

  const q = useTabEntries({ period: periodKind, anchorDate, tab, enabled: true })
  const update = useUpdateEntryState()
  const undo = useHiddenUndo()

  const groups = useMemo(() => {
    const filtered = buildTodayBoardEntries(q.entries, { filterBySelectedDate: false })
    const hiddenIds = tab === 'unread' ? new Set(Object.values(undo.hidden).flat().map((e) => e.id)) : new Set<string>()
    return orderGroupsByAffinity(
      buildTodayBoardGroups(filtered.filter((e) => !hiddenIds.has(e.id)), { visibleUnreadLimit: Number.POSITIVE_INFINITY }),
      sort,
      affinity,
    )
  }, [q.entries, undo.hidden, tab, sort, affinity])

  const hide = (e: TodayBoardEntry) => { undo.add(e); update.mutate({ entryId: e.id, data: { is_hidden: true } }) }
  const unhide = (e: TodayBoardEntry) => { undo.remove(e); update.mutate({ entryId: e.id, data: { is_hidden: false } }) }
  const restore = (e: TodayBoardEntry) => { update.mutate({ entryId: e.id, data: { is_hidden: false } }) }

  const cardAction = tab === 'unread' ? 'hide' : tab === 'hidden' ? 'restore' : 'none'
  const onAction = tab === 'hidden' ? restore : hide

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !q.hasNextPage) return
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting && !q.isFetchingNextPage) q.fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage, anchorDate])

  const emptyMessage =
    tab === 'unread' ? '这段时间没有未读内容' :
    tab === 'read' ? '还没有读过的内容' :
    '没有隐藏的内容'

  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto"
      style={{ ...digestVars, background: 'var(--digest-bg)', color: 'var(--digest-text)' } as React.CSSProperties}
    >
      {/* Sticky masthead */}
      <div
        className="sticky top-0 z-10"
        style={{ background: 'var(--digest-bg)', borderBottom: '0.5px solid var(--digest-divider)' }}
      >
        {/* Row 1: period label + controls */}
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <div>
            <span className="text-base font-semibold" style={{ fontFamily: "'Noto Serif SC', Georgia, serif", color: 'var(--digest-text)' }}>
              {isCurrent ? (periodKind === 'week' ? '本周' : '本月') : range.label}
            </span>
            {isCurrent && (
              <span className="ml-2 text-xs" style={{ color: 'var(--digest-text-tertiary)' }}>{range.label}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sort segmented */}
            <div className="inline-flex overflow-hidden rounded-md text-xs" style={{ border: '0.5px solid var(--digest-divider)' }}>
              {(['time', 'interest'] as const).map((s) => (
                <button key={s} type="button" onClick={() => onChangeSort(s)}
                  className="px-2.5 py-1 transition-colors"
                  style={s === sort
                    ? { background: 'var(--digest-accent-soft)', color: 'var(--digest-accent)', fontWeight: 500 }
                    : { color: 'var(--digest-text-tertiary)' }}>
                  {s === 'time' ? '时间' : '按兴趣'}
                </button>
              ))}
            </div>
            {/* Period segmented */}
            <div className="inline-flex overflow-hidden rounded-md text-xs" style={{ border: '0.5px solid var(--digest-divider)' }}>
              {(['day', 'week', 'month'] as const).map((k) => (
                <button key={k} type="button" onClick={() => onChangePeriod(k, anchorDate)}
                  className="px-2.5 py-1 transition-colors"
                  style={k === periodKind
                    ? { background: 'var(--digest-accent-soft)', color: 'var(--digest-accent)', fontWeight: 500 }
                    : { color: 'var(--digest-text-tertiary)' }}>
                  {k === 'day' ? '日' : k === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
            {/* Prev/next */}
            <button type="button" aria-label="上一期" onClick={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, -1))}
              style={{ color: 'var(--digest-text-tertiary)' }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="下一期" onClick={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, 1))}
              style={{ color: 'var(--digest-text-tertiary)' }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Row 2: tabs 未读 / 读过 / 隐藏 */}
        <div className="flex px-6" style={{ borderTop: '0.5px solid var(--digest-divider)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="mr-5 py-2.5 text-sm transition-colors"
              style={tab === key
                ? { borderBottom: '2px solid var(--digest-accent)', color: 'var(--digest-text)', fontWeight: 500 }
                : { borderBottom: '2px solid transparent', color: 'var(--digest-text-tertiary)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {q.isLoading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--digest-text-tertiary)' }}>加载中…</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="text-sm" style={{ color: 'var(--digest-text-tertiary)' }}>{emptyMessage}</p>
        </div>
      ) : (
        groups.map((g) => (
          <SourceSection
            key={g.feedId}
            group={g}
            action={cardAction}
            justHidden={tab === 'unread' ? (undo.hidden[g.feedId] ?? []) : []}
            onOpen={onOpenEntry}
            onAction={onAction}
            onUndo={unhide}
          />
        ))
      )}
      <div ref={sentinelRef} className="h-8" />
    </div>
  )
}
