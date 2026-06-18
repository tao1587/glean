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
})
