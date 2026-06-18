# Glean

**[English](./README.md)** | **[中文](./README.zh-CN.md)**

Reader is a self-hosted RSS reader and personal knowledge management tool for high-volume reading workflows.  fork from Glean project!

![Glean](asset/Screenshot.png)

## What This Fork Includes

- RSS/Atom subscriptions with nested folders, OPML import/export, and per-feed refresh state.
- RSSHub support with admin-configured conversion, auto-fallback, and manual RSSHub-path subscription.
- Immersive bilingual reading with persisted translation cache and multiple translation providers.
- **Today Board** for grouped per-feed daily ingestion views with one-click "Mark All Read" and collapsible sections.
- **Advanced Article Acquisition**: Layered pipeline using Playwright-enabled browser fallback for RSS sources that are summary-only or protected by anti-bot challenges (e.g., OpenAI News).
- Bookmarks, tags, read-later, folder organization, and responsive desktop/mobile reader flows.
- **Interactive Reading**: Support for keyboard navigation (j/k), inline original article view with iframe fallback, and cross-device list anchor persistence.
- Optimized reader experience with zero-jitter read status synchronization and automatic scroll reset on article switch.
- Admin dashboard with feed operations, retry/reset actions, batch management, and user administration.
- PostgreSQL + `pgvector` vector storage. This fork no longer depends on Milvus.

## Why This Fork Uses Its Own Primary Branch

This fork is intentionally moving faster than upstream and is not waiting on upstream merge cadence.
The intended primary branch is `personal-main`, which serves as this repo's release line.

### Core Additions Compared with Upstream `main`

- **Vector Stack Migration**: Transitioned from Milvus to `pgvector` (PostgreSQL), simplifying the architecture and reducing operational overhead.
- **Advanced Translation System**: End-to-end translation pipeline with multiple providers (including MTranServer), sentence-level bilingual rendering, and persistent caching.
- **Behavioral Signals & Ranking**: Implicit feedback event tracking to provide a data foundation for future personalized ranking and recommendation features.
- **Today Board**: Grouped per-feed daily ingestion view with one-click "Mark All Read" and collapsible sections.

### Systemic Optimizations

- **Reader & List UX**: Refactored desktop/mobile shells, improved list virtualization with reliable anchor restoration, and eliminated UI jitter during read status synchronization.
- **Feed Ingestion Robustness**: Enhanced failure handling (e.g., 429 rate limiting), improved idempotency, and added detailed fetch-attempt observability.
- **Admin & Ops**: Batch operations in the admin dashboard, static asset precompression, Cloudflare Tunnel integration, and optimized Docker deployment configurations.
- **Test Coverage**: Expanded multi-layer tests across API, workers, and frontend hooks to ensure long-term stability.

## Why Rebuild
The original Glean RSS  was still based on the old RSS model. Based on my experience and personal intuition, I realized that I don't actually need recommendations And Tradition folder to read. also Algorithm doesn't understand a person's preferences or their level of knowledge. Consequently, I decided to remove the  recommendation features entirely .

My typical workflow involves checking what happened each day. Under the old RSS model, you had to click into every single folder to see which items were read or unread, which was very tedious. 

To fix this, I changed the project to a "Reader" mode. In this new version:
1. The primary focus is the date. It uses the date as the main time dimension so you can immediately see which new articles were pushed today.
2. On the right side, there is an RSS directory list. You can browse according to your preferences, viewing content by user or specific feed creator in a centralized, efficient layout.

**I build and use this project just wan't see any Ad or any Information recommendation Trash Can**

## Quick Start

### Docker Compose

```bash
# Download the compose file from this branch
curl -fsSL https://raw.githubusercontent.com/GoToBoy/glean/personal-main/docker-compose.yml -o docker-compose.yml

# Optional: download the example env file from this branch
curl -fsSL https://raw.githubusercontent.com/GoToBoy/glean/personal-main/.env.example -o .env

# Optional: point Dockerized backend/worker at an external MTranServer
# Example: MTRAN_SERVER_URL=http://192.168.31.19:8989

# Start Glean
docker compose up -d
```

Access:

- Web App: `http://localhost`
- Admin Dashboard: `http://localhost:3001`
- API Health: `http://localhost:8000/api/health`

### Default Admin Account

An admin account is created automatically by default:

- Username: `admin`
- Password: `Admin123!`

Change this password before any real deployment.

## Deployment Notes

This fork uses a single PostgreSQL instance with the `pgvector` extension for vector storage.
There is no separate Milvus service in the default stack.

Default services:

- `postgres` - PostgreSQL 16 with `pgvector`
- `redis` - task queue / cache
- `backend` - FastAPI API server
- `worker` - background jobs for feed fetch, browser-based full-text extraction, cleanup, translation, embeddings
- `web` - main reader UI
- `admin` - admin dashboard

Prebuilt images are available on GHCR:

- `ghcr.io/leslieleung/glean-backend:latest`
- `ghcr.io/leslieleung/glean-web:latest`
- `ghcr.io/leslieleung/glean-admin:latest`

Supported architectures: `linux/amd64`, `linux/arm64`

## Configuration

Important environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `SECRET_KEY` | JWT signing key | `change-me-in-production-use-a-long-random-string` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `glean` |
| `ADMIN_USERNAME` | Default admin username | `admin` |
| `ADMIN_PASSWORD` | Default admin password | `Admin123!` |
| `CREATE_ADMIN` | Auto-create admin at startup | `true` |
| `WEB_PORT` | Web UI port | `80` |
| `ADMIN_PORT` | Admin UI port | `3001` |
| `IMAGE_TAG` | Docker image tag | `latest` |
| `MTRAN_SERVER_URL` | External translation endpoint reachable from backend/worker containers | unset |
| `WORKER_JOB_TIMEOUT_SECONDS` | Worker timeout for long-running jobs | `1800` |
| `WORKER_MAX_JOBS` | Max concurrent arq jobs in the worker | `4` |
| `FEED_REFRESH_INTERVAL_MINUTES` | Scheduled feed refresh interval and default `next_fetch_at` delay | `720` |
| `WORKER_MEMORY_LIMIT` | Docker memory hard limit for the worker container | `2g` |
| `WORKER_MEMORY_RESERVATION` | Docker memory reservation for the worker container | `1g` |
| `BROWSER_EXTRACTION_MAX_CONCURRENCY` | Max concurrent Playwright extractions | `1` |
| `BROWSER_EXTRACTION_TIMEOUT_SECONDS` | Per-page Playwright extraction timeout | `20` |

For all options, see [.env.example](./.env.example).

Performance note for Docker deployments:

- The default stack now keeps `glean-worker` intentionally conservative: `WORKER_MAX_JOBS=4`, `BROWSER_EXTRACTION_MAX_CONCURRENCY=1`, and a `2g` worker memory cap.
- Scheduled feed refresh now defaults to every 12 hours via `FEED_REFRESH_INTERVAL_MINUTES=720`; you can override it in your Compose environment when you want a different interval.
- If you increase feed backfill throughput or add new worker tasks later, treat memory and concurrency as part of the feature design rather than an afterthought.

## Current Capability Highlights

### Reader and Translation

- Auto-translate non-Chinese content into Chinese.
- Sentence/paragraph-aware bilingual rendering with persisted cache.
- Configurable translation providers, including external MTranServer deployments and remote-provider setups.
- Improved mobile reader navigation, list restore, and reduced duplicate translation work.

### Feeds and Discovery

- Add feeds by feed URL, website URL, or RSSHub path.
- RSSHub auto-fallback when a source URL is not directly subscribable.
- Discover page with candidate feedback and source exploration.
- Feed refresh tracking with attempt/success timestamps and clearer error handling.

### Admin and Operations

- Feed-level refresh controls plus refresh-all / retry-errored actions.
- Batch operations in the admin feed list.
- User management, password reset, and subscription import workflows.
- Docker-oriented deployment with branch-specific compose files and support for external translation services.

## Tech Stack

### Backend

- Python 3.11+ / FastAPI / SQLAlchemy 2.0
- PostgreSQL + `pgvector`
- Redis + arq worker queue

### Frontend

- React 18 / TypeScript / Vite
- Tailwind CSS / Zustand / TanStack Query

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full setup.
For the runtime-mode split and Docker guidance, see [docs/operations/local-runtime-modes.md](./docs/operations/local-runtime-modes.md).

Recommended local modes:

- Mode A: daily development. Docker runs only `postgres` and `redis`; the host runs `api`, `worker`, `web`, and `admin`.
- Mode B: clean local verification. Docker runs the full stack from local builds.
- Mode C: deployment-like compose run. Docker runs the packaged images from `docker-compose.yml`.

Quick start:

```bash
git clone https://github.com/GoToBoy/glean.git
cd glean
npm install

# Install backend and frontend dependencies
make install-backend
make install-frontend

# Start infra only
make up

# Create database schema
make db-upgrade

# Create or reset the local admin account
cd backend && uv run python scripts/create-admin.py --username admin --password 'Admin123!' --role super_admin --force

# Start all dev services
make dev-all

# Or run services individually in separate terminals
make api
make worker
make web
make admin
```

Initialization notes:

- `make up` starts only `postgres` and `redis`
- the project is not fully initialized until migrations have run
- `admin / Admin123!` is only expected to work after the admin creation script completes

Clean full-stack Docker verification:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

Development endpoints:

- Web: `http://localhost:3000`
- Admin: `http://localhost:3001`
- API docs: `http://localhost:8000/api/docs`

## Branch-Specific Docs

- [docs/index.md](./docs/index.md) - repository docs index
- [docs/product/feature-change-log.md](./docs/product/feature-change-log.md) - feature-level change log
- [docs/operations/local-runtime-modes.md](./docs/operations/local-runtime-modes.md) - recommended local Docker and host runtime split
- [DEVELOPMENT.md](./DEVELOPMENT.md) - local development guide

## Contributing

Contributions are welcome. Start with [DEVELOPMENT.md](./DEVELOPMENT.md), then:

1. Fork the repository.
2. Create a branch.
3. Run tests and lint/type checks.
4. Open a pull request.

## License

Licensed under [AGPL-3.0](./LICENSE).
