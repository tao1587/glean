# Glean Architecture Summary

Last updated: 2026-04-21

## 1. System Overview

Glean uses a three-tier architecture:

1. Client layer: React Web app, Electron desktop wrapper, and Admin dashboard.
2. Service layer: FastAPI API + arq background worker.
3. Storage layer: PostgreSQL + Redis + optional pgvector-backed vector features.

Primary flow: `Frontend -> REST API -> Core Services -> Database/Queue -> Worker`.

## 2. Monorepo Structure

```text
glean/
├── backend/
│   ├── apps/
│   │   ├── api/         # FastAPI app
│   │   └── worker/      # arq worker
│   └── packages/
│       ├── core/        # business logic
│       ├── database/    # SQLAlchemy models + migrations
│       ├── rss/         # feed parsing
│       └── vector/      # embeddings/recommendation logic
├── frontend/
│   ├── apps/
│   │   ├── web/         # main user app (+ electron scripts)
│   │   └── admin/       # admin dashboard
│   └── packages/
│       ├── api-client
│       ├── ui
│       ├── types
│       ├── logger
│       └── i18n
└── docs/
```

## 3. Backend Architecture

- API entrypoint: `backend/apps/api/glean_api/main.py`
- Router modules (prefix `/api`):
  - `auth`, `feeds`, `entries`, `admin`, `ai`
  - `bookmarks`, `folders`, `icons`, `system`, `api_tokens`
- Service layer (domain logic):
  - `backend/packages/core/glean_core/services/`
- Data layer:
  - Models: `backend/packages/database/glean_database/models/`
  - Migrations: `backend/packages/database/glean_database/migrations/`
- Worker entrypoint: `backend/apps/worker/glean_worker/main.py`
  - Scheduled feed fetch derived from `FEED_REFRESH_INTERVAL_MINUTES`
  - Hourly read-later cleanup (`cleanup.scheduled_cleanup`)
  - Async tasks: feed fetch, content backfill, translation, embedding (generate / retry / rebuild / validate / model download), bookmark metadata, subscription cleanup

## 4. Frontend Architecture

- Web app entrypoint: `frontend/apps/web/src/main.tsx`
  - Initializes theme, i18n, and TanStack Query client.
- Route shell: `frontend/apps/web/src/App.tsx`
  - Lazy loads pages: `ReaderRoute`, `SubscriptionsPage`, `BookmarksPage`, `SettingsPage`, `LoginPage`, `RegisterPage`, `AuthCallbackPage`.
- State model:
  - Server state: TanStack Query
  - Client state: Zustand stores — `authStore`, `themeStore`, `languageStore`, `folderStore`, `bookmarkStore`, `digestSettingsStore`, `digestSidebarStore`.
- Shared frontend packages:
  - API SDK, shared UI components, i18n resources, logging, shared types.

## 5. Runtime / Deployment Topology

Default Docker Compose deployment includes:

- `postgres`
- `redis`
- `backend` (FastAPI)
- `worker` (arq)
- `web`
- `admin`

Vector features (embeddings, preference scoring) run through PostgreSQL's `pgvector` extension — no separate vector database.

## 6. Key Data & Control Patterns

- Shared-entry model: article content is globally stored; user-specific read/like/read-later state is separated.
- Async background processing: expensive/non-blocking workloads are executed by worker tasks.
- Optional vector pipeline: embedding + preference scoring supports personalization features outside the core reader flow.
- Frontend optimistic updates: entry state changes are reflected quickly in UI while server sync completes.

## 7. Canonical References

- Repo entry for agents: `AGENTS.md` (root `CLAUDE.md` is a thin pointer to it)
- Backend guide: `backend/AGENTS.md`
- Frontend guide: `frontend/AGENTS.md`
- Detailed architecture: `docs/architecture/technical-architecture.md`
- Deployment details: `README.md`, `DEPLOY.md`
