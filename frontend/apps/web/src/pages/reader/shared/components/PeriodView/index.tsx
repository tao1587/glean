import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Languages } from 'lucide-react'
import { useUpdateEntryState } from '@/hooks/useEntries'
import { useTabEntries, type PeriodTab } from '@/hooks/useRangeEntries'
import { useListEntriesTranslation } from '@/hooks/useListEntriesTranslation'
import { getPeriodRange, shiftPeriod, type PeriodKind } from '@/pages/reader/shared/periodRange'
import { buildTodayBoardEntries, buildTodayBoardGroups, type TodayBoardEntry } from '@/pages/reader/shared/todayBoard'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { DIGEST_LIGHT_VARS, DIGEST_DARK_VARS } from '../DigestView/digestTheme'
import { DigestTopNav } from '../DigestView/DigestMasthead'
import { AddFeedModal } from '../DigestView/AddFeedModal'
import { SearchModal } from '@/components/SearchModal'
import { SourceSection } from './SourceSection'
import { useHiddenUndo } from './useHiddenUndo'
import { orderGroupsByAffinity } from './orderGroupsByAffinity'
import { SparseSourceGrid } from './SparseSourceGrid'
import { computeBandCols, partitionGroupsByDensity } from './density'

// px-6 (1.5rem) left + right padding on the source sections.
const SECTION_PADDING_X = 48

const TABS: { key: PeriodTab; label: string }[] = [
  { key: 'unread', label: '未读' },
  { key: 'read', label: '读过' },
  { key: 'hidden', label: '隐藏' },
]

export function PeriodView({ periodKind, anchorDate, todayDateKey, todayAnchor, onChangePeriod, onOpenEntry, sort, affinity, onChangeSort }: {
  periodKind: PeriodKind
  anchorDate: string
  todayDateKey: string
  todayAnchor: Date
  onChangePeriod: (kind: 'day' | PeriodKind, anchor: string) => void
  onOpenEntry: (e: TodayBoardEntry) => void
  sort: 'time' | 'interest'
  affinity: Record<string, number>
  onChangeSort: (s: 'time' | 'interest') => void
}) {
  const { resolvedTheme } = useThemeStore()
  const digestVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  const [tab, setTab] = useState<PeriodTab>('unread')
  const [addFeedOpen, setAddFeedOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const range = useMemo(() => getPeriodRange(anchorDate, periodKind), [anchorDate, periodKind])
  const isCurrent = getPeriodRange(todayDateKey, periodKind).collected_after === range.collected_after

  const hasValidAnchor = !!anchorDate
  const q = useTabEntries({ period: periodKind, anchorDate, tab, enabled: hasValidAnchor })
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

  const scrollRef = useRef<HTMLDivElement>(null)

  const [paneWidth, setPaneWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setPaneWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bandCols = computeBandCols(paneWidth - SECTION_PADDING_X)
  const { bands, sparse } = useMemo(
    () => partitionGroupsByDensity(groups, bandCols),
    [groups, bandCols],
  )

  const sparseFeedIds = useMemo(() => new Set(sparse.map((g) => g.feedId)), [sparse])
  const sparseJustHidden =
    tab === 'unread'
      ? Object.entries(undo.hidden)
          .filter(([feedId]) => sparseFeedIds.has(feedId))
          .flatMap(([, list]) => list)
      : []

  const autoTranslate = useAuthStore((s) => s.user?.settings?.list_translation_auto_enabled ?? false)
  const [translateOn, setTranslateOn] = useState(autoTranslate)
  const { translations, isActive: translateActive, isLoading: translateLoading } =
    useListEntriesTranslation({ entries: q.entries, containerRef: scrollRef, enabled: translateOn })

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
      ref={scrollRef}
      className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto"
      style={
        {
          ...digestVars,
          background: 'var(--digest-bg)',
          color: 'var(--digest-text)',
          scrollbarGutter: 'stable',
        } as React.CSSProperties
      }
    >
      {/* Shared top nav — sticky, same as day view */}
      <DigestTopNav
        date={anchorDate}
        dateLabel={range.label}
        activeKind={periodKind}
        todayDate={todayDateKey}
        nextDisabled={isCurrent}
        onPrevDay={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, -1))}
        onNextDay={() => onChangePeriod(periodKind, shiftPeriod(anchorDate, periodKind, 1))}
        onChangePeriod={onChangePeriod}
        onDateChange={(dayKey) => onChangePeriod(periodKind, dayKey)}
        onAddFeed={() => setAddFeedOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        todayAnchor={todayAnchor}
        isTranslating={translateLoading}
      />

      {/* Secondary row: tabs (left) + sort + translate (right) — non-sticky, scrolls away */}
      <div
        className="flex items-center justify-between px-6 py-2.5"
        style={{ borderBottom: '0.5px solid var(--digest-divider)' }}
      >
        {/* 未读 / 读过 / 隐藏 tabs */}
        <div className="flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="mr-5 py-1 text-sm transition-colors"
              style={tab === key
                ? { borderBottom: '2px solid var(--digest-text)', color: 'var(--digest-text)', fontWeight: 500 }
                : { borderBottom: '2px solid transparent', color: 'var(--digest-text-tertiary)' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort segmented + translate toggle */}
        <div className="flex items-center gap-2">
          {/* Sort segmented */}
          <div className="inline-flex overflow-hidden rounded-md text-xs" style={{ border: '0.5px solid var(--digest-divider)' }}>
            {(['time', 'interest'] as const).map((s) => (
              <button key={s} type="button" onClick={() => onChangeSort(s)}
                className="px-2.5 py-1 transition-colors"
                style={s === sort
                  ? { background: 'var(--digest-bg-hover)', color: 'var(--digest-text)', fontWeight: 500 }
                  : { color: 'var(--digest-text-tertiary)' }}>
                {s === 'time' ? '时间' : '按兴趣'}
              </button>
            ))}
          </div>
          {/* Translate toggle */}
          <button
            type="button"
            aria-label="翻译"
            title="翻译"
            onClick={() => setTranslateOn((v) => !v)}
            style={{ color: translateActive ? 'var(--digest-text)' : 'var(--digest-text-tertiary)' }}
          >
            <Languages className={`h-4 w-4${translateLoading ? ' animate-pulse' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      {!hasValidAnchor || q.isLoading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--digest-text-tertiary)' }}>加载中…</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="text-sm" style={{ color: 'var(--digest-text-tertiary)' }}>{emptyMessage}</p>
        </div>
      ) : (
        <>
          {bands.map((g) => (
            <SourceSection
              key={g.feedId}
              group={g}
              action={cardAction}
              justHidden={tab === 'unread' ? (undo.hidden[g.feedId] ?? []) : []}
              onOpen={onOpenEntry}
              onAction={onAction}
              onUndo={unhide}
              translations={translations}
              translateActive={translateActive}
            />
          ))}
          <SparseSourceGrid
            groups={sparse}
            action={cardAction}
            justHidden={sparseJustHidden}
            showSeparator={bands.length > 0}
            onOpen={onOpenEntry}
            onAction={onAction}
            onUndo={unhide}
            translations={translations}
            translateActive={translateActive}
          />
        </>
      )}
      <div ref={sentinelRef} className="h-8" />

      {/* Modals */}
      <AddFeedModal open={addFeedOpen} onClose={() => setAddFeedOpen(false)} />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialDate={anchorDate}
        onSelectEntry={(entry) => {
          setSearchOpen(false)
          onOpenEntry(entry as TodayBoardEntry)
        }}
      />
    </div>
  )
}
