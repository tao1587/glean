import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
  format,
  parseISO,
  isValid,
} from 'date-fns'

export type PeriodKind = 'week' | 'month'

/**
 * Empty/invalid anchors (e.g. before server time has loaded, or a deep-link to
 * ?view=week without a date) fall back to today so the date math never produces
 * an Invalid Date (which would throw in toISOString).
 */
function resolveAnchor(anchorDateKey: string): Date {
  const parsed = parseISO(anchorDateKey)
  return isValid(parsed) ? parsed : new Date()
}

export function getPeriodRange(anchorDateKey: string, period: PeriodKind) {
  const anchor = resolveAnchor(anchorDateKey)
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
    collected_after: start.toISOString(),
    collected_before: exclusiveEnd.toISOString(),
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
  const anchor = resolveAnchor(anchorDateKey)
  const next = period === 'week' ? addWeeks(anchor, delta) : addMonths(anchor, delta)
  return format(next, 'yyyy-MM-dd')
}
