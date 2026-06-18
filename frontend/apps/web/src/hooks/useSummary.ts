import { useCallback, useEffect, useMemo, useState } from 'react'

import { todayAIService } from '@glean/api-client'
import type { SummaryLookupResponse, SummaryPeriod, SummaryView } from '@glean/types'

const POLL_INTERVAL_MS = 3_000

export type SummaryUIState =
  | 'loading'
  | 'empty'
  | 'idle'
  | 'generating'
  | 'ready'
  | 'failed'

export interface UseSummaryResult {
  state: SummaryUIState
  summary: SummaryView | null
  isStale: boolean
  currentCount: number
  hasSummary: boolean // summary?.status === 'done'
  generate: () => Promise<void>
  retry: () => Promise<void>
}

function deriveState(lookup: SummaryLookupResponse | null): SummaryUIState {
  if (!lookup) return 'loading'
  if (lookup.summary === null) {
    return lookup.current_count === 0 ? 'empty' : 'idle'
  }
  if (lookup.summary.status === 'done') return 'ready'
  if (lookup.summary.status === 'failed') return 'failed'
  return 'generating' // pending | processing
}

function useSummary(period: SummaryPeriod, dateKey: string, enabled: boolean): UseSummaryResult {
  const [lookup, setLookup] = useState<SummaryLookupResponse | null>(null)
  const [explicitState, setExplicitState] = useState<SummaryUIState | null>(null)

  // 1. Initial lookup — triggered by enabled + dateKey
  useEffect(() => {
    if (!enabled) {
      setLookup(null)
      setExplicitState(null)
      return
    }
    let cancelled = false
    setExplicitState('loading')
    todayAIService
      .lookupSummary(period, dateKey)
      .then((r) => {
        if (cancelled) return
        setLookup(r)
        setExplicitState(null)
      })
      .catch(() => {
        // Lookup failure: leave state at loading; polls will recover.
      })
    return () => {
      cancelled = true
    }
  }, [enabled, period, dateKey])

  // 2. Poll while a job is running
  const effectiveState = explicitState ?? deriveState(lookup)
  useEffect(() => {
    if (!enabled || effectiveState !== 'generating') return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const r = await todayAIService.lookupSummary(period, dateKey)
        if (cancelled) return
        setLookup(r)
      } catch {
        // transient — keep polling
      }
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, effectiveState, period, dateKey])

  const generate = useCallback(async () => {
    setExplicitState('generating')
    try {
      await todayAIService.generateSummary(period, dateKey)
      const r = await todayAIService.lookupSummary(period, dateKey)
      setLookup(r)
      setExplicitState(null)
    } catch {
      setExplicitState('failed')
    }
  }, [period, dateKey])

  const retry = useCallback(async () => {
    setExplicitState('generating')
    try {
      await todayAIService.retrySummary(period, dateKey)
      const r = await todayAIService.lookupSummary(period, dateKey)
      setLookup(r)
      setExplicitState(null)
    } catch {
      setExplicitState('failed')
    }
  }, [period, dateKey])

  return useMemo(
    () => ({
      state: effectiveState,
      summary: lookup?.summary ?? null,
      isStale: lookup?.is_stale ?? false,
      currentCount: lookup?.current_count ?? 0,
      hasSummary: lookup?.summary?.status === 'done',
      generate,
      retry,
    }),
    [effectiveState, lookup, generate, retry],
  )
}

export function useDailySummary({
  date,
  enabled,
}: {
  date: string
  enabled: boolean
}): UseSummaryResult {
  return useSummary('day', date, enabled)
}

export function useWeeklySummary({
  weekStart,
  enabled,
}: {
  weekStart: string
  enabled: boolean
}): UseSummaryResult {
  return useSummary('week', weekStart, enabled)
}
