# REST API and MCP reference

Verified against registered routes and generated OpenAPI on 2026-10-10.

## Entry points and exposure

- Backend origin: `http://localhost:8000` in host development. The local Docker override publishes `8000:8000`.
- Web nginx forwards `/api` and `/mcp` to the backend. Exposing the web origin therefore also exposes those routes, subject to reverse-proxy or tunnel access controls.
- Vite development forwards `/api`; use the backend origin directly for MCP and the OpenAPI schema.
- This is a source and ASGI audit. The Docker daemon was unavailable, so live container ports and external Internet reachability were not verified.

Sources: [`main.py`](../../backend/apps/api/glean_api/main.py), [`nginx.conf`](../../frontend/apps/web/nginx.conf), [`vite.config.ts`](../../frontend/apps/web/vite.config.ts), [`docker-compose.override.yml`](../../docker-compose.override.yml).

## Interactive documentation

| Backend endpoint | Availability | Authentication |
|---|---|---|
| `GET /openapi.json` | Always registered, including `DEBUG=false` | None |
| `GET /api/docs` | Swagger UI, only with `DEBUG=true` | None |
| `GET /api/redoc` | ReDoc, only with `DEBUG=true` | None |

Use `http://localhost:8000/api/docs` and `http://localhost:8000/openapi.json`. The schema is the exhaustive REST endpoint, parameter, body, and response reference; it excludes the mounted MCP protocol.

Web nginx forwards `/api/docs` but does not forward the root `/openapi.json` URL requested by the documentation UI. Use the backend origin directly to avoid that mismatch. This audit does not change proxy or documentation-visibility behavior.

## Authentication

REST business routes require `Authorization: Bearer <access JWT>` from `POST /api/auth/login`. Refresh it with `POST /api/auth/refresh`. Admin routes use a separate admin access JWT from `POST /api/admin/auth/login`.

Glean API Tokens authenticate MCP. Create/list/revoke them through `/api/tokens` using a user JWT. API Tokens are not interchangeable with JWTs on `/api/entries`, `/api/feeds`, and other REST business routes.

Sources: [`dependencies.py`](../../backend/apps/api/glean_api/dependencies.py), [`auth.py`](../../backend/apps/api/glean_api/routers/auth.py), [`api_tokens.py`](../../backend/apps/api/glean_api/routers/api_tokens.py).

## Public REST routes

These routes have no Bearer-token dependency. Login/refresh still require request credentials; registration and OIDC depend on configuration.

| Methods | Paths | Purpose |
|---|---|---|
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` | User authentication |
| `GET`, `POST` respectively | `/api/auth/oauth/oidc/authorize`, `/api/auth/oauth/oidc/callback` | OIDC sign-in |
| `POST` | `/api/admin/auth/login`, `/api/admin/auth/refresh` | Admin authentication |
| `GET` | `/api/health`, `/api/system/health`, `/api/admin/health` | Health |
| `GET` | `/api/system/time` | Server time and timezone |
| `GET` | `/api/system/vectorization-status` | Embedding status and rebuild progress |
| `GET` | `/api/icons?url=...` | Cached favicon/image proxy |

The vectorization-status implementation has no authentication dependency, despite an older docstring describing it as authenticated. This reference follows the registered implementation.

## Authenticated REST groups

| Prefix | Authentication | Capabilities |
|---|---|---|
| `/api/auth/me` | User JWT | Read account and update settings |
| `/api/feeds` | User JWT | Subscriptions, discovery, refresh, fetch-run status/history, OPML |
| `/api/entries` | User JWT | List/search/detail, read/read-later/hidden state, source affinity, translation |
| `/api/bookmarks` | User JWT | Bookmark CRUD and folder assignment |
| `/api/folders` | User JWT | Folder CRUD, move, reorder |
| `/api/tokens` | User JWT | Create/list/revoke MCP API Tokens |
| `/api/admin` | Admin JWT except public auth/health above | Users, feed/article operations, registration/RSSHub settings, embedding configuration/rebuilds |

### Article reading and state

| Method and path | Parameters/body or purpose |
|---|---|
| `GET /api/entries` | `feed_id`, `folder_id`, `is_read`, `read_later`, `is_hidden`, `page`, `per_page` |
| `GET /api/entries` | `period=week\|month` and `period_anchor=YYYY-MM-DD`: server-timezone period bounds |
| `GET /api/entries` | `collected_after`, `collected_before`: inclusive start, exclusive end |
| `GET /api/entries/today` | Today's Intake list |
| `GET /api/entries/search` | Article search |
| `GET /api/entries/{entry_id}` | Article detail |
| `PATCH /api/entries/{entry_id}` | Update `is_read`, `read_later`, `is_hidden` |
| `GET /api/entries/source-affinity` | Per-source score: reads + saves − hides |
| `POST /api/entries/mark-all-read` | Mark selected scope read |
| `POST /api/entries/translate-texts` | Batch text translation; provider/configuration failures use 400/429/502, and rate limits include `Retry-After` |
| `GET /api/entries/{entry_id}/paragraph-translations` | Cached paragraph translations |
| `POST /api/entries/{entry_id}/translate` | Queue full-article translation |
| `GET /api/entries/{entry_id}/translation/{target_language}` | Translation status/result |

Example after obtaining a user access JWT:

```bash
curl -H "Authorization: Bearer $GLEAN_ACCESS_JWT" \
  'http://localhost:8000/api/entries?period=week&period_anchor=2026-10-10&is_read=false&is_hidden=false&per_page=100'
```

## MCP

FastMCP is mounted at `/mcp`, with a streamable HTTP subroute also named `/mcp`. The effective client URL is **`<backend-or-deployed-web-origin>/mcp/mcp`**, matching Settings → API Tokens.

Authenticate using `Authorization: Bearer <Glean API Token>`. `APITokenVerifier` verifies tokens; tools scope article access to the user's subscriptions. Public protected-resource metadata is mounted at `/mcp/.well-known/oauth-protected-resource/mcp`.

| Tool | Purpose |
|---|---|
| `search_entries` | Keyword search, optionally by feed |
| `get_entry` | Full article details |
| `list_entries_by_date` | Date-range article list |
| `list_subscriptions` | User subscriptions |

Sources: [`server.py`](../../backend/apps/api/glean_api/mcp/server.py), [`auth.py`](../../backend/apps/api/glean_api/mcp/auth.py), [`APITokensTab.tsx`](../../frontend/apps/web/src/components/tabs/APITokensTab.tsx).

## Removed AI summary interfaces

Retired on 2026-10-10: `/api/ai/*`, `/api/today/ai/*`, `/api/system/ai-integration`, `/api/admin/settings/ai-integration`. Summary UI controls, worker jobs/cron, and dedicated `LLM_*`/`SUMMARY_CRON_HOURS` settings were removed.

The summary ORM module and model exports have also been removed. Historical migration records remain to preserve existing database revision history; they are not application feature code. No running database data was modified. Translation, discovery, and MCP remain available.

## Translation provider behavior

An unset/null provider preference means Automatic: use the configured `MTRAN_SERVER_URL` when present, otherwise Google. Explicit provider selections remain unchanged. MTran does not silently fall back to Google. Missing explicit paid-provider credentials return a configuration error; provider rate limits return 429 with `Retry-After` and a bounded cooldown instead of a generic 502. Paragraph cache hits and blank text positions are preserved.
