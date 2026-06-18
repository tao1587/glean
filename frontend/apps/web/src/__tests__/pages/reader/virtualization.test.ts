import { describe, it, expect } from 'vitest'
import { calculateVirtualWindow } from '@/pages/reader/shared/ReaderCore'

describe('calculateVirtualWindow', () => {
  it('clamps start index when scrollTop is far beyond available items', () => {
    const result = calculateVirtualWindow({
      totalCount: 200,
      scrollTop: 120000,
      viewportHeight: 720,
      rowHeight: 144,
      overscan: 8,
    })

    expect(result.startIndex).toBeGreaterThanOrEqual(0)
    expect(result.startIndex).toBeLessThan(200)
    expect(result.endIndex).toBeGreaterThan(result.startIndex)
    expect(result.endIndex).toBeLessThanOrEqual(200)
  })
})
