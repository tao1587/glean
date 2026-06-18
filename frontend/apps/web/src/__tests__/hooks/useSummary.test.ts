import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@glean/api-client', () => ({
  todayAIService: {
    lookupSummary: vi.fn(),
    generateSummary: vi.fn(),
    retrySummary: vi.fn(),
  },
}))

import { todayAIService } from '@glean/api-client'
import { useDailySummary, useWeeklySummary } from '@/hooks/useSummary'
import type { SummaryLookupResponse, SummaryView } from '@glean/types'

// ---------- helpers ----------

function makeSummary(status: SummaryView['status']): SummaryView {
  return {
    period: 'day',
    period_start: '2026-06-13',
    period_end: '2026-06-13',
    status,
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
}

function makeLookup(overrides: Partial<SummaryLookupResponse> = {}): SummaryLookupResponse {
  return {
    summary: null,
    current_set_hash: null,
    current_count: 0,
    is_stale: false,
    ...overrides,
  }
}

// ---------- tests ----------

describe('useDailySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disabled → no fetch, state remains loading', async () => {
    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: false }),
    )

    // Give a tick for any erroneous effects to fire
    await new Promise((r) => setTimeout(r, 0))

    expect(todayAIService.lookupSummary).not.toHaveBeenCalled()
    expect(result.current.state).toBe('loading')
  })

  it('enabled + lookup returns summary status done → state ready, hasSummary true', async () => {
    const doneSummary = makeSummary('done')
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: doneSummary }),
    )

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.hasSummary).toBe(true)
    expect(result.current.summary).toEqual(doneSummary)
    expect(todayAIService.lookupSummary).toHaveBeenCalledWith('day', '2026-06-13')
  })

  it('lookup returns summary null + current_count 0 → state empty', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: null, current_count: 0 }),
    )

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('empty'))
    expect(result.current.hasSummary).toBe(false)
  })

  it('lookup returns summary null + current_count 3 → state idle, currentCount 3', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: null, current_count: 3 }),
    )

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.currentCount).toBe(3)
  })

  it('lookup returns summary status failed → state failed', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('failed') }),
    )

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('failed'))
  })

  it('generate() calls generateSummary then re-lookups with correct period+date', async () => {
    // Initial lookup → empty
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: null, current_count: 0 }),
    )
    vi.mocked(todayAIService.generateSummary).mockResolvedValue({
      status: 'queued',
      summary_id: 'sid',
      source_set_hash: 'h',
      source_count: 3,
    })

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('empty'))

    // After generate, second lookupSummary returns generating
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('pending') }),
    )

    await act(async () => {
      await result.current.generate()
    })

    expect(todayAIService.generateSummary).toHaveBeenCalledWith('day', '2026-06-13')
    // lookupSummary called at least twice (initial + post-generate)
    expect(todayAIService.lookupSummary).toHaveBeenCalledTimes(2)
    expect(todayAIService.lookupSummary).toHaveBeenLastCalledWith('day', '2026-06-13')
  })

  it('retry() calls retrySummary then re-lookups', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('failed') }),
    )
    vi.mocked(todayAIService.retrySummary).mockResolvedValue(makeSummary('pending'))

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('failed'))

    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('pending') }),
    )

    await act(async () => {
      await result.current.retry()
    })

    expect(todayAIService.retrySummary).toHaveBeenCalledWith('day', '2026-06-13')
    expect(todayAIService.lookupSummary).toHaveBeenCalledTimes(2)
  })

  it('is_stale flag is surfaced from lookup', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('done'), is_stale: true }),
    )

    const { result } = renderHook(() =>
      useDailySummary({ date: '2026-06-13', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.isStale).toBe(true)
  })
})

describe('useWeeklySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes period week to lookupSummary', async () => {
    vi.mocked(todayAIService.lookupSummary).mockResolvedValue(
      makeLookup({ summary: makeSummary('done') }),
    )

    const { result } = renderHook(() =>
      useWeeklySummary({ weekStart: '2026-06-08', enabled: true }),
    )

    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(todayAIService.lookupSummary).toHaveBeenCalledWith('week', '2026-06-08')
  })

  it('disabled → no fetch', async () => {
    const { result } = renderHook(() =>
      useWeeklySummary({ weekStart: '2026-06-08', enabled: false }),
    )

    await new Promise((r) => setTimeout(r, 0))

    expect(todayAIService.lookupSummary).not.toHaveBeenCalled()
    expect(result.current.state).toBe('loading')
  })
})
