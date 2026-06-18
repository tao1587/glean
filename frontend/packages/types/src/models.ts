/**
 * Domain model type definitions.
 *
 * These types correspond to the backend database models
 * and are used throughout the frontend application.
 */

export type TranslationTargetLanguage = 'zh-CN' | 'en'

export interface UserSettings {
  read_later_days?: number // Days until read later items expire (0 = never)
  show_read_later_remaining?: boolean // Show remaining time in read later list
  translation_provider?: 'google' | 'deepl' | 'openai' | 'mtran'
  translation_target_language?: TranslationTargetLanguage
  list_translation_auto_enabled?: boolean // Auto-enable list viewport translation
  list_translation_english_only?: boolean // Translate only English content in list
  ai_integration_enabled?: boolean // Enable local AI features for this user
  today_board_default_view?: 'list' | 'ai_summary' // Default Today Board view for this user
  translation_api_key?: string
  translation_model?: string
  translation_base_url?: string
}

/** User account information */
export interface User {
  id: string
  email: string | null // Email can be null for OAuth users without email scope
  name: string | null
  username: string | null // Username (e.g., preferred_username from OIDC)
  phone: string | null // Phone number (e.g., phone_number from OIDC)
  avatar_url: string | null
  is_active: boolean
  is_verified: boolean
  primary_auth_provider?: string | null // Authentication provider (local, oidc, etc.)
  settings: UserSettings | null
  created_at: string
}

/** User update request */
export interface UserUpdateRequest {
  name?: string
  avatar_url?: string | null
  settings?: UserSettings
}

/** RSS feed status */
export enum FeedStatus {
  ACTIVE = 'active',
  ERROR = 'error',
  DISABLED = 'disabled',
}

/** RSS feed */
export interface Feed {
  id: string
  url: string
  title: string | null
  site_url: string | null
  description: string | null
  icon_url: string | null
  language: string | null
  source_type: 'feed' | 'rsshub'
  status: FeedStatus
  error_count: number
  fetch_error_message: string | null
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  last_entry_at: string | null
  created_at: string
  updated_at: string
}

/** User subscription to a feed */
export interface Subscription {
  id: string
  user_id: string
  feed_id: string
  custom_title: string | null
  folder_id: string | null
  created_at: string
  feed: Feed
  unread_count: number
}

/** Feed entry (article) */
export interface Entry {
  id: string
  feed_id: string
  guid: string
  url: string
  title: string
  author: string | null
  content: string | null
  summary: string | null
  content_backfill_status?: 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | null
  content_backfill_attempts?: number
  content_backfill_at?: string | null
  content_backfill_error?: string | null
  content_source?: string | null
  published_at: string | null
  created_at: string
}

/** Entry with user state */
export interface EntryWithState extends Entry {
  is_read: boolean
  read_later: boolean
  read_later_until: string | null // ISO date string when read later expires
  triage_state?: 'now' | 'later' | 'archive' | 'trial'
  defer_until?: string | null
  expires_at?: string | null
  estimated_read_time_sec?: number | null
  content_temporality?: 'timely' | 'evergreen' | 'mixed'
  read_at: string | null
  ingested_at?: string | null
  is_bookmarked: boolean
  bookmark_id: string | null
  // Feed info for display in aggregated views
  feed_title: string | null
  feed_icon_url: string | null
}

// M2: Folder types
export type FolderType = 'feed' | 'bookmark'

export interface Folder {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  type: FolderType
  position: number
  created_at: string
  updated_at: string
}

export interface FolderTreeNode {
  id: string
  name: string
  type: FolderType
  position: number
  children: FolderTreeNode[]
}

export interface FolderTreeResponse {
  folders: FolderTreeNode[]
}

export interface CreateFolderRequest {
  name: string
  type: FolderType
  parent_id?: string | null
}

export interface UpdateFolderRequest {
  name?: string
}

export interface MoveFolderRequest {
  parent_id: string | null
}

export interface FolderOrderItem {
  id: string
  position: number
}

export interface ReorderFoldersRequest {
  orders: FolderOrderItem[]
}

// M2: Bookmark types
export interface BookmarkFolderSimple {
  id: string
  name: string
}

export interface Bookmark {
  id: string
  user_id: string
  entry_id: string | null
  url: string | null
  title: string
  excerpt: string | null
  content: string | null // Full article content (HTML) for in-app reading
  snapshot_status: 'pending' | 'processing' | 'done' | 'failed'
  folders: BookmarkFolderSimple[]
  created_at: string
  updated_at: string
}

export interface BookmarkListResponse {
  items: Bookmark[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface CreateBookmarkRequest {
  entry_id?: string
  url?: string
  title?: string
  excerpt?: string
  folder_ids?: string[]
}

export interface UpdateBookmarkRequest {
  title?: string
  excerpt?: string
}

// MCP: API Token types
export interface APIToken {
  id: string
  name: string
  token_prefix: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface APITokenCreateResponse extends APIToken {
  token: string // Only returned once during creation
}

export interface APITokenListResponse {
  tokens: APIToken[]
}

export interface CreateAPITokenRequest {
  name: string
  expires_in_days?: number | null
}

// Translation types
export interface TranslateEntryRequest {
  target_language?: string | null // null = auto-detect
}

export interface TranslationResponse {
  entry_id: string
  target_language: string
  translated_title: string | null
  translated_content: string | null
  status: 'pending' | 'processing' | 'done' | 'failed'
  error: string | null
}

// Viewport-based translation types
export interface TranslateTextsRequest {
  texts: string[]
  target_language: string
  source_language?: string
  entry_id?: string
}

export interface TranslateTextsResponse {
  translations: string[]
  target_language: string
}

export interface ParagraphTranslationsResponse {
  translations: Record<string, string>
}
