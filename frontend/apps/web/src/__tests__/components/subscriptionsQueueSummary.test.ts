import { describe, expect, it } from 'vitest'

import { formatFeedQueueSummary } from '../../components/tabs/feedQueueSummary'

describe('formatFeedQueueSummary', () => {
  it('returns running-first queue text', () => {
    expect(formatFeedQueueSummary(5, 145)).toBe('5 个进行中 · 145 个排队中')
  })

  it('supports zero counts without reordering', () => {
    expect(formatFeedQueueSummary(0, 0)).toBe('0 个进行中 · 0 个排队中')
  })
})
