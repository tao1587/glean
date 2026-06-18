# AGENTS.md

This repository treats `docs/` as the system of record. Read this file as a map, not as the full manual.

## What this project is

**Glean** — self-hosted RSS reader with bilingual reading, bookmarking, tagging, and AI-powered knowledge organization (fork with faster iteration on `personal-main`).

## Start Here

- Repository docs index: `docs/index.md`
- Architecture map: `docs/architecture/index.md`
- Operations and deployment: `docs/operations/index.md`
- Agent workflow rules: `docs/agent-workflows/index.md`
- Reference material: `docs/references/index.md`

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 async, PostgreSQL 16 + pgvector, Redis + arq (job queue), Alembic, uv
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand, React Router, Electron (desktop), pnpm + Turbo monorepo

## Structure

```
glean/
├── backend/
│   ├── apps/api/glean_api/          # FastAPI app — routers/, mcp/, config.py
│   ├── apps/worker/glean_worker/    # Background jobs — tasks/ (feed fetch, translation, embeddings)
│   └── packages/
│       ├── core/glean_core/         # Services + Pydantic schemas (business logic)
│       ├── database/glean_database/ # SQLAlchemy models + Alembic migrations
│       ├── rss/glean_rss/           # Feed parsing, OPML
│       └── vector/glean_vector/     # Embeddings, preference scoring
└── frontend/
    ├── apps/web/src/                # Main reader UI + Electron (pages/, components/, hooks/)
    ├── apps/admin/src/              # Admin dashboard
    └── packages/                    # Shared: api-client, types, ui, logger, i18n
```

## Default Workflow

For any task that writes to the repository, use the default multi-agent workflow unless the task qualifies as a low-risk direct edit:

1. Planner
   - clarify scope
   - write or update the relevant contract/plan/spec artifact
   - define completion criteria
2. Generator
   - implement the change
   - record handoff details for review
3. Evaluator
   - independently verify behavior, quality, and contract compliance
   - reject incomplete or weak work with concrete feedback

Read:

- `docs/agent-workflows/default-loop.md`
- `docs/agent-workflows/evaluator-rubric.md`
- `docs/agent-workflows/handoff-template.md`

## Low-Risk Direct Edit Exception

Direct edits are allowed only for low-risk repository changes such as:

- copy, labels, comments, or explanatory text
- purely visual value tweaks like colors, spacing, font sizes, or shadows
- static configuration changes that do not alter control flow, persistence, queueing, deployment, or runtime behavior

If the change touches logic, APIs, workers, feeds, scheduling, queues, database behavior, CI, Docker, or environment semantics, it is not low-risk.

Read:

- `docs/agent-workflows/low-risk-direct-edits.md`

## Required Domain Reads

Before changing feed fetch, queue, scheduler, or worker progress behavior, read:

- `docs/architecture/feed-fetch-flow.md`
- `docs/operations/feed-fetch-guardrails.md`

Before changing deployment or local runtime workflows, read:

- `docs/operations/local-runtime-modes.md`
- `docs/operations/personal-deployment-guide.md`
- `DEVELOPMENT.md`

## Local Runtime Workflow

Default to Mode A from `docs/operations/local-runtime-modes.md`: Docker for infra, host processes for app code.

Use Mode B only when you explicitly want a clean full-stack Docker verification run.
Use Mode C only when you want deployment-like packaged-image behavior.

Primary commands:

```bash
make install       # install all deps
make up            # start postgres + redis (Docker)
make db-upgrade    # apply migrations
make down          # stop infra
make logs          # tail infra logs
make api           # FastAPI on :8000
make worker        # arq background worker
make web           # React dev server on :3000
make admin         # admin dashboard
make dev-all       # run all services concurrently
make test          # pytest (asyncio mode) + vitest
make test-cov      # tests with coverage
make lint          # ruff + pyright + eslint
make format        # format all code
```

Test infra via `docker-compose.test.yml` (spun up automatically).

## Local Docker (dev containers)

Running containers use image tags defined in `docker-compose.override.yml` (NOT `docker-compose.personal.yml`). Always verify the live tag with `docker ps` before building — a wrong tag rebuilds an image nothing is actually using.

Local tags:

- `glean-web:local` — web app (nginx + built Vite bundle)
- `glean-admin:local` — admin dashboard
- Backend / worker: see `docker-compose.override.yml` for the active tag

Rebuild + pick up changes:

```bash
# Web
docker build -f frontend/apps/web/Dockerfile -t glean-web:local frontend
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --no-deps --force-recreate web

# Admin
docker build -f frontend/apps/admin/Dockerfile -t glean-admin:local frontend
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --no-deps --force-recreate admin
```

`docker restart <name>` is NOT enough — it reboots the container on the OLD image. Use compose `--force-recreate` to swap in the freshly built image. Verify with `docker inspect <name> --format '{{.Image}}'` matches `docker image inspect <tag> --format '{{.Id}}'`.

## Key Config

- `.env.example` — all env vars documented here
- `backend/apps/api/glean_api/config.py` — Pydantic settings
- `docker-compose.yml` — production; `docker-compose.dev.yml` — dev infra only

Critical env vars: `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `MTRAN_SERVER_URL`, `EMBEDDING_PROVIDER`

## Patterns

**Backend:**

- Service-layer architecture: business logic in `glean_core/services/`
- Pydantic schemas in `glean_core/schemas/` for all API contracts
- Async SQLAlchemy sessions everywhere; FastAPI dependency injection for DB/Redis/services
- UUID PKs + `TimestampMixin` (`created_at`/`updated_at`) on all models
- Strict pyright + ruff (E, F, I, N, W, UP, B, C4, SIM rules)
- Logging: loguru + structlog via `glean_core.init_logging()`

**Frontend:**

- Zustand for global state; TanStack Query for server state
- Shared types via `@glean/types`; API calls via `@glean/api-client` (Axios)
- TypeScript strict mode throughout

## Repository Conventions

- Keep knowledge in-repo, not in chat-only context.
- Add or update docs when behavior, workflow, or architecture changes.
- Preserve progressive disclosure: short entry docs, deeper targeted docs underneath.
- Prefer boring, inspectable, repo-local mechanisms over opaque workflow magic.

## Sub-area guidance

- Backend: [`backend/AGENTS.md`](./backend/AGENTS.md)
- Frontend: [`frontend/AGENTS.md`](./frontend/AGENTS.md)

`CLAUDE.md` at each level is a thin pointer to the sibling `AGENTS.md` — Claude Code auto-loads `CLAUDE.md`, so the pointer preserves that while `AGENTS.md` stays canonical and tool-agnostic.
