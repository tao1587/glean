/**
 * API client package entry point.
 */

export { ApiClient, apiClient } from './client'
export { hashPassword } from './crypto'
export { AuthService } from './services/auth'
export { FeedService } from './services/feeds'
export { EntryService } from './services/entries'
export {
  buildFeedFetchSummaryParts,
  buildFeedFetchQueueSections,
  buildFeedFetchQueueSummary,
  buildFeedFetchQueuePreviewItems,
  FEED_FETCH_STAGE_SEQUENCE,
  buildFeedFetchHistoryItems,
  buildFeedFetchProgressDetails,
  findCurrentFeedFetchStage,
  formatFeedFetchDateTime,
  formatFeedFetchDuration,
  getFeedFetchStageKey,
  formatFeedFetchStageLabel,
  getFeedFetchStatusKey,
  getFeedFetchStatusLabel,
  getFeedFetchStatusTone,
  mapFeedFetchRunToViewModel,
  mapFeedFetchStageEventsToItems,
  type FeedFetchQueuePreviewItem,
  type FeedFetchQueueSection,
  type FeedFetchQueueSummary,
  type FeedFetchSummaryPart,
  type FeedFetchProgressDetailItem,
  type FeedFetchProgressHistoryItem,
  type FeedFetchProgressViewModel,
  type FeedFetchProgressStageItem,
} from './feed-fetch-progress'
// M2 services
export { FolderService } from './services/folders'
export { BookmarkService, type BookmarkListParams } from './services/bookmarks'
export { SystemService, type VectorizationStatus } from './services/system'
// MCP services
export { APITokenService } from './services/apiTokens'
export { tokenStorage } from './tokenStorage'

// Create service instances
import { apiClient } from './client'
import { AuthService } from './services/auth'
import { FeedService } from './services/feeds'
import { EntryService } from './services/entries'
import { FolderService } from './services/folders'
import { BookmarkService } from './services/bookmarks'
import { SystemService } from './services/system'
import { APITokenService } from './services/apiTokens'

export const authService = new AuthService(apiClient)
export const feedService = new FeedService(apiClient)
export const entryService = new EntryService(apiClient)
// M2 service instances
export const folderService = new FolderService(apiClient)
export const bookmarkService = new BookmarkService(apiClient)
export const systemService = new SystemService(apiClient)
// MCP service instances
export const apiTokenService = new APITokenService(apiClient)
