# Frontend Dockerfile for Glean Web App

ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginx:alpine

# Build stage
FROM ${NODE_IMAGE} AS builder

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG PNPM_REGISTRY=${NPM_REGISTRY}

WORKDIR /app

# Install pnpm
RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install -g pnpm@10.26.0

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY eslint.config.js ./
COPY packages/ packages/
COPY apps/web/ apps/web/
COPY turbo.json ./

# Install dependencies for the web build only. Skip lifecycle scripts so
# Electron devDependencies do not try to download desktop binaries.
RUN pnpm config set registry "${PNPM_REGISTRY}" \
    && pnpm install --frozen-lockfile --ignore-scripts

# Enforce frontend quality gates before release/build artifacts are produced.
RUN pnpm --filter=@glean/web lint \
    && pnpm --filter=@glean/web typecheck \
    && pnpm --filter=@glean/web build
RUN pnpm --filter=@glean/web compress:assets

# Production stage
FROM ${NGINX_IMAGE}

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
