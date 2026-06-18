# Development Guide

This is the short entrypoint for local development.

## Start Here

- Repository docs index: [docs/index.md](./docs/index.md)
- Local runtime modes: [docs/operations/local-runtime-modes.md](./docs/operations/local-runtime-modes.md)
- Backend development guide: [backend/AGENTS.md](./backend/AGENTS.md)
- Frontend development guide: [frontend/AGENTS.md](./frontend/AGENTS.md)

## Runtime Modes

- Mode A: daily development. Docker runs `postgres` and `redis`; the host runs `api`, `worker`, `web`, and `admin`.
- Mode B: clean local verification. Docker runs the full stack with local builds.
- Mode C: deployment-like compose run. Docker runs the packaged images from `docker-compose.yml`.

Mode A is the default development workflow because it keeps stateful services isolated while preserving fast reloads and easier debugging.

## Preferred Local Startup

For a fresh clone, do the one-time initialization first:

```bash
npm install
make install-backend
make install-frontend
make up
make db-upgrade
cd backend && uv run python scripts/create-admin.py --username admin --password 'Admin123!' --role super_admin --force
```

This initialization sequence does four different things:

- installs root, backend, and frontend dependencies
- starts only the development infrastructure containers (`postgres` and `redis`)
- applies database migrations so the schema actually exists
- creates or resets the local admin account

Important:

- `make up` only starts infrastructure. It does not run migrations or create the admin user.
- the default local admin login is only valid after migrations and `create-admin.py` have completed

After initialization, use the normal daily startup flow:

```bash
make up
make db-upgrade
make dev-all
```

These commands assume the default development infrastructure from `docker-compose.dev.yml`.
The `make api`, `make worker`, and database migration targets now inject the matching local
development URLs automatically:

- `DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5432/glean`
- `REDIS_URL=redis://localhost:6379/0`

Or run services in separate terminals:

```bash
make api
make worker
make web
make admin
```

In local development, both Vite apps default to the local API on `http://localhost:8000`.
Only set `VITE_DEV_API_TARGET` when you intentionally want the web app to talk to a different backend.

For a full-stack local Docker verification run:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

For a deployment-like packaged-image run:

```bash
docker compose up -d
```

If you use MTran translation in Docker-backed modes, set `MTRAN_SERVER_URL` to an external address
that the `backend` and `worker` containers can actually reach, such as a LAN host.

Stop infrastructure with:

```bash
make down
```

## Direct Commands

```bash
make up
make down
make logs
make api
make worker
make web
make admin
make test
make lint
```
