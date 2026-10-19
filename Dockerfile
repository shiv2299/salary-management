# syntax=docker/dockerfile:1

# One image, two processes: the Fastify API and the Next.js standalone server (docs/architecture.md §11).
ARG NODE_IMAGE=node:24-bookworm-slim

# Build toolchain, only needed if a native module has no prebuilt binary for the platform.
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Production dependencies of the API only. better-sqlite3 and argon2 are built here, on the same
# base image and platform as the final stage, so the copied native modules load there.
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @acme/api --include-workspace-root=false

# Full install, then build both apps.
FROM base AS build
# Next.js bakes rewrite destinations in at build time. Inside the container the API is on localhost.
ARG API_URL=http://127.0.0.1:3001
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  DATABASE_PATH=/data/app.db \
  PORT=3001 \
  API_URL=http://127.0.0.1:3001
WORKDIR /app

# API: bundled server, its production node_modules, and the SQL migrations it reads at boot.
# MIGRATIONS_FOLDER resolves to <dist>/../drizzle, which is /app/apps/api/drizzle here.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY apps/api/package.json apps/api/

# Web: the traced standalone server plus its static assets (copied into place by the web postbuild).
COPY --from=build /app/apps/web/.next/standalone ./web
COPY scripts/start.sh /app/start.sh

# The node user (uid 1000) owns the data directory, which is the volume mount point.
RUN mkdir /data && chown node:node /data && chmod +x /app/start.sh
USER node
VOLUME /data
EXPOSE 3000

# Goes through the web server, so it checks the /api rewrite as well as the API itself. The start
# period covers the first boot, which migrates and seeds before the API listens.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["/app/start.sh"]
