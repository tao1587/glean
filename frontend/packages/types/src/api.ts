/**
 * API response type definitions.
 *
 * These types define the structure of API responses
 * for consistent handling across the application.
 */

import type { EntryWithState, Subscription, User } from './models'

/** Authentication token response */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

/** Authentication response (login/register) */
export interface AuthResponse {
  user: User
  tokens: TokenResponse
}

/** Generic paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/** API error response */
export interface ApiError {
  detail: string
  code?: string
}

/** Health check response */
export interface HealthCheckResponse {
  status: string
  version?: string
}

/** Login request */
export interface LoginRequest {
  email: string
  password: string
}

/** Register request */
export interface RegisterRequest {
  email: string
  password: string
  name: string
}

/** Refresh token request */
export interface RefreshTokenRequest {
  refresh_token: string
}

/** Discover feed request */
export interface DiscoverFeedRequest {
  url?: string | null
  folder_id?: string | null
  rsshub_path?: string | null
}

/** Update subscription request */
export interface UpdateSubscriptionRequest {
  custom_title?: string | null
  folder_id?: string | null
  feed_url?: string | null
  rsshub_path?: string | null
}

/** Update entry state request */
export interface UpdateEntryStateRequest {
  is_read?: boolean
  read_later?: boolean
  is_hidden?: boolean
  read_later_days?: number
  triage_state?: 'now' | 'later' | 'archive' | 'trial'
  defer_until?: string | null
  expires_at?: string | null
  estimated_read_time_sec?: number
  content_temporality?: 'timely' | 'evergreen' | 'mixed'
}

export interface AIIntegrationStatusResponse {
  enabled: boolean
  // Exposed when enabled is true; FE uses these to build TanStack Query cache keys
  // and decide whether to render the synthesis panel.
  model?: string | null
  prompt_version?: string | null
  target_language?: string | null
  synthesis_enabled?: boolean
}

export interface SystemTimeResponse {
  timezone: string
  current_time: string
  current_date: string
}

export interface AIIntegrationConfigResponse {
  enabled: boolean
  allow_today_synthesis: boolean
}

export type SummaryPeriod = 'day' | 'week'
export type SummaryStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface SummaryTopic {
  name: string
  entry_ids: string[]
}

export interface SummaryHighlight {
  entry_id: string
  reason: string
}

export interface SummaryView {
  period: SummaryPeriod
  period_start: string | null
  period_end: string | null
  status: SummaryStatus
  title: string | null
  summary: string | null
  topics: SummaryTopic[]
  highlights: SummaryHighlight[]
  recommended_entry_ids: string[]
  model: string | null
  generated_at: string | null
  source_set_hash: string | null
  source_count: number | null
  error_code: string | null
  error_message: string | null
}

export interface SummaryLookupResponse {
  summary: SummaryView | null
  current_set_hash: string | null
  current_count: number
  is_stale: boolean
}

export interface SummaryGenerateResponse {
  status: 'queued' | 'in_flight' | 'already_done' | 'no_entries'
  summary_id: string
  source_set_hash: string
  source_count: number
}

export type AIIntegrationConfigUpdateRequest = Partial<AIIntegrationConfigResponse>

/** Entry list response */
export type EntryListResponse = PaginatedResponse<EntryWithState>

/** Entry search response */
export interface EntrySearchResponse {
  items: EntryWithState[]
  total: number
  query: string
  scope: 'all' | 'date' | 'week'
  took_ms: number
}

/** Subscription list response (paginated) */
export interface SubscriptionListResponse {
  items: Subscription[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/** Subscription sync response (all subscriptions with ETag) */
export interface SubscriptionSyncResponse {
  items: Subscription[]
  etag: string
}

/** Subscription list params */
export interface SubscriptionListParams {
  page?: number
  per_page?: number
  folder_id?: string | null
  search?: string
}

/** OPML import response */
export interface OPMLImportResponse {
  success: number
  failed: number
  total: number
  folders_created: number
}

/** Batch delete subscriptions request */
export interface BatchDeleteSubscriptionsRequest {
  subscription_ids: string[]
}

/** Batch delete subscriptions response */
export interface BatchDeleteSubscriptionsResponse {
  deleted_count: number
  failed_count: number
}

export interface FeedRefreshJob {
  run_id?: string
  subscription_id?: string
  feed_id: string
  job_id: string
  feed_title?: string
}

export interface RefreshFeedResponse {
  status: string
  run_id?: string
  job_id: string
  feed_id: string
  feed_title?: string
}

export interface RefreshAllFeedsResponse {
  status: string
  queued_count: number
  jobs: FeedRefreshJob[]
}

export interface RefreshStatusRequest {
  items: Array<{
    feed_id: string
    job_id: string
  }>
}

export interface RefreshStatusItem {
  feed_id: string
  job_id: string
  status: string
  result_status: string | null
  new_entries: number | null
  total_entries: number | null
  message: string | null
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  error_count: number
  fetch_error_message: string | null
}

export interface RefreshStatusResponse {
  items: RefreshStatusItem[]
}

export interface FeedFetchStageEvent {
  id: string
  stage_order: number
  stage_name: string
  status: string
  started_at: string | null
  finished_at: string | null
  summary: string | null
  metrics_json: Record<string, unknown> | null
  last_progress_at?: string | null
  is_slow?: boolean
  slow_threshold_seconds?: number | null
  elapsed_seconds?: number | null
  public_diagnostic?: string | null
  admin_diagnostic?: string | null
}

export interface FeedFetchRun {
  id: string
  feed_id: string
  job_id: string | null
  trigger_type: string
  status: string
  current_stage: string | null
  path_kind: string | null
  profile_key: string | null
  queue_entered_at: string | null
  predicted_start_at: string | null
  predicted_finish_at: string | null
  started_at: string | null
  finished_at: string | null
  summary_json: Record<string, unknown> | null
  error_message: string | null
  created_at: string | null
  updated_at: string | null
  next_fetch_at: string | null
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  stages: FeedFetchStageEvent[]
}

export interface FeedFetchLatestRunResponse extends Partial<FeedFetchRun> {
  feed_id: string
  next_fetch_at: string | null
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  stages: FeedFetchStageEvent[]
}

export interface FeedFetchRunHistoryResponse {
  feed_id: string
  next_fetch_at: string | null
  last_fetch_attempt_at?: string | null
  last_fetch_success_at?: string | null
  last_fetched_at?: string | null
  items: FeedFetchRun[]
}

export interface FeedFetchRunBatchLatestResponse {
  items: FeedFetchLatestRunResponse[]
}

export interface FeedFetchActiveRunItem extends FeedFetchRun {
  feed_title: string | null
  feed_url: string
}

export interface FeedFetchActiveRunsResponse {
  items: FeedFetchActiveRunItem[]
}
