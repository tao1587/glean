import { describe, it, expect } from 'vitest'
import { getPeriodRange, shiftPeriod } from '@/pages/reader/shared/periodRange'

describe('periodRange', () => {
  it('week range is Mon..next Mon (exclusive) for an anchor', () => {
    const r = getPeriodRange('2026-06-17', 'week') // Wed
    expect(r.collected_after).toBe('2026-06-15T00:00:00.000')
    expect(r.collected_before).toBe('2026-06-22T00:00:00.000')
  })
  it('month range is 1st..next 1st (exclusive)', () => {
    const r = getPeriodRange('2026-06-17', 'month')
    expect(r.collected_after).toBe('2026-06-01T00:00:00.000')
    expect(r.collected_before).toBe('2026-07-01T00:00:00.000')
  })
  it('shiftPeriod moves by one week/month', () => {
    expect(shiftPeriod('2026-06-17', 'week', -1)).toBe('2026-06-10')
    expect(shiftPeriod('2026-06-17', 'month', 1)).toBe('2026-07-17')
  })
})
