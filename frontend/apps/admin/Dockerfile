# Frontend Dockerfile for Glean Admin Dashboard

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
COPY packages/ packages/
COPY apps/admin/ apps/admin/
COPY turbo.json ./

# Install dependencies
RUN pnpm config set registry "${PNPM_REGISTRY}" \
    && pnpm install --frozen-lockfile

# Build the admin app
RUN pnpm --filter=@glean/admin build

# Production stage
FROM ${NGINX_IMAGE}

# Copy built files
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
