# syntax=docker/dockerfile:1
# PhoneMail server image. One image, four commands: api, smtp, worker, migrate.
# Build context is the repo root (npm workspaces).

FROM node:24-slim AS base
# Prisma needs OpenSSL, which the slim image leaves out.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# All dependencies (including dev) for building.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# The schema must exist before install: the server's postinstall runs `prisma generate`.
COPY apps/server/prisma apps/server/prisma
RUN npm ci --workspace packages/shared --workspace apps/server --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w packages/shared && npm run build -w apps/server

# Production dependencies only, plus the compiled code.
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY apps/server/prisma apps/server/prisma
RUN npm ci --omit=dev --workspace packages/shared --workspace apps/server \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
# Raw emails and attachments live under /data (a named volume). Owned by the
# non-root user so the volume inherits the right permissions.
RUN mkdir -p /data && chown -R node:node /data
USER node
WORKDIR /app/apps/server
EXPOSE 3000 2525
CMD ["node", "dist/entry/api.js"]
