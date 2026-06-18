.PHONY: help setup up down api worker web admin electron db-migrate db-upgrade db-downgrade \
        test test-db-up test-db-down test-cov lint format clean logs install-backend install-frontend install-root verify dev-all \
        docs-validate \
        pre-commit-install pre-commit-uninstall pre-commit-run

DEV_DATABASE_URL ?= postgresql+asyncpg://glean:devpassword@localhost:5432/glean
DEV_REDIS_URL ?= redis://localhost:6379/0
UV_CACHE_DIR ?= $(CURDIR)/.uv-cache

# Default target
help:
	@echo "Glean Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Full setup (Docker + deps + migrations)"
	@echo "  make install        - Install all dependencies"
	@echo "  make install-backend  - Install Python dependencies"
	@echo "  make install-frontend - Install Node dependencies"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make up             - Start Docker services (PostgreSQL + Redis)"
	@echo "  make down           - Stop Docker services"
	@echo "  make logs           - View Docker service logs"
	@echo ""
	@echo "Development:"
	@echo "  make api            - Start API server (port 8000)"
	@echo "  make worker         - Start background worker"
	@echo "  make web            - Start web app (port 3000)"
	@echo "  make admin          - Start admin dashboard"
	@echo "  make electron       - Start Electron desktop app"
	@echo "  make dev-all        - Start all services concurrently (api + worker + web)"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate MSG=\"description\"  - Create new migration"
	@echo "  make db-upgrade     - Apply migrations"
	@echo "  make db-downgrade   - Revert last migration"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests (auto-starts test database)"
	@echo "  make test-cov       - Run tests with coverage report"
	@echo "  make test-db-up     - Start test database (port 5433)"
	@echo "  make test-db-down   - Stop test database"
	@echo ""
	@echo "Quality:"
	@echo "  make lint           - Run linters"
	@echo "  make format         - Format code"
	@echo "  make pre-commit-install   - Install pre-commit hooks"
	@echo "  make pre-commit-run       - Run pre-commit on all files"
	@echo "  make docs-validate  - Validate required docs and references"
	@echo ""
	@echo "Other:"
	@echo "  make verify         - Verify M0 setup"
	@echo "  make clean          - Clean generated files"

# =============================================================================
# Setup
# =============================================================================

setup:
	@./scripts/setup.sh

install: install-root install-backend install-frontend

install-root:
	@echo "📦 Installing root dependencies (concurrently)..."
	@npm install

install-backend:
	@echo "🐍 Installing Python dependencies..."
	@cd backend && uv sync --all-packages

install-frontend:
	@echo "📦 Installing Node dependencies..."
	@cd frontend && pnpm install

# =============================================================================
# Infrastructure
# =============================================================================

up:
	@echo "🐳 Starting Docker services..."
	@docker compose -f docker-compose.dev.yml up -d
	@echo "✅ Services started"
	@echo "   PostgreSQL: localhost:5432"
	@echo "   Redis:      localhost:6379"

down:
	@echo "🛑 Stopping Docker services..."
	@docker compose -f docker-compose.dev.yml down

logs:
	@docker compose -f docker-compose.dev.yml logs -f

# =============================================================================
# Development Servers
# =============================================================================

api:
	@echo "🚀 Starting API server on http://localhost:8000"
	@echo "📚 API docs: http://localhost:8000/api/docs"
	@cd backend && DATABASE_URL="$(DEV_DATABASE_URL)" REDIS_URL="$(DEV_REDIS_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run uvicorn glean_api.main:app --reload --port 8000

worker:
	@echo "⚙️  Starting background worker..."
	@cd backend && DATABASE_URL="$(DEV_DATABASE_URL)" REDIS_URL="$(DEV_REDIS_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run python scripts/run-arq-worker.py glean_worker.main.WorkerSettings

web:
	@echo "🌐 Starting web app on http://localhost:3000"
	@cd frontend && pnpm dev:web

admin:
	@echo "🔧 Starting admin dashboard..."
	@cd frontend && pnpm dev:admin

electron:
	@echo "⚡ Starting Electron desktop app..."
	@cd frontend/apps/web && pnpm dev:electron

# =============================================================================
# Database
# =============================================================================

db-migrate:
ifndef MSG
	$(error MSG is required. Usage: make db-migrate MSG="migration description")
endif
	@echo "📝 Creating migration: $(MSG)"
	@cd backend/packages/database && DATABASE_URL="$(DEV_DATABASE_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run alembic revision --autogenerate -m "$(MSG)"

db-upgrade:
	@echo "⬆️  Applying database migrations..."
	@cd backend/packages/database && DATABASE_URL="$(DEV_DATABASE_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run alembic upgrade head

db-downgrade:
	@echo "⬇️  Reverting last migration..."
	@cd backend/packages/database && DATABASE_URL="$(DEV_DATABASE_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run alembic downgrade -1

db-reset:
	@echo "🗑️  Resetting database..."
	@docker compose -f docker-compose.dev.yml down -v
	@docker compose -f docker-compose.dev.yml up -d
	@sleep 5
	@cd backend/packages/database && DATABASE_URL="$(DEV_DATABASE_URL)" UV_CACHE_DIR="$(UV_CACHE_DIR)" uv run alembic upgrade head
	@echo "✅ Database reset complete"

# =============================================================================
# Testing
# =============================================================================

test-db-up:
	@echo "🐳 Starting test database..."
	@docker compose -f docker-compose.test.yml up -d
	@echo "⏳ Waiting for test database to be ready..."
	@sleep 2
	@echo "✅ Test database ready on localhost:5433"

test-db-down:
	@echo "🛑 Stopping test database..."
	@docker compose -f docker-compose.test.yml down -v
	@echo "✅ Test database stopped and volumes removed"

test: test-db-up
	@echo "🧪 Running tests..."
	@cd backend && TEST_DATABASE_URL="postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test" uv run pytest $(ARGS)

test-cov: test-db-up
	@echo "🧪 Running tests with coverage..."
	@cd backend && TEST_DATABASE_URL="postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test" uv run pytest --cov --cov-report=html

lint:
	@echo "🔍 Running linters..."
	@cd backend && uv run ruff check .
	@cd backend && uv run pyright
	@cd frontend && pnpm lint

format:
	@echo "✨ Formatting code..."
	@cd backend && uv run ruff format .
	@cd backend && uv run ruff check --fix .
	@cd frontend && pnpm format 2>/dev/null || cd frontend && npx prettier --write "**/*.{ts,tsx,js,jsx,json}"

# =============================================================================
# Pre-commit Hooks
# =============================================================================

pre-commit-install:
	@echo "🪝 Installing pre-commit hooks..."
	@pre-commit install
	@echo "✅ Pre-commit hooks installed"

pre-commit-uninstall:
	@echo "🗑️  Uninstalling pre-commit hooks..."
	@pre-commit uninstall
	@echo "✅ Pre-commit hooks uninstalled"

pre-commit-run:
	@echo "🔍 Running pre-commit on all files..."
	@pre-commit run --all-files

# =============================================================================
# Other
# =============================================================================

clean:
	@echo "🧹 Cleaning generated files..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@rm -rf backend/.venv 2>/dev/null || true
	@rm -rf frontend/node_modules 2>/dev/null || true
	@rm -rf htmlcov 2>/dev/null || true
	@echo "✅ Clean complete"

# =============================================================================
# Shortcuts
# =============================================================================

# Start everything concurrently
dev-all:
	@echo "🚀 Starting all services concurrently (API + Worker + Web + Admin)..."
	@npm run dev

# Start everything (run in separate terminals)
dev:
	@echo "To start development, you can:"
	@echo ""
	@echo "  Option 1: Start all at once"
	@echo "    make dev-all"
	@echo ""
	@echo "  Option 2: Run in separate terminals"
	@echo "    Terminal 1: make api"
	@echo "    Terminal 2: make worker"
	@echo "    Terminal 3: make web"

docs-validate:
	@python3 scripts/validate-docs.py
