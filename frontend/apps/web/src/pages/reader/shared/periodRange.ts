import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
  format,
  parseISO,
} from 'date-fns'

export type PeriodKind = 'week' | 'month'

function localStartIso(d: Date): string {
  return `${format(d, 'yyyy-MM-dd')}T00:00:00.000`
}

export function getPeriodRange(anchorDateKey: string, period: PeriodKind) {
  const anchor = parseISO(anchorDateKey)
  const start =
    period === 'week'
      ? startOfWeek(anchor, { weekStartsOn: 1 })
      : startOfMonth(anchor)
  const endInclusive =
    period === 'week'
      ? endOfWeek(anchor, { weekStartsOn: 1 })
      : endOfMonth(anchor)
  const exclusiveEnd = new Date(endInclusive)
  exclusiveEnd.setHours(24, 0, 0, 0)
  return {
    collected_after: localStartIso(start),
    collected_before: localStartIso(exclusiveEnd),
    label:
      period === 'week'
        ? `${format(start, 'M月d日')} – ${format(endInclusive, 'M月d日')}`
        : format(anchor, 'yyyy年M月'),
  }
}

export function shiftPeriod(
  anchorDateKey: string,
  period: PeriodKind,
  delta: number
): string {
  const anchor = parseISO(anchorDateKey)
  const next = period === 'week' ? addWeeks(anchor, delta) : addMonths(anchor, delta)
  return format(next, 'yyyy-MM-dd')
}
