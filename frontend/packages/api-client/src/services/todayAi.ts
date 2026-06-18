import type {
  SummaryGenerateResponse,
  SummaryLookupResponse,
  SummaryPeriod,
  SummaryView,
} from '@glean/types'
import type { ApiClient } from '../client'

/**
 * Today AI service — period-aware daily/weekly summaries.
 * Mirrors the backend `/api/today/ai/summary:*` namespace.
 */
export class TodayAIService {
  constructor(private readonly client: ApiClient) {}

  /** Look up the cached summary (if any) + current set hash + stale flag. */
  async lookupSummary(period: SummaryPeriod, date: string): Promise<SummaryLookupResponse> {
    return this.client.post<SummaryLookupResponse>('/today/ai/summary:lookup', { period, date })
  }

  /** Reserve a placeholder summary row + enqueue the worker job. */
  async generateSummary(period: SummaryPeriod, date: string): Promise<SummaryGenerateResponse> {
    return this.client.post<SummaryGenerateResponse>('/today/ai/summary:generate', { period, date })
  }

  /** Reset a failed summary to pending and re-enqueue. */
  async retrySummary(period: SummaryPeriod, date: string): Promise<SummaryView> {
    return this.client.post<SummaryView>('/today/ai/summary:retry', { period, date })
  }
}
