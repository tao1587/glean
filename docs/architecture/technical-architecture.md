# Glean Technical Architecture

## Overview

Glean (拾灵) is a personal knowledge management tool and RSS reader. It follows a classic three-tier architecture: React SPA frontend → FastAPI REST backend → PostgreSQL (with `pgvector` for vectors) + Redis storage layer. All backend I/O is async (asyncpg, arq, aiohttp), and the frontend uses TanStack Query for server state management with Zustand for client state.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │  React SPA   │  │  Electron    │  │  Admin Dashboard       │     │
│  │  (port 3000) │  │  Desktop App │  │  (port 3001)           │     │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘     │
│         │                 │                      │                   │
│         └─────────────────┼──────────────────────┘                   │
│                           │ HTTP / REST                              │
├───────────────────────────┼─────────────────────────────────────────┤
│                    Backend Layer                                     │
│  ┌────────────────────────┴───────────────────────────────────┐     │
│  │              FastAPI REST API (port 8000)                   │     │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │     │
│  │  │  Auth  │ │ Feeds  │ │Entries │ │Bookmarks│ │  Admin   │ │     │
│  │  │ Router │ │ Router │ │ Router │ │ Router  │ │  Router  │ │     │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │     │
│  │        ↓           ↓         ↓          ↓          ↓       │     │
│  │  ┌─────────────────────────────────────────────────────┐   │     │
│  │  │              Core Services Layer                     │   │     │
│  │  │  EntryService · TranslationService · ScoreService   │   │     │
│  │  └─────────────────────────────────────────────────────┘   │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │              arq Worker (Background Tasks)                  │     │
│  │  feed_fetcher · content_backfill · translation · embedding  │     │
│  │  bookmark_metadata · subscription_cleanup · cleanup          │     │
│  └────────────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────┤
│                     Storage Layer                                    │
│  ┌───────────────────────────────────┐  ┌──────────────────────┐    │
│  │ PostgreSQL 16 + pgvector (5432)   │  │   Redis 7 (6379)     │    │
│  │  - entries, users, feeds          │  │  - arq task queue    │    │
│  │  - embeddings (pgvector column)   │  │  - sessions          │    │
│  │  - vector similarity search       │  │  - distributed locks │    │
│  └───────────────────────────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Technology Stack

| Concern       | Choice                          |
|---------------|----------------------------------|
| Framework     | React 18 + Vite (SWC plugin)    |
| Routing       | react-router-dom v6             |
| Server State  | TanStack Query (React Query)    |
| Client State  | Zustand                         |
| Styling       | Tailwind CSS                    |
| UI Components | COSS UI (custom component lib)  |
| i18n          | react-i18next                   |
| HTTP Client   | Axios (with interceptors)       |
| Build         | Vite + Turborepo                |
| Desktop       | Electron (optional)             |

### 2.2 Application Bootstrap Sequence

```
index.html
  ├── Load Google Fonts (Crimson Pro + DM Sans) — render-blocking
  ├── Load lightgallery CSS + globals.css
  └── main.tsx
       ├── initializeTheme()  — sync, prevents flash
       ├── initializeLanguage()  — sync, i18n setup
       ├── Create QueryClient (staleTime: 5min, retry: 1)
       └── ReactDOM.createRoot()
            └── <React.StrictMode>
                 └── <QueryClientProvider>
                      └── <BrowserRouter>
                           └── <App />
                                ├── loadUser() — async, shows LoadingSpinner
                                └── <Suspense fallback={LoadingSpinner}>
                                     └── <Routes> (lazy-loaded pages)
```

### 2.3 Page Lazy Loading

All pages are `React.lazy()` loaded with a common `<Suspense>` boundary:

| Route              | Lazy Component     |
|--------------------|--------------------|
| `/login`           | LoginPage          |
| `/register`        | RegisterPage       |
| `/auth/callback`   | AuthCallbackPage   |
| `/reader`          | ReaderRoute        |
| `/settings`        | SettingsPage       |
| `/subscriptions`   | SubscriptionsPage  |
| `/bookmarks`       | BookmarksPage      |

The default route `/` redirects to `/reader?tab=unread`. Unknown paths redirect to `/`.

### 2.4 Three-Column Layout (ReaderPage)

```
┌──────────┬─────────────────┬─────────────────────────────────┐
│ Sidebar  │   Entry List    │        ArticleReader            │
│ (72-256) │   (280-500)     │        (flexible)               │
│          │                 │                                  │
│ - Feeds  │ - InfiniteQuery │ - processHtmlContent()          │
│ - Folders│ - Intersection  │ - useContentRenderer()          │
│          │   Observer      │ - useViewportTranslation()      │
│          │ - Filter tabs   │ - useScrollHide() auto-hide     │
└──────────┴─────────────────┴─────────────────────────────────┘
```

- **Entry List**: Uses `useInfiniteEntries()` with IntersectionObserver for infinite scroll (100px root margin)
- **ArticleReader**: Renders sanitized HTML via `dangerouslySetInnerHTML` + DOMPurify
- **Desktop**: Shows all three columns simultaneously, entry list resizable (280-500px)
- **Mobile**: Navigates between list and reader views with CSS animations

### 2.5 Data Fetching Architecture

```
Component → useEntries() hook → entryService.getEntries() → ApiClient.get()
                                                                    │
                                                              Axios Instance
                                                              ├── Request interceptor: attach JWT
                                                              ├── Response interceptor: auto-refresh 401
                                                              └── Vite proxy → localhost:8000/api
```

**TanStack Query Configuration**:
- `staleTime`: 5 minutes — data considered fresh, no refetch on mount
- `retry`: 1 — single retry on failure
- No `gcTime` override — default 5 min garbage collection
- Optimistic updates for `useUpdateEntryState` (entry list cache patching)

**Query Key Factory**:
```typescript
entryKeys.all       → ['entries']
entryKeys.lists()   → ['entries', 'list']
entryKeys.list({})  → ['entries', 'list', filters]
entryKeys.detail(id)→ ['entries', 'detail', id]
```

### 2.6 State Management

**Zustand Stores** (client-only state):
| Store                 | Purpose                                           |
|-----------------------|---------------------------------------------------|
| `authStore`           | User session, login/logout, token lifecycle       |
| `themeStore`          | Dark/light theme, persisted to localStorage       |
| `languageStore`       | i18n language, persisted to localStorage          |
| `folderStore`         | Folder expand/collapse + ordering state           |
| `bookmarkStore`       | Bookmark panel UI state                           |
| `digestSettingsStore` | Digest view settings (layout, density)            |
| `digestSidebarStore`  | Digest sidebar open/close + pinned sections       |

**TanStack Query** (server state):
- Entry lists (with infinite scroll)
- Individual entries
- Subscriptions / feed list
- Vectorization status

### 2.7 Content Rendering Pipeline

```
entry.content (raw HTML from RSS feed)
  │
  ▼
processHtmlContent() — DOMPurify sanitization, entity decoding
  │
  ▼
dangerouslySetInnerHTML — React renders sanitized HTML
  │
  ▼
useContentRenderer() — highlight.js for <pre><code>, lightGallery for images
  │
  ▼ (if translation activated)
useViewportTranslation() — IntersectionObserver on block elements
  ├── splitIntoSentences() — split text into translatable units
  ├── entryService.translateTexts() — batch API call
  └── DOM manipulation — inject bilingual sentence pairs
```

### 2.8 Build Configuration (Vite)

- **Plugin**: `@vitejs/plugin-react-swc` (fast SWC-based compilation)
- **Dev server proxy**: `/api → localhost:8000`
- **Code splitting**: Automatic via `React.lazy()` per page
- **No explicit manual chunks** — relies on Vite/Rollup defaults
- **Electron mode**: Conditional `vite-plugin-electron/simple`
- **No SSR/SSG** — pure client-side SPA
- **No service worker** — no PWA caching

---

## 3. Backend Architecture

### 3.1 Technology Stack

| Concern       | Choice                              |
|---------------|--------------------------------------|
| Framework     | FastAPI + Starlette                 |
| ORM           | SQLAlchemy 2.0 (async, asyncpg)     |
| Migrations    | Alembic                             |
| Task Queue    | arq (Redis-backed)                  |
| Auth          | JWT (HS256, 15min access/7d refresh)|
| Logging       | structlog (structured JSON)         |
| Type Checking | pyright (strict)                    |

### 3.2 Request Processing Flow

```
HTTP Request
  │
  ▼
CORSMiddleware — origin validation, credentials
  │
  ▼
LoggingMiddleware — X-Request-ID, timing, structured log
  │
  ▼
Router handler — path matching, dependency injection
  │
  ▼
Depends(get_session) — async SQLAlchemy session
Depends(get_redis_pool) — arq Redis pool
Depends(get_current_user) — JWT validation
  │
  ▼
Service layer — EntryService, TranslationService, etc.
  │
  ▼
SQLAlchemy async query → PostgreSQL
```

### 3.3 Database Schema (Core Models)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    users     │     │    feeds     │     │   entries    │
│──────────────│     │──────────────│     │──────────────│
│ id (UUID)    │     │ id (UUID)    │     │ id (UUID)    │
│ email        │     │ url (unique) │◄────│ feed_id (FK) │
│ name         │     │ title        │     │ url          │
│ settings(JSON)│     │ icon_url     │     │ title        │
└──────────────┘     │ etag         │     │ content(Text)│
       │             │ last_modified│     │ summary(Text)│
       │             │ next_fetch_at│     │ published_at │
       │             └──────────────┘     │ guid         │
       │                    │              └──────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│subscriptions │     │ user_entries │     │entry_translations│
│──────────────│     │──────────────│     │──────────────────│
│ user_id (FK) │     │ user_id (FK) │     │ entry_id (FK)    │
│ feed_id (FK) │     │ entry_id (FK)│     │ target_language   │
│ folder_id(FK)│     │ is_read      │     │ translated_title  │
│ custom_title │     │ is_liked     │     │ translated_content│
└──────────────┘     │ read_later   │     │ paragraph_translations (JSONB) │
                     │ read_at      │     │ status            │
                     └──────────────┘     └──────────────────┘
```

**Key design decisions**:
- **Entries are shared globally** — deduplicated by `(feed_id, guid)`. All users reading the same feed share Entry rows.
- **User state is separate** — `UserEntry` tracks per-user read/liked/read-later state.
- **Translations are cached** — full translations in `EntryTranslation`, sentence-level cache in `paragraph_translations` JSONB.

### 3.4 Connection Pool Configuration

```python
create_async_engine(
    database_url,
    pool_size=20,       # persistent connections
    max_overflow=10,    # burst capacity
    pool_timeout=30,    # wait for available connection
    pool_recycle=1800,  # recycle every 30 minutes
)
```

### 3.5 Entry Query Pattern (Critical Path)

The `GET /api/entries` endpoint is the most performance-critical:

```sql
-- Simplified equivalent SQL
SELECT e.*, ue.*, f.title, f.icon_url,
       (SELECT b.id FROM bookmarks b
        WHERE b.user_id = :uid AND b.entry_id = e.id LIMIT 1) AS bookmark_id
FROM entries e
JOIN feeds f ON e.feed_id = f.id
LEFT JOIN user_entries ue ON e.id = ue.entry_id AND ue.user_id = :uid
WHERE e.feed_id IN (SELECT feed_id FROM subscriptions WHERE user_id = :uid)
  AND (ue.is_read IS FALSE OR ue.is_read IS NULL)  -- unread filter
ORDER BY e.published_at DESC
LIMIT 20 OFFSET 0;
```

**Smart View** fetches `per_page * 5` entries, scores them all via pgvector similarity search against user preference vectors, sorts by score, and returns one page. This is intentionally over-fetching for better recommendation quality.

### 3.6 Background Worker (arq)

```
WorkerSettings:
  max_jobs = 20
  job_timeout = 300s (5 min)
  keep_result = 3600s (1 hour)

Registered Tasks:
  ├── feed_fetcher.fetch_feed_task              — Single feed fetch
  ├── feed_fetcher.fetch_all_feeds              — Bulk fetch
  ├── content_backfill.enqueue_feed_content_backfill  — Schedule backfill for a feed
  ├── content_backfill.backfill_entry_content_task    — Fetch full HTML content for an entry
  ├── translation.translate_entry_task          — Full article translation (bilingual HTML)
  ├── embedding_worker.generate_entry_embedding — Per-entry embedding (M3)
  ├── embedding_worker.batch_generate_embeddings — Bulk embedding generation
  ├── embedding_worker.retry_failed_embeddings  — Retry missing / failed embeddings
  ├── embedding_worker.validate_and_rebuild_embeddings — Validate vector integrity
  ├── embedding_worker.download_embedding_model — Pull embedding model weights
  ├── embedding_rebuild.rebuild_embeddings      — Full-index rebuild
  ├── subscription_cleanup.cleanup_orphan_embeddings — Remove vectors for unsubscribed feeds
  ├── bookmark_metadata.fetch_bookmark_metadata_task — Bookmark metadata fetch
  └── cleanup.cleanup_read_later                — Expired read-later entries

Cron Jobs:
  ├── feed_fetcher.scheduled_fetch — derived from FEED_REFRESH_INTERVAL_MINUTES
  └── cleanup.scheduled_cleanup    — every hour (minute=0)
```

### 3.7 Translation System

Two translation modes:

**1. Full Article Translation** (async worker):
```
User clicks "Translate" → POST /entries/{id}/translate
  → Creates EntryTranslation record (status=pending)
  → Enqueues translate_entry_task
  → Worker: parse HTML with BeautifulSoup
           → extract block elements (p, h*, li, blockquote)
           → batch translate via Google Translate (4500-char chunks)
           → interleave original + translated blocks
           → store bilingual HTML in EntryTranslation
```

**2. Viewport-based Sentence Translation** (sync API):
```
User scrolls → IntersectionObserver detects visible blocks
  → splitIntoSentences() on visible text
  → POST /entries/translate-texts (batch of sentences)
  → Backend: check paragraph_translations JSONB cache
           → translate uncached sentences via Google Translate
           → save to JSONB cache for future reuse
  → Frontend: inject bilingual pairs into DOM
```

---

## 4. Data Flow: User Opens Article

This is the critical user journey — from clicking an entry to reading content:

```
1. User clicks entry in EntryList
   │
2. handleSelectEntry(entry)
   ├── setSelectedEntryId(entry.id)
   ├── Save original position data (for list position stability)
   └── Auto mark-as-read: updateMutation({is_read: true})
       ├── Optimistic update: patch entry in all TanStack caches
       └── Invalidate subscription queries (sidebar unread counts)
   │
3. useEntry(entryId) fires
   ├── TanStack Query: GET /api/entries/{id}
   ├── staleTime: 5min → may use cache if recently fetched in list
   └── Returns EntryWithState (including full content HTML)
   │
4. ArticleReader receives entry
   ├── processHtmlContent(content) → DOMPurify sanitize
   ├── dangerouslySetInnerHTML renders sanitized HTML
   └── useContentRenderer fires after mount:
       ├── highlight.js: syntax highlight <pre><code> blocks
       └── lightGallery: initialize image viewer
   │
5. (Optional) User activates translation
   ├── useViewportTranslation sets up IntersectionObserver
   ├── Visible blocks detected → batch translateTexts API
   └── Bilingual sentence pairs injected into DOM
```

**Total round-trips for initial article view**: 2 API calls
1. `PATCH /api/entries/{id}` — mark read (async, non-blocking for UI)
2. `GET /api/entries/{id}` — fetch full entry (may hit TanStack cache)

---

## 5. Key Architectural Patterns

### 5.1 Optimistic Updates
Entry state changes (read, like, bookmark) use optimistic cache updates — the TanStack Query cache is patched immediately before the API response, preventing the entry from disappearing from filtered lists (e.g., marking read while viewing "unread" tab).

### 5.2 Entry Position Stability
When a selected entry is marked read/liked and filtered out of the current list, a ref (`selectedEntryOriginalDataRef`) preserves its original position data. The entry is re-inserted at its correct position using `published_at` for the remaining reader flows.

### 5.3 Shared Entry Data Model
Entries are global (not per-user). A `UserEntry` junction table tracks per-user state. This avoids N copies of article content for N users of the same feed.

### 5.4 Two-Tier Translation Cache
- **Sentence level**: `paragraph_translations` JSONB — fast lookup for viewport translation
- **Full article**: `EntryTranslation` with bilingual HTML — for full document view

---

## 6. External Dependencies

| Dependency      | Usage                                  | Failure Impact           |
|-----------------|----------------------------------------|--------------------------|
| Google Fonts    | Crimson Pro + DM Sans (render-blocking)| Degraded typography      |
| Google Translate| Sentence & article translation         | Translation unavailable  |
| pgvector        | Vector embeddings + preference scoring (extension on PostgreSQL) | Smart view falls back to simple scoring |
| highlight.js    | Code syntax highlighting               | Unstyled code blocks     |
| lightGallery    | Image viewer overlay                   | No image zoom            |
| DOMPurify       | HTML sanitization (XSS prevention)     | Security risk if missing |
