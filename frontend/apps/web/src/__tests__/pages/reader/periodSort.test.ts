import { describe, it, expect } from 'vitest'
import { orderGroupsByAffinity } from '@/pages/reader/shared/components/PeriodView/orderGroupsByAffinity'

describe('orderGroupsByAffinity', () => {
  const g = (feedId: string) => ({ feedId }) as never
  it('time mode keeps original order', () => {
    expect(orderGroupsByAffinity([g('a'), g('b'), g('c')], 'time', {}).map((x) => x.feedId)).toEqual(['a', 'b', 'c'])
  })
  it('interest mode sorts by affinity desc, missing = 0, stable on ties', () => {
    const aff = { a: 1, c: 5 }
    expect(orderGroupsByAffinity([g('a'), g('b'), g('c')], 'interest', aff).map((x) => x.feedId)).toEqual(['c', 'a', 'b'])
  })
  it('negative scores sort last', () => {
    const aff = { a: -3, b: 2 }
    expect(orderGroupsByAffinity([g('a'), g('b'), g('c')], 'interest', aff).map((x) => x.feedId)).toEqual(['b', 'c', 'a'])
  })
  it('empty affinity map in interest mode preserves original order', () => {
    expect(orderGroupsByAffinity([g('a'), g('b'), g('c')], 'interest', {}).map((x) => x.feedId)).toEqual(['a', 'b', 'c'])
  })
  it('output cardinality equals input', () => {
    const aff = { a: 1, b: 2 }
    const input = [g('a'), g('b'), g('c')]
    expect(orderGroupsByAffinity(input, 'interest', aff).length).toBe(input.length)
  })
})
