import type {
  Subscription,
  SubscriptionListResponse,
  SubscriptionSyncResponse,
  SubscriptionListParams,
  DiscoverFeedRequest,
  UpdateSubscriptionRequest,
  OPMLImportResponse,
  BatchDeleteSubscriptionsRequest,
  BatchDeleteSubscriptionsResponse,
  FeedFetchLatestRunResponse,
  FeedFetchActiveRunsResponse,
  FeedFetchRunBatchLatestResponse,
  FeedFetchRunHistoryResponse,
  RefreshAllFeedsResponse,
  RefreshFeedResponse,
  RefreshStatusRequest,
  RefreshStatusResponse,
} from '@glean/types'
import { ApiClient } from '../client'

/**
 * Feeds and subscriptions API service.
 *
 * Handles feed discovery, subscription management, and OPML import/export.
 */
export class FeedService {
  constructor(private client: ApiClient) {}

  /**
   * Get paginated user subscriptions.
   */
  async getSubscriptions(params?: SubscriptionListParams): Promise<SubscriptionListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString())
    if (params?.folder_id !== undefined) searchParams.set('folder_id', params.folder_id ?? '')
    if (params?.search) searchParams.set('search', params.search)

    const query = searchParams.toString()
    const url = query ? `/feeds?${query}` : '/feeds'
    return this.client.get<SubscriptionListResponse>(url)
  }

  /**
   * Sync all subscriptions with ETag support.
   * Returns null if data hasn't changed (304 response).
   */
  async syncAllSubscriptions(
    cachedEtag?: string
  ): Promise<{ data: SubscriptionSyncResponse | null; etag: string | null }> {
    const headers: Record<string, string> = {}
    if (cachedEtag) {
      headers['If-None-Match'] = `"${cachedEtag}"`
    }

    try {
      const response = await this.client.getWithHeaders<SubscriptionSyncResponse>(
        '/feeds/sync/all',
        { headers }
      )
      const etag = response.headers.get('ETag')?.replace(/"/g, '') || null
      return { data: response.data, etag }
    } catch (error: unknown) {
      // Handle 304 Not Modified
      if (error && typeof error === 'object' && 'status' in error && error.status === 304) {
        return { data: null, etag: cachedEtag || null }
      }
      throw error
    }
  }

  /**
   * Get a specific subscription.
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.client.get<Subscription>(`/feeds/${subscriptionId}`)
  }

  /**
   * Discover and subscribe to a feed from URL.
   */
  async discoverFeed(data: DiscoverFeedRequest): Promise<Subscription> {
    return this.client.post<Subscription>('/feeds/discover', data)
  }

  /**
   * Update subscription settings.
   */
  async updateSubscription(
    subscriptionId: string,
    data: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    return this.client.patch<Subscription>(`/feeds/${subscriptionId}`, data)
  }

  /**
   * Delete a subscription.
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.client.delete(`/feeds/${subscriptionId}`)
  }

  /**
   * Delete multiple subscriptions at once.
   */
  async batchDeleteSubscriptions(
    data: BatchDeleteSubscriptionsRequest
  ): Promise<BatchDeleteSubscriptionsResponse> {
    return this.client.post<BatchDeleteSubscriptionsResponse>('/feeds/batch-delete', data)
  }

  /**
   * Manually refresh a feed.
   */
  async refreshFeed(subscriptionId: string): Promise<RefreshFeedResponse> {
    return this.client.post<RefreshFeedResponse>(`/feeds/${subscriptionId}/refresh`)
  }

  /**
   * Manually refresh all user's subscribed feeds.
   */
  async refreshAllFeeds(): Promise<RefreshAllFeedsResponse> {
    return this.client.post<RefreshAllFeedsResponse>('/feeds/refresh-all')
  }

  /**
   * Query per-feed refresh job statuses.
   */
  async getRefreshStatus(data: RefreshStatusRequest): Promise<RefreshStatusResponse> {
    return this.client.post<RefreshStatusResponse>('/feeds/refresh-status', data)
  }

  /**
   * Get the latest persisted feed fetch run for one feed.
   */
  async getLatestFeedFetchRun(feedId: string): Promise<FeedFetchLatestRunResponse> {
    return this.client.get<FeedFetchLatestRunResponse>(`/feeds/${feedId}/fetch-runs/latest`)
  }

  /**
   * Get latest persisted fetch run snapshots for many feeds.
   */
  async getLatestFeedFetchRuns(feedIds: string[]): Promise<FeedFetchRunBatchLatestResponse> {
    return this.client.post<FeedFetchRunBatchLatestResponse>('/feeds/fetch-runs/latest', {
      feed_ids: feedIds,
    })
  }

  /**
   * Get recent persisted feed fetch run history for one feed.
   */
  async getFeedFetchRunHistory(feedId: string): Promise<FeedFetchRunHistoryResponse> {
    return this.client.get<FeedFetchRunHistoryResponse>(`/feeds/${feedId}/fetch-runs/history`)
  }

  /**
   * Get active queued/running feed fetch runs visible to the current user.
   */
  async getActiveFeedFetchRuns(): Promise<FeedFetchActiveRunsResponse> {
    return this.client.get<FeedFetchActiveRunsResponse>('/feeds/fetch-runs/active')
  }

  /**
   * Import subscriptions from OPML file.
   */
  async importOPML(file: File): Promise<OPMLImportResponse> {
    const formData = new FormData()
    formData.append('file', file)

    return this.client.post<OPMLImportResponse>('/feeds/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  /**
   * Export subscriptions as OPML file.
   */
  async exportOPML(): Promise<Blob> {
    const response = await this.client.get<Blob>('/feeds/export', {
      responseType: 'blob',
    })
    return response
  }
}
