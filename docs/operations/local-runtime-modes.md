# Local Runtime Modes

This repository supports three local/runtime modes. Pick the one that matches your goal instead of treating Docker as all-or-nothing.

## Recommended Split

Use Docker to isolate stateful infrastructure and keep your host machine clean where it matters most:

- `postgres`
- `redis`

Run the application code on the host machine during active development:

- `api`
- `worker`
- `web`
- `admin`

This gives you fast reloads, direct logs, and easier debugging while still keeping databases and queues out of the host environment.

## Mode A: Daily Development

Use this when you are actively changing backend or frontend code.

Docker responsibilities:

- start `postgres`
- start `redis`

Host responsibilities:

- run `api`, `worker`, `web`, and `admin`
- run migrations, tests, linting, and other dev commands

First-time initialization:

```bash
npm install
make install-backend
make install-frontend
make up
make db-upgrade
cd backend && uv run python scripts/create-admin.py --username admin --password 'Admin123!' --role super_admin --force
```

What this initializes:

- local JS and Python dependencies
- development `postgres` and `redis`
- database schema via Alembic migrations
- the local admin account used by `http://localhost:3001/login`

Commands:

```bash
make up
make db-upgrade
make dev-all
```

Important:

- `make up` is only infra startup, not full project initialization
- if you skip `make db-upgrade`, the API may start but fail at runtime when it touches missing tables
- if you skip `create-admin.py`, the admin UI will not have a valid local login

Or run services in separate terminals:

```bash
make api
make worker
make web
make admin
```

Why this is the default:

- best hot-reload loop
- easiest debugger and log access
- clean separation between stateful infra and changing app code

## Mode B: Clean Local Verification

Use this when you want a cleaner, more isolated end-to-end run that is closer to deployment behavior.

Commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

What this does:

- runs the full stack in Docker
- builds local backend, worker, web, and admin images
- uses the local override volumes for isolated local data

Tradeoffs:

- slower edit-run cycle than Mode A
- not the best choice for high-frequency coding because code changes require rebuild/restart
- frontend runs as built assets behind Nginx, not as Vite dev servers

## Mode C: Deployment-Like Compose Run

Use this when you want the standard packaged stack or are validating deployment behavior.

Commands:

```bash
docker compose up -d
```

What this does:

- pulls and runs the packaged images defined in `docker-compose.yml`
- behaves like a local deployment, not a source-driven development loop
- if you want MTran translation in this mode, point `MTRAN_SERVER_URL` at an external service that the containers can reach

Use this for:

- smoke testing packaged images
- validating environment variables and runtime behavior
- deployment-style local runs

## How To Choose

- choose Mode A for everyday development
- choose Mode B for a clean local full-stack verification run
- choose Mode C for deployment-like behavior or packaged-image checks

## Related Files

- `docker-compose.dev.yml`
- `docker-compose.yml`
- `docker-compose.override.yml`
- `DEVELOPMENT.md`
- `README.md`
