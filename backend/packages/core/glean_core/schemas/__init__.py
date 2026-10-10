"""
Pydantic schemas for API requests and responses.
"""

from .api_token import (
    APITokenCreate,
    APITokenCreateResponse,
    APITokenListResponse,
    APITokenResponse,
)
from .auth import LoginRequest, RefreshTokenRequest, RegisterRequest, TokenResponse
from .bookmark import (
    BookmarkCreate,
    BookmarkFolderRequest,
    BookmarkListResponse,
    BookmarkResponse,
    BookmarkUpdate,
)
from .config import (
    EmbeddingConfig,
    EmbeddingConfigResponse,
    EmbeddingConfigUpdateRequest,
    EmbeddingRebuildProgress,
    RateLimitConfig,
    RSSHubConfig,
    RSSHubConfigUpdateRequest,
    SystemTimeResponse,
    ValidationResult,
    VectorizationStatus,
    VectorizationStatusResponse,
)
from .entry import (
    EntryListResponse,
    EntryResponse,
    EntrySearchResponse,
    ParagraphTranslationsResponse,
    SourceAffinityResponse,
    TranslateEntryRequest,
    TranslateTextsRequest,
    TranslateTextsResponse,
    TranslationResponse,
    UpdateEntryStateRequest,
)
from .feed import (
    BatchDeleteSubscriptionsRequest,
    BatchDeleteSubscriptionsResponse,
    DiscoverFeedRequest,
    FeedResponse,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionSyncResponse,
    UpdateSubscriptionRequest,
)
from .folder import (
    FolderCreate,
    FolderMove,
    FolderReorder,
    FolderResponse,
    FolderTreeNode,
    FolderTreeResponse,
    FolderUpdate,
)
from .user import UserResponse, UserSettings, UserUpdate

__all__ = [
    # API Token
    "APITokenCreate",
    "APITokenCreateResponse",
    "APITokenListResponse",
    "APITokenResponse",
    # Auth
    "LoginRequest",
    "RefreshTokenRequest",
    "RegisterRequest",
    "TokenResponse",
    # User
    "UserResponse",
    "UserSettings",
    "UserUpdate",
    # Feed
    "FeedResponse",
    "SubscriptionResponse",
    "SubscriptionListResponse",
    "SubscriptionSyncResponse",
    "DiscoverFeedRequest",
    "UpdateSubscriptionRequest",
    "BatchDeleteSubscriptionsRequest",
    "BatchDeleteSubscriptionsResponse",
    # Entry
    "EntryResponse",
    "EntryListResponse",
    "EntrySearchResponse",
    "SourceAffinityResponse",
    "UpdateEntryStateRequest",
    "TranslateEntryRequest",
    "TranslateTextsRequest",
    "TranslateTextsResponse",
    "TranslationResponse",
    "ParagraphTranslationsResponse",
    # M2: Bookmark
    "BookmarkCreate",
    "BookmarkUpdate",
    "BookmarkResponse",
    "BookmarkListResponse",
    "BookmarkFolderRequest",
    # M2: Folder
    "FolderCreate",
    "FolderUpdate",
    "FolderMove",
    "FolderReorder",
    "FolderResponse",
    "FolderTreeNode",
    "FolderTreeResponse",
    # Config
    "EmbeddingConfig",
    "EmbeddingConfigResponse",
    "EmbeddingConfigUpdateRequest",
    "EmbeddingRebuildProgress",
    "RateLimitConfig",
    "RSSHubConfig",
    "RSSHubConfigUpdateRequest",
    "SystemTimeResponse",
    "ValidationResult",
    "VectorizationStatus",
    "VectorizationStatusResponse",
]
