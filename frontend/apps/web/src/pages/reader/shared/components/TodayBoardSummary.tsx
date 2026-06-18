import { useMemo, useState } from 'react'
import { format, parseISO, startOfWeek } from 'date-fns'
import { useTranslation } from '@glean/i18n'
import { useDailySummary, useWeeklySummary } from '@/hooks/useSummary'
import { SummaryCard } from './SummaryCard'

interface TodayBoardSummaryProps<E extends { id: string; title: string }> {
  date: string // selected date key, YYYY-MM-DD
  entries: E[]
  enabled: boolean
  onSelectEntry: (entry: E) => void
}

export function TodayBoardSummary<E extends { id: string; title: string }>({
  date,
  entries,
  enabled,
  onSelectEntry,
}: TodayBoardSummaryProps<E>) {
  const { t } = useTranslation('reader')
  const weekStart = useMemo(
    () => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [date]
  )
  const daily = useDailySummary({ date, enabled })
  const weekly = useWeeklySummary({ weekStart, enabled })
  const [showWeekly, setShowWeekly] = useState(false)
  const entriesById = useMemo(
    () => new Map(entries.map((e) => [e.id, e] as const)),
    [entries]
  )
  if (!enabled) return null

  const weeklyAvailable = weekly.currentCount > 0
  const dailyFooter = (
    <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
      <span>
        {daily.summary?.generated_at
          ? t('todayBoard.summary.auto', { defaultValue: '自动生成' }) +
            ' · ' +
            new Date(daily.summary.generated_at).toLocaleString()
          : ''}
      </span>
      {weeklyAvailable ? (
        <button
          type="button"
          onClick={() => setShowWeekly((v) => !v)}
          className="hover:text-primary font-medium underline-offset-2 hover:underline"
        >
          {t('todayBoard.summary.weekly', { defaultValue: '本周综述' })}
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="mx-4 mb-3 space-y-2" data-testid="today-board-summary">
      <SummaryCard
        summary={daily.summary}
        state={daily.state}
        isStale={daily.isStale}
        entriesById={entriesById}
        onSelectEntry={onSelectEntry}
        onRetry={daily.retry}
        onGenerate={daily.generate}
        footer={dailyFooter}
      />
      {showWeekly && weeklyAvailable ? (
        <SummaryCard
          summary={weekly.summary}
          state={weekly.state}
          isStale={weekly.isStale}
          entriesById={entriesById}
          onSelectEntry={onSelectEntry}
          onRetry={weekly.retry}
          onGenerate={weekly.generate}
        />
      ) : null}
    </div>
  )
}
