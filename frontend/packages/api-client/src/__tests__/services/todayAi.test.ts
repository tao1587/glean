import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodayAIService } from '../../services/todayAi'
import { createMockClient } from '../helpers'

describe('TodayAIService', () => {
  let service: TodayAIService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new TodayAIService(mockClient)
  })

  it('should look up a daily summary', async () => {
    const response = {
      summary: null,
      current_set_hash: 'abc',
      current_count: 3,
      is_stale: false,
    }
    vi.mocked(mockClient.post).mockResolvedValue(response)

    const result = await service.lookupSummary('day', '2026-06-13')

    expect(mockClient.post).toHaveBeenCalledWith('/today/ai/summary:lookup', {
      period: 'day',
      date: '2026-06-13',
    })
    expect(result).toEqual(response)
  })

  it('should generate a weekly summary', async () => {
    const response = {
      status: 'queued',
      summary_id: 's1',
      source_set_hash: 'hash',
      source_count: 7,
    }
    vi.mocked(mockClient.post).mockResolvedValue(response)

    const result = await service.generateSummary('week', '2026-06-13')

    expect(mockClient.post).toHaveBeenCalledWith('/today/ai/summary:generate', {
      period: 'week',
      date: '2026-06-13',
    })
    expect(result).toEqual(response)
  })

  it('should retry a daily summary', async () => {
    const response = {
      period: 'day',
      period_start: '2026-06-13',
      period_end: '2026-06-13',
      status: 'pending',
      title: null,
      summary: null,
      topics: [],
      highlights: [],
      recommended_entry_ids: [],
      model: null,
      generated_at: null,
      source_set_hash: null,
      source_count: null,
      error_code: null,
      error_message: null,
    }
    vi.mocked(mockClient.post).mockResolvedValue(response)

    const result = await service.retrySummary('day', '2026-06-13')

    expect(mockClient.post).toHaveBeenCalledWith('/today/ai/summary:retry', {
      period: 'day',
      date: '2026-06-13',
    })
    expect(result).toEqual(response)
  })
})
