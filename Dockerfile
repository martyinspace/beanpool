# =============================================================================
# Stage 1: Builder — install deps, build core → PWA → server
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and lockfile first (for layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/beanpool-core/package.json ./packages/beanpool-core/
COPY apps/pwa/package.json ./apps/pwa/
COPY apps/server/package.json ./apps/server/

# Copy patches needed by pnpm install
COPY patches ./patches

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Build in dependency order:
#   1. Core protocol library (shared by both PWA and server)
#   2. PWA (Vite → outputs to apps/server/public/)
#   3. Server (tsc → outputs to apps/server/dist/)
RUN cd packages/beanpool-core && pnpm run build
RUN cd apps/pwa && pnpm run build
# PWA build clears apps/server/public/ (emptyOutDir), so copy settings.html from static/
COPY apps/server/static/settings.html /app/apps/server/public/settings.html
RUN cd apps/server && pnpm run build

# Prune to production-only dependencies
RUN pnpm prune --prod --no-optional

# =============================================================================
# Stage 2: Runtime — clean Alpine with only what's needed to run
# =============================================================================
FROM node:22-alpine AS runtime

WORKDIR /app

# Install native build tools for better-sqlite3 compilation
RUN apk add --no-cache python3 make g++

# Copy production node_modules from builder (including the .pnpm virtual store)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

# Copy compiled server (dist + baked-in PWA static files)
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/public ./apps/server/public
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Copy compiled core library
COPY --from=builder /app/packages/beanpool-core/dist ./packages/beanpool-core/dist
COPY --from=builder /app/packages/beanpool-core/package.json ./packages/beanpool-core/package.json
COPY --from=builder /app/packages/beanpool-core/node_modules ./packages/beanpool-core/node_modules

# Copy root workspace config for pnpm resolution
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy update script
COPY --from=builder /app/update.sh ./update.sh

WORKDIR /app/apps/server

# Force build better-sqlite3 native bindings for Alpine
RUN npm rebuild better-sqlite3 --build-from-source

# Clean up build tools to reduce image size
RUN apk del python3 make g++

# Expose the 4-port layout
EXPOSE 8080 8443 4001 4002

# Data directory for genesis, TLS certs, and SQLite
ENV BEANPOOL_DATA_DIR=/data
VOLUME /data

# Run compiled JavaScript directly
CMD ["node", "dist/index.js"]
