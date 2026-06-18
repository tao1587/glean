# Cloudflare Tunnel Optimization (Docker + Domain)

This guide focuses on reducing reader detail-page latency when traffic goes through Cloudflare Tunnel.

## 1. Compose Topology

Use cloudflared as a separate edge layer, not inside app containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d
```

If you prefer `network_mode: host`, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.host.yml up -d
```

Required `.env` values:

- `CLOUDFLARE_TUNNEL_TOKEN`
- `CLOUDFLARE_TUNNEL_PROTOCOL=http2` (or `quic` if your network is stable)

## 2. Tunnel Routing Recommendations

In Cloudflare Zero Trust tunnel ingress rules:

1. `app.example.com` -> `http://web:80`
2. `admin.example.com` -> `http://admin:80`

Keep backend private behind `web` nginx unless you have a dedicated API domain and WAF policy.

When cloudflared runs in **host mode**:

1. Route app domain to `http://localhost:${WEB_PORT}`.
2. Route admin domain to `http://localhost:${ADMIN_PORT}`.
3. Do not use Docker service DNS names (`web:80`, `admin:80`) in tunnel ingress for host mode.

## 3. Nginx Gateway Tuning (already applied)

`frontend/apps/web/nginx.conf` now includes:

- upstream keepalive (`keepalive 64`)
- proxy timeouts and buffering for `/api`
- websocket-safe `/mcp` connection handling
- stronger gzip settings
- immutable cache for hashed static assets
- `index.html` set to no-cache for safer rolling updates

## 4. Cloudflare Dashboard Tuning

For domain speed:

1. Enable Brotli and HTTP/3.
2. Enable Tiered Cache (if available).
3. Add cache rules:
   - Cache static assets (`*.js, *.css, *.woff2, *.png, *.svg`) aggressively.
   - Bypass cache for `/api/*` and `/mcp/*`.
4. Keep TLS mode as `Full (strict)` when cert chain is complete.

## 5. App-Level Latency Optimization (already applied)

To hide tunnel RTT on detail open:

- Entry detail prefetch on list-item hover/touch start.
- Detail query stale/cache windows tuned for reopen hit rate.
- Auto-translation activation deferred to idle time to avoid first paint contention.

## 6. Quick Verification

Inside host:

```bash
docker compose ps
docker compose logs -f cloudflared
curl -I https://app.example.com/
```

Target outcomes:

- TTFB stable and lower jitter on article open.
- Reopening an article should be mostly cache-hit and near-instant.
