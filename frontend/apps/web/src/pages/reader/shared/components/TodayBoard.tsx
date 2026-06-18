import { format } from 'date-fns'
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Languages,
  Loader2,
} from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { cn } from '@glean/ui'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { stripHtmlTags } from '../../../../lib/html'
import { TodayBoardSummary } from './TodayBoardSummary'
import {
  buildTodayBoardGroups,
  truncateTodayBoardSummary,
  type TodayBoardCalendarDay,
  type TodayBoardEntry,
  type TodayBoardFeedGroup,
} from '../todayBoard'

interface TodayBoardProps {
  entries: TodayBoardEntry[]
  selectedEntryId: string | null
  selectedDateKey?: string
  todayDateKey?: string
  recentDates?: TodayBoardCalendarDay[]
  onSelectDate?: (dateKey: string) => void
  onSelectFeed?: (feedId: string) => void
  onSelectEntry: (entry: TodayBoardEntry) => void
  onCloseDetail: () => void
  onMarkAllReadFeed?: (feedId: string) => Promise<void> | void
  listWidthPx?: number
  isLoading?: boolean
  isTranslationActive?: boolean
  isTranslationLoading?: boolean
  translationLoadingPhase?: 'idle' | 'start' | 'settled'
  translatedTexts?: Record<string, { title?: string; summary?: string }>
  onToggleTranslation?: () => void
  renderDetail?: (entry: TodayBoardEntry) => ReactNode
  aiEnabled?: boolean
}

export function TodayBoard({
  entries,
  selectedEntryId,
  selectedDateKey,
  todayDateKey,
  recentDates = [],
  onSelectDate,
  onSelectFeed,
  onSelectEntry,
  onCloseDetail,
  onMarkAllReadFeed,
  listWidthPx = 360,
  isLoading = false,
  isTranslationActive = false,
  isTranslationLoading = false,
  translationLoadingPhase = 'idle',
  translatedTexts = {},
  onToggleTranslation,
  renderDetail,
  aiEnabled = false,
}: TodayBoardProps) {
  const { t } = useTranslation('reader')
  const [markingFeedId, setMarkingFeedId] = useState<string | null>(null)

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null
  const isDateSelectorEnabled = !!selectedDateKey && !!todayDateKey && !!onSelectDate
  const selectedCalendarDay =
    recentDates.find((day) => day.key === selectedDateKey) ?? recentDates[0] ?? null
  const selectedDateLabel = selectedCalendarDay
    ? selectedCalendarDay.isToday
      ? t('todayBoard.today')
      : format(selectedCalendarDay.date, 'MMM d')
    : selectedDateKey
      ? selectedDateKey
      : ''
  const isTodaySelected = !isDateSelectorEnabled || selectedDateKey === todayDateKey
  const emptyText = isTodaySelected
    ? t('todayBoard.empty')
    : t('todayBoard.historicalEmpty', { date: selectedDateLabel })
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [expandedFeedIds, setExpandedFeedIds] = useState<Set<string>>(() => new Set())
  const selectedEntryRefs = useRef(new Map<string, HTMLButtonElement>())
  const listPanelRef = useRef<HTMLDivElement>(null)
  const calendarRootRef = useRef<HTMLDivElement>(null)
  const cardBoardScrollTopRef = useRef(0)
  const previousSelectedEntryIdRef = useRef<string | null>(null)
  const lastScrolledEntryIdRef = useRef<string | null>(null)
  const groups = useMemo(
    () =>
      buildTodayBoardGroups(entries, {
        expandedFeedIds,
        selectedEntryId,
      }),
    [entries, expandedFeedIds, selectedEntryId]
  )

  useEffect(() => {
    if (!selectedEntryId || !selectedEntry) {
      lastScrolledEntryIdRef.current = null
      return
    }
    if (lastScrolledEntryIdRef.current === selectedEntryId) return
    const selectedEntryNode = selectedEntryRefs.current.get(selectedEntryId)
    if (!selectedEntryNode) return

    lastScrolledEntryIdRef.current = selectedEntryId
    selectedEntryNode.scrollIntoView({ block: 'nearest' })
  }, [selectedEntryId, selectedEntry])

  useLayoutEffect(() => {
    const previousSelectedEntryId = previousSelectedEntryIdRef.current
    if (previousSelectedEntryId && !selectedEntryId && listPanelRef.current) {
      listPanelRef.current.scrollTop = cardBoardScrollTopRef.current
    }
    previousSelectedEntryIdRef.current = selectedEntryId
  }, [selectedEntryId])

  useEffect(() => {
    if (!isCalendarOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && calendarRootRef.current?.contains(target)) return
      setIsCalendarOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCalendarOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCalendarOpen])

  const toggleFeed = (feedId: string) => {
    setExpandedFeedIds((current) => {
      const next = new Set(current)
      if (next.has(feedId)) {
        next.delete(feedId)
      } else {
        next.add(feedId)
      }
      return next
    })
  }

  const handleMarkAllRead = async (feedId: string) => {
    if (!onMarkAllReadFeed) return
    setMarkingFeedId(feedId)
    try {
      await onMarkAllReadFeed(feedId)
    } finally {
      setMarkingFeedId(null)
    }
  }

  const handleSelectEntry = (entry: TodayBoardEntry) => {
    if (!selectedEntryId) {
      cardBoardScrollTopRef.current = listPanelRef.current?.scrollTop ?? 0
    }
    onSelectEntry(entry)
  }
  const handleSelectDate = (dateKey: string) => {
    setIsCalendarOpen(false)
    onSelectDate?.(dateKey)
  }
  const listPanelStyle: CSSProperties = selectedEntry
    ? { width: `${listWidthPx}px`, minWidth: 280, maxWidth: 500, scrollbarGutter: 'stable' }
    : { scrollbarGutter: 'stable' }

  return (
    <div
      className="flex h-full min-w-0 flex-1 bg-[linear-gradient(180deg,rgba(250,248,242,0.9),rgba(255,255,255,0.96))]"
      data-testid="today-board-layout"
    >
      <div
        ref={listPanelRef}
        className={cn(
          'min-w-0 overflow-y-auto transition-[width,max-width] duration-200',
          selectedEntry ? 'shrink-0' : 'w-full flex-1'
        )}
        style={listPanelStyle}
        data-testid="today-board-blank-space"
        onClick={() => {
          setIsCalendarOpen(false)
          onCloseDetail()
        }}
      >
        <div className="border-border/60 sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-[linear-gradient(180deg,rgba(255,251,245,0.96),rgba(255,255,255,0.92))] px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
              {t('todayBoard.title')}
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-1">
            {isDateSelectorEnabled ? (
              <div ref={calendarRootRef} onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((value) => !value)}
                  title={t('todayBoard.dateSelectorLabel')}
                  aria-label={t('todayBoard.dateSelectorLabel')}
                  aria-expanded={isCalendarOpen}
                  className={cn(
                    'hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isTodaySelected ? 'text-muted-foreground' : 'text-primary'
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
                {isCalendarOpen ? (
                  <TodayBoardCalendarPopover
                    selectedDateKey={selectedDateKey}
                    recentDates={recentDates}
                    selectedDateLabel={selectedDateLabel}
                    onSelectDate={handleSelectDate}
                  />
                ) : null}
              </div>
            ) : null}
            {onToggleTranslation ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleTranslation()
                }}
                title={
                  isTranslationLoading
                    ? t('translation.translating')
                    : isTranslationActive
                      ? t('translation.hideTranslation')
                      : t('translation.translate')
                }
                aria-label={
                  isTranslationLoading
                    ? t('translation.translating')
                    : isTranslationActive
                      ? t('translation.hideTranslation')
                      : t('translation.translate')
                }
                className={cn(
                  'list-translation-toggle hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isTranslationActive ? 'text-primary' : 'text-muted-foreground',
                  isTranslationLoading && 'list-translation-toggle-loading',
                  translationLoadingPhase === 'start' && 'list-translation-toggle-loading-start',
                  translationLoadingPhase === 'settled' && 'list-translation-toggle-loading-settled'
                )}
              >
                <span className="list-translation-toggle__icon-wrap">
                  <span className="list-translation-toggle__ring" aria-hidden="true" />
                  <Languages className="list-translation-toggle__icon h-4 w-4" />
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {aiEnabled && selectedDateKey ? (
          <TodayBoardSummary
            date={selectedDateKey}
            entries={entries}
            enabled={aiEnabled}
            onSelectEntry={handleSelectEntry}
          />
        ) : null}

        {isLoading ? (
          <TodayBoardLoadingState />
        ) : entries.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Inbox className="text-muted-foreground h-8 w-8" />
            </div>
            <p className="text-muted-foreground text-sm">{emptyText}</p>
          </div>
        ) : (
          <TodayBoardEntries
            groups={groups}
            selectedEntryId={selectedEntryId}
            selectedEntryRefs={selectedEntryRefs}
            isDetailOpen={!!selectedEntry}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={handleSelectEntry}
            onSelectFeed={onSelectFeed}
            onToggleFeed={toggleFeed}
            markingFeedId={markingFeedId}
            onMarkAllRead={onMarkAllReadFeed ? handleMarkAllRead : undefined}
          />
        )}
      </div>

      {selectedEntry && renderDetail ? (
        <aside
          className="border-border bg-background flex min-w-0 flex-1 flex-col border-l"
          data-testid="today-board-detail-pane"
        >
          {renderDetail(selectedEntry)}
        </aside>
      ) : null}
    </div>
  )
}

function TodayBoardLoadingState() {
  return (
    <div className="space-y-3 p-3" data-testid="today-board-loading">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="border-border/70 overflow-hidden rounded-lg border bg-white p-3"
        >
          <div className="bg-muted h-4 w-2/3 rounded" />
          <div className="bg-muted mt-3 h-3 w-full rounded" />
          <div className="bg-muted mt-2 h-3 w-5/6 rounded" />
          <div className="bg-muted mt-4 h-3 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}

function TodayBoardCalendarPopover({
  selectedDateKey,
  recentDates,
  selectedDateLabel,
  onSelectDate,
}: {
  selectedDateKey: string
  recentDates: TodayBoardCalendarDay[]
  selectedDateLabel: string
  onSelectDate: (dateKey: string) => void
}) {
  const { t } = useTranslation('reader')
  const selectedIndex = recentDates.findIndex((day) => day.key === selectedDateKey)
  const previousDay = selectedIndex >= 0 ? recentDates[selectedIndex + 1] : undefined
  const nextDay = selectedIndex > 0 ? recentDates[selectedIndex - 1] : undefined

  return (
    <div
      className="border-border bg-background absolute top-10 right-0 z-20 w-[280px] rounded-lg border p-3 text-left shadow-lg"
      aria-label={t('todayBoard.dateSelectorLabel')}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-800">{selectedDateLabel}</div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-label={t('todayBoard.previousDay')}
          disabled={!previousDay}
          onClick={() => previousDay && onSelectDate(previousDay.key)}
          className="border-border hover:bg-muted disabled:text-muted-foreground/50 flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium disabled:pointer-events-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('todayBoard.previousDay')}
        </button>
        <button
          type="button"
          aria-label={t('todayBoard.nextDay')}
          disabled={!nextDay}
          onClick={() => nextDay && onSelectDate(nextDay.key)}
          className="border-border hover:bg-muted disabled:text-muted-foreground/50 flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium disabled:pointer-events-none"
        >
          {t('todayBoard.nextDay')}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {recentDates.map((day) => {
          const isSelected = day.key === selectedDateKey
          const label = format(day.date, 'd')
          const ariaLabel = day.isToday ? t('todayBoard.today') : format(day.date, 'MMM d')

          return (
            <button
              key={day.key}
              type="button"
              aria-label={ariaLabel}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(day.key)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-stone-600 hover:bg-stone-100'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TodayBoardEntries({
  groups,
  selectedEntryId,
  selectedEntryRefs,
  isDetailOpen,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onSelectFeed,
  onToggleFeed,
  markingFeedId,
  onMarkAllRead,
}: {
  groups: TodayBoardFeedGroup[]
  selectedEntryId: string | null
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isDetailOpen: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onSelectFeed?: (feedId: string) => void
  onToggleFeed: (feedId: string) => void
  markingFeedId: string | null
  onMarkAllRead?: (feedId: string) => void
}) {
  return isDetailOpen ? (
    <div data-testid="today-board-detail-list" className="space-y-3 p-3">
      {groups.map((group) => (
        <FeedListGroup
          key={group.feedId}
          group={group}
          selectedEntryId={selectedEntryId}
          selectedEntryRefs={selectedEntryRefs}
          isTranslationActive={isTranslationActive}
          translatedTexts={translatedTexts}
          onSelectEntry={onSelectEntry}
          onToggleFeed={onToggleFeed}
          markingFeedId={markingFeedId}
          onMarkAllRead={onMarkAllRead}
        />
      ))}
    </div>
  ) : (
    <div
      data-testid="today-board-card-board"
      className="columns-1 gap-3 p-3 md:columns-2 xl:columns-3"
    >
      {groups.map((group) => (
        <FeedCardGroup
          key={group.feedId}
          group={group}
          selectedEntryId={selectedEntryId}
          isTranslationActive={isTranslationActive}
          translatedTexts={translatedTexts}
          onSelectEntry={onSelectEntry}
          onSelectFeed={onSelectFeed}
          onToggleFeed={onToggleFeed}
          markingFeedId={markingFeedId}
          onMarkAllRead={onMarkAllRead}
        />
      ))}
    </div>
  )
}

function FeedCardGroup({
  group,
  selectedEntryId,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onSelectFeed,
  onToggleFeed,
  markingFeedId,
  onMarkAllRead,
}: {
  group: TodayBoardFeedGroup
  selectedEntryId: string | null
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onSelectFeed?: (feedId: string) => void
  onToggleFeed: (feedId: string) => void
  markingFeedId: string | null
  onMarkAllRead?: (feedId: string) => void
}) {
  const { t } = useTranslation('reader')
  const hiddenCount = group.totalCount - group.visibleEntries.length

  return (
    <section className="border-border/70 mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-lg border bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <FeedGroupHeader
        group={group}
        onSelectFeed={onSelectFeed}
        markingFeedId={markingFeedId}
        onMarkAllRead={onMarkAllRead}
      />
      <div className="space-y-2 p-2">
        {group.visibleEntries.map((entry) => (
          <TodayBoardEntryCard
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedEntryId}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={onSelectEntry}
          />
        ))}
        {group.isCollapsible ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleFeed(group.feedId)
            }}
            className="text-primary hover:text-primary/80 block w-full py-1 text-center text-[13px] font-medium transition-colors"
          >
            {group.isExpanded
              ? t('todayBoard.collapse')
              : `${t('todayBoard.expand')}${hiddenCount > 0 ? ` (+${hiddenCount})` : ''}`}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function FeedListGroup({
  group,
  selectedEntryId,
  selectedEntryRefs,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onToggleFeed,
  markingFeedId,
  onMarkAllRead,
}: {
  group: TodayBoardFeedGroup
  selectedEntryId: string | null
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onToggleFeed: (feedId: string) => void
  markingFeedId: string | null
  onMarkAllRead?: (feedId: string) => void
}) {
  const { t } = useTranslation('reader')
  const hiddenCount = group.totalCount - group.visibleEntries.length

  return (
    <section className="border-border/60 border-b pb-2 last:border-b-0">
      <FeedGroupHeader
        group={group}
        compact
        markingFeedId={markingFeedId}
        onMarkAllRead={onMarkAllRead}
      />
      <div className="divide-border/50 divide-y">
        {group.visibleEntries.map((entry) => (
          <TodayBoardEntryListItem
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedEntryId}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={onSelectEntry}
            selectedEntryRefs={selectedEntryRefs}
          />
        ))}
      </div>
      {group.isCollapsible ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleFeed(group.feedId)
          }}
          className="text-primary hover:text-primary/80 block w-full py-2 text-center text-[13px] font-medium transition-colors"
        >
          {group.isExpanded
            ? t('todayBoard.collapse')
            : `${t('todayBoard.expand')}${hiddenCount > 0 ? ` (+${hiddenCount})` : ''}`}
        </button>
      ) : null}
    </section>
  )
}

function FeedGroupHeader({
  group,
  compact = false,
  onSelectFeed,
  markingFeedId,
  onMarkAllRead,
}: {
  group: TodayBoardFeedGroup
  compact?: boolean
  onSelectFeed?: (feedId: string) => void
  markingFeedId: string | null
  onMarkAllRead?: (feedId: string) => void
}) {
  const { t } = useTranslation('reader')
  const isMarking = markingFeedId === group.feedId
  const canMarkRead = group.unreadCount > 0 && !!onMarkAllRead

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 bg-stone-100/80 px-3',
        compact ? 'py-2' : 'py-2.5'
      )}
    >
      <div className="min-w-0">
        {onSelectFeed && !compact ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelectFeed(group.feedId)
            }}
            className="hover:text-primary block max-w-full truncate text-left text-[13px] font-semibold text-stone-700 transition-colors"
          >
            {group.feedTitle || t('todayBoard.unknownFeed')}
          </button>
        ) : (
          <div className="truncate text-[13px] font-semibold text-stone-700">
            {group.feedTitle || t('todayBoard.unknownFeed')}
          </div>
        )}
        {group.feedDescription ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
            {group.feedDescription}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-xs font-normal text-stone-500 tabular-nums">{group.totalCount}</div>
        {canMarkRead && (
          <button
            type="button"
            disabled={isMarking}
            onClick={(event) => {
              event.stopPropagation()
              onMarkAllRead(group.feedId)
            }}
            title={t('entries.markAll')}
            className="hover:text-primary flex h-5 w-5 items-center justify-center rounded text-stone-400 transition-colors disabled:opacity-50"
          >
            {isMarking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function TodayBoardEntryCard({
  entry,
  isSelected,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
}: {
  entry: TodayBoardEntry
  isSelected: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
}) {
  const translated = isTranslationActive ? translatedTexts[entry.id] : undefined
  const summary = truncateTodayBoardSummary(
    translated?.summary ?? stripHtmlTags(entry.summary || '')
  )

  return (
    <button
      type="button"
      data-entry-id={entry.id}
      onClick={(event) => {
        event.stopPropagation()
        onSelectEntry(entry)
      }}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200',
        'shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]',
        entry.is_read
          ? 'border-stone-200 bg-stone-100/85 text-stone-500'
          : 'border-amber-200/70 bg-white text-slate-900',
        isSelected && 'ring-primary/20 border-primary/40 ring-2'
      )}
    >
      <EntryContent entry={entry} translatedTitle={translated?.title} summary={summary} />
    </button>
  )
}

function TodayBoardEntryListItem({
  entry,
  isSelected,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  selectedEntryRefs,
}: {
  entry: TodayBoardEntry
  isSelected: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
}) {
  const translated = isTranslationActive ? translatedTexts[entry.id] : undefined
  const summary = truncateTodayBoardSummary(
    translated?.summary ?? stripHtmlTags(entry.summary || '')
  )

  return (
    <button
      type="button"
      data-entry-id={entry.id}
      ref={(node) => {
        if (node) {
          selectedEntryRefs.current.set(entry.id, node)
        } else {
          selectedEntryRefs.current.delete(entry.id)
        }
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelectEntry(entry)
      }}
      className={cn(
        'w-full px-3 py-2.5 text-left transition-colors',
        entry.is_read ? 'text-stone-500' : 'text-slate-900',
        isSelected && 'bg-emerald-50'
      )}
    >
      <EntryContent entry={entry} translatedTitle={translated?.title} summary={summary} compact />
    </button>
  )
}

function EntryContent({
  entry,
  translatedTitle,
  summary,
  compact = false,
}: {
  entry: TodayBoardEntry
  translatedTitle?: string
  summary: string
  compact?: boolean
}) {
  return (
    <div>
      <h3
        className={cn(
          compact ? 'text-[13px]' : 'text-sm sm:text-[15px]',
          'leading-6',
          entry.is_read ? 'font-medium text-stone-500' : 'font-semibold text-slate-900'
        )}
      >
        {translatedTitle ?? entry.title}
      </h3>

      {summary ? (
        <p
          className={cn(
            'mt-1 line-clamp-2 text-sm leading-6',
            entry.is_read ? 'text-stone-400' : 'text-slate-600'
          )}
        >
          {summary}
        </p>
      ) : null}

      <div
        className={cn(
          'mt-2 inline-flex items-center gap-1 text-xs tabular-nums',
          entry.is_read ? 'text-stone-400' : 'text-stone-500'
        )}
      >
        <Clock className="h-3 w-3" />
        {format(entry.effective_timestamp, 'HH:mm')}
      </div>
    </div>
  )
}
