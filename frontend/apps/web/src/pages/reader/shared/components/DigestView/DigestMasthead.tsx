import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn, Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import {
  buildRecentTodayBoardDates,
  type TodayBoardCalendarDay,
} from '../../todayBoard'
import type { DigestStats } from './digestHelpers'
import { formatReadingTime } from './digestHelpers'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface DigestMastheadProps {
  stats: DigestStats | null
  isLoading: boolean
  topicCount: number
}

function formatNavDate(dateStr: string, t: (k: string) => string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    const weekday = t(`weekdays.${WEEKDAY_KEYS[d.getDay()]}`)
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return `${weekday} · ${iso}`
  } catch {
    return dateStr
  }
}

export function DigestMasthead({
  stats,
  isLoading,
  topicCount,
}: DigestMastheadProps) {
  const { t } = useTranslation('digest')
  const unreadCount = stats ? Math.max(0, stats.total - stats.readCount) : 0
  const readPercent =
    stats && stats.total > 0 ? Math.round((stats.readCount / stats.total) * 100) : 0

  return (
    <header
      className="border-b px-12 pb-4 pt-8"
      style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
    >
      <div className="mx-auto max-w-[1600px]">
        <h1
          className="mb-3 font-serif text-5xl font-bold leading-none tracking-tight"
          style={{ fontFamily: "'Noto Serif SC', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)' }}
        >
          {t('masthead.headline')}
        </h1>

        <div
          className="flex flex-wrap items-center gap-5 border-t pt-2.5"
          style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
        >
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </>
          ) : (
            <>
              <StatItem value={stats?.total ?? 0} label={t('masthead.articles')} />
              <StatDivider />
              <StatItem value={stats?.sourceCount ?? 0} label={t('masthead.sources')} />
              <StatDivider />
              <StatItem value={topicCount} label={t('masthead.topics')} />
              <StatDivider />
              <StatItem
                value={formatReadingTime(stats?.estimatedMinutes ?? 0)}
                label={t('masthead.estimatedReading')}
              />

              <div className="ml-auto flex items-center gap-3">
                <span
                  className="whitespace-nowrap text-xs"
                  style={{ color: 'var(--digest-text-tertiary, #9A968C)', fontFeatureSettings: '"tnum"' }}
                >
                  {t('masthead.progress', {
                    unread: unreadCount,
                    total: stats?.total ?? 0,
                  })}
                </span>
                <div
                  className="h-1 w-36 overflow-hidden rounded-sm"
                  style={{ background: 'var(--digest-divider, #E5E0D2)' }}
                >
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{
                      width: `${readPercent}%`,
                      background: 'var(--digest-accent, #B8312F)',
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function StatItem({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span
        className="font-serif text-2xl font-bold leading-none"
        style={{
          fontFamily: "'Noto Serif SC', Georgia, serif",
          fontFeatureSettings: '"tnum"',
          color: 'var(--digest-text, #1A1A1A)',
        }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
        {label}
      </span>
    </div>
  )
}

function StatDivider() {
  return (
    <div
      className="h-5 w-px"
      style={{ background: 'var(--digest-divider, #E5E0D2)' }}
    />
  )
}

interface DigestTopNavProps {
  date: string
  todayDate: string
  onPrevDay: () => void
  onNextDay: () => void
  onAddFeed: () => void
  onDateChange?: (date: string) => void
  /** Anchor "today" for the calendar popover. Supports dev time-travel via useSystemTime. */
  todayAnchor?: Date
  /** Whether list-entry translation is actively fetching. Renders a subtle chip. */
  isTranslating?: boolean
  /** Called when the user clicks the search button or presses cmd+k. */
  onOpenSearch?: () => void
}

export function DigestTopNav({
  date,
  todayDate,
  onPrevDay,
  onNextDay,
  onAddFeed,
  onDateChange,
  todayAnchor,
  isTranslating = false,
  onOpenSearch,
}: DigestTopNavProps) {
  const { t } = useTranslation('digest')
  const isToday = date === todayDate

  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedDayRef = useRef<HTMLButtonElement>(null)
  const firstDayRef = useRef<HTMLButtonElement>(null)
  const recentDates = buildRecentTodayBoardDates(todayAnchor ?? new Date(), 28)

  useEffect(() => {
    if (!calendarOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && containerRef.current?.contains(e.target)) return
      setCalendarOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCalendarOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [calendarOpen])

  // Focus management: move focus into popover on open, return to trigger on close.
  useEffect(() => {
    if (calendarOpen) {
      const id = window.requestAnimationFrame(() => {
        ;(selectedDayRef.current ?? firstDayRef.current)?.focus()
      })
      return () => window.cancelAnimationFrame(id)
    }
  }, [calendarOpen])

  const handleSelectDate = (day: TodayBoardCalendarDay) => {
    setCalendarOpen(false)
    onDateChange?.(day.key)
    triggerRef.current?.focus()
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-[14px]"
      style={{
        background: 'color-mix(in srgb, var(--digest-bg, #FAF8F3) 88%, transparent)',
        borderColor: 'var(--digest-divider, #E5E0D2)',
      }}
    >
      <div className="flex items-center gap-5 px-12 py-3">
        {/* Logo */}
        <div
          className="shrink-0 whitespace-nowrap font-serif text-lg font-bold"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            letterSpacing: '-0.02em',
          }}
        >
          <span style={{ color: 'var(--digest-accent, #B8312F)' }}>◆ </span>
          Reader
        </div>

        {/* Date switcher */}
        <div ref={containerRef} className="relative ml-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onPrevDay}
            title={t('topnav.prevDay')}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[5px] transition-colors"
            style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = 'var(--digest-text-secondary, #5E5A52)'
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => onDateChange && setCalendarOpen((v) => !v)}
            disabled={!onDateChange}
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            aria-label={t('topnav.selectDate')}
            title={t('topnav.selectDate')}
            className={cn(
              'whitespace-nowrap rounded-[5px] border-0 px-2.5 py-1 text-[13px] font-medium transition-colors',
              onDateChange ? 'cursor-pointer' : 'cursor-default',
            )}
            style={{
              background: 'var(--digest-bg-hover, #F1EDE2)',
              color: 'var(--digest-text, #1A1A1A)',
              font: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (!onDateChange) return
              e.currentTarget.style.background = 'var(--digest-bg-active, #E8E2D4)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
          >
            {formatNavDate(date, t)}
          </button>
          <button
            type="button"
            onClick={onNextDay}
            disabled={isToday}
            title={t('topnav.nextDay')}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[5px] transition-colors disabled:cursor-default disabled:opacity-30"
            style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
            onMouseEnter={(e) => {
              if (isToday) return
              e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = 'var(--digest-text-secondary, #5E5A52)'
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          {calendarOpen && (
            <div
              ref={calendarRef}
              role="dialog"
              aria-label={t('topnav.selectDate')}
              className="absolute left-6 top-9 z-20 w-[260px] rounded-lg border p-3 shadow-lg"
              style={{
                background: 'var(--digest-bg-card, #FFFFFF)',
                borderColor: 'var(--digest-divider, #E5E0D2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-7 gap-1">
                {recentDates.map((day, index) => {
                  const isSelected = day.key === date
                  const dayLabel = format(day.date, 'd')
                  const weekdayLabel = t(`weekdays.${WEEKDAY_KEYS[day.date.getDay()]}`)
                  return (
                    <button
                      key={day.key}
                      ref={
                        isSelected
                          ? selectedDayRef
                          : index === 0
                            ? firstDayRef
                            : undefined
                      }
                      type="button"
                      onClick={() => handleSelectDate(day)}
                      aria-label={format(day.date, 'yyyy-MM-dd')}
                      aria-current={isSelected ? 'date' : undefined}
                      className={cn(
                        'flex h-10 w-full flex-col items-center justify-center rounded-md font-medium tabular-nums leading-tight transition-colors',
                        isSelected ? 'font-bold' : 'hover:opacity-70',
                      )}
                      style={
                        isSelected
                          ? {
                              background: 'var(--digest-text, #1A1A1A)',
                              color: 'var(--digest-bg, #FAF8F3)',
                            }
                          : { color: 'var(--digest-text-secondary, #5E5A52)' }
                      }
                    >
                      <span className="text-xs">{dayLabel}</span>
                      <span className="text-[10px] opacity-70">{weekdayLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Translation progress chip — visible only while batch translation is in flight */}
        {isTranslating && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: '#FEF3C7',
              color: '#92400E',
            }}
          >
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full"
              style={{ background: '#D97706' }}
            />
            {t('topnav.translating')}
          </div>
        )}

        {/* Search button */}
        <button
          onClick={onOpenSearch}
          title={t('topnav.search')}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
            e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = ''
            e.currentTarget.style.color = 'var(--digest-text-secondary, #5E5A52)'
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Add Feed — icon-only, matches search button weight */}
        <button
          onClick={onAddFeed}
          title={t('topnav.addFeed')}
          aria-label={t('topnav.addFeed')}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
            e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = ''
            e.currentTarget.style.color = 'var(--digest-text-secondary, #5E5A52)'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
