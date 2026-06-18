import { describe, it, expect } from 'vitest'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { getPeriodRange, shiftPeriod } from '@/pages/reader/shared/periodRange'

describe('periodRange', () => {
  it('week range is the Mon..next-Mon UTC instants', () => {
    const r = getPeriodRange('2026-06-17', 'week') // Wednesday
    const start = startOfWeek(parseISO('2026-06-17'), { weekStartsOn: 1 })
    const endInclusive = endOfWeek(parseISO('2026-06-17'), { weekStartsOn: 1 })
    const exclusiveEnd = new Date(endInclusive)
    exclusiveEnd.setHours(24, 0, 0, 0)
    expect(r.collected_after).toBe(start.toISOString())
    expect(r.collected_before).toBe(exclusiveEnd.toISOString())
  })
  it('month range is 1st..next 1st (exclusive)', () => {
    const r = getPeriodRange('2026-06-17', 'month')
    const start = startOfMonth(parseISO('2026-06-17'))
    const endInclusive = endOfMonth(parseISO('2026-06-17'))
    const exclusiveEnd = new Date(endInclusive)
    exclusiveEnd.setHours(24, 0, 0, 0)
    expect(r.collected_after).toBe(start.toISOString())
    expect(r.collected_before).toBe(exclusiveEnd.toISOString())
  })
  it('shiftPeriod moves by one week/month', () => {
    expect(shiftPeriod('2026-06-17', 'week', -1)).toBe('2026-06-10')
    expect(shiftPeriod('2026-06-17', 'month', 1)).toBe('2026-07-17')
  })
})
