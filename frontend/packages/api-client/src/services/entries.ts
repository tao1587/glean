import type {
  EntryWithState,
  EntryListResponse,
  EntrySearchResponse,
  ParagraphTranslationsResponse,
  TranslateTextsResponse,
  TranslationResponse,
  UpdateEntryStateRequest,
} from '@glean/types'
import { ApiClient } from '../client'

/**
 * Entries API service.
 *
 * Handles entry listing, retrieval, and state management.
 */
export class EntryService {
  constructor(private client: ApiClient) {}

  /**
   * Get entries with filtering and pagination.
   */
  async getEntries(params?: {
    feed_id?: string
    folder_id?: string
    is_read?: boolean
    read_later?: boolean
    collected_after?: string
    collected_before?: string
    page?: number
    per_page?: number
    view?: 'timeline' | 'today-board'
  }, options?: { signal?: AbortSignal }): Promise<EntryListResponse> {
    return this.client.get<EntryListResponse>('/entries', { params, signal: options?.signal })
  }

  /**
   * Get entries collected during a server-local day.
   *
   * This endpoint intentionally returns a bounded aggregate instead of timeline pages.
   */
  async getTodayEntries(params: {
    date?: string
    feed_id?: string
    folder_id?: string
    limit?: number
  }, options?: { signal?: AbortSignal }): Promise<EntryListResponse> {
    return this.client.get<EntryListResponse>('/entries/today', {
      params,
      signal: options?.signal,
    })
  }

  /**
   * Search entries by keyword across title and summary.
   */
  async searchEntries(
    params: {
      q: string
      scope?: 'all' | 'date' | 'week'
      date?: string
      limit?: number
    },
    options?: { signal?: AbortSignal },
  ): Promise<EntrySearchResponse> {
    return this.client.get<EntrySearchResponse>('/entries/search', {
      params,
      signal: options?.signal,
    })
  }

  /**
   * Get a specific entry.
   */
  async getEntry(entryId: string, options?: { signal?: AbortSignal }): Promise<EntryWithState> {
    return this.client.get<EntryWithState>(`/entries/${entryId}`, { signal: options?.signal })
  }

  /**
   * Update entry state (read and read later).
   */
  async updateEntryState(entryId: string, data: UpdateEntryStateRequest): Promise<EntryWithState> {
    return this.client.patch<EntryWithState>(`/entries/${entryId}`, data)
  }

  /**
   * Mark all entries as read.
   */
  async markAllRead(feedId?: string, folderId?: string): Promise<{ message: string }> {
    return this.client.post<{ message: string }>('/entries/mark-all-read', {
      feed_id: feedId,
      folder_id: folderId,
    })
  }

  // Translation endpoints

  /**
   * Request translation of an entry.
   * If targetLanguage is not provided, auto-detects source and picks the opposite.
   */
  async translateEntry(
    entryId: string,
    targetLanguage?: string | null
  ): Promise<TranslationResponse> {
    return this.client.post<TranslationResponse>(`/entries/${entryId}/translate`, {
      target_language: targetLanguage ?? null,
    })
  }

  /**
   * Get cached translation for an entry.
   */
  async getTranslation(entryId: string, targetLanguage: string): Promise<TranslationResponse> {
    return this.client.get<TranslationResponse>(`/entries/${entryId}/translation/${targetLanguage}`)
  }

  /**
   * Translate an array of text strings synchronously.
   * Used for viewport-based sentence-level translation.
   */
  async translateTexts(
    texts: string[],
    targetLanguage: string,
    sourceLanguage: string = 'auto',
    entryId?: string,
  ): Promise<TranslateTextsResponse> {
    return this.client.post<TranslateTextsResponse>('/entries/translate-texts', {
      texts,
      target_language: targetLanguage,
      source_language: sourceLanguage,
      entry_id: entryId,
    })
  }

  /**
   * Get persisted paragraph-level translations for an entry.
   */
  async getParagraphTranslations(
    entryId: string,
    targetLanguage: string,
  ): Promise<ParagraphTranslationsResponse> {
    return this.client.get<ParagraphTranslationsResponse>(
      `/entries/${entryId}/paragraph-translations`,
      { params: { target_language: targetLanguage } },
    )
  }
}
